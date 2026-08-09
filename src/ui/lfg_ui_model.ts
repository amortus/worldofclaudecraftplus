// Pure, host-agnostic view model for the Dungeon Finder interface.
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference skills_panel_view.ts / crafting_ui_view.ts /
// rift_ui_model.ts). It owns every decision the Dungeon Finder surfaces make:
// which dungeons a player may queue for and in what order, which roles their
// request resolves to, how the live queue reads, how much of the ready-check
// window is left, and which of the known refusal rungs an arbitrary reason
// string maps to.
//
// DOM-free and i18n-free, so tests/lfg_ui_model.test.ts drives it directly.
// Every number here is raw: the label layer (lfg_ui_labels.ts) runs each one
// through `formatNumber`, and every word on screen is authored there.
//
// THE NAME IS `dungeonFinder`, NEVER `lfg`. The sim subsystem lives in
// `src/sim/lfg/` for upstream continuity, but `lfg` is ALREADY a joinable chat
// channel (JOINABLE_CHANNELS in sim.ts, ChatTabChannel in chat_channels.ts,
// `/join lfg`, the `hud.core.chatChannels.names.lfg` key). So while the four
// SimEvent NAMES below are the fixed wire contract and keep their historical
// spelling, no element id, translation key or player-visible label this feature
// produces may ever be `lfg`: they are all `dungeonFinder` / `dungeon-finder`.
//
// THE READY-CHECK COUNTDOWN IS DERIVED, NEVER STREAMED. The proposal carries one
// wall-clock `expiresAt`; the dialog subtracts `Date.now()` from it on the frame
// it paints, exactly as the rift tracker does, so a live countdown costs zero
// extra network traffic and cannot stall behind a dropped packet.

// ---------------------------------------------------------------------------
// The event contract (fixed; these four names and no others)
// ---------------------------------------------------------------------------

/** The player's live queue readout. Ids and numbers only. */
export interface LfgStatusEvent {
  type: 'lfgStatus';
  state: string;
  dungeonId: string | null;
  waitSeconds: number;
  queuedByRole: Record<string, number>;
}

/** A ready check opened: a group is assembled and waiting on answers. */
export interface LfgProposalEvent {
  type: 'lfgProposal';
  proposalId: string;
  dungeonId: string;
  /** Wall-clock ms (the `Date.now()` epoch) the ready window shuts. */
  expiresAt: number;
}

/** Everyone accepted; the group is formed and the run is on. */
export interface LfgFormedEvent {
  type: 'lfgFormed';
  dungeonId: string;
}

/** A join / answer was refused, or a proposal collapsed. `reason` is a stable
 *  id, never prose. */
export interface LfgDenyEvent {
  type: 'lfgDeny';
  reason: string;
}

export type DungeonFinderUiEvent =
  | LfgStatusEvent
  | LfgProposalEvent
  | LfgFormedEvent
  | LfgDenyEvent;

export type DungeonFinderUiEventType = DungeonFinderUiEvent['type'];

/** The frozen wire contract, in one place. Compared as STRINGS across the
 *  sim/UI seam, which `tsc` cannot check, so tests/lfg_ui_event_contract.test.ts
 *  pins both sides against this list. */
export const DUNGEON_FINDER_EVENTS = [
  'lfgStatus',
  'lfgProposal',
  'lfgFormed',
  'lfgDeny',
] as const;

const DUNGEON_FINDER_EVENT_TYPES = new Set<string>(DUNGEON_FINDER_EVENTS);

/** True when `type` names one of the four Dungeon Finder events. Lets the HUD's
 *  event loop route by NAME rather than as `case` labels on the `SimEvent`
 *  union, which is what keeps the HUD compiling while the sim-side variants land
 *  in a separate change (the shape `isCraftingFeedbackEventType` uses). */
export function isDungeonFinderEventType(type: string): boolean {
  return DUNGEON_FINDER_EVENT_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Mirrors `LfgRole` in sim/lfg/types.ts (itself an alias of the talent-tree
 *  Role). Restated rather than imported so this stays a pure leaf. */
export const LFG_ROLE_IDS = ['tank', 'healer', 'dps'] as const;
export type LfgRoleId = (typeof LFG_ROLE_IDS)[number];

export function isLfgRoleId(value: string): value is LfgRoleId {
  return (LFG_ROLE_IDS as readonly string[]).includes(value);
}

export interface LfgRoleCounts {
  tank: number;
  healer: number;
  dps: number;
}

/**
 * The ideal five: one tank, one healer, three damage. The matchmaker relaxes
 * away from this as a unit waits, but it is still the composition the readout
 * measures against, so a player can see at a glance which role the queue is
 * short of and reconsider their own.
 */
export const LFG_IDEAL_COMPOSITION: Readonly<LfgRoleCounts> = { tank: 1, healer: 1, dps: 3 };

function count(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Normalize the `queuedByRole` bag off the wire. A missing, negative, NaN or
 * fractional entry reads as zero rather than rendering "NaN tanks waiting":
 * a wrong number here would send a player to re-roll a spec they did not need.
 */
export function lfgRoleCounts(source: Readonly<Record<string, number>> | undefined): LfgRoleCounts {
  return {
    tank: count(source?.tank),
    healer: count(source?.healer),
    dps: count(source?.dps),
  };
}

export interface LfgRoleRow {
  role: LfgRoleId;
  count: number;
  /** How many that role needs for a textbook five. */
  needed: number;
  /** True once at least `needed` players can fill it. */
  satisfied: boolean;
}

/** One row per role, always all three and always in ladder order, so the readout
 *  never reflows as counts change. */
export function lfgRoleRows(counts: Readonly<LfgRoleCounts>): LfgRoleRow[] {
  return LFG_ROLE_IDS.map((role) => ({
    role,
    count: counts[role],
    needed: LFG_IDEAL_COMPOSITION[role],
    satisfied: counts[role] >= LFG_IDEAL_COMPOSITION[role],
  }));
}

/**
 * Resolve a role REQUEST against what a class can actually fill. An empty
 * request means "anything", which is the sim's own rule (`resolveRoles`): a
 * player who ticks nothing is the fastest to match, not the slowest.
 */
export function resolveRequestedRoles(
  requested: readonly string[],
  eligible: readonly string[],
): LfgRoleId[] {
  const allowed = LFG_ROLE_IDS.filter((role) => eligible.includes(role));
  // Every class can fill damage; a caller that hands us nothing eligible would
  // otherwise produce an unqueueable player.
  const base = allowed.length > 0 ? allowed : (['dps'] as LfgRoleId[]);
  const picked = base.filter((role) => requested.includes(role));
  return picked.length > 0 ? picked : base;
}

// ---------------------------------------------------------------------------
// Player state
// ---------------------------------------------------------------------------

/** Mirrors `LfgPlayerState` in sim/lfg/types.ts. */
export const LFG_PLAYER_STATES = ['idle', 'queued', 'proposed', 'cooldown'] as const;
export type LfgPlayerStateId = (typeof LFG_PLAYER_STATES)[number];

export function isLfgPlayerState(value: string): value is LfgPlayerStateId {
  return (LFG_PLAYER_STATES as readonly string[]).includes(value);
}

/**
 * Coerce a wire state to a known rung. An unknown value reads as `idle`, which
 * is the only safe guess: it offers the player the Join button back. Reading an
 * unknown state as `queued` would strand them with a Leave button for a queue
 * they are not in.
 */
export function lfgPlayerState(value: string): LfgPlayerStateId {
  return isLfgPlayerState(value) ? value : 'idle';
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Which granularity a span renders at. `expired` is terminal: the window has
 *  already shut. */
export type LfgTimeShape = 'hoursMinutes' | 'minutesSeconds' | 'seconds' | 'expired';

export interface LfgTimeSpan {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  shape: LfgTimeShape;
  expired: boolean;
}

function split(totalSeconds: number, allowExpired: boolean): LfgTimeSpan {
  const total = Math.max(0, totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const shape: LfgTimeShape =
    total <= 0 && allowExpired
      ? 'expired'
      : total >= 3600
        ? 'hoursMinutes'
        : total >= 60
          ? 'minutesSeconds'
          : 'seconds';
  return { totalSeconds: total, hours, minutes, seconds, shape, expired: allowExpired && total <= 0 };
}

/**
 * A remaining span, rounded UP to whole seconds. Rounding up is what makes the
 * boundaries behave on a live clock: 59_999 ms is already "1:00" rather than a
 * jittery "59" that then jumps back up, and a window with 1 ms left still reads
 * "1s" instead of claiming it has already shut.
 */
export function lfgCountdown(msRemaining: number): LfgTimeSpan {
  return split(msRemaining > 0 ? Math.ceil(msRemaining / 1000) : 0, true);
}

/** The countdown from `nowMs` to a wall-clock deadline. A deadline of 0 (or one
 *  before the epoch) means "no deadline was set" and reads as expired. */
export function lfgCountdownUntil(deadlineMs: number, nowMs: number): LfgTimeSpan {
  if (!(deadlineMs > 0)) return lfgCountdown(0);
  return lfgCountdown(deadlineMs - nowMs);
}

/**
 * An ELAPSED span (time already spent in queue), rounded DOWN and never
 * "expired": a wait of zero is a real, legible "0s", not a failure state. The
 * split from `lfgCountdown` is deliberate, since rounding a stopwatch up would
 * show "1s" the instant a player pressed Join.
 */
export function lfgWaitSpan(seconds: number): LfgTimeSpan {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return split(total, false);
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

/** The slice of `LfgListing` (sim/lfg/types.ts) the window draws. Structural, so
 *  `DUNGEON_FINDER_LISTINGS` satisfies it without this module importing the sim. */
export interface LfgListingLike {
  dungeonId: string;
  tier: string;
  groupSize: number;
  minGroupSize: number;
  minQueueLevel: number;
  recommendedLevel: number;
}

/** How strict the matchmaker currently is for this player's own wait. Mirrors
 *  `LfgRelax` in sim/lfg/types.ts. Strictness DECAYS as a unit waits, so this is
 *  the one honest answer to "why is this taking so long": the queue is already
 *  trying harder than it was a minute ago. */
export const LFG_RELAX_STEPS = ['ideal', 'anchored', 'any', 'short'] as const;
export type LfgRelaxId = (typeof LFG_RELAX_STEPS)[number];

/** Coerce a wire relax step. An unknown value reads as `ideal`, the strictest
 *  rung: promising a player the queue has loosened when it has not would be the
 *  worse lie of the two. */
export function lfgRelax(value: string): LfgRelaxId {
  return (LFG_RELAX_STEPS as readonly string[]).includes(value) ? (value as LfgRelaxId) : 'ideal';
}

/** Mirrors `LfgTier`. */
export const LFG_TIERS = ['leveling', 'endgame', 'heroic'] as const;
export type LfgTierId = (typeof LFG_TIERS)[number];

/** Coerce a wire tier. An unknown tier reads as `leveling`, the least alarming
 *  of the three; the level band beside it carries the real difficulty anyway. */
export function lfgTier(value: string): LfgTierId {
  return (LFG_TIERS as readonly string[]).includes(value) ? (value as LfgTierId) : 'leveling';
}

export interface LfgListingRow {
  dungeonId: string;
  tier: LfgTierId;
  groupSize: number;
  minGroupSize: number;
  minQueueLevel: number;
  recommendedLevel: number;
  /** True when the player clears the hard lower gate. */
  eligible: boolean;
  /** Levels still to gain before the row unlocks; 0 once eligible. */
  levelsToGo: number;
  /** True for the row the player has highlighted in the list. */
  selected: boolean;
  /** True for the dungeon the player is actually queued for. */
  queued: boolean;
}

export interface LfgListingsView {
  rows: LfgListingRow[];
  /** How many rows the player may queue for right now. */
  eligibleCount: number;
  /** The row the window will act on: the selection when it is still eligible,
   *  otherwise the lowest eligible row, otherwise null. Resolving it HERE is
   *  what stops the Join button ever pointing at a locked dungeon. */
  selectedDungeonId: string | null;
}

/**
 * The dungeon list, in ladder order (lowest gate first, ties on id so two
 * dungeons sharing a band never swap places between frames).
 *
 * There is deliberately NO upper level gate, matching the sim: a capped player
 * queueing for the lowest dungeon is often the tank that makes it pop, and in a
 * realm this size locking them out costs far more groups than it saves.
 */
export function buildLfgListingsView(
  listings: readonly LfgListingLike[],
  options: {
    playerLevel: number;
    selectedDungeonId?: string | null;
    queuedDungeonId?: string | null;
  },
): LfgListingsView {
  const level = Number.isFinite(options.playerLevel) ? Math.max(1, Math.floor(options.playerLevel)) : 1;
  const rows = listings
    .map((listing): LfgListingRow => {
      const eligible = level >= listing.minQueueLevel;
      return {
        dungeonId: listing.dungeonId,
        tier: lfgTier(listing.tier),
        groupSize: listing.groupSize,
        minGroupSize: listing.minGroupSize,
        minQueueLevel: listing.minQueueLevel,
        recommendedLevel: listing.recommendedLevel,
        eligible,
        levelsToGo: eligible ? 0 : listing.minQueueLevel - level,
        selected: false,
        queued: options.queuedDungeonId === listing.dungeonId,
      };
    })
    .sort(
      (a, b) =>
        a.minQueueLevel - b.minQueueLevel ||
        (a.dungeonId < b.dungeonId ? -1 : a.dungeonId > b.dungeonId ? 1 : 0),
    );

  // The queued dungeon always wins the highlight: while a player is waiting, the
  // window is a readout of THAT queue, not of whatever they last tapped.
  const queuedRow = rows.find((row) => row.queued) ?? null;
  const picked =
    queuedRow ??
    rows.find((row) => row.dungeonId === options.selectedDungeonId && row.eligible) ??
    rows.find((row) => row.eligible) ??
    null;
  if (picked) picked.selected = true;

  return {
    rows,
    eligibleCount: rows.filter((row) => row.eligible).length,
    selectedDungeonId: picked?.dungeonId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Queue readout
// ---------------------------------------------------------------------------

/**
 * The status the window renders. A structural SUPERSET-tolerant slice of both
 * `IWorld.dungeonFinderStatus` and the `lfgStatus` event payload, so the live
 * panel and an announcement can never describe the same queue differently.
 *
 * Everything past the four event fields is optional: the fixed event contract
 * carries only those four, and a client reading them alone must still render a
 * correct (if quieter) panel rather than an empty or wrong one.
 */
export interface LfgStatusInfo {
  state: string;
  dungeonId: string | null;
  waitSeconds: number;
  queuedByRole: Readonly<Record<string, number>>;
  /** The roles this player queued as, already intersected with their class. */
  roles?: readonly string[];
  /** How far the matchmaker has relaxed for this player's own wait. */
  relax?: string;
  /** Distinct players and distinct units waiting for the same dungeon. */
  queuedPlayers?: number;
  queuedUnits?: number;
  /** Wall-clock ms the queue cooldown lifts; 0 or absent means none is running. */
  cooldownUntil?: number;
}

export interface LfgQueueView {
  state: LfgPlayerStateId;
  dungeonId: string | null;
  /** True while the player holds a queue entry (waiting or in a ready check). */
  queued: boolean;
  /** True while a ready check is open for this player. */
  proposed: boolean;
  /** True while a decline / timeout penalty is still running. */
  onCooldown: boolean;
  wait: LfgTimeSpan;
  counts: LfgRoleCounts;
  roles: LfgRoleRow[];
  /** How far the matchmaker has relaxed for this player. */
  relax: LfgRelaxId;
  /** Distinct players waiting for this dungeon when the world reports it. Null
   *  when only the event's four fields are available. */
  queuedPlayers: number | null;
  /** Distinct players waiting for this dungeon. NOT the sum of the three role
   *  counts: a druid is counted in all three, exactly as every dungeon-finder
   *  readout has always counted, so summing them would trumpet a queue three
   *  times its real size. The honest floor is the largest single role. */
  waitingFloor: number;
  /** True when the three counts already cover the ideal five. */
  compositionReady: boolean;
  canJoin: boolean;
  canLeave: boolean;
  cooldown: LfgTimeSpan | null;
}

/** The whole queue readout, decided from one status payload plus the wall
 *  clock (the clock is only consulted for the cooldown, which is a deadline). */
export function buildLfgQueueView(status: LfgStatusInfo, nowMs: number): LfgQueueView {
  const state = lfgPlayerState(status.state);
  const counts = lfgRoleCounts(status.queuedByRole);
  const roles = lfgRoleRows(counts);
  const queued = state === 'queued' || state === 'proposed';
  return {
    state,
    dungeonId: status.dungeonId,
    queued,
    proposed: state === 'proposed',
    onCooldown: state === 'cooldown',
    wait: lfgWaitSpan(status.waitSeconds),
    counts,
    roles,
    relax: lfgRelax(status.relax ?? 'ideal'),
    queuedPlayers:
      typeof status.queuedPlayers === 'number' && Number.isFinite(status.queuedPlayers)
        ? Math.max(0, Math.floor(status.queuedPlayers))
        : null,
    waitingFloor: Math.max(counts.tank, counts.healer, counts.dps),
    compositionReady: roles.every((row) => row.satisfied),
    canJoin: state === 'idle',
    canLeave: queued,
    cooldown:
      state === 'cooldown' && typeof status.cooldownUntil === 'number' && status.cooldownUntil > 0
        ? lfgCountdownUntil(status.cooldownUntil, nowMs)
        : null,
  };
}

// ---------------------------------------------------------------------------
// Ready check
// ---------------------------------------------------------------------------

/**
 * What a decline and a no-answer actually cost, in sim-clock seconds.
 *
 * Restated here rather than imported so this stays a pure leaf;
 * tests/lfg_ui_model.test.ts pins both against `LFG_DECLINE_COOLDOWN_SEC` /
 * `LFG_TIMEOUT_COOLDOWN_SEC` in `src/sim/lfg`, so a retune fails a test instead
 * of quietly lying to the player in the one dialog where the number decides
 * their answer.
 */
export const DUNGEON_FINDER_DECLINE_PENALTY_SEC = 120;
export const DUNGEON_FINDER_TIMEOUT_PENALTY_SEC = 300;

/** Below this many seconds left the dialog goes urgent (the countdown reddens
 *  and the progress bar with it). Ten seconds is roughly the last quarter of the
 *  40 s window, which is about as late as a player can still read, decide and
 *  reach for the button. */
export const DUNGEON_FINDER_URGENT_SEC = 10;

export interface LfgProposalInfo {
  proposalId: string;
  dungeonId: string;
  /** Wall-clock ms the window shuts. */
  expiresAt: number;
  /** Wall-clock ms the client first saw the proposal. The event carries no
   *  opened-at, so the consumer stamps it; the bar needs a span, not an
   *  instant. */
  openedAt: number;
  /** The role the matchmaker assigned this player, when the world reports it. */
  role?: string;
  /** Group size and how many have accepted so far, for the "3 of 5 ready" row. */
  size?: number;
  acceptedCount?: number;
  /** True once this player has answered. */
  responded?: boolean;
}

export interface LfgReadyCheckView {
  proposalId: string;
  dungeonId: string;
  countdown: LfgTimeSpan;
  /** Share of the window still left, 0..100, for the bar width and the ARIA
   *  value. Falls to 0 the moment the window shuts. */
  percentRemaining: number;
  /** True in the last seconds: the one moment the UI is allowed to shout. */
  urgent: boolean;
  expired: boolean;
  /** Answering is only meaningful while the window is open and unanswered. */
  canAnswer: boolean;
  /** The role this player was assigned, when the world reports one. */
  role: LfgRoleId | null;
  /** "3 of 5 ready", when the world reports the tally. */
  size: number | null;
  acceptedCount: number | null;
  responded: boolean;
  declinePenaltySeconds: number;
  timeoutPenaltySeconds: number;
}

/**
 * The ready check as the player sees it. Everything is derived from the two
 * timestamps and the wall clock, so the dialog needs no ticking message from the
 * server and cannot show a stale clock if one is dropped.
 *
 * A window whose `openedAt` is missing or after `expiresAt` (a clock skew, a
 * replayed event) still yields a sane bar: the span floors at one second rather
 * than dividing by zero.
 */
export function buildReadyCheckView(proposal: LfgProposalInfo, nowMs: number): LfgReadyCheckView {
  const countdown = lfgCountdownUntil(proposal.expiresAt, nowMs);
  const windowMs = Math.max(1000, proposal.expiresAt - proposal.openedAt);
  const percentRemaining = countdown.expired
    ? 0
    : Math.max(0, Math.min(100, Math.round(((countdown.totalSeconds * 1000) / windowMs) * 100)));
  const responded = proposal.responded === true;
  const role = proposal.role !== undefined && isLfgRoleId(proposal.role) ? proposal.role : null;
  const size =
    typeof proposal.size === 'number' && Number.isFinite(proposal.size)
      ? Math.max(0, Math.floor(proposal.size))
      : null;
  const acceptedCount =
    typeof proposal.acceptedCount === 'number' && Number.isFinite(proposal.acceptedCount)
      ? Math.max(0, Math.floor(proposal.acceptedCount))
      : null;
  return {
    proposalId: proposal.proposalId,
    dungeonId: proposal.dungeonId,
    countdown,
    percentRemaining,
    urgent: !countdown.expired && countdown.totalSeconds <= DUNGEON_FINDER_URGENT_SEC,
    expired: countdown.expired,
    canAnswer: !countdown.expired && !responded,
    role,
    size,
    acceptedCount,
    responded,
    declinePenaltySeconds: DUNGEON_FINDER_DECLINE_PENALTY_SEC,
    timeoutPenaltySeconds: DUNGEON_FINDER_TIMEOUT_PENALTY_SEC,
  };
}

// ---------------------------------------------------------------------------
// Denial reasons
// ---------------------------------------------------------------------------

/**
 * Every reason a Dungeon Finder action can be refused, or a proposal collapse
 * the player is told about. `lfgDeny` carries a bare id, so this list IS the
 * contract on the client side: each rung has authored copy
 * (tests/lfg_ui_model.test.ts pins that none is missing), and `unknown` is the
 * catch-all a newer server's reason lands on rather than a blank toast.
 *
 * The three groups mirror the sim's own unions: `LfgJoinDeny` (8),
 * `LfgRespondDeny` (3) and `LfgCloseReason` (5).
 */
export const DUNGEON_FINDER_DENY_REASONS = [
  // LfgJoinDeny
  'unknownDungeon',
  'emptyGroup',
  'groupTooLarge',
  'duplicateMember',
  'alreadyQueued',
  'inProposal',
  'levelTooLow',
  'onCooldown',
  // LfgRespondDeny
  'noProposal',
  'wrongProposal',
  'alreadyResponded',
  // LfgCloseReason
  'declined',
  'timedOut',
  'memberLeft',
  'memberUnavailable',
  'noSlot',
  // catch-all
  'unknown',
] as const;
export type DungeonFinderDenyReason = (typeof DUNGEON_FINDER_DENY_REASONS)[number];

/** Wire spellings folded onto the canonical rung. Keys are the reason lowercased
 *  with every non-alphanumeric character stripped, so `level_too_low`,
 *  `levelTooLow`, `LEVEL-TOO-LOW` and `level too low` are one entry. */
const DENY_SYNONYMS: Readonly<Record<string, DungeonFinderDenyReason>> = {
  unknowndungeon: 'unknownDungeon',
  nodungeon: 'unknownDungeon',
  nolisting: 'unknownDungeon',
  emptygroup: 'emptyGroup',
  noparty: 'emptyGroup',
  grouptoolarge: 'groupTooLarge',
  partytoolarge: 'groupTooLarge',
  toomanymembers: 'groupTooLarge',
  duplicatemember: 'duplicateMember',
  alreadyqueued: 'alreadyQueued',
  queued: 'alreadyQueued',
  inqueue: 'alreadyQueued',
  inproposal: 'inProposal',
  inreadycheck: 'inProposal',
  leveltoolow: 'levelTooLow',
  lowlevel: 'levelTooLow',
  minlevel: 'levelTooLow',
  oncooldown: 'onCooldown',
  cooldown: 'onCooldown',
  penalty: 'onCooldown',
  noproposal: 'noProposal',
  noreadycheck: 'noProposal',
  wrongproposal: 'wrongProposal',
  staleproposal: 'wrongProposal',
  alreadyresponded: 'alreadyResponded',
  alreadyanswered: 'alreadyResponded',
  declined: 'declined',
  memberdeclined: 'declined',
  timedout: 'timedOut',
  timeout: 'timedOut',
  expired: 'timedOut',
  memberleft: 'memberLeft',
  memberquit: 'memberLeft',
  memberunavailable: 'memberUnavailable',
  memberoffline: 'memberUnavailable',
  memberdead: 'memberUnavailable',
  noslot: 'noSlot',
  nofreeinstance: 'noSlot',
  instancesbusy: 'noSlot',
  unknown: 'unknown',
};

/** The canonical rung a wire reason maps to; `unknown` when nothing matches. */
export function dungeonFinderDenyReason(reason: string): DungeonFinderDenyReason {
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DENY_SYNONYMS[normalized] ?? 'unknown';
}

/**
 * The rungs that mean "your assembled group fell apart", as opposed to "your
 * request was refused". They read as news rather than as an error, and the HUD
 * uses this to pick the tone: a group that collapsed because a fifth player
 * went offline is not the player's mistake.
 */
const COLLAPSE_REASONS = new Set<DungeonFinderDenyReason>([
  'declined',
  'timedOut',
  'memberLeft',
  'memberUnavailable',
  'noSlot',
]);

export function isProposalCollapseReason(reason: DungeonFinderDenyReason): boolean {
  return COLLAPSE_REASONS.has(reason);
}

/** True for the two rungs that cost the player a cooldown. Only these two earn
 *  the penalty line in the toast; saying "this costs you 120 seconds" after a
 *  collapse someone else caused would be a lie. */
export function denyCostsCooldown(reason: DungeonFinderDenyReason): boolean {
  return reason === 'declined' || reason === 'timedOut';
}

/**
 * Whether an `lfgDeny` means the open ready check is GONE.
 *
 * This is the difference between closing a dead dialog and destroying a live
 * one. A collapse ended the proposal, and `noProposal` / `wrongProposal` say the
 * popup on screen is stale, so all of those close it. Every other rung is a
 * refusal of something ELSE the player tried (a second join, a second answer, a
 * queue they are already in) while the ready check is still counting down:
 * tearing it down for one of those would hand the player the 300 second timeout
 * penalty for a keypress that was merely redundant.
 */
export function denyEndsReadyCheck(reason: DungeonFinderDenyReason): boolean {
  return isProposalCollapseReason(reason) || reason === 'noProposal' || reason === 'wrongProposal';
}

// ---------------------------------------------------------------------------
// Ready-check lifecycle
// ---------------------------------------------------------------------------

/** What the consumer should do with the ready-check dialog this frame. */
export type ReadyCheckAction = 'open' | 'keep' | 'close' | 'ignore';

export interface ReadyCheckReconcileInput {
  /** The proposal id the world reports right now, or null. */
  liveProposalId: string | null;
  /** The proposal id the dialog is currently showing, or null. */
  localProposalId: string | null;
  /** Wall-clock ms at which the world last confirmed the LOCAL proposal, or
   *  null when it never has (the dialog is running purely off the event). */
  lastConfirmedAt: number | null;
  /** The proposal whose window already ran out, so it is never re-raised. */
  expiredProposalId: string | null;
  nowMs: number;
  graceMs: number;
}

/**
 * Reconcile the event-raised dialog against the world's own copy.
 *
 * Two failure modes this exists to prevent, both of which cost a player the
 * 300 second timeout penalty for nothing:
 *
 *  - CLOSING TOO EAGERLY. The `lfgProposal` event can land a snapshot ahead of
 *    the mirrored `dungeonFinderProposal`, and a host that never mirrors it at
 *    all would otherwise have the whole 40 second ready check vanish. So the
 *    grace window runs from the last time the world CONFIRMED this proposal,
 *    and a proposal the world has never confirmed is never closed by reconcile:
 *    its own countdown and the sim's `lfgDeny` are what end it.
 *  - RE-OPENING A DEAD CHECK. Once the window has run out the dialog steps
 *    aside, but the world can still report the proposal for a few frames before
 *    the server closes it. Re-raising it would loop: reopen, repaint, expire,
 *    reopen, with a stacked timer each pass.
 */
export function reconcileReadyCheck(input: ReadyCheckReconcileInput): ReadyCheckAction {
  const { liveProposalId, localProposalId, lastConfirmedAt, expiredProposalId } = input;
  if (liveProposalId !== null) {
    if (liveProposalId === expiredProposalId) return 'ignore';
    return 'open';
  }
  if (localProposalId === null) return 'ignore';
  if (lastConfirmedAt === null) return 'keep';
  return input.nowMs - lastConfirmedAt > input.graceMs ? 'close' : 'keep';
}
