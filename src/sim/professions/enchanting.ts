// Enchanting: break finished gear down into arcane materials, then spend those
// materials to bake a permanent stat bonus into ONE SPECIFIC COPY of an item.
//
// The two halves and their draw contract:
//
//   - apply / replace an enchant: ZERO rng draws, ever. Every gate is a state
//     check and the bonus is a fixed number off the enchant def, so nothing
//     here can move the world's rng stream.
//   - disenchant: EXACTLY ONE draw per success (the material bonus unit), zero
//     on every denial, the same shape wave 1's harvest uses.
//
// An enchant lands on an `ItemInstance` (`rolled.stats` plus the authoritative
// `enchant` marker), so it belongs to that copy and not to the item id: an
// enchanted piece is a distinct good from a plain copy of the same item, it
// survives equip and unequip, and `recalcPlayerStats` already sums an equipped
// instance's `rolled.stats` on top of the def's own.
//
// Replacing an existing enchant is allowed but DESTRUCTIVE. It needs an
// explicit `confirmReplace`; without it the deny is the honest
// `already_enchanted` (never a silent overwrite), and `beginEnchant` still
// reports the enchant that WOULD be destroyed plus the full reagent cost, which
// is exactly what the confirmation dialog has to name. Re-applying the
// identical enchant is refused outright even WITH the flag: accepting it would
// burn materials for zero state change. The old materials are never refunded:
// disenchanting is the faucet and enchanting is the sink.
//
// Pure and host-agnostic: no `Sim`, no `PlayerMeta`, no `ITEMS`, no content
// import. Randomness arrives as an `Rng` parameter, never `Math.random`. The
// only mutation is of the `InvSlot[]` handed in, through the sanctioned
// `addToSlots` / `removeFromSlots` paths.

import { addToSlots, cloneItemInstance, removeFromSlots } from '../item_instance';
import type { Rng } from '../rng';
import type { EquipSlot, InvSlot, ItemDef, ItemInstance } from '../types';
import { countItemInSlots, CRAFT_MAX_SKILL, craftSkillGain, reagentStatusOf } from './crafting';
import type { EnchantDef, EnchantStatBonus, DisenchantPlan, ReagentStatus } from './types';

// ---------------------------------------------------------------------------
// The already-enchanted read
// ---------------------------------------------------------------------------

/**
 * The authoritative "this copy is already enchanted" test: the explicit
 * `enchant` marker.
 *
 * Upstream also treats bare `rolled.stats` WITHOUT `rolled.masterwork` as
 * enchanted, to catch legacy copies written before they had a marker. We have
 * no such legacy: wave 1 shipped `ItemInstance.enchant` as the marker on day
 * one and nothing has ever written `rolled.stats` without also setting
 * `masterwork`. Keying on the marker alone therefore has the same behavior with
 * none of the ambiguity, and it means a masterwork copy stays enchantable
 * exactly like a plain one.
 */
export function isEnchantedInstance(instance: ItemInstance | undefined): boolean {
  return instance?.enchant !== undefined;
}

// ---------------------------------------------------------------------------
// Skill
// ---------------------------------------------------------------------------

// Enchanting rides the SAME four-state mastery curve and the same 125 ceiling
// crafting does (`crafting.ts`), so nothing about the curve is restated here:
// only the mapping from an action's difficulty onto the skillReq ladder is.
//
// Upstream scores an apply by the max item-def quality across the enchant's
// reagents and a disenchant by the destroyed item's quality, then runs both
// through their curve. We do the same, but read the enchant's declared GROUP
// instead of re-deriving a tier from reagent qualities: the group IS the tier
// in our table (base / runed / greater), it is authored rather than inferred,
// and it cannot drift when a reagent is re-priced.

/** The skillReq rung each enchant group sits on: base is the free floor, runed
 *  the mid rung, greater the top. Tiers 0 / 2 / 3 on the shared 25-point
 *  ladder, so a greater enchant still teaches a 75-skill enchanter at full
 *  rate and a base enchant grays out at 75, exactly like a rung-1 recipe. */
export const ENCHANT_GROUP_SKILL_REQ = { base: 0, runed: 50, greater: 75 } as const;

/** The skillReq rung a disenchant sits on, by the destroyed piece's quality.
 *  A grey/white piece is the free floor; an epic is the top rung. */
export const DISENCHANT_QUALITY_SKILL_REQ: Readonly<
  Record<NonNullable<ItemDef['quality']>, number>
> = Object.freeze({
  poor: 0,
  common: 0,
  uncommon: 25,
  rare: 50,
  epic: 75,
  legendary: 75,
});

/** Skill one apply teaches, already clamped against the 125 ceiling. */
export function enchantSkillGain(skill: number, enchant: EnchantDef, maxSkill = CRAFT_MAX_SKILL) {
  return craftSkillGain(skill, ENCHANT_GROUP_SKILL_REQ[enchant.group], maxSkill);
}

/** Skill one disenchant teaches, already clamped against the 125 ceiling. */
export function disenchantSkillGain(
  skill: number,
  quality: ItemDef['quality'],
  maxSkill = CRAFT_MAX_SKILL,
) {
  return craftSkillGain(skill, DISENCHANT_QUALITY_SKILL_REQ[quality ?? 'common'], maxSkill);
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

/**
 * Which exact copy an enchant lands on.
 *
 * Upstream keys the command on an ITEM ID and then picks a victim by scanning
 * for the highest-index enchanted copy, which they document as racy (a copy
 * arriving between the dialog and the accept moves the pin). They also need
 * per-slot targeting on the worn arm because their `ring1`/`ring2` and
 * `mainhand`/`offhand` can each be wearing an identical copy of one item id.
 *
 * NEITHER problem exists here, and the shape below is why. Our `EquipSlot` has
 * exactly eight members with no ring, neck or offhand, and this repo has no
 * dual wield at all (verified: zero `offhand`/`dualWield` references in
 * `src/sim`, and every weapon declares `slot: 'mainhand'`), so a worn copy is
 * uniquely named by its SLOT. A bagged copy is uniquely named by its bag
 * INDEX. Naming the copy directly removes the victim-pinning heuristic and its
 * race outright rather than porting them.
 */
export type EnchantTarget =
  | { where: 'worn'; slot: EquipSlot }
  | { where: 'bag'; index: number };

/** What the host sees in one worn equipment slot. `itemId` is absent for an
 *  empty slot. */
export interface WornSlotView {
  itemId?: string;
  instance?: ItemInstance;
}

// ---------------------------------------------------------------------------
// Apply / replace
// ---------------------------------------------------------------------------

/** Why an enchant attempt was refused. Stable ids, never player text. */
export type EnchantDenyReason =
  | 'not_held'
  | 'wrong_slot'
  | 'insufficient_materials'
  | 'already_enchanted'
  | 'same_enchant';

export interface EnchantAttempt {
  enchant: EnchantDef;
  target: EnchantTarget;
  /** The bag. Reagents ALWAYS come from here, on both arms. `resolveEnchant`
   *  mutates it; `beginEnchant` never does. */
  inventory: InvSlot[];
  /** The worn arm's view of the named slot. Ignored on the bag arm. */
  worn?: WornSlotView;
  /** The equip slot the TARGET item's own def declares, which is what the
   *  enchant's `itemSlot` is checked against. Passed in rather than looked up,
   *  so this module never imports `ITEMS`. Undefined for a non-equippable
   *  target, which always fails the slot gate. */
  targetItemSlot: EquipSlot | undefined;
  /** The player's enchanting skill, for the gain report. */
  skill: number;
  /** Explicit consent to DESTROY an existing enchant. Strict boolean true: a
   *  truthy non-boolean from an untrusted caller must never read as consent. */
  confirmReplace?: boolean;
}

export interface EnchantStart {
  ok: boolean;
  enchantId: string;
  /** The item id the target resolves to, when there is one. */
  itemId?: string;
  /** Every reagent line resolved against the bag, populated on EVERY arm,
   *  including the `already_enchanted` deny: the replace confirmation has to
   *  state the cost the player is about to pay. */
  reagents: ReagentStatus[];
  /** The enchant's own bonus, so the row can state it inline rather than as a
   *  vague "Enchanted" badge. */
  statBonus: EnchantStatBonus;
  reason?: EnchantDenyReason;
  /** True when the target already carries an enchant, so accepting destroys
   *  it. Set on the `already_enchanted` deny AND on a confirmed success. */
  replacing?: boolean;
  /** The enchant id that would be (or was) destroyed. The confirmation names
   *  THIS. Set whenever `replacing` is. */
  replacedEnchantId?: string;
  /** Skill this apply would teach, already clamped. */
  skillGain: number;
}

/** The reagent rows for an arbitrary reagent list against a bag. */
function reagentRows(
  inventory: readonly InvSlot[],
  reagents: readonly { itemId: string; count: number }[],
): ReagentStatus[] {
  return reagentStatusOf(inventory, reagents);
}

/** Resolve the target down to the item id and instance it names, or null when
 *  the target names nothing (an empty worn slot, an out-of-range bag index, an
 *  empty bag slot). Read-only. */
function resolveTarget(
  a: Pick<EnchantAttempt, 'target' | 'inventory' | 'worn'>,
): { itemId: string; instance: ItemInstance | undefined } | null {
  if (a.target.where === 'worn') {
    const itemId = a.worn?.itemId;
    if (itemId === undefined) return null;
    return { itemId, instance: a.worn?.instance };
  }
  const index = a.target.index;
  if (!Number.isInteger(index) || index < 0 || index >= a.inventory.length) return null;
  const slot = a.inventory[index];
  if (!slot || slot.count < 1) return null;
  return { itemId: slot.itemId, instance: slot.instance };
}

/**
 * The gate half. Validates one apply attempt and reports everything the UI
 * needs to render the row, the confirmation, and the deny. Never mutates
 * anything and never draws.
 *
 * Gate order is deliberate and matches upstream: target exists, the enchant
 * targets this item's slot, then the already-enchanted arm (the consent check
 * BEFORE the identical-id compare, so an unconfirmed same-id apply reads
 * `already_enchanted` rather than `same_enchant`), then reagents.
 */
export function beginEnchant(a: EnchantAttempt): EnchantStart {
  const enchant = a.enchant;
  const reagents = reagentRows(a.inventory, enchant.reagents);
  const start: EnchantStart = {
    ok: false,
    enchantId: enchant.id,
    reagents,
    statBonus: { ...enchant.statBonus },
    skillGain: enchantSkillGain(a.skill, enchant),
  };

  const target = resolveTarget(a);
  if (!target) {
    start.reason = 'not_held';
    return start;
  }
  start.itemId = target.itemId;

  // The slot gate. Our `EquipSlot` members are eight distinct kinds, so an
  // item's declared slot and an enchant's `itemSlot` compare directly with no
  // "either finger" indirection.
  if (a.targetItemSlot === undefined || a.targetItemSlot !== enchant.itemSlot) {
    start.reason = 'wrong_slot';
    return start;
  }
  // A worn target must also actually be worn in the slot the enchant targets,
  // or the client named a slot that cannot be holding this item.
  if (a.target.where === 'worn' && a.target.slot !== enchant.itemSlot) {
    start.reason = 'wrong_slot';
    return start;
  }

  if (isEnchantedInstance(target.instance)) {
    start.replacing = true;
    start.replacedEnchantId = target.instance?.enchant;
    if (a.confirmReplace !== true) {
      start.reason = 'already_enchanted';
      return start;
    }
    if (target.instance?.enchant === enchant.id) {
      // Refused even WITH consent: the accept would burn the reagents and
      // change nothing at all.
      start.reason = 'same_enchant';
      return start;
    }
  }

  if (!reagents.every((r) => r.met)) {
    start.reason = 'insufficient_materials';
    return start;
  }

  start.ok = true;
  return start;
}

/**
 * The exact instance one apply mints from the copy it targets: the target's
 * payload cloned, the enchant's bonus summed ADDITIVELY into `rolled.stats`,
 * and the marker set. A masterwork copy's baked bonus, the maker's signature,
 * `craftedRecipeId` and `boundTo` all ride through the clone untouched, so
 * enchanting a crafted or masterwork piece never erases what makes it that
 * piece. Never used on an already-enchanted copy (that is
 * `replacedEnchantInstanceFor`'s job), so it can never stack one enchant on
 * another.
 */
export function enchantedInstanceFor(
  target: ItemInstance | undefined,
  enchant: EnchantDef,
): ItemInstance {
  const merged: ItemInstance = target ? cloneItemInstance(target) : {};
  const stats: Record<string, number> = { ...merged.rolled?.stats };
  for (const [stat, value] of Object.entries(enchant.statBonus)) {
    if (value === undefined) continue;
    stats[stat] = (stats[stat] ?? 0) + value;
  }
  merged.rolled = { ...merged.rolled, stats };
  merged.enchant = enchant.id;
  return merged;
}

/**
 * The exact instance the destructive replace mints: the victim cloned, the OLD
 * enchant's bonus subtracted per stat, and the new one added on top, so ONLY
 * the enchant layer changes and the signature, masterwork bonus,
 * `craftedRecipeId` and `boundTo` survive byte-identical.
 *
 * A stat that reaches zero is DELETED rather than kept at 0: a present
 * zero-valued key is structurally distinct from an absent one, so leaving
 * residue would make an otherwise identical copy compare differently. The
 * `<= 0` arm also swallows a corrupt over-large baked value instead of minting
 * a negative stat.
 *
 * `old` must be the resolved def of the victim's marker id. When it cannot be
 * resolved the caller must refuse rather than call this: subtracting nothing
 * would silently stack the old bonus under the new one.
 */
export function replacedEnchantInstanceFor(
  victim: ItemInstance,
  old: EnchantDef,
  next: EnchantDef,
): ItemInstance {
  const merged = cloneItemInstance(victim);
  const stats: Record<string, number> = { ...merged.rolled?.stats };
  for (const [stat, value] of Object.entries(old.statBonus)) {
    if (value === undefined) continue;
    const remain = (stats[stat] ?? 0) - value;
    if (remain > 0) stats[stat] = remain;
    else delete stats[stat];
  }
  for (const [stat, value] of Object.entries(next.statBonus)) {
    if (value === undefined) continue;
    stats[stat] = (stats[stat] ?? 0) + value;
  }
  merged.rolled = { ...merged.rolled, stats };
  merged.enchant = next.id;
  return merged;
}

export interface EnchantResolution {
  ok: boolean;
  enchantId: string;
  itemId?: string;
  reason?: EnchantDenyReason;
  /** Which arm ran, so the caller knows where to put `instance`. */
  applied?: 'worn' | 'bag';
  /**
   * The minted payload. On the BAG arm it has already been written into the
   * bag; on the WORN arm the caller assigns it to `equipmentInstance[slot]`
   * and re-bakes stats (this module never touches equipment, which is not its
   * to hold).
   */
  instance?: ItemInstance;
  /** True when an existing enchant was destroyed to make room. */
  replaced?: boolean;
  /** The enchant id that was destroyed. Set iff `replaced` is. */
  replacedEnchantId?: string;
  /** What the apply actually removed from the bag. */
  consumed: { itemId: string; count: number }[];
  skillGain: number;
  nextSkill: number;
}

/**
 * Apply (or, with consent, replace) one enchant. Re-runs every gate, so a
 * denial here consumes nothing and mints nothing. DRAWS NOTHING on any path:
 * enchanting has no randomness at all.
 *
 * `resolveEnchantDef` resolves the victim's marker id when a replace is in
 * play. Returning `undefined` from it (a marker id that no longer names an
 * enchant, reachable only from a hand-edited save) refuses the replace rather
 * than stacking an unsubtractable bonus.
 */
export function resolveEnchant(
  a: EnchantAttempt,
  resolveEnchantDef?: (id: string) => EnchantDef | undefined,
): EnchantResolution {
  const start = beginEnchant(a);
  const base: EnchantResolution = {
    ok: false,
    enchantId: a.enchant.id,
    itemId: start.itemId,
    consumed: [],
    skillGain: 0,
    nextSkill: Math.max(0, a.skill),
  };
  if (!start.ok) return { ...base, reason: start.reason };

  const target = resolveTarget(a);
  // Unreachable: `beginEnchant` already proved the target resolves. Kept as
  // the honest deny for a torn state rather than a crash.
  if (!target) return { ...base, reason: 'not_held' };

  // Resolve the replace victim's old def BEFORE anything is consumed.
  let old: EnchantDef | undefined;
  if (start.replacing) {
    const oldId = target.instance?.enchant;
    old = oldId !== undefined ? resolveEnchantDef?.(oldId) : undefined;
    if (!old) return { ...base, reason: 'already_enchanted' };
  }

  const consumed: { itemId: string; count: number }[] = [];
  for (const reagent of a.enchant.reagents) {
    const removed = removeFromSlots(a.inventory, reagent.itemId, reagent.count);
    consumed.push({ itemId: reagent.itemId, count: removed.removed });
  }

  const instance =
    old !== undefined && target.instance
      ? replacedEnchantInstanceFor(target.instance, old, a.enchant)
      : enchantedInstanceFor(target.instance, a.enchant);

  if (a.target.where === 'bag') {
    // Take exactly the targeted copy out of exactly the targeted slot (never
    // `removeFromSlots`, whose plain-stacks-first order would be free to pick a
    // different copy of the same item id), then add the enchanted copy back.
    // The instance is already a deep clone, so a surviving stack's payload is
    // never aliased into the new copy.
    //
    // The index is re-read here rather than cached because the reagent
    // consumption above may have spliced earlier slots out of the array. It is
    // re-found by identity against the pre-consumption slot, which is exact.
    removeOneAt(a.inventory, a.target.index, target.itemId);
    addToSlots(a.inventory, target.itemId, 1, instance);
  }

  const skillGain = enchantSkillGain(a.skill, a.enchant);
  const result: EnchantResolution = {
    ok: true,
    enchantId: a.enchant.id,
    itemId: target.itemId,
    applied: a.target.where,
    instance,
    consumed,
    skillGain,
    nextSkill: Math.max(0, a.skill) + skillGain,
  };
  if (start.replacing) {
    result.replaced = true;
    result.replacedEnchantId = start.replacedEnchantId;
  }
  return result;
}

/**
 * Remove ONE unit of `itemId` from the bag slot the caller targeted.
 *
 * The reagent consumption that runs before this can splice slots out of the
 * array, so `index` may no longer point at the intended slot. Rather than
 * cache a reference (which a splice does not invalidate but a stack merge
 * could), the walk re-finds the target: it prefers the original index when
 * that slot still holds `itemId`, and otherwise falls back to the last slot
 * holding it. A reagent list that contains the target item itself is the only
 * way the first arm misses, and in that case any remaining copy is equivalent
 * by construction.
 */
function removeOneAt(inventory: InvSlot[], index: number, itemId: string): void {
  let at = index >= 0 && index < inventory.length && inventory[index].itemId === itemId ? index : -1;
  if (at < 0) {
    for (let i = inventory.length - 1; i >= 0; i--) {
      if (inventory[i].itemId === itemId) {
        at = i;
        break;
      }
    }
  }
  if (at < 0) return;
  inventory[at].count -= 1;
  if (inventory[at].count <= 0) inventory.splice(at, 1);
}

// ---------------------------------------------------------------------------
// Disenchant
// ---------------------------------------------------------------------------

/** The universal ladder material a disenchant yields, keyed by the destroyed
 *  piece's quality. Ported from upstream unchanged. */
export const DISENCHANT_MATERIAL_BY_QUALITY: Readonly<Record<string, string>> = Object.freeze({
  poor: 'arcane_dust',
  common: 'arcane_dust',
  uncommon: 'arcane_dust',
  rare: 'arcane_essence',
  epic: 'arcane_shard',
  legendary: 'arcane_shard',
});

/** Armor class -> its resonant weave. Ported from upstream unchanged. */
export const ARMOR_SECONDARY_BY_CLASS: Readonly<Record<string, string>> = Object.freeze({
  cloth: 'resonant_thread',
  leather: 'resonant_hide',
  mail: 'resonant_links',
});

/** The caster weapon weave and the melee one. */
export const WEAPON_SECONDARY_CASTER = 'resonant_timber';
export const WEAPON_SECONDARY_MELEE = 'resonant_steel';

/** Typed secondaries only drop from these qualities. */
const TYPED_SECONDARY_QUALITIES = new Set(['rare', 'epic', 'legendary']);

const QUALITY_ORDER: readonly NonNullable<ItemDef['quality']>[] = [
  'poor',
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/** The def facts one disenchant needs. Passed in rather than looked up, so
 *  this module never imports `ITEMS`. */
export interface DisenchantInput {
  itemId: string;
  kind: ItemDef['kind'];
  quality?: ItemDef['quality'];
  armorType?: ItemDef['armorType'];
  /** The def's own stats, used to infer an armor class when `armorType` is
   *  absent and to tell a caster weapon from a melee one. */
  stats?: EnchantStatBonus;
  /** The level the piece gates at (`requiredLevelFor` at the call site). The
   *  yield scales with it. */
  itemLevel: number;
}

/** Eligible for disenchant: an equippable weapon or armor piece of at least
 *  `common` quality. Ported from upstream unchanged. */
export function isDisenchantable(input: DisenchantInput): boolean {
  return (
    (input.kind === 'weapon' || input.kind === 'armor') &&
    !!input.quality &&
    input.quality !== 'poor'
  );
}

/**
 * The armor class of an armor piece.
 *
 * ADAPTED. Upstream reads `def.armorType` and gives up when it is absent. In
 * OUR content that field is set on eight items out of 271, so a pure
 * `armorType` read would leave the typed secondary essentially dead. What our
 * itemization DOES have, consistently across every set, is a stat signature per
 * armor class: cloth pieces carry int and/or spi, leather carries agi, and mail
 * carries only str and sta. The explicit field still wins wherever it is set;
 * the inference is the fallback that makes the rule apply to the whole
 * wardrobe rather than a handful of gloves.
 */
export function armorClassFor(input: DisenchantInput): 'cloth' | 'leather' | 'mail' | null {
  if (input.armorType) return input.armorType;
  const stats = input.stats;
  if (!stats) return null;
  if ((stats.int ?? 0) > 0 || (stats.spi ?? 0) > 0) return 'cloth';
  if ((stats.agi ?? 0) > 0) return 'leather';
  if ((stats.str ?? 0) > 0 || (stats.sta ?? 0) > 0 || (stats.armor ?? 0) > 0) return 'mail';
  return null;
}

/**
 * The typed secondary material one disenchant of this piece yields, or null
 * when the piece is below `rare` (sub-rare yields only the ladder material) or
 * carries no inferable type.
 *
 * Weapons split caster from melee. Upstream keys that off a weapon-family table
 * (staff / wand / bow / crossbow yield timber, everything else steel); we have
 * no weapon-family classification at all, only a `weapon.dagger` flag, so the
 * split reads the same stat signature the armor arm does: a weapon carrying int
 * is a staff or scepter and yields timber, anything else yields steel. That
 * reproduces upstream's partition exactly on our content, where every caster
 * weapon carries int and no melee weapon does.
 */
export function typedSecondaryFor(input: DisenchantInput): string | null {
  if (!input.quality || !TYPED_SECONDARY_QUALITIES.has(input.quality)) return null;
  if (input.kind === 'armor') {
    const armorClass = armorClassFor(input);
    return armorClass ? ARMOR_SECONDARY_BY_CLASS[armorClass] : null;
  }
  if (input.kind === 'weapon') {
    return (input.stats?.int ?? 0) > 0 ? WEAPON_SECONDARY_CASTER : WEAPON_SECONDARY_MELEE;
  }
  return null;
}

/**
 * The guaranteed number of ladder material a disenchant yields, before the one
 * bonus draw.
 *
 * Sub-rare rides upstream's `qualityIndex + floor(level / 10) + 1`, so a
 * level-20 uncommon breaks down into more dust than a level-1 common. Rare and
 * above is pinned at 1, upstream's rule and the thing that makes an essence and
 * a shard scarce: one epic disenchants to one shard, and a shard is the only
 * way to buy a Greater enchant.
 */
export function baseDisenchantYield(quality: ItemDef['quality'], itemLevel: number): number {
  const q = quality ?? 'common';
  if (TYPED_SECONDARY_QUALITIES.has(q)) return 1;
  const qualityIdx = Math.max(0, QUALITY_ORDER.indexOf(q));
  const tierBonus = Math.floor(Math.max(0, itemLevel) / 10);
  return qualityIdx + tierBonus + 1;
}

/** How many typed secondaries a rare-or-better piece gives up. Draw-free, so
 *  the confirmation preview states an exact number rather than a range. */
export function secondaryDisenchantCount(quality: ItemDef['quality']): number {
  return quality === 'rare' ? 1 : 2;
}

/**
 * The full, draw-free preview of one disenchant, which is what the destructive
 * confirmation shows before the player agrees to break the item. Returns null
 * for a piece that cannot be disenchanted at all.
 */
export function previewDisenchant(input: DisenchantInput): DisenchantPlan | null {
  if (!isDisenchantable(input)) return null;
  const quality = input.quality ?? 'common';
  const materialItemId = DISENCHANT_MATERIAL_BY_QUALITY[quality] ?? 'arcane_dust';
  const min = baseDisenchantYield(quality, input.itemLevel);
  const plan: DisenchantPlan = { materialItemId, minCount: min, maxCount: min + 1 };
  const secondaryItemId = typedSecondaryFor(input);
  if (secondaryItemId) {
    plan.secondaryItemId = secondaryItemId;
    plan.secondaryCount = secondaryDisenchantCount(quality);
  }
  return plan;
}

export type DisenchantDenyReason = 'not_held' | 'not_disenchantable';

export interface DisenchantAttempt {
  /** The def facts of the piece to destroy. */
  item: DisenchantInput;
  /** The bag slot holding it. Disenchanting is bag-only on purpose: destroying
   *  the piece you are wearing is not an action a player should be one confirm
   *  click away from, and unlike an enchant there is no in-place benefit to
   *  reaching the worn copy. */
  index: number;
  inventory: InvSlot[];
  /** The player's enchanting skill, for the gain report. */
  skill: number;
}

export interface DisenchantResolution {
  ok: boolean;
  itemId: string;
  reason?: DisenchantDenyReason;
  materialItemId?: string;
  count?: number;
  secondaryItemId?: string;
  secondaryCount?: number;
  skillGain: number;
  nextSkill: number;
}

/**
 * Destroy one bagged copy and grant its materials. EXACTLY ONE `rng.next()` on
 * success (the ladder material's +0/+1 bonus unit), ZERO on every denial.
 *
 * The draw is unconditional on the success path and always at the same
 * position, so the count never depends on the piece's quality.
 *
 * Upstream draws for the SECONDARY count on an epic and not at all on a rare,
 * which makes their disenchant draw count quality-dependent. Ours is one draw,
 * always, on the primary; the typed secondary count is fixed. That keeps the
 * draw contract a single sentence (matching wave 1's one-draw-per-completed-
 * action rule) and makes the confirmation preview exact on the secondary line.
 */
export function resolveDisenchant(a: DisenchantAttempt, rng: Rng): DisenchantResolution {
  const item = a.item;
  const base: DisenchantResolution = {
    ok: false,
    itemId: item.itemId,
    skillGain: 0,
    nextSkill: Math.max(0, a.skill),
  };
  if (!isDisenchantable(item)) return { ...base, reason: 'not_disenchantable' };
  const index = a.index;
  if (!Number.isInteger(index) || index < 0 || index >= a.inventory.length) {
    return { ...base, reason: 'not_held' };
  }
  const slot = a.inventory[index];
  if (!slot || slot.itemId !== item.itemId || slot.count < 1) {
    return { ...base, reason: 'not_held' };
  }
  const plan = previewDisenchant(item);
  // Unreachable: `isDisenchantable` already passed.
  if (!plan) return { ...base, reason: 'not_disenchantable' };

  slot.count -= 1;
  if (slot.count <= 0) a.inventory.splice(index, 1);

  const count = plan.minCount + (rng.next() < 0.5 ? 0 : 1);
  addToSlots(a.inventory, plan.materialItemId, count);
  if (plan.secondaryItemId && plan.secondaryCount) {
    addToSlots(a.inventory, plan.secondaryItemId, plan.secondaryCount);
  }

  const skillGain = disenchantSkillGain(a.skill, item.quality);
  const result: DisenchantResolution = {
    ok: true,
    itemId: item.itemId,
    materialItemId: plan.materialItemId,
    count,
    skillGain,
    nextSkill: Math.max(0, a.skill) + skillGain,
  };
  if (plan.secondaryItemId && plan.secondaryCount) {
    result.secondaryItemId = plan.secondaryItemId;
    result.secondaryCount = plan.secondaryCount;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read helpers for the enchant picker
// ---------------------------------------------------------------------------

/** Every enchant that targets `slot`, grouped order first (base, runed,
 *  greater) then id-ascending, so the picker never reshuffles between runs. */
export function enchantsForSlot(
  slot: EquipSlot,
  table: Readonly<Record<string, EnchantDef>>,
): EnchantDef[] {
  const groupRank = { base: 0, runed: 1, greater: 2 } as const;
  return Object.values(table)
    .filter((e) => e.itemSlot === slot)
    .sort(
      (x, y) =>
        groupRank[x.group] - groupRank[y.group] || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    );
}

/** Whether the bag holds every reagent an enchant requires. */
export function hasEnchantReagents(
  inventory: readonly InvSlot[],
  enchant: EnchantDef,
): boolean {
  return enchant.reagents.every((r) => countItemInSlots(inventory, r.itemId) >= r.count);
}
