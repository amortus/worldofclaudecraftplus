// Node gathering: mining, logging and herbalism. The pure core behind the
// harvest command.
//
// Shape of one harvest, and the split this module exposes:
//
//   1. the player interacts with a node's ground object
//   2. `beginHarvest` runs the rng-FREE gates (tool owned, tool tier covers the
//      node, this player's own respawn timer has elapsed) and returns the cast
//      duration in seconds
//   3. the host starts a timed cast for that many seconds (`castTotal` /
//      `castRemaining` / a `castStart` emit)
//   4. on cast completion the host calls `resolveHarvest`, which makes EXACTLY
//      ONE rng draw (the material rarity) and returns the yield plus the
//      proficiency delta and the new respawn stamp
//
// Splitting on the cast boundary is what keeps the draw contract honest: every
// denial is rng-free and starts nothing, and a cast that is interrupted before
// completion never reaches step 4, so it costs neither a draw nor the node's
// respawn timer.
//
// Respawn is PER VIEWER: one player harvesting a node never blocks, delays, or
// resets another player's timer for the same node, so there is no gather rush
// and no node camping. The host holds a `Record<nodeId, readyAtSeconds>` per
// player and hands the entry in; this module never owns state.
//
// Pure and host-agnostic: no `Sim` import, no content import, no `ITEMS`. Every
// input is explicit and randomness arrives as an `Rng` parameter, never
// `Math.random`.

import type { Rng } from '../rng';
import { applyProficiencyGain, capabilityTierFor, tierProgressMultiplier } from './mastery';
import { proficiencyBandFor } from './proficiency_bands';
import { canGatherTier, NO_TOOL_OWNED } from './tools';
import type {
  GatherMaterialRow,
  GatherNodeDef,
  GatherNodeType,
  GatheringProficiency,
  GatheringProfessionId,
  MaterialRarity,
  PlayerProfessionSkill,
} from './types';
import { GATHERING_PROFESSION_IDS } from './types';

// ---------------------------------------------------------------------------
// Node type -> profession, and respawn tuning
// ---------------------------------------------------------------------------

/** Which profession works which node type, and how long that node stays spent
 *  for the player who worked it. Ported from upstream's `NODE_HARVEST_TABLE`
 *  (120 s across the board). */
export const NODE_HARVEST_TABLE: Record<
  GatherNodeType,
  { professionId: GatheringProfessionId; respawnSeconds: number }
> = {
  ore: { professionId: 'mining', respawnSeconds: 120 },
  wood: { professionId: 'logging', respawnSeconds: 120 },
  herb: { professionId: 'herbalism', respawnSeconds: 120 },
};

export function professionForNodeType(type: GatherNodeType): GatheringProfessionId {
  return NODE_HARVEST_TABLE[type].professionId;
}

/** This player's own timer for this node has elapsed. `readyAt` is the sim
 *  clock (seconds) at or after which they may work it again; `undefined` means
 *  never worked, which is always ready. */
export function isNodeReady(readyAt: number | undefined, now: number): boolean {
  return readyAt === undefined || now >= readyAt;
}

// ---------------------------------------------------------------------------
// Proficiency gain: the four-state mastery curve
// ---------------------------------------------------------------------------

// Every GATHER_GAIN_TIER_STEP points of proficiency is one capability tier,
// scored against the node's own tier through the shared four-state curve.
//
// ADAPTED to our world. Upstream keeps the step at 25 over a 100-point ceiling,
// which yields capability tiers 0..4, and ships node tiers 1..3 spread across
// eleven realms. We keep the step and the ceiling exactly (so the curve's
// breakpoints are upstream's: a tier-1 node grays out at proficiency 75) but
// run node tiers 1..4, one per zone, because we have four zones and a level cap
// of 20. The result is a clean 25-points-per-zone climb: the Vale (t1) carries
// 0-75, Mirefen (t2) and Thornpeak (t3) overlap the middle, and the Ashen
// Wastes (t4) is the only place a maxed-out 75+ gatherer still gains at full
// rate. Nothing about the curve itself was re-tuned.
export const GATHER_GAIN_TIER_STEP = 25;

/** Base proficiency granted by one successful harvest, before the curve. */
export const GATHER_BASE_GAIN = 1;

/** The player's gathering capability tier at a given proficiency. */
export function gatherCapabilityTier(proficiency: number): number {
  return capabilityTierFor(proficiency, GATHER_GAIN_TIER_STEP);
}

/** The four-state multiplier for working a tier-`nodeTier` node at
 *  `proficiency`. A node of tier T sits on curve rung T - 1, so a tier-1 node
 *  (the bare starter rung) is the first to gray out. Deterministic, rng-free. */
export function gatherNodeGainMultiplier(proficiency: number, nodeTier: number): number {
  return tierProgressMultiplier(
    gatherCapabilityTier(Math.max(0, proficiency)),
    Math.max(0, nodeTier - 1),
  );
}

/** The proficiency one harvest actually grants, already clamped so it can never
 *  push the counter past the profession's ceiling. Returns 0 for a grayed-out
 *  node and 0 at the cap. */
export function gatherSkillGain(proficiency: number, nodeTier: number, maxSkill: number): number {
  const raw = GATHER_BASE_GAIN * gatherNodeGainMultiplier(proficiency, nodeTier);
  return applyProficiencyGain(proficiency, raw, maxSkill) - Math.max(0, proficiency);
}

// ---------------------------------------------------------------------------
// Material rarity roll
// ---------------------------------------------------------------------------

// Ported verbatim from upstream. Proficiency is clamped to this ceiling before
// weighting: points beyond it buy no further rarity odds.
export const MATERIAL_RARITY_MAX_PROFICIENCY = 100;

// At clamped proficiency p, each non-common tier's weight is p * its fixed
// share and common's weight is the remainder (MAX - p), so the total is always
// MATERIAL_RARITY_MAX_PROFICIENCY: at p = 0 the roll is 100% common, and as p
// rises weight moves linearly out of common into the four tiers above it in
// this fixed proportion. Every non-common tier's probability is therefore
// non-decreasing in proficiency ("more proficiency never hurts your odds"), and
// legendary stays rare even at the ceiling (2% at p = 100).
export const MATERIAL_RARITY_SHARE: Record<Exclude<MaterialRarity, 'common'>, number> = {
  uncommon: 0.6,
  rare: 0.3,
  epic: 0.08,
  legendary: 0.02,
};

/** Rolls one material rarity. Uses EXACTLY one `rng.next()` draw, so it
 *  composes with the sim's one-draw-per-roll convention. */
export function rollMaterialRarity(proficiency: number, rng: Rng): MaterialRarity {
  // NaN pins to 0 rather than surviving the clamp: every `NaN < w` comparison
  // below is false, so an unclamped NaN would fall through to legendary.
  const p = Number.isNaN(proficiency)
    ? 0
    : Math.max(0, Math.min(MATERIAL_RARITY_MAX_PROFICIENCY, proficiency));
  const weights: [MaterialRarity, number][] = [
    ['common', MATERIAL_RARITY_MAX_PROFICIENCY - p],
    ['uncommon', p * MATERIAL_RARITY_SHARE.uncommon],
    ['rare', p * MATERIAL_RARITY_SHARE.rare],
    ['epic', p * MATERIAL_RARITY_SHARE.epic],
    ['legendary', p * MATERIAL_RARITY_SHARE.legendary],
  ];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [tier, w] of weights) {
    if (roll < w) return tier;
    roll -= w;
  }
  return 'legendary'; // unreachable: the weights sum to `total`
}

// ---------------------------------------------------------------------------
// Gather cast timing
// ---------------------------------------------------------------------------

// Ported verbatim from upstream. The harvest is a short visible cast rather
// than an instant grant: base duration, shortened per owned tool tier ABOVE the
// node's tier (owning exactly the required tier buys nothing, since the gate
// already demands covering it) and modestly per proficiency band, floored.
export const GATHER_CAST_BASE_SEC = 2.5;
export const GATHER_CAST_FLOOR_SEC = 1.5;
export const GATHER_CAST_TOOL_TIER_REDUCTION_SEC = 0.4;
export const GATHER_CAST_BAND_REDUCTION_SEC = 0.15;

/** Duration of one gather cast, in seconds. No rng and no clamping surprises:
 *  `max(FLOOR, BASE - max(0, ownedTier - nodeTier) * TOOL_RED - band * BAND_RED)`.
 *  The host assigns this straight to `castTotal`/`castRemaining`. */
export function gatherCastDurationSec(nodeTier: number, ownedTier: number, band: 0 | 1 | 2): number {
  return Math.max(
    GATHER_CAST_FLOOR_SEC,
    GATHER_CAST_BASE_SEC -
      Math.max(0, ownedTier - nodeTier) * GATHER_CAST_TOOL_TIER_REDUCTION_SEC -
      band * GATHER_CAST_BAND_REDUCTION_SEC,
  );
}

// ---------------------------------------------------------------------------
// The two command halves
// ---------------------------------------------------------------------------

/** Why a harvest attempt was refused. Stable ids, never player text: the client
 *  renders its own localized line from the id plus `requiredTier`. */
export type GatherDenyReason = 'no_tool' | 'tool_tier' | 'not_ready';

export interface GatherAttempt {
  node: GatherNodeDef;
  /** The player's proficiency in the node's profession. */
  proficiency: number;
  /** That profession's ceiling, used for the band the cast duration reads. */
  maxSkill: number;
  /** Best owned tool tier for that profession, `NO_TOOL_OWNED` when none. */
  toolTier: number;
  /** This player's stored respawn stamp for this node, if any. */
  readyAt: number | undefined;
  /** The sim clock, in seconds. */
  now: number;
}

export interface GatherStart {
  ok: boolean;
  professionId: GatheringProfessionId;
  /** The node's tier, i.e. the tool tier it demands. Always populated, so a
   *  denial can say what is missing and a tooltip can show the requirement. */
  requiredTier: number;
  reason?: GatherDenyReason;
  /** Set when `ok`: the cast length in seconds. */
  castSeconds?: number;
  /** Set on `not_ready`: seconds still to wait, for a countdown tooltip. */
  readyInSec?: number;
}

/**
 * The rng-free half. Validates one player's attempt on one node and, when it
 * passes, returns the cast duration. Never mutates anything, never consumes the
 * respawn timer, and never draws.
 *
 * Gate order is deliberate and matches upstream: tool ownership first (gathering
 * ALWAYS requires a tool, so a bare-handed player is told to get one rather
 * than told the node is on cooldown), then tool tier, then the timer.
 */
export function beginHarvest(a: GatherAttempt): GatherStart {
  const professionId = professionForNodeType(a.node.type);
  const requiredTier = a.node.tier;
  if (a.toolTier === NO_TOOL_OWNED) {
    return { ok: false, professionId, requiredTier, reason: 'no_tool' };
  }
  if (!canGatherTier(a.toolTier, requiredTier)) {
    return { ok: false, professionId, requiredTier, reason: 'tool_tier' };
  }
  if (!isNodeReady(a.readyAt, a.now)) {
    return {
      ok: false,
      professionId,
      requiredTier,
      reason: 'not_ready',
      readyInSec: Math.max(0, (a.readyAt as number) - a.now),
    };
  }
  const band = proficiencyBandFor(a.proficiency, a.maxSkill);
  return {
    ok: true,
    professionId,
    requiredTier,
    castSeconds: gatherCastDurationSec(requiredTier, a.toolTier, band),
  };
}

export interface HarvestResolution {
  granted: boolean;
  professionId: GatheringProfessionId;
  /** The material item id this harvest yields. */
  itemId: string;
  /** The rolled rarity. Drives the unit count, and is what colours the client's
   *  chat line (the item's own def quality is unchanged). */
  rarity: MaterialRarity;
  /** Units of `itemId` the harvest resolves to. The host may still truncate the
   *  actual grant to bag room; the resolution reports the full roll. */
  qty: number;
  /** Proficiency to add, already clamped against the ceiling. Zero for a
   *  grayed-out node or a maxed profession. */
  skillGain: number;
  /** The player's proficiency after `skillGain` is applied. */
  nextProficiency: number;
  /** Sim clock value to store as this player's respawn stamp for this node. */
  nextReadyAt: number;
}

/**
 * The rng half, called when the gather cast completes. Assumes `beginHarvest`
 * already passed; re-checking the timer here would double-charge a cast the
 * host has already committed to.
 *
 * Draw contract: EXACTLY one `rng.next()` per completed harvest, the material
 * rarity, regardless of the caller's bag state, so a full bag never shifts the
 * world's rng stream.
 */
export function resolveHarvest(
  a: GatherAttempt,
  material: GatherMaterialRow,
  rng: Rng,
): HarvestResolution {
  const professionId = professionForNodeType(a.node.type);
  const rarity = rollMaterialRarity(a.proficiency, rng);
  const skillGain = gatherSkillGain(a.proficiency, a.node.tier, a.maxSkill);
  return {
    granted: true,
    professionId,
    itemId: material.itemId,
    rarity,
    qty: material.qtyByRarity[rarity],
    skillGain,
    nextProficiency: Math.max(0, a.proficiency) + skillGain,
    nextReadyAt: a.now + NODE_HARVEST_TABLE[a.node.type].respawnSeconds,
  };
}

// ---------------------------------------------------------------------------
// Per-player proficiency record helpers
// ---------------------------------------------------------------------------

/** A fresh, all-zero proficiency record. */
export function emptyGatheringProficiency(): GatheringProficiency {
  const out = {} as GatheringProficiency;
  for (const id of GATHERING_PROFESSION_IDS) out[id] = 0;
  return out;
}

/**
 * Coerce an untrusted record (a persisted save row from before a profession
 * existed, or a wire payload) into a complete, finite, non-negative record.
 * Unknown keys are dropped and missing ones default to 0, so a pre-feature save
 * loads cleanly and a hand-edited one cannot inject a counter.
 */
export function normalizeGatheringProficiency(
  raw: Partial<Record<string, unknown>> | undefined,
  caps: Record<GatheringProfessionId, number>,
): GatheringProficiency {
  const out = emptyGatheringProficiency();
  if (!raw) return out;
  for (const id of GATHERING_PROFESSION_IDS) {
    const v = raw[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    out[id] = Math.min(v, caps[id]);
  }
  return out;
}

/** The read-only rows the "your professions" panel renders. Ids and numbers
 *  only: the client supplies every label. */
export function gatheringSkillsView(
  proficiency: GatheringProficiency,
  caps: Record<GatheringProfessionId, number>,
): PlayerProfessionSkill[] {
  return GATHERING_PROFESSION_IDS.map((professionId) => ({
    professionId,
    skill: proficiency[professionId] ?? 0,
    maxSkill: caps[professionId],
  }));
}
