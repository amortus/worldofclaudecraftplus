// Rift-exclusive items: the legendary chase, and NOTHING else.
//
// Data-as-code only, no logic. Shapes come from `ItemDef` (../../types).
//
// WHY SO FEW. The rift loot economy deliberately does NOT mint a parallel gear
// ladder: every other rank pool in `sim/rift/loot_pools.ts` draws from gear this
// fork already ships (zone-3 Sanctum, zone-4 Ashen Wastes, Claudeholme tier 0.55,
// the Claudexxaramas off-set epics). The only thing rifts add to the world is the
// chase below, because there is nothing existing to point a chase at: `legendary`
// quality is unused in this fork today (the Mournlight staff chain is named
// legendary but ships as `epic`).
//
// POWER BUDGET, and why a legendary is not a power jump. These three sit at the
// stat budget of the Claudexxaramas OFF-SET diversity epics (`cx_ep_war` /
// `cx_ep_mag` / `cx_ep_rog` in ../dungeons.ts: 24 stat points, 19.8 to 30.9 dps)
// and each is a touch UNDER its counterpart on weapon dps. They are therefore
// equal-to-slightly-below the raid's secondary weapons and clearly below
// Mournlight (32 points, sellValue 20000), which stays the single best weapon in
// the game. The legendary colour is the prestige; the power is not. That is what
// keeps an infinitely repeatable procedural dungeon from eclipsing the authored
// ten-player raid.
//
// NAMES are player-visible English, the source the client localizes (see
// content/CLAUDE.md). The three names are listed in the loot report so the UI
// wave can register them in `src/ui/world_entity_i18n.ts`.
//
// MERGE PATH: `RIFT_ITEMS` reaches the live `ITEMS` table the same way
// `PROFESSION_ITEMS` and `DELVE_ITEMS` do, through `mergeItems(...)` in
// `sim/data.ts`. Until that one-line spread lands, these ids resolve only through
// this table.

import type { ItemDef, PlayerClass } from '../../types';

// Archetype groups, mirroring content/items.ts and content/delves/items.ts:
// REWARD_ARCHETYPE (data.ts) hands warrior rewards to paladins/shamans, so a
// class lock must admit the whole group, never a single class.
const WAR: PlayerClass[] = ['warrior', 'paladin', 'shaman'];
const MAG: PlayerClass[] = ['mage', 'priest', 'warlock', 'druid'];
const ROG: PlayerClass[] = ['rogue', 'hunter'];

export const RIFT_ITEMS: Record<string, ItemDef> = {
  rift_aetherbreach: {
    id: 'rift_aetherbreach',
    name: 'Aetherbreach, Blade of the Closed Way',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'legendary',
    // 20.7 dps, matching `veholt_war` and under `cx_ep_war` (21.4).
    weapon: { min: 46, max: 70, speed: 2.8 },
    stats: { str: 15, sta: 9 },
    sellValue: 12000,
    requiredClass: WAR,
  },
  rift_voidhymn: {
    id: 'rift_voidhymn',
    name: 'Voidhymn, Staff of the Unmade Hour',
    kind: 'weapon',
    slot: 'mainhand',
    // 19.2 dps, under `cx_ep_mag` (19.8).
    weapon: { min: 38, max: 58, speed: 2.5 },
    quality: 'legendary',
    stats: { int: 16, spi: 8 },
    sellValue: 12000,
    requiredClass: MAG,
  },
  rift_silentfang: {
    id: 'rift_silentfang',
    name: 'Silentfang, Edge of the Last Door',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'legendary',
    // 29.4 dps, under `cx_ep_rog` (30.9).
    weapon: { min: 40, max: 60, speed: 1.7, dagger: true },
    stats: { agi: 16, sta: 8 },
    sellValue: 12000,
    requiredClass: ROG,
  },
};

/** The legendary chase pool, in a FIXED order. `sim/rift/loot_pools.ts` indexes
 * it with a single rng draw, so reordering this array changes which legendary a
 * given seed yields. Append only. */
export const RIFT_LEGENDARY_IDS: readonly string[] = [
  'rift_aetherbreach',
  'rift_voidhymn',
  'rift_silentfang',
];
