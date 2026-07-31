// Pure, host-agnostic view model for the /unstuck feedback surface.
//
// `src/sim/unstuck.ts` is text-free: it returns stable reason ids
// (`UnstuckBlockedReason`, `UnstuckCancelReason`, `UnstuckOutcome`) plus
// numbers. This module makes the presentation decisions that do not need a DOM
// (which tone a line takes, when the countdown is urgent enough to change
// colour, which numbers survive rounding), and unstuck_feedback.ts turns each
// structure into a localized `t()` line.
//
// DOM-free and i18n-free: tests/professions_ui_feedback.test.ts drives it
// directly. Numbers are raw; the consumer formats every one.

import type {
  UnstuckBlockedReason,
  UnstuckCancelReason,
  UnstuckOutcome,
} from '../sim/unstuck';
import { type FeedbackTone, FEEDBACK_TONE_COLOR } from './gathering_feedback_view';

/** The countdown turns urgent for its last few seconds, so a player who is
 *  about to be moved gets a visual warning without a new line type. */
export const UNSTUCK_URGENT_SECONDS = 3;

export interface UnstuckStartedView {
  seconds: number;
  tone: FeedbackTone;
}

/** The "hold still for N seconds" line that opens an accepted attempt. */
export function unstuckStartedView(seconds: number): UnstuckStartedView {
  return { seconds: Math.max(0, Math.round(seconds)), tone: 'info' };
}

export interface UnstuckCountdownView {
  seconds: number;
  /** True inside the last UNSTUCK_URGENT_SECONDS, which recolours the line. */
  urgent: boolean;
  tone: FeedbackTone;
}

/** One countdown tick. The sim already fires this exactly once per whole
 *  second, so this never has to de-duplicate. */
export function unstuckCountdownView(seconds: number): UnstuckCountdownView {
  const whole = Math.max(0, Math.round(seconds));
  const urgent = whole > 0 && whole <= UNSTUCK_URGENT_SECONDS;
  return { seconds: whole, urgent, tone: urgent ? 'cue' : 'info' };
}

export interface UnstuckBlockedView {
  reason: UnstuckBlockedReason;
  /** Whole seconds left on the retry cooldown; present only on `cooldown`. */
  cooldownSeconds?: number;
  tone: FeedbackTone;
}

/**
 * A refused request. `cooldown` is the one reason that carries a number, and it
 * is ceiled and floored at 1 so the line never reads "0 seconds" on the tick
 * before the command is ready again.
 */
export function unstuckBlockedView(
  reason: UnstuckBlockedReason,
  cooldownSeconds?: number,
): UnstuckBlockedView {
  if (reason !== 'cooldown') return { reason, tone: 'warn' };
  return {
    reason,
    cooldownSeconds: Math.max(1, Math.ceil(cooldownSeconds ?? 0)),
    tone: 'warn',
  };
}

export interface UnstuckCancelledView {
  reason: UnstuckCancelReason;
  tone: FeedbackTone;
}

/** An abandoned attempt. `disconnected` never reaches a live client, but it is
 *  handled so a replayed log line still renders. */
export function unstuckCancelledView(reason: UnstuckCancelReason): UnstuckCancelledView {
  return { reason, tone: 'warn' };
}

export interface UnstuckCompletedView {
  outcome: UnstuckOutcome;
  /** True when the player was dead and was raised on arrival. */
  revived: boolean;
  /** Whole seconds of Unstuck Sickness applied; 0 below the waiver level. */
  sicknessSeconds: number;
  /** True when a sickness debuff was actually applied. */
  sickened: boolean;
  tone: FeedbackTone;
}

/** A completed attempt: which of the two outcomes it produced, and what it
 *  cost. Under the waiver level the sickness line is suppressed entirely. */
export function unstuckCompletedView(completed: {
  outcome: UnstuckOutcome;
  sicknessSeconds: number;
}): UnstuckCompletedView {
  const sicknessSeconds = Math.max(0, Math.round(completed.sicknessSeconds));
  return {
    outcome: completed.outcome,
    revived: completed.outcome === 'revived_at_graveyard',
    sicknessSeconds,
    sickened: sicknessSeconds > 0,
    tone: 'good',
  };
}

export { FEEDBACK_TONE_COLOR };
export type { FeedbackTone, UnstuckBlockedReason, UnstuckCancelReason, UnstuckOutcome };
