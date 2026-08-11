// THE DAWN OF CLAUDE REWARD SET - the faction's tier-0.5 armour and weapons,
// and the standing gates its quartermaster sells them behind.
//
// WHY THIS MODULE EXISTS. The set was authored inside `content/zone4.ts` (the
// Ashen Wastes) and sold by `dawn_quartermaster_henning` at Gravewatch. The
// full-map parity pass gave that strip band to upstream's `veiled_hollow`, so
// the Ashen Wastes was RETIRED (see the PARKED CONTENT banner in
// `src/sim/data.ts`) and the whole shelf went with it: the faction stayed
// earnable (the Cinderforge chain still pays `dawn_of_claude` reputation) but
// there was nothing left in the world to spend that standing on. That is the
// same class of bug the gathering tools and the mount reins hit when Gravewatch
// went away, and both were re-homed onto the Veiled Hollow for it.
//
// WHY ONLY 24 ROWS. `ZONE4_ITEMS` carries ~131 items, most of them tied to the
// parked `q_aw_*` quests, so un-parking the table would add a pile of items no
// living content can grant. Only the reputation set is extracted here, verbatim:
// every id, stat, sellValue and buyValue below is a byte-for-byte copy of its
// `ZONE4_ITEMS` row, and every gate a copy of Henning's `vendorReqs`. This is a
// restoration, not a rebalance, so a `diff` against zone4.ts must stay empty.
//
// THE IDS ARE DEFINED TWICE ON PURPOSE. zone4.ts keeps its own copies so the
// retirement stays reversible in one line (that is what the PARKED banner
// promises). The two definitions are identical, so whichever wins the
// `mergeItems` Object.assign is the same row either way; `tests/dawn_rep_loop.test.ts`
// pins that they never drift apart. If the Ashen Wastes is ever un-parked, delete
// this module's item table and put the shelf back on Henning.
//
// WHERE THE SHELF LIVES NOW: `src/sim/data.ts`, next to the mount-vendor block,
// which is the same merge-layer seam the reins use and which leaves the ported
// `realms/veiled_hollow.ts` byte-verbatim against upstream.

import type { ItemDef, NpcDef } from '../types';

// Archetype groups, the same three used by `zone4.ts`, `dungeons.ts` and
// `expansion/items.ts`. `REWARD_ARCHETYPE` (data.ts) fans a reward across a
// whole group, so a piece locks the group, never one class.
const PLATE = ['warrior', 'paladin', 'shaman'] as const;
const CLOTH = ['mage', 'priest', 'warlock', 'druid'] as const;
const LEATHER = ['rogue', 'hunter'] as const;

// The three tier-0.5 sets: 7 armour slots plus a mainhand each, rare quality,
// budgeted for the level cap. VERBATIM from `ZONE4_ITEMS`.
export const DAWN_TIER05_ITEMS: Record<string, ItemDef> = {
  // --- Dawnguard Battlegear (plate) ---
  dawnguard_sabatons: { id: 'dawnguard_sabatons', name: 'Dawnguard Sabatons', kind: 'armor', slot: 'feet', quality: 'rare', stats: { armor: 150, sta: 8, str: 5 }, sellValue: 1500, buyValue: 6000, requiredClass: [...PLATE] },
  dawnguard_gauntlets: { id: 'dawnguard_gauntlets', name: 'Dawnguard Gauntlets', kind: 'armor', slot: 'gloves', quality: 'rare', stats: { armor: 140, sta: 7, str: 6 }, sellValue: 1500, buyValue: 6000, requiredClass: [...PLATE] },
  dawnguard_girdle: { id: 'dawnguard_girdle', name: 'Dawnguard Girdle', kind: 'armor', slot: 'waist', quality: 'rare', stats: { armor: 145, sta: 8, str: 5 }, sellValue: 1500, buyValue: 6000, requiredClass: [...PLATE] },
  dawnguard_greathelm: { id: 'dawnguard_greathelm', name: 'Dawnguard Greathelm', kind: 'armor', slot: 'helmet', quality: 'rare', stats: { armor: 190, sta: 11, str: 7 }, sellValue: 2400, buyValue: 9000, requiredClass: [...PLATE] },
  dawnguard_legplates: { id: 'dawnguard_legplates', name: 'Dawnguard Legplates', kind: 'armor', slot: 'legs', quality: 'rare', stats: { armor: 210, sta: 12, str: 8 }, sellValue: 2400, buyValue: 9000, requiredClass: [...PLATE] },
  dawnguard_pauldrons: { id: 'dawnguard_pauldrons', name: 'Dawnguard Pauldrons', kind: 'armor', slot: 'shoulder', quality: 'rare', stats: { armor: 175, sta: 10, str: 7 }, sellValue: 3200, buyValue: 12000, requiredClass: [...PLATE] },
  dawnguard_breastplate: { id: 'dawnguard_breastplate', name: 'Dawnguard Breastplate', kind: 'armor', slot: 'chest', quality: 'rare', stats: { armor: 235, sta: 14, str: 9 }, sellValue: 3200, buyValue: 12000, requiredClass: [...PLATE] },
  dawnguard_blade: { id: 'dawnguard_blade', name: 'Dawnguard Blade', kind: 'weapon', slot: 'mainhand', quality: 'rare', weapon: { min: 34, max: 52, speed: 2.5 }, stats: { str: 10, sta: 5 }, sellValue: 5000, buyValue: 18000, requiredClass: [...PLATE] },
  // --- Vestments of the Dawn (cloth) ---
  dawn_slippers: { id: 'dawn_slippers', name: 'Dawn Slippers', kind: 'armor', slot: 'feet', quality: 'rare', stats: { armor: 40, int: 8, spi: 5 }, sellValue: 1500, buyValue: 6000, requiredClass: [...CLOTH] },
  dawn_handwraps: { id: 'dawn_handwraps', name: 'Dawn Handwraps', kind: 'armor', slot: 'gloves', quality: 'rare', stats: { armor: 36, int: 8, spi: 4 }, sellValue: 1500, buyValue: 6000, requiredClass: [...CLOTH] },
  dawn_cord: { id: 'dawn_cord', name: 'Dawn Cord', kind: 'armor', slot: 'waist', quality: 'rare', stats: { armor: 38, int: 8, spi: 4 }, sellValue: 1500, buyValue: 6000, requiredClass: [...CLOTH] },
  dawn_cowl: { id: 'dawn_cowl', name: 'Dawn Cowl', kind: 'armor', slot: 'helmet', quality: 'rare', stats: { armor: 52, int: 11, spi: 6 }, sellValue: 2400, buyValue: 9000, requiredClass: [...CLOTH] },
  dawn_leggings: { id: 'dawn_leggings', name: 'Dawn Leggings', kind: 'armor', slot: 'legs', quality: 'rare', stats: { armor: 58, int: 12, spi: 7 }, sellValue: 2400, buyValue: 9000, requiredClass: [...CLOTH] },
  dawn_mantle: { id: 'dawn_mantle', name: 'Dawn Mantle', kind: 'armor', slot: 'shoulder', quality: 'rare', stats: { armor: 48, int: 10, spi: 6 }, sellValue: 3200, buyValue: 12000, requiredClass: [...CLOTH] },
  dawn_robe: { id: 'dawn_robe', name: 'Dawn Robe', kind: 'armor', slot: 'chest', quality: 'rare', stats: { armor: 66, int: 14, spi: 8 }, sellValue: 3200, buyValue: 12000, requiredClass: [...CLOTH] },
  dawn_scepter: { id: 'dawn_scepter', name: 'Scepter of the Dawn', kind: 'weapon', slot: 'mainhand', quality: 'rare', weapon: { min: 28, max: 43, speed: 2.6 }, stats: { int: 10, spi: 5 }, sellValue: 5000, buyValue: 18000, requiredClass: [...CLOTH] },
  // --- Dawnstalker Armor (leather) ---
  dawnstalker_treads: { id: 'dawnstalker_treads', name: 'Dawnstalker Treads', kind: 'armor', slot: 'feet', quality: 'rare', stats: { armor: 90, agi: 8, sta: 4 }, sellValue: 1500, buyValue: 6000, requiredClass: [...LEATHER] },
  dawnstalker_grips: { id: 'dawnstalker_grips', name: 'Dawnstalker Grips', kind: 'armor', slot: 'gloves', quality: 'rare', stats: { armor: 85, agi: 8, sta: 3 }, sellValue: 1500, buyValue: 6000, requiredClass: [...LEATHER] },
  dawnstalker_belt: { id: 'dawnstalker_belt', name: 'Dawnstalker Belt', kind: 'armor', slot: 'waist', quality: 'rare', stats: { armor: 88, agi: 8, sta: 4 }, sellValue: 1500, buyValue: 6000, requiredClass: [...LEATHER] },
  dawnstalker_mask: { id: 'dawnstalker_mask', name: 'Dawnstalker Mask', kind: 'armor', slot: 'helmet', quality: 'rare', stats: { armor: 115, agi: 11, sta: 5 }, sellValue: 2400, buyValue: 9000, requiredClass: [...LEATHER] },
  dawnstalker_legguards: { id: 'dawnstalker_legguards', name: 'Dawnstalker Legguards', kind: 'armor', slot: 'legs', quality: 'rare', stats: { armor: 125, agi: 12, sta: 6 }, sellValue: 2400, buyValue: 9000, requiredClass: [...LEATHER] },
  dawnstalker_spaulders: { id: 'dawnstalker_spaulders', name: 'Dawnstalker Spaulders', kind: 'armor', slot: 'shoulder', quality: 'rare', stats: { armor: 105, agi: 10, sta: 5 }, sellValue: 3200, buyValue: 12000, requiredClass: [...LEATHER] },
  dawnstalker_tunic: { id: 'dawnstalker_tunic', name: 'Dawnstalker Tunic', kind: 'armor', slot: 'chest', quality: 'rare', stats: { armor: 135, agi: 14, sta: 7 }, sellValue: 3200, buyValue: 12000, requiredClass: [...LEATHER] },
  dawnstalker_dagger: { id: 'dawnstalker_dagger', name: 'Dawnstalker Dagger', kind: 'weapon', slot: 'mainhand', quality: 'rare', weapon: { min: 31, max: 47, speed: 1.8 }, stats: { agi: 10, sta: 5 }, sellValue: 5000, buyValue: 18000, requiredClass: [...LEATHER] },
};

// The standing ladder, VERBATIM from Henning's `vendorReqs`: the boots, gloves
// and belt of each set at Friendly, the helm and legs at Honored, the shoulders
// and chest at Revered, and the weapon as the final Exalted unlock. Every gate
// names `dawn_of_claude`, the faction the set belongs to.
export const DAWN_TIER05_VENDOR_REQS: NonNullable<NpcDef['vendorReqs']> = {
  // Friendly: the boots, gloves, and belt of each set
  dawnguard_sabatons: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawnguard_gauntlets: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawnguard_girdle: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawn_slippers: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawn_handwraps: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawn_cord: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawnstalker_treads: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawnstalker_grips: { faction: 'dawn_of_claude', standing: 'friendly' },
  dawnstalker_belt: { faction: 'dawn_of_claude', standing: 'friendly' },
  // Honored: the helm and legs
  dawnguard_greathelm: { faction: 'dawn_of_claude', standing: 'honored' },
  dawnguard_legplates: { faction: 'dawn_of_claude', standing: 'honored' },
  dawn_cowl: { faction: 'dawn_of_claude', standing: 'honored' },
  dawn_leggings: { faction: 'dawn_of_claude', standing: 'honored' },
  dawnstalker_mask: { faction: 'dawn_of_claude', standing: 'honored' },
  dawnstalker_legguards: { faction: 'dawn_of_claude', standing: 'honored' },
  // Revered: the shoulders and chest
  dawnguard_pauldrons: { faction: 'dawn_of_claude', standing: 'revered' },
  dawnguard_breastplate: { faction: 'dawn_of_claude', standing: 'revered' },
  dawn_mantle: { faction: 'dawn_of_claude', standing: 'revered' },
  dawn_robe: { faction: 'dawn_of_claude', standing: 'revered' },
  dawnstalker_spaulders: { faction: 'dawn_of_claude', standing: 'revered' },
  dawnstalker_tunic: { faction: 'dawn_of_claude', standing: 'revered' },
  // Exalted: the weapon completes the set
  dawnguard_blade: { faction: 'dawn_of_claude', standing: 'exalted' },
  dawn_scepter: { faction: 'dawn_of_claude', standing: 'exalted' },
  dawnstalker_dagger: { faction: 'dawn_of_claude', standing: 'exalted' },
};

/** Shelf order for the quartermaster: plate set, cloth set, leather set. */
export const DAWN_TIER05_ITEM_IDS: readonly string[] = Object.keys(DAWN_TIER05_ITEMS);
