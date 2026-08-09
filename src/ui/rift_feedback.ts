// Run feedback for procedural Rifts: one adapter that turns each of the five
// rift events into the banner, log lines and error toast the HUD prints.
//
// The consumer half of the split (crafting_feedback.ts is the template): the
// events carry ids and numbers only, so every word below is authored in
// src/ui/i18n.catalog/hud_chrome.ts and every number goes through
// `formatNumber` (inside rift_ui_labels.ts). Composing the whole feature into
// `handleEvents` is therefore one arm, and the copy for entering, descending,
// clearing, first-clearing and every refusal lives in one place where it can be
// read as a single voice.
//
// DOM-free, so tests/rift_ui_feedback.test.ts drives it directly.

import { formatNumber, t } from './i18n';
import {
  type RiftPortalInfo,
  type RiftUiEvent,
  riftPortalPhase,
  riftRank,
} from './rift_ui_model';
import {
  riftCountdownText,
  riftDenyText,
  riftFloorLine,
  riftMechanicHint,
  riftMechanicName,
  riftRankGlyph,
  riftRankName,
  riftThemeName,
  riftZoneName,
} from './rift_ui_labels';
import { riftCountdownUntil } from './rift_ui_model';

/** A ready-to-print line. */
export interface RiftFeedbackLine {
  text: string;
  color: string;
}

/** What one rift event is worth showing. `banner` is the big centre-screen
 *  flash (null when the event does not deserve one), `lines` go to the log, and
 *  `error` is the toast a refusal raises. */
export interface RiftFeedback {
  banner: string | null;
  lines: RiftFeedbackLine[];
  error: string | null;
}

/** Tones, all comfortably above 4.5:1 on the log's near-black surface. */
export const RIFT_TONE_COLOR = {
  portal: '#c9a6f0',
  enter: '#e7d8b6',
  floor: '#ffdd88',
  clear: '#7fdc4f',
  firstClear: '#ffb066',
  deny: '#ff9a8a',
} as const;

export type RiftTone = keyof typeof RIFT_TONE_COLOR;

function line(text: string, tone: RiftTone): RiftFeedbackLine {
  return { text, color: RIFT_TONE_COLOR[tone] };
}

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0, useGrouping: false });
}

const EMPTY: RiftFeedback = { banner: null, lines: [], error: null };

export interface RiftFeedbackContext {
  /** Wall clock, injected so a test can pin a portal countdown. */
  now?: number;
  /** The zone the player is standing in. A portal announcement outside it is
   *  still logged, but it never steals the banner: a tear three zones away is
   *  news, not an interruption. */
  zoneId?: string | null;
}

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

function portalFeedback(
  ev: Extract<RiftUiEvent, { type: 'riftPortal' }>,
  ctx: RiftFeedbackContext,
): RiftFeedback {
  const now = ctx.now ?? Date.now();
  const rank = riftRank(ev.rank);
  const portal: RiftPortalInfo = {
    portalId: ev.portalId,
    zoneId: ev.zoneId,
    rank: ev.rank,
    opensAt: ev.opensAt,
    expiresAt: ev.expiresAt,
    open: ev.open,
  };
  const phase = riftPortalPhase(portal, now);
  const zone = riftZoneName(ev.zoneId);
  const inZone = ctx.zoneId != null && ctx.zoneId === ev.zoneId;

  if (phase === 'closed') {
    return { banner: null, lines: [line(t('hudChrome.rift.portal.gone', { zone }), 'portal')], error: null };
  }
  if (phase === 'pending') {
    const time = riftCountdownText(riftCountdownUntil(ev.opensAt, now));
    return {
      banner: null,
      lines: [
        line(
          t('hudChrome.rift.portal.stirring', {
            zone,
            rank: riftRankGlyph(rank),
            rankName: riftRankName(rank),
            time,
          }),
          'portal',
        ),
      ],
      error: null,
    };
  }
  const text = t('hudChrome.rift.portal.opened', {
    zone,
    rank: riftRankGlyph(rank),
    rankName: riftRankName(rank),
  });
  return {
    banner: inZone ? t('hudChrome.rift.portal.bannerOpened') : null,
    lines: [line(text, 'portal')],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function enterFeedback(ev: Extract<RiftUiEvent, { type: 'riftEnter' }>): RiftFeedback {
  const rank = riftRank(ev.rank);
  return {
    banner: t('hudChrome.rift.feedback.enterBanner'),
    lines: [
      line(
        t('hudChrome.rift.feedback.enter', {
          rank: riftRankGlyph(rank),
          rankName: riftRankName(rank),
          floors: num(Math.max(1, Math.floor(ev.floorCount) || 1)),
          theme: riftThemeName(ev.themeId),
        }),
        'enter',
      ),
    ],
    error: null,
  };
}

function floorFeedback(ev: Extract<RiftUiEvent, { type: 'riftFloor' }>): RiftFeedback {
  const total = Math.max(1, Math.floor(ev.floorCount) || 1);
  const current = Math.max(1, Math.min(total, Math.floor(ev.floorIndex) + 1));
  const bossFloor = current === total;
  const mechanic = riftMechanicName(ev.mechanicId, bossFloor);
  return {
    banner: bossFloor
      ? t('hudChrome.rift.feedback.finalFloorBanner')
      : riftFloorLine(current, total),
    lines: [
      line(
        t('hudChrome.rift.feedback.floor', {
          current: num(current),
          total: num(total),
          theme: riftThemeName(ev.themeId),
        }),
        'floor',
      ),
      line(
        t('hudChrome.rift.feedback.trial', {
          mechanic,
          hint: riftMechanicHint(ev.mechanicId, bossFloor),
        }),
        'floor',
      ),
    ],
    error: null,
  };
}

function clearFeedback(ev: Extract<RiftUiEvent, { type: 'riftClear' }>): RiftFeedback {
  const rank = riftRank(ev.rank);
  const floors = num(Math.max(1, Math.floor(ev.floors) || 1));
  const lines = [
    line(
      t('hudChrome.rift.feedback.clear', {
        rank: riftRankGlyph(rank),
        rankName: riftRankName(rank),
        floors,
      }),
      'clear',
    ),
  ];
  if (ev.firstClear) {
    lines.push(
      line(
        t('hudChrome.rift.feedback.firstClear', {
          rank: riftRankGlyph(rank),
          rankName: riftRankName(rank),
        }),
        'firstClear',
      ),
    );
  }
  return {
    banner: ev.firstClear
      ? t('hudChrome.rift.feedback.firstClearBanner')
      : t('hudChrome.rift.feedback.clearBanner'),
    lines,
    error: null,
  };
}

function denyFeedback(ev: Extract<RiftUiEvent, { type: 'riftDeny' }>): RiftFeedback {
  const text = riftDenyText(ev.reason);
  return { banner: null, lines: [line(text, 'deny')], error: text };
}

// ---------------------------------------------------------------------------

/** Render one rift event into everything the HUD shows for it. Never throws on
 *  an event it does not know: an unrecognized shape yields nothing rather than
 *  taking down the frame. */
export function riftEventFeedback(
  ev: RiftUiEvent,
  ctx: RiftFeedbackContext = {},
): RiftFeedback {
  switch (ev.type) {
    case 'riftPortal':
      return portalFeedback(ev, ctx);
    case 'riftEnter':
      return enterFeedback(ev);
    case 'riftFloor':
      return floorFeedback(ev);
    case 'riftClear':
      return clearFeedback(ev);
    case 'riftDeny':
      return denyFeedback(ev);
    default:
      return EMPTY;
  }
}
