// Pure, host-agnostic view model for the enchanting surfaces: the Apply Enchant
// picker, the destructive replace confirmation, the disenchant confirmation, and
// the per-line stat attribution an enchanted item's tooltip prints.
//
// The pure-core half of the split (root CLAUDE.md Conventions). Upstream's whole
// complaint about the old enchanting UI is that it was vague, so this module is
// built around three explicit answers:
//
//   1. every option in the picker carries its own stat bonus INLINE, grouped
//      Base / Runed / Greater, rather than a name the player has to guess at;
//   2. a replace NAMES the enchant it would destroy, states the reagent cost,
//      and carries the two warnings (no refund, no undo) as structured flags a
//      dialog must render, not as prose buried in one sentence;
//   3. an item tooltip can say which stats came from the enchant and which from
//      the masterwork bake, instead of a bare "Enchanted" badge.
//
// Every gate is resolved by calling the SIM's own `beginEnchant`, never by
// re-deriving the rule here, so the picker's disabled state and the server's
// deny can never disagree.
//
// DOM-free and i18n-free, so tests/enchanting_ui_view.test.ts drives it
// directly. Every number is raw: the consumer formats.

import {
  beginEnchant,
  type DisenchantInput,
  type DisenchantPlan,
  ENCHANT_GROUPS,
  type EnchantDef,
  type EnchantDenyReason,
  type EnchantGroup,
  type EnchantStart,
  type EnchantStatBonus,
  type EnchantTarget,
  enchantsForSlot,
  previewDisenchant,
  type WornSlotView,
} from '../sim/professions';
import type { EquipSlot, InvSlot, ItemInstance } from '../sim/types';
import { type CraftReagentRow, statBonusLines, type StatBonusLine } from './crafting_ui_view';

function reagentRows(status: EnchantStart['reagents']): CraftReagentRow[] {
  return status.map((row) => ({ ...row, short: row.met ? 0 : row.required - row.held }));
}

// ---------------------------------------------------------------------------
// The Apply Enchant picker
// ---------------------------------------------------------------------------

/** One selectable enchant in the picker. */
export interface EnchantOptionRow {
  enchantId: string;
  group: EnchantGroup;
  itemSlot: EquipSlot;
  /** The enchant's own bonus, ordered, so the row states it inline. */
  bonus: StatBonusLine[];
  reagents: CraftReagentRow[];
  /** True when the bag holds every reagent line. */
  reagentsMet: boolean;
  /** The reagent ids that are short, in the enchant's declared order. */
  shortItemIds: string[];
  /**
   * True when pressing this row would go through, GIVEN CONSENT to replace.
   * The picker resolves every row with `confirmReplace: true` on purpose: an
   * unconfirmed row would deny with `already_enchanted` for a reason the player
   * has not been asked about yet, which would grey out every option on an
   * enchanted item and hide the real (affordability) state underneath.
   */
  ok: boolean;
  denyReason?: EnchantDenyReason;
  /** True when this exact enchant is the one already on the copy. Re-applying
   *  it is refused outright, even with consent: it would burn the reagents for
   *  no state change. */
  isCurrent: boolean;
  /** The enchant id this row would DESTROY, or null when the copy is bare. */
  replaces: string | null;
  skillGain: number;
}

export interface EnchantGroupSection {
  group: EnchantGroup;
  options: EnchantOptionRow[];
}

export interface EnchantPickerView {
  /** The item id the target resolves to, absent when it names nothing. */
  itemId?: string;
  /** The equip slot the target item declares. */
  targetItemSlot: EquipSlot | undefined;
  /** The enchant already on the copy, or null. */
  currentEnchantId: string | null;
  /** Always the three groups in ENCHANT_GROUPS order; a group with no enchant
   *  for this slot carries an empty `options` and the consumer skips it. */
  sections: EnchantGroupSection[];
  /** Total options across every group. 0 means the slot has no enchants. */
  totalOptions: number;
  /** How many options are affordable AND legal right now. */
  availableCount: number;
}

export interface EnchantPickerInput {
  /** The enchants to offer. Pass `enchantsForSlot(slot, ENCHANTS)` for a slot. */
  enchants: readonly EnchantDef[];
  /** The bag. Read-only here: `beginEnchant` never mutates. */
  inventory: readonly InvSlot[];
  target: EnchantTarget;
  /** The worn arm's view of the named slot. Ignored on the bag arm. */
  worn?: WornSlotView;
  /** The equip slot the TARGET item's own def declares. */
  targetItemSlot: EquipSlot | undefined;
  /** The player's enchanting skill, for the gain readout. */
  skill: number;
}

function optionRow(enchant: EnchantDef, input: EnchantPickerInput): EnchantOptionRow {
  const start = beginEnchant({
    enchant,
    target: input.target,
    inventory: input.inventory as InvSlot[],
    worn: input.worn,
    targetItemSlot: input.targetItemSlot,
    skill: input.skill,
    confirmReplace: true,
  });
  const reagents = reagentRows(start.reagents);
  const row: EnchantOptionRow = {
    enchantId: enchant.id,
    group: enchant.group,
    itemSlot: enchant.itemSlot,
    bonus: statBonusLines(enchant.statBonus),
    reagents,
    reagentsMet: reagents.every((r) => r.met),
    shortItemIds: reagents.filter((r) => !r.met).map((r) => r.itemId),
    ok: start.ok,
    isCurrent: start.reason === 'same_enchant',
    replaces: start.replacing === true ? (start.replacedEnchantId ?? null) : null,
    skillGain: start.skillGain,
  };
  if (start.reason) row.denyReason = start.reason;
  return row;
}

/**
 * The whole Apply Enchant list for one target, grouped Base / Runed / Greater.
 * Order inside a group is the order `enchants` arrives in, which for
 * `enchantsForSlot` is group-then-id-ascending, so the picker never reshuffles
 * between runs.
 */
export function buildEnchantPickerView(input: EnchantPickerInput): EnchantPickerView {
  const options = input.enchants.map((enchant) => optionRow(enchant, input));
  const sections: EnchantGroupSection[] = ENCHANT_GROUPS.map((group) => ({
    group,
    options: options.filter((option) => option.group === group),
  }));
  // Every row was resolved against the same target, so any of them reports the
  // same current-enchant fact; `isCurrent` picks it up even when the current
  // enchant is not in the offered list.
  const replaced = options.find((option) => option.replaces !== null)?.replaces ?? null;
  const view: EnchantPickerView = {
    targetItemSlot: input.targetItemSlot,
    currentEnchantId: replaced,
    sections,
    totalOptions: options.length,
    availableCount: options.filter((option) => option.ok).length,
  };
  const itemId = enchantTargetItemId(input);
  if (itemId !== undefined) view.itemId = itemId;
  return view;
}

/** The item id the picker's target names, or undefined when it names nothing. */
function enchantTargetItemId(input: EnchantPickerInput): string | undefined {
  if (input.target.where === 'worn') return input.worn?.itemId;
  const index = input.target.index;
  if (!Number.isInteger(index) || index < 0 || index >= input.inventory.length) return undefined;
  const slot = input.inventory[index];
  return slot && slot.count > 0 ? slot.itemId : undefined;
}

// ---------------------------------------------------------------------------
// The destructive replace confirmation
// ---------------------------------------------------------------------------

/**
 * The two things a replace confirmation must warn about, as ids rather than
 * prose. Both are consequences the sim genuinely has and cannot walk back:
 * `materialsNotRefunded` because disenchanting is the faucet and enchanting is
 * the sink, `cannotUndo` because the apply bakes the new bonus into the copy
 * and the old one is gone the moment it lands.
 */
export type EnchantReplaceWarning = 'materialsNotRefunded' | 'cannotUndo';

export const ENCHANT_REPLACE_WARNINGS: readonly EnchantReplaceWarning[] = [
  'materialsNotRefunded',
  'cannotUndo',
];

export interface EnchantReplaceConfirmView {
  /** The enchant about to be applied. */
  enchantId: string;
  /** The enchant about to be DESTROYED. The dialog must name this. */
  destroyedEnchantId: string;
  /** The copy being worked on. */
  itemId?: string;
  /** The full reagent cost the player is about to pay. */
  cost: CraftReagentRow[];
  /** True when the bag covers the whole cost. */
  costMet: boolean;
  /** The bonus the new enchant grants, so the trade is visible on both sides. */
  gaining: StatBonusLine[];
  warnings: readonly EnchantReplaceWarning[];
  /**
   * Always true. Present as a field so a dialog cannot render this model
   * without opting into the destructive treatment (extra confirm affordance,
   * a marked-by-more-than-colour heading).
   */
  destructive: true;
}

/**
 * The replace confirmation, or null when nothing would be destroyed.
 *
 * `start` is a `beginEnchant` result. Both the unconfirmed `already_enchanted`
 * deny and a confirmed success carry `replacing` + `replacedEnchantId`, so the
 * dialog can be built from the very deny that refused the click.
 *
 * Returns null for an identical re-apply (`same_enchant`): that is refused
 * outright, not confirmed, so offering a confirmation for it would be a lie.
 */
export function enchantReplaceConfirmView(
  start: EnchantStart,
  gaining?: EnchantStatBonus,
): EnchantReplaceConfirmView | null {
  if (start.replacing !== true) return null;
  const destroyedEnchantId = start.replacedEnchantId;
  if (destroyedEnchantId === undefined) return null;
  if (start.reason === 'same_enchant') return null;
  const cost = reagentRows(start.reagents);
  const view: EnchantReplaceConfirmView = {
    enchantId: start.enchantId,
    destroyedEnchantId,
    cost,
    costMet: cost.every((row) => row.met),
    gaining: statBonusLines(gaining ?? start.statBonus),
    warnings: ENCHANT_REPLACE_WARNINGS,
    destructive: true,
  };
  if (start.itemId !== undefined) view.itemId = start.itemId;
  return view;
}

// ---------------------------------------------------------------------------
// The disenchant confirmation
// ---------------------------------------------------------------------------

/** What breaking a piece down costs the player, as ids rather than prose. */
export type DisenchantWarning = 'itemDestroyed' | 'cannotUndo';

export const DISENCHANT_WARNINGS: readonly DisenchantWarning[] = ['itemDestroyed', 'cannotUndo'];

export interface DisenchantPreviewView {
  itemId: string;
  /** The universal ladder material (dust / essence / shard). */
  materialItemId: string;
  minCount: number;
  maxCount: number;
  /**
   * True when the ladder yield is a single number rather than a range. The sim
   * always spends its one draw on a +0/+1 bonus unit, so this is false today;
   * it exists so the line reads correctly if a future yield is ever pinned.
   */
  exactMaterial: boolean;
  /** The typed weave a rare-or-better piece also gives up. Draw-free, so the
   *  preview states an exact number rather than a range. */
  secondaryItemId?: string;
  secondaryCount?: number;
  warnings: readonly DisenchantWarning[];
  destructive: true;
}

/** The disenchant confirmation from an already-resolved plan. */
export function disenchantPreviewView(
  itemId: string,
  plan: DisenchantPlan | null,
): DisenchantPreviewView | null {
  if (!plan) return null;
  const view: DisenchantPreviewView = {
    itemId,
    materialItemId: plan.materialItemId,
    minCount: plan.minCount,
    maxCount: plan.maxCount,
    exactMaterial: plan.minCount === plan.maxCount,
    warnings: DISENCHANT_WARNINGS,
    destructive: true,
  };
  if (plan.secondaryItemId !== undefined && plan.secondaryCount !== undefined) {
    view.secondaryItemId = plan.secondaryItemId;
    view.secondaryCount = plan.secondaryCount;
  }
  return view;
}

/** The same confirmation straight off the item's def facts. Null for a piece
 *  that cannot be disenchanted at all. */
export function disenchantPreviewFor(input: DisenchantInput): DisenchantPreviewView | null {
  return disenchantPreviewView(input.itemId, previewDisenchant(input));
}

// ---------------------------------------------------------------------------
// Per-line tooltip attribution
// ---------------------------------------------------------------------------

export interface InstanceStatAttribution {
  /** The enchant on this copy, or null. */
  enchantId: string | null;
  /** The stat lines the ENCHANT contributes. */
  enchantLines: StatBonusLine[];
  /** True when the copy carries a masterwork bake. */
  masterwork: boolean;
  /** The stat lines the MASTERWORK bake contributes: the copy's baked total
   *  minus the enchant's declared share, per stat. */
  masterworkLines: StatBonusLine[];
  /** The maker's bond, when the copy carries one. */
  signer?: string;
  /** True when the copy carries anything worth a tooltip section at all. */
  hasAny: boolean;
}

/**
 * Split an instance's baked `rolled.stats` into what the enchant put there and
 * what the masterwork proc did.
 *
 * This is the whole reason a per-line attribution is possible: `resolveEnchant`
 * sums the enchant's `statBonus` ADDITIVELY on top of whatever was already
 * baked, and a replace subtracts the old bonus before adding the new one. So
 * the enchant's declared share is exact, and the residue is the bake.
 *
 * `enchantBonus` is the resolved def's `statBonus` for `instance.enchant`. When
 * the caller cannot resolve it (a marker id no enchant table knows, reachable
 * only from a hand-edited save) it passes undefined and the whole baked profile
 * is attributed to the masterwork, which is the honest fallback: it never
 * invents an enchant line it cannot name.
 */
export function instanceStatAttribution(
  instance: ItemInstance | undefined,
  enchantBonus?: EnchantStatBonus,
): InstanceStatAttribution {
  const enchantId = instance?.enchant ?? null;
  const baked = instance?.rolled?.stats ?? {};
  const enchantLines = enchantId !== null ? statBonusLines(enchantBonus) : [];
  const residual: Record<string, number> = { ...baked };
  for (const line of enchantLines) {
    const remain = (residual[line.stat] ?? 0) - line.value;
    if (remain > 0) residual[line.stat] = remain;
    else delete residual[line.stat];
  }
  const masterwork = instance?.rolled?.masterwork === true;
  const masterworkLines = masterwork ? statBonusLines(residual as EnchantStatBonus) : [];
  const view: InstanceStatAttribution = {
    enchantId,
    enchantLines,
    masterwork,
    masterworkLines,
    hasAny:
      enchantId !== null ||
      masterwork ||
      (instance?.signer !== undefined && instance.signer !== ''),
  };
  if (instance?.signer) view.signer = instance.signer;
  return view;
}

export { ENCHANT_GROUPS, enchantsForSlot };
export type {
  DisenchantInput,
  DisenchantPlan,
  EnchantDef,
  EnchantDenyReason,
  EnchantGroup,
  EnchantStart,
  EnchantTarget,
  StatBonusLine,
  WornSlotView,
};
