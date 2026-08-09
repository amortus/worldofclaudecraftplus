// Pure, host-agnostic view model for the procedural Rift interface.
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference skills_panel_view.ts / crafting_ui_view.ts). It owns
// every decision the rift surfaces make: which rank a run is on and how that
// rank is presented without leaning on colour, where the party sits on the
// floor ladder, how much of the overworld entrance window is left, which
// portals in a zone are worth drawing and in what order, and which of the known
// denial reasons an arbitrary reason string maps to.
//
// DOM-free and i18n-free, so tests/rift_ui_model.test.ts drives it directly.
// Every number here is raw: the label layer (rift_ui_labels.ts) runs each one
// through `formatNumber`, and every word on screen is authored there.
//
// THE COUNTDOWN IS DERIVED, NEVER STREAMED. A run carries a single
// `entranceClosesAt` wall-clock timestamp and a portal carries `opensAt` /
// `expiresAt`; the tracker subtracts `Date.now()` from them on the frame it
// paints. Nothing here asks the server for a tick, so a live countdown costs
// zero extra network traffic.

// ---------------------------------------------------------------------------
// The event contract (fixed; these five names and no others)
// ---------------------------------------------------------------------------

/** A rift portal opened, is about to open, or collapsed in some zone. */
export interface RiftPortalEvent {
  type: 'riftPortal';
  portalId: string;
  zoneId: string;
  rank: string;
  opensAt: number;
  expiresAt: number;
  open: boolean;
}

/** The party stepped through into a rift. */
export interface RiftEnterEvent {
  type: 'riftEnter';
  rank: string;
  floorIndex: number;
  floorCount: number;
  themeId: string;
}

/** The party arrived on a floor (including the first one). */
export interface RiftFloorEvent {
  type: 'riftFloor';
  floorIndex: number;
  floorCount: number;
  themeId: string;
  mechanicId: string;
}

/** The final boss fell and the rift sealed. */
export interface RiftClearEvent {
  type: 'riftClear';
  rank: string;
  floors: number;
  firstClear: boolean;
}

/** An entry attempt was refused. `reason` is a stable id, never prose. */
export interface RiftDenyEvent {
  type: 'riftDeny';
  reason: string;
}

export type RiftUiEvent =
  | RiftPortalEvent
  | RiftEnterEvent
  | RiftFloorEvent
  | RiftClearEvent
  | RiftDenyEvent;

export type RiftUiEventType = RiftUiEvent['type'];

const RIFT_EVENT_TYPES = new Set<string>([
  'riftPortal',
  'riftEnter',
  'riftFloor',
  'riftClear',
  'riftDeny',
]);

/** True when `type` names one of the five rift events. Lets the HUD's event
 *  loop route by name without re-listing the variants at the call site (the
 *  same shape `isCraftingFeedbackEventType` uses), which is what keeps the HUD
 *  compiling while the sim-side `SimEvent` variants land separately. */
export function isRiftUiEventType(type: string): boolean {
  return RIFT_EVENT_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// The IWorld slice the rift surfaces read
// ---------------------------------------------------------------------------

/**
 * The active run, as `IWorld.riftRun` reports it. Ids and numbers only: this is
 * a string-free seam, so every word comes from the label layer.
 */
export interface RiftRunInfo {
  rank: string;
  /** Zero-based floor the party is standing on. */
  floorIndex: number;
  floorCount: number;
  themeId: string;
  mechanicId: string;
  /**
   * Wall-clock ms (the `Date.now()` epoch) at which the overworld entrance
   * stops admitting new parties. The tracker derives its countdown from this
   * every frame; 0 or a negative value means the run carries no deadline.
   */
  entranceClosesAt: number;
  /** True once the last boss has fallen and the rift is sealed. */
  sealed?: boolean;
}

/** One overworld portal, as `IWorld.riftPortals` reports it. Field-for-field
 *  the payload of the `riftPortal` event, so a live list and an announcement
 *  can never describe the same portal differently. */
export interface RiftPortalInfo {
  portalId: string;
  zoneId: string;
  rank: string;
  opensAt: number;
  expiresAt: number;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

/** The rank ladder, weakest first. Mirrors `RiftRank` in sim/rift/types.ts. */
export const RIFT_RANKS = ['C', 'B', 'A', 'S'] as const;
export type RiftRankId = (typeof RIFT_RANKS)[number];

export function isRiftRank(value: string): value is RiftRankId {
  return (RIFT_RANKS as readonly string[]).includes(value);
}

/** Coerce a wire rank to a known rung. An unknown value falls to C, the entry
 *  rung: a rift that reads easier than it is would be a lie, but a rift that
 *  reads harder than it is would be worse. */
export function riftRank(value: string): RiftRankId {
  const upper = value.trim().toUpperCase();
  return isRiftRank(upper) ? upper : 'C';
}

/**
 * The rank GLYPH: the bare letter C / B / A / S. Deliberately not a `t()` key.
 * The ladder is a fixed four-symbol alphabet the way a chess file is, and a
 * translated rung would break every cross-locale conversation about it.
 */
export function riftRankGlyph(rank: RiftRankId): string {
  return rank;
}

/** Where a rank sits on the ladder, 1 (C) to 4 (S). Drawn as that many pips so
 *  the rung survives greyscale, colour blindness, and a squinting phone. */
export function riftRankPips(rank: RiftRankId): number {
  return RIFT_RANKS.indexOf(rank) + 1;
}

/**
 * Rank colours. Every one clears 4.5:1 against the panel's near-black surface
 * (#0e0c08), and NONE of them is the only carrier of the rung: the glyph, the
 * pip count and the localized rank name all say it too (src/ui/CLAUDE.md, "no
 * information by colour alone").
 */
export const RIFT_RANK_COLOR: Readonly<Record<RiftRankId, string>> = {
  C: '#7fdc4f',
  B: '#6fb8ff',
  A: '#c9a6f0',
  S: '#ff8a3a',
};

// ---------------------------------------------------------------------------
// Countdowns, derived from a timestamp
// ---------------------------------------------------------------------------

/** Which granularity a remaining span renders at. `expired` is the terminal
 *  state: the entrance has already sealed. */
export type RiftCountdownShape = 'hoursMinutes' | 'minutesSeconds' | 'seconds' | 'expired';

export interface RiftCountdown {
  /** Whole seconds left, rounded UP, so a live countdown never shows 0 while
   *  the door is still open. Zero exactly when `expired`. */
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  shape: RiftCountdownShape;
  expired: boolean;
}

/**
 * Split a remaining-ms span into the parts the countdown renders. Rounding UP
 * to whole seconds is what makes the boundaries behave: 59_999 ms is already
 * "1:00" rather than a jittery "59" that then jumps back up.
 */
export function riftCountdown(msRemaining: number): RiftCountdown {
  const totalSeconds = msRemaining > 0 ? Math.ceil(msRemaining / 1000) : 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const shape: RiftCountdownShape =
    totalSeconds <= 0
      ? 'expired'
      : totalSeconds >= 3600
        ? 'hoursMinutes'
        : totalSeconds >= 60
          ? 'minutesSeconds'
          : 'seconds';
  return { totalSeconds, hours, minutes, seconds, shape, expired: totalSeconds <= 0 };
}

/** The countdown from `nowMs` to a wall-clock deadline. A deadline of 0 (or
 *  earlier than the epoch) means "no deadline was set" and reads as expired. */
export function riftCountdownUntil(deadlineMs: number, nowMs: number): RiftCountdown {
  if (!(deadlineMs > 0)) return riftCountdown(0);
  return riftCountdown(deadlineMs - nowMs);
}

// ---------------------------------------------------------------------------
// Floor ladder
// ---------------------------------------------------------------------------

export interface RiftFloorProgress {
  /** Zero-based, clamped into the run. */
  index: number;
  /** One-based, the number the player reads: "Floor {current} of {total}". */
  current: number;
  total: number;
  /** True on the boss floor, the one that seals the rift. */
  isFinal: boolean;
  /** Floors completed as a whole percent, 0..100 (the bar width + aria value). */
  percent: number;
}

/**
 * Where the party stands on the ladder. A floor count below 1 is coerced to 1
 * and the index is clamped into it, so a stale or truncated snapshot renders
 * "Floor 1 of 1" rather than "Floor 0 of 0" or a negative bar.
 */
export function riftFloorProgress(floorIndex: number, floorCount: number): RiftFloorProgress {
  const total = Math.max(1, Math.floor(floorCount) || 1);
  const index = Math.max(0, Math.min(total - 1, Math.floor(floorIndex) || 0));
  return {
    index,
    current: index + 1,
    total,
    isFinal: index === total - 1,
    percent: Math.round((index / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Tracker view
// ---------------------------------------------------------------------------

export interface RiftTrackerView {
  rank: RiftRankId;
  rankPips: number;
  rankColor: string;
  floor: RiftFloorProgress;
  themeId: string;
  mechanicId: string;
  /** True on the boss floor, where the warden IS the floor's mechanic (the
   *  generator always tags a boss floor `none`), so the mechanic line names the
   *  warden instead of reading "nothing to solve". */
  bossFloor: boolean;
  entrance: RiftCountdown;
  /** True once the last boss fell: the tracker stops nagging about the door. */
  sealed: boolean;
}

/** The whole in-rift tracker, decided from the live run plus the wall clock. */
export function buildRiftTrackerView(run: RiftRunInfo, nowMs: number): RiftTrackerView {
  const rank = riftRank(run.rank);
  const floor = riftFloorProgress(run.floorIndex, run.floorCount);
  const mechanicId = riftMechanicId(run.mechanicId);
  return {
    rank,
    rankPips: riftRankPips(rank),
    rankColor: RIFT_RANK_COLOR[rank],
    floor,
    themeId: run.themeId,
    mechanicId,
    bossFloor: floor.isFinal && mechanicId === 'none',
    entrance: riftCountdownUntil(run.entranceClosesAt, nowMs),
    sealed: run.sealed === true,
  };
}

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

/** A portal's life stage at a given instant. `pending` is the tear widening
 *  before it admits anyone; `closed` covers both "collapsed" and "the server
 *  says it is shut", so a stale `open: true` can never offer a dead door. */
export type RiftPortalPhase = 'pending' | 'open' | 'closed';

export interface RiftPortalRow {
  portalId: string;
  zoneId: string;
  rank: RiftRankId;
  rankPips: number;
  rankColor: string;
  phase: RiftPortalPhase;
  /** Counts down to `opensAt` while pending and to `expiresAt` while open;
   *  expired once closed. */
  countdown: RiftCountdown;
  /** True only when the player may actually step through right now. */
  enterable: boolean;
}

export interface RiftPortalView {
  rows: RiftPortalRow[];
  /** How many rows are admitting parties right now. */
  openCount: number;
}

export function riftPortalPhase(portal: RiftPortalInfo, nowMs: number): RiftPortalPhase {
  if (portal.expiresAt > 0 && nowMs >= portal.expiresAt) return 'closed';
  if (portal.opensAt > 0 && nowMs < portal.opensAt) return 'pending';
  return portal.open ? 'open' : 'closed';
}

function portalRow(portal: RiftPortalInfo, nowMs: number): RiftPortalRow {
  const rank = riftRank(portal.rank);
  const phase = riftPortalPhase(portal, nowMs);
  const countdown =
    phase === 'pending'
      ? riftCountdownUntil(portal.opensAt, nowMs)
      : phase === 'open'
        ? riftCountdownUntil(portal.expiresAt, nowMs)
        : riftCountdown(0);
  return {
    portalId: portal.portalId,
    zoneId: portal.zoneId,
    rank,
    rankPips: riftRankPips(rank),
    rankColor: RIFT_RANK_COLOR[rank],
    phase,
    countdown,
    enterable: phase === 'open',
  };
}

const PHASE_ORDER: Readonly<Record<RiftPortalPhase, number>> = { open: 0, pending: 1, closed: 2 };

/**
 * The portal list a player sees, optionally narrowed to one zone. Open tears
 * first (soonest to collapse at the top, since that is the one worth running
 * for), then the ones still widening (soonest to open first), then the dead
 * ones. Ties break on `portalId` so two portals that opened on the same tick
 * never swap places between frames.
 */
export function buildRiftPortalView(
  portals: readonly RiftPortalInfo[],
  nowMs: number,
  options: { zoneId?: string; includeClosed?: boolean } = {},
): RiftPortalView {
  const rows = portals
    .filter((p) => options.zoneId === undefined || p.zoneId === options.zoneId)
    .map((p) => portalRow(p, nowMs))
    .filter((row) => options.includeClosed === true || row.phase !== 'closed')
    .sort(
      (a, b) =>
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        a.countdown.totalSeconds - b.countdown.totalSeconds ||
        (a.portalId < b.portalId ? -1 : a.portalId > b.portalId ? 1 : 0),
    );
  return { rows, openCount: rows.filter((row) => row.phase === 'open').length };
}

// ---------------------------------------------------------------------------
// Stable-id normalisation
// ---------------------------------------------------------------------------

/**
 * The catalog leaf a `rift.*` generator id resolves to. The sim emits
 * `rift.theme.frost` / `rift.noun.hoarfrost` / `rift.object.rune_pylon`; the
 * English lives under `hudChrome.rift.<group>.<leaf>`, so the id's own `rift.`
 * prefix is dropped and anything a catalog path cannot carry is folded to `_`.
 * Returns null for an id that is not a `rift.*` id at all, so a caller renders
 * its fallback instead of minting a key that would throw.
 */
export function riftIdKeyPath(id: string): string | null {
  if (!id.startsWith('rift.')) return null;
  const rest = id.slice('rift.'.length);
  if (rest.length === 0) return null;
  return rest
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, '_'))
    .join('.');
}

/** The floor mechanics the generator can put on a floor, plus `none`. Mirrors
 *  `RiftMechanicKind` in sim/rift/types.ts. */
export const RIFT_MECHANICS = [
  'none',
  'rune_pylons',
  'ice_slide',
  'boulder_push',
  'sequence',
  'switch_gate',
] as const;
export type RiftMechanicId = (typeof RIFT_MECHANICS)[number];

export function isRiftMechanicId(value: string): value is RiftMechanicId {
  return (RIFT_MECHANICS as readonly string[]).includes(value);
}

/** Coerce a wire mechanic id to a known kind. An unknown kind reads as `none`
 *  (clear the room), which is always true of every floor. */
export function riftMechanicId(value: string): RiftMechanicId {
  return isRiftMechanicId(value) ? value : 'none';
}

// ---------------------------------------------------------------------------
// Denial reasons
// ---------------------------------------------------------------------------

/**
 * Every reason an entry attempt can be refused. `riftDeny` carries a bare id,
 * so this list IS the contract on the client side: each rung has authored copy
 * (tests/rift_ui_labels.test.ts pins that none is missing), and `unknown` is
 * the catch-all a newer server's reason lands on rather than a blank toast.
 */
export const RIFT_DENY_REASONS = [
  'closed',
  'expired',
  'notOpen',
  'sealed',
  'level',
  'party',
  'partyRange',
  'combat',
  'dead',
  'inRun',
  'inInstance',
  'noInstance',
  'range',
  'unknown',
] as const;
export type RiftDenyReason = (typeof RIFT_DENY_REASONS)[number];

/** Wire spellings folded onto the canonical rung. Keys are the reason string
 *  lowercased with every non-alphanumeric character stripped, so `not_open`,
 *  `notOpen`, `NOT-OPEN` and `not open` are one entry. */
const DENY_SYNONYMS: Readonly<Record<string, RiftDenyReason>> = {
  closed: 'closed',
  entranceclosed: 'closed',
  doorclosed: 'closed',
  toolate: 'closed',
  expired: 'expired',
  portalexpired: 'expired',
  collapsed: 'expired',
  notopen: 'notOpen',
  notyetopen: 'notOpen',
  pending: 'notOpen',
  sealed: 'sealed',
  cleared: 'sealed',
  alreadycleared: 'sealed',
  level: 'level',
  lowlevel: 'level',
  minlevel: 'level',
  requireslevel: 'level',
  party: 'party',
  noparty: 'party',
  partysize: 'party',
  partyfull: 'party',
  partytoolarge: 'party',
  grouprequired: 'party',
  partyrange: 'partyRange',
  partytoofar: 'partyRange',
  partynotnearby: 'partyRange',
  combat: 'combat',
  incombat: 'combat',
  dead: 'dead',
  ghost: 'dead',
  isdead: 'dead',
  inrun: 'inRun',
  inrift: 'inRun',
  alreadyinrift: 'inRun',
  alreadyinside: 'inRun',
  ininstance: 'inInstance',
  indungeon: 'inInstance',
  instanced: 'inInstance',
  noinstance: 'noInstance',
  nofreeinstance: 'noInstance',
  instancesbusy: 'noInstance',
  busy: 'noInstance',
  range: 'range',
  toofar: 'range',
  outofrange: 'range',
  unknown: 'unknown',
};

/** The canonical rung a wire reason maps to; `unknown` when nothing matches. */
export function riftDenyReason(reason: string): RiftDenyReason {
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DENY_SYNONYMS[normalized] ?? 'unknown';
}
