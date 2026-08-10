// Spirit, corpse run, and resurrection: the death loop's rules, as pure data.
//
// Dying used to be a teleport (`releaseSpirit` moved you to the graveyard at full
// health, no penalty). It is now a system:
//
//  1. You die. The body lies where it fell; `dead = true`, `ghost = false`. Nothing
//     else has happened yet, so an ad-rewarded revive still stands you up in place.
//  2. You release. The spirit leaves the body: `dead` stays true and `ghost` becomes
//     true. `corpsePos` records where the body is (when the body is somewhere a ghost
//     can walk back to), and the spirit rises at the graveyard of the zone it belongs
//     to, where the Spirit Healer waits.
//  3a. You run the spirit back and resurrect at the corpse: no penalty, half pools.
//  3b. Or you accept the Spirit Healer's resurrection at the graveyard: instant, but
//      you come back at a fifth of your pools with Resurrection Sickness.
//
// PURE + HOST-AGNOSTIC, exactly like `./unstuck` (the module this one is modelled
// on). It owns no state and reaches into no world: it maps flat inputs to flat
// decisions, draws ZERO randomness, and reads no wall clock. `sim.ts` composes it,
// performs the mutations, and emits the events.
//
// Player-visible text is the client's job. This module returns stable ids and
// numbers only; the UI renders them (`src/ui/ghost_feedback.ts`).

import { dungeonAt, isRiftPos, zoneAt } from './data';
import { type Aura, dist2d, type Stats, type Vec3 } from './types';

// ---------------------------------------------------------------------------
// Tuning. Change numbers HERE, never inline at a call site.
// ---------------------------------------------------------------------------

/**
 * A released spirit runs faster than the living and cannot be snared: the classic
 * ghost-run feel. Effective ghost speed is `RUN_SPEED * GHOST_RUN_MULT`, and it
 * REPLACES the ordinary speed multiplier rather than stacking with it (see
 * `Sim.moveSpeedMult`), so a slow that landed before death does not follow you.
 */
export const GHOST_RUN_MULT = 1.25;
/** How close the ghost must be to its corpse to resurrect there (yards). */
export const CORPSE_REZ_RANGE = 35;
/** How close the ghost must stand to the graveyard to reach its Spirit Healer (yards). */
export const SPIRIT_HEALER_RANGE = 12;
/** Fraction of max hp/mana a penalty-free corpse resurrection restores. */
export const RES_HP_FRACTION = 0.5;
/**
 * A Spirit Healer resurrection is the worse deal on purpose: it returns you at
 * only this much of your pools AND charges Resurrection Sickness, so running the
 * corpse is the rewarded choice.
 */
export const RES_HEALER_HP_FRACTION = 0.2;

/** Aura id + English name of the debuff a Spirit Healer resurrection applies. */
export const RESURRECTION_SICKNESS_ID = 'resurrection_sickness';
export const RESURRECTION_SICKNESS_NAME = 'Resurrection Sickness';
/** Classic resurrection sickness: -75% to all attributes. */
export const RES_SICKNESS_STAT_PCT = 0.75;
/** Level below which the sickness is waived entirely (classic res-sickness rule). */
export const RES_SICKNESS_MIN_LEVEL = 10;
/** Duration at `RES_SICKNESS_MIN_LEVEL`, and the per-level ramp / ceiling above it. */
export const RES_SICKNESS_BASE_SECONDS = 120;
export const RES_SICKNESS_PER_LEVEL_SECONDS = 60;
/** Twice the Unstuck ceiling: the Pale angel's bargain is the longer penalty. */
export const RES_SICKNESS_MAX_SECONDS = 10 * 60;

/**
 * The two sickness aura ids. `unstuck_sickness` is named here rather than
 * imported so this module stays a leaf (`./unstuck` and this one are both
 * consumed by `sim.ts`, and neither may depend on the other). Both are flat
 * `buff_allstats` drains and `recalcPlayerStats` sums every one of them, so a
 * player may only ever owe the most recent one: `applyDeathSickness` in `sim.ts`
 * drops the other before applying.
 */
export const SICKNESS_AURA_IDS: ReadonlySet<string> = new Set([
  RESURRECTION_SICKNESS_ID,
  'unstuck_sickness',
]);

// ---------------------------------------------------------------------------
// Resurrection Sickness
// ---------------------------------------------------------------------------

export interface ResurrectionSickness {
  id: string;
  /** Seconds. 0 means the level is under the waiver line and no debuff applies. */
  durationSeconds: number;
  /** Fraction of base attributes removed (0.75 = -75%). */
  statPct: number;
}

/**
 * Classic resurrection-sickness scaling, retargeted at our level 20 cap: waived
 * under level 10, two minutes at 10, +60s per level, capped at ten minutes (so a
 * capped character always eats the full ten). Deliberately the same SHAPE as
 * `unstuckSickness`, at twice the weight.
 */
export function resurrectionSickness(level: number): ResurrectionSickness {
  if (level < RES_SICKNESS_MIN_LEVEL) {
    return { id: RESURRECTION_SICKNESS_ID, durationSeconds: 0, statPct: 0 };
  }
  const scaled =
    RES_SICKNESS_BASE_SECONDS + (level - RES_SICKNESS_MIN_LEVEL) * RES_SICKNESS_PER_LEVEL_SECONDS;
  return {
    id: RESURRECTION_SICKNESS_ID,
    durationSeconds: Math.min(RES_SICKNESS_MAX_SECONDS, scaled),
    statPct: RES_SICKNESS_STAT_PCT,
  };
}

/**
 * Build the `Aura` the caller pushes onto the player before `recalcPlayerStats`.
 *
 * Our engine's `buff_allstats` is a FLAT additive across all five attributes, so a
 * true percentage is expressed as one negative flat value derived from the mean
 * base attribute, clamped so the SMALLEST base attribute never drops below 1.
 * This is the identical construction `unstuckSicknessAura` uses; the two must
 * weigh the same way or one of them silently becomes the cheaper death.
 *
 * `remaining` lets a relog restore resume the saved countdown instead of resetting
 * it. Returns null when the level waives the sickness.
 */
export function resurrectionSicknessAura(
  level: number,
  base: Stats,
  sourceId: number,
  remaining?: number,
): Aura | null {
  const sickness = resurrectionSickness(level);
  if (sickness.durationSeconds <= 0) return null;
  const left = remaining === undefined ? sickness.durationSeconds : remaining;
  if (left <= 0) return null;
  const attrs = [base.str, base.agi, base.sta, base.int, base.spi];
  const mean = attrs.reduce((a, b) => a + b, 0) / attrs.length;
  const smallest = Math.min(...attrs);
  const penalty = Math.max(0, Math.min(Math.round(sickness.statPct * mean), smallest - 1));
  return {
    id: RESURRECTION_SICKNESS_ID,
    name: RESURRECTION_SICKNESS_NAME,
    kind: 'buff_allstats',
    remaining: Math.min(left, sickness.durationSeconds),
    duration: sickness.durationSeconds,
    value: -penalty,
    sourceId,
    school: 'shadow',
  };
}

/**
 * Auras that survive a death or a resurrection reset. Both sicknesses qualify:
 * neither may be shed by dying, releasing, or relogging, which is the whole point
 * of a penalty. Every other aura clears. Used at every player death/respawn site
 * so the rule cannot drift apart between them.
 */
export function aurasSurvivingDeath(auras: readonly Aura[]): Aura[] {
  return auras.filter((a) => SICKNESS_AURA_IDS.has(a.id));
}

// ---------------------------------------------------------------------------
// Where the spirit rises, and whether the body is worth running back to
// ---------------------------------------------------------------------------

/**
 * The graveyard a spirit released at `pos` rises in. Identical to the rule
 * `unstuckGraveyardFor` follows (dying inside a dungeon surfaces you at the
 * graveyard of the zone the dungeon's DOOR sits in, dying outdoors at your own
 * zone's graveyard), because Unstuck must never reach a destination the death
 * loop does not already offer.
 *
 * A rift death is the exception the caller handles: the rift band's coordinates
 * are an instance plane rather than a place, so `sim.ts` resolves that graveyard
 * from the zone the TEAR opened in and passes the result straight through.
 */
export function graveyardFor(pos: { x: number; z: number }): { x: number; z: number } {
  const dungeon = dungeonAt(pos.x);
  return (dungeon ? zoneAt(dungeon.doorPos.x, dungeon.doorPos.z) : zoneAt(pos.x, pos.z)).graveyard;
}

/**
 * Whether a body that fell at `pos` leaves a corpse a ghost can actually run back
 * to. The overworld and dungeons do (the ghost walks, or walks back through the
 * door); a rift does NOT, because releasing ejects the spirit from an instance
 * whose floor is torn down behind it. A ghost with no corpse is never stranded:
 * it rises at the graveyard, which IS the Spirit Healer's reach.
 */
export function corpseIsRecoverable(pos: { x: number; z: number }): boolean {
  return !isRiftPos(pos.x);
}

// ---------------------------------------------------------------------------
// The two ways back, as one decision
// ---------------------------------------------------------------------------

/** Why a resurrection attempt was refused. Stable ids; the UI maps them to text. */
export type ResurrectDenyReason = 'not_ghost' | 'no_corpse' | 'corpse_too_far' | 'no_healer';

/** Everything the decision needs about one ghost this instant. */
export interface GhostSnapshot {
  dead: boolean;
  ghost: boolean;
  pos: Vec3;
  corpsePos: Vec3 | null;
  /** The graveyard whose Spirit Healer this spirit can reach, from `graveyardFor`. */
  graveyard: { x: number; z: number };
}

/** What the client may offer, and what the server re-checks before acting. */
export interface GhostOptions {
  /** Yards from the ghost to its body, or null when there is no body to run to. */
  corpseDistance: number | null;
  corpseInRange: boolean;
  spiritHealerInRange: boolean;
}

export function ghostOptions(s: GhostSnapshot): GhostOptions {
  const corpseDistance = s.corpsePos ? dist2d(s.pos, s.corpsePos) : null;
  return {
    corpseDistance,
    corpseInRange: corpseDistance !== null && corpseDistance <= CORPSE_REZ_RANGE,
    spiritHealerInRange:
      Math.hypot(s.pos.x - s.graveyard.x, s.pos.z - s.graveyard.z) <= SPIRIT_HEALER_RANGE,
  };
}

/** Server-authoritative gate for "resurrect at my corpse". */
export function corpseRezDenyReason(s: GhostSnapshot): ResurrectDenyReason | null {
  if (!s.dead || !s.ghost) return 'not_ghost';
  if (!s.corpsePos) return 'no_corpse';
  return ghostOptions(s).corpseInRange ? null : 'corpse_too_far';
}

/** Server-authoritative gate for "let the Spirit Healer raise me". */
export function healerRezDenyReason(s: GhostSnapshot): ResurrectDenyReason | null {
  if (!s.dead || !s.ghost) return 'not_ghost';
  return ghostOptions(s).spiritHealerInRange ? null : 'no_healer';
}
