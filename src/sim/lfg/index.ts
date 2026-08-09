// Public surface of the Dungeon Finder. Everything outside `src/sim/lfg/`
// imports from HERE; the internal modules are not part of the contract.
//
// Read src/sim/lfg/CLAUDE.md before changing anything in this directory,
// especially the zero-draw rule and the four obstacles it resolves.

export {
  DUNGEON_FINDER_GROUP_SIZE,
  DUNGEON_FINDER_LEVEL_CAP,
  DUNGEON_FINDER_LISTINGS,
  DUNGEON_FINDER_MIN_GROUP_BY_TIER,
  DUNGEON_FINDER_QUEUE_ID,
  deriveListing,
  listingFor,
  meetsLevel,
} from './catalog';

export { buildCandidateGroup, relaxFor, tickDungeonFinder } from './matchmake';

export {
  closeProposal,
  cooldownSecondsFor,
  expireProposals,
  isOnCooldown,
  openProposal,
  respondToLfgProposal,
  type LfgCloseOptions,
  type LfgPenalty,
  type LfgRespondDeny,
  type LfgRespondRequest,
  type LfgRespondResult,
} from './proposals';

export {
  joinDungeonFinder,
  leaveDungeonFinder,
  lfgStatusFor,
  type LfgJoinMember,
  type LfgJoinRequest,
  type LfgLeaveResult,
} from './queue';

export { LFG_CLASS_ROLES, assignRoles, canFill, eligibleRoles, resolveRoles, type LfgAssignment } from './roles';

export {
  cooldownRemaining,
  createLfgQueueState,
  openProposalsFor,
  proposalForPid,
  unitForPid,
  unitsFor,
} from './state';

export {
  LFG_DECLINE_COOLDOWN_SEC,
  LFG_READY_WINDOW_SEC,
  LFG_RELAX_AFTER_SECONDS,
  LFG_SLOT_WAIT_SEC,
  LFG_TIMEOUT_COOLDOWN_SEC,
} from './tuning';

export { LFG_INTENT_KINDS, LFG_ROLES } from './types';
export type {
  LfgCloseReason,
  LfgFormGroupIntent,
  LfgIntent,
  LfgIntentKind,
  LfgJoinDeny,
  LfgJoinResult,
  LfgListing,
  LfgPenaltyIntent,
  LfgPenaltyReason,
  LfgPlayerState,
  LfgProposal,
  LfgProposalClosedIntent,
  LfgProposalMember,
  LfgProposalOpenedIntent,
  LfgProposalState,
  LfgQueueMember,
  LfgQueueState,
  LfgQueueUnit,
  LfgRelax,
  LfgRole,
  LfgRoleCounts,
  LfgStatusView,
  LfgTickInput,
  LfgTickResult,
  LfgTier,
} from './types';
