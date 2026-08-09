// The word layer for the procedural Rift interface.
//
// The rift generator (src/sim/rift/) and the five rift events are entirely
// language-agnostic: they carry stable ids and numbers and nothing else. So
// every syllable a player reads about a rift is authored HERE, against the
// English-only `hudChrome.rift.*` catalog domain, and every number goes through
// `formatNumber`.
//
// It sits between the pure model (rift_ui_model.ts, which decides WHAT to say)
// and the DOM consumers (rift_tracker.ts, rift_portal_panel.ts, hud.ts, which
// decide where it goes). Nothing here touches the DOM, so
// tests/rift_ui_labels.test.ts drives it directly.
//
// The rank letters C / B / A / S are GLYPHS, not translated text: the ladder is
// a fixed four-symbol alphabet, so `riftRankGlyph` returns the bare letter and
// the localized rank NAME rides alongside it as the readable channel.

import { tEntity } from './entity_i18n';
import { formatNumber, t, type TranslationKey } from './i18n';
import {
  type RiftCountdown,
  type RiftDenyReason,
  type RiftMechanicId,
  type RiftRankId,
  riftDenyReason,
  riftIdKeyPath,
  riftMechanicId,
  riftRank,
  riftRankGlyph,
} from './rift_ui_model';

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0, useGrouping: false });
}

/** Two-digit seconds for a clock-shaped countdown ("4:07"), localized digits
 *  and all. `minimumIntegerDigits` is what pads it, never a hand-rolled
 *  `String.padStart`, which would emit ASCII zeroes into a non-latin locale. */
function pad2(value: number): string {
  return formatNumber(value, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  });
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

export { riftRankGlyph };

/** The rung's name: "Lesser", "Greater", "Dire", "Cataclysmic". This is the
 *  non-colour, non-glyph channel that makes an S rift readable to a player who
 *  cannot tell orange from green. */
export function riftRankName(rank: RiftRankId): string {
  return t(`hudChrome.rift.rank.name.${rank}` as TranslationKey);
}

/** "Rank S (Cataclysmic)" - the full spoken form, used as the accessible name
 *  wherever the glyph alone carries the rung visually. */
export function riftRankAria(rank: RiftRankId): string {
  return t('hudChrome.rift.rank.aria', {
    rank: riftRankGlyph(rank),
    name: riftRankName(rank),
  });
}

/** "Rank S" - the compact written form for a headline or a log line. */
export function riftRankLabel(rank: RiftRankId): string {
  return t('hudChrome.rift.rank.label', { rank: riftRankGlyph(rank) });
}

// ---------------------------------------------------------------------------
// Generator ids
// ---------------------------------------------------------------------------

/**
 * The English behind one `rift.*` generator id. Falls back to the raw id for
 * anything a newer server invents, so an unknown theme prints an ugly id rather
 * than throwing mid-frame on an untracked key.
 */
function riftIdText(id: string, group: string): string {
  const path = riftIdKeyPath(id);
  if (!path || !path.startsWith(`${group}.`)) return id;
  return t(`hudChrome.rift.${path}` as TranslationKey);
}

/** "Frostbound", "Emberforge", ... from a `rift.theme.*` id. */
export function riftThemeName(themeId: string): string {
  return riftIdText(themeId, 'theme');
}

/** "The Reaches" / "The Sanctum", from a `rift.floor.*` id. */
export function riftFloorName(floorNameId: string): string {
  return riftIdText(floorNameId, 'floor');
}

/** "Rune Pylon", "Riven Boulder", ... from a `rift.object.*` id. */
export function riftObjectName(objectNameId: string): string {
  return riftIdText(objectNameId, 'object');
}

/** The rift's proper noun, assembled from the noun + suffix id pair the
 *  generator hands out ("Hoarfrost Labyrinth"). The join is its own key so a
 *  locale that puts the place first can reorder it. */
export function riftProperName(nounId: string, suffixId: string): string {
  return t('hudChrome.rift.name', {
    noun: riftIdText(nounId, 'noun'),
    suffix: riftIdText(suffixId, 'suffix'),
  });
}

// ---------------------------------------------------------------------------
// Mechanics
// ---------------------------------------------------------------------------

/** The floor's headline mechanic, named ("Rune Pylons"). `bossFloor` swaps in
 *  the warden, because the generator tags every boss floor `none`: the boss IS
 *  that floor's mechanic. */
export function riftMechanicName(mechanicId: string, bossFloor = false): string {
  const kind: RiftMechanicId = riftMechanicId(mechanicId);
  if (bossFloor && kind === 'none') return t('hudChrome.rift.mechanicName.boss');
  return t(`hudChrome.rift.mechanicName.${kind}` as TranslationKey);
}

/** One line telling the party what the floor actually asks of them. */
export function riftMechanicHint(mechanicId: string, bossFloor = false): string {
  const kind: RiftMechanicId = riftMechanicId(mechanicId);
  if (bossFloor && kind === 'none') return t('hudChrome.rift.mechanicHint.boss');
  return t(`hudChrome.rift.mechanicHint.${kind}` as TranslationKey);
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

/**
 * A remaining span as the player reads it: "1h 12m" over an hour, "4:07" over a
 * minute, "38s" under one, and the sealed word once it runs out. Digits are
 * spliced into a `t()` template rather than concatenated, so a locale is free
 * to reorder the units.
 */
export function riftCountdownText(countdown: RiftCountdown): string {
  switch (countdown.shape) {
    case 'hoursMinutes':
      return t('hudChrome.rift.time.hoursMinutes', {
        h: num(countdown.hours),
        m: num(countdown.minutes),
      });
    case 'minutesSeconds':
      return t('hudChrome.rift.time.minutesSeconds', {
        m: num(countdown.minutes),
        s: pad2(countdown.seconds),
      });
    case 'seconds':
      return t('hudChrome.rift.time.seconds', { s: num(countdown.seconds) });
    case 'expired':
      return t('hudChrome.rift.time.expired');
  }
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/** The localized zone a portal tore open in. */
export function riftZoneName(zoneId: string): string {
  return tEntity({ kind: 'zone', id: zoneId, field: 'name' });
}

// ---------------------------------------------------------------------------
// Floor line
// ---------------------------------------------------------------------------

/** "Floor 2 of 5", the tracker's headline. */
export function riftFloorLine(current: number, total: number): string {
  return t('hudChrome.rift.tracker.floor', { current: num(current), total: num(total) });
}

/** The spoken form of the same, with the environment named, for the tracker's
 *  live region: "Floor 2 of 5, Frostbound, Rune Pylons". */
export function riftFloorAria(
  current: number,
  total: number,
  themeId: string,
  mechanicId: string,
  bossFloor: boolean,
): string {
  return t('hudChrome.rift.tracker.floorAria', {
    current: num(current),
    total: num(total),
    theme: riftThemeName(themeId),
    mechanic: riftMechanicName(mechanicId, bossFloor),
  });
}

// ---------------------------------------------------------------------------
// Denials
// ---------------------------------------------------------------------------

/** The refusal a player is shown. Every rung of `RIFT_DENY_REASONS` has copy,
 *  and an unrecognized reason folds onto `unknown` rather than going silent. */
export function riftDenyText(reason: string): string {
  const rung: RiftDenyReason = riftDenyReason(reason);
  return t(`hudChrome.rift.deny.${rung}` as TranslationKey);
}

// ---------------------------------------------------------------------------
// Entry confirmation
// ---------------------------------------------------------------------------

export interface RiftEntryConfirmText {
  title: string;
  body: string;
  /** The entrance warning, or null when the portal carries no deadline left to
   *  warn about (already expired, or no window was set). */
  warning: string | null;
  ok: string;
  cancel: string;
}

/**
 * The copy for the "step through?" dialog. Kept here rather than in `hud.ts` so
 * the warning and the tracker's own countdown line are authored side by side
 * and can never drift apart.
 */
export function riftEntryConfirmText(
  rankId: string,
  zoneId: string,
  countdown: RiftCountdown,
): RiftEntryConfirmText {
  const rank = riftRank(rankId);
  return {
    title: t('hudChrome.rift.confirm.title'),
    body: t('hudChrome.rift.confirm.body', {
      rank: riftRankGlyph(rank),
      rankName: riftRankName(rank),
      zone: riftZoneName(zoneId),
    }),
    warning: countdown.expired
      ? null
      : t('hudChrome.rift.confirm.warning', { time: riftCountdownText(countdown) }),
    ok: t('hudChrome.rift.confirm.ok'),
    cancel: t('hudChrome.rift.confirm.cancel'),
  };
}
