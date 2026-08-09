// The traversal ladder: what a body DOES about an obstacle, decided purely by
// how far the obstacle's top rises above the floor the body starts from.
//
//   step    0 < h <= stepHeight          strides over it, grounded, no input
//   vault   stepHeight < h <= vaultMax   a jump arc carries it over the rim
//   climb   vaultMax < h <= climbMax     a jump grabs the rim and pulls up
//   wall    h > climbMax                 impassable
//
// The rungs MEET. There is no obstacle height that is neither crossable nor
// climbable, and that is the property this file exists to guarantee:
// `findLadderGap` proves it by walking the REAL, discretely integrated jump arc
// instead of trusting the constants.
//
// ---------------------------------------------------------------------------
// Why the arc is integrated and not solved
// ---------------------------------------------------------------------------
// `sim.ts` integrates a jump with semi-implicit Euler at the fixed 20 Hz step:
//
//     p.vy -= GRAVITY * DT;
//     p.pos.y += p.vy * DT;
//
// which UNDERSHOOTS the closed-form apex `v0^2 / (2 g)`. With our numbers the
// analytic apex is 1.125 yd but the body only ever reaches 0.98 yd. Deriving
// the vault ceiling from the analytic apex would declare heights up to 2.05 yd
// vaultable while the body physically tops out at 1.905 yd, and the climb would
// refuse the same heights as "you could have vaulted that". The result is a
// 0.145 yd band of obstacle heights that can be neither crossed nor climbed:
// exactly the gap this ladder is supposed to make impossible. So every band is
// derived from `jumpArcFeetHeights`, the integrator itself.

import { DT, RUN_SPEED } from '../types';

// ---------------------------------------------------------------------------
// Mirrored sim constants
// ---------------------------------------------------------------------------
// These are NOT new balance numbers. Each mirrors a value that already governs
// movement but is module-private to `sim.ts` (or lives behind an import that
// would make this leaf module depend on the collider/world graph and risk an
// import cycle once the wiring step lands). `tests/traversal_constants.test.ts`
// parses the real sources and fails if any of them drifts.

/** Mirrors `GRAVITY` in `sim.ts` (yards/s^2). */
export const GRAVITY = 16;
/** Mirrors `JUMP_VELOCITY` in `sim.ts` (yards/s). */
export const JUMP_VELOCITY = 6;
/** Mirrors `PLAYER_MAX_CLIMB_SLOPE` in `pathfind.ts` (rise over run). */
export const MAX_CLIMB_SLOPE = 1.5;
/** Mirrors `PLAYER_BODY_RADIUS` in `pathfind.ts` (yards). */
export const BODY_RADIUS = 0.5;
/**
 * Mirrors the constant term of `maxStepDown` in `sim.ts`: the drop a grounded
 * body absorbs without leaving the ground even when it is standing still.
 */
export const GROUND_SNAP_BASE = 0.4;

// ---------------------------------------------------------------------------
// Derived body dimensions
// ---------------------------------------------------------------------------

/**
 * Ground travel of a running body in one tick (yards). `RUN_SPEED * DT`.
 */
export const RUN_STEP_PER_TICK = RUN_SPEED * DT;

/**
 * How high a grounded body strides over an obstacle without any input (yards).
 *
 * Derived, not chosen: it is the drop `sim.ts` ALREADY lets a running player
 * absorb without falling (`maxStepDown = 0.4 + run * MAX_CLIMB_SLOPE`, with
 * `run = RUN_SPEED * DT`). Making the step UP equal the step DOWN is what makes
 * traversal reversible: any lip you can walk off, you can walk back up. Picking
 * a different number would create ground you can leave but not return to.
 *
 *     0.4 + 7 * (1/20) * 1.5 = 0.925
 */
export const MAX_STEP_HEIGHT = GROUND_SNAP_BASE + RUN_STEP_PER_TICK * MAX_CLIMB_SLOPE;

/**
 * Extra height an AIRBORNE body clears above its feet (yards), so a jump that
 * falls just short of a rim still carries over it.
 *
 * Pinned EQUAL to {@link MAX_STEP_HEIGHT}. This is the ladder's bottom seam: a
 * top a grounded body would have strided straight over must never read as a
 * wall to the same body in mid-air. It is also the single allowance both halves
 * of a tick read (the horizontal blocking test and the vertical landing snap);
 * raising one arm alone lets a body tunnel into a top the landing snap will not
 * seat it on.
 */
export const MANTLE_REACH = MAX_STEP_HEIGHT;

/**
 * The chase-cam eye pivot above the feet (yards). The renderer passes
 * `feet + 2.0` as the head to `cameraOcclusion`, which makes it the one
 * body-height number the sim side and the presentation side already agree on.
 * (The character model's crown is 2.6; the sim itself has no stature constant,
 * because its body is a circle.) Used here only as the shoulder line the arms
 * reach up from.
 */
export const BODY_EYE_HEIGHT = 2.0;

/**
 * Arms-extended overhead grab reach above the feet (yards): 1.1x the eye line,
 * the standard anthropometric ratio of overhead reach to eye height.
 *
 * Sanity-checked against the shipped prop silhouettes rather than taste, using
 * the tops in `colliders.ts`. With the jump apex below (0.98) this puts the
 * climb ceiling at 3.18 yd, so crates (1.35), campfires (1.45), fence rails
 * (2.8), dock huts (2.9) and market stalls (3.1) are climbable, while wells
 * (3.7), ruin columns (4.3), mine mounds (5.2), tree trunks and buildings
 * (8.0 to 12.5) stay walls. Rooftops of real buildings are meant to stay
 * unreachable.
 */
export const LEDGE_GRAB_MAX = 1.1 * BODY_EYE_HEIGHT;

/**
 * A ledge must be at least this far above the feet or it is a step, not a grab.
 * Pinned EQUAL to {@link MAX_STEP_HEIGHT} for the same reason as
 * {@link MANTLE_REACH}: below it the body already walks up.
 */
export const LEDGE_GRAB_MIN = MAX_STEP_HEIGHT;

/**
 * How far ahead of the body's leading edge the hands reach for a ledge (yards).
 * One body radius: the arms reach about as far forward as the body is wide, so
 * the probe lands one full body diameter ahead of the centre.
 */
export const LEDGE_GRAB_FORWARD = BODY_RADIUS;

/**
 * Clearance a body needs above a ledge before it is allowed to climb onto it:
 * its own standing height, since it has to stand up there.
 *
 * With today's EXTRUDED-2D geometry this is a second, stricter pass over the
 * same footprints as the fit test, so it never changes an answer: an obstacle
 * that clears the head also clears the feet. It stops being redundant the
 * moment a collider gains a BOTTOM (an arch, a raised walkway), which is
 * exactly when getting it wrong would wedge a body inside geometry.
 */
export const LEDGE_HEADROOM = BODY_EYE_HEIGHT;

// ---------------------------------------------------------------------------
// The jump arc
// ---------------------------------------------------------------------------

/** One airborne tick of a jump: where the feet are and how fast they move. */
export interface JumpArcSample {
  /** Feet height above the launch floor (yards). */
  y: number;
  /** Vertical velocity at that tick (yards/s; positive is rising). */
  vy: number;
}

/**
 * Every AIRBORNE tick of a jump, in order, integrated exactly the way `sim.ts`
 * integrates it. The launch tick itself (feet still at 0, still grounded) is
 * not included: that height belongs to the step rung.
 *
 * FLOATING-POINT ORDER IS PART OF THE CONTRACT. `vy -= gravity * dt` then
 * `y += vy * dt`, in that order, with those exact expressions. Rewriting this
 * as a closed form, or reassociating the multiplications, changes the last bits
 * and therefore desynchronises hosts.
 */
export function jumpArcSamples(
  jumpVelocity = JUMP_VELOCITY,
  gravity = GRAVITY,
  dt = DT,
  maxTicks = 4096,
): JumpArcSample[] {
  const out: JumpArcSample[] = [];
  let vy = jumpVelocity;
  let y = 0;
  for (let i = 0; i < maxTicks; i++) {
    vy -= gravity * dt;
    y += vy * dt;
    if (y <= 0) break;
    out.push({ y, vy });
  }
  return out;
}

/** Feet heights only; see {@link jumpArcSamples}. */
export function jumpArcFeetHeights(
  jumpVelocity = JUMP_VELOCITY,
  gravity = GRAVITY,
  dt = DT,
): number[] {
  return jumpArcSamples(jumpVelocity, gravity, dt).map((s) => s.y);
}

/**
 * How much further a body rising at `vy` will climb before it turns over,
 * integrated with the SAME loop as the arc rather than the closed form
 * `vy^2 / (2 g)`. The closed form overstates the discrete rise by about 13
 * percent at our numbers, and this value gates a boolean, so an overstatement
 * refuses grabs the body cannot actually convert into a vault.
 */
export function remainingRise(vy: number, gravity = GRAVITY, dt = DT, maxTicks = 4096): number {
  if (vy <= 0) return 0;
  let v = vy;
  let y = 0;
  let best = 0;
  for (let i = 0; i < maxTicks; i++) {
    v -= gravity * dt;
    y += v * dt;
    if (y > best) best = y;
    if (v <= 0) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

/**
 * Every number the ladder needs, for one body with one jump strength. All
 * heights are measured from the floor the body launches from, in yards.
 */
export interface TraversalBands {
  /** Launch speed of the jump this ladder describes (yards/s). */
  jumpVelocity: number;
  gravity: number;
  dt: number;
  /** Highest obstacle a grounded body strides over. */
  stepHeight: number;
  /** Extra clearance an airborne body gets above its feet. */
  mantleReach: number;
  /** Peak feet height of the DISCRETE jump arc. */
  jumpApex: number;
  /** Highest obstacle the jump arc carries the body over. */
  vaultMax: number;
  /** Lowest ledge above the feet that counts as a grab rather than a step. */
  grabMin: number;
  /** Highest ledge the arms reach above the feet. */
  grabMax: number;
  /**
   * A climb is refused below this height above the launch floor, because the
   * body could simply have vaulted it. Pinned EQUAL to {@link vaultMax}: this
   * is the ladder's middle seam and the one most likely to be broken by a
   * well-meaning edit.
   */
  climbMinOverhead: number;
  /** Highest obstacle a climb can reach. Above it, everything is a wall. */
  climbMax: number;
}

export interface TraversalBandOptions {
  jumpVelocity?: number;
  gravity?: number;
  dt?: number;
  stepHeight?: number;
  mantleReach?: number;
  grabMin?: number;
  grabMax?: number;
  /** Escape hatch used ONLY by the negative controls in the tests. */
  jumpApex?: number;
  climbMinOverhead?: number;
}

/**
 * Build a band set. Every default is derived from the constants above and from
 * the integrated arc; the overrides exist so a jump buff (`buff_jump` scales
 * `JUMP_VELOCITY` in `sim.ts`) gets its own consistent ladder, and so the
 * invariant test can construct deliberately broken ladders.
 */
export function makeTraversalBands(o: TraversalBandOptions = {}): TraversalBands {
  const jumpVelocity = o.jumpVelocity ?? JUMP_VELOCITY;
  const gravity = o.gravity ?? GRAVITY;
  const dt = o.dt ?? DT;
  const stepHeight = o.stepHeight ?? MAX_STEP_HEIGHT;
  const mantleReach = o.mantleReach ?? stepHeight;
  const grabMin = o.grabMin ?? stepHeight;
  const grabMax = o.grabMax ?? LEDGE_GRAB_MAX;
  const arc = jumpArcSamples(jumpVelocity, gravity, dt);
  let apex = 0;
  for (let i = 0; i < arc.length; i++) if (arc[i].y > apex) apex = arc[i].y;
  const jumpApex = o.jumpApex ?? apex;
  const vaultMax = jumpApex + mantleReach;
  return {
    jumpVelocity,
    gravity,
    dt,
    stepHeight,
    mantleReach,
    jumpApex,
    vaultMax,
    grabMin,
    grabMax,
    climbMinOverhead: o.climbMinOverhead ?? vaultMax,
    climbMax: jumpApex + grabMax,
  };
}

/** The player's ladder at base jump strength. */
export const PLAYER_TRAVERSAL_BANDS: TraversalBands = makeTraversalBands();

export type TraversalRung = 'step' | 'vault' | 'climb' | 'wall';

/**
 * Which rung an obstacle of height `h` above the launch floor lands on.
 * Comparisons are inclusive at the top of each band, so the seams belong to the
 * cheaper response.
 */
export function classifyObstacle(h: number, bands: TraversalBands = PLAYER_TRAVERSAL_BANDS): TraversalRung {
  if (h <= bands.stepHeight) return 'step';
  if (h <= bands.vaultMax) return 'vault';
  if (h <= bands.climbMax) return 'climb';
  return 'wall';
}

// ---------------------------------------------------------------------------
// The invariant: no gap
// ---------------------------------------------------------------------------

export interface LadderGap {
  /** Obstacle height above the launch floor that nothing handles (yards). */
  height: number;
  /** Which side of the ladder failed. */
  reason: 'uncrossable-and-unclimbable' | 'rung-disagrees-with-arc';
  /** What the constants claim. */
  claimed: TraversalRung;
}

/**
 * Would this body, still rising at `vy` with its feet at `feetY`, clear a rim
 * at `topY` just by continuing up? A grab is refused while the answer is yes:
 * a body that can still vault should vault.
 *
 * Exact rather than a velocity threshold, and it can never open a gap: above
 * `climbMinOverhead` the highest point the body can still reach is the apex,
 * so `apex + mantleReach = vaultMax < topY` and the refusal never fires.
 */
export function canStillVault(
  feetY: number,
  vy: number,
  topY: number,
  bands: TraversalBands = PLAYER_TRAVERSAL_BANDS,
): boolean {
  return feetY + remainingRise(vy, bands.gravity, bands.dt) + bands.mantleReach >= topY;
}

/**
 * Can the body get over an obstacle of height `h` by moving through the arc?
 * True when the grounded stride covers it, or when SOME airborne tick has the
 * feet high enough that the mantle allowance clears the rim.
 */
function crossableByArc(h: number, bands: TraversalBands, arc: readonly JumpArcSample[]): boolean {
  if (h <= bands.stepHeight) return true;
  for (let i = 0; i < arc.length; i++) if (h <= arc[i].y + bands.mantleReach) return true;
  return false;
}

/**
 * Can the body grab and climb an obstacle of height `h`? True when some
 * airborne tick puts the rim inside the grab window, the rim is high enough
 * that the climb is not refused as "you could have vaulted that", and the body
 * is no longer rising fast enough to clear it unaided.
 *
 * The grab window is two-sided, so unlike the vault this depends on the arc
 * being sampled finely enough: a jump so strong that one tick moves the feet
 * further than `grabMax - grabMin` can skip over the window entirely. That is a
 * real failure mode, not a hypothetical, and `findLadderGap` catches it.
 */
function climbableByArc(h: number, bands: TraversalBands, arc: readonly JumpArcSample[]): boolean {
  if (h < bands.climbMinOverhead) return false;
  for (let i = 0; i < arc.length; i++) {
    const s = arc[i];
    if (h < s.y + bands.grabMin || h > s.y + bands.grabMax) continue;
    if (canStillVault(s.y, s.vy, h, bands)) continue;
    return true;
  }
  return false;
}

/**
 * Walk every obstacle height from zero up to the declared climb ceiling and
 * return the first one the ladder does not handle, or null when the ladder is
 * whole. This is the port's most valuable artifact: it is what makes "there is
 * no gap" a checked property instead of a comment.
 *
 * It deliberately re-derives the truth from the arc integrator and the band
 * PRIMITIVES rather than from the derived ceilings, so a band set whose
 * ceilings were computed from a wrong apex (the classic mistake, see the file
 * header) is reported rather than believed.
 *
 * KNOWN BLIND SPOTS, do not mistake a null for a proof of the whole system:
 * - It checks the HEIGHT ALGEBRA. It does not run `moveBody`, so it cannot see
 *   a step rung that the solver refuses for a geometric reason (an approach
 *   angle, a landing spot with no support). `tests/traversal_ladder.test.ts`
 *   covers that end to end against the real solver.
 * - It does not model `findLedgeGrab`'s fit, headroom, or reach tests, so a
 *   height it calls climbable can still be refused by specific geometry.
 * - It samples at `probe`, so a gap narrower than one probe is missed. Keep the
 *   probe well under the narrowest band.
 */
export function findLadderGap(
  bands: TraversalBands = PLAYER_TRAVERSAL_BANDS,
  probe = 0.005,
): LadderGap | null {
  const arc = jumpArcSamples(bands.jumpVelocity, bands.gravity, bands.dt);
  const steps = Math.ceil(bands.climbMax / probe);
  for (let i = 1; i <= steps; i++) {
    const h = Math.min(bands.climbMax, i * probe);
    const crossable = crossableByArc(h, bands, arc);
    const climbable = climbableByArc(h, bands, arc);
    const claimed = classifyObstacle(h, bands);
    if (!crossable && !climbable) {
      return { height: h, reason: 'uncrossable-and-unclimbable', claimed };
    }
    if ((claimed === 'step' || claimed === 'vault') && !crossable) {
      return { height: h, reason: 'rung-disagrees-with-arc', claimed };
    }
    if (claimed === 'climb' && !climbable) {
      return { height: h, reason: 'rung-disagrees-with-arc', claimed };
    }
  }
  return null;
}
