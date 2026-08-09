// Expansion items: the Cinderforge loot table plus the quest objects for the
// four new quest lines in zones 1 to 4.
//
// BALANCE ANCHORS. Nothing here invents a number. Every gear piece is derived
// from a shipped item of the same slot, armour class and tier, and the anchor
// is named at the site. The two ladders used:
//   * Cinderforge armour (rare) sits exactly on the Dawn of Claude tier 0.5
//     band in `zone4.ts` (dawnguard_* plate / dawn_* cloth / dawnstalker_*
//     leather). The Cinderforge is a SIBLING of Claudeholme, not a step above
//     it: it hands a group the piece a solo player grinds Dawn standing for,
//     so the budget is identical and only the point split differs.
//   * Cinderforge weapons (epic) sit between the tier 0.55 mainhands
//     (pw_mh / hm_mh / as_mh in `dungeons.ts`) and Veholt's chase epics
//     (veholt_war / veholt_mag / veholt_rog), because Vharkul is a peer of the
//     Claudeholme deathlord rather than his better.
import type { ItemDef } from '../../types';

// Archetype groups, mirroring the PLATE/CLOTH/LEATHER consts in `zone4.ts` and
// `dungeons.ts`. `REWARD_ARCHETYPE` (data.ts) fans a reward keyed
// warrior/mage/rogue across the whole group, so lock the group, not one class.
const PLATE = ['warrior', 'paladin', 'shaman'] as const;
const CLOTH = ['mage', 'priest', 'warlock', 'druid'] as const;
const LEATHER = ['rogue', 'hunter'] as const;

export const EXPANSION_ITEMS: Record<string, ItemDef> = {
  // --- quest objects: Eastbrook Vale ---------------------------------------
  // Ground-object collectibles and interactables. Shape and sellValue 0 copied
  // from zone4's `desecrated_relic` / zone3's `grave_sir_aldren`.
  houndsbane_root: {
    id: 'houndsbane_root',
    name: 'Houndsbane Root',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ev_houndsbane',
  },
  // Three separate cairns, three separate objectives: the exact pattern of
  // q_nythraxis_graves (zone3.ts), whose three graves are three distinct
  // `interact` objectives at count 1 rather than one object interacted thrice.
  cairn_of_bramble: {
    id: 'cairn_of_bramble',
    name: "Bramble's Cairn",
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ev_last_hound',
  },
  cairn_of_old_seld: {
    id: 'cairn_of_old_seld',
    name: "Old Seld's Cairn",
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ev_last_hound',
  },
  cairn_of_the_first_pack: {
    id: 'cairn_of_the_first_pack',
    name: 'Cairn of the First Pack',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ev_last_hound',
  },

  // --- quest objects: Mirefen Marsh ----------------------------------------
  drowned_lantern: {
    id: 'drowned_lantern',
    name: 'Drowned Lantern',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_mf_lanterns',
  },

  // --- quest objects: Thornpeak Heights ------------------------------------
  quarried_keystone: {
    id: 'quarried_keystone',
    name: 'Quarried Keystone',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_tp_keystones',
  },

  // --- quest objects: the Ashen Wastes and the Cinderforge -----------------
  cooled_slag: {
    id: 'cooled_slag',
    name: 'Cooled Slag',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_cf_slagfall',
  },
  cf_covenant_ledger: {
    id: 'cf_covenant_ledger',
    name: 'Ember Covenant Ledger',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_cf_covenant',
  },
  cf_quenchless_ember: {
    id: 'cf_quenchless_ember',
    name: 'Quenchless Ember',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_cf_unquenched',
  },
  // Trash vendor drop. Anchor: `cracked_wyrm_scale` (zone3.ts, junk/poor,
  // sellValue 35), the level 19-20 Gravewyrm Sanctum trash grey. A cap-tier
  // metal scrap sits a notch over it.
  cf_slag_ingot: {
    id: 'cf_slag_ingot',
    name: 'Slagged Ingot',
    kind: 'junk',
    quality: 'poor',
    sellValue: 40,
  },

  // === Cinderforge armour (rare) ==========================================
  // Anchors, per slot, from the Dawn of Claude tier 0.5 sets in `zone4.ts`.
  // Each piece carries the SAME primary-point total as its anchor and the same
  // sellValue band; only the split between the two stats moves, so a group can
  // gear a slot without out-scaling the reputation grind.

  // Gloves. Anchors: dawnguard_gauntlets (armor 140, sta 7, str 6, sell 1500),
  // dawn_handwraps (36, int 8, spi 4), dawnstalker_grips (85, agi 8, sta 3).
  cf_ef_gloves: {
    id: 'cf_ef_gloves',
    name: 'Emberforged Gauntlets',
    kind: 'armor',
    slot: 'gloves',
    quality: 'rare',
    stats: { armor: 144, sta: 6, str: 7 },
    sellValue: 1500,
    requiredClass: [...PLATE],
  },
  cf_cs_gloves: {
    id: 'cf_cs_gloves',
    name: 'Cindersilk Handwraps',
    kind: 'armor',
    slot: 'gloves',
    quality: 'rare',
    stats: { armor: 37, int: 8, spi: 4 },
    sellValue: 1500,
    requiredClass: [...CLOTH],
  },
  cf_ss_gloves: {
    id: 'cf_ss_gloves',
    name: 'Slagstalker Grips',
    kind: 'armor',
    slot: 'gloves',
    quality: 'rare',
    stats: { armor: 88, agi: 8, sta: 3 },
    sellValue: 1500,
    requiredClass: [...LEATHER],
  },

  // Waist. Anchors: dawnguard_girdle (armor 145, sta 8, str 5, sell 1500),
  // dawn_cord (38, int 8, spi 4), dawnstalker_belt (88, agi 8, sta 4).
  cf_ef_waist: {
    id: 'cf_ef_waist',
    name: 'Emberforged Girdle',
    kind: 'armor',
    slot: 'waist',
    quality: 'rare',
    stats: { armor: 148, sta: 7, str: 6 },
    sellValue: 1500,
    requiredClass: [...PLATE],
  },
  cf_cs_waist: {
    id: 'cf_cs_waist',
    name: 'Cindersilk Cord',
    kind: 'armor',
    slot: 'waist',
    quality: 'rare',
    stats: { armor: 39, int: 8, spi: 4 },
    sellValue: 1500,
    requiredClass: [...CLOTH],
  },
  cf_ss_waist: {
    id: 'cf_ss_waist',
    name: 'Slagstalker Belt',
    kind: 'armor',
    slot: 'waist',
    quality: 'rare',
    stats: { armor: 90, agi: 8, sta: 4 },
    sellValue: 1500,
    requiredClass: [...LEATHER],
  },

  // Feet, the Forgewarden quest reward. Anchors: dawnguard_sabatons
  // (armor 150, sta 8, str 5, sell 1500), dawn_slippers (40, int 8, spi 5),
  // dawnstalker_treads (90, agi 8, sta 4).
  cf_ef_feet: {
    id: 'cf_ef_feet',
    name: 'Emberforged Sabatons',
    kind: 'armor',
    slot: 'feet',
    quality: 'rare',
    stats: { armor: 152, sta: 7, str: 6 },
    sellValue: 1500,
    requiredClass: [...PLATE],
  },
  cf_cs_feet: {
    id: 'cf_cs_feet',
    name: 'Cindersilk Slippers',
    kind: 'armor',
    slot: 'feet',
    quality: 'rare',
    stats: { armor: 42, int: 8, spi: 5 },
    sellValue: 1500,
    requiredClass: [...CLOTH],
  },
  cf_ss_feet: {
    id: 'cf_ss_feet',
    name: 'Slagstalker Treads',
    kind: 'armor',
    slot: 'feet',
    quality: 'rare',
    stats: { armor: 92, agi: 8, sta: 4 },
    sellValue: 1500,
    requiredClass: [...LEATHER],
  },

  // Helmet, the chain capstone reward. Anchors: dawnguard_greathelm
  // (armor 190, sta 11, str 7, sell 2400), dawn_cowl (52, int 11, spi 6),
  // dawnstalker_mask (115, agi 11, sta 5).
  cf_ef_helmet: {
    id: 'cf_ef_helmet',
    name: 'Emberforged Greathelm',
    kind: 'armor',
    slot: 'helmet',
    quality: 'rare',
    stats: { armor: 193, sta: 10, str: 8 },
    sellValue: 2400,
    requiredClass: [...PLATE],
  },
  cf_cs_helmet: {
    id: 'cf_cs_helmet',
    name: 'Cindersilk Cowl',
    kind: 'armor',
    slot: 'helmet',
    quality: 'rare',
    stats: { armor: 54, int: 11, spi: 6 },
    sellValue: 2400,
    requiredClass: [...CLOTH],
  },
  cf_ss_helmet: {
    id: 'cf_ss_helmet',
    name: 'Slagstalker Mask',
    kind: 'armor',
    slot: 'helmet',
    quality: 'rare',
    stats: { armor: 117, agi: 11, sta: 5 },
    sellValue: 2400,
    requiredClass: [...LEATHER],
  },

  // Chest, Vharkul's guaranteed drop. Anchors: dawnguard_breastplate
  // (armor 235, sta 14, str 9, sell 3200), dawn_robe (66, int 14, spi 8),
  // dawnstalker_tunic (135, agi 14, sta 7).
  cf_ef_chest: {
    id: 'cf_ef_chest',
    name: 'Emberforged Breastplate',
    kind: 'armor',
    slot: 'chest',
    quality: 'rare',
    stats: { armor: 238, sta: 13, str: 10 },
    sellValue: 3200,
    requiredClass: [...PLATE],
  },
  cf_cs_chest: {
    id: 'cf_cs_chest',
    name: 'Cindersilk Robe',
    kind: 'armor',
    slot: 'chest',
    quality: 'rare',
    stats: { armor: 68, int: 14, spi: 8 },
    sellValue: 3200,
    requiredClass: [...CLOTH],
  },
  cf_ss_chest: {
    id: 'cf_ss_chest',
    name: 'Slagstalker Tunic',
    kind: 'armor',
    slot: 'chest',
    quality: 'rare',
    stats: { armor: 138, agi: 13, sta: 8 },
    sellValue: 3200,
    requiredClass: [...LEATHER],
  },

  // === Vharkul's chase weapons (epic) =====================================
  // Strictly between the tier 0.55 mainhands and Veholt's chase epics, both in
  // `dungeons.ts`. Plate: pw_mh (38-58 @ 2.6, str 12 sta 6, sell 6000) and
  // veholt_war (45-67 @ 2.7, str 14 sta 7, 8000). Cloth: hm_mh (31-47 @ 2.6,
  // int 12 spi 6) and veholt_mag (35-53 @ 2.5, int 14 spi 7). Leather: as_mh
  // (34-52 @ 1.8, agi 12 sta 6) and veholt_rog (39-59 @ 1.8, agi 14 sta 7).
  cf_quenchless_cleaver: {
    id: 'cf_quenchless_cleaver',
    name: 'Quenchless Cleaver',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'epic',
    weapon: { min: 41, max: 62, speed: 2.6 },
    stats: { str: 13, sta: 6 },
    sellValue: 7000,
    requiredClass: [...PLATE],
  },
  cf_quenchless_brand: {
    id: 'cf_quenchless_brand',
    name: 'Brand of the Unquenched',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'epic',
    weapon: { min: 33, max: 50, speed: 2.6 },
    stats: { int: 13, spi: 6 },
    sellValue: 7000,
    requiredClass: [...CLOTH],
  },
  cf_quenchless_fang: {
    id: 'cf_quenchless_fang',
    name: 'Quenchless Fang',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'epic',
    weapon: { min: 36, max: 55, speed: 1.8 },
    stats: { agi: 13, sta: 6 },
    sellValue: 7000,
    requiredClass: [...LEATHER],
  },
};
