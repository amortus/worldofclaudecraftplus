// The traversal solver: depenetrate, then sweep and slide, with step-up.
//
// One call resolves ONE tick of horizontal motion for one body against a
// caller-supplied collider set. It is a pure function of its arguments: no
// `Sim` state, no globals, no rng, no wall clock, no module-level mutable
// counters. Given the same inputs it returns the same output, bit for bit, on
// every host.
//
// The shape of a solve:
//   1. Depenetrate. Anything the body already overlaps pushes it out along the
//      minimum-translation axis, worst overlap first is NOT used: colliders are
//      resolved in the caller's order so the result cannot depend on a sort.
//   2. Sweep the remaining motion. The earliest time of impact wins.
//   3. On contact, either STEP UP (the obstacle has a top the body can stride
//      onto and actually be supported by) or SLIDE (project the remaining
//      motion onto the surface tangent).
//   4. Repeat up to `maxPasses` times, so a body in a corner slides out along
//      the second wall instead of sticking on the first.
//
// Step-up applies to COLLIDERS ONLY, never to the heightfield. A per-tick step
// allowance on terrain is a cliff-climbing ladder: a running body covers
// `RUN_SPEED * DT` yards per tick, so a step-height rise every tick would raise
// the effective climb limit to `stepHeight / (RUN_SPEED * DT)` and defeat
// `PLAYER_MAX_CLIMB_SLOPE` entirely. Terrain keeps the sim's existing wall rule.

import type { Collider } from '../colliders';
import { PLAYER_TRAVERSAL_BANDS, type TraversalBands } from './ladder';
import {
  centreInsideFootprint,
  overlapCollider,
  type OverlapPush,
  SKIN_WIDTH,
  type SweepHit,
  sweepCollider,
  TOP_EPS,
} from './sweep';
import type { ColliderFilter, ColliderTopFn } from './types';

/** Passes of sweep-and-slide per solve. Four resolves a corner plus a corner. */
const DEFAULT_MAX_PASSES = 4;
/** Depenetration iterations. Overlapping props can push each other's fixes. */
const DEPEN_ITERATIONS = 6;
/**
 * How far past bare contact a depenetrated body is pushed. Equal to
 * `SKIN_WIDTH` on purpose: leaving a freed body only a float-epsilon clear
 * defeats the very gap the skin exists to maintain, and the next tick's sweep
 * would start on the surface again.
 */
const DEPEN_EPS = SKIN_WIDTH;
/** Fraction of a body radius each step-up commit probe advances. */
const COMMIT_PROBE_FRACTION = 0.25;
/**
 * A body must be heading into a surface by at least this much (cosine between
 * the motion and the inward normal) before a step-up is attempted. Below it the
 * body is sliding ALONG the lip rather than at it, and sliding is the right
 * answer. 0.1 is about 84 degrees off head-on: generous on purpose, because
 * refusing a step is what makes a curb feel like a wall.
 */
const MIN_STEP_APPROACH_COS = 0.1;
/**
 * Steps per solve. Exactly one: a step is a positional correction the body
 * gains for free (see `commitStep`), and letting all four passes take one would
 * let a single 20 Hz tick both gain `4 * stepHeight` of height and travel
 * further than the requested delta.
 */
const MAX_STEPS_PER_SOLVE = 1;

export interface TraversalMoveParams {
  /** Body centre at the start of the tick (world XZ, yards). */
  x: number;
  z: number;
  /** Feet height at the start of the tick (world Y, yards). */
  feetY: number;
  /** Intended motion for this tick (yards). */
  dx: number;
  dz: number;
  /** Body radius (yards). */
  radius: number;
  /**
   * Candidate colliders, in a STABLE order. The order is part of the
   * determinism contract: ties in time of impact go to the earlier entry, so
   * two hosts that broadphase into different orders can resolve differently.
   */
  colliders: readonly Collider[];
  /** Movement top of each collider; see `ColliderTopFn`. */
  topOf: ColliderTopFn;
  /** Airborne bodies mantle over tops instead of stepping onto them. */
  airborne?: boolean;
  /** Ladder in force for this body. Defaults to the player's. */
  bands?: TraversalBands;
  /** Colliders this mover passes through entirely (a jumper over fences). */
  ignore?: ColliderFilter;
  maxPasses?: number;
}

export interface TraversalMoveResult {
  /** Resolved body centre. */
  x: number;
  z: number;
  /** Feet height, raised when the body stepped up onto something. */
  feetY: number;
  /** The motion was cut short by something the body could not step onto. */
  hitWall: boolean;
  /** The body strode up onto a collider top this tick. */
  steppedUp: boolean;
  /** The body started the tick inside geometry and was pushed out. */
  depenetrated: boolean;
  /** Sweep-and-slide passes actually run (diagnostics; pure, no globals). */
  passes: number;
  /** Sweep tests performed (diagnostics). Open ground costs zero. */
  sweeps: number;
  /** Overlap tests performed (diagnostics). */
  overlaps: number;
}

// Scratch reused across calls. Pure with respect to OUTPUT: every field is
// written before it is read within a single call.
const hit: SweepHit = { t: 0, nx: 0, nz: 0 };
const probe: SweepHit = { t: 0, nx: 0, nz: 0 };
const push: OverlapPush = { nx: 0, nz: 0, depth: 0 };

/** Half-extent of a collider's bounding circle, for the cheap reach reject. */
function boundingRadius(c: Collider): number {
  return c.type === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
}

/**
 * Absolute top of a collider for movement, or `Infinity` when it is full
 * height. Folding `undefined` into `Infinity` here keeps every comparison
 * below a plain numeric one.
 */
function movementTop(c: Collider, topOf: ColliderTopFn): number {
  const top = topOf(c);
  return top === undefined ? Infinity : top;
}

/**
 * Does this collider block a body whose feet are at `feetY`?
 *
 * A GROUNDED body is blocked by anything rising above its feet; the step-up
 * branch of the solver is what lets it up onto low tops. An AIRBORNE body gets
 * the mantle allowance, so a jump that falls just short of a rim still carries
 * over it. The two allowances are the same number (`MANTLE_REACH ===
 * MAX_STEP_HEIGHT`), which is what keeps the ladder in `ladder.ts` gapless.
 */
export function blocksAt(
  c: Collider,
  topOf: ColliderTopFn,
  feetY: number,
  airborne: boolean,
  mantleReach: number,
): boolean {
  const top = movementTop(c, topOf);
  if (top === Infinity) return true;
  return top > feetY + (airborne ? mantleReach : 0) + TOP_EPS;
}

/**
 * Highest collider top the body's CENTRE is standing over at (x, z), counting
 * only tops at or below `maxY`. Returns `-Infinity` when nothing supports it.
 *
 * The footprint is used un-inflated on purpose: contact happens at
 * `collider.r + bodyRadius`, but a surface only holds a body up when its centre
 * is actually over it. Using the inflated footprint here is what makes a
 * step-up look like it worked and then drop the body on the next tick.
 */
export function supportTopAt(
  x: number,
  z: number,
  colliders: readonly Collider[],
  topOf: ColliderTopFn,
  maxY: number,
  ignore?: ColliderFilter,
): number {
  let best = -Infinity;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (ignore && ignore(c)) continue;
    const top = topOf(c);
    if (top === undefined) continue; // full-height blocker, never a floor
    if (top > maxY || top <= best) continue;
    if (!centreInsideFootprint(c, x, z)) continue;
    best = top;
  }
  return best;
}

/**
 * The surface the body's vertical pass should land and snap against: the
 * heightfield, raised by any standable prop top the body is over.
 */
export function floorHeightAt(
  x: number,
  z: number,
  groundY: number,
  colliders: readonly Collider[],
  topOf: ColliderTopFn,
  maxY: number,
  ignore?: ColliderFilter,
): number {
  const top = supportTopAt(x, z, colliders, topOf, maxY, ignore);
  return top > groundY ? top : groundY;
}

/**
 * Is the body clear at (x, z) with its feet at `feetY`? Used to headroom-gate
 * every step-up: striding up must never push a body into a wall.
 */
export function isClearAt(
  x: number,
  z: number,
  radius: number,
  feetY: number,
  colliders: readonly Collider[],
  topOf: ColliderTopFn,
  ignore?: ColliderFilter,
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (ignore && ignore(c)) continue;
    if (!blocksAt(c, topOf, feetY, false, 0)) continue;
    if (overlapCollider(c, x, z, radius, push)) return false;
  }
  return true;
}

/**
 * Resolve one tick of horizontal motion. Writes into `out` when given, so the
 * caller can own the result object and the hot path allocates nothing.
 */
export function moveBody(p: TraversalMoveParams, out?: TraversalMoveResult): TraversalMoveResult {
  const r = p.radius;
  const bands = p.bands ?? PLAYER_TRAVERSAL_BANDS;
  const airborne = p.airborne ?? false;
  const maxPasses = p.maxPasses ?? DEFAULT_MAX_PASSES;
  const list = p.colliders;
  const topOf = p.topOf;
  const ignore = p.ignore;

  const res: TraversalMoveResult = out ?? {
    x: 0,
    z: 0,
    feetY: 0,
    hitWall: false,
    steppedUp: false,
    depenetrated: false,
    passes: 0,
    sweeps: 0,
    overlaps: 0,
  };
  let x = p.x;
  let z = p.z;
  let feetY = p.feetY;
  res.hitWall = false;
  res.steppedUp = false;
  res.depenetrated = false;
  res.passes = 0;
  res.sweeps = 0;
  res.overlaps = 0;

  // 1. Depenetration. Iterating in the caller's order (never a sorted order)
  // keeps the fixed point reproducible.
  for (let iter = 0; iter < DEPEN_ITERATIONS; iter++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (ignore && ignore(c)) continue;
      if (!blocksAt(c, topOf, feetY, airborne, bands.mantleReach)) continue;
      res.overlaps++;
      if (!overlapCollider(c, x, z, r, push)) continue;
      x += push.nx * (push.depth + DEPEN_EPS);
      z += push.nz * (push.depth + DEPEN_EPS);
      moved = true;
      res.depenetrated = true;
    }
    if (!moved) break;
  }

  // 2/3. Sweep, then step up or slide, up to `maxPasses` times.
  let dx = p.dx;
  let dz = p.dz;
  let steps = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (dx * dx + dz * dz < 1e-14) break;
    res.passes++;

    let bestT = Infinity;
    let bestNx = 0;
    let bestNz = 0;
    let bestIdx = -1;
    const reach = Math.hypot(dx, dz) + r;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (ignore && ignore(c)) continue;
      if (!blocksAt(c, topOf, feetY, airborne, bands.mantleReach)) continue;
      // Cheap reject before the exact sweep: nothing outside the swept reach
      // can be hit, so this can only skip misses.
      const cdx = c.x - x;
      const cdz = c.z - z;
      const far = reach + boundingRadius(c);
      if (cdx * cdx + cdz * cdz > far * far) continue;
      res.sweeps++;
      if (!sweepCollider(c, x, z, dx, dz, r, probe)) continue;
      if (probe.t >= bestT) continue; // strict: ties go to the earlier collider
      bestT = probe.t;
      bestNx = probe.nx;
      bestNz = probe.nz;
      bestIdx = i;
    }

    if (bestIdx < 0) {
      x += dx;
      z += dz;
      dx = 0;
      dz = 0;
      break;
    }
    hit.t = bestT;
    hit.nx = bestNx;
    hit.nz = bestNz;

    // Advance to just before contact.
    const motion = Math.hypot(dx, dz);
    const backoff = motion > 1e-9 ? SKIN_WIDTH / motion : 0;
    const tAdv = Math.max(0, hit.t - backoff);
    const ax = x + dx * tAdv;
    const az = z + dz * tAdv;
    let remX = dx * (1 - tAdv);
    let remZ = dz * (1 - tAdv);

    // Step up, if the obstacle has a standable top within reach, the body is
    // actually heading into it, and it can be supported once up there.
    const blockerTop = movementTop(list[bestIdx], topOf);
    let stepped = false;
    if (
      !airborne &&
      steps < MAX_STEPS_PER_SOLVE &&
      blockerTop !== Infinity &&
      blockerTop <= feetY + bands.stepHeight + TOP_EPS
    ) {
      const committed = commitStep(ax, az, dx, dz, hit.nx, hit.nz, r, blockerTop, list, topOf, ignore, res);
      if (committed) {
        x = committed.x;
        z = committed.z;
        feetY = blockerTop;
        res.steppedUp = true;
        stepped = true;
        steps++;
        // The commit is normal to the surface, so it consumes the part of the
        // motion that was heading into it; what survives is the tangential
        // remainder, exactly as if the body had slid.
        const into = remX * hit.nx + remZ * hit.nz;
        dx = into < 0 ? remX - hit.nx * into : remX;
        dz = into < 0 ? remZ - hit.nz * into : remZ;
      }
    }

    if (!stepped) {
      x = ax;
      z = az;
      // Slide: remove only the component heading INTO the surface. A body that
      // is already overlapping (a t = 0 hit) and moving outward must keep its
      // escape, or depenetration and the slide fight each other and pin it.
      const into = remX * hit.nx + remZ * hit.nz;
      if (into < 0) {
        remX -= hit.nx * into;
        remZ -= hit.nz * into;
      }
      dx = remX;
      dz = remZ;
      res.hitWall = true;
    }
  }

  res.x = x;
  res.z = z;
  res.feetY = feetY;
  return res;
}

/** Result of a successful step commit. Module scratch; never escapes a call. */
const commitOut = { x: 0, z: 0 };

/**
 * Find a spot past the contact point where the body is BOTH supported by the
 * surface it is stepping onto and clear at the raised feet, and return it; null
 * means the step must be abandoned.
 *
 * A step must COMMIT, not just raise. Contact happens at
 * `collider.r + bodyRadius`, but the surface only holds the body up well inside
 * that, so raising the feet at the contact point alone leaves them unsupported:
 * the vertical pass drops them and depenetration pushes them straight back out,
 * which locks anyone moving slower than a full run (backpedalling, snared,
 * strafing diagonally). Abandoning instead of half-stepping is what makes the
 * body slide rather than stick.
 *
 * The probe runs along the INWARD CONTACT NORMAL, not along the motion. Contact
 * leaves the centre one body radius outside the surface measured along the
 * normal, so a probe budget of one radius reaches inside the footprint of any
 * convex obstacle at ANY approach angle. Probing along the motion instead makes
 * the budget `radius / cos(approach)` and silently turns every low lip into a
 * wall for anyone approaching at more than about twenty degrees off head-on,
 * which is most of the time.
 */
function commitStep(
  ax: number,
  az: number,
  dx: number,
  dz: number,
  nx: number,
  nz: number,
  r: number,
  top: number,
  list: readonly Collider[],
  topOf: ColliderTopFn,
  ignore: ColliderFilter | undefined,
  res: TraversalMoveResult,
): { x: number; z: number } | null {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return null;
  // Only step at a surface the body is actually heading into.
  const approach = -((dx / len) * nx + (dz / len) * nz);
  if (approach < MIN_STEP_APPROACH_COS) return null;
  // A zero or near-zero radius would make the stride zero and the probe count
  // unbounded, so the stride never falls below the contact skin.
  const stride = Math.max(r * COMMIT_PROBE_FRACTION, SKIN_WIDTH);
  const maxCommit = r + 4 * SKIN_WIDTH;
  const probes = Math.max(1, Math.ceil(maxCommit / stride));
  for (let i = 1; i <= probes; i++) {
    const d = Math.min(maxCommit, i * stride);
    const cx = ax - nx * d;
    const cz = az - nz * d;
    res.overlaps++;
    if (supportTopAt(cx, cz, list, topOf, top + TOP_EPS, ignore) < top - TOP_EPS) continue;
    // `isClearAt` is evaluated at the raised feet exactly; `blocksAt` adds the
    // shared TOP_EPS itself, so stacking another one here would admit a
    // collider that blocks again on the very next tick.
    if (!isClearAt(cx, cz, r, top, list, topOf, ignore)) continue;
    commitOut.x = cx;
    commitOut.z = cz;
    return commitOut;
  }
  return null;
}
