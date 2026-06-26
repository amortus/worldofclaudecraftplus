// Localized labels for reputation standings + factions, shared by the character
// window's Reputation tab and the vendor window's rep-gated goods. Keeps the
// standing/faction -> t() key maps in one place (so a new faction is one edit).

import { t } from './i18n';
import type { ReputationStanding } from '../sim/reputation';

const STANDING_KEY = {
  hated: 'hudChrome.reputation.standing.hated',
  hostile: 'hudChrome.reputation.standing.hostile',
  unfriendly: 'hudChrome.reputation.standing.unfriendly',
  neutral: 'hudChrome.reputation.standing.neutral',
  friendly: 'hudChrome.reputation.standing.friendly',
  honored: 'hudChrome.reputation.standing.honored',
  revered: 'hudChrome.reputation.standing.revered',
  exalted: 'hudChrome.reputation.standing.exalted',
} as const satisfies Record<ReputationStanding, string>;

const FACTION_KEY: Record<string, 'hudChrome.reputation.faction.dawnOfClaude'> = {
  dawn_of_claude: 'hudChrome.reputation.faction.dawnOfClaude',
};

/** Localized standing name, e.g. "Honored". */
export function standingLabel(standing: ReputationStanding): string {
  return t(STANDING_KEY[standing]);
}

/** Localized faction name; falls back to the raw id for an unmapped faction. */
export function factionLabel(faction: string): string {
  const key = FACTION_KEY[faction];
  return key ? t(key) : faction;
}

/** "Requires Honored with Dawn of Claude" - the rep gate on a vendor item. */
export function repRequirementText(faction: string, standing: ReputationStanding): string {
  return t('hudChrome.reputation.requires', {
    standing: standingLabel(standing),
    faction: factionLabel(faction),
  });
}
