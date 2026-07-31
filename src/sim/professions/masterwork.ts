// The masterwork proc: the ONE piece of output-side randomness in crafting.
//
// Upstream's model, ported: a craft's output is otherwise fully deterministic
// (the old five-way output-quality roll is retired), and the single draw a
// successful craft makes decides whether that copy comes out a masterwork. A
// proc is ADD-ONLY: it bakes bonus stats on top of the recipe's declared
// output and can never downgrade it. The bake lands in
// `ItemInstance.rolled.stats` with `rolled.masterwork = true`, which
// `recalcPlayerStats` already sums on top of the item def's own stats.
//
// This module draws NOTHING itself. `crafting.ts` makes the one draw and hands
// the plain numbers in, exactly the way upstream splits it, so the draw's
// position in the world's rng stream is decided in one place and stays there.
//
// Pure leaf: no `Sim`, no `PlayerMeta`, no `ITEMS`, no content import. Every
// input is explicit (src/sim/professions/CLAUDE.md).

import type { EnchantStatBonus } from './types';

// ---------------------------------------------------------------------------
// Proc chance
// ---------------------------------------------------------------------------

// Ported verbatim from upstream's `masterwork.ts` tuning block (their design
// doc pins these as final-as-shipped): a base chance at recipe-tier parity, a
// small bump per craft tier above the recipe's own tier, a flat bonus when any
// consumed reagent carries a maker's signature, a bump for the tier of the
// materials used, and a hard cap.
//
// The one term NOT ported is upstream's MASTERWORK_SPECIALIZATION_CHANCE
// (+0.03): it keys off a specialization perk that only exists to differentiate
// ten crafts on their ring. We have four crafts and no perk system, so that
// term has nothing to read. Everything else is byte-identical, which keeps the
// at-cap ceiling meaningful: at skill 125 (tier 5) working a tier-3 recipe with
// signed tier-3 materials the proc reaches 0.03 + 0.02 + 0.02 + 0.03 = 0.10,
// so at-cap crafting is still the masterwork hunt upstream designed it to be.
export const MASTERWORK_BASE_CHANCE = 0.03;
export const MASTERWORK_PER_TIER_ABOVE_CHANCE = 0.01;
export const MASTERWORK_SIGNED_CHANCE = 0.02;
export const MASTERWORK_MATERIAL_TIER_CHANCE = 0.01;
export const MASTERWORK_CHANCE_CAP = 0.15;

export interface MasterworkChanceInput {
  /** The crafter's capability tier minus the recipe's own tier. Clamped below
   *  at 0 here, so crafting ABOVE your tier never subtracts from the base. */
  tiersAboveRecipe: number;
  /** At least one consumed reagent is an instance carrying a signature. ANY
   *  player's signature counts, the crafter's own included (upstream's
   *  2026-07-17 amendment): buying a gatherer's signed materials is worth as
   *  much to the proc as gathering your own. */
  signedReagent: boolean;
  /** The recipe's highest gathered-material tier, 0 for the starter Vale
   *  yields. A tier-0-only recipe feeds exactly 0, so the cheapest rung is
   *  unchanged by this term. */
  materialTier?: number;
}

/** The masterwork proc chance for one successful craft, in
 *  `[MASTERWORK_BASE_CHANCE, MASTERWORK_CHANCE_CAP]`. Pure sum of the tuning
 *  constants above, capped. Draw-free: the caller draws. */
export function masterworkProcChance(input: MasterworkChanceInput): number {
  const tiersAbove = Math.max(0, input.tiersAboveRecipe);
  const materialTier = Math.max(0, input.materialTier ?? 0);
  const chance =
    MASTERWORK_BASE_CHANCE +
    MASTERWORK_PER_TIER_ABOVE_CHANCE * tiersAbove +
    (input.signedReagent ? MASTERWORK_SIGNED_CHANCE : 0) +
    MASTERWORK_MATERIAL_TIER_CHANCE * materialTier;
  return Math.min(MASTERWORK_CHANCE_CAP, chance);
}

// ---------------------------------------------------------------------------
// The baked bonus
// ---------------------------------------------------------------------------

// Upstream bakes the bonus as the primary-stat budget DELTA between the item's
// own quality and one quality tier above it, computed by their
// `src/sim/item_budget.ts`.
//
// ADAPTED: this repo has no item-budget model at all, and says so at
// `src/sim/content/items.ts` ("No documented armor/stat budget exists ...
// balanced to the empirical convention"). Rather than invent one and have it
// disagree with 271 hand-authored items, the bonus is a FRACTION of the item's
// own stat profile. The fraction is read off our real ladder, where one quality
// rung is worth roughly a quarter to two fifths of the primary budget at the
// same level: at level 20 an uncommon mail chest carries 9 primary points and
// the rare above it 11 (x1.22), the rare 13 and the epic above it 18 (x1.38).
// One third sits inside that band and is the round number, so it is the one
// used. Redistribution is largest-remainder over the profile the item already
// has, so a masterwork amplifies an item's identity instead of reshaping it.
export const MASTERWORK_BONUS_FRACTION = 1 / 3;

/** The five primary attributes, in the fixed order the largest-remainder pass
 *  breaks ties on. `armor` is deliberately absent: it rides its own point
 *  scale (a level-20 chest carries 300 armor against 19 stamina), so folding
 *  it into one shared budget would hand the whole bonus to armor. */
export const MASTERWORK_PRIMARY_STATS = ['str', 'agi', 'sta', 'int', 'spi'] as const;

export interface MasterworkStatsInput {
  /** The output item def's own stats. */
  stats: EnchantStatBonus | undefined;
  /** Fraction of the profile to grant as bonus. Defaults to
   *  `MASTERWORK_BONUS_FRACTION`; a parameter so a test can pin the
   *  distribution without depending on the shipped tuning value. */
  fraction?: number;
}

/**
 * Bake one masterwork copy's bonus-stat record from the item's own profile:
 * `round(fraction * total primary points)` redistributed across the primary
 * stats the item actually has, largest-remainder, plus `round(fraction *
 * armor)` on the armor axis independently.
 *
 * The record is a DELTA, additive on top of the def's own stats, because
 * `recalcPlayerStats` sums an equipped instance's `rolled.stats` on top of the
 * def. Returns `null` when there is nothing to amplify (no stats, or a profile
 * whose bonus rounds away to nothing), which is what tells `crafting.ts` this
 * output cannot masterwork at all.
 *
 * Fully deterministic and draw-free: the same item def always bakes the same
 * record, which is what makes a masterwork replayable from a seed.
 */
export function masterworkBonusStats(input: MasterworkStatsInput): EnchantStatBonus | null {
  const stats = input.stats;
  if (!stats) return null;
  const fraction = input.fraction ?? MASTERWORK_BONUS_FRACTION;
  if (!(fraction > 0)) return null;

  const out: EnchantStatBonus = {};

  // Armor first, on its own scale.
  const armor = stats.armor ?? 0;
  if (armor > 0) {
    const bonusArmor = Math.round(fraction * armor);
    if (bonusArmor > 0) out.armor = bonusArmor;
  }

  // Primaries: one shared budget, largest-remainder over the existing profile.
  const profile: { stat: (typeof MASTERWORK_PRIMARY_STATS)[number]; value: number }[] = [];
  let total = 0;
  for (const stat of MASTERWORK_PRIMARY_STATS) {
    const value = stats[stat] ?? 0;
    if (value > 0) {
      profile.push({ stat, value });
      total += value;
    }
  }
  if (profile.length > 0 && total > 0) {
    const budget = Math.round(fraction * total);
    if (budget > 0) {
      // Floor each share, then hand the leftover out by descending remainder.
      // Ties break on the fixed MASTERWORK_PRIMARY_STATS order (the profile is
      // built in that order and the sort below is stable), so the bake is
      // reproducible byte for byte.
      const shares = profile.map((p) => {
        const exact = (budget * p.value) / total;
        const base = Math.floor(exact);
        return { stat: p.stat, base, remainder: exact - base };
      });
      let assigned = shares.reduce((sum, s) => sum + s.base, 0);
      const byRemainder = shares.map((s, i) => ({ i, remainder: s.remainder }));
      byRemainder.sort((a, b) => b.remainder - a.remainder || a.i - b.i);
      for (const entry of byRemainder) {
        if (assigned >= budget) break;
        shares[entry.i].base += 1;
        assigned += 1;
      }
      for (const share of shares) {
        if (share.base > 0) out[share.stat] = share.base;
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}
