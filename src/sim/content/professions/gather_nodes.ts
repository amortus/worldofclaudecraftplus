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
// approaches, Deeprock Burrows, the Glimmermere treeline). The tier-4 set is
// ours.
//
// THE TIER-4 SET MOVED ZONES WITHOUT MOVING A YARD. It was authored for the
// Ashen Wastes, whose band (z 900..1260) is now held by the Veiled Hollow
// (z 900..1440); the Wastes are retired, not deleted (see the PARKED CONTENT
// banner in `src/sim/data.ts`). Every one of the nine nodes below still resolves
// through `zoneAt` to a real zone at the exact coordinates it was authored at,
// and the Veiled Hollow is a tier-4 gather zone (`ZONE_GATHER_TIER`), so the
// placements and the tiers are both still correct and NOTHING was moved. Only
// the `zoneId` LABEL was stale, and a stale label is not cosmetic here: it is the
// key `nodeMaterialFor` and `fishingTablesFor` look the zone's yields up by, so a
// dangling label would have silently dropped the whole rung back to the Vale's
// copper. The node ids keep their `*_ashen_*` spelling on purpose: a node id is
// also its ground object's item id, so renaming them would mint ids across the
// i18n lists for no gameplay gain.
//
// `level` is a one-time snapshot of the zone's levelRange midpoint (Vale [1,7]
// -> 4, Mirefen [6,13] -> 10, Thornpeak [13,20] -> 17, Veiled Hollow [15,20] ->
// 18), not a live lookup: it feeds the minimap difficulty band and a later
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
    // The three tier-4 names below are kept exactly as authored: they are live
    // player-visible English with locale rows behind them, and the zone key is
    // the only thing the Ashen Wastes retirement made stale.
    veiled_hollow: 'Cinderite Seam',
  },
  wood: {
    eastbrook_vale: 'Ironbark Stand',
    mirefen_marsh: 'Ashwood Stand',
    thornpeak_heights: 'Elderwood Stand',
    veiled_hollow: 'Boneash Snag',
  },
  herb: {
    eastbrook_vale: 'Silverleaf Patch',
    mirefen_marsh: 'Goldleaf Patch',
    thornpeak_heights: 'Sunpetal Patch',
    veiled_hollow: 'Gravebloom Patch',
  },
};

const ZONE_LEVEL: Record<string, number> = {
  eastbrook_vale: 4,
  mirefen_marsh: 10,
  thornpeak_heights: 17,
  veiled_hollow: 18,
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
  // herbs on the Mirror Lake SHORE. These three are the only herbalism nodes in
  // the starting zone, and all three used to sit inside the lake basin: the
  // heightfield carves a lake floor to WATER_LEVEL - 4 (world.ts), so each one
  // was 4 yd under the surface. Nothing blocked harvesting them (our interact
  // check is 2D and gathering has no swim gate), but a new herbalist had to swim
  // out and dive to find any herb at all, and the vein rendered on a lake bottom.
  // Moved onto the near shore, verified against terrainHeight at the fixed
  // WORLD_SEED both at the node and around the full INTERACT_RANGE reach ring
  // (tests/gather_nodes_dry.test.ts re-derives this).
  node('herb_eastbrook_1', 'eastbrook_vale', 'herb', -57, 91, 1),
  node('herb_eastbrook_2', 'eastbrook_vale', 'herb', -57, 82, 1),
  node('herb_eastbrook_3', 'eastbrook_vale', 'herb', -58, 99, 1),

  // --- Mirefen Marsh (tier 1 approach nodes, plus one tier-2 each) ---
  node('ore_mirefen_1', 'mirefen_marsh', 'ore', 40, 340, 1),
  node('ore_mirefen_2', 'mirefen_marsh', 'ore', -30, 360, 1),
  node('ore_mirefen_3', 'mirefen_marsh', 'ore', 35, 345, 1),
  node('wood_mirefen_1', 'mirefen_marsh', 'wood', 10, 330, 1),
  node('wood_mirefen_2', 'mirefen_marsh', 'wood', -15, 355, 1),
  node('wood_mirefen_3', 'mirefen_marsh', 'wood', -20, 315, 1),
  // herb_mirefen_1/_2/_t2 sat in the widow and far lakes (4 yd under); ore_t2's
  // reach ring clipped the waterline. All four pulled onto dry marsh, same rule
  // as the Eastbrook herbs above.
  node('herb_mirefen_1', 'mirefen_marsh', 'herb', 26, 395, 1),
  node('herb_mirefen_2', 'mirefen_marsh', 'herb', -68, 459, 1),
  node('herb_mirefen_3', 'mirefen_marsh', 'herb', 30, 355, 1),
  node('ore_mirefen_t2', 'mirefen_marsh', 'ore', 36, 350, 2),
  node('wood_mirefen_t2', 'mirefen_marsh', 'wood', 2, 342, 2),
  node('herb_mirefen_t2', 'mirefen_marsh', 'herb', 23, 416, 2),

  // --- Thornpeak Heights (tiers 1 to 3) ---
  node('ore_thornpeak_1', 'thornpeak_heights', 'ore', 90, 608, 1),
  node('ore_thornpeak_2', 'thornpeak_heights', 'ore', 78, 630, 1),
  // shifted 8 yd off the tarn edge: its reach ring reached 2.4 yd under water
  node('wood_thornpeak_1', 'thornpeak_heights', 'wood', -63, 771, 1),
  node('wood_thornpeak_2', 'thornpeak_heights', 'wood', -82, 782, 1),
  node('herb_thornpeak_1', 'thornpeak_heights', 'herb', 18, 648, 1),
  node('herb_thornpeak_2', 'thornpeak_heights', 'herb', -18, 678, 1),
  node('ore_thornpeak_t2', 'thornpeak_heights', 'ore', 102, 615, 2),
  node('wood_thornpeak_t2', 'thornpeak_heights', 'wood', -45, 776, 2),
  node('herb_thornpeak_t2', 'thornpeak_heights', 'herb', 28, 658, 2),
  node('ore_thornpeak_t3', 'thornpeak_heights', 'ore', 70, 640, 3),
  node('wood_thornpeak_t3', 'thornpeak_heights', 'wood', -92, 793, 3),
  node('herb_thornpeak_t3', 'thornpeak_heights', 'herb', -28, 690, 3),

  // --- The Veiled Hollow (tier 4 only: the one place a 75-plus gatherer still
  // gains at full rate, and the reason the endgame band is worth farming).
  // Authored for the Ashen Wastes and NOT moved when that zone was retired: the
  // nine coordinates below sat in the z 900..1260 band then and sit in the Veiled
  // Hollow's z 900..1440 band now (see the header). They read against the
  // Hollow's own landmarks unchanged: the ore off the Sunken Court approach
  // (125, 1085), the timber west of the Gleaming Deep (-70, 1155), the herbs in
  // the north meadows, all clear of Eldergleam (-40, 1030, r30) and of every lake
  // carve in `realms/veiled_hollow.ts`.
  node('ore_ashen_1', 'veiled_hollow', 'ore', 75, 1068, 4),
  node('ore_ashen_2', 'veiled_hollow', 'ore', 86, 1082, 4),
  node('ore_ashen_3', 'veiled_hollow', 'ore', 70, 1085, 4),
  node('wood_ashen_1', 'veiled_hollow', 'wood', -50, 1162, 4),
  node('wood_ashen_2', 'veiled_hollow', 'wood', -62, 1178, 4),
  node('wood_ashen_3', 'veiled_hollow', 'wood', -44, 1176, 4),
  node('herb_ashen_1', 'veiled_hollow', 'herb', 40, 1208, 4),
  node('herb_ashen_2', 'veiled_hollow', 'herb', 52, 1220, 4),
  node('herb_ashen_3', 'veiled_hollow', 'herb', 36, 1222, 4),
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
