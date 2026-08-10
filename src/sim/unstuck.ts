// Unstuck — the stationary-countdown recovery command (`/unstuck`).
//
// A player wedged in geometry, stranded on an unreachable ledge, or holding a
// spirit that cannot reach its corpse stands still for ten seconds and is then
// moved to the graveyard their death would have sent them to. Unstuck NEVER
// kills: a living player arrives alive with their pools intact, a dead player is
// revived on arrival. The price is Unstuck Sickness, the classic-era
// resurrection-sickness debuff (-75% to all attributes, level-scaled duration).
//
// Why the gates matter: without them this would be free travel (stand anywhere,
// teleport to a hub) and a combat escape (drop aggro at will). The countdown is
// therefore cancelled by ANY of: movement input, actually moving, taking damage,
// entering combat, being controlled, starting a cast/eat/drink/sit, a duel or
// arena or trade starting, changing area, or crossing the life/death line in
// either direction. Crossing that line matters most going alive -> dead: without
// it a pre-armed /unstuck would be a cheaper death loop than releasing.
//
// PURE + HOST-AGNOSTIC. This module owns no state and reaches into no world. It
// is a state machine over explicit inputs: `requestUnstuck` validates and mints a
// `PendingUnstuck`, `tickUnstuck` advances one already-minted attempt, and the
// caller (sim.ts) stores the state, performs the teleport through its own
// respawn path, and emits the events. It draws ZERO randomness and reads no wall
// clock: every time value is the caller's sim clock (`Sim.time`), so the same
// seed and the same inputs always produce the same outcome.
//
// Player-visible text is the client's job. This module returns stable reason ids
// and numbers only; the UI renders them (see the `unstuck.*` key list in the
// module docs / CLAUDE.md).

import { dungeonAt, zoneAt } from './data';
import { type Aura, DT, type Stats } from './types';

// ---------------------------------------------------------------------------
// Tuning. Change numbers HERE, never inline at a call site.
// ---------------------------------------------------------------------------

/** Stationary countdown the player must survive before the move happens. */
export const UNSTUCK_COUNTDOWN_SECONDS = 10;
/** Cooldown stamped on a *rejected or cancelled* attempt, so /unstuck spam is cheap to ignore. */
export const UNSTUCK_RETRY_COOLDOWN_SECONDS = 15;
/** Cooldown stamped on a *successful* move. Long enough that Unstuck is never a travel route. */
export const UNSTUCK_SUCCESS_COOLDOWN_SECONDS = 5 * 60;
/** Cooldown map key. Hidden system cooldown, not an ability. */
export const UNSTUCK_COOLDOWN_ID = 'system_unstuck';

/** Aura id + English name of the debuff a successful Unstuck applies. */
export const UNSTUCK_SICKNESS_ID = 'unstuck_sickness';
export const UNSTUCK_SICKNESS_NAME = 'Unstuck Sickness';
/** Classic resurrection sickness: -75% to all attributes. */
export const UNSTUCK_SICKNESS_STAT_PCT = 0.75;
/** Level below which the sickness is waived entirely (classic res-sickness rule). */
export const UNSTUCK_SICKNESS_MIN_LEVEL = 10;
/** Duration at `UNSTUCK_SICKNESS_MIN_LEVEL`, and the per-level ramp / ceiling above it. */
export const UNSTUCK_SICKNESS_BASE_SECONDS = 60;
export const UNSTUCK_SICKNESS_PER_LEVEL_SECONDS = 30;
export const UNSTUCK_SICKNESS_MAX_SECONDS = 5 * 60;

/** Horizontal / vertical drift (yards) tolerated before the attempt counts as moved. */
export const UNSTUCK_MOVE_TOLERANCE = 0.5;
export const UNSTUCK_VERTICAL_TOLERANCE = 0.25;
/** Residual speed (yards/sec) under which the player counts as standing still. */
const VELOCITY_EPS = 1e-4;
/** `combatTimer` below this still counts as "just fought" (matches the sim's own 5s window). */
const RECENT_COMBAT_SECONDS = 5;

// ---------------------------------------------------------------------------
// Reasons. Stable ids; the UI maps them to text.
// ---------------------------------------------------------------------------

export type UnstuckBlockedReason =
  | 'already_active'
  | 'cooldown'
  | 'combat'
  | 'controlled'
  | 'falling'
  | 'moving'
  | 'busy'
  | 'competitive'
  | 'trading';

export type UnstuckCancelReason =
  | 'moved'
  | 'damaged'
  | 'combat'
  | 'busy'
  | 'state_changed'
  | 'disconnected';

/** Which of the two outcomes a completed attempt produced. */
export type UnstuckOutcome = 'moved_to_graveyard' | 'revived_at_graveyard';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Everything the state machine needs to know about one player this tick. The
 * caller composes it from the `Entity` + `PlayerMeta`; keeping it a flat literal
 * is what makes this module testable without a `Sim`.
 */
export interface UnstuckSnapshot {
  /** Sim clock seconds (`Sim.time`). NEVER a wall clock. */
  time: number;
  pos: { x: number; y: number; z: number };
  level: number;
  dead: boolean;
  /**
   * Whether the dead player is a RELEASED SPIRIT rather than a body on the
   * ground. Optional (absent means "not a ghost") so a caller written before the
   * death loop existed keeps its exact behaviour. It matters only to
   * `motionBlock`: a corpse is frozen and its motion fields are stale forever, a
   * ghost genuinely walks, so the ghost is held to the living motion gates.
   */
  ghost?: boolean;
  inCombat: boolean;
  /** Seconds since the last combat event (the sim's `Entity.combatTimer`). */
  combatTimer: number;
  onGround: boolean;
  jumping: boolean;
  /** Horizontal+vertical speed magnitude, yards/sec. */
  speed: number;
  stunned: boolean;
  rooted: boolean;
  /** Mid-cast, mid-channel, eating, or drinking. */
  busy: boolean;
  sitting: boolean;
  /** Any movement key held (or a mobile stick off-centre) this tick. */
  moveInput: boolean;
  /** Being dragged by charge / follow / a fear. */
  forcedMovement: boolean;
  /** In a duel, an arena match, or standing on arena ground. */
  competitive: boolean;
  /** A trade window is open. */
  trading: boolean;
  /** Monotonic lifetime damage-taken counter; any increase cancels the attempt. */
  damageTaken: number;
  /** Remaining seconds on `UNSTUCK_COOLDOWN_ID`, 0 when ready. */
  cooldownRemaining: number;
  /**
   * Stable identity of the area the player stands in (zone id, or a dungeon /
   * arena instance key). Leaving it mid-countdown cancels the attempt.
   */
  areaKey: string;
}

/** The live attempt. The caller stores this (one per player) and hands it back each tick. */
export interface PendingUnstuck {
  startedAt: number;
  endsAt: number;
  origin: { x: number; y: number; z: number };
  areaKey: string;
  damageTaken: number;
  /** Highest whole second already announced, so `countdown` fires once per second. */
  lastAnnouncedSecond: number;
  /**
   * Whether the invoker was dead when the countdown began. Crossing the
   * life/death line IN EITHER DIRECTION cancels, so an attempt can never resolve
   * as the outcome the player did not ask for.
   */
  startedDead: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type UnstuckStartResult =
  | { ok: true; state: PendingUnstuck; seconds: number }
  | { ok: false; reason: UnstuckBlockedReason; seconds?: number; cooldownSeconds?: number };

/** What the caller must do to the world when an attempt completes. */
export interface UnstuckResolution {
  outcome: UnstuckOutcome;
  /** Graveyard ground position. The caller resolves y through its own terrain/collision path. */
  destination: { x: number; z: number };
  /** True when the player was dead and must be raised on arrival. */
  revive: boolean;
  sickness: UnstuckSickness;
  cooldownSeconds: number;
  /** Seconds the attempt actually took (always `UNSTUCK_COUNTDOWN_SECONDS` in practice). */
  duration: number;
  /** Straight-line yards travelled, for logging / telemetry. */
  distance: number;
}

export type UnstuckTickResult =
  | { phase: 'pending'; state: PendingUnstuck; countdown: number | null }
  | { phase: 'cancelled'; reason: UnstuckCancelReason; duration: number }
  | { phase: 'completed'; resolution: UnstuckResolution };

// ---------------------------------------------------------------------------
// Unstuck Sickness
// ---------------------------------------------------------------------------

export interface UnstuckSickness {
  id: string;
  /** Seconds. 0 means the level is under the waiver line and no debuff applies. */
  durationSeconds: number;
  /** Fraction of base attributes removed (0.75 = -75%). */
  statPct: number;
}

/**
 * Classic resurrection-sickness scaling, retargeted at our level 20 cap: waived
 * under level 10, one minute at 10, +30s per level, capped at five minutes (so a
 * capped character always eats the full five).
 */
export function unstuckSickness(level: number): UnstuckSickness {
  if (level < UNSTUCK_SICKNESS_MIN_LEVEL) {
    return { id: UNSTUCK_SICKNESS_ID, durationSeconds: 0, statPct: 0 };
  }
  const scaled =
    UNSTUCK_SICKNESS_BASE_SECONDS +
    (level - UNSTUCK_SICKNESS_MIN_LEVEL) * UNSTUCK_SICKNESS_PER_LEVEL_SECONDS;
  return {
    id: UNSTUCK_SICKNESS_ID,
    durationSeconds: Math.min(UNSTUCK_SICKNESS_MAX_SECONDS, scaled),
    statPct: UNSTUCK_SICKNESS_STAT_PCT,
  };
}

/**
 * Build the `Aura` the caller pushes onto the player before `recalcPlayerStats`.
 *
 * Our engine's `buff_allstats` is a FLAT additive applied to all five
 * attributes, so a true percentage is expressed as one negative flat value
 * derived from the mean base attribute. It is additionally clamped so the
 * player's SMALLEST base attribute never drops below 1: an attribute floored at
 * zero would turn the debuff into a divide-by-zero hazard downstream rather than
 * a penalty. Returns null when the level waives the sickness.
 */
export function unstuckSicknessAura(level: number, base: Stats, sourceId: number): Aura | null {
  const sickness = unstuckSickness(level);
  if (sickness.durationSeconds <= 0) return null;
  const attrs = [base.str, base.agi, base.sta, base.int, base.spi];
  const mean = attrs.reduce((a, b) => a + b, 0) / attrs.length;
  const smallest = Math.min(...attrs);
  const penalty = Math.max(0, Math.min(Math.round(sickness.statPct * mean), smallest - 1));
  return {
    id: UNSTUCK_SICKNESS_ID,
    name: UNSTUCK_SICKNESS_NAME,
    kind: 'buff_allstats',
    remaining: sickness.durationSeconds,
    duration: sickness.durationSeconds,
    value: -penalty,
    sourceId,
    school: 'shadow',
  };
}

// ---------------------------------------------------------------------------
// Destination
// ---------------------------------------------------------------------------

/**
 * The graveyard an Unstuck from `pos` lands on. Deliberately identical to the
 * sim's own death rule (`releaseSpirit`): inside a dungeon you surface at the
 * graveyard of the zone the dungeon's DOOR sits in, outdoors at your current
 * zone's graveyard. Matching it is what keeps Unstuck from being a shortcut the
 * death loop does not already offer.
 */
export function unstuckGraveyardFor(pos: { x: number; z: number }): { x: number; z: number } {
  const dungeon = dungeonAt(pos.x);
  return (dungeon ? zoneAt(dungeon.doorPos.x, dungeon.doorPos.z) : zoneAt(pos.x, pos.z))
    .graveyard;
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * A dead body is frozen: the sim runs no movement for it, so `onGround`,
 * `jumping`, and velocity keep whatever value they held at the instant of death
 * forever. Gating a corpse on them would strand exactly the player Unstuck
 * exists to rescue (dying mid-fall leaves `onGround` false permanently), so the
 * motion gates are skipped for the dead. The action gates still apply: our
 * death path already clears casting, sitting, charge, and follow.
 *
 * A released GHOST is the exception to that exception: it moves under its own
 * power, so its motion fields are live and it is held to the living gates. Without
 * this a spirit could /unstuck mid-run and mid-air.
 */
function motionBlock(s: UnstuckSnapshot): UnstuckBlockedReason | null {
  if (s.dead && !s.ghost) return null;
  if (!s.onGround || s.jumping) return 'falling';
  if (s.forcedMovement || s.speed > VELOCITY_EPS) return 'moving';
  return null;
}

/** Why this player may not START an attempt right now, or null when they may. */
export function unstuckBlockedReason(s: UnstuckSnapshot): UnstuckBlockedReason | null {
  if (s.inCombat || s.combatTimer < RECENT_COMBAT_SECONDS) return 'combat';
  if (s.stunned || s.rooted) return 'controlled';
  const motion = motionBlock(s);
  if (motion) return motion;
  if (s.busy || s.sitting) return 'busy';
  if (s.competitive) return 'competitive';
  if (s.trading) return 'trading';
  if (s.moveInput) return 'moving';
  return null;
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

/**
 * Validate a `/unstuck` request and mint the pending attempt.
 *
 * The caller stores `result.state` on the player and, on BOTH outcomes, stamps
 * `UNSTUCK_RETRY_COOLDOWN_SECONDS` on `UNSTUCK_COOLDOWN_ID` so a rejected
 * request cannot be re-spammed every tick.
 */
export function requestUnstuck(
  s: UnstuckSnapshot,
  active: PendingUnstuck | null,
): UnstuckStartResult {
  if (active) return { ok: false, reason: 'already_active' };
  if (s.cooldownRemaining > 0) {
    return {
      ok: false,
      reason: 'cooldown',
      cooldownSeconds: Math.max(1, Math.ceil(s.cooldownRemaining)),
    };
  }
  const blocked = unstuckBlockedReason(s);
  if (blocked) return { ok: false, reason: blocked };
  return {
    ok: true,
    seconds: UNSTUCK_COUNTDOWN_SECONDS,
    state: {
      startedAt: s.time,
      endsAt: s.time + UNSTUCK_COUNTDOWN_SECONDS,
      origin: { ...s.pos },
      areaKey: s.areaKey,
      damageTaken: s.damageTaken,
      lastAnnouncedSecond: UNSTUCK_COUNTDOWN_SECONDS,
      startedDead: s.dead,
    },
  };
}

/** Why a live attempt must be abandoned this tick, or null when it may continue. */
export function unstuckCancelReason(
  s: UnstuckSnapshot,
  state: PendingUnstuck,
): UnstuckCancelReason | null {
  if (s.damageTaken > state.damageTaken) return 'damaged';
  if (s.inCombat || s.combatTimer < RECENT_COMBAT_SECONDS) return 'combat';
  if (s.busy || s.sitting) return 'busy';
  if (
    s.moveInput ||
    Math.hypot(s.pos.x - state.origin.x, s.pos.z - state.origin.z) > UNSTUCK_MOVE_TOLERANCE ||
    Math.abs(s.pos.y - state.origin.y) > UNSTUCK_VERTICAL_TOLERANCE
  ) {
    return 'moved';
  }
  // Either direction across the life/death line invalidates the attempt: a living
  // player who died must take the ordinary death loop rather than a discounted
  // graveyard revive, and one who was raised mid-countdown no longer needs one.
  if (s.dead !== state.startedDead) return 'state_changed';
  if (s.stunned || s.rooted || motionBlock(s) !== null || s.competitive || s.trading) {
    return 'state_changed';
  }
  if (s.areaKey !== state.areaKey) return 'state_changed';
  return null;
}

/**
 * Advance one live attempt by a tick.
 *
 * `countdown` is non-null only on the tick a new whole second is reached, so the
 * caller emits exactly one countdown line per second. A `completed` result does
 * NOT mutate anything: the caller clears its stored state, teleports through its
 * own respawn path, applies the sickness aura, and stamps
 * `resolution.cooldownSeconds`.
 */
export function tickUnstuck(s: UnstuckSnapshot, state: PendingUnstuck): UnstuckTickResult {
  const cancelled = unstuckCancelReason(s, state);
  if (cancelled) {
    return { phase: 'cancelled', reason: cancelled, duration: Math.max(0, s.time - state.startedAt) };
  }
  // Half-a-tick of slack absorbs float drift in the accumulated sim clock, so a
  // 10.000s countdown never needs an 11th tick to fire.
  if (s.time + DT / 2 >= state.endsAt) {
    const destination = unstuckGraveyardFor(state.origin);
    return {
      phase: 'completed',
      resolution: {
        outcome: state.startedDead ? 'revived_at_graveyard' : 'moved_to_graveyard',
        destination,
        revive: state.startedDead,
        sickness: unstuckSickness(s.level),
        cooldownSeconds: UNSTUCK_SUCCESS_COOLDOWN_SECONDS,
        duration: Math.max(0, s.time - state.startedAt),
        distance: Math.hypot(destination.x - state.origin.x, destination.z - state.origin.z),
      },
    };
  }
  const seconds = Math.max(0, Math.ceil(state.endsAt - s.time - DT / 2));
  if (seconds > 0 && seconds < state.lastAnnouncedSecond) {
    return {
      phase: 'pending',
      state: { ...state, lastAnnouncedSecond: seconds },
      countdown: seconds,
    };
  }
  return { phase: 'pending', state, countdown: null };
}
