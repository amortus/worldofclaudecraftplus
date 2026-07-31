// Thin DOM consumer for the enchanting bench: the Apply Enchant list and the
// Disenchant list.
//
// The consumer half of the split: it paints #enchanting-window from the
// structured EnchantPickerView / DisenchantPreviewView (enchanting_ui_view.ts)
// and owns no game state. Every gate it renders was decided by the sim's own
// `beginEnchant` / `previewDisenchant`.
//
// The two destructive actions do NOT resolve here. Both raise Hud's existing
// confirm dialog through an injected `confirm` callback, so there is exactly one
// confirmation implementation in the client and this module never mints a second
// modal.
//
// ACCESSIBILITY (src/ui/CLAUDE.md): a labelled dialog with a real
// `role="tablist"` (Enchant / Disenchant) on a roving tabindex, a
// `role="radiogroup"` of target items, every enchant option a real button that
// states its bonus and its cost as TEXT (a disabled option carries its reason in
// words, never colour alone), Escape closes, focus returns to the opener, and
// every control clears the 40x40 tap floor.

import { disenchantConfirmText, enchantReplaceConfirmText } from './crafting_feedback';
import { enchantGroupBlurb, enchantGroupLabel, enchantName, statBonusLabel } from './crafting_labels';
import {
  buildEnchantPickerView,
  type DisenchantPlan,
  disenchantPreviewView,
  type EnchantDef,
  type EnchantOptionRow,
  type EnchantPickerView,
  type EnchantTarget,
  enchantReplaceConfirmView,
  type WornSlotView,
} from './enchanting_ui_view';
import { beginEnchant } from '../sim/professions';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { rovingTarget } from './roving_index';
import { svgIcon } from './ui_icons';
import type { EquipSlot, InvSlot, ItemInstance } from '../sim/types';

const PANEL_ID = 'enchanting-window';
const STYLE_ID = 'enchanting-window-style';
const TABPANEL_ID = 'enchanting-window-panel';

/** One enchantable copy the player owns: a worn piece or a bagged one. */
export interface EnchantTargetOption {
  /** Stable key for the DOM row, unique across worn and bagged copies. */
  key: string;
  target: EnchantTarget;
  itemId: string;
  /** The slot the item's own def declares, which the enchant is matched against. */
  itemSlot: EquipSlot;
  /** True for the worn copy, so the row can say where it is. */
  worn: boolean;
  instance?: ItemInstance;
}

/** One bagged piece the player could break down. */
export interface DisenchantOption {
  /** Bag index. Disenchanting is bag-only by design. */
  index: number;
  itemId: string;
  /** The draw-free preview, or null when the piece cannot be broken down. */
  plan: DisenchantPlan | null;
}

/** Hud-supplied glue. Everything is a callback so this module never learns which
 *  world it is looking at. */
export interface EnchantingWindowDeps {
  /** Every enchantable copy the player holds or wears. */
  targets(): readonly EnchantTargetOption[];
  /** Every bagged piece worth breaking down. */
  disenchantables(): readonly DisenchantOption[];
  /** The enchants that target a slot, in `enchantsForSlot` order. */
  enchantsFor(slot: EquipSlot): readonly EnchantDef[];
  inventory(): readonly InvSlot[];
  /** The worn view of one slot, for a worn target. */
  wornAt(slot: EquipSlot): WornSlotView | undefined;
  /** The player's enchanting skill. */
  skill(): number;
  /** Request an apply. `confirmReplace` is the explicit consent the sim demands
   *  before it will destroy an existing enchant. */
  onApply(enchantId: string, target: EnchantTarget, confirmReplace: boolean): void;
  /** Request a disenchant of one bag slot. */
  onDisenchant(index: number): void;
  /** Hud's one confirm dialog. Both destructive actions route through it. */
  confirm(opts: {
    title: string;
    body: string;
    okText: string;
    cancelText: string;
    onOk(): void;
  }): void;
  itemName(itemId: string): string;
  itemColor?(itemId: string): string;
  onClose?(): void;
}

type Tab = 'enchant' | 'disenchant';

let deps: EnchantingWindowDeps | null = null;
let opener: HTMLElement | null = null;
let tab: Tab = 'enchant';
let selectedTargetKey: string | null = null;

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  #${PANEL_ID} {
    position: fixed; left: 0; top: 0;
    width: calc(100% - 24px); max-width: 460px; max-height: 84vh;
    padding: 10px 12px 12px; display: none; flex-direction: column;
    z-index: 45; font-family: var(--ui-font);
  }
  #${PANEL_ID}[data-open="1"] { display: flex; }
  #${PANEL_ID} .ew-intro { color: #998d6a; font-size: 12px; margin: 0 0 8px; }
  #${PANEL_ID} .ew-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
  #${PANEL_ID} .ew-tab {
    min-height: 40px; min-width: 40px; flex: 1 1 auto; padding: 6px 10px;
    border: 1px solid #3b2e19; border-radius: 4px; background: #12100b;
    color: #b8ab8b; font-family: var(--title-font); font-size: 13px; cursor: pointer;
  }
  #${PANEL_ID} .ew-tab[aria-selected="true"] { color: var(--gold); border-color: var(--gold-dim); background: #1d1710; }
  #${PANEL_ID} .ew-body { overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
  #${PANEL_ID} .ew-targets { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  #${PANEL_ID} .ew-target {
    min-height: 40px; padding: 6px 10px; border: 1px solid #3b2e19; border-radius: 4px;
    background: #12100b; color: #d5c19a; font-size: 12px; cursor: pointer; text-align: left;
  }
  #${PANEL_ID} .ew-target[aria-checked="true"] { border-color: var(--gold-dim); background: #1d1710; color: var(--gold); }
  #${PANEL_ID} .ew-group { margin-bottom: 10px; }
  #${PANEL_ID} .ew-group-head { font-family: var(--title-font); color: var(--gold); font-size: 13px; }
  #${PANEL_ID} .ew-group-blurb { color: #998d6a; font-size: 11px; margin: 0 0 5px; }
  #${PANEL_ID} .ew-opt {
    display: block; width: 100%; min-height: 40px; text-align: left;
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 7px 9px; margin-bottom: 6px; color: #d5c19a; font-size: 12px; cursor: pointer;
  }
  #${PANEL_ID} .ew-opt[disabled] { cursor: default; opacity: 1; }
  #${PANEL_ID} .ew-opt-name { display: block; font-family: var(--title-font); font-size: 13px; color: #e7d8b6; }
  #${PANEL_ID} .ew-opt-bonus { display: block; color: #7fdc4f; margin-top: 2px; }
  #${PANEL_ID} .ew-opt-cost { display: block; color: #998d6a; margin-top: 2px; }
  #${PANEL_ID} .ew-opt-cost.short { color: #ff8f85; }
  #${PANEL_ID} .ew-opt-note { display: block; color: #ffb066; margin-top: 2px; }
  #${PANEL_ID} .ew-opt-current { display: block; color: #7fdc4f; margin-top: 2px; }
  #${PANEL_ID} .ew-row {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    border: 1px solid #3b2e19; border-radius: 6px; background: #0e0c08cc;
    padding: 7px 9px; margin-bottom: 6px;
  }
  #${PANEL_ID} .ew-row-name { font-size: 13px; }
  #${PANEL_ID} .ew-row-yield { display: block; color: #998d6a; font-size: 12px; margin-top: 2px; }
  #${PANEL_ID} .ew-row .btn { min-height: 40px; min-width: 96px; }
  #${PANEL_ID} .ew-empty { color: #998d6a; font-size: 13px; padding: 10px 2px; }
  #${PANEL_ID} .x-btn { min-width: 40px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
  #${PANEL_ID} :focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
  @media (max-height: 500px) {
    #${PANEL_ID} { max-height: 94vh; padding: 6px 8px 8px; }
  }
  @media (prefers-reduced-motion: reduce) {
    #${PANEL_ID}, #${PANEL_ID} * { transition: none !important; animation: none !important; }
  }`;
  document.head.appendChild(style);
}

function bonusText(option: EnchantOptionRow): string {
  return option.bonus
    .map((entry) =>
      t('hudChrome.crafting.statLine', {
        value: num(entry.value),
        stat: statBonusLabel(entry.stat),
      }),
    )
    .join(t('hudChrome.crafting.listJoin'));
}

function costText(option: EnchantOptionRow, d: EnchantingWindowDeps): string {
  return option.reagents
    .map((row) =>
      t('hudChrome.enchanting.costRow', {
        held: num(row.held),
        required: num(row.required),
        item: d.itemName(row.itemId),
      }),
    )
    .join(t('hudChrome.crafting.listJoin'));
}

function activeTarget(d: EnchantingWindowDeps): EnchantTargetOption | null {
  const list = d.targets();
  if (list.length === 0) return null;
  return list.find((option) => option.key === selectedTargetKey) ?? list[0];
}

function pickerFor(d: EnchantingWindowDeps, option: EnchantTargetOption): EnchantPickerView {
  return buildEnchantPickerView({
    enchants: d.enchantsFor(option.itemSlot),
    inventory: d.inventory(),
    target: option.target,
    worn: option.target.where === 'worn' ? d.wornAt(option.itemSlot) : undefined,
    targetItemSlot: option.itemSlot,
    skill: d.skill(),
  });
}

function targetsHtml(d: EnchantingWindowDeps, active: EnchantTargetOption | null): string {
  const list = d.targets();
  if (list.length === 0) return '';
  return (
    `<div class="ew-targets" role="radiogroup" aria-label="${esc(t('hudChrome.enchanting.targetsLabel'))}">` +
    list
      .map((option) => {
        const on = active?.key === option.key;
        const label = option.worn
          ? t('hudChrome.enchanting.targetWorn', { item: d.itemName(option.itemId) })
          : t('hudChrome.enchanting.targetBagged', { item: d.itemName(option.itemId) });
        const current = option.instance?.enchant;
        const aria = current
          ? t('hudChrome.enchanting.targetAriaEnchanted', {
              item: label,
              enchant: enchantName(current),
            })
          : t('hudChrome.enchanting.targetAriaPlain', { item: label });
        return (
          `<button type="button" class="ew-target" role="radio" data-target-key="${esc(option.key)}"` +
          ` aria-checked="${on ? 'true' : 'false'}" tabindex="${on ? '0' : '-1'}"` +
          ` aria-label="${esc(aria)}">${esc(label)}</button>`
        );
      })
      .join('') +
    `</div>`
  );
}

function optionHtml(option: EnchantOptionRow, d: EnchantingWindowDeps): string {
  const name = enchantName(option.enchantId);
  const short = !option.reagentsMet;
  const note = option.replaces
    ? `<span class="ew-opt-note">${esc(t('hudChrome.enchanting.replacesNote', { destroyed: enchantName(option.replaces) }))}</span>`
    : '';
  const current = option.isCurrent
    ? `<span class="ew-opt-current">${esc(t('hudChrome.enchanting.currentNote'))}</span>`
    : '';
  const aria = t('hudChrome.enchanting.optionAria', {
    enchant: name,
    stats: bonusText(option),
  });
  const disabled = option.isCurrent || short;
  return (
    `<button type="button" class="ew-opt" data-enchant="${esc(option.enchantId)}"` +
    (disabled ? ' disabled' : '') +
    ` aria-label="${esc(aria)}">` +
    `<span class="ew-opt-name">${esc(name)}</span>` +
    `<span class="ew-opt-bonus">${esc(bonusText(option))}</span>` +
    `<span class="ew-opt-cost${short ? ' short' : ''}">${esc(t('hudChrome.enchanting.costLabel', { cost: costText(option, d) }))}</span>` +
    note +
    current +
    `</button>`
  );
}

function enchantTabHtml(d: EnchantingWindowDeps): string {
  const active = activeTarget(d);
  if (!active) return `<p class="ew-empty">${esc(t('hudChrome.enchanting.noTargets'))}</p>`;
  const view = pickerFor(d, active);
  const header = view.currentEnchantId
    ? `<p class="ew-intro">${esc(t('hudChrome.enchanting.currentOn', { item: d.itemName(active.itemId), enchant: enchantName(view.currentEnchantId) }))}</p>`
    : `<p class="ew-intro">${esc(t('hudChrome.enchanting.currentNone', { item: d.itemName(active.itemId) }))}</p>`;
  const sections = view.sections
    .filter((section) => section.options.length > 0)
    .map(
      (section) =>
        `<section class="ew-group">` +
        `<h3 class="ew-group-head">${esc(enchantGroupLabel(section.group))}</h3>` +
        `<p class="ew-group-blurb">${esc(enchantGroupBlurb(section.group))}</p>` +
        section.options.map((option) => optionHtml(option, d)).join('') +
        `</section>`,
    )
    .join('');
  return (
    targetsHtml(d, active) +
    header +
    (sections || `<p class="ew-empty">${esc(t('hudChrome.enchanting.noOptions'))}</p>`)
  );
}

function disenchantTabHtml(d: EnchantingWindowDeps): string {
  const rows = d.disenchantables();
  if (rows.length === 0) {
    return `<p class="ew-empty">${esc(t('hudChrome.enchanting.disenchant.empty'))}</p>`;
  }
  return rows
    .map((row) => {
      const view = disenchantPreviewView(row.itemId, row.plan);
      if (!view) return '';
      const yieldText = view.exactMaterial
        ? t('hudChrome.enchanting.disenchant.yieldExact', {
            count: num(view.minCount),
            item: d.itemName(view.materialItemId),
          })
        : t('hudChrome.enchanting.disenchant.yieldRange', {
            min: num(view.minCount),
            max: num(view.maxCount),
            item: d.itemName(view.materialItemId),
          });
      const secondary =
        view.secondaryItemId !== undefined && view.secondaryCount !== undefined
          ? t('hudChrome.crafting.listJoin') +
            t('hudChrome.enchanting.disenchant.yieldExact', {
              count: num(view.secondaryCount),
              item: d.itemName(view.secondaryItemId),
            })
          : '';
      const color = d.itemColor?.(row.itemId) ?? '#e7d8b6';
      return (
        `<div class="ew-row">` +
        `<span><span class="ew-row-name" style="color:${esc(color)}">${esc(d.itemName(row.itemId))}</span>` +
        `<span class="ew-row-yield">${esc(t('hudChrome.enchanting.disenchant.yieldsLabel', { yield: yieldText + secondary }))}</span></span>` +
        `<button type="button" class="btn" data-disenchant="${row.index}" aria-label="${esc(t('hudChrome.enchanting.disenchant.buttonAria', { item: d.itemName(row.itemId) }))}">${esc(t('hudChrome.enchanting.disenchant.button'))}</button>` +
        `</div>`
      );
    })
    .join('');
}

function tabsHtml(): string {
  const tabs: [Tab, string][] = [
    ['enchant', t('hudChrome.enchanting.tabEnchant')],
    ['disenchant', t('hudChrome.enchanting.tabDisenchant')],
  ];
  return tabs
    .map(
      ([id, label]) =>
        `<button type="button" class="ew-tab" role="tab" data-ew-tab="${id}"` +
        ` id="${PANEL_ID}-tab-${id}" aria-controls="${TABPANEL_ID}"` +
        ` aria-selected="${tab === id ? 'true' : 'false'}" tabindex="${tab === id ? '0' : '-1'}">${esc(label)}</button>`,
    )
    .join('');
}

/** Raise the destructive replace confirmation, or apply straight away when the
 *  copy is bare. The consent flag the sim demands is only ever set from inside
 *  the dialog's own accept handler. */
function requestApply(d: EnchantingWindowDeps, enchantId: string): void {
  const active = activeTarget(d);
  if (!active) return;
  const enchant = d.enchantsFor(active.itemSlot).find((e) => e.id === enchantId);
  if (!enchant) return;
  // Re-run the sim's own gate to get the authoritative replace facts (which
  // enchant would die, and the exact cost) rather than re-deriving them.
  const start = beginEnchant({
    enchant,
    target: active.target,
    inventory: d.inventory() as InvSlot[],
    worn: active.target.where === 'worn' ? d.wornAt(active.itemSlot) : undefined,
    targetItemSlot: active.itemSlot,
    skill: d.skill(),
    confirmReplace: true,
  });
  const confirmView = enchantReplaceConfirmView(start, enchant.statBonus);
  if (!confirmView) {
    d.onApply(enchantId, active.target, false);
    renderEnchantingWindow();
    return;
  }
  const text = enchantReplaceConfirmText(confirmView);
  d.confirm({
    ...text,
    onOk: () => {
      d.onApply(enchantId, active.target, true);
      renderEnchantingWindow();
    },
  });
}

function requestDisenchant(d: EnchantingWindowDeps, index: number): void {
  const row = d.disenchantables().find((option) => option.index === index);
  if (!row) return;
  const view = disenchantPreviewView(row.itemId, row.plan);
  if (!view) return;
  const text = disenchantConfirmText(view);
  d.confirm({
    ...text,
    onOk: () => {
      d.onDisenchant(index);
      renderEnchantingWindow();
    },
  });
}

function paint(el: HTMLElement, d: EnchantingWindowDeps): void {
  el.innerHTML =
    `<div class="panel-title"><span id="${PANEL_ID}-title">${esc(t('hudChrome.enchanting.panelTitle'))}</span>` +
    `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.enchanting.close'))}">${svgIcon('close')}</button></div>` +
    `<p class="ew-intro">${esc(t('hudChrome.enchanting.subheading'))}</p>` +
    `<div class="ew-tabs" role="tablist" aria-label="${esc(t('hudChrome.enchanting.tablistLabel'))}">${tabsHtml()}</div>` +
    `<div class="ew-body" id="${TABPANEL_ID}" role="tabpanel" tabindex="0" aria-labelledby="${PANEL_ID}-tab-${tab}">` +
    (tab === 'enchant' ? enchantTabHtml(d) : disenchantTabHtml(d)) +
    `</div>`;

  el.querySelector('[data-close]')?.addEventListener('click', () => closeEnchantingWindow());

  const tabs = [...el.querySelectorAll<HTMLButtonElement>('.ew-tab')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => selectTab(button.dataset.ewTab as Tab));
    button.addEventListener('keydown', (ev) => {
      const next = rovingTarget(ev.key, index, tabs.length, 'horizontal');
      if (next === null) return;
      ev.preventDefault();
      tabs[next].focus();
      selectTab(tabs[next].dataset.ewTab as Tab);
    });
  });

  const targets = [...el.querySelectorAll<HTMLButtonElement>('.ew-target')];
  targets.forEach((button, index) => {
    button.addEventListener('click', () => selectTarget(button.dataset.targetKey));
    button.addEventListener('keydown', (ev) => {
      const next = rovingTarget(ev.key, index, targets.length, 'both');
      if (next === null) return;
      ev.preventDefault();
      targets[next].focus();
      selectTarget(targets[next].dataset.targetKey);
    });
  });

  for (const button of el.querySelectorAll<HTMLButtonElement>('[data-enchant]')) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const enchantId = button.dataset.enchant;
      if (enchantId) requestApply(d, enchantId);
    });
  }
  for (const button of el.querySelectorAll<HTMLButtonElement>('[data-disenchant]')) {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.disenchant);
      if (Number.isInteger(index)) requestDisenchant(d, index);
    });
  }
}

function selectTab(next: Tab | undefined): void {
  if (!next || next === tab) return;
  tab = next;
  renderEnchantingWindow();
}

function selectTarget(key: string | undefined): void {
  if (!key || key === selectedTargetKey) return;
  selectedTargetKey = key;
  renderEnchantingWindow();
}

function panelVisible(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.dataset.open === '1' && el.style.display !== 'none';
}

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
  el.setAttribute('aria-modal', 'false');
  el.setAttribute('aria-labelledby', `${PANEL_ID}-title`);
  el.tabIndex = -1;
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      closeEnchantingWindow();
    }
  });
  (document.getElementById('ui') ?? document.body).appendChild(el);
  return el;
}

/** Repaint from live world state. Safe to call while the panel is open. */
export function renderEnchantingWindow(): void {
  if (!deps) return;
  const el = document.getElementById(PANEL_ID);
  if (!panelVisible(el)) return;
  const active = document.activeElement;
  const focusedTab = active instanceof HTMLElement ? active.dataset.ewTab : undefined;
  paint(el, deps);
  if (focusedTab) document.getElementById(`${PANEL_ID}-tab-${focusedTab}`)?.focus();
}

export function isEnchantingWindowOpen(): boolean {
  return panelVisible(document.getElementById(PANEL_ID));
}

export function openEnchantingWindow(next: EnchantingWindowDeps): void {
  deps = next;
  const el = ensurePanel();
  const active = document.activeElement;
  if (!panelVisible(el) && active instanceof HTMLElement && active !== el) opener = active;
  el.style.removeProperty('display');
  el.dataset.open = '1';
  tab = 'enchant';
  selectedTargetKey = null;
  paint(el, deps);
  centerPanel(el);
  el.focus();
}

export function closeEnchantingWindow(): void {
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
export function toggleEnchantingWindow(next: EnchantingWindowDeps): void {
  if (isEnchantingWindowOpen()) closeEnchantingWindow();
  else openEnchantingWindow(next);
}
