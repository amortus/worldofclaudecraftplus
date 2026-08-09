// The traversal core's public surface. Consumers import from here, never from
// the files behind it.
//
// Everything exported is a PURE function or a plain record: no `Sim` state, no
// globals, no rng, no wall clock. See CLAUDE.md in this directory for the
// determinism contract, which includes floating-point operation ORDER.

export {
  BODY_EYE_HEIGHT,
  BODY_RADIUS,
  canStillVault,
  classifyObstacle,
  findLadderGap,
  GRAVITY,
  GROUND_SNAP_BASE,
  jumpArcFeetHeights,
  type JumpArcSample,
  jumpArcSamples,
  JUMP_VELOCITY,
  type LadderGap,
  LEDGE_GRAB_FORWARD,
  LEDGE_GRAB_MAX,
  LEDGE_GRAB_MIN,
  LEDGE_HEADROOM,
  makeTraversalBands,
  MANTLE_REACH,
  MAX_CLIMB_SLOPE,
  MAX_STEP_HEIGHT,
  PLAYER_TRAVERSAL_BANDS,
  remainingRise,
  RUN_STEP_PER_TICK,
  type TraversalBandOptions,
  type TraversalBands,
  type TraversalRung,
} from './ladder';

export {
  blocksAt,
  floorHeightAt,
  isClearAt,
  moveBody,
  supportTopAt,
  type TraversalMoveParams,
  type TraversalMoveResult,
} from './solver';

export {
  CLIMB_DURATION_BASE,
  CLIMB_DURATION_PER_YARD,
  CLIMB_FORWARD_OVERLAP,
  CLIMB_RISE_PHASE,
  CLIMB_SETTLE_EPS,
  climbDuration,
  climbPoseAt,
  findLedgeGrab,
  type LedgeGrab,
  type LedgeQuery,
  type Vec3,
} from './ledge';

export {
  centreInsideFootprint,
  overlapCollider,
  type OverlapPush,
  SKIN_WIDTH,
  type SweepHit,
  sweepCollider,
  TOP_EPS,
} from './sweep';

export type { ColliderFilter, ColliderTopFn, GroundFn } from './types';
