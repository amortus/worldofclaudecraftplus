// Thin DOM consumer for the Book of Deeds panel.
//
// The consumer half of the pure-core + thin-consumer split: it paints
// #deeds-panel from the structured DeedsView (deeds_view.ts) and owns no game
// state. The category tabs are the only interaction, and which category is
// selected is view state, not world state, so it lives here.
//
// It creates its own panel element and stylesheet on first open rather than
// reading one out of index.html, so composing it is a single call from Hud.
//
// ACCESSIBILITY (src/ui/CLAUDE.md): a real tablist (`role="tab"` +
// `aria-selected` + `aria-controls`, roving tabindex driven by the shared
// `rovingTarget` core, Home/End supported), a real `role="progressbar"` per deed
// with min/now/max and a spoken `aria-valuetext`, Escape to close, focus
// restored to the opener, and every tab at the 40x40 tap floor.

import {
  buildDeedsPanelView,
  DEED_CATEGORY_ORDER,
  type DeedCategory,
  type DeedRowView,
  type DeedsPanelView,
} from './deeds_view';
import type { DeedsView } from '../world_api';
import { esc } from './esc';
import { formatNumber, t, tOptional, type TranslationKey } from './i18n';
import { rovingTarget } from './roving_index';
import { svgIcon } from './ui_icons';

const PANEL_ID = 'deeds-panel';
const STYLE_ID = 'deeds-panel-style';
const TABPANEL_ID = `${PANEL_ID}-tabpanel`;

const CATEGORY_KEY: Record<DeedCategory, TranslationKey> = {
  progression: 'hudChrome.deeds.categories.progression',
  combat: 'hudChrome.deeds.categories.combat',
  exploration: 'hudChrome.deeds.categories.exploration',
  dungeon: 'hudChrome.deeds.categories.dungeon',
  raid: 'hudChrome.deeds.categories.raid',
};

export interface DeedsPanelDeps {
  /** The chronicle readout `IWorld.deeds()` returns for the local player. */
  deeds(): DeedsView;
  onClose?(): void;
}

let deps: DeedsPanelDeps | null = null;
let opener: HTMLElement | null = null;
let selected: DeedCategory = DEED_CATEGORY_ORDER[0];

// ---------------------------------------------------------------------------
// Deed text
// ---------------------------------------------------------------------------

/**
 * A deed's localized name / description.
 *
 * Resolved with `tOptional` so a deed that ships before its copy renders its
 * stable ID rather than throwing mid-paint and blanking the panel. The fallback
 * is deliberately the id, never an English string: the real guard that every
 * catalogue deed carries both keys is `tests/deeds_ui_view.test.ts`, not a
 * silent English default.
 */
export function deedName(id: string): string {
  return tOptional(`hudChrome.deeds.list.${id}.name`) ?? id;
}

export function deedDescription(id: string): string {
  return tOptional(`hudChrome.deeds.list.${id}.desc`) ?? '';
}

/** The text of a `deed:`-namespaced title id, e.g. `deed:elder` -> "the Elder". */
export function deedTitleText(titleId: string): string {
  const slug = titleId.startsWith('deed:') ? titleId.slice('deed:'.length) : titleId;
  return tOptional(`hudChrome.deeds.titles.${slug}`) ?? slug;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
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
    width: calc(100% - 24px); max-width: 460px; max-height: 84vh;
    padding: 10px 12px 12px; display: none; flex-direction: column;
    z-index: 45; font-family: var(--ui-font);
  }
  #${PANEL_ID}[data-open="1"] { display: flex; }
  #${PANEL_ID} .dd-summary {
    display: flex; flex-wrap: wrap; gap: 4px 16px; color: #998d6a; font-size: 12px; margin-bottom: 8px;
  }
  #${PANEL_ID} .dd-summary b { color: var(--gold); font-weight: 500; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .dd-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  #${PANEL_ID} .dd-tab {
    min-height: 40px; min-width: 40px; padding: 4px 10px; flex: 1 1 auto;
    border: 1px solid #3b2e19; border-radius: 4px; background: #12100b;
    color: #b8ab8b; font-size: 12px; font-family: var(--ui-font); cursor: var(--cursor-point);
  }
  #${PANEL_ID} .dd-tab[aria-selected="true"] { color: var(--gold); border-color: var(--gold-dim); background: #1d1710; }
  #${PANEL_ID} .dd-list { overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  #${PANEL_ID} .dd-row {
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 8px 9px; margin-bottom: 7px;
  }
  #${PANEL_ID} .dd-row.dd-done { border-color: #4d6b32; background: #0d130acc; }
  #${PANEL_ID} .dd-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  #${PANEL_ID} .dd-name { font-family: var(--title-font); color: var(--gold); font-size: 13px; }
  #${PANEL_ID} .dd-row.dd-done .dd-name { color: #a8dc84; }
  #${PANEL_ID} .dd-renown { color: #998d6a; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .dd-desc { color: #b8ab8b; font-size: 12px; margin: 3px 0 5px; }
  #${PANEL_ID} .dd-bar {
    position: relative; height: 10px; border-radius: 3px;
    background: #05050a; border: 1px solid #3b2e19; overflow: hidden;
  }
  #${PANEL_ID} .dd-fill { height: 100%; background: linear-gradient(180deg, #d9a441, #8a5f18); }
  #${PANEL_ID} .dd-row.dd-done .dd-fill { background: linear-gradient(180deg, #7fdc4f, #3f7a26); }
  #${PANEL_ID} .dd-foot { display: flex; flex-wrap: wrap; gap: 3px 12px; margin-top: 5px; font-size: 12px; }
  #${PANEL_ID} .dd-progress { color: #998d6a; font-variant-numeric: tabular-nums; }
  #${PANEL_ID} .dd-earned { color: #7fdc4f; }
  #${PANEL_ID} .dd-title-reward { color: #c8a838; }
  #${PANEL_ID} .dd-empty { color: #998d6a; font-size: 13px; padding: 10px 2px; }
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

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

function rowHtml(row: DeedRowView): string {
  const name = deedName(row.id);
  const desc = deedDescription(row.id);
  const valueText = row.complete
    ? t('hudChrome.deeds.completeAria', { deed: name })
    : t('hudChrome.deeds.progressAria', {
        deed: name,
        current: num(row.current),
        required: num(row.required),
      });
  // A binary deed has no meaningful bar: a progressbar stuck at 0 or 1 of 1 is
  // noise for a screen reader and a lie visually, so it gets a plain status line.
  const bar = row.binary
    ? ''
    : `<div class="dd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${row.required}" aria-valuenow="${row.current}" aria-valuetext="${esc(valueText)}" aria-label="${esc(name)}">` +
      `<div class="dd-fill" style="width:${row.percent}%"></div></div>` +
      `<span class="dd-progress">${esc(t('hudChrome.deeds.progressValue', { current: num(row.current), required: num(row.required) }))}</span>`;
  const earned = row.complete
    ? `<span class="dd-earned">${esc(t('hudChrome.deeds.earnedBadge'))}</span>`
    : '';
  const title = row.titleId
    ? `<span class="dd-title-reward">${esc(t('hudChrome.deeds.rewardTitle', { title: deedTitleText(row.titleId) }))}</span>`
    : '';
  return (
    `<article class="dd-row${row.complete ? ' dd-done' : ''}" aria-label="${esc(valueText)}">` +
    `<div class="dd-head"><span class="dd-name">${esc(name)}</span>` +
    `<span class="dd-renown">${esc(t('hudChrome.deeds.renownWorth', { renown: num(row.renown) }))}</span></div>` +
    (desc ? `<p class="dd-desc">${esc(desc)}</p>` : '') +
    bar +
    `<div class="dd-foot">${earned}${title}</div>` +
    `</article>`
  );
}

function tabsHtml(view: DeedsPanelView): string {
  return view.categories
    .map((cat) => {
      const on = cat.category === selected;
      const label = t(CATEGORY_KEY[cat.category]);
      const aria = t('hudChrome.deeds.categoryAria', {
        category: label,
        earned: num(cat.earned),
        total: num(cat.total),
      });
      return (
        `<button type="button" class="dd-tab" role="tab" data-cat="${esc(cat.category)}"` +
        ` id="${PANEL_ID}-tab-${esc(cat.category)}" aria-controls="${TABPANEL_ID}"` +
        ` aria-selected="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}"` +
        ` aria-label="${esc(aria)}">${esc(label)}</button>`
      );
    })
    .join('');
}

function listHtml(view: DeedsPanelView): string {
  const rows = view.categories.find((c) => c.category === selected)?.rows ?? [];
  if (rows.length === 0) return `<p class="dd-empty">${esc(t('hudChrome.deeds.empty'))}</p>`;
  return rows.map(rowHtml).join('');
}

function paint(el: HTMLElement, view: DeedsPanelView): void {
  el.innerHTML =
    `<div class="panel-title"><span id="${PANEL_ID}-title">${esc(t('hudChrome.deeds.panelTitle'))}</span>` +
    `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.deeds.close'))}">${svgIcon('close')}</button></div>` +
    `<div class="dd-summary">` +
    `<span>${esc(t('hudChrome.deeds.completionLabel'))}: <b>${esc(t('hudChrome.deeds.completionValue', { earned: num(view.completion.earned), total: num(view.completion.total) }))}</b></span>` +
    `<span>${esc(t('hudChrome.deeds.renownLabel'))}: <b>${esc(t('hudChrome.deeds.renownValue', { renown: num(view.renown) }))}</b></span>` +
    (view.titles.length
      ? `<span>${esc(t('hudChrome.deeds.titlesLabel'))}: <b>${esc(view.titles.map(deedTitleText).join(', '))}</b></span>`
      : '') +
    `</div>` +
    `<div class="dd-tabs" role="tablist" aria-label="${esc(t('hudChrome.deeds.tablistLabel'))}">${tabsHtml(view)}</div>` +
    `<div class="dd-list" id="${TABPANEL_ID}" role="tabpanel" tabindex="0" aria-labelledby="${PANEL_ID}-tab-${esc(selected)}">${listHtml(view)}</div>`;

  el.querySelector('[data-close]')?.addEventListener('click', () => closeDeedsPanel());

  const tabs = [...el.querySelectorAll<HTMLButtonElement>('.dd-tab')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectCategory(tab.dataset.cat as DeedCategory));
    tab.addEventListener('keydown', (ev) => {
      const next = rovingTarget(ev.key, index, tabs.length, 'horizontal');
      if (next === null) return;
      ev.preventDefault();
      const target = tabs[next];
      target.focus();
      selectCategory(target.dataset.cat as DeedCategory);
    });
  });
}

function selectCategory(category: DeedCategory): void {
  if (!category || category === selected) return;
  selected = category;
  renderDeedsPanel();
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
  // Explicitly NON-modal: the game keeps running behind an open panel and Tab is
  // meant to leave it, so declaring aria-modal="false" is honest where a bare
  // role="dialog" would imply a focus trap that does not exist.
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeDeedsPanel();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

/**
 * Repaint from live chronicle state. Safe to call while the panel is open.
 *
 * A repaint replaces the whole subtree, so the focused tab (if any) is restored
 * by id afterwards: without it, a deed earned mid-session would silently drop a
 * keyboard user's focus to the document body.
 */
export function renderDeedsPanel(): void {
  if (!deps) return;
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  const active = document.activeElement;
  const focusedTab = active instanceof HTMLElement ? active.dataset.cat : undefined;
  paint(el, buildDeedsPanelView(deps.deeds()));
  if (focusedTab) document.getElementById(`${PANEL_ID}-tab-${focusedTab}`)?.focus();
}

export function isDeedsPanelOpen(): boolean {
  return panelVisible(document.getElementById(PANEL_ID));
}

export function openDeedsPanel(next: DeedsPanelDeps): void {
  deps = next;
  const el = ensurePanel();
  const active = document.activeElement;
  if (!panelVisible(el) && active instanceof HTMLElement && active !== el) opener = active;
  // Clear any inline `display: none` Hud's closeAll wrote, so the stylesheet's
  // own `[data-open="1"]` rule takes over again.
  el.style.removeProperty('display');
  el.dataset.open = '1';
  // Always open on the first tab: the selection is session view state, and a
  // stale category carried across a character switch is confusing, not helpful.
  selected = DEED_CATEGORY_ORDER[0];
  paint(el, buildDeedsPanelView(deps.deeds()));
  centerPanel(el);
  el.focus();
}

export function closeDeedsPanel(): void {
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
export function toggleDeedsPanel(next: DeedsPanelDeps): void {
  if (isDeedsPanelOpen()) closeDeedsPanel();
  else openDeedsPanel(next);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/** The chat/toast line for a freshly earned deed. */
export function deedUnlockLine(id: string, renown: number): string {
  const name = deedName(id);
  if (renown <= 0) return t('hudChrome.deeds.unlockToast', { name });
  return t('hudChrome.deeds.unlockToastRenown', {
    name,
    renown: formatNumber(renown, { maximumFractionDigits: 0 }),
  });
}

/** The line for a title unlocked alongside a deed. */
export function deedTitleUnlockLine(titleId: string): string {
  return t('hudChrome.deeds.titleToast', { title: deedTitleText(titleId) });
}

/** The `deedComplete` SimEvent variant this module renders. */
export interface DeedCompleteEvent {
  type: 'deedComplete';
  deedId: string;
  renown: number;
  titleId?: string;
}

/**
 * Render one `deedComplete` SimEvent into the lines the HUD logs: the deed
 * itself, then the title if it granted one. Composing the whole system into
 * `handleEvents` is this single arm. The panel is repainted too when it happens
 * to be open, so a deed earned mid-session never leaves a stale bar on screen.
 */
export function deedEventLines(ev: DeedCompleteEvent): string[] {
  const lines = [deedUnlockLine(ev.deedId, ev.renown)];
  if (ev.titleId) lines.push(deedTitleUnlockLine(ev.titleId));
  if (isDeedsPanelOpen()) renderDeedsPanel();
  return lines;
}
