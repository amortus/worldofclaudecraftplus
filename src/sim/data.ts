// Content merge layer. Actual game content lives in sim/content/* — one
// module per zone plus classes (abilities), shared items, and dungeons —
// so content can grow without everything colliding in one file. This module
// merges those records into the flat tables the rest of the engine consumes,
// and owns the world-layout constants.

import { BASE_ITEMS, FISHING_RARE_ID, FISHING_TABLES } from './content/items';
import {
  REALM_CAMPS,
  REALM_ITEMS,
  REALM_MOBS,
  REALM_NPCS,
  REALM_OBJECTS,
  REALM_PROP_SETS,
  REALM_QUEST_ORDER,
  REALM_QUESTS,
  REALM_ROADS,
  REALM_ZONE_DEFS,
} from './content/realms';
import type {
  CampDef,
  DelveDef,
  DelveModuleDef,
  DungeonDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  PlayerClass,
  QuestDef,
  QuestState,
  ZoneDef,
  ZonePropsDef,
} from './types';
import { MAX_LEVEL } from './types';

export type { FishingEntry } from './content/items';
export { FISHING_RARE_ID, FISHING_TABLES };

import {
  BROTHER_HALVEN,
  COLLAPSED_RELIQUARY_DELVE,
  COLLAPSED_RELIQUARY_MODULES,
  DELVE_MOBS,
} from './content/delves';
import {
  DAWN_TIER05_ITEM_IDS,
  DAWN_TIER05_ITEMS,
  DAWN_TIER05_VENDOR_REQS,
} from './content/dawn_of_claude';
import { CLAUDEHOLME_ITEMS, CLAUDEXX_ITEMS, DUNGEON_DEFS, DUNGEON_MOBS } from './content/dungeons';
import {
  CINDERFORGE_DUNGEON_DEFS,
  CINDERFORGE_MOBS,
  EXPANSION_ITEMS,
  EXPANSION_NPCS,
  EXPANSION_OBJECTS,
  EXPANSION_QUEST_ORDER,
  EXPANSION_QUESTS,
} from './content/expansion';
import { GROUND_PICKUP_LINES } from './content/ground_pickup_lines';
import {
  TEMPLE_CAMPS,
  TEMPLE_DUNGEON_DEFS,
  TEMPLE_DUNGEON_MOBS,
  TEMPLE_ITEMS,
  TEMPLE_MOBS,
  TEMPLE_NPCS,
  TEMPLE_OBJECTS,
  TEMPLE_PROPS,
  TEMPLE_QUEST_ORDER,
  TEMPLE_QUESTS,
} from './content/temple';
import { PROFESSION_ITEMS } from './content/professions';
import { RIFT_ITEMS, RIFT_MOBS } from './content/rift';
import { WARLOCK_PET_MOBS } from './content/warlock_pets';
import {
  GRAVEYARD_POS,
  LAKE,
  TOWN_RADIUS,
  ZONE1_CAMPS,
  ZONE1_CHAPEL_CAMPS,
  ZONE1_MOBS,
  ZONE1_NPCS,
  ZONE1_OBJECTS,
  ZONE1_PROPS,
  ZONE1_QUEST_ORDER,
  ZONE1_QUESTS,
  ZONE1_ROADS,
  ZONE1_VALE_OBJECTS,
  ZONE1_ZONE,
} from './content/zone1';
import {
  DEEPFEN_SHALLOWS_LAKE,
  ZONE2_CAMPS,
  ZONE2_ITEMS,
  ZONE2_MOBS,
  ZONE2_NPCS,
  ZONE2_OBJECTS,
  ZONE2_PROPS,
  ZONE2_QUEST_ORDER,
  ZONE2_QUESTS,
  ZONE2_ROADS,
  ZONE2_ZONE,
} from './content/zone2';
import {
  ZONE3_CAMPS,
  ZONE3_ITEMS,
  ZONE3_MOBS,
  ZONE3_NPCS,
  ZONE3_OBJECTS,
  ZONE3_PROPS,
  ZONE3_QUEST_ORDER,
  ZONE3_QUESTS,
  ZONE3_ROADS,
  ZONE3_ZONE,
} from './content/zone3';
// ---------------------------------------------------------------------------
// PARKED CONTENT: the Ashen Wastes (`src/sim/content/zone4.ts`).
//
// The full-map parity pass gave the z 900..1440 strip band to upstream's
// `veiled_hollow`, which is the band the Ashen Wastes held (900..1260). Two
// zones cannot tile the same strip rows, so the Ashen Wastes is RETIRED, not
// deleted: `src/sim/content/zone4.ts` is intact on disk and simply no longer
// merged here.
//
// PARKED, exactly: `ZONE4_ZONE` (the zone rect, hub Gravewatch, its POIs and
// graveyard), `ZONE4_MOBS` (18 blighted templates, every one of which carried
// `repOnKill: dawn_of_claude`), `ZONE4_NPCS` (18, including the mount vendor
// `dawn_quartermaster_henning` and the delve giver's neighbours), `ZONE4_QUESTS`
// + `ZONE4_QUEST_ORDER` (23 quests, `q_aw_*`), `ZONE4_ITEMS`, `ZONE4_CAMPS`,
// `ZONE4_OBJECTS`, `ZONE4_ROADS` and `ZONE4_PROPS`.
//
// NOT parked, because retiring them would kill live content: the tier-4
// gathering tools and the mount reins moved to Eldergleam (see the shelf blocks
// below), and the Dawn of Claude TIER-0.5 REWARD SET was extracted verbatim to
// `content/dawn_of_claude.ts` and re-shelved on the Hollow's armourer. That set
// is the only thing the still-earnable `dawn_of_claude` faction can be spent on,
// so parking it left a faction with no sink at all.
//
// TO RESTORE IT IN ONE LINE: uncomment the import below and the eight
// `...ZONE4_*` spreads / `ZONE4_ZONE` entry marked `// PARKED (Ashen Wastes)`,
// then give the Veiled Hollow a different strip band (or drop it) so the two do
// not overlap in z. When you do, drop `content/dawn_of_claude.ts` and its two
// blocks below as well: `ZONE4_ITEMS` defines the same 24 ids (identically) and
// Henning gets his shelf back.
//
// import {
//   ZONE4_CAMPS, ZONE4_ITEMS, ZONE4_MOBS, ZONE4_NPCS, ZONE4_OBJECTS,
//   ZONE4_PROPS, ZONE4_QUEST_ORDER, ZONE4_QUESTS, ZONE4_ROADS, ZONE4_ZONE,
// } from './content/zone4';
// ---------------------------------------------------------------------------
import { DUNGEON_WALL_HW } from './dungeon_layout';

export type { DelveShopEntry, DelveShopGate, DelveShopOffer } from './content/delves';
// Delve affix/companion catalogs are consumed by the Sim delve engine; re-export
// them here so sim.ts imports the whole delve data surface from one module.
export {
  COMPANION_UPGRADE_COSTS,
  DELVE_AFFIXES,
  DELVE_COMPANIONS,
  DELVE_SHOPS,
  delveShopGateUnlocked,
  resolveDelveShopOffers,
} from './content/delves';

import { DELVE_ITEMS } from './content/delves/items';
import { MOUNT_ITEMS } from './mounts';
import { DELVE_MODULE_LAYOUTS, type DelveModuleId, delveModuleSpan } from './delve_layout';

function mergeItems(...parts: Record<string, ItemDef>[]): Record<string, ItemDef> {
  const merged = Object.assign({}, ...parts);
  for (const [id, lines] of Object.entries(GROUND_PICKUP_LINES)) {
    if (merged[id]) {
      merged[id] = { ...merged[id], pickupDeny: lines.deny, pickupEnough: lines.enough };
    }
  }
  return merged;
}

export type { ClassDef } from './content/classes';
export { ABILITIES, abilitiesKnownAt, CLASSES } from './content/classes';
// Re-export content shapes so existing `from './data'` imports keep working.
export type {
  BiomeId,
  CampDef,
  DelveDef,
  DungeonDef,
  DungeonSpawn,
  GroundObjectDef,
  NpcDef,
  ZoneDef,
  ZonePropsDef,
} from './types';

// ---------------------------------------------------------------------------
// Merged content tables
// ---------------------------------------------------------------------------

export const ITEMS: Record<string, ItemDef> = mergeItems(
  BASE_ITEMS,
  ZONE2_ITEMS,
  ZONE3_ITEMS,
  TEMPLE_ITEMS,
  DELVE_ITEMS,
  // ZONE4_ITEMS, // PARKED (Ashen Wastes)
  CLAUDEHOLME_ITEMS,
  CLAUDEXX_ITEMS,
  // Gathering professions: materials, tools and zone-4 fish. `simple_fishing_pole`
  // is deliberately NOT in this set — it already ships in BASE_ITEMS and is only
  // assigned a tier by GATHER_TOOLS, so it is never redefined here.
  PROFESSION_ITEMS,
  // Rift legendaries. Prestige colour, not a power jump: each is budgeted at the
  // raid's off-set weapon level and sits strictly under its counterpart on dps.
  RIFT_ITEMS,
  // The expansion pack: the Cinderforge loot table plus every quest object of
  // the 18 new quests. LAST, so a later pack can never be shadowed by an older
  // table redefining one of its ids.
  EXPANSION_ITEMS,
  // The realm ring's quest items and quest rewards, ported from upstream.
  REALM_ITEMS,
  // Reins. The mount system owns its own catalog (src/sim/mounts.ts) because it
  // is a mechanic, not zone content; only the item table is merged here.
  MOUNT_ITEMS,
  // The Dawn of Claude tier-0.5 reward set, extracted from the parked Ashen
  // Wastes (see the PARKED banner above). The 24 rows are byte-identical to
  // their `ZONE4_ITEMS` originals, so this spread's position cannot change a
  // single value even if that table is ever un-parked ahead of it.
  DAWN_TIER05_ITEMS,
);

export const MOBS: Record<string, MobTemplate> = {
  ...ZONE1_MOBS,
  ...ZONE2_MOBS,
  ...ZONE3_MOBS,
  ...DUNGEON_MOBS,
  ...WARLOCK_PET_MOBS,
  ...TEMPLE_MOBS,
  ...TEMPLE_DUNGEON_MOBS,
  ...DELVE_MOBS,
  // ...ZONE4_MOBS, // PARKED (Ashen Wastes)
  // Procedural rift elites and bosses. The generator picks from these by theme;
  // they never spawn in the overworld.
  ...RIFT_MOBS,
  // The Cinderforge roster (4 trash + 1 summoned add + 3 bosses). Instance-only,
  // like the other dungeon rosters: no camp spawns any of them.
  ...CINDERFORGE_MOBS,
  // The upstream realm ring's roster: every zone of the 14-zone grid that is
  // not one of the three original strip bands. Their ids, upstream's own, so a
  // later sync stays a diff.
  ...REALM_MOBS,
};

export const NPCS: Record<string, NpcDef> = {
  ...ZONE1_NPCS,
  ...ZONE2_NPCS,
  ...ZONE3_NPCS,
  ...TEMPLE_NPCS,
  // ...ZONE4_NPCS, // PARKED (Ashen Wastes)
  brother_halven: BROTHER_HALVEN,
  ...EXPANSION_NPCS,
  // The realm ring's givers. Appended LAST: world-gen walks
  // Object.values(NPCS) in insertion order, so every shipped NPC keeps its
  // entity id and its exact placement. NPC placement draws no rng either way.
  ...REALM_NPCS,
};

// Reins go on a vendor's shelf here rather than in zone content, because the
// mount catalog is a mechanic module and zone4 should not have to know it
// exists. It is NOT optional polish: Wave 1 shipped 15 gathering tools no
// vendor sold, and gathering hard-requires a tool, so 42 nodes were permanent
// scenery (tests/gather_tools_obtainable.test.ts guards that class of bug now).
// The shelf MOVED with full map parity. It used to be the Dawn of Claude
// quartermaster at Gravewatch, and Gravewatch is inside the retired Ashen Wastes
// (see the PARKED banner above): the `if (vendor)` guard below would have
// swallowed that silently and left the reins unbuyable, which is Wave 1's
// gathering-tool bug all over again. Eldergleam's provisioner is the successor
// shelf, because the Veiled Hollow is the band that took the Ashen Wastes' rows
// and Fenna is its convenience vendor (she also inherited the tier-4 gathering
// tools for the same reason). The reins price is the item's own `buyValue`, so
// the move changes no number.
export const MOUNT_VENDOR_NPC_ID = 'provisioner_fenna';
{
  const vendor = NPCS[MOUNT_VENDOR_NPC_ID];
  if (vendor) {
    NPCS[MOUNT_VENDOR_NPC_ID] = {
      ...vendor,
      vendorItems: [...(vendor.vendorItems ?? []), ...Object.keys(MOUNT_ITEMS)],
    };
  }
}

// The Dawn of Claude quartermaster's shelf, re-homed for the same reason the
// reins above were. The tier-0.5 reputation set was sold by
// `dawn_quartermaster_henning` at Gravewatch, which the Ashen Wastes'
// retirement took with it, while the faction itself stayed earnable (the
// Cinderforge chain still pays `dawn_of_claude` reputation and its roster still
// grants it on kill). A faction with nothing to buy is a dead end, so the shelf
// moves to the band that replaced the Ashen Wastes: the Veiled Hollow.
//
// WHY THE WARDSMITH AND NOT THE PROVISIONER: Fenna already inherited the tier-4
// gathering tools and the reins, but she is Eldergleam's food-and-supplies
// vendor. Wardsmith Orun, "Keeper of the Old Forges", is the Hollow's ARMOURER
// and his whole shipped stock is one chest piece per archetype
// (wardplate/nightweave/veilcloth), which is exactly the shape of this set:
// three archetype sets of seven armour slots plus a weapon. A quartermaster's
// rack belongs with the armourer, and it keeps Fenna's shelf from becoming a
// 42-row junk drawer.
//
// Attached HERE rather than in `realms/veiled_hollow.ts` so the ported zone
// module stays byte-verbatim against upstream (see realms/CLAUDE.md), the same
// seam the mount reins use. Prices are each item's own `buyValue` and the gates
// are Henning's own `vendorReqs`, so the move changes no number.
export const DAWN_QUARTERMASTER_NPC_ID = 'wardsmith_orun';
{
  const vendor = NPCS[DAWN_QUARTERMASTER_NPC_ID];
  if (vendor) {
    NPCS[DAWN_QUARTERMASTER_NPC_ID] = {
      ...vendor,
      vendorItems: [...(vendor.vendorItems ?? []), ...DAWN_TIER05_ITEM_IDS],
      vendorReqs: { ...(vendor.vendorReqs ?? {}), ...DAWN_TIER05_VENDOR_REQS },
    };
  }
}

export const QUESTS: Record<string, QuestDef> = {
  ...ZONE1_QUESTS,
  ...ZONE2_QUESTS,
  ...ZONE3_QUESTS,
  ...TEMPLE_QUESTS,
  // ...ZONE4_QUESTS, // PARKED (Ashen Wastes)
  ...EXPANSION_QUESTS,
  ...REALM_QUESTS,
};

export const QUEST_ORDER: string[] = [
  ...ZONE1_QUEST_ORDER,
  ...ZONE2_QUEST_ORDER,
  ...ZONE3_QUEST_ORDER,
  ...TEMPLE_QUEST_ORDER,
  // ...ZONE4_QUEST_ORDER, // PARKED (Ashen Wastes)
  ...EXPANSION_QUEST_ORDER,
  ...REALM_QUEST_ORDER,
];

// Camps spawn in array order, each drawing world-gen RNG, so an entry inserted
// before others shifts their spawn positions. New rare-elite camps
// (ZONE1_CHAPEL_CAMPS) and the Eastbrook rare Grix are appended LAST so every
// existing zone camp keeps its exact draw order (determinism).
export const CAMPS: CampDef[] = [
  ...ZONE1_CAMPS,
  ...ZONE2_CAMPS,
  ...ZONE3_CAMPS,
  ...TEMPLE_CAMPS,
  ...ZONE1_CHAPEL_CAMPS,
  { mobId: 'grix_the_tunnelking', center: { x: -95, z: -78 }, radius: 4, count: 1 },
  // ...ZONE4_CAMPS, // PARKED (Ashen Wastes)
  // The upstream realm ring, appended at the very END so every shipped camp
  // keeps its array index (and therefore its exact rng draws).
  // Upstream authored these as SCATTER camps, which would have drawn world-gen
  // rng and moved the post-worldgen cursor every seeded fixture in the suite
  // reads from (measured: seven of them). They carry frozen exact `positions`
  // instead, captured once from that very scatter at the live world seed, so
  // world generation draws nothing new and the cursor is bit-identical.
  ...REALM_CAMPS,
];

export const GROUND_OBJECTS: GroundObjectDef[] = [
  ...ZONE1_OBJECTS,
  ...ZONE2_OBJECTS,
  ...ZONE3_OBJECTS,
  ...TEMPLE_OBJECTS,
  // ...ZONE4_OBJECTS, // PARKED (Ashen Wastes)
  // Appended LAST. Ground objects have explicit positions and draw no world-gen
  // rng, but they DO consume entity ids in array order, so keeping the pack at
  // the end leaves every shipped object's id exactly where it was.
  ...EXPANSION_OBJECTS,
  // The Eastbrook townsfolk's errands, appended after the expansion pack for
  // the same reason: they consume entity ids in array order, so putting the
  // newer set at the tail leaves every shipped object's entity id where it was.
  ...ZONE1_VALE_OBJECTS,
  // The realm ring's quest objects, newest pack at the tail so every shipped
  // object's entity id is exactly where it was.
  ...REALM_OBJECTS,
];

export const ROADS: { x: number; z: number }[][] = [
  ...ZONE1_ROADS,
  ...ZONE2_ROADS,
  ...ZONE3_ROADS,
  // ...ZONE4_ROADS, // PARKED (Ashen Wastes)
  // The realm ring's roads. Every one of them lies inside its own column rect,
  // and the two that touch a border start 4yd past it, so `roadDistance` inside
  // the strip is unchanged everywhere the 5yd decoration clearance can reach.
  ...REALM_ROADS,
];

export const PROPS: ZonePropsDef = mergeProps([
  ZONE1_PROPS,
  ZONE2_PROPS,
  ZONE3_PROPS,
  TEMPLE_PROPS,
  // ZONE4_PROPS, // PARKED (Ashen Wastes)
  // The realm ring's settlements. Props carry explicit positions and draw no
  // world-gen rng, but the renderer and the collider grid walk these arrays in
  // order, so the newest pack goes at the tail.
  ...REALM_PROP_SETS,
]);

function mergeProps(sets: ZonePropsDef[]): ZonePropsDef {
  return {
    buildings: sets.flatMap((s) => s.buildings),
    wells: sets.flatMap((s) => s.wells),
    stalls: sets.flatMap((s) => s.stalls),
    mines: sets.flatMap((s) => s.mines),
    docks: sets.flatMap((s) => s.docks),
    tents: sets.flatMap((s) => s.tents),
    crates: sets.flatMap((s) => s.crates),
    campfires: sets.flatMap((s) => s.campfires),
    mudHuts: sets.flatMap((s) => s.mudHuts),
    ruinRings: sets.flatMap((s) => s.ruinRings),
    fences: sets.flatMap((s) => s.fences),
    graveyards: sets.flatMap((s) => s.graveyards),
    // optional per-zone field, was being dropped here, so the delve entrance
    // marker (name slab + arch) never reached the renderer (props.ts)
    delveMarkers: sets.flatMap((s) => s.delveMarkers ?? []),
  };
}

// Quest reward fallback by archetype: classes without an explicit entry use these.
export const REWARD_ARCHETYPE: Record<PlayerClass, PlayerClass> = {
  warrior: 'warrior',
  paladin: 'warrior',
  shaman: 'warrior',
  rogue: 'rogue',
  hunter: 'rogue',
  mage: 'mage',
  priest: 'mage',
  warlock: 'mage',
  druid: 'mage',
};

// Resolve the item a quest awards a given class: a class-specific reward if the
// quest lists one, else the reward for the class's archetype (rewards are
// authored per archetype — warrior/rogue/mage). The dialog preview and the
// turn-in grant MUST both call this so what the player is shown matches what
// they receive. Returns undefined when the quest has no item reward.
export function questRewardItem(quest: QuestDef, cls: PlayerClass): string | undefined {
  return quest.itemRewards[cls] ?? quest.itemRewards[REWARD_ARCHETYPE[cls]];
}

export const questRewardItemId = questRewardItem;

// Vanilla group XP multipliers by party size (1-5).
export const GROUP_XP_BONUS = [1, 1, 1.166, 1.3, 1.43];

// ---------------------------------------------------------------------------
// Zones. The world is a north-running strip of zone bands: x in
// [-WORLD_SIZE/2, WORLD_SIZE/2], z from WORLD_MIN_Z through the last zone's
// zMax. Each zone owns a hub settlement (terrain flattens there), a
// graveyard, its lakes, and a biome palette the renderer keys off.
// ---------------------------------------------------------------------------

export const ZONES: ZoneDef[] = [
  ZONE1_ZONE,
  ZONE2_ZONE,
  ZONE3_ZONE,
  // ZONE4_ZONE, // PARKED (Ashen Wastes)
  // The upstream realm ring: the eleven grid cells of the 14-zone map that are
  // not one of the three original strip bands. `REALM_ZONE_DEFS` lists its two
  // STRIP zones first, in ascending z (the Veiled Hollow 900..1440 then the
  // Frostveil Reach 1440..1960), because `STRIP_ZONES` below is a filter that
  // preserves this order and the band cascade in world.ts walks it as a stack.
  // The nine column zones follow; among those, append order is free.
  ...REALM_ZONE_DEFS,
];

export const WORLD_SIZE = 360; // the original strip's width (one grid column)
// The strip column: the x extent a zone spans when it declares no xMin/xMax.
export const STRIP_MIN_X = -WORLD_SIZE / 2;
export const STRIP_MAX_X = WORLD_SIZE / 2;
// The grid's real bounds, the bounding box of every zone rect.
//
// WORLD_MAX_X IS READ AS A SYMMETRIC HALF WIDTH in nine call sites outside this
// file (`Math.abs(x) > WORLD_MAX_X - n`, `WORLD_MAX_X * 2`, `(x + WORLD_MAX_X) /
// (WORLD_MAX_X * 2)`, and `p.pos.x / WORLD_MAX_X` in obs.ts), so the BOUNDING BOX
// must stay symmetric about x = 0.
//
// Note what that does and does not require. It is a claim about the BOX, not
// about every row: upstream's grid has rows with a column on one side only (the
// Farshore's), and full map parity took those rows verbatim. The box stays
// symmetric because some OTHER row reaches -540, which is all those nine sites
// need. What follows the rows instead is the containment RIM, which is per side
// (`worldHalfWidthAt(z, x)`) and per column at the north end
// (`worldNorthEdgeAt(x)`). `tests/world_phase2_bands.test.ts` pins both.
export const WORLD_MIN_X = Math.min(...ZONES.map((zn) => zn.xMin ?? STRIP_MIN_X));
export const WORLD_MAX_X = Math.max(...ZONES.map((zn) => zn.xMax ?? STRIP_MAX_X));
// Derived over ALL zone rects, not the array ends: with columns appended last,
// ZONES[ZONES.length - 1] is no longer the northmost band.
export const WORLD_MIN_Z = Math.min(...ZONES.map((zn) => zn.zMin));
export const WORLD_MAX_Z = Math.max(...ZONES.map((zn) => zn.zMax));

// The original full-width strip column and the columns beside it. Sequential
// band cascades (the terrain shape blend, the map, the sky) walk STRIP_ZONES in
// stack order exactly as they always did; COLUMN_ZONES blend in sideways
// through `columnBlendAt`. With no columns registered both are inert and the
// world is byte-identical to the strip era.
export const STRIP_ZONES: readonly ZoneDef[] = ZONES.filter(
  (zn) => (zn.xMin ?? STRIP_MIN_X) <= STRIP_MIN_X && (zn.xMax ?? STRIP_MAX_X) >= STRIP_MAX_X,
);
export const COLUMN_ZONES: readonly ZoneDef[] = ZONES.filter(
  (zn) => (zn.xMin ?? STRIP_MIN_X) > STRIP_MIN_X || (zn.xMax ?? STRIP_MAX_X) < STRIP_MAX_X,
);

export const PLAYER_START = { x: 2, z: -2 };

// Zones a rift portal may open in. Rifts are level-cap content (rank C encodes
// baseLevel 20), so a portal only belongs where a capped player actually plays:
// Thornpeak Heights [13,20] and the Ashen Wastes [20,20]. Deriving this from each
// zone's own levelRange rather than listing ids means a future zone joins the
// rotation by being endgame, not by being remembered here.
export function riftEligibleZones(): ZoneDef[] {
  return ZONES.filter((zone) => zone.levelRange[1] >= MAX_LEVEL);
}

// Zone containing a world position (overworld only; clamps to the world edges).
// Zones are rectangles: z picks the band (stacked south to north, as always)
// and x picks the column within it. Every zone without an explicit x range
// spans the original full-width strip, so a one-column world (ours today)
// resolves exactly as the z-only lookup this replaced: the southmost band
// still containing z is the fallback for a point south of every zMin, and a
// point north of every zMax clamps to the northmost band.
export function zoneAt(x: number, z: number): ZoneDef {
  for (const zone of ZONES) {
    if (z >= zone.zMax || z < zone.zMin) continue;
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (x >= x0 && x < x1) return zone;
  }
  // Outside every rect: the far-east instance plane, a position past the world
  // rim, or (before the realm ring filled the grid) a row a column did not
  // occupy. The answer is the STRIP band, never a column.
  //
  // This used to be "the zone with the smallest zMax still north of z", which
  // was the same thing only while every column shared a strip band exactly:
  // the strip's own band was always the narrowest. Once a column spans two
  // strip bands (the Willowfen runs z 180..700 across the Mirefen/Thornpeak
  // boundary at 540) that tie-break starts answering `willowfen` for a
  // DUNGEON position at z 541, which is how the zone name, the biome, the sky
  // and the respawn graveyard all get read for a player standing in an
  // instance. Walking STRIP_ZONES, which tile z contiguously, is the same
  // arithmetic the 1D strip-era lookup did and cannot drift again.
  for (const zone of STRIP_ZONES) {
    if (z < zone.zMax) return zone;
  }
  return STRIP_ZONES[STRIP_ZONES.length - 1];
}

// Strict rect containment: the zone whose rectangle literally contains (x, z),
// or null when the point lies outside every authored zone. Unlike `zoneAt`,
// which clamps through a southmost-band fallback so an overworld query always
// yields a zone, this reports "nowhere" honestly. Callers that must tell the
// open world from an instanced interior (the far-east dungeon/arena/delve/rift
// plane, which `zoneAt` would report as a real zone) or from the void a grid
// row leaves beside a column want this one.
export function zoneContaining(x: number, z: number): ZoneDef | null {
  for (const zone of ZONES) {
    if (z < zone.zMin || z >= zone.zMax) continue;
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (x >= x0 && x < x1) return zone;
  }
  return null;
}

function smoothstep01(raw: number): number {
  const t = Math.max(0, Math.min(1, raw));
  return t * t * (3 - 2 * t);
}

// Blend weight of a COLUMN zone at a position: 1 deep inside its rect, easing
// to 0 across the same -30/+35yd window the north-south band cascade uses, so a
// column's shape and palette arrive sideways at exactly the rate a band's
// arrives northward. Returns exactly +0 (not a denormal) outside the window, so
// a caller that skips on `t <= 0` leaves the strip's arithmetic bit-identical.
export function columnBlendAt(zone: ZoneDef, x: number, z: number): number {
  const x0 = zone.xMin ?? STRIP_MIN_X;
  const x1 = zone.xMax ?? STRIP_MAX_X;
  if (z <= zone.zMin - 30 || z >= zone.zMax + 35) return 0;
  const east = x0 >= STRIP_MAX_X;
  if (east ? x <= x0 - 30 : x >= x1 + 30) return 0;
  const xT = east
    ? smoothstep01((x - (x0 - 30)) / 65) // an east column, entered moving +x
    : 1 - smoothstep01((x - (x1 - 35)) / 65); // a west column, entered moving -x
  const zT =
    smoothstep01((z - (zone.zMin - 30)) / 65) * (1 - smoothstep01((z - (zone.zMax - 30)) / 65));
  return xT * zT;
}

// How much of a column zone's ROW a given z is inside: 1 across the band's
// interior, easing to exactly 0 across the same -30/+35yd window, with no x
// term. This is what widens the world rim (world.ts) only in the rows a column
// actually occupies, so the rows without one keep the strip's rim exactly.
export function columnRowWeight(zone: ZoneDef, z: number): number {
  if (z <= zone.zMin - 30 || z >= zone.zMax + 35) return 0;
  return (
    smoothstep01((z - (zone.zMin - 30)) / 65) * (1 - smoothstep01((z - (zone.zMax - 30)) / 65))
  );
}

// Half-width of the world at a given z, eased in z so the rim never steps.
// Returns exactly STRIP_MAX_X in every row no column touches.
//
// PER SIDE, and that is what the Farshore made necessary. The grid used to be
// symmetric row by row: every column had a mirror across x = 0, so one
// half-width said everything about both sides. Upstream's grid is NOT symmetric
// in two rows: `farshore_isle` occupies x 180..540 in the vale's band with
// nothing opposite it, and `drakelands` reaches z 2420 where `amberfall` stops
// at 2380. Answering 540 for the empty side of those rows would push the rim
// wall 360yd out over ground that belongs to no zone, i.e. open a hole in the
// map. `x` therefore selects the side: a negative x ignores the +x columns and
// a positive x ignores the -x ones.
//
// The default `x = 0` keeps the OLD answer (the widest column in the row,
// whichever side it is on), so every existing caller and every existing
// assertion in `tests/world_phase2_terrain.test.ts` reads exactly what it did.
export function worldHalfWidthAt(z: number, x = 0): number {
  let half = STRIP_MAX_X;
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    if (x < 0 ? COLUMN_SIDES[i] > 0 : x > 0 ? COLUMN_SIDES[i] < 0 : false) continue;
    const col = COLUMN_ZONES[i];
    const t = columnRowWeight(col, z);
    if (t <= 0) continue;
    const colHalf = COLUMN_HALF_WIDTHS[i];
    if (colHalf <= half) continue;
    half = half + (colHalf - half) * t;
  }
  return half;
}

// Precomputed |x| reach of each column, so the per-sample rim lookup does no
// property loads on a ZoneDef (this runs once per terrainHeight call).
const COLUMN_HALF_WIDTHS: readonly number[] = COLUMN_ZONES.map((col) =>
  Math.max(Math.abs(col.xMin ?? STRIP_MIN_X), Math.abs(col.xMax ?? STRIP_MAX_X)),
);

// +1 for a column on the +x side of the strip, -1 for the -x side. Same order
// and the same reason as COLUMN_HALF_WIDTHS: no ZoneDef read per sample.
const COLUMN_SIDES: readonly number[] = COLUMN_ZONES.map((col) =>
  (col.xMin ?? STRIP_MIN_X) >= STRIP_MAX_X ? 1 : -1,
);

// How much of a column zone's COLUMN a given x is inside: the x mirror of
// `columnRowWeight`, 1 across the rect's interior and easing to exactly 0 over
// the same 30yd window, with no z term.
function columnColWeight(zone: ZoneDef, x: number): number {
  const x0 = zone.xMin ?? STRIP_MIN_X;
  const x1 = zone.xMax ?? STRIP_MAX_X;
  if (x <= x0 - 30 || x >= x1 + 30) return 0;
  return smoothstep01((x - (x0 - 30)) / 30) * (1 - smoothstep01((x - x1) / 30));
}

// The northmost z any strip band reaches. The strip tiles z contiguously, so
// this is where the world's middle column ends.
const STRIP_NORTH_Z = Math.max(...STRIP_ZONES.map((zn) => zn.zMax));

// North edge of the world at a given x, eased in x so the rim never steps.
//
// The twin of `worldHalfWidthAt`, and needed for the same reason: upstream's
// grid is RAGGED at the north. The strip ends at the Frostveil's zMax (1960)
// while the two columns beside it run on to 2380 (Amberfall) and 2420
// (Drakelands), so a single global WORLD_MAX_Z would leave a 180 x 460yd
// corridor of no-zone ground open in the middle of the map. Upstream fills that
// corridor with an ocean bay it shapes in its own world.ts; we have no coast
// shaper, so the honest answer is that the world's containment rim follows the
// zones that actually exist. Returns exactly WORLD_MAX_Z wherever the widest
// column reaches, so a world whose columns all end with the strip (every world
// before this one) is answered identically everywhere.
export function worldNorthEdgeAt(x: number): number {
  let edge = STRIP_NORTH_Z;
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    const col = COLUMN_ZONES[i];
    if (col.zMax <= edge) continue;
    const t = columnColWeight(col, x);
    if (t <= 0) continue;
    edge = edge + (col.zMax - edge) * t;
  }
  return edge;
}

export function zoneWelcomeText(
  zone: ZoneDef,
  questState: (questId: string) => QuestState,
): string | null {
  if (zone.welcomeQuestId && questState(zone.welcomeQuestId) !== 'available') return null;
  return zone.welcome;
}

// Legacy single-zone exports (zone 1) — still referenced by tests and the
// starter-town logic.
export { DEEPFEN_SHALLOWS_LAKE, GRAVEYARD_POS, LAKE, TOWN_RADIUS };
export const ZONE_NAME = ZONE1_ZONE.name;

// ---------------------------------------------------------------------------
// Dungeons — private party instances at far-off flat origins (see
// world.groundHeight). Each dungeon gets its own x-band of instance origins;
// slots stack along z.
// ---------------------------------------------------------------------------

export const INSTANCE_SLOT_COUNT = 6;
export const DUNGEON_X_THRESHOLD = 600; // x beyond this = inside an instance
export const DUNGEON_FLOOR_Y = 0;

export function instanceOrigin(dungeonIndex: number, slot: number): { x: number; z: number } {
  return { x: 900 + dungeonIndex * 600, z: -1250 + slot * 500 };
}

export const DUNGEONS: Record<string, DungeonDef> = {
  ...DUNGEON_DEFS,
  ...TEMPLE_DUNGEON_DEFS,
  // The Cinderforge takes dungeon index 8 (x = 900 + 8*600 = 5700), which is why
  // the arena and delve bands below sit 600 further out than they used to. See
  // the ARENA_X comment for the full band arithmetic.
  ...CINDERFORGE_DUNGEON_DEFS,
};

export const DUNGEON_LIST: DungeonDef[] = Object.values(DUNGEONS).sort((a, b) => a.index - b.index);

export function dungeonByIndex(index: number): DungeonDef | null {
  return DUNGEON_LIST.find((d) => d.index === index) ?? null;
}

// Which dungeon a far-off instance position belongs to, by x-band.
export function dungeonAt(x: number): DungeonDef | null {
  if (x <= DUNGEON_X_THRESHOLD || x >= ARENA_X_MIN) return null;
  return dungeonByIndex(Math.round((x - 900) / 600));
}

// ---------------------------------------------------------------------------
// The Ashen Coliseum — 1v1 ranked arena. Its match instances live in their own
// far-off flat-ground x-band, well past the dungeon bands (index 0/1/2 sit at
// x 900/1500/2100). Like dungeons, x beyond DUNGEON_X_THRESHOLD means flat
// ground (world.groundHeight) and instance-local collision (sim/colliders.ts);
// the band split below keeps arena positions from being read as a dungeon.
// ---------------------------------------------------------------------------

// Arena sits past the dungeon bands (900 + index*600). It was at 5400 while
// indices 0..7 (up to Claudeholme at 4500 and Claudexxaramas at 5100) were the
// whole ladder. The Cinderforge takes index 8, i.e. x = 900 + 8*600 = 5700, and
// `dungeonAt` refuses everything at or past ARENA_X_MIN, so the arena and the
// delve band both moved out by exactly one dungeon stride (600):
//
//   dungeon 8 footprint   5700 +/- 24  = [5676, 5724]   (DUNGEON_END_WALL_HW + HW)
//   arena footprint       6000 +/- 24  = [5976, 6024]   -> 252u clear of the above
//   delve 0 footprint     6600 +/- 26  = [6574, 6626]   (DELVE_WALL_X + HW + 1)
//   rift band edge        RIFT_BAND_X_MIN = 11966       -> 540u clear of delve 8
//
// `dungeonAt` rounds (x - 900) / 600, so the whole dungeon-8 footprint resolves
// to index 8 and the whole arena/delve range still resolves to its own predicate.
export const ARENA_X = 6000; // arena instances share this x; slots stack along z
export const ARENA_X_MIN = ARENA_X; // x at/after this = an arena instance, not a dungeon
export const ARENA_SLOT_COUNT = 4; // concurrent 1v1 matches the world can host
const ARENA_Z0 = -1250;
const ARENA_SLOT_SPACING = 120; // > the pit footprint (~44yd) so slots never overlap

export function arenaOrigin(slot: number): { x: number; z: number } {
  return { x: ARENA_X, z: ARENA_Z0 + slot * ARENA_SLOT_SPACING };
}

export function isArenaPos(x: number): boolean {
  return x >= ARENA_X_MIN && x < DELVE_BAND_X_MIN;
}

// Nearest arena instance origin to a far-off position, matched by z-band (the
// x is shared across slots). Mirrors how the dungeon collider resolver maps a
// position back to its instance slot.
export function arenaOriginAt(z: number): { x: number; z: number; slot: number } {
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < ARENA_SLOT_COUNT; i++) {
    const d = Math.abs(z - arenaOrigin(i).z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const o = arenaOrigin(best);
  return { x: o.x, z: o.z, slot: best };
}

// Legacy aliases for the Hollow Crypt (tests + scripts reference these).
export const CRYPT_DOOR_POS = DUNGEONS.hollow_crypt.doorPos;
export const CRYPT_ENTRY = DUNGEONS.hollow_crypt.entry;
export const CRYPT_EXIT_OFFSET = DUNGEONS.hollow_crypt.exitOffset;
export const CRYPT_SPAWNS = DUNGEONS.hollow_crypt.spawns;

// ---------------------------------------------------------------------------
// Delves, private party instances past the arena x-band (see docs/prd/delves.md).
// DELVE_X_MIN must stay above ARENA_X_MIN and ARENA_X.
// ---------------------------------------------------------------------------

// 6600 sits clear of the relocated layout: the highest dungeon band is index 8
// (x=5700, the Cinderforge), the arena pit is centred at ARENA_X (6000, ±24u
// footprint), and the delve band's west edge (DELVE_BAND_X_MIN = 6573) leaves a
// comfortable margin past it. Moved from 6000 with the arena when the Cinderforge
// claimed dungeon index 8; see the ARENA_X comment for the band arithmetic.
export const DELVE_X_MIN = 6600;
// Each delve room is centred at DELVE_X_MIN + index*600. Delve modules use wider
// side walls than the base crypt kit: the side-wall centre is at instance-local
// |x| = DELVE_WALL_X (25, mirror of delve_layout.ts WALL_X) and the collider's
// outer face sits 1u beyond that (|x| = 26), i.e. world-x = DELVE_X_MIN - 26 =
// 6574 for slot 0. We set the band edge 1u further west again (6573) so
// isDelvePos covers the ENTIRE room footprint, including the west wall face,
// and the west half is never misclassified as arena. Still >500u clear of ARENA_X.
const DELVE_WALL_X = 25; // mirror of delve_layout.ts WALL_X (delve side-wall centre)
export const DELVE_BAND_X_MIN = DELVE_X_MIN - (DELVE_WALL_X + DUNGEON_WALL_HW + 1);
export const DELVE_SLOT_COUNT = 6;
export const DELVE_MODULE_GAP = 16;
export const DELVE_MODULE_Z_START = 8;
const DELVE_Z0 = -1250;
const DELVE_SLOT_SPACING = 620; // covers 110u×4 rooms + 16u×3 gaps + 40u margin ≈ 536u

export function delveOrigin(delveIndex: number, slot: number): { x: number; z: number } {
  return { x: DELVE_X_MIN + delveIndex * 600, z: DELVE_Z0 + slot * DELVE_SLOT_SPACING };
}

// Bounded ABOVE by the rift band (mirrors how isArenaPos is bounded by
// DELVE_BAND_X_MIN). Every instance plane owns a half-open x range, so exactly
// one resolver ever claims a far-off position. Nothing has ever been placed at
// x >= RIFT_BAND_X_MIN, so adding the upper bound changes no existing behavior.
export function isDelvePos(x: number): boolean {
  return x >= DELVE_BAND_X_MIN && x < RIFT_BAND_X_MIN;
}

// ---------------------------------------------------------------------------
// One-time migration for the Cinderforge band shift.
//
// The arena moved 5400 -> 6000 and the delve band 6000 -> 6600 when dungeon
// index 8 claimed x = 5700. A character who logged out inside an arena match or
// a delve holds a saved x in the OLD band, and `dungeonAt` now answers
// "Cinderforge" for most of that range (it rounds (x - 900) / 600, so anything
// in [5400, 6000) rounds to index 8). Ejecting them to the Cinderforge door
// would drop a level-8 arena player into the level-20 endgame zone, so a saved
// position anywhere in the stale range goes to that character's own zone hub
// instead. The dungeon COLUMNS are carved out: nothing was ever saved at
// x = 5700 +/- 25, so a position there is a genuine new-band dungeon position
// and must keep ejecting to its dungeon door.
// ---------------------------------------------------------------------------

/** Old ARENA_X_MIN, i.e. the west edge of the stale arena/delve territory. */
const LEGACY_INSTANCE_X_MIN = 5400;

/** Half-width of a dungeon instance footprint: the end wall is the widest
 *  primitive a layout places (DUNGEON_END_WALL_HW), plus its half thickness. */
const DUNGEON_COLUMN_HALF_X = 24 + DUNGEON_WALL_HW;

/** True when `x` sits inside SOME dungeon instance column, i.e. inside a real
 *  interior rather than in the dead space the bands left behind. */
function insideDungeonColumn(x: number): boolean {
  return DUNGEON_LIST.some(
    (d) => Math.abs(x - instanceOrigin(d.index, 0).x) <= DUNGEON_COLUMN_HALF_X,
  );
}

/** A saved x that belonged to the pre-shift arena or delve bands and no longer
 *  resolves to the plane it was written for. Bounded above by the CURRENT delve
 *  band edge, so a live delve position is never migrated. */
export function isLegacyInstancePos(x: number): boolean {
  if (x < LEGACY_INSTANCE_X_MIN || x >= DELVE_BAND_X_MIN) return false;
  return !insideDungeonColumn(x);
}

/** The hub settlement a character of this level belongs to. STRIP zones are the
 *  main progression and are authored in ascending level order, so the last one
 *  whose band has opened is theirs. Column zones are deliberately excluded: they
 *  are side content authored beside a band rather than after it, so including
 *  them would let a low-level column zone shadow the level-20 hub for a capped
 *  character being ejected out of a stale instance position. */
export function zoneForLevel(level: number): ZoneDef {
  let best = STRIP_ZONES[0];
  for (const zone of STRIP_ZONES) {
    if (level >= zone.levelRange[0]) best = zone;
  }
  return best;
}

export function delveAt(x: number): DelveDef | null {
  if (!isDelvePos(x)) return null;
  const index = Math.round((x - DELVE_X_MIN) / 600);
  return DELVE_LIST.find((d) => d.index === index) ?? null;
}

export const DELVES: Record<string, DelveDef> = {
  [COLLAPSED_RELIQUARY_DELVE.id]: COLLAPSED_RELIQUARY_DELVE,
};
export const DELVE_LIST: DelveDef[] = Object.values(DELVES).sort((a, b) => a.index - b.index);
export const DELVE_MODULES: Record<string, DelveModuleDef> = {
  ...COLLAPSED_RELIQUARY_MODULES,
};

function delveModuleFootprint(moduleId: string): number {
  const mod = DELVE_MODULES[moduleId];
  const layoutId = (mod?.layout ?? moduleId) as DelveModuleId;
  if (DELVE_MODULE_LAYOUTS[layoutId]) return delveModuleSpan(layoutId);
  return mod?.length ?? 50;
}

/** World-z offset of a delve module within its instance slot (matches Sim). */
export function delveModuleZOffset(modules: readonly string[], moduleIndex: number): number {
  let z = DELVE_MODULE_Z_START;
  for (let i = 0; i < moduleIndex; i++) {
    z += delveModuleFootprint(modules[i]) + DELVE_MODULE_GAP;
  }
  return z;
}

/** Relative-z extent of a full module chain from the slot door (matches renderer gate). */
export function delveModuleStackEndRelZ(modules: readonly string[], margin = 40): number {
  if (modules.length === 0) return DELVE_MODULE_Z_START + 80 + margin;
  const lastId = modules[modules.length - 1];
  const layoutId = (DELVE_MODULES[lastId]?.layout ?? lastId) as DelveModuleId;
  const layout = DELVE_MODULE_LAYOUTS[layoutId];
  return delveModuleZOffset(modules, modules.length - 1) + (layout?.zMax ?? 91) + margin;
}

/** Pick the instance slot whose stacked module band contains world-z. */
export function delveSlotAt(delveIndex: number, z: number, modules: readonly string[]): number {
  const mods = modules.length > 0 ? modules : ['reliquary_sunken_ossuary'];
  const stackEnd = delveModuleStackEndRelZ(mods);
  const zMin = DELVE_MODULE_Z_START - 30;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const relZ = z - o.z;
    if (relZ >= zMin && relZ <= stackEnd) return i;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const d = Math.abs(z - o.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Memoized: the default chain is a pure function of the static DELVES table, and
// callers (collision/camera fallback) hit it per-frame inside the delve band, so
// cache one frozen array per delve id instead of reallocating each call.
const DEFAULT_DELVE_MODULES = new Map<string, readonly string[]>();

/** Default module chain for a delve when no active run is available. */
export function defaultDelveModules(delveId: string): readonly string[] {
  const cached = DEFAULT_DELVE_MODULES.get(delveId);
  if (cached) return cached;
  const delve = DELVES[delveId];
  const chain = delve
    ? Object.freeze([
        ...delve.modules.slice(0, delve.moduleCount[0] ?? delve.modules.length),
        delve.finaleModuleId,
      ])
    : Object.freeze(['reliquary_sunken_ossuary']);
  DEFAULT_DELVE_MODULES.set(delveId, chain);
  return chain;
}

/** Map world position to the active delve module band (instance-local coords). */
export function delveModuleLocal(
  x: number,
  z: number,
  modules: readonly string[],
): {
  ox: number;
  oz: number;
  moduleIndex: number;
  moduleId: string;
  localX: number;
  localZ: number;
} {
  const delve = delveAt(x);
  const index = delve?.index ?? Math.round((x - DELVE_X_MIN) / 600);
  const mods =
    modules.length > 0
      ? modules
      : delve
        ? defaultDelveModules(delve.id)
        : ['reliquary_sunken_ossuary'];
  const slot = delveOrigin(index, delveSlotAt(index, z, mods));
  const ox = slot.x;
  const slotOz = slot.z;
  const relZ = z - slotOz;
  let zCursor = DELVE_MODULE_Z_START;
  for (let i = 0; i < mods.length; i++) {
    const len = delveModuleFootprint(mods[i]);
    if (relZ < zCursor + len || i === mods.length - 1) {
      return {
        ox,
        oz: slotOz + zCursor,
        moduleIndex: i,
        moduleId: mods[i],
        localX: x - ox,
        localZ: relZ - zCursor,
      };
    }
    zCursor += len + DELVE_MODULE_GAP;
  }
  const last = mods[mods.length - 1];
  return {
    ox,
    oz: slotOz + zCursor,
    moduleIndex: mods.length - 1,
    moduleId: last,
    localX: x - ox,
    localZ: relZ - zCursor,
  };
}

// ---------------------------------------------------------------------------
// Rifts: procedurally generated instances (src/sim/rift), in their OWN x band
// above every other instance plane.
//
// Why a new band rather than another dungeon index: `instanceOrigin` puts
// dungeon index i at x = 900 + i*600, and `dungeonAt` returns null at
// x >= ARENA_X_MIN. Every added dungeon index costs the arena and the delve band
// a 600-wide shift out (that is exactly what the Cinderforge at index 8 did),
// which is a migration for every saved position in the old bands. Rifts
// therefore get their own origin function and their own `riftAt` resolver,
// exactly as the arena and the delves each did.
//
// Why ABOVE the delve band: the delve band was the only open-ended predicate in
// the file (`isDelvePos` was `x >= DELVE_BAND_X_MIN` with no ceiling), so every
// x past it was already classified as delve. Bounding it and opening the range
// above is the one placement that leaves all four existing predicates
// (`dungeonAt`, `isArenaPos`, `isDelvePos`, `zoneAt`) answering exactly as they
// do today for every position the world can actually produce.
//
// RIFT_X = 12000 leaves the delve band nine future indices (6600..11400, each
// 600 wide) before it is reached; it was ten before the Cinderforge pushed
// DELVE_X_MIN from 6000 to 6600.
// ---------------------------------------------------------------------------

/** Every rift instance shares this x; slots stack along z (mirrors the arena). */
export const RIFT_X = 12000;
/** Widest side-wall centreline `src/sim/rift/layout_gen.ts` can roll (its
 * WIDTH_MAX_BOSS ceiling). The generated end wall reaches `wallX + 1` and the
 * side wall's outer face `wallX + DUNGEON_WALL_HW`, so the band edge below
 * covers the whole room footprint plus a yard, the same reasoning as
 * DELVE_BAND_X_MIN. `tests/rift_wiring.test.ts` pins that no generated floor
 * ever exceeds it. */
const RIFT_WALL_X_MAX = 32;
/** x at/after this is a rift instance, and nothing else. */
export const RIFT_BAND_X_MIN = RIFT_X - (RIFT_WALL_X_MAX + DUNGEON_WALL_HW + 1);
/** Concurrent rift runs the world can host. */
export const RIFT_SLOT_COUNT = 6;
const RIFT_Z0 = -1250;
/** > the deepest generated floor (zMin -19 to zMax 133) plus a wide margin, so
 * two slots can never see or collide with each other. */
const RIFT_SLOT_SPACING = 500;

/** Instance origin of one rift slot. A rift run holds ONE slot for its whole
 * descent: each floor replaces the previous one in place. */
export function riftOrigin(slot: number): { x: number; z: number } {
  return { x: RIFT_X, z: RIFT_Z0 + slot * RIFT_SLOT_SPACING };
}

export function isRiftPos(x: number): boolean {
  return x >= RIFT_BAND_X_MIN;
}

const RIFT_BAND: { x: number; slotCount: number } = Object.freeze({
  x: RIFT_X,
  slotCount: RIFT_SLOT_COUNT,
});

/** The rift band a far-off position belongs to, or null when x is not in it.
 * The band is a single x column (unlike dungeons, whose index picks the column),
 * so this is the rift twin of `dungeonAt` / `delveAt`. */
export function riftAt(x: number): { x: number; slotCount: number } | null {
  return isRiftPos(x) ? RIFT_BAND : null;
}

/** Nearest rift slot to a world z. Mirrors `arenaOriginAt`: the x is shared
 * across slots, so the z band is what identifies the instance. */
export function riftSlotAt(z: number): number {
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < RIFT_SLOT_COUNT; i++) {
    const d = Math.abs(z - riftOrigin(i).z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
