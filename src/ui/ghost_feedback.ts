// Thin i18n consumer for the death loop (src/sim/spirit.ts).
//
// The sim emits `ghostRelease` / `ghostResurrect` / `ghostDeny` carrying stable
// ids, a corpse point, and a duration in seconds, and NOT ONE English word, so
// there is nothing for `sim_i18n.ts` to re-match: every sentence a player reads
// while dead is authored in `i18n.catalog/hud_chrome.ts` and rendered here.
// Numbers go through `formatNumber`, durations through the shared
// minutes/seconds helper (reused from `unstuck_feedback`, since the two
// sicknesses read as the same kind of penalty and must format identically).
//
// Same shape as `unstuck_feedback.ts`, deliberately: one adapter turning one
// SimEvent into the lines the HUD logs, so composing the whole death loop into
// `handleEvents` is a single arm.

import { formatNumber, t, type TranslationKey } from './i18n';
import { formatDuration } from './unstuck_feedback';
import { RESURRECTION_SICKNESS_NAME } from '../sim/spirit';

export interface FeedbackLine {
  text: string;
  color: string;
}

const TONE_COLOR = {
  info: '#9fd7ff',
  good: '#7fdc4f',
  warn: '#ffb347',
  bad: '#ff6b6b',
} as const;

function line(text: string, tone: keyof typeof TONE_COLOR): FeedbackLine {
  return { text, color: TONE_COLOR[tone] };
}

export type GhostDenyReason = 'not_ghost' | 'no_corpse' | 'corpse_too_far' | 'no_healer';
export type GhostResurrectVia = 'corpse' | 'healer' | 'unstuck' | 'revive';

const DENY_KEY: Record<GhostDenyReason, TranslationKey> = {
  not_ghost: 'hudChrome.ghost.deny.not_ghost',
  no_corpse: 'hudChrome.ghost.deny.no_corpse',
  corpse_too_far: 'hudChrome.ghost.deny.corpse_too_far',
  no_healer: 'hudChrome.ghost.deny.no_healer',
};

const RESURRECT_KEY: Record<GhostResurrectVia, TranslationKey> = {
  corpse: 'hudChrome.ghost.resurrected.corpse',
  healer: 'hudChrome.ghost.resurrected.healer',
  unstuck: 'hudChrome.ghost.resurrected.unstuck',
  revive: 'hudChrome.ghost.resurrected.revive',
};

function isDenyReason(reason: string | undefined): reason is GhostDenyReason {
  return reason !== undefined && reason in DENY_KEY;
}

function isVia(via: string | undefined): via is GhostResurrectVia {
  return via !== undefined && via in RESURRECT_KEY;
}

// ---------------------------------------------------------------------------
// The panel's own strings (see ./ghost_panel.ts)
// ---------------------------------------------------------------------------

/** Yards to the corpse, or the "no body left" line when there is none. */
export function corpseDistanceText(
  corpseDistance: number | null,
  corpseInRange: boolean,
): string {
  if (corpseDistance === null) return t('hudChrome.ghost.corpseLost');
  if (corpseInRange) return t('hudChrome.ghost.corpseInRange');
  return t('hudChrome.ghost.corpseDistance', {
    yards: formatNumber(Math.round(corpseDistance), { maximumFractionDigits: 0 }),
  });
}

/**
 * Whether the angel is reachable from where the spirit stands, AND what it will
 * cost. One key per case rather than two `t()` results glued with parentheses:
 * the punctuation between them is not translatable and would not break for
 * RTL/CJK, and a locale may want to lead with the cost.
 */
export function spiritHealerText(inRange: boolean): string {
  return inRange ? t('hudChrome.ghost.healerNear') : t('hudChrome.ghost.healerFar');
}

/** The display name of the Resurrection Sickness aura, for the debuff frame. */
export function resurrectionSicknessName(): string {
  return t('hudChrome.ghost.sicknessAura');
}

/**
 * Re-localize the aura name the sim stamps on the debuff. `src/sim/spirit.ts` is
 * language-agnostic, so it puts the English `RESURRECTION_SICKNESS_NAME` on
 * `Aura.name` and the client re-renders it. Same matcher shape as
 * `localizeUnstuckAuraName`, and chained beside it. Returns null for any other
 * aura so a caller can chain it ahead of its existing resolver.
 */
export function localizeResurrectionAuraName(name: string): string | null {
  return name === RESURRECTION_SICKNESS_NAME ? resurrectionSicknessName() : null;
}

// ---------------------------------------------------------------------------
// The SimEvent adapter
// ---------------------------------------------------------------------------

/** The death-loop SimEvent variants this module renders. */
export interface GhostFeedbackEvent {
  type: 'ghostRelease' | 'ghostResurrect' | 'ghostDeny';
  /** `ghostRelease`: null when the death left no body to run back to. */
  corpse?: { x: number; y: number; z: number } | null;
  /** `ghostResurrect`. */
  via?: string;
  /** `ghostResurrect`: seconds of Resurrection Sickness charged, 0 when none. */
  sickness?: number;
  /** `ghostDeny`. */
  reason?: string;
}

/**
 * Render one death-loop SimEvent into the lines the HUD logs. An unrecognized id
 * from a newer server produces no line rather than a throw.
 *
 * The sickness line is separate from the resurrection line so a character under
 * the waiver level simply gets one, exactly as the /unstuck pair does.
 */
export function ghostEventLines(ev: GhostFeedbackEvent): FeedbackLine[] {
  switch (ev.type) {
    case 'ghostRelease':
      return [
        ev.corpse
          ? line(t('hudChrome.ghost.released'), 'info')
          : line(t('hudChrome.ghost.releasedNoCorpse'), 'warn'),
      ];
    case 'ghostResurrect': {
      if (!isVia(ev.via)) return [];
      const lines = [line(t(RESURRECT_KEY[ev.via]), 'good')];
      const sickness = ev.sickness ?? 0;
      if (sickness > 0) {
        lines.push(
          line(t('hudChrome.ghost.sickness', { duration: formatDuration(sickness) }), 'warn'),
        );
      }
      return lines;
    }
    case 'ghostDeny':
      return isDenyReason(ev.reason) ? [line(t(DENY_KEY[ev.reason]), 'bad')] : [];
  }
}
