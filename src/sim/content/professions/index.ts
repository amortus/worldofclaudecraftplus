// Data barrel for the professions. `src/sim/data.ts` merges PROFESSION_ITEMS
// into ITEMS; everything else is read by the host through the named lookups
// here.
//
// Kept separate from `src/sim/professions/index.ts` (the mechanics barrel) on
// purpose: the mechanics take every table as an explicit parameter, so they
// never import content and stay directly Vitest-drivable.

import { CRAFT_ITEMS } from './craft_recipes';
import { ENCHANT_MATERIAL_ITEMS } from './enchant_materials';
import { FISHING_WATER_ITEMS } from './fishing_water';
import { GATHER_MATERIAL_ITEMS } from './gather_materials';
import { GATHER_TOOL_ITEMS } from './gather_tools';
import type { ItemDef } from '../../types';

export {
  GATHERING_MAX_SKILL,
  GATHERING_PROFESSION_IDS,
  GATHERING_PROFESSIONS,
  ZONE_GATHER_TIER,
  zoneGatherTier,
} from './professions';

export {
  GATHER_MATERIAL_ITEMS,
  NODE_MATERIAL_TABLE,
  nodeMaterialFor,
} from './gather_materials';

export {
  GATHER_TOOL_ITEMS,
  GATHER_TOOLS,
  SIMPLE_FISHING_POLE_ID,
} from './gather_tools';

export {
  GATHER_NODES,
  gatherNodeById,
  gatherNodesInZone,
  groundObjectSpecForNode,
} from './gather_nodes';

export {
  FISHING_JUNK_IDS,
  FISHING_TABLES_BY_BAND,
  FISHING_WATER_ITEMS,
  fishingTablesFor,
  isFishingJunk,
} from './fishing_water';

// --- Crafting (wave 2) ---

export {
  CRAFT_RUNGS,
  CRAFTING_MAX_SKILL,
  CRAFTING_PROFESSION_IDS,
  CRAFTING_PROFESSIONS,
  type CraftRungDef,
  craftRung,
} from './crafts';

export {
  CRAFT_ITEMS,
  CRAFT_RECIPES,
  CRAFTED_SELL_FRACTION,
  craftedSellValue,
  reagentListValue,
  reagentUnitValue,
  recipeById,
  recipesForProfession,
} from './craft_recipes';

export {
  ARCANE_LADDER_IDS,
  ENCHANT_MATERIAL_ITEMS,
  RESONANT_WEAVE_IDS,
} from './enchant_materials';

export { ENCHANTS, enchantById } from './enchants';

/** Every item def the professions waves add, for `data.ts` to spread into
 *  `ITEMS`. `simple_fishing_pole` is NOT here: it already ships in
 *  `content/items.ts` and is only assigned a tier by `GATHER_TOOLS`. */
export const PROFESSION_ITEMS: Record<string, ItemDef> = {
  ...GATHER_MATERIAL_ITEMS,
  ...GATHER_TOOL_ITEMS,
  ...FISHING_WATER_ITEMS,
  ...ENCHANT_MATERIAL_ITEMS,
  ...CRAFT_ITEMS,
};
