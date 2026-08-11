// The four crafting professions. Declarative records only.
//
// Caps are ported from upstream unchanged: 125 for every craft, deliberately
// above gathering's 100 and below fishing's 200. `name`/`description` are
// source English, re-localized by id at the client boundary; `icon` is a
// stable key, never a path.
//
// The roster is ADAPTED. Upstream runs ten crafts on an adjacency ring with
// archetypes, combo recipes and specialization perks, all of which exist to
// force a choice among ten. We have four zones, three gathered node families
// and eight equipment slots, so ten crafts would leave six of them with no
// material faucet and no slot to fill. Four is the number our world feeds:
// one craft per node family, plus enchanting, whose faucet is finished gear.

import type { CraftingProfessionDef, CraftingProfessionId } from '../../professions/types';

export { CRAFTING_PROFESSION_IDS } from '../../professions/types';

export const CRAFTING_PROFESSIONS: Record<CraftingProfessionId, CraftingProfessionDef> = {
  smithing: {
    id: 'smithing',
    category: 'crafting',
    maxSkill: 125,
    name: 'Smithing',
    icon: 'smithing',
    description: 'Working ore and timber into mail armor and heavy weapons.',
  },
  woodcraft: {
    id: 'woodcraft',
    category: 'crafting',
    maxSkill: 125,
    name: 'Woodcraft',
    icon: 'woodcraft',
    description: 'Shaping timber into staves and hafts, and weaving treated bark into light armor.',
  },
  alchemy: {
    id: 'alchemy',
    category: 'crafting',
    maxSkill: 125,
    name: 'Alchemy',
    icon: 'alchemy',
    description: 'Distilling herbs and river catches into draughts and elixirs.',
  },
  enchanting: {
    id: 'enchanting',
    category: 'crafting',
    maxSkill: 125,
    name: 'Enchanting',
    icon: 'enchanting',
    description: 'Unmaking finished gear for its arcane residue, and binding that residue back into other gear.',
  },
};

/** Every craft's ceiling, the shape the mechanics functions take. */
export const CRAFTING_MAX_SKILL: Record<CraftingProfessionId, number> = {
  smithing: CRAFTING_PROFESSIONS.smithing.maxSkill,
  woodcraft: CRAFTING_PROFESSIONS.woodcraft.maxSkill,
  alchemy: CRAFTING_PROFESSIONS.alchemy.maxSkill,
  enchanting: CRAFTING_PROFESSIONS.enchanting.maxSkill,
};

// The four recipe rungs, one per zone, mirroring `ZONE_GATHER_TIER`. A rung is
// three facts that always move together, so they are declared together rather
// than repeated on twenty-four recipe rows:
//
//   skillReq  where the rung sits on the shared 25-point mastery ladder
//             (tiers 0/1/2/3, see professions/crafting.ts CRAFT_GAIN_TIER_STEP)
//   level     the output's content level, which is also its requiredLevel
//   material  the rung's gathered-material tier for the masterwork proc term.
//             0 for the starter Vale yields, upstream's rule: a tier-0-only
//             recipe feeds exactly 0 into the proc, so the cheapest rung is
//             untouched by that term.
export interface CraftRungDef {
  rung: 1 | 2 | 3 | 4;
  zoneId: string;
  skillReq: number;
  level: number;
  materialTier: number;
}

export const CRAFT_RUNGS: readonly CraftRungDef[] = [
  { rung: 1, zoneId: 'eastbrook_vale', skillReq: 0, level: 5, materialTier: 0 },
  { rung: 2, zoneId: 'mirefen_marsh', skillReq: 25, level: 10, materialTier: 1 },
  { rung: 3, zoneId: 'thornpeak_heights', skillReq: 50, level: 15, materialTier: 2 },
  // rung 4 was keyed on `ashen_wastes` until that zone was retired; the Veiled
  // Hollow holds the same band and the same tier-4 materials (see
  // `ZONE_GATHER_TIER`). The zoneId is documentation here, but a dead one would
  // be the only place in this module still naming a zone that does not exist.
  { rung: 4, zoneId: 'veiled_hollow', skillReq: 75, level: 20, materialTier: 3 },
];

export function craftRung(rung: 1 | 2 | 3 | 4): CraftRungDef {
  return CRAFT_RUNGS[rung - 1];
}
