// Gatherable world nodes: ore veins, timber stands, herb patches.
//
// Placed as permanent, unowned world fixtures. The host spawns one ground
// object per record (`createGroundObject`) so a node gets world presence,
// interaction range and rendering for free; `groundObjectSpecForNode` below is
// the exact spawn payload.
//
// The eastbrook_vale / mirefen_marsh / thornpeak_heights placements are ported
// VERBATIM from upstream, coordinates and tiers included: their zone ids and
// z-bands are identical to ours, so every one of these already sits at the
// intended landmark (the Copper Dig outcrops, Webwood, Mirror Lake, the Fenbridge
// approaches, Deeprock Burrows, the Glimmermere treeline). The ashen_wastes set
// is ours: upstream has no zone-4 equivalent, so it is authored against zone 4's
// own POIs and is the only place tier-4 nodes appear.
//
// `level` is a one-time snapshot of the zone's levelRange midpoint (Vale [1,7]
// -> 4, Mirefen [6,13] -> 10, Thornpeak [13,20] -> 17, Ashen Wastes [20,20] ->
// 20), not a live lookup: it feeds the minimap difficulty band and a later
// profession-XP curve.

import type { GatherNodeDef, GatherNodeType } from '../../professions/types';

// One world name per zone x node type: the node is named for what it yields,
// and the TOOL TIER it demands is surfaced separately on the tooltip and the
// minimap (node.tier), never baked into the name. Source English; the client
// re-localizes by node id.
const NODE_NAMES: Record<GatherNodeType, Record<string, string>> = {
  ore: {
    eastbrook_vale: 'Copper Vein',
    mirefen_marsh: 'Iron Deposit',
    thornpeak_heights: 'Thorium Vein',
    ashen_wastes: 'Cinderite Seam',
  },
  wood: {
    eastbrook_vale: 'Ironbark Stand',
    mirefen_marsh: 'Ashwood Stand',
    thornpeak_heights: 'Elderwood Stand',
    ashen_wastes: 'Boneash Snag',
  },
  herb: {
    eastbrook_vale: 'Silverleaf Patch',
    mirefen_marsh: 'Goldleaf Patch',
    thornpeak_heights: 'Sunpetal Patch',
    ashen_wastes: 'Gravebloom Patch',
  },
};

const ZONE_LEVEL: Record<string, number> = {
  eastbrook_vale: 4,
  mirefen_marsh: 10,
  thornpeak_heights: 17,
  ashen_wastes: 20,
};

function node(
  id: string,
  zoneId: string,
  type: GatherNodeType,
  x: number,
  z: number,
  tier: number,
): GatherNodeDef {
  return {
    id,
    zoneId,
    type,
    pos: { x, z },
    tier,
    level: ZONE_LEVEL[zoneId] ?? 1,
    objectName: NODE_NAMES[type][zoneId] ?? NODE_NAMES[type].eastbrook_vale,
  };
}

export const GATHER_NODES: readonly GatherNodeDef[] = [
  // --- Eastbrook Vale (tier 1 only: the starter zone teaches the loop) ---
  // ore around the Copper Dig outcrops
  node('ore_eastbrook_1', 'eastbrook_vale', 'ore', -70, -53, 1),
  node('ore_eastbrook_2', 'eastbrook_vale', 'ore', -73, -49, 1),
  node('ore_eastbrook_3', 'eastbrook_vale', 'ore', -67, -57, 1),
  // timber around Webwood
  node('wood_eastbrook_1', 'eastbrook_vale', 'wood', -62, 8, 1),
  node('wood_eastbrook_2', 'eastbrook_vale', 'wood', -57, -6, 1),
  node('wood_eastbrook_3', 'eastbrook_vale', 'wood', -68, 18, 1),
  // herbs near Mirror Lake
  node('herb_eastbrook_1', 'eastbrook_vale', 'herb', -86, 90, 1),
  node('herb_eastbrook_2', 'eastbrook_vale', 'herb', -92, 80, 1),
  node('herb_eastbrook_3', 'eastbrook_vale', 'herb', -80, 95, 1),

  // --- Mirefen Marsh (tier 1 approach nodes, plus one tier-2 each) ---
  node('ore_mirefen_1', 'mirefen_marsh', 'ore', 40, 340, 1),
  node('ore_mirefen_2', 'mirefen_marsh', 'ore', -30, 360, 1),
  node('ore_mirefen_3', 'mirefen_marsh', 'ore', 35, 345, 1),
  node('wood_mirefen_1', 'mirefen_marsh', 'wood', 10, 330, 1),
  node('wood_mirefen_2', 'mirefen_marsh', 'wood', -15, 355, 1),
  node('wood_mirefen_3', 'mirefen_marsh', 'wood', -20, 315, 1),
  node('herb_mirefen_1', 'mirefen_marsh', 'herb', 60, 385, 1),
  node('herb_mirefen_2', 'mirefen_marsh', 'herb', -45, 452, 1),
  node('herb_mirefen_3', 'mirefen_marsh', 'herb', 30, 355, 1),
  node('ore_mirefen_t2', 'mirefen_marsh', 'ore', 48, 352, 2),
  node('wood_mirefen_t2', 'mirefen_marsh', 'wood', 2, 342, 2),
  node('herb_mirefen_t2', 'mirefen_marsh', 'herb', 52, 396, 2),

  // --- Thornpeak Heights (tiers 1 to 3) ---
  node('ore_thornpeak_1', 'thornpeak_heights', 'ore', 90, 608, 1),
  node('ore_thornpeak_2', 'thornpeak_heights', 'ore', 78, 630, 1),
  node('wood_thornpeak_1', 'thornpeak_heights', 'wood', -55, 765, 1),
  node('wood_thornpeak_2', 'thornpeak_heights', 'wood', -82, 782, 1),
  node('herb_thornpeak_1', 'thornpeak_heights', 'herb', 18, 648, 1),
  node('herb_thornpeak_2', 'thornpeak_heights', 'herb', -18, 678, 1),
  node('ore_thornpeak_t2', 'thornpeak_heights', 'ore', 102, 615, 2),
  node('wood_thornpeak_t2', 'thornpeak_heights', 'wood', -45, 776, 2),
  node('herb_thornpeak_t2', 'thornpeak_heights', 'herb', 28, 658, 2),
  node('ore_thornpeak_t3', 'thornpeak_heights', 'ore', 70, 640, 3),
  node('wood_thornpeak_t3', 'thornpeak_heights', 'wood', -92, 793, 3),
  node('herb_thornpeak_t3', 'thornpeak_heights', 'herb', -28, 690, 3),

  // --- The Ashen Wastes (tier 4 only: the one place a 75-plus gatherer still
  // gains at full rate, and the reason the endgame zone is worth farming).
  // Placed off the Bonefields, the Hollow Barrows and the Pale Reach, clear of
  // the Gravewatch hub (0, 1020, r20) and the Stillmere (-60, 1100, r16).
  node('ore_ashen_1', 'ashen_wastes', 'ore', 75, 1068, 4),
  node('ore_ashen_2', 'ashen_wastes', 'ore', 86, 1082, 4),
  node('ore_ashen_3', 'ashen_wastes', 'ore', 70, 1085, 4),
  node('wood_ashen_1', 'ashen_wastes', 'wood', -50, 1162, 4),
  node('wood_ashen_2', 'ashen_wastes', 'wood', -62, 1178, 4),
  node('wood_ashen_3', 'ashen_wastes', 'wood', -44, 1176, 4),
  node('herb_ashen_1', 'ashen_wastes', 'herb', 40, 1208, 4),
  node('herb_ashen_2', 'ashen_wastes', 'herb', 52, 1220, 4),
  node('herb_ashen_3', 'ashen_wastes', 'herb', 36, 1222, 4),
];

const NODES_BY_ID: ReadonlyMap<string, GatherNodeDef> = new Map(
  GATHER_NODES.map((n) => [n.id, n]),
);

export function gatherNodeById(nodeId: string): GatherNodeDef | undefined {
  return NODES_BY_ID.get(nodeId);
}

/** Every node in one zone, in declaration order. */
export function gatherNodesInZone(zoneId: string): GatherNodeDef[] {
  return GATHER_NODES.filter((n) => n.zoneId === zoneId);
}

/** The spawn payload for a node's backing ground object. The host passes
 *  `itemId` and `name` to `createGroundObject` and lifts `pos` onto the
 *  heightfield. `itemId` is the node's OWN id (not the material it yields):
 *  the yield is rolled at harvest time and is not a fixed pickup, so the
 *  object's item id is used purely as the stable handle the interaction
 *  resolves back to a `GatherNodeDef`. */
export function groundObjectSpecForNode(n: GatherNodeDef): {
  itemId: string;
  name: string;
  pos: { x: number; z: number };
} {
  return { itemId: n.id, name: n.objectName, pos: n.pos };
}
