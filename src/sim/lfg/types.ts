// Record shapes for the Dungeon Finder queue. Types only: no logic, no data.
//
// NOTE ON THE NAME. The directory is `lfg/` but the runtime identifier this
// subsystem answers to is `dungeonFinder` (see DUNGEON_FINDER_QUEUE_ID in
// catalog.ts). The token `lfg` is ALREADY the id of a chat channel
// (JOINABLE_CHANNELS in sim.ts, ChatTabChannel in src/ui/chat_channels.ts), so
// no string produced by this subsystem may ever be `lfg`.

import type { PlayerClass } from '../types';
import type { Role } from '../content/talents';

// Aliased to the talent-tree Role on purpose: the role split a player queues
// for is exactly the role split the spec table already defines, and aliasing
// makes a future divergence a compile error rather than a silent second union.
export type LfgRole = Role; // 'tank' | 'healer' | 'dps'

export const LFG_ROLES: readonly LfgRole[] = ['tank', 'healer', 'dps'];

// Derived difficulty band (obstacle 4: DungeonDef carries no difficulty field).
// Computed from the dungeon's own spawn table, never authored twice.
export type LfgTier = 'leveling' | 'endgame' | 'heroic';

export interface LfgListing {
  dungeonId: string;
  tier: LfgTier;
  groupSize: number; // the full group this content is built for
  minGroupSize: number; // the smallest group the queue will ever pop for it
  minQueueLevel: number; // hard floor, the weakest level inside
  recommendedLevel: number; // the strongest level inside (the boss)
  contentMinLevel: number;
  contentMaxLevel: number;
}

// How strict the matchmaker currently is. Decays with the longest wait in the
// pool; see RELAX_AFTER_SECONDS in matchmake.ts.
export type LfgRelax = 'ideal' | 'anchored' | 'any' | 'short';

export interface LfgQueueMember {
  pid: number;
  cls: PlayerClass;
  level: number;
  // Declared roles already intersected with the class's eligible roles.
  // Never empty: every class can fill 'dps'.
  roles: LfgRole[];
}

export interface LfgQueueUnit {
  id: number;
  dungeonId: string;
  members: LfgQueueMember[];
  joinedAt: number; // sim-clock seconds, preserved across a requeue
  premade: boolean; // joined as an existing party
}

export type LfgJoinDeny =
  | 'unknownDungeon' // no listing for that id
  | 'emptyGroup'
  | 'groupTooLarge' // more members than the listing's groupSize
  | 'duplicateMember' // the same pid appears twice in one request
  | 'alreadyQueued' // already in a unit, for THIS or any other dungeon
  | 'inProposal' // a member is sitting in an open ready check
  | 'levelTooLow'
  | 'onCooldown';

export interface LfgJoinResult {
  ok: boolean;
  unitId: number | null;
  deny: LfgJoinDeny | null;
  // Populated only for the denies that name a member or a number, so the
  // client can render one line without re-deriving anything.
  denyPid: number | null;
  requiredLevel: number | null;
  cooldownRemaining: number | null;
}

export type LfgProposalState = 'pending' | 'ready';

export interface LfgProposalMember {
  pid: number;
  unitId: number;
  role: LfgRole;
  responded: boolean;
  accepted: boolean;
}

export interface LfgProposal {
  id: number;
  dungeonId: string;
  state: LfgProposalState;
  relax: LfgRelax;
  createdAt: number;
  expiresAt: number; // ready-check deadline
  readyAt: number | null; // when everyone accepted; null while pending
  members: LfgProposalMember[];
  // The units that were pulled out of the queue to build this proposal. Kept
  // whole so a close can put them back with their original joinedAt.
  units: LfgQueueUnit[];
}

export type LfgCloseReason =
  | 'declined'
  | 'timedOut'
  | 'memberLeft'
  | 'memberUnavailable'
  | 'noSlot';

export type LfgPenaltyReason = 'declined' | 'timedOut';

// ---------------------------------------------------------------------------
// Intents. This subsystem NEVER mutates the world; it returns these and the
// host performs them.
//
// TRAP 1 (docs/design/parity-backlog.md): sim-to-UI event names are compared as
// strings. LFG_INTENT_KINDS is the frozen contract; anything consuming these
// must be pinned against it by a source-scanning test, not by tsc.
// ---------------------------------------------------------------------------

export const LFG_INTENT_KINDS = [
  'dungeonFinderProposalOpened',
  'dungeonFinderProposalClosed',
  'dungeonFinderFormGroup',
  'dungeonFinderPenalty',
] as const;

export type LfgIntentKind = (typeof LFG_INTENT_KINDS)[number];

export interface LfgProposalOpenedIntent {
  kind: 'dungeonFinderProposalOpened';
  proposalId: number;
  dungeonId: string;
  expiresAt: number;
  members: { pid: number; role: LfgRole }[];
}

export interface LfgProposalClosedIntent {
  kind: 'dungeonFinderProposalClosed';
  proposalId: number;
  dungeonId: string;
  reason: LfgCloseReason;
  // Everyone who was in the proposal, whether or not they were requeued.
  pids: number[];
  requeuedPids: number[];
}

// The pop. The host satisfies this by forming a party through its EXISTING
// party path and then calling its EXISTING enterDungeon(dungeonId, pid) for
// each member (obstacle 2: there is one authority path for group teleport and
// this subsystem must not grow a second one). No coordinates are returned here,
// deliberately.
export interface LfgFormGroupIntent {
  kind: 'dungeonFinderFormGroup';
  proposalId: number;
  dungeonId: string;
  leaderPid: number; // the longest-waiting member, deterministic
  members: { pid: number; role: LfgRole }[];
  undersized: boolean; // fewer than the listing's groupSize
  relax: LfgRelax;
}

export interface LfgPenaltyIntent {
  kind: 'dungeonFinderPenalty';
  pid: number;
  reason: LfgPenaltyReason;
  readyAt: number; // sim-clock seconds the player may queue again
}

export type LfgIntent =
  | LfgProposalOpenedIntent
  | LfgProposalClosedIntent
  | LfgFormGroupIntent
  | LfgPenaltyIntent;

// ---------------------------------------------------------------------------
// Queue state. Owned by the host (one record on Sim); every function in this
// directory takes it as an explicit argument.
// ---------------------------------------------------------------------------

export interface LfgQueueState {
  units: LfgQueueUnit[]; // sorted by joinedAt, then unit id
  proposals: LfgProposal[]; // sorted by id
  cooldowns: Map<number, number>; // pid -> sim-clock seconds it lifts
  nextUnitId: number;
  nextProposalId: number;
}

export interface LfgTickInput {
  now: number; // sim-clock seconds
  // Free instance slots per dungeon id, counted by the host RIGHT NOW
  // (obstacle 1: INSTANCE_SLOT_COUNT caps concurrent instances, per dungeon).
  freeInstanceSlots: Readonly<Record<string, number>>;
  // Liveness predicate. A queued player who went offline, died, or entered an
  // instance must return false so the queue drops them without a penalty.
  isAvailable: (pid: number) => boolean;
}

export interface LfgTickResult {
  intents: LfgIntent[];
}

export type LfgPlayerState = 'idle' | 'queued' | 'proposed' | 'cooldown';

export interface LfgRoleCounts {
  tank: number;
  healer: number;
  dps: number;
}

// Everything the HUD needs for one player, in ids and numbers only.
export interface LfgStatusView {
  state: LfgPlayerState;
  dungeonId: string | null;
  roles: LfgRole[];
  queuedAt: number | null;
  waitSeconds: number;
  relax: LfgRelax;
  queuedUnits: number; // units waiting for the same dungeon
  queuedPlayers: number;
  // Players willing to fill each role (a druid counts in all three, the way
  // every dungeon-finder readout has always counted).
  queuedByRole: LfgRoleCounts;
  proposalId: number | null;
  proposalExpiresAt: number | null;
  cooldownUntil: number | null;
}
