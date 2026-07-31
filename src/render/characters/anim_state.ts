/** Renderer-derived animation inputs (same facts the old pose machine used). */
export interface AnimState {
  /** horizontal speed, world units/sec */
  speed: number;
  moving: boolean;
  airborne: boolean;
  /** moving against facing (players backpedaling) */
  backwards: boolean;
  /** use reversed forward locomotion instead of an authored walkBack clip */
  reverseBackpedal?: boolean;
  dead: boolean;
  casting: boolean;
  swimming: boolean;
  sitting: boolean;
}

export type BaseState = 'idle' | 'walk' | 'walkBack' | 'run' | 'cast' | 'swim' | 'sit' | 'jump';

const RUN_SPEED_THRESHOLD = 4.5; // u/s — sim walk/wander sits well below
const DEFAULT_WALK_REF = 2.2;
const DEFAULT_RUN_REF = 7;

export function desiredBaseState(s: AnimState, hasWalkBackClip: boolean): BaseState {
  if (s.swimming) return 'swim';
  if (s.airborne) return 'jump';
  if (s.casting) return 'cast';
  if (s.sitting) return 'sit';
  if (s.moving) {
    if (s.backwards && hasWalkBackClip && !s.reverseBackpedal) return 'walkBack';
    return s.speed >= RUN_SPEED_THRESHOLD ? 'run' : 'walk';
  }
  return 'idle';
}

// ---------------------------------------------------------------------------
// Zero-weight watchdog
//
// A three.js SkinnedMesh blends toward BIND POSE (arms out: the T-pose) in
// proportion to how far the summed effective weight of the mixer's scheduled
// actions falls short of 1, since the PropertyMixer blends the deficit back
// toward the bind transform. The state machine in visual.ts only re-drives the
// rig on a base-state EDGE, so a transient that leaves NOTHING driving it (a
// partner-less fade-in, an action stopped out from under `current`, a one-shot
// whose `finished` never arrived) sticks for as long as the state is held, and
// strafing, casting and walking are all held states.
//
// SCOPE, do not overstate it: these helpers detect the FULL latch only, the
// band where essentially nothing drives the rig (summed weight under
// POSE_DRIVE_MIN_WEIGHT). A partial deficit, say a steady 0.5, is a real if
// subtler bind-pose blend and is deliberately NOT caught here: the threshold
// has to sit below the trough of a legitimate crossfade or the watchdog would
// fight every normal transition. Detecting partial droop needs a different
// signal, not a higher threshold. Pure math, so a Vitest can prove it without a
// GLTF rig (GLTFLoader does not run in Node).
// ---------------------------------------------------------------------------

/** One action's live contribution to the accumulated pose. */
export interface AnimActionWeight {
  /** The mixer still schedules this action, so its weight reaches the pose
   *  (three's `AnimationAction.isScheduled()`, NOT `isRunning()`: a clamped
   *  one-shot is paused, hence not running, yet still holds the rig at full
   *  weight; and a stopped action keeps a stale non-zero effective weight). */
  scheduled: boolean;
  /** Weight after fades and `enabled` (three's `getEffectiveWeight()`). */
  effectiveWeight: number;
}

/** Below this summed weight the rig counts as having NOTHING driving it. Not a
 *  "safe" level: anything under 1 blends toward bind pose to some degree. It is
 *  set this low so a legitimate crossfade, whose halves sum to about 1 but can
 *  dip briefly, can never trip the repair. */
export const POSE_DRIVE_MIN_WEIGHT = 0.05;

/** Consecutive starved frames tolerated before the repair fires. Rides out the
 *  frames a legitimate crossfade can spend near zero without letting a real
 *  latch persist longer than a blink. */
export const ANIM_REPAIR_FRAMES = 3;

export interface AnimRepairScan {
  /** consecutive starved frames after this one (0 once driven, or once repaired) */
  starvedFrames: number;
  /** re-drive the base pose on this frame */
  repair: boolean;
}

/** Does this one action still hold the rig off bind pose? */
export function drivesPose(action: AnimActionWeight | null | undefined): boolean {
  return !!action && action.scheduled && action.effectiveWeight >= POSE_DRIVE_MIN_WEIGHT;
}

/**
 * Is the rig blending toward bind pose with nothing left to bring it back?
 * A crossfade sums to ~1 and a clamped one-shot holds ~1, so neither trips it;
 * a rig with no actions at all (the clip-less prop rigs) has no pose to repair.
 */
export function needsAnimRepair(
  actions: readonly AnimActionWeight[],
  deadLocked: boolean,
): boolean {
  if (deadLocked || actions.length === 0) return false;
  let total = 0;
  for (const action of actions) {
    if (action.scheduled) total += action.effectiveWeight;
    if (total >= POSE_DRIVE_MIN_WEIGHT) return false;
  }
  return true;
}

/**
 * One frame of the watchdog: the debounce counter folded with the decision.
 * `into` is an optional caller-owned result object; this runs once per rig per
 * frame, so visual.ts passes its own scratch rather than letting a raid's worth
 * of rigs allocate a fresh result every frame (GC churn is a measured stutter
 * source on our phone tier). Tests may omit it.
 */
export function scanAnimRepair(
  starvedFrames: number,
  actions: readonly AnimActionWeight[],
  deadLocked: boolean,
  into: AnimRepairScan = { starvedFrames: 0, repair: false },
): AnimRepairScan {
  if (!needsAnimRepair(actions, deadLocked)) {
    into.starvedFrames = 0;
    into.repair = false;
    return into;
  }
  const starved = starvedFrames + 1;
  // Re-arm on repair: a repair that did not take (a rig with no base action to
  // drive) must be retried rather than latch the counter above the threshold.
  into.repair = starved >= ANIM_REPAIR_FRAMES;
  into.starvedFrames = into.repair ? 0 : starved;
  return into;
}

export function locomotionTimeScale(
  baseState: BaseState,
  s: Pick<AnimState, 'speed' | 'backwards' | 'reverseBackpedal'>,
  walkRef = DEFAULT_WALK_REF,
  runRef = DEFAULT_RUN_REF,
): number | null {
  let timeScale: number;
  if (baseState === 'walk' || baseState === 'walkBack') {
    timeScale = clamp(s.speed / walkRef, 0.6, 1.8);
  } else if (baseState === 'run') {
    timeScale = clamp(s.speed / runRef, 0.6, 1.6);
  } else {
    return null;
  }
  return s.reverseBackpedal && s.backwards && baseState !== 'walkBack' ? -timeScale : timeScale;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
