// Shared localized labels for the gathering professions.
//
// One place that maps the sim's stable ids (`GatheringProfessionId`,
// `MasteryState`, the 0/1/2 proficiency band) onto `t()` keys, so the Skills
// panel, the node tooltip and every chat line quote the same words. Kept out of
// the pure view modules on purpose: those stay i18n-free.
//
// Every key here lives in the English-only `hudChrome` catalog domain
// (src/ui/i18n.catalog/hud_chrome.ts), which is what makes an English-only
// contribution compile.

import { type TranslationKey, t } from './i18n';
import {
  MASTERY_STATE_COLOR,
  type GatheringProfessionId,
  type MasteryState,
} from './skills_panel_view';

const PROFESSION_NAME_KEY: Record<GatheringProfessionId, TranslationKey> = {
  mining: 'hudChrome.professions.names.mining',
  logging: 'hudChrome.professions.names.logging',
  herbalism: 'hudChrome.professions.names.herbalism',
  fishing: 'hudChrome.professions.names.fishing',
};

const PROFESSION_DESC_KEY: Record<GatheringProfessionId, TranslationKey> = {
  mining: 'hudChrome.professions.descriptions.mining',
  logging: 'hudChrome.professions.descriptions.logging',
  herbalism: 'hudChrome.professions.descriptions.herbalism',
  fishing: 'hudChrome.professions.descriptions.fishing',
};

const MASTERY_KEY: Record<MasteryState, TranslationKey> = {
  full: 'hudChrome.professions.mastery.full',
  reduced: 'hudChrome.professions.mastery.reduced',
  minimal: 'hudChrome.professions.mastery.minimal',
  none: 'hudChrome.professions.mastery.none',
};

const BAND_KEY: readonly TranslationKey[] = [
  'hudChrome.professions.bands.apprentice',
  'hudChrome.professions.bands.journeyman',
  'hudChrome.professions.bands.master',
];

export function professionName(id: GatheringProfessionId): string {
  return t(PROFESSION_NAME_KEY[id]);
}

export function professionDescription(id: GatheringProfessionId): string {
  return t(PROFESSION_DESC_KEY[id]);
}

/** The localized name of one of the four mastery states. */
export function masteryLabel(state: MasteryState): string {
  return t(MASTERY_KEY[state]);
}

/** The classic orange / yellow / green / grey colour for a mastery state. */
export function masteryColor(state: MasteryState): string {
  return MASTERY_STATE_COLOR[state];
}

/** The localized name of a 0/1/2 proficiency band. */
export function bandLabel(band: 0 | 1 | 2): string {
  return t(BAND_KEY[band] ?? BAND_KEY[0]);
}

export { MASTERY_STATE_COLOR };
