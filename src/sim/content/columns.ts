// ---------------------------------------------------------------------------
// The first EAST/WEST grid column ring.
//
// Until now the world was a single north-running strip of bands, x in
// [-180, 180]. These two zones are the first side-by-side neighbours: they
// share the Eastbrook Vale's z band (-180..180) and meet the strip at a real
// walkable border, opened by a road pass at z 0 (the Eastbrook latitude),
// exactly the way the north borders are opened by their road pass.
//
// WHY THE VALE'S BAND. Opening a walkable border means deleting the rim wall
// that stood at |x| = 180 in those rows, so any shipped fixture leaning on that
// wall would break. Measured across the four bands, content within 50yd of the
// rim is: Eastbrook Vale 0, Mirefen 2 (one of them the impact site, whose quest
// copy literally reads "the wall base"), Thornpeak 17, Ashen Wastes 1. The vale
// is the only band where the wall is load-bearing for nothing.
//
// Deliberately NO new biome. `BiomeId` feeds 22 exhaustive `Record<BiomeId,..>`
// tables across six render modules, so a new member would not compile until
// every one of those tables grew a row; both zones therefore reuse a shipped
// biome (`marsh` east, `peaks` west, chosen so neither column looks like the
// vale it borders). Adding biomes is phase 3, art-side.
//
// Camps here place EXACT positions (`positions`), so world generation draws no
// new rng and every shipped spawn keeps its seed-exact placement.
//
// The mobs are NEW templates rather than reused shipped ones, and that is not
// decoration. A quest kill objective matches on `targetMobId` worldwide, so a
// column camp of a Mirefen mob would silently credit the Mirefen's quest from a
// zone away; and `tests/compass_directions.test.ts` resolves a quest's copy
// against the MEAN position of every camp of that mob, so the same reuse turns
// "east of the far lake" into a lie. Every template below uses an existing
// `MobFamily` and existing loot item ids, so nothing new is needed from the
// renderer or the item tables.
// ---------------------------------------------------------------------------

import type { CampDef, MobTemplate, ZoneDef } from '../types';

// The x extent of one grid column, mirrored east and west of the strip. The
// world stays SYMMETRIC about x = 0 because WORLD_MAX_X is read as a half
// width (Math.abs(x), WORLD_MAX_X * 2) in nine render/ui/obs call sites.
export const COLUMN_WIDTH = 360;
export const EAST_COLUMN_X_MIN = 180;
export const EAST_COLUMN_X_MAX = EAST_COLUMN_X_MIN + COLUMN_WIDTH; // 540
export const WEST_COLUMN_X_MAX = -180;
export const WEST_COLUMN_X_MIN = WEST_COLUMN_X_MAX - COLUMN_WIDTH; // -540

// Both column borders open at the Eastbrook latitude, so the two new roads read
// as one east-west way through the starting town.
export const COLUMN_PASS_Z = 0;

// The column band. Shares the vale's rect exactly: a column, never a new band.
const COLUMN_Z_MIN = -180;
const COLUMN_Z_MAX = 180;

// ---------------------------------------------------------------------------
// Alderfen Shallows - east of the vale, where the Eastbrook drains into a
// standing fen. Levels 4-8: the first place a player can leave the starter
// road without out-levelling it.
// ---------------------------------------------------------------------------

export const ALDERFEN_ZONE: ZoneDef = {
  id: 'alderfen_shallows',
  name: 'Alderfen Shallows',
  zMin: COLUMN_Z_MIN,
  zMax: COLUMN_Z_MAX,
  xMin: EAST_COLUMN_X_MIN,
  xMax: EAST_COLUMN_X_MAX,
  // The pass through this zone's WEST border (its shared edge with the vale).
  // Read by the border-ridge builder in world.ts.
  westPassZ: COLUMN_PASS_Z,
  levelRange: [4, 8],
  biome: 'marsh',
  hub: { x: 360, z: 0, radius: 20, name: 'Reedwatch' },
  graveyard: { x: 342, z: -14 },
  lakes: [{ x: 440, z: 90, radius: 22 }],
  pois: [
    { x: 360, z: 0, label: 'Reedwatch' },
    { x: 214, z: 0, label: 'The Alderfen Crossing' },
    { x: 300, z: -104, label: 'Otter Hollow' },
    { x: 462, z: -62, label: 'The Rotting Weir' },
    { x: 440, z: 90, label: 'Alderfen Water' },
    { x: 284, z: 138, label: 'Sedgewatch Ruin' },
    { x: 480, z: 152, label: 'The Drowned Mill' },
  ],
  welcome: 'East of the vale the ground gives way to standing water. Reedwatch holds the crossing.',
};

export const ALDERFEN_ROADS: { x: number; z: number }[][] = [
  // The way east out of the pass to Reedwatch, then north to the ruin. It
  // starts at x 190, well past the border, so `roadDistance` inside the strip
  // is unchanged everywhere the 5yd decoration clearance can reach.
  [
    { x: 190, z: 0 },
    { x: 280, z: 0 },
    { x: 360, z: 0 },
  ],
  [
    { x: 360, z: 0 },
    { x: 330, z: 90 },
    { x: 284, z: 138 },
  ],
];

export const ALDERFEN_MOBS: Record<string, MobTemplate> = {
  sedge_skitterer: {
    id: 'sedge_skitterer', name: 'Sedge Skitterer', minLevel: 4, maxLevel: 5, family: 'spider',
    hpBase: 38, hpPerLevel: 16, dmgBase: 6, dmgPerLevel: 1.9, attackSpeed: 1.9,
    armorPerLevel: 10, moveSpeed: 8, aggroRadius: 9,
    loot: [
      { copper: 18, chance: 1 },
      { itemId: 'spider_leg', chance: 0.45 },
      { itemId: 'linen_scrap', chance: 0.3 },
    ],
    scale: 0.9, color: 0x4a5d23,
  },
  mudfin_snapper: {
    id: 'mudfin_snapper', name: 'Mudfin Snapper', minLevel: 5, maxLevel: 6, family: 'beast',
    hpBase: 42, hpPerLevel: 17, dmgBase: 6, dmgPerLevel: 2.0, attackSpeed: 2.2,
    armorPerLevel: 11, moveSpeed: 7, aggroRadius: 10, canSwim: true,
    loot: [
      { copper: 24, chance: 1 },
      { itemId: 'mudfin_scale', chance: 0.4 },
      { itemId: 'tangled_weed', chance: 0.3 },
    ],
    scale: 1.0, color: 0x4f6b52,
  },
  reedwatch_poacher: {
    id: 'reedwatch_poacher', name: 'Reedwatch Poacher', minLevel: 6, maxLevel: 7, family: 'humanoid',
    hpBase: 46, hpPerLevel: 18, dmgBase: 7, dmgPerLevel: 2.1, attackSpeed: 2.0,
    armorPerLevel: 16, moveSpeed: 7.5, aggroRadius: 11,
    loot: [
      { copper: 34, chance: 1 },
      { itemId: 'soggy_moccasin', chance: 0.3 },
      { itemId: 'minor_healing_potion', chance: 0.12 },
    ],
    scale: 1.0, color: 0x6d5a3a,
  },
  weir_husk: {
    id: 'weir_husk', name: 'Weir Husk', minLevel: 7, maxLevel: 8, family: 'undead',
    hpBase: 50, hpPerLevel: 19, dmgBase: 7, dmgPerLevel: 2.2, attackSpeed: 2.3,
    armorPerLevel: 14, moveSpeed: 6.5, aggroRadius: 11,
    loot: [
      { copper: 40, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.5 },
      { itemId: 'cracked_fetish', chance: 0.2 },
    ],
    scale: 1.0, color: 0x8f9a8b,
  },
  the_drowned_miller: {
    id: 'the_drowned_miller', name: 'The Drowned Miller', minLevel: 8, maxLevel: 8, family: 'undead',
    rare: true, elite: true,
    hpBase: 96, hpPerLevel: 22, dmgBase: 8, dmgPerLevel: 2.4, attackSpeed: 2.2,
    armorPerLevel: 18, moveSpeed: 7, aggroRadius: 13,
    loot: [
      { copper: 140, chance: 1 },
      { itemId: 'cracked_fetish', chance: 0.6 },
      { itemId: 'lesser_healing_potion', chance: 0.25 },
    ],
    scale: 1.15, color: 0x5b6068,
  },
};

export const ALDERFEN_CAMPS: CampDef[] = [
  {
    mobId: 'sedge_skitterer',
    center: { x: 300, z: -106 },
    radius: 8,
    count: 4,
    positions: [
      { x: 294, z: -112 },
      { x: 305, z: -109 },
      { x: 298, z: -100 },
      { x: 309, z: -101 },
    ],
  },
  {
    // South-west of Alderfen Water, NOT in it: a `positions` camp skips the
    // world-gen water check, so a fixed spot inside a lake carve would leave
    // the mobs standing on the lake bed.
    mobId: 'mudfin_snapper',
    center: { x: 396, z: 58 },
    radius: 9,
    count: 4,
    positions: [
      { x: 388, z: 52 },
      { x: 401, z: 54 },
      { x: 392, z: 65 },
      { x: 405, z: 63 },
    ],
  },
  {
    mobId: 'reedwatch_poacher',
    center: { x: 458, z: -62 },
    radius: 8,
    count: 3,
    positions: [
      { x: 452, z: -68 },
      { x: 463, z: -64 },
      { x: 456, z: -55 },
    ],
  },
  {
    mobId: 'weir_husk',
    center: { x: 286, z: 140 },
    radius: 9,
    count: 5,
    positions: [
      { x: 278, z: 134 },
      { x: 290, z: 133 },
      { x: 282, z: 145 },
      { x: 294, z: 144 },
      { x: 287, z: 152 },
    ],
  },
  {
    mobId: 'the_drowned_miller',
    center: { x: 480, z: 152 },
    radius: 4,
    count: 1,
    positions: [{ x: 480, z: 152 }],
  },
];

// ---------------------------------------------------------------------------
// Grimhold Crags - west of the vale, the southern spur of the same range that
// becomes Thornpeak far to the north. Levels 6-10: the pass is the easy way in,
// and the crags are what a group goes looking for.
// ---------------------------------------------------------------------------

export const GRIMHOLD_ZONE: ZoneDef = {
  id: 'grimhold_crags',
  name: 'Grimhold Crags',
  zMin: COLUMN_Z_MIN,
  zMax: COLUMN_Z_MAX,
  xMin: WEST_COLUMN_X_MIN,
  xMax: WEST_COLUMN_X_MAX,
  // The pass through this zone's EAST border (its shared edge with the vale).
  // The strip zone declares nothing, so the edge builder falls through to this
  // side's eastPassZ.
  eastPassZ: COLUMN_PASS_Z,
  levelRange: [6, 10],
  biome: 'peaks',
  hub: { x: -360, z: 0, radius: 20, name: 'Coldhearth' },
  graveyard: { x: -342, z: -14 },
  lakes: [{ x: -430, z: 100, radius: 18 }],
  pois: [
    { x: -360, z: 0, label: 'Coldhearth' },
    { x: -214, z: 0, label: 'The Grimhold Stair' },
    { x: -300, z: -110, label: 'Scree Fall' },
    { x: -470, z: -70, label: 'The Cragmaw Dens' },
    { x: -430, z: 100, label: 'Coldhearth Tarn' },
    { x: -292, z: 136, label: 'Ironvein Cut' },
    { x: -482, z: 154, label: 'The Broken Watchtower' },
  ],
  welcome: 'West of the vale the Grimhold Crags climb out of the treeline. Coldhearth burns against them.',
};

export const GRIMHOLD_ROADS: { x: number; z: number }[][] = [
  [
    { x: -190, z: 0 },
    { x: -280, z: 0 },
    { x: -360, z: 0 },
  ],
  [
    { x: -360, z: 0 },
    { x: -340, z: 90 },
    { x: -292, z: 136 },
  ],
];

export const GRIMHOLD_MOBS: Record<string, MobTemplate> = {
  crag_lurker: {
    id: 'crag_lurker', name: 'Crag Lurker', minLevel: 6, maxLevel: 7, family: 'beast',
    hpBase: 46, hpPerLevel: 18, dmgBase: 7, dmgPerLevel: 2.1, attackSpeed: 2.0,
    armorPerLevel: 12, moveSpeed: 8, aggroRadius: 11,
    loot: [
      { copper: 32, chance: 1 },
      { itemId: 'wolf_fang', chance: 0.4 },
      { itemId: 'soft_down', chance: 0.25 },
    ],
    scale: 1.0, color: 0x5d6d7e,
  },
  grimhold_scavenger: {
    id: 'grimhold_scavenger', name: 'Grimhold Scavenger', minLevel: 7, maxLevel: 8, family: 'kobold',
    hpBase: 48, hpPerLevel: 18, dmgBase: 7, dmgPerLevel: 2.2, attackSpeed: 2.1,
    armorPerLevel: 17, moveSpeed: 7.5, aggroRadius: 11,
    loot: [
      { copper: 38, chance: 1 },
      { itemId: 'bogiron_nugget', chance: 0.35 },
      { itemId: 'tallow_candle', chance: 0.3 },
    ],
    scale: 0.95, color: 0x6c5b3f,
  },
  scree_binder: {
    id: 'scree_binder', name: 'Scree Binder', minLevel: 8, maxLevel: 9, family: 'elemental',
    hpBase: 54, hpPerLevel: 20, dmgBase: 8, dmgPerLevel: 2.3, attackSpeed: 2.4,
    armorPerLevel: 20, moveSpeed: 6.5, aggroRadius: 12,
    loot: [
      { copper: 48, chance: 1 },
      { itemId: 'inert_storm_shard', chance: 0.25 },
      { itemId: 'lesser_mana_potion', chance: 0.12 },
    ],
    scale: 1.1, color: 0x808b96,
  },
  coldhearth_marauder: {
    id: 'coldhearth_marauder', name: 'Coldhearth Marauder', minLevel: 9, maxLevel: 10, family: 'ogre',
    hpBase: 62, hpPerLevel: 21, dmgBase: 9, dmgPerLevel: 2.5, attackSpeed: 2.5,
    armorPerLevel: 22, moveSpeed: 7, aggroRadius: 12,
    loot: [
      { copper: 62, chance: 1 },
      { itemId: 'cracked_ogre_tusk', chance: 0.4 },
      { itemId: 'ogre_toe_ring', chance: 0.18 },
    ],
    scale: 1.25, color: 0x7b6b52,
  },
  old_grimfang: {
    id: 'old_grimfang', name: 'Old Grimfang', minLevel: 10, maxLevel: 10, family: 'beast',
    rare: true, elite: true,
    hpBase: 120, hpPerLevel: 25, dmgBase: 10, dmgPerLevel: 2.6, attackSpeed: 2.1,
    armorPerLevel: 22, moveSpeed: 8.5, aggroRadius: 14,
    loot: [
      { copper: 190, chance: 1 },
      { itemId: 'wolf_fang', chance: 0.8 },
      { itemId: 'elixir_of_the_bear', chance: 0.2 },
    ],
    scale: 1.3, color: 0x424949,
  },
};

export const GRIMHOLD_CAMPS: CampDef[] = [
  {
    mobId: 'crag_lurker',
    center: { x: -300, z: -112 },
    radius: 8,
    count: 4,
    positions: [
      { x: -306, z: -118 },
      { x: -295, z: -116 },
      { x: -303, z: -106 },
      { x: -292, z: -107 },
    ],
  },
  {
    mobId: 'grimhold_scavenger',
    center: { x: -292, z: 138 },
    radius: 9,
    count: 5,
    positions: [
      { x: -300, z: 132 },
      { x: -288, z: 133 },
      { x: -296, z: 145 },
      { x: -284, z: 144 },
      { x: -291, z: 152 },
    ],
  },
  {
    mobId: 'coldhearth_marauder',
    center: { x: -478, z: 154 },
    radius: 8,
    count: 3,
    positions: [
      { x: -484, z: 148 },
      { x: -473, z: 151 },
      { x: -478, z: 161 },
    ],
  },
  {
    // South-west of Coldhearth Tarn, clear of the lake carve for the same
    // reason the Alderfen snappers are.
    mobId: 'scree_binder',
    center: { x: -388, z: 68 },
    radius: 8,
    count: 3,
    positions: [
      { x: -394, z: 62 },
      { x: -383, z: 65 },
      { x: -388, z: 75 },
    ],
  },
  {
    mobId: 'old_grimfang',
    center: { x: -470, z: -70 },
    radius: 4,
    count: 1,
    positions: [{ x: -470, z: -70 }],
  },
];

// Appended in this order by data.ts (east then west), and LAST after every
// shipped zone/camp/road, so no existing entry's array index moves.
export const COLUMN_ZONE_DEFS: ZoneDef[] = [ALDERFEN_ZONE, GRIMHOLD_ZONE];
export const COLUMN_CAMPS: CampDef[] = [...ALDERFEN_CAMPS, ...GRIMHOLD_CAMPS];
export const COLUMN_ROADS: { x: number; z: number }[][] = [...ALDERFEN_ROADS, ...GRIMHOLD_ROADS];
export const COLUMN_MOBS: Record<string, MobTemplate> = { ...ALDERFEN_MOBS, ...GRIMHOLD_MOBS };
