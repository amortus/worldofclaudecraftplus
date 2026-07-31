// Fishing water: the per-zone catch tables, now indexed by proficiency band,
// plus the water tier each zone sits at.
//
// BAND 0 FOR ZONES 1 TO 3 IS THE SHIPPED TABLE, COPIED ROW FOR ROW from
// `FISHING_TABLES` in `src/sim/content/items.ts`. That is deliberate and is
// pinned by a test: a brand-new character with no fishing proficiency must
// catch exactly what they catch today, so adding the ladder is not a stealth
// rebalance of the existing game. Bands 1 and 2 are the new rungs: weight moves
// out of junk and the empty hook and into food fish, with a small bump to the
// rare, exactly as upstream's FISHING_TABLES_BY_BAND does.
//
// The ashen_wastes rows are entirely new. Zone 4 currently has no table of its
// own and falls back to the Vale's, which is why its two fish are authored
// here: the Stillmere should not be handing out Eastbrook trout.

import type { FishingBandTables, FishingEntry } from '../../professions/types';
import type { ItemDef } from '../../types';

// Zone 4's own catches. Food values follow the shipped ladder (Vale 61,
// Mirefen 90, Thornpeak 117): zone 4 is the level-20 endgame, so its fish match
// Thornpeak's restore and sell a little higher.
export const FISHING_WATER_ITEMS: Record<string, ItemDef> = {
  raw_pallid_ashfish: {
    id: 'raw_pallid_ashfish',
    name: 'Raw Pallid Ashfish',
    kind: 'food',
    quality: 'common',
    foodHp: 117,
    sellValue: 14,
  },
  raw_cinderscale_eel: {
    id: 'raw_cinderscale_eel',
    name: 'Raw Cinderscale Eel',
    kind: 'food',
    quality: 'common',
    foodHp: 117,
    sellValue: 14,
  },
};

/** Which catches teach an angler nothing once they outgrow band 0.
 *
 *  An explicit id set rather than an `ItemDef.kind === 'junk'` test, because
 *  this wave's gathered materials also had to be filed under that kind (see
 *  gather_materials.ts): reading the kind would be correct today and quietly
 *  wrong the moment anything else reuses it. */
export const FISHING_JUNK_IDS: ReadonlySet<string> = new Set(['tangled_weed', 'soggy_boot']);

export function isFishingJunk(itemId: string): boolean {
  return FISHING_JUNK_IDS.has(itemId);
}

const e = (itemId: string | null, weight: number): FishingEntry => ({ itemId, weight });

export const FISHING_TABLES_BY_BAND: Record<string, FishingBandTables> = {
  eastbrook_vale: [
    // band 0: the shipped table, unchanged
    [
      e('raw_mirror_trout', 45),
      e('raw_river_perch', 30),
      e('tangled_weed', 12),
      e('glimmerfin_koi', 3),
      e(null, 10),
    ],
    [
      e('raw_mirror_trout', 50),
      e('raw_river_perch', 33),
      e('tangled_weed', 7),
      e('glimmerfin_koi', 4),
      e(null, 6),
    ],
    [
      e('raw_mirror_trout', 55),
      e('raw_river_perch', 35),
      e('tangled_weed', 3),
      e('glimmerfin_koi', 5),
      e(null, 2),
    ],
  ],
  mirefen_marsh: [
    [
      e('raw_marsh_pike', 40),
      e('raw_bog_eel', 30),
      e('soggy_boot', 8),
      e('tangled_weed', 9),
      e('glimmerfin_koi', 3),
      e(null, 10),
    ],
    [
      e('raw_marsh_pike', 45),
      e('raw_bog_eel', 33),
      e('soggy_boot', 5),
      e('tangled_weed', 5),
      e('glimmerfin_koi', 4),
      e(null, 8),
    ],
    [
      e('raw_marsh_pike', 50),
      e('raw_bog_eel', 36),
      e('soggy_boot', 2),
      e('tangled_weed', 2),
      e('glimmerfin_koi', 6),
      e(null, 4),
    ],
  ],
  thornpeak_heights: [
    [
      e('raw_frostgill_trout', 40),
      e('raw_stonescale_carp', 30),
      e('tangled_weed', 14),
      e('glimmerfin_koi', 4),
      e(null, 12),
    ],
    [
      e('raw_frostgill_trout', 45),
      e('raw_stonescale_carp', 34),
      e('tangled_weed', 9),
      e('glimmerfin_koi', 5),
      e(null, 7),
    ],
    [
      e('raw_frostgill_trout', 50),
      e('raw_stonescale_carp', 37),
      e('tangled_weed', 4),
      e('glimmerfin_koi', 6),
      e(null, 3),
    ],
  ],
  ashen_wastes: [
    [
      e('raw_pallid_ashfish', 38),
      e('raw_cinderscale_eel', 28),
      e('tangled_weed', 16),
      e('glimmerfin_koi', 4),
      e(null, 14),
    ],
    [
      e('raw_pallid_ashfish', 44),
      e('raw_cinderscale_eel', 33),
      e('tangled_weed', 10),
      e('glimmerfin_koi', 5),
      e(null, 8),
    ],
    [
      e('raw_pallid_ashfish', 50),
      e('raw_cinderscale_eel', 37),
      e('tangled_weed', 4),
      e('glimmerfin_koi', 6),
      e(null, 3),
    ],
  ],
};

/** The band tables for a zone's water. An unmapped zone (fishable water inside
 *  a dungeon) falls back to the Vale's, matching the shipped behavior. */
export function fishingTablesFor(zoneId: string): FishingBandTables {
  return FISHING_TABLES_BY_BAND[zoneId] ?? FISHING_TABLES_BY_BAND.eastbrook_vale;
}
