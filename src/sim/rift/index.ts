// Public surface of the rift subsystem. Everything outside `src/sim/rift/`
// imports from HERE; the internal modules are not part of the contract.
//
// Read src/sim/rift/CLAUDE.md before changing anything in this directory,
// especially the local-Rng rule.

export {
  AISLE_HALF,
  BODY_R,
  isClear,
  RIFT_ENTRY_Z_OFFSET,
  RIFT_Z_MIN,
  type RoomArchetype,
  ROOM_ARCHETYPES,
} from './layout_gen';
export {
  RIFT_MAX_MOB_LEVEL,
  RIFT_MIN_MOVE_SPEED,
  RIFT_RANK_BASE_LEVEL,
  RIFT_RANK_MECHANIC_BUDGET,
  RIFT_RANK_TUNING,
  riftFloorLevel,
  riftRankForBaseLevel,
  riftRankTemplate,
  riftRankTuningFor,
  riftRoleDamageMultiplier,
  riftRoleHealthMultiplier,
  type RiftRankTuning,
} from './ranks';
export {
  buildRiftFloor,
  clearRiftFloorCache,
  generateRiftFloor,
  generateRiftPlan,
  mixSeed,
  RIFT_MAX_FLOORS,
  RIFT_MIN_FLOORS,
  riftBossMechanicsAt,
  riftFloorColliders,
  riftFloorCount,
  riftThemeForFloor,
} from './rift_gen';
export { RIFT_ENTRY_CLEARANCE, riftMinSpawnZ } from './spawn_gen';
export type {
  RiftDescriptor,
  RiftFloorPlan,
  RiftGate,
  RiftIceZone,
  RiftInteriorKit,
  RiftMechanic,
  RiftMechanicKind,
  RiftObjectKind,
  RiftObjectPlan,
  RiftPlan,
  RiftRank,
  RiftSpawn,
  RiftSpawnRole,
  RiftStyle,
} from './types';
