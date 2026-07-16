// Localized display names for the lifetime-XP milestones (src/sim/types.ts MILESTONES).
//
// The sim and the wire carry milestone IDs, never text, so both surfaces that show one
// resolve it here: the character sheet (hud.ts) and the overhead nameplate title
// (renderer.ts). Unknown ids fall back to the raw id rather than throwing, so a
// milestone added to the sim before its key exists degrades to something readable
// instead of taking the frame down.

import { t } from './i18n';

const MILESTONE_KEYS: Record<string, string> = {
  veteran: 'game.milestone.veteran',
  champion: 'game.milestone.champion',
  paragon: 'game.milestone.paragon',
  mythic: 'game.milestone.mythic',
  eternal: 'game.milestone.eternal',
};

export function milestoneName(id: string): string {
  const key = MILESTONE_KEYS[id];
  return key ? t(key as Parameters<typeof t>[0]) : id;
}
