// The word layer for the Dungeon Finder interface.
//
// The sim's matchmaker (src/sim/lfg/) is entirely language-agnostic: it emits
// stable ids and numbers and nothing else, by design. So every syllable a player
// reads about the queue is authored HERE, against the English-only
// `hudChrome.dungeonFinder.*` catalog domain, and every number goes through
// `formatNumber`.
//
// It sits between the pure model (lfg_ui_model.ts, which decides WHAT to say)
// and the DOM consumer (dungeon_finder_window.ts, which decides where it goes).
// Nothing here touches the DOM, so tests/lfg_ui_model.test.ts drives both halves
// directly (one test file, since the model and its words are one contract).
//
// NO CONCATENATION. Where two sentences must read as one line, the join is its
// own key with placeholders (`readyBodyWithCosts`, `denyWithPenalty`), never a
// `${a} ${b}` at a call site: a locale is free to reorder the halves, and a
// hand-built join silently freezes English word order into all fourteen.

import { tEntity } from './entity_i18n';
import { formatNumber, t, type TranslationKey } from './i18n';
import {
  type DungeonFinderDenyReason,
  type DungeonFinderUiEvent,
  type LfgPlayerStateId,
  type LfgRelaxId,
  type LfgRoleId,
  type LfgTierId,
  type LfgTimeSpan,
  DUNGEON_FINDER_DECLINE_PENALTY_SEC,
  DUNGEON_FINDER_TIMEOUT_PENALTY_SEC,
  denyCostsCooldown,
  dungeonFinderDenyReason,
  isProposalCollapseReason,
  lfgCountdown,
} from './lfg_ui_model';

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0, useGrouping: false });
}

/** Two-digit seconds for a clock-shaped span ("2:07"), localized digits and all.
 *  `minimumIntegerDigits` is what pads it, never a hand-rolled `padStart`, which
 *  would emit ASCII zeroes into a non-latin locale. */
function pad2(value: number): string {
  return formatNumber(value, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  });
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * A span as the player reads it: "1h 12m" over an hour, "2:07" over a minute,
 * "38s" under one, and the expired word once a countdown runs out. Digits are
 * spliced into a `t()` template rather than concatenated, so a locale is free to
 * reorder the units.
 */
export function lfgTimeText(span: LfgTimeSpan): string {
  switch (span.shape) {
    case 'hoursMinutes':
      return t('hudChrome.dungeonFinder.time.hoursMinutes', {
        h: num(span.hours),
        m: num(span.minutes),
      });
    case 'minutesSeconds':
      return t('hudChrome.dungeonFinder.time.minutesSeconds', {
        m: num(span.minutes),
        s: pad2(span.seconds),
      });
    case 'seconds':
      return t('hudChrome.dungeonFinder.time.seconds', { s: num(span.seconds) });
    case 'expired':
      return t('hudChrome.dungeonFinder.time.expired');
  }
}

/** A plain penalty duration ("2 minutes worth of seconds") rendered the same way
 *  every countdown is, so the cost quoted in the ready check and the cost quoted
 *  in the toast are visibly the same number. */
export function lfgPenaltyText(seconds: number): string {
  return lfgTimeText(lfgCountdown(seconds * 1000));
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** The localized dungeon name. Falls back to the id inside `tEntity` for a
 *  dungeon this client's content tables do not know yet. */
export function lfgDungeonName(dungeonId: string): string {
  return tEntity({ kind: 'dungeon', id: dungeonId, field: 'name' });
}

/** "Tank" / "Healer" / "Damage". */
export function lfgRoleName(role: LfgRoleId): string {
  return t(`hudChrome.dungeonFinder.role.${role}` as TranslationKey);
}

/**
 * How hard the matchmaker is currently trying for this player, in words.
 *
 * Strictness decays with a unit's own wait, so this is the one honest answer to
 * "why is this taking so long": the queue is already looser than it was a minute
 * ago, and at `short` it will pop an undersized group. Saying so beats an
 * unexplained spinner.
 */
export function lfgRelaxText(relax: LfgRelaxId): string {
  return t(`hudChrome.dungeonFinder.relax.${relax}` as TranslationKey);
}

/** "Leveling" / "Endgame" / "Heroic": the derived difficulty band. */
export function lfgTierName(tier: LfgTierId): string {
  return t(`hudChrome.dungeonFinder.tier.${tier}` as TranslationKey);
}

/** The level band a dungeon is built for, as one reorderable line. */
export function lfgLevelBandText(minLevel: number, maxLevel: number): string {
  return t('hudChrome.dungeonFinder.levelBand', { min: num(minLevel), max: num(maxLevel) });
}

/** The hard lower gate, spelled out on a locked row. */
export function lfgRequiresLevelText(level: number): string {
  return t('hudChrome.dungeonFinder.requiresLevel', { level: num(level) });
}

/**
 * The accessible name of a LOCKED dungeon row: the dungeon plus the gate that
 * shuts it, joined by a key.
 *
 * The join is a key rather than a `${name}, ${gate}` at the call site for the
 * same reason `bodyWithWarning` is one: a locale owns both the separator and the
 * order, and a hard-coded comma freezes English punctuation into all fourteen.
 */
export function lfgLockedRowAria(dungeonName: string, minLevel: number): string {
  return t('hudChrome.dungeonFinder.lockedRowAria', {
    dungeon: dungeonName,
    requirement: lfgRequiresLevelText(minLevel),
  });
}

/** How many levels a locked row is still away. */
export function lfgLevelsToGoText(levels: number): string {
  return t('hudChrome.dungeonFinder.levelsToGo', { levels: num(levels) });
}

/** "Five players, pops with three or more": the group size and the shorted
 *  floor, so a player knows before queueing that a three-man pop is possible. */
export function lfgGroupSizeText(groupSize: number, minGroupSize: number): string {
  return groupSize === minGroupSize
    ? t('hudChrome.dungeonFinder.groupSizeStrict', { size: num(groupSize) })
    : t('hudChrome.dungeonFinder.groupSize', { size: num(groupSize), min: num(minGroupSize) });
}

// ---------------------------------------------------------------------------
// Queue state
// ---------------------------------------------------------------------------

/** The one-line headline for the player's own queue state. */
export function lfgStateText(state: LfgPlayerStateId): string {
  return t(`hudChrome.dungeonFinder.state.${state}` as TranslationKey);
}

/** "Waiting 2:07". */
export function lfgWaitText(span: LfgTimeSpan): string {
  return t('hudChrome.dungeonFinder.waiting', { time: lfgTimeText(span) });
}

/** The spoken form of the same, for the live region. */
export function lfgWaitAria(span: LfgTimeSpan): string {
  return t('hudChrome.dungeonFinder.waitingAria', { time: lfgTimeText(span) });
}

/** "Tank: 1". The colon is inside the key so a locale that does not use one can
 *  drop it. */
export function lfgRoleCountText(role: LfgRoleId, count: number): string {
  return t('hudChrome.dungeonFinder.roleCount', {
    role: lfgRoleName(role),
    count: num(count),
  });
}

/** "1 tank waiting, 1 needed" - the accessible name a role chip carries, since
 *  the "enough / not enough" state is otherwise only a colour. */
export function lfgRoleCountAria(role: LfgRoleId, count: number, needed: number): string {
  return t('hudChrome.dungeonFinder.roleCountAria', {
    role: lfgRoleName(role),
    count: num(count),
    needed: num(needed),
  });
}

/** The mark under a role count: "enough" once the ideal share is covered, or how
 *  many that role still wants. A second, wordy channel for a fact the chip's
 *  border colour also carries, so the readout survives greyscale. */
export function lfgRoleEnoughText(): string {
  return t('hudChrome.dungeonFinder.roleEnough');
}

export function lfgRoleShortText(needed: number): string {
  return t('hudChrome.dungeonFinder.roleShort', { needed: num(needed) });
}

/** The role toggle's accessible name, carrying its own on/off state in words. */
export function lfgRoleToggleAria(role: LfgRoleId, selected: boolean, available: boolean): string {
  if (!available) {
    return t('hudChrome.dungeonFinder.roleUnavailableAria', { role: lfgRoleName(role) });
  }
  return t('hudChrome.dungeonFinder.roleToggleAria', {
    role: lfgRoleName(role),
    state: selected
      ? t('hudChrome.dungeonFinder.roleOn')
      : t('hudChrome.dungeonFinder.roleOff'),
  });
}

/** The Join button's accessible name, which names the dungeon the press acts
 *  on: the button itself only ever says "Join Queue". */
export function lfgJoinAria(dungeonId: string): string {
  return t('hudChrome.dungeonFinder.joinAria', { dungeon: lfgDungeonName(dungeonId) });
}

/** "Queued for the Hollow Crypt". */
export function lfgQueuedForText(dungeonId: string): string {
  return t('hudChrome.dungeonFinder.queuedFor', { dungeon: lfgDungeonName(dungeonId) });
}

/** The cooldown readout, with a clock when the client knows the deadline and
 *  without one when it does not. Two keys rather than an empty placeholder,
 *  because "You may queue again in ." is worse than saying less. */
export function lfgCooldownText(span: LfgTimeSpan | null): string {
  if (!span || span.expired) return t('hudChrome.dungeonFinder.cooldownPlain');
  return t('hudChrome.dungeonFinder.cooldownLeft', { time: lfgTimeText(span) });
}

// ---------------------------------------------------------------------------
// Ready check
// ---------------------------------------------------------------------------

/** "Waiting: 4 players" for the same dungeon. Never the sum of the three role
 *  counts (a druid is in all three), which is why this reads the world's own
 *  distinct-player tally rather than adding chips up. */
export function lfgQueuedPlayersText(players: number): string {
  return t('hudChrome.dungeonFinder.queuedPlayers', { count: num(players) });
}

/** "You are the tank." - the role the matchmaker actually assigned, which can
 *  differ from what the player ticked when they offered more than one. */
export function lfgAssignedRoleText(role: LfgRoleId): string {
  return t('hudChrome.dungeonFinder.ready.role', { role: lfgRoleName(role) });
}

/** "3 of 5 ready" - how many of the group have already accepted. */
export function lfgReadyTallyText(accepted: number, size: number): string {
  return t('hudChrome.dungeonFinder.ready.tally', { accepted: num(accepted), size: num(size) });
}

export interface LfgReadyCheckText {
  title: string;
  /** The headline: a group for X is ready. */
  body: string;
  /** What declining costs, spelled out BEFORE the player chooses. */
  declineCost: string;
  /** What never answering costs, likewise. */
  timeoutCost: string;
  timeLeft: string;
  timeLeftAria: string;
  progressLabel: string;
  accept: string;
  decline: string;
  expired: string;
}

/**
 * Every word in the ready check, in one place.
 *
 * The two cost lines are ALWAYS present and always rendered before the buttons.
 * A decline costs 120 s and a timeout 300 s, which is destructive enough that a
 * player must be able to read both consequences without hunting: this dialog is
 * the only moment the choice exists.
 */
export function lfgReadyCheckText(
  dungeonId: string,
  countdown: LfgTimeSpan,
  declineSeconds: number,
  timeoutSeconds: number,
): LfgReadyCheckText {
  const time = lfgTimeText(countdown);
  return {
    title: t('hudChrome.dungeonFinder.ready.title'),
    body: t('hudChrome.dungeonFinder.ready.body', { dungeon: lfgDungeonName(dungeonId) }),
    declineCost: t('hudChrome.dungeonFinder.ready.declineCost', {
      time: lfgPenaltyText(declineSeconds),
    }),
    timeoutCost: t('hudChrome.dungeonFinder.ready.timeoutCost', {
      time: lfgPenaltyText(timeoutSeconds),
    }),
    timeLeft: t('hudChrome.dungeonFinder.ready.timeLeft', { time }),
    timeLeftAria: t('hudChrome.dungeonFinder.ready.timeLeftAria', { time }),
    progressLabel: t('hudChrome.dungeonFinder.ready.progressLabel'),
    accept: t('hudChrome.dungeonFinder.ready.accept'),
    decline: t('hudChrome.dungeonFinder.ready.decline'),
    expired: t('hudChrome.dungeonFinder.ready.expired'),
  };
}

export interface LfgAbandonConfirmText {
  title: string;
  body: string;
  ok: string;
  cancel: string;
}

/**
 * The copy for "you pressed Leave Queue while a ready check is open".
 *
 * That press IS a decline and costs the same 120 s, so it goes through Hud's
 * existing `confirmDialog` rather than acting immediately. The ready check
 * itself deliberately does NOT confirm: it has a 40 s window, and a second modal
 * between the player and the Accept button is how a group times out.
 */
export function lfgAbandonConfirmText(declineSeconds: number): LfgAbandonConfirmText {
  return {
    title: t('hudChrome.dungeonFinder.abandon.title'),
    body: t('hudChrome.dungeonFinder.abandon.body', {
      time: lfgPenaltyText(declineSeconds),
    }),
    ok: t('hudChrome.dungeonFinder.abandon.ok'),
    cancel: t('hudChrome.dungeonFinder.abandon.cancel'),
  };
}

// ---------------------------------------------------------------------------
// Denials
// ---------------------------------------------------------------------------

/** The refusal a player is shown. Every rung of `DUNGEON_FINDER_DENY_REASONS`
 *  has copy, and an unrecognized reason folds onto `unknown` rather than going
 *  silent. */
export function lfgDenyText(reason: string): string {
  const rung: DungeonFinderDenyReason = dungeonFinderDenyReason(reason);
  const base = t(`hudChrome.dungeonFinder.deny.${rung}` as TranslationKey);
  if (!denyCostsCooldown(rung)) return base;
  // The two rungs that cost a cooldown say so in the same breath, through a
  // joining key: the player has just been penalized and the toast is where they
  // find out how long for.
  return t('hudChrome.dungeonFinder.denyWithPenalty', {
    reason: base,
    time: lfgPenaltyText(
      rung === 'declined'
        ? DUNGEON_FINDER_DECLINE_PENALTY_SEC
        : DUNGEON_FINDER_TIMEOUT_PENALTY_SEC,
    ),
  });
}

// ---------------------------------------------------------------------------
// Event feedback
// ---------------------------------------------------------------------------

/** A ready-to-print line. */
export interface LfgFeedbackLine {
  text: string;
  color: string;
}

/** What one Dungeon Finder event is worth showing. `banner` is the big
 *  centre-screen flash (null when the event does not deserve one), `lines` go to
 *  the log, and `error` is the toast a refusal raises. */
export interface LfgFeedback {
  banner: string | null;
  lines: LfgFeedbackLine[];
  error: string | null;
  /** True when the event opened a ready check the HUD must raise. */
  readyCheck: boolean;
}

/** Tones, all comfortably above 4.5:1 on the log's near-black surface. There is
 *  deliberately no `status` tone: `lfgStatus` never reaches the log. */
export const LFG_TONE_COLOR = {
  proposal: '#ffdd88',
  formed: '#7fdc4f',
  deny: '#ff9a8a',
  collapse: '#ffb066',
} as const;

export type LfgTone = keyof typeof LFG_TONE_COLOR;

function line(text: string, tone: LfgTone): LfgFeedbackLine {
  return { text, color: LFG_TONE_COLOR[tone] };
}

const EMPTY: LfgFeedback = { banner: null, lines: [], error: null, readyCheck: false };

/**
 * Render one Dungeon Finder event into everything the HUD prints for it.
 *
 * `lfgStatus` is deliberately SILENT in the log: it arrives on a cadence while a
 * player waits, and a line per tick would bury the chat window. The window reads
 * it instead. Never throws on an event it does not know: an unrecognized shape
 * yields nothing rather than taking down the frame.
 */
export function dungeonFinderEventFeedback(ev: DungeonFinderUiEvent): LfgFeedback {
  switch (ev.type) {
    case 'lfgStatus':
      return EMPTY;
    case 'lfgProposal':
      return {
        banner: t('hudChrome.dungeonFinder.ready.banner'),
        lines: [
          line(
            t('hudChrome.dungeonFinder.ready.opened', { dungeon: lfgDungeonName(ev.dungeonId) }),
            'proposal',
          ),
        ],
        error: null,
        readyCheck: true,
      };
    case 'lfgFormed':
      return {
        banner: t('hudChrome.dungeonFinder.formed.banner'),
        lines: [
          line(
            t('hudChrome.dungeonFinder.formed.line', { dungeon: lfgDungeonName(ev.dungeonId) }),
            'formed',
          ),
        ],
        error: null,
        readyCheck: false,
      };
    case 'lfgDeny': {
      const rung = dungeonFinderDenyReason(ev.reason);
      const text = lfgDenyText(ev.reason);
      return {
        banner: null,
        lines: [line(text, isProposalCollapseReason(rung) ? 'collapse' : 'deny')],
        error: text,
        readyCheck: false,
      };
    }
    default:
      return EMPTY;
  }
}
