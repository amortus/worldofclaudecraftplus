// Thin DOM consumer for the Skills panel (the four gathering professions).
//
// The consumer half of the pure-core + thin-consumer split: it paints
// #skills-panel from the structured SkillsPanelView (skills_panel_view.ts) and
// owns no game state at all. Every number it shows arrived already decided; its
// only jobs are markup, localization through `t()`, and the keyboard/ARIA
// contract.
//
// It creates its own panel element and stylesheet on first open rather than
// reading one out of index.html, so composing it is a single call from Hud and
// nothing in the shared HTML has to change.
//
// ACCESSIBILITY (src/ui/CLAUDE.md): the panel is a labelled dialog, every bar is
// a real `role="progressbar"` with min/now/max plus an `aria-valuetext` a screen
// reader can read as words, every tier chip carries its state in its accessible
// name, Escape closes, focus lands on the panel on open and returns to the
// opener on close, and every control clears the 40x40 tap floor.

import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { bandLabel, masteryColor, masteryLabel, professionDescription, professionName } from './profession_labels';
import {
  GATHER_CONTENT_TIERS,
  type GatheringProfessionId,
  type PlayerProfessionSkill,
  type SkillsPanelRow,
  type SkillsPanelView,
  skillsPanelViewFromRows,
} from './skills_panel_view';
import { svgIcon } from './ui_icons';

const PANEL_ID = 'skills-panel';
const STYLE_ID = 'skills-panel-style';

/**
 * Hud-supplied glue. Everything is a callback so this module never learns which
 * world it is looking at: Hud reads the live proficiency / caps / tool tiers off
 * `IWorld` and hands them over, exactly as `renderVendorWindow` takes its rows.
 */
export interface SkillsPanelDeps {
  /** The rows `IWorld.gatheringSkills()` returns for the local player. */
  skills(): readonly PlayerProfessionSkill[];
  /** Best owned tool tier per profession; 0 where none is carried. Optional:
   *  omit it and every row simply reads "no tool carried". */
  toolTiers?(): Partial<Record<GatheringProfessionId, number>>;
  /** Called when the panel closes, so Hud can drop its own open flag. */
  onClose?(): void;
}

function currentView(d: SkillsPanelDeps): SkillsPanelView {
  return skillsPanelViewFromRows(d.skills(), d.toolTiers?.());
}

let deps: SkillsPanelDeps | null = null;
let opener: HTMLElement | null = null;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // width:100% + max-width (never a viewport unit) so padding can never push the
  // panel past the screen edge; the body scrolls instead of the page.
  style.textContent = `
  #${PANEL_ID} {
    /* No transform centring: Hud's managed-window layer positions every
       .window.panel by writing style.left/top in pixels
       (setWindowPixelPosition), and a translate would double-offset the panel
       the moment a player drags it or a second window cascades. centerPanel()
       does the first centring in the same units Hud uses. */
    position: fixed; left: 0; top: 0;
    /* calc(100% - 24px), never a bare 100% or a vw: it keeps a 12px gutter on
       a 360px portrait phone instead of butting against both screen edges. */
    width: calc(100% - 24px); max-width: 380px; max-height: 84vh;
    padding: 10px 12px 12px; display: none; flex-direction: column;
    z-index: 45; font-family: var(--ui-font);
  }
  #${PANEL_ID}[data-open="1"] { display: flex; }
  #${PANEL_ID} .sk-body { overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  #${PANEL_ID} .sk-intro { color: #998d6a; font-size: 12px; margin: 0 0 8px; }
  #${PANEL_ID} .sk-card {
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 8px 9px; margin-bottom: 8px;
  }
  #${PANEL_ID} .sk-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  #${PANEL_ID} .sk-name { font-family: var(--title-font); color: var(--gold); font-size: 14px; }
  #${PANEL_ID} .sk-value { color: #e7d8b6; font-size: 13px; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .sk-capped { color: #7fdc4f; font-size: 12px; }
  #${PANEL_ID} .sk-bar {
    position: relative; height: 12px; margin: 6px 0 5px; border-radius: 3px;
    background: #05050a; border: 1px solid #3b2e19; overflow: hidden;
  }
  #${PANEL_ID} .sk-fill { height: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18); }
  #${PANEL_ID} .sk-desc { color: #b8ab8b; font-size: 12px; margin: 0 0 6px; }
  #${PANEL_ID} .sk-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #998d6a; font-size: 12px; }
  #${PANEL_ID} .sk-meta b { color: #e7d8b6; font-weight: 500; }
  #${PANEL_ID} .sk-tiers { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; list-style: none; }
  #${PANEL_ID} .sk-tier {
    min-width: 40px; min-height: 40px; padding: 4px 8px; border-radius: 4px; flex: 1 1 auto;
    border: 1px solid #3b2e19; background: #12100b; font-size: 12px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  #${PANEL_ID} .sk-tier .sk-tier-n { color: #d5c19a; }
  #${PANEL_ID} .sk-tier .sk-tier-state { font-size: 11px; margin-top: 2px; text-align: center; }
  #${PANEL_ID} .sk-hint { color: #ffb066; font-size: 12px; margin-top: 6px; }
  #${PANEL_ID} .sk-empty { color: #998d6a; font-size: 13px; padding: 10px 2px; }
  #${PANEL_ID} .x-btn { min-width: 40px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
  #${PANEL_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
  /* Landscape phone: the panel is taller than the screen is, so give the list
     back the chrome padding and let it own nearly the whole height. */
  @media (max-height: 500px) {
    #${PANEL_ID} { max-height: 94vh; padding: 6px 8px 8px; }
  }
  @media (prefers-reduced-motion: reduce) {
    #${PANEL_ID}, #${PANEL_ID} * { transition: none !important; animation: none !important; }
  }`;
  document.head.appendChild(style);
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

/** First-open centring, in the pixel units Hud's drag layer also writes. Skipped
 *  once the player has dragged the panel somewhere they prefer. */
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
  // Explicitly NON-modal: the game keeps running behind an open panel and Tab
  // is meant to leave it, so declaring aria-modal="false" is honest where a
  // bare role="dialog" would imply a focus trap that does not exist.
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeSkillsPanel();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

function tierChipsHtml(row: SkillsPanelRow): string {
  return GATHER_CONTENT_TIERS.map((tier, index) => {
    const state = row.tierStates[index];
    const label = t('hudChrome.professions.tierAria', {
      tier: num(tier),
      state: masteryLabel(state),
    });
    // The mastery state is spelled out, not just coloured: colour alone fails
    // both the contrast-independent requirement and touch (no hover title).
    return (
      `<span class="sk-tier" role="listitem" aria-label="${esc(label)}">` +
      `<span class="sk-tier-n" style="color:${esc(masteryColor(state))}">${esc(t('hudChrome.professions.tierLabel', { tier: num(tier) }))}</span>` +
      `<span class="sk-tier-state" style="color:${esc(masteryColor(state))}" aria-hidden="true">${esc(masteryLabel(state))}</span>` +
      `</span>`
    );
  }).join('');
}

function cardHtml(row: SkillsPanelRow): string {
  const name = professionName(row.professionId);
  const valueText = t('hudChrome.professions.skillValue', {
    skill: num(row.skill),
    max: num(row.maxSkill),
  });
  const barLabel = row.capped
    ? t('hudChrome.professions.cappedAria', { profession: name, max: num(row.maxSkill) })
    : t('hudChrome.professions.skillAria', {
        profession: name,
        skill: num(row.skill),
        max: num(row.maxSkill),
      });
  const tool = row.toolTier > 0
    ? t('hudChrome.professions.toolTier', { tier: num(row.toolTier) })
    : t('hudChrome.professions.toolNone');
  const next =
    row.pointsToNextTier === null
      ? ''
      : `<span>${esc(t('hudChrome.professions.toNextTier', { points: num(row.pointsToNextTier) }))}</span>`;
  const hint = row.tierStates.some((state) => state === 'none')
    ? `<p class="sk-hint">${esc(t('hudChrome.professions.masteryNoneHint'))}</p>`
    : '';
  // The rod cap on fishing's catch table is SILENT in the sim (no event, no
  // denial), so the panel is the only place it can ever be explained.
  const bandHint = row.bandCappedByTool
    ? `<p class="sk-hint">${esc(t('hudChrome.professions.bandToolCapped', { band: bandLabel(row.effectiveBand) }))}</p>`
    : '';
  const toolHint =
    row.toolTier > 0
      ? ''
      : `<p class="sk-hint">${esc(t('hudChrome.professions.toolNoneHint'))}</p>`;
  const reach =
    row.workableTier > 0
      ? `<span>${esc(t('hudChrome.professions.toolWorksTo', { tier: num(row.workableTier) }))}</span>`
      : '';
  return (
    `<section class="sk-card">` +
    `<div class="sk-head"><span class="sk-name">${esc(name)}</span>` +
    `<span class="sk-value">${esc(valueText)}${row.capped ? ` <span class="sk-capped">${esc(t('hudChrome.professions.capped'))}</span>` : ''}</span></div>` +
    `<div class="sk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${row.maxSkill}" aria-valuenow="${row.skill}" aria-valuetext="${esc(barLabel)}" aria-label="${esc(name)}">` +
    `<div class="sk-fill" style="width:${row.percent}%"></div></div>` +
    `<p class="sk-desc">${esc(professionDescription(row.professionId))}</p>` +
    `<div class="sk-meta">` +
    `<span>${esc(t('hudChrome.professions.bandLabel'))}: <b>${esc(bandLabel(row.effectiveBand))}</b></span>` +
    `<span>${esc(t('hudChrome.professions.toolLabel'))}: <b>${esc(tool)}</b></span>` +
    reach +
    next +
    `</div>` +
    `<div class="sk-tiers" role="list" aria-label="${esc(t('hudChrome.professions.tierHeading'))}">${tierChipsHtml(row)}</div>` +
    toolHint +
    bandHint +
    hint +
    `</section>`
  );
}

function paint(el: HTMLElement, view: SkillsPanelView): void {
  const bodyHtml = view.rows.length
    ? view.rows.map(cardHtml).join('')
    : `<p class="sk-empty">${esc(t('hudChrome.professions.empty'))}</p>`;
  el.innerHTML =
    `<div class="panel-title"><span id="${PANEL_ID}-title">${esc(t('hudChrome.professions.panelTitle'))}</span>` +
    `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.professions.close'))}">${svgIcon('close')}</button></div>` +
    `<div class="sk-body">` +
    `<p class="sk-intro">${esc(t('hudChrome.professions.subheading'))}</p>` +
    `<p class="sk-intro">${esc(t('hudChrome.professions.totals', { skill: num(view.totalSkill), max: num(view.totalMaxSkill) }))}</p>` +
    bodyHtml +
    `</div>`;
  el.querySelector('[data-close]')?.addEventListener('click', () => closeSkillsPanel());
}

/** Repaint from live world state. Safe to call every time the panel is open. */
export function renderSkillsPanel(): void {
  if (!deps) return;
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  paint(el, currentView(deps));
}

export function isSkillsPanelOpen(): boolean {
  return panelVisible(document.getElementById(PANEL_ID));
}

/** Open (or repaint) the Skills panel. */
export function openSkillsPanel(next: SkillsPanelDeps): void {
  deps = next;
  const el = ensurePanel();
  const active = document.activeElement;
  if (!panelVisible(el) && active instanceof HTMLElement && active !== el) opener = active;
  // Clear any inline `display: none` Hud's closeAll wrote, so the stylesheet's
  // own `[data-open="1"]` rule takes over again.
  el.style.removeProperty('display');
  el.dataset.open = '1';
  paint(el, currentView(deps));
  centerPanel(el);
  el.focus();
}

export function closeSkillsPanel(): void {
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
export function toggleSkillsPanel(next: SkillsPanelDeps): void {
  if (isSkillsPanelOpen()) closeSkillsPanel();
  else openSkillsPanel(next);
}
