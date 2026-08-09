// The word layer for mounts, plus the one adapter that turns each of the two
// mount events into the banner, log line and toast the HUD prints.
//
// The sim emits `mountUp { mountId }` and `mountDown { reason }`: ids only, no
// prose. So every syllable a player reads about a mount is authored HERE against
// the English-only `hudChrome.mount.*` catalog domain.
//
// DOM-free, so tests/mount_ui_model.test.ts drives it directly. Kept beside the
// model rather than split into a third file because the whole mount surface is
// two events and one bar predicate; a labels/feedback split would be an
// abstraction for one use.

import { tEntity } from './entity_i18n';
import { t, type TranslationKey } from './i18n';
import {
  type MountDownReason,
  type MountUiEvent,
  isInvoluntaryDismount,
  mountDownReason,
} from './mount_ui_model';

/** The localized name of the mount item. `tEntity` falls back to the raw id for
 *  a mount this client's item table does not know yet, so a newer server's mount
 *  prints an ugly id rather than throwing mid-frame on an untracked key. */
export function mountDisplayName(mountId: string): string {
  return tEntity({ kind: 'item', id: mountId, field: 'name' });
}

/** "You mount up on Swift Brown Steed." */
export function mountUpText(mountId: string): string {
  return t('hudChrome.mount.up', { mount: mountDisplayName(mountId) });
}

/** The one line explaining why the ride ended. Every rung of
 *  `MOUNT_DOWN_REASONS` has copy (pinned by tests/mount_ui_model.test.ts), and
 *  an unrecognized reason folds onto `unknown` rather than dismounting the
 *  player in silence. */
export function mountDownText(reason: string): string {
  const rung: MountDownReason = mountDownReason(reason);
  return t(`hudChrome.mount.down.${rung}` as TranslationKey);
}

/** The accessible name an action-bar slot holding a set of reins carries, so the
 *  slot is not announced as a bare item name with no hint of what it does. */
export function mountSlotAria(mountId: string): string {
  return t('hudChrome.mount.slotAria', { mount: mountDisplayName(mountId) });
}

/** A ready-to-print line. */
export interface MountFeedbackLine {
  text: string;
  color: string;
}

export interface MountFeedback {
  banner: string | null;
  lines: MountFeedbackLine[];
  error: string | null;
}

/** Tones, both comfortably above 4.5:1 on the log's near-black surface. */
export const MOUNT_TONE_COLOR = {
  up: '#ffdd88',
  down: '#c6b892',
  thrown: '#ff9a8a',
} as const;

export type MountTone = keyof typeof MOUNT_TONE_COLOR;

const EMPTY: MountFeedback = { banner: null, lines: [], error: null };

/**
 * Render one mount event into everything the HUD shows for it.
 *
 * Mounting is a log line and no banner: it is a thing the player just did on
 * purpose, and a centre-screen flash for it would interrupt the ride it is
 * announcing. Dismounting raises a toast only when the player did NOT choose it
 * (damage, combat, water, a zone that forbids riding), because that is the case
 * where a mount vanishing with no explanation reads as a bug.
 */
export function mountEventFeedback(ev: MountUiEvent): MountFeedback {
  switch (ev.type) {
    case 'mountUp': {
      const text = mountUpText(ev.mountId);
      return { banner: null, lines: [{ text, color: MOUNT_TONE_COLOR.up }], error: null };
    }
    case 'mountDown': {
      const rung = mountDownReason(ev.reason);
      const text = mountDownText(ev.reason);
      const involuntary = isInvoluntaryDismount(rung);
      return {
        banner: null,
        lines: [{ text, color: involuntary ? MOUNT_TONE_COLOR.thrown : MOUNT_TONE_COLOR.down }],
        error: involuntary ? text : null,
      };
    }
    default:
      return EMPTY;
  }
}
