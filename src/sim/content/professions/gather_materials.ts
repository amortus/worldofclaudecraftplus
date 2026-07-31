// Gathered trade goods: the item a node yields, per zone and node type.
//
// The zone-1 through zone-3 rows are ported from upstream unchanged (their zone
// ids are literally ours: eastbrook_vale / mirefen_marsh / thornpeak_heights),
// so the Vale still yields copper/ironbark/silverleaf and Thornpeak still
// yields thorium/elderwood/sunpetal. The Ashen Wastes row is ours: upstream has
// no zone-4 equivalent, so it is authored to match zone 4's blight biome.
//
// `kind: 'junk'` is the closest existing `ItemDef` kind for a stackable,
// vendorable trade good: `src/sim/types.ts` has no `material` kind and is out
// of this wave's file ownership. It costs nothing today (the repo has no
// sell-all-junk action; only `src/ui/bag_filter.ts` groups junk and tools into
// one filter tab), and a later wave that adds a real kind only has to retag
// these twelve rows. The fishing junk cutoff deliberately does NOT read the
// kind for this reason: see FISHING_JUNK_IDS in fishing_water.ts.

import type { GatherMaterialRow, GatherNodeType, MaterialRarity } from '../../professions/types';
import type { ItemDef } from '../../types';

// Units granted per rolled rarity, ported verbatim from upstream. One shared
// curve for every material row; frozen because every row below references this
// same object, so a future per-family tune must clone it rather than mutate it.
const MATERIAL_QTY_BY_RARITY: Record<MaterialRarity, number> = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 2,
  epic: 3,
  legendary: 4,
});

// Vendor value ladder. Tier 1 is upstream's pinned 4 copper for the starter
// materials; tiers 2 to 4 roughly double each step (4 / 8 / 16 / 28, tapering
// at the top so an endgame stack cannot outpace zone-4 quest gold). Adapted
// rather than ported: upstream's higher tiers are priced against an economy
// with eleven realms of demand and a crafting sink we do not have yet.
const SELL_BY_TIER = [0, 4, 8, 16, 28];

function material(id: string, name: string, tier: number): ItemDef {
  return { id, name, kind: 'junk', quality: 'common', sellValue: SELL_BY_TIER[tier] };
}

export const GATHER_MATERIAL_ITEMS: Record<string, ItemDef> = {
  // ore
  copper_ore: material('copper_ore', 'Copper Ore', 1),
  iron_ore: material('iron_ore', 'Iron Ore', 2),
  thorium_ore: material('thorium_ore', 'Thorium Ore', 3),
  cinderite_ore: material('cinderite_ore', 'Cinderite Ore', 4),
  // wood
  ironbark_log: material('ironbark_log', 'Ironbark Log', 1),
  ashwood_log: material('ashwood_log', 'Ashwood Log', 2),
  elderwood_log: material('elderwood_log', 'Elderwood Log', 3),
  boneash_log: material('boneash_log', 'Boneash Log', 4),
  // herb
  silverleaf_herb: material('silverleaf_herb', 'Silverleaf', 1),
  goldleaf_herb: material('goldleaf_herb', 'Goldleaf', 2),
  sunpetal_herb: material('sunpetal_herb', 'Sunpetal', 3),
  gravebloom_herb: material('gravebloom_herb', 'Gravebloom', 4),
};

function row(itemId: string): GatherMaterialRow {
  return { itemId, qtyByRarity: MATERIAL_QTY_BY_RARITY };
}

/** Which material a node type yields in which zone. */
export const NODE_MATERIAL_TABLE: Record<GatherNodeType, Record<string, GatherMaterialRow>> = {
  ore: {
    eastbrook_vale: row('copper_ore'),
    mirefen_marsh: row('iron_ore'),
    thornpeak_heights: row('thorium_ore'),
    ashen_wastes: row('cinderite_ore'),
  },
  wood: {
    eastbrook_vale: row('ironbark_log'),
    mirefen_marsh: row('ashwood_log'),
    thornpeak_heights: row('elderwood_log'),
    ashen_wastes: row('boneash_log'),
  },
  herb: {
    eastbrook_vale: row('silverleaf_herb'),
    mirefen_marsh: row('goldleaf_herb'),
    thornpeak_heights: row('sunpetal_herb'),
    ashen_wastes: row('gravebloom_herb'),
  },
};

/** The material row for one node type in one zone. A zone with no row of its
 *  own falls back to the starter row rather than throwing: degraded yields,
 *  never a broken harvest. */
export function nodeMaterialFor(type: GatherNodeType, zoneId: string): GatherMaterialRow {
  const byZone = NODE_MATERIAL_TABLE[type];
  return byZone[zoneId] ?? byZone.eastbrook_vale;
}
