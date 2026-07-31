// Fishing: the bite minigame plus the proficiency ladder that shifts the catch
// table. This is a LAYER over the fishing that already exists in `sim.ts`
// (`startFishing`/`completeFishing`), not a replacement for it: the host still
// owns the water check, the cast machinery and the actual item grant. What is
// new is the hidden bite moment inside the cast, the reel window a better rod
// widens, and a proficiency band that reweights which zone table row lands.
//
// One fishing session, and where each function fits:
//
//   1. the host validates (alive, out of combat, not swimming, facing fishable
//      water) and confirms tackle in the bags via `hasFishingImplement`
//   2. the host starts the fishing cast, then calls `rollBiteSchedule` for the
//      ONE hidden seeded bite delay and stores it as hidden tick state
//   3. at the bite tick the host emits the bite cue and arms the reel window
//   4. the player re-presses the rod. `resolveReel` says whether that landed
//      inside the window; too early or too late and the fish escapes
//   5. on a landed reel the host calls `resolveFishingCatch`, which makes ONE
//      more draw against the band's table and returns the catch plus the
//      proficiency delta
//
// Draw contract: a session draws once at cast start (the bite delay) and once
// more on a landed reel (the table). A miss stays at one. Every deny arm and
// band selection is pure state and draws nothing, so a denial never shifts the
// world's rng stream.
//
// Pure and host-agnostic: no `Sim` import, no `ITEMS`, no content import.

import type { Rng } from '../rng';
import { applyProficiencyGain, capabilityTierFor, tierProgressMultiplier } from './mastery';
import { proficiencyBandFor } from './proficiency_bands';
import { BARE_HANDS_TOOL_TIER } from './tools';
import type { FishingBandTables, FishingEntry } from './types';

// ---------------------------------------------------------------------------
// The bite minigame
// ---------------------------------------------------------------------------

// Ported verbatim from upstream, all in seconds. The hidden bite delay is ONE
// seeded draw in [MIN, effMax]; a better rod (tier above 1) pulls effMax down
// by ROD_REDUCTION per tier and never moves MIN, so tier 2 covers [3, 6.5] and
// tier 3 covers [3, 5]. The reel window opens at the bite and lasts WINDOW plus
// ROD_BONUS per rod tier above 1, so a tier-3 rod reaches 4.5 s.
export const FISH_BITE_DELAY_MIN_SEC = 3;
export const FISH_BITE_DELAY_MAX_SEC = 8;
export const FISH_BITE_DELAY_ROD_REDUCTION_SEC = 1.5;
export const FISH_REEL_WINDOW_SEC = 3;
export const FISH_REEL_WINDOW_ROD_BONUS_SEC = 0.75;

/** The upper end of the bite-delay range for a rod of this tier, floored at the
 *  minimum so a very good rod can never invert the range. */
export function biteDelayMaxSec(rodTier: number): number {
  return Math.max(
    FISH_BITE_DELAY_MIN_SEC,
    FISH_BITE_DELAY_MAX_SEC -
      FISH_BITE_DELAY_ROD_REDUCTION_SEC * (Math.max(BARE_HANDS_TOOL_TIER, rodTier) - 1),
  );
}

/** How long the reel window stays open for a rod of this tier. Monotone in
 *  tier: a better rod is never a worse rod. */
export function reelWindowSec(rodTier: number): number {
  return (
    FISH_REEL_WINDOW_SEC +
    FISH_REEL_WINDOW_ROD_BONUS_SEC * (Math.max(BARE_HANDS_TOOL_TIER, rodTier) - 1)
  );
}

/** When the fish bites and how long the player then has, both measured in
 *  seconds from the moment the line went in. */
export interface BiteSchedule {
  biteAtSec: number;
  /** The LAST moment a reel still lands. Inclusive. */
  reelDeadlineSec: number;
}

/** Rolls one session's hidden bite schedule. Uses EXACTLY one `rng.next()`
 *  draw. The rod is read once, here, so a rod swapped mid-cast cannot retune a
 *  window that is already armed. */
export function rollBiteSchedule(rodTier: number, rng: Rng): BiteSchedule {
  const max = biteDelayMaxSec(rodTier);
  const biteAtSec = FISH_BITE_DELAY_MIN_SEC + rng.next() * (max - FISH_BITE_DELAY_MIN_SEC);
  return { biteAtSec, reelDeadlineSec: biteAtSec + reelWindowSec(rodTier) };
}

/** The same schedule expressed on the sim's tick clock, which is where the host
 *  actually stores it (hidden entity state, never a broadcast field: the bite
 *  moment must not leak to the client before the cue). `dt` is the sim's fixed
 *  step. Ceiling on both ends, so rounding never shortens the window. */
export function biteScheduleTicks(
  s: BiteSchedule,
  startTick: number,
  dt: number,
): { biteAtTick: number; reelDeadlineTick: number } {
  return {
    biteAtTick: startTick + Math.ceil(s.biteAtSec / dt),
    reelDeadlineTick: startTick + Math.ceil(s.reelDeadlineSec / dt),
  };
}

/** What one reel press did. Stable ids, never player text. */
export type ReelOutcome = 'too_early' | 'landed' | 'too_late';

/** Resolve a reel press `elapsedSec` after the line went in. Both boundaries
 *  are INCLUSIVE: a press exactly at the bite lands, and so does one exactly at
 *  the deadline. Pure, draw-free. */
export function resolveReel(s: BiteSchedule, elapsedSec: number): ReelOutcome {
  if (elapsedSec < s.biteAtSec) return 'too_early';
  if (elapsedSec > s.reelDeadlineSec) return 'too_late';
  return 'landed';
}

/** The tick-clock form of `resolveReel`, for a host that stored the schedule
 *  via `biteScheduleTicks`. Valid while `tick` is in
 *  `[biteAtTick, reelDeadlineTick]`; the escape fires at `reelDeadlineTick + 1`. */
export function resolveReelTick(
  biteAtTick: number,
  reelDeadlineTick: number,
  tick: number,
): ReelOutcome {
  if (tick < biteAtTick) return 'too_early';
  if (tick > reelDeadlineTick) return 'too_late';
  return 'landed';
}

// ---------------------------------------------------------------------------
// Catch band and the catch roll
// ---------------------------------------------------------------------------

/** The band a proficiency selects, relative to fishing's own ceiling. */
export function fishingBandFor(proficiency: number, maxSkill: number): 0 | 1 | 2 {
  return proficiencyBandFor(proficiency, maxSkill);
}

/**
 * The band actually used: `min(proficiency band, the best band the rod covers)`.
 * A rod of tier T covers band T - 1, so band 0 is always reachable (the simple
 * pole is tier 1). The rod cap is SILENT by design, matching upstream: no event
 * and no denial, the cast still lands, it just lands off a lower table. Pure
 * state, resolved before any draw, so it never moves the draw order.
 */
export function effectiveFishingBand(
  proficiency: number,
  rodTier: number,
  maxSkill: number,
): 0 | 1 | 2 {
  const byProficiency = fishingBandFor(proficiency, maxSkill);
  const byRod = Math.max(0, Math.min(2, Math.max(BARE_HANDS_TOOL_TIER, rodTier) - 1)) as 0 | 1 | 2;
  return Math.min(byProficiency, byRod) as 0 | 1 | 2;
}

/** Weighted pick over one catch table. Uses EXACTLY one `rng.next()` draw. A
 *  `null` result is the empty hook (nothing on the line). */
export function rollCatch(table: readonly FishingEntry[], rng: Rng): string | null {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  if (!(total > 0)) return null;
  let roll = rng.next() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) return entry.itemId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Proficiency gain
// ---------------------------------------------------------------------------

// ADAPTED, not ported. Upstream gives fishing a bespoke tapering schedule
// (1 / 0.5 / 0.1 / 0.02 at proficiency 50 / 100 / 150 / 200) and openly
// describes the last rung as "a thousands-of-catches journey by design" -- a
// long tail tuned for a much higher level cap and eleven realms of water. That
// does not fit a twenty-level game with four zones.
//
// Instead fishing rides the SAME four-state mastery curve as the other three
// gathering professions, scored against the tier of the water being fished
// rather than a node tier. Fishing keeps upstream's 200 ceiling (it is
// deliberately the deep skill) and gets a step of 50, so 200 / 50 again gives
// four rungs, one per zone, exactly like the nodes. The result is one curve
// across all four professions, and the zone-4 water is the only place a
// 150-plus angler still gains at full rate.
export const FISHING_GAIN_TIER_STEP = 50;

/** Base proficiency granted by one landed catch, before the curve. */
export const FISHING_BASE_GAIN = 1;

/** The player's fishing capability tier at a given proficiency. */
export function fishingCapabilityTier(proficiency: number): number {
  return capabilityTierFor(proficiency, FISHING_GAIN_TIER_STEP);
}

/** The four-state multiplier for fishing tier-`waterTier` water. */
export function fishingWaterGainMultiplier(proficiency: number, waterTier: number): number {
  return tierProgressMultiplier(
    fishingCapabilityTier(Math.max(0, proficiency)),
    Math.max(0, waterTier - 1),
  );
}

/**
 * The proficiency one landed catch grants, clamped against the ceiling.
 *
 * Junk (a soggy boot, a tangle of weed) stops teaching anything once the angler
 * has outgrown band 0 entirely: upstream's junk cutoff, re-derived off the band
 * ladder instead of its stale 100 literal so it tracks fishing's own ceiling.
 * An empty hook is not a catch and never reaches here.
 */
export function fishingCatchGain(
  proficiency: number,
  waterTier: number,
  isJunk: boolean,
  maxSkill: number,
): number {
  if (isJunk && fishingBandFor(proficiency, maxSkill) > 0) return 0;
  const raw = FISHING_BASE_GAIN * fishingWaterGainMultiplier(proficiency, waterTier);
  return applyProficiencyGain(proficiency, raw, maxSkill) - Math.max(0, proficiency);
}

// ---------------------------------------------------------------------------
// The landed-reel resolution
// ---------------------------------------------------------------------------

export interface FishingCatchAttempt {
  /** The three band tables for the water being fished. */
  tables: FishingBandTables;
  /** The water's tier (1..4), which rung of the mastery curve it sits on. */
  waterTier: number;
  proficiency: number;
  maxSkill: number;
  /** Best owned rod tier, floored at 1 (a plain pole still fishes). */
  rodTier: number;
  /** Whether a caught item id is junk-grade. The host supplies it, so this
   *  module never imports `ITEMS`. */
  isJunk: (itemId: string) => boolean;
}

export interface FishingCatchResolution {
  /** The caught item id, or null for an empty hook. */
  itemId: string | null;
  /** The band the roll actually used, for a client that wants to show it. */
  band: 0 | 1 | 2;
  /** Proficiency to add, already clamped. Zero for an empty hook, for outgrown
   *  junk, and at the cap. */
  skillGain: number;
  nextProficiency: number;
}

/**
 * Resolve one landed reel. Band selection happens first and draws nothing; then
 * EXACTLY one `rng.next()` draw picks the catch, so the draw order never
 * depends on the player's skill or rod.
 */
export function resolveFishingCatch(a: FishingCatchAttempt, rng: Rng): FishingCatchResolution {
  const band = effectiveFishingBand(a.proficiency, a.rodTier, a.maxSkill);
  const itemId = rollCatch(a.tables[band], rng);
  const skillGain =
    itemId === null ? 0 : fishingCatchGain(a.proficiency, a.waterTier, a.isJunk(itemId), a.maxSkill);
  return {
    itemId,
    band,
    skillGain,
    nextProficiency: Math.max(0, a.proficiency) + skillGain,
  };
}
