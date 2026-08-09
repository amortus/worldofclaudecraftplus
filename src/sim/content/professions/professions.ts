// The four gathering professions. Declarative records only.
//
// Caps are ported from upstream unchanged: 100 for the three node professions,
// 200 for fishing (deliberately the deep skill, and the one you can grind
// without a node respawn timer). `name`/`description` are source English,
// re-localized by id at the client boundary; `icon` is a stable key, never a
// path.

import type { GatheringProfessionDef, GatheringProfessionId } from '../../professions/types';

export { GATHERING_PROFESSION_IDS } from '../../professions/types';

export const GATHERING_PROFESSIONS: Record<GatheringProfessionId, GatheringProfessionDef> = {
  mining: {
    id: 'mining',
    category: 'gathering',
    maxSkill: 100,
    name: 'Mining',
    icon: 'mining',
    description: 'Extracting ore and stone from veins found in the wild.',
  },
  logging: {
    id: 'logging',
    category: 'gathering',
    maxSkill: 100,
    name: 'Logging',
    icon: 'logging',
    description: 'Felling timber from the stands that grow across the zones.',
  },
  herbalism: {
    id: 'herbalism',
    category: 'gathering',
    maxSkill: 100,
    name: 'Herbalism',
    icon: 'herbalism',
    description: 'Collecting herbs and roots growing in the wild.',
  },
  fishing: {
    id: 'fishing',
    category: 'gathering',
    maxSkill: 200,
    name: 'Fishing',
    icon: 'fishing',
    description: 'Reeling catches from the rivers, lakes and meres of the world.',
  },
};

/** Every profession's ceiling, the shape the mechanics functions take. */
export const GATHERING_MAX_SKILL: Record<GatheringProfessionId, number> = {
  mining: GATHERING_PROFESSIONS.mining.maxSkill,
  logging: GATHERING_PROFESSIONS.logging.maxSkill,
  herbalism: GATHERING_PROFESSIONS.herbalism.maxSkill,
  fishing: GATHERING_PROFESSIONS.fishing.maxSkill,
};

// Zone -> tier. Our four zones tile the whole progression, one tier each, so a
// tool tier, a node tier and a zone are the same idea seen three ways. This is
// the adaptation of upstream's eleven-realm spread onto our world; see
// `src/sim/professions/gathering.ts` GATHER_GAIN_TIER_STEP for why four rungs
// is the number that makes the mastery curve land on our level-20 cap.
export const ZONE_GATHER_TIER: Record<string, number> = {
  eastbrook_vale: 1, // levels 1-7
  mirefen_marsh: 2, // levels 6-13
  thornpeak_heights: 3, // levels 13-20
  ashen_wastes: 4, // level 20 endgame
  // The column zones beside the vale. A column is side content at the level of
  // the band it borders, so it takes an existing rung rather than adding a
  // fifth: the four rungs are what make the mastery curve land on the cap.
  alderfen_shallows: 1, // levels 4-8, east of the vale
  grimhold_crags: 2, // levels 6-10, west of the vale
};

/** The gather tier of a zone. An unmapped zone (a dungeon interior, the arena)
 *  falls back to the starter tier rather than throwing: degraded, never broken. */
export function zoneGatherTier(zoneId: string): number {
  return ZONE_GATHER_TIER[zoneId] ?? 1;
}
