// Ledge detection and the climb curve: can this body, mid-jump, get its hands
// on something above it and pull up, and what path does the pull-up take?
//
// This is the ladder's third rung (see `ladder.ts`). Everything here is a pure
// query against the collider set and heightfield sampler the CALLER supplies,
// so a climb can only ever start onto a surface the body could legitimately
// stand on: a standable prop top (crate, rock, cart, fence rail, low roof) or
// walkable terrain. It never grabs a full-height blocker, never grabs into an
// overhang, and never grabs a surface the body would not fit on.
//
// No rng, no wall clock.

import type { Collider } from '../colliders';
import {
  canStillVault,
  LEDGE_GRAB_FORWARD,
  LEDGE_HEADROOM,
  MAX_CLIMB_SLOPE,
  PLAYER_TRAVERSAL_BANDS,
  type TraversalBands,
} from './ladder';
import { isClearAt, supportTopAt } from './solver';
import { TOP_EPS } from './sweep';
import type { ColliderFilter, ColliderTopFn, GroundFn } from './types';

/**
 * Horizontal speed above which real motion, not facing, is the body's intent.
 * A body drifting sideways past a wall should not snap onto whatever it happens
 * to be looking at.
 */
const INTENT_SPEED = 0.5;

export interface LedgeGrab {
  /** Surface height the body climbs onto (world Y, yards). */
  topY: number;
  /** Where it ends up standing (world XZ, yards). */
  x: number;
  z: number;
}

export interface LedgeQuery {
  radius: number;
  /** Facing, sim convention: forward is `(sin f, cos f)`. */
  facing: number;
  /** Horizontal velocity; when meaningful it beats facing as the intent. */
  vx: number;
  vz: number;
  /** Vertical velocity, so a body still rising toward a vault is refused. */
  vy: number;
  /**
   * Candidates in the SAME frame as the probe point. Interiors are solved in
   * instance-local coordinates, so the caller converts before calling.
   */
  colliders: readonly Collider[];
  topOf: ColliderTopFn;
  /**
   * Heightfield sampler. Read ONLY when `steepnessAt` is also supplied, because
   * without a steepness reading a terrain ledge cannot be told from a cliff
   * face and declining beats guessing.
   */
  groundAt?: GroundFn;
  /** Terrain steepness (rise over run) at a point. See {@link groundAt}. */
  steepnessAt?: (x: number, z: number) => number;
  maxTerrainSteepness?: number;
  bands?: TraversalBands;
  ignore?: ColliderFilter;
}

/**
 * Find a ledge this airborne body can grab and climb onto, or null.
 *
 * The probe runs along the body's intent (velocity when it is moving with
 * purpose, otherwise where it is looking), one body radius plus a reach ahead.
 * Only a surface strictly higher than a step and no higher than the arms can
 * reach counts, it must clear `climbMinOverhead` above `launchFloorY` (below
 * that the body should simply vault, which is the ladder's middle seam), and
 * the body must actually fit where it would end up with room over its head and
 * a clear line to get there.
 *
 * Writes into `out` when given. Without it a fresh object is returned: a grab
 * outlives the call (the caller stores it for the whole climb), so a shared
 * module singleton would let two bodies grabbing in the same tick overwrite
 * each other's destination.
 */
export function findLedgeGrab(
  q: LedgeQuery,
  x: number,
  feetY: number,
  z: number,
  launchFloorY: number,
  out?: LedgeGrab,
): LedgeGrab | null {
  const bands = q.bands ?? PLAYER_TRAVERSAL_BANDS;
  const speed = Math.hypot(q.vx, q.vz);
  const dirX = speed > INTENT_SPEED ? q.vx / speed : Math.sin(q.facing);
  const dirZ = speed > INTENT_SPEED ? q.vz / speed : Math.cos(q.facing);

  const reach = q.radius + LEDGE_GRAB_FORWARD;
  const px = x + dirX * reach;
  const pz = z + dirZ * reach;
  const minY = feetY + bands.grabMin;
  const maxY = feetY + bands.grabMax;

  // The best surface under the hands: a standable prop top, or the terrain
  // itself where it steps up (a natural ledge or a bank).
  const propTop = supportTopAt(px, pz, q.colliders, q.topOf, maxY, q.ignore);
  let topY = -Infinity;
  if (propTop >= minY && propTop <= maxY) topY = propTop;
  if (q.steepnessAt && q.groundAt) {
    const ground = q.groundAt(px, pz);
    const limit = q.maxTerrainSteepness ?? MAX_CLIMB_SLOPE;
    if (ground > topY && ground >= minY && ground <= maxY && q.steepnessAt(px, pz) <= limit) {
      topY = ground;
    }
  }
  if (topY === -Infinity) return null;

  // The ladder's middle seam: anything the jump arc already carries the body
  // over is vaulted, never climbed.
  if (topY - launchFloorY < bands.climbMinOverhead) return null;
  // And never grab something the body is still on course to clear unaided.
  if (canStillVault(feetY, q.vy, topY, bands)) return null;

  // The body must fit where it is going to end up, with room over its head.
  // `blocksAt` already carries TOP_EPS, so these are evaluated at the surface
  // and at head height exactly.
  if (!isClearAt(px, pz, q.radius, topY, q.colliders, q.topOf, q.ignore)) return null;
  if (!isClearAt(px, pz, q.radius, topY + LEDGE_HEADROOM, q.colliders, q.topOf, q.ignore)) {
    return null;
  }
  // And it must be able to GET there. The climb curve owns the body's position
  // outright, so anything standing between the body and the rim would be pulled
  // straight through. With today's reach (one body diameter) the midpoint sits
  // exactly one radius from the endpoint, so all but a razor-thin blocker is
  // already caught above; this is the cheap insurance that keeps the guarantee
  // true if the reach ever grows.
  if (!isClearAt((x + px) / 2, (z + pz) / 2, q.radius, topY, q.colliders, q.topOf, q.ignore)) {
    return null;
  }

  const res: LedgeGrab = out ?? { topY: 0, x: 0, z: 0 };
  res.topY = topY;
  res.x = px;
  res.z = pz;
  return res;
}

// ---------------------------------------------------------------------------
// The climb curve
// ---------------------------------------------------------------------------
// The pull-up is a MOVEMENT MODE: while it runs it owns the body's position, so
// the path cannot be fought by input, gravity, or collision (the destination
// was validated by `findLedgeGrab` before the climb started). The curve is the
// shape of a real mantle rather than a straight line: the body rises first,
// hands to the lip, and only then pulls forward over the edge. Rising and
// translating on separate eases is what stops it reading as a slide up an
// invisible ramp.
//
// Pure geometry. Owning the timer, the interrupts, and the entity state is the
// caller's job.

export const CLIMB_DURATION_BASE = 0.3;
export const CLIMB_DURATION_PER_YARD = 0.16;
/** Fraction of the climb spent rising before the forward pull dominates. */
export const CLIMB_RISE_PHASE = 0.62;
/** How early the forward pull overlaps the rise, as a fraction of the rise. */
export const CLIMB_FORWARD_OVERLAP = 0.45;
/**
 * Settles the body a hair above the surface so the caller's landing snap seats
 * it on the top rather than one float epsilon inside it. Callers build the
 * climb destination as `topY + CLIMB_SETTLE_EPS`; nothing in here applies it,
 * because the grab reports the true surface height.
 */
export const CLIMB_SETTLE_EPS = 1e-3;

export function climbDuration(rise: number): number {
  return CLIMB_DURATION_BASE + CLIMB_DURATION_PER_YARD * (rise > 0 ? rise : 0);
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Body position partway through a climb. `elapsed >= duration` returns the
 * destination exactly, so the caller can end the move on the same value it
 * validated.
 */
export function climbPoseAt(
  from: Vec3,
  to: Vec3,
  elapsed: number,
  duration: number,
  out?: Vec3,
): Vec3 {
  const res: Vec3 = out ?? { x: 0, y: 0, z: 0 };
  if (!(duration > 0) || elapsed >= duration) {
    res.x = to.x;
    res.y = to.y;
    res.z = to.z;
    return res;
  }
  const t = elapsed / duration;
  const forwardStart = CLIMB_RISE_PHASE * CLIMB_FORWARD_OVERLAP;
  const up = smooth(t / CLIMB_RISE_PHASE);
  const fwd = smooth((t - forwardStart) / (1 - forwardStart));
  res.y = from.y + (to.y - from.y) * up;
  res.x = from.x + (to.x - from.x) * fwd;
  res.z = from.z + (to.z - from.z) * fwd;
  return res;
}
