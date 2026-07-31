// Thin DOM consumer for the Crafting window (smithing, woodcraft, alchemy,
// enchanting).
//
// The consumer half of the pure-core + thin-consumer split: it paints
// #crafting-window from the structured CraftingWindowView (crafting_ui_view.ts)
// and owns no game state at all. Every number it shows arrived already decided;
// its only jobs are markup, localization through `t()`, and the keyboard/ARIA
// contract.
//
// It creates its own panel element and stylesheet on first open rather than
// reading one out of index.html, so composing it is a single call from Hud and
// nothing in the shared HTML has to change (the same shape wave 1's Skills panel
// and Book of Deeds use).
//
// ACCESSIBILITY (src/ui/CLAUDE.md): the panel is a labelled dialog, the craft
// tabs are a real `role="tablist"` with `aria-selected` + a roving tabindex
// (Arrow/Home/End through the shared `rovingTarget` core), every skill bar is a
// real `role="progressbar"` with min/now/max plus a spoken `aria-valuetext`,
// every recipe's mastery state is SPELLED OUT beside its colour, a disabled
// Craft button states its reason in text (never colour alone) and is wired to it
// with `aria-describedby`, Escape closes, focus lands on the panel on open and
// returns to the opener on close, and every control clears the 40x40 tap floor.

import {
  buildCraftingWindowView,
  type CraftingProfessionId,
  type CraftingWindowView,
  type CraftProfessionRow,
  type CraftRecipeDef,
  type CraftRecipeRow,
  type PlayerCraftSkill,
} from './crafting_ui_view';
import { craftProfessionDescription, craftProfessionName } from './crafting_labels';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { masteryLabel } from './profession_labels';
import { rovingTarget } from './roving_index';
import { svgIcon } from './ui_icons';
import type { InvSlot } from '../sim/types';

const PANEL_ID = 'crafting-window';
const STYLE_ID = 'crafting-window-style';
const TABPANEL_ID = 'crafting-window-panel';

/**
 * Hud-supplied glue. Everything is a callback so this module never learns which
 * world it is looking at: Hud reads the live craft skills / recipes / bag off
 * `IWorld` and hands them over, exactly as `renderVendorWindow` takes its rows.
 */
export interface CraftingWindowDeps {
  /** The rows `IWorld.craftingSkills()` returns for the local player. */
  skills(): readonly PlayerCraftSkill[];
  /** Every recipe, in authored order (`CRAFT_RECIPES`). */
  recipes(): readonly CraftRecipeDef[];
  /** The live bag. */
  inventory(): readonly InvSlot[];
  /** Craft one recipe. The world re-runs every gate; this is a request. */
  onCraft(recipeId: string): void;
  /** Open the enchanting surfaces. The enchanting craft has no recipe list of
   *  its own: its bench is the Apply Enchant / Disenchant flow. */
  onOpenEnchanting?(): void;
  /** Hud's shared item-name painter, so a recipe row names its output exactly
   *  as a bag slot does. */
  itemName(itemId: string): string;
  /** Hud's shared item-quality colour for an item id. */
  itemColor?(itemId: string): string;
  /** Hud's tooltip painters, so hovering a recipe shows the real item tooltip. */
  attachTooltip?(el: HTMLElement, html: () => string): void;
  itemTooltipHtml?(itemId: string): string;
  /** Called when the panel closes, so Hud can drop its own open flag. */
  onClose?(): void;
}

let deps: CraftingWindowDeps | null = null;
let opener: HTMLElement | null = null;
let selected: CraftingProfessionId | null = null;

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

function percentText(fraction: number): string {
  return formatNumber(fraction, { style: 'percent', maximumFractionDigits: 1 });
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // width:100% + max-width (never a viewport unit) so padding can never push the
  // panel past the screen edge; the body scrolls instead of the page.
  style.textContent = `
  #${PANEL_ID} {
    /* No transform centring: Hud's managed-window layer positions every
       .window.panel by writing style.left/top in pixels, and a translate would
       double-offset the panel the moment a player drags it. */
    position: fixed; left: 0; top: 0;
    width: calc(100% - 24px); max-width: 460px; max-height: 84vh;
    padding: 10px 12px 12px; display: none; flex-direction: column;
    z-index: 45; font-family: var(--ui-font);
  }
  #${PANEL_ID}[data-open="1"] { display: flex; }
  #${PANEL_ID} .cw-intro { color: #998d6a; font-size: 12px; margin: 0 0 8px; }
  #${PANEL_ID} .cw-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  #${PANEL_ID} .cw-tab {
    min-height: 40px; min-width: 40px; flex: 1 1 auto; padding: 6px 10px;
    border: 1px solid #3b2e19; border-radius: 4px; background: #12100b;
    color: #b8ab8b; font-family: var(--title-font); font-size: 13px; cursor: pointer;
  }
  #${PANEL_ID} .cw-tab[aria-selected="true"] { color: var(--gold); border-color: var(--gold-dim); background: #1d1710; }
  #${PANEL_ID} .cw-body { overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  #${PANEL_ID} .cw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  #${PANEL_ID} .cw-name { font-family: var(--title-font); color: var(--gold); font-size: 14px; }
  #${PANEL_ID} .cw-value { color: #e7d8b6; font-size: 13px; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .cw-capped { color: #7fdc4f; font-size: 12px; }
  #${PANEL_ID} .cw-bar {
    position: relative; height: 12px; margin: 6px 0 5px; border-radius: 3px;
    background: #05050a; border: 1px solid #3b2e19; overflow: hidden;
  }
  #${PANEL_ID} .cw-fill { height: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18); }
  #${PANEL_ID} .cw-desc { color: #b8ab8b; font-size: 12px; margin: 0 0 8px; }
  #${PANEL_ID} .cw-card {
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 8px 9px; margin-bottom: 8px;
  }
  #${PANEL_ID} .cw-title { font-family: var(--title-font); font-size: 13px; }
  #${PANEL_ID} .cw-mastery { font-size: 11px; }
  #${PANEL_ID} .cw-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #998d6a; font-size: 12px; margin-top: 3px; }
  #${PANEL_ID} .cw-meta b { color: #e7d8b6; font-weight: 500; }
  #${PANEL_ID} .cw-reagents { list-style: none; margin: 6px 0 0; padding: 0; }
  #${PANEL_ID} .cw-reagent {
    display: flex; justify-content: space-between; gap: 10px;
    font-size: 12px; color: #d5c19a; padding: 2px 0;
  }
  #${PANEL_ID} .cw-reagent.short { color: #ff8f85; }
  #${PANEL_ID} .cw-count { font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .cw-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  #${PANEL_ID} .cw-craft { min-height: 40px; min-width: 96px; }
  #${PANEL_ID} .cw-reason { color: #ff8f85; font-size: 12px; flex: 1 1 140px; }
  #${PANEL_ID} .cw-empty { color: #998d6a; font-size: 13px; padding: 10px 2px; }
  #${PANEL_ID} .cw-bench { margin-top: 8px; }
  #${PANEL_ID} .cw-bench .btn { min-height: 40px; }
  #${PANEL_ID} .x-btn { min-width: 40px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
  #${PANEL_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
  /* Landscape phone: the panel is taller than the screen is, so give the list
     back the chrome padding and let it own nearly the whole height. */
  @media (max-height: 500px) {
    #${PANEL_ID} { max-height: 94vh; padding: 6px 8px 8px; }
    #${PANEL_ID} .cw-tab { padding: 6px 8px; font-size: 12px; }
  }
  @media (prefers-reduced-motion: reduce) {
    #${PANEL_ID}, #${PANEL_ID} * { transition: none !important; animation: none !important; }
  }`;
  document.head.appendChild(style);
}

function currentView(d: CraftingWindowDeps): CraftingWindowView {
  return buildCraftingWindowView({
    skills: d.skills(),
    recipes: d.recipes(),
    inventory: d.inventory(),
    activeProfessionId: selected ?? undefined,
  });
}

function reagentHtml(row: CraftRecipeRow, d: CraftingWindowDeps): string {
  return row.reagents
    .map((reagent) => {
      const label = t('hudChrome.crafting.reagentCount', {
        held: num(reagent.held),
        required: num(reagent.required),
      });
      const aria = reagent.met
        ? t('hudChrome.crafting.reagentAriaMet', {
            item: d.itemName(reagent.itemId),
            held: num(reagent.held),
            required: num(reagent.required),
          })
        : t('hudChrome.crafting.reagentAriaShort', {
            item: d.itemName(reagent.itemId),
            held: num(reagent.held),
            required: num(reagent.required),
            short: num(reagent.short),
          });
      return (
        `<li class="cw-reagent${reagent.met ? '' : ' short'}" aria-label="${esc(aria)}">` +
        `<span>${esc(d.itemName(reagent.itemId))}</span>` +
        `<span class="cw-count">${esc(label)}</span></li>`
      );
    })
    .join('');
}

function recipeHtml(row: CraftRecipeRow, d: CraftingWindowDeps): string {
  const name = d.itemName(row.resultItemId);
  const color = d.itemColor?.(row.resultItemId) ?? '#e7d8b6';
  const title = row.resultCount > 1
    ? t('hudChrome.crafting.recipeTitleBatch', { item: name, count: num(row.resultCount) })
    : name;
  const reasonId = `${PANEL_ID}-reason-${row.recipeId}`;
  const reason = row.craftable
    ? ''
    : `<span class="cw-reason" id="${esc(reasonId)}">${esc(
        t('hudChrome.crafting.deny.needMore', {
          item: d.itemName(row.shortItemIds[0] ?? ''),
        }),
      )}</span>`;
  // The mastery state is SPELLED OUT next to its colour: colour alone fails both
  // the contrast-independent requirement and touch (no hover title).
  const mastery =
    `<span class="cw-mastery" style="color:${esc(row.masteryColor)}">` +
    `${esc(masteryLabel(row.mastery))}</span>`;
  return (
    `<article class="cw-card" data-recipe="${esc(row.recipeId)}">` +
    `<div class="cw-head"><span class="cw-title" style="color:${esc(color)}">${esc(title)}</span>${mastery}</div>` +
    `<div class="cw-meta">` +
    `<span>${esc(t('hudChrome.crafting.itemLevel', { level: num(row.level) }))}</span>` +
    `<span>${esc(t('hudChrome.crafting.masterworkChance', { chance: percentText(row.masterworkChance) }))}</span>` +
    (row.teaches
      ? `<span>${esc(t('hudChrome.crafting.teaches'))}</span>`
      : `<span>${esc(t('hudChrome.crafting.teachesNothing'))}</span>`) +
    `</div>` +
    `<ul class="cw-reagents" aria-label="${esc(t('hudChrome.crafting.reagentsHeading'))}">${reagentHtml(row, d)}</ul>` +
    `<div class="cw-actions">` +
    `<button type="button" class="btn cw-craft" data-craft="${esc(row.recipeId)}"` +
    (row.craftable ? '' : ` disabled aria-describedby="${esc(reasonId)}"`) +
    ` aria-label="${esc(t('hudChrome.crafting.craftAria', { item: name }))}">${esc(t('hudChrome.crafting.craft'))}</button>` +
    reason +
    `</div>` +
    `</article>`
  );
}

function professionHtml(row: CraftProfessionRow, d: CraftingWindowDeps): string {
  const name = craftProfessionName(row.professionId);
  const valueText = t('hudChrome.crafting.skillValue', {
    skill: num(row.skill),
    max: num(row.maxSkill),
  });
  const barLabel = row.capped
    ? t('hudChrome.crafting.cappedAria', { profession: name, max: num(row.maxSkill) })
    : t('hudChrome.crafting.skillAria', {
        profession: name,
        skill: num(row.skill),
        max: num(row.maxSkill),
      });
  const next =
    row.pointsToNextTier === null
      ? ''
      : `<span>${esc(t('hudChrome.crafting.toNextTier', { points: num(row.pointsToNextTier) }))}</span>`;
  const list = row.recipes.length
    ? row.recipes.map((recipe) => recipeHtml(recipe, d)).join('')
    : `<p class="cw-empty">${esc(t('hudChrome.crafting.noRecipes'))}</p>` +
      (row.professionId === 'enchanting'
        ? `<div class="cw-bench"><button type="button" class="btn" data-open-enchanting>${esc(t('hudChrome.crafting.openEnchanting'))}</button></div>`
        : '');
  return (
    `<div class="cw-head"><span class="cw-name">${esc(name)}</span>` +
    `<span class="cw-value">${esc(valueText)}${row.capped ? ` <span class="cw-capped">${esc(t('hudChrome.crafting.capped'))}</span>` : ''}</span></div>` +
    `<div class="cw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${row.maxSkill}" aria-valuenow="${row.skill}" aria-valuetext="${esc(barLabel)}" aria-label="${esc(name)}">` +
    `<div class="cw-fill" style="width:${row.percent}%"></div></div>` +
    `<div class="cw-meta">` +
    `<span>${esc(t('hudChrome.crafting.craftableNow', { count: num(row.craftableCount) }))}</span>` +
    next +
    `</div>` +
    `<p class="cw-desc">${esc(craftProfessionDescription(row.professionId))}</p>` +
    list
  );
}

function tabsHtml(view: CraftingWindowView): string {
  return view.professions
    .map((row) => {
      const on = row.professionId === view.active;
      const label = craftProfessionName(row.professionId);
      const aria = t('hudChrome.crafting.tabAria', {
        profession: label,
        skill: num(row.skill),
        max: num(row.maxSkill),
      });
      return (
        `<button type="button" class="cw-tab" role="tab" data-craft-tab="${esc(row.professionId)}"` +
        ` id="${PANEL_ID}-tab-${esc(row.professionId)}" aria-controls="${TABPANEL_ID}"` +
        ` aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}"` +
        ` aria-label="${esc(aria)}">${esc(label)}</button>`
      );
    })
    .join('');
}

function paint(el: HTMLElement, view: CraftingWindowView, d: CraftingWindowDeps): void {
  const active = view.professions.find((row) => row.professionId === view.active);
  el.innerHTML =
    `<div class="panel-title"><span id="${PANEL_ID}-title">${esc(t('hudChrome.crafting.panelTitle'))}</span>` +
    `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.crafting.close'))}">${svgIcon('close')}</button></div>` +
    `<p class="cw-intro">${esc(t('hudChrome.crafting.subheading'))}</p>` +
    `<p class="cw-intro">${esc(t('hudChrome.crafting.totals', { skill: num(view.totalSkill), max: num(view.totalMaxSkill), craftable: num(view.totalCraftable) }))}</p>` +
    `<div class="cw-tabs" role="tablist" aria-label="${esc(t('hudChrome.crafting.tablistLabel'))}">${tabsHtml(view)}</div>` +
    `<div class="cw-body" id="${TABPANEL_ID}" role="tabpanel" tabindex="0" aria-labelledby="${PANEL_ID}-tab-${esc(view.active)}">` +
    (active ? professionHtml(active, d) : `<p class="cw-empty">${esc(t('hudChrome.crafting.empty'))}</p>`) +
    `</div>`;

  el.querySelector('[data-close]')?.addEventListener('click', () => closeCraftingWindow());
  el.querySelector('[data-open-enchanting]')?.addEventListener('click', () => {
    d.onOpenEnchanting?.();
  });

  const tabs = [...el.querySelectorAll<HTMLButtonElement>('.cw-tab')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () =>
      selectProfession(tab.dataset.craftTab as CraftingProfessionId),
    );
    tab.addEventListener('keydown', (ev) => {
      const next = rovingTarget(ev.key, index, tabs.length, 'horizontal');
      if (next === null) return;
      ev.preventDefault();
      const target = tabs[next];
      target.focus();
      selectProfession(target.dataset.craftTab as CraftingProfessionId);
    });
  });

  for (const button of el.querySelectorAll<HTMLButtonElement>('[data-craft]')) {
    button.addEventListener('click', () => {
      const recipeId = button.dataset.craft;
      if (!recipeId || button.disabled) return;
      d.onCraft(recipeId);
      // The bag changed, so every reagent row and every button state did too.
      renderCraftingWindow();
    });
  }

  if (d.attachTooltip && d.itemTooltipHtml) {
    const paintTooltip = d.itemTooltipHtml;
    for (const card of el.querySelectorAll<HTMLElement>('.cw-card')) {
      const recipeId = card.dataset.recipe;
      const row = active?.recipes.find((r) => r.recipeId === recipeId);
      if (!row) continue;
      d.attachTooltip(card, () => paintTooltip(row.resultItemId));
    }
  }
}

function selectProfession(professionId: CraftingProfessionId | undefined): void {
  if (!professionId || professionId === selected) return;
  selected = professionId;
  renderCraftingWindow();
}

/**
 * True only when the panel is BOTH marked open and actually visible. Hud's
 * `closeAll` (Escape) closes the topmost `.window.panel` by writing an inline
 * `display: none`, which our own flag would otherwise never see, leaving the
 * toggle one press out of phase.
 */
function panelVisible(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.dataset.open === '1' && el.style.display !== 'none';
}

/** First-open centring, in the pixel units Hud's drag layer also writes.
 *  Skipped once the player has dragged the panel somewhere they prefer. */
function centerPanel(el: HTMLElement): void {
  if (el.dataset.windowMoved === '1') return;
  const rect = el.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.round((window.innerWidth - rect.width) / 2))}px`;
  el.style.top = `${Math.max(8, Math.round((window.innerHeight - rect.height) / 2))}px`;
}

function ensurePanel(): HTMLElement {
  const existing = document.getElementById(PANEL_ID);
  if (existing) return existing;
  ensureStyles();
  const el = document.createElement('div');
  el.id = PANEL_ID;
  el.className = 'panel window';
  el.setAttribute('role', 'dialog');
  // Explicitly NON-modal: the game keeps running behind an open panel and Tab is
  // meant to leave it, so declaring aria-modal="false" is honest where a bare
  // role="dialog" would imply a focus trap that does not exist.
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeCraftingWindow();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

/**
 * Repaint from live world state. Safe to call while the panel is open.
 *
 * A repaint replaces the whole subtree, so the focused tab (if any) is restored
 * by id afterwards: without it, a craft would silently drop a keyboard user's
 * focus to the document body.
 */
export function renderCraftingWindow(): void {
  if (!deps) return;
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  const active = document.activeElement;
  const focusedTab = active instanceof HTMLElement ? active.dataset.craftTab : undefined;
  paint(el, currentView(deps), deps);
  if (focusedTab) document.getElementById(`${PANEL_ID}-tab-${focusedTab}`)?.focus();
}

export function isCraftingWindowOpen(): boolean {
  return panelVisible(document.getElementById(PANEL_ID));
}

/** Open (or repaint) the Crafting window. */
export function openCraftingWindow(next: CraftingWindowDeps): void {
  deps = next;
  const el = ensurePanel();
  const active = document.activeElement;
  if (!panelVisible(el) && active instanceof HTMLElement && active !== el) opener = active;
  // Clear any inline `display: none` Hud's closeAll wrote, so the stylesheet's
  // own `[data-open="1"]` rule takes over again.
  el.style.removeProperty('display');
  el.dataset.open = '1';
  // Always open on the first craft: the selection is session view state, and a
  // stale tab carried across a character switch is confusing, not helpful.
  selected = null;
  paint(el, currentView(deps), deps);
  centerPanel(el);
  el.focus();
}

export function closeCraftingWindow(): void {
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  delete el.dataset.open;
  el.style.removeProperty('display');
  el.innerHTML = '';
  const back = opener;
  opener = null;
  if (back?.isConnected) back.focus();
  deps?.onClose?.();
}

/** The one call a keybind or a micro-button needs. */
export function toggleCraftingWindow(next: CraftingWindowDeps): void {
  if (isCraftingWindowOpen()) closeCraftingWindow();
  else openCraftingWindow(next);
}
