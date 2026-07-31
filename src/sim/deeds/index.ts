// src/sim/deeds — the chronicle (achievement) subsystem's public surface.
// Consumers import from HERE, never from the individual modules.

export {
  applyDeedEvent,
  applyDeedEvents,
  DEED_COUNTER_MODE,
  deedCompletion,
  deedCounter,
  deedProgressView,
  deedRenown,
  deedTitles,
  evaluateDeeds,
  freshDeedProgress,
  restoreDeedProgress,
  serializeDeedProgress,
} from './evaluator';
export {
  DEED_MARK_NAMESPACES,
  deedMark,
  type DeedCatalog,
  type DeedCategory,
  type DeedCounterId,
  type DeedDef,
  type DeedEvaluation,
  type DeedEvent,
  type DeedItemQuality,
  type DeedMarkNamespace,
  type DeedProgress,
  type DeedProgressView,
  type DeedReward,
  type DeedTrigger,
  type SavedDeedProgress,
} from './types';
