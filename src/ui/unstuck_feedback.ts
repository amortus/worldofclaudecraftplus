// Thin i18n consumer for the /unstuck feedback surface.
//
// The consumer half of the split: unstuck_feedback_view.ts already decided the
// tone, the urgency and the rounding. This module turns each structure into a
// localized `{ text, color }` line, formatting every number through
// `formatNumber` and every duration through the shared minutes/seconds helper,
// so nothing here hand-builds a number or a unit.

import {
  FEEDBACK_TONE_COLOR,
  type FeedbackTone,
  type UnstuckBlockedReason,
  unstuckBlockedView,
  type UnstuckCancelReason,
  unstuckCancelledView,
  unstuckCompletedView,
  unstuckCountdownView,
  type UnstuckOutcome,
  unstuckStartedView,
} from './unstuck_feedback_view';
import { formatNumber, t, type TranslationKey } from './i18n';
import { UNSTUCK_SICKNESS_NAME, unstuckSickness } from '../sim/unstuck';

export interface FeedbackLine {
  text: string;
  color: string;
}

function line(text: string, tone: FeedbackTone): FeedbackLine {
  return { text, color: FEEDBACK_TONE_COLOR[tone] };
}

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

const BLOCKED_KEY: Record<UnstuckBlockedReason, TranslationKey> = {
  already_active: 'hudChrome.unstuck.blocked.already_active',
  cooldown: 'hudChrome.unstuck.blocked.cooldown',
  combat: 'hudChrome.unstuck.blocked.combat',
  controlled: 'hudChrome.unstuck.blocked.controlled',
  falling: 'hudChrome.unstuck.blocked.falling',
  moving: 'hudChrome.unstuck.blocked.moving',
  busy: 'hudChrome.unstuck.blocked.busy',
  competitive: 'hudChrome.unstuck.blocked.competitive',
  trading: 'hudChrome.unstuck.blocked.trading',
};

const CANCEL_KEY: Record<UnstuckCancelReason, TranslationKey> = {
  moved: 'hudChrome.unstuck.cancelled.moved',
  damaged: 'hudChrome.unstuck.cancelled.damaged',
  combat: 'hudChrome.unstuck.cancelled.combat',
  busy: 'hudChrome.unstuck.cancelled.busy',
  state_changed: 'hudChrome.unstuck.cancelled.state_changed',
  disconnected: 'hudChrome.unstuck.cancelled.disconnected',
};

const OUTCOME_KEY: Record<UnstuckOutcome, TranslationKey> = {
  moved_to_graveyard: 'hudChrome.unstuck.completed.moved_to_graveyard',
  revived_at_graveyard: 'hudChrome.unstuck.completed.revived_at_graveyard',
};

/** The line that opens an accepted attempt. */
export function unstuckStartedLine(seconds: number): FeedbackLine {
  const view = unstuckStartedView(seconds);
  return line(t('hudChrome.unstuck.started', { seconds: num(view.seconds) }), view.tone);
}

/** One countdown tick. The sim fires this exactly once per whole second. */
export function unstuckCountdownLine(seconds: number): FeedbackLine {
  const view = unstuckCountdownView(seconds);
  return line(t('hudChrome.unstuck.countdown', { seconds: num(view.seconds) }), view.tone);
}

/** A refused request. `cooldown` is the only reason that carries a number. */
export function unstuckBlockedLine(
  reason: UnstuckBlockedReason,
  cooldownSeconds?: number,
): FeedbackLine {
  const view = unstuckBlockedView(reason, cooldownSeconds);
  const values = view.cooldownSeconds === undefined ? undefined : { seconds: num(view.cooldownSeconds) };
  return line(t(BLOCKED_KEY[view.reason], values), view.tone);
}

/**
 * An abandoned attempt. The reason is a clause spliced into one sentence key
 * rather than two strings concatenated, so a locale can reorder the cause and
 * the announcement without six duplicated sentences.
 */
export function unstuckCancelledLine(reason: UnstuckCancelReason): FeedbackLine {
  const view = unstuckCancelledView(reason);
  return line(
    t('hudChrome.unstuck.cancelledLine', { reason: t(CANCEL_KEY[view.reason]) }),
    view.tone,
  );
}

/**
 * A completed attempt: where the player landed, and (above the waiver level) how
 * long Unstuck Sickness will cling. The two are separate lines so a character
 * under the waiver level simply gets one.
 */
export function unstuckCompletedLines(completed: {
  outcome: UnstuckOutcome;
  sicknessSeconds: number;
}): FeedbackLine[] {
  const view = unstuckCompletedView(completed);
  const lines = [line(t(OUTCOME_KEY[view.outcome]), view.tone)];
  if (view.sickened) {
    lines.push(
      line(
        t('hudChrome.unstuck.sickness', { duration: formatDuration(view.sicknessSeconds) }),
        'warn',
      ),
    );
  }
  return lines;
}

/** The display name of the Unstuck Sickness aura, for the debuff frame. */
export function unstuckSicknessName(): string {
  return t('hudChrome.unstuck.sicknessAura');
}

/**
 * Re-localize the aura name the sim stamps on the debuff.
 *
 * `src/sim/unstuck.ts` is language-agnostic, so it puts the English
 * `UNSTUCK_SICKNESS_NAME` on `Aura.name` and the client re-renders it. This is
 * the same matcher shape as `localizeSimAuraName`, kept here rather than in
 * `sim_i18n.ts` because that module's dictionaries are tsc-enforced per locale
 * and this wave contributes English only. Returns null for any other aura so a
 * caller can chain it ahead of its existing resolver.
 */
export function localizeUnstuckAuraName(name: string): string | null {
  return name === UNSTUCK_SICKNESS_NAME ? unstuckSicknessName() : null;
}

/** The Unstuck Sickness aura tooltip body. */
export function unstuckSicknessTooltip(): string {
  return t('hudChrome.unstuck.sicknessTooltip');
}

// ---------------------------------------------------------------------------
// The SimEvent adapter
// ---------------------------------------------------------------------------

/** The `/unstuck` SimEvent variant this module renders. */
export interface UnstuckFeedbackEvent {
  type: 'unstuck';
  phase: 'started' | 'countdown' | 'blocked' | 'cancelled' | 'completed';
  /** The countdown on `started`/`countdown`, the cooldown on a `cooldown` block. */
  seconds?: number;
  reason?: string;
  outcome?: UnstuckOutcome;
}

function isBlockedReason(reason: string | undefined): reason is UnstuckBlockedReason {
  return reason !== undefined && reason in BLOCKED_KEY;
}

function isCancelReason(reason: string | undefined): reason is UnstuckCancelReason {
  return reason !== undefined && reason in CANCEL_KEY;
}

/**
 * Render one `/unstuck` SimEvent into the lines the HUD logs, so composing the
 * whole command into `handleEvents` is a single arm. An unrecognized reason id
 * from a newer server produces no line rather than a throw.
 *
 * The `completed` event carries no duration, so the sickness the player just
 * took is derived from their LEVEL through the sim's own `unstuckSickness`
 * curve, the same function the sim used to build the aura. Passing the level is
 * what makes the cost line appear at all: defaulting it would silently drop the
 * one line that tells a player they are at -75% attributes.
 */
export function unstuckEventLines(
  ev: UnstuckFeedbackEvent,
  playerLevel = 0,
): FeedbackLine[] {
  switch (ev.phase) {
    case 'started':
      return [unstuckStartedLine(ev.seconds ?? 0)];
    case 'countdown':
      return [unstuckCountdownLine(ev.seconds ?? 0)];
    case 'blocked':
      return isBlockedReason(ev.reason) ? [unstuckBlockedLine(ev.reason, ev.seconds)] : [];
    case 'cancelled':
      return isCancelReason(ev.reason) ? [unstuckCancelledLine(ev.reason)] : [];
    case 'completed':
      return unstuckCompletedLines({
        outcome: ev.outcome ?? 'moved_to_graveyard',
        sicknessSeconds: unstuckSickness(playerLevel).durationSeconds,
      });
  }
}

/**
 * A whole-second duration as localized minutes and seconds. Uses `Intl`'s own
 * unit formatting so the unit and its position follow the locale instead of a
 * hand-appended "m"/"s".
 */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  const minutePart =
    minutes > 0 ? formatNumber(minutes, { style: 'unit', unit: 'minute', unitDisplay: 'short' }) : '';
  const secondPart =
    rest > 0 || minutes === 0
      ? formatNumber(rest, { style: 'unit', unit: 'second', unitDisplay: 'short' })
      : '';
  return [minutePart, secondPart].filter(Boolean).join(' ');
}
