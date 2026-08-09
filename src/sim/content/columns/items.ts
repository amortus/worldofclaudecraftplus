// Items the two column zones add: five quest objects and two capstone reward
// sets, one per zone.
//
// REUSE FIRST. Everything else these zones hand out or sell is already shipped
// and is only referenced by id (`oiled_boots`, `roughspun_gloves`, the food /
// potion / gathering-tool ladders). The two sets below are the only new gear,
// and they exist because there is a real hole in the ladder: the shipped
// uncommon chest triplet in `items.ts` (militia_vest / woven_robe /
// shadow_jerkin) is the level 5-6 rung and the shipped uncommon chest triplet
// in `zone2.ts` (drownedguard_breastplate / fenmist_robe / eelskin_tunic) is
// the level 11 rung; nothing sits between them, and the same gap exists on the
// mainhand ladder between redbrook_blade / apprentice_staff / keen_dirk and
// deacons_cleaver / staff_of_drowned_prayers / mistbinder_kris. Alderfen's
// capstone lands at level 8 and Grimhold's at level 10, exactly in the hole.
//
// EVERY NUMBER IS INTERPOLATED BETWEEN TWO SHIPPED RUNGS, and the arithmetic is
// written out at the site. Nothing here is a judgement call about power.
import type { ItemDef, PlayerClass } from '../../types';

// Archetype groups, mirroring the WAR/MAG/ROG consts in `zone2.ts`.
// `REWARD_ARCHETYPE` (data.ts) fans a reward keyed warrior/mage/rogue across
// the whole group, so lock the group and never a single class.
const WAR: PlayerClass[] = ['warrior', 'paladin', 'shaman'];
const MAG: PlayerClass[] = ['mage', 'priest', 'warlock', 'druid'];
const ROG: PlayerClass[] = ['rogue', 'hunter'];

export const COLUMN_ITEMS: Record<string, ItemDef> = {
  // --- quest objects: Alderfen Shallows ------------------------------------
  // Shape and `sellValue: 0` copied from the expansion pack's `houndsbane_root`
  // and `cooled_slag` (expansion/items.ts), which are the shipped template for
  // a ground-object collectible.
  cut_withy: {
    id: 'cut_withy',
    name: 'Cut Withy',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_withies',
  },
  alder_char: {
    id: 'alder_char',
    name: 'Alder Char',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_char',
  },
  // An `interact` target rather than a carried item, the same shape as the
  // expansion's three cairns (`cairn_of_bramble` and siblings).
  mill_sluice_wheel: {
    id: 'mill_sluice_wheel',
    name: 'Mill Sluice Wheel',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_miller',
  },

  // --- quest objects: Grimhold Crags ---------------------------------------
  cragcoal: {
    id: 'cragcoal',
    name: 'Cragcoal',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_gh_coal',
  },
  plundered_sledload: {
    id: 'plundered_sledload',
    name: 'Plundered Sled Load',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_gh_sled',
  },

  // === Alderfen capstone: the Weirwarden's chest triplet (level 8) =========
  // Interpolated between the two shipped uncommon chest triplets:
  //   rung A, level 6  (items.ts):  militia_vest      armor  90, sta 2
  //                                 woven_robe        armor  30, int 3, spi 2
  //                                 shadow_jerkin     armor  55, agi 3   sell 150
  //   rung B, level 11 (zone2.ts):  drownedguard_breastplate armor 130, sta 4
  //                                 fenmist_robe      armor  45, int 5, spi 3
  //                                 eelskin_tunic     armor  80, agi 5   sell 350
  // q_af_miller is minLevel 8, so t = (8 - 6) / (11 - 6) = 0.4 on every axis:
  //   armor  90 + 0.4*40 = 106 | 30 + 0.4*15 = 36 | 55 + 0.4*25 = 65
  //   sta     2 + 0.4*2  = 2.8 -> 3      int 3 + 0.4*2 = 3.8 -> 4
  //   spi     2 + 0.4*1  = 2.4 -> 2      agi 3 + 0.4*2 = 3.8 -> 4
  //   sell  150 + 0.4*200 = 230
  weirguard_hauberk: {
    id: 'weirguard_hauberk',
    name: 'Weirguard Hauberk',
    kind: 'armor',
    slot: 'chest',
    quality: 'uncommon',
    stats: { armor: 106, sta: 3 },
    sellValue: 230,
    requiredClass: WAR,
  },
  sedgeweave_robe: {
    id: 'sedgeweave_robe',
    name: 'Sedgeweave Robe',
    kind: 'armor',
    slot: 'chest',
    quality: 'uncommon',
    stats: { armor: 36, int: 4, spi: 2 },
    sellValue: 230,
    requiredClass: MAG,
  },
  millrace_jerkin: {
    id: 'millrace_jerkin',
    name: 'Millrace Jerkin',
    kind: 'armor',
    slot: 'chest',
    quality: 'uncommon',
    stats: { armor: 65, agi: 4 },
    sellValue: 230,
    requiredClass: ROG,
  },

  // === Grimhold capstone: Old Grimfang's mainhand triplet (level 10) =======
  // Interpolated between the two shipped uncommon mainhand triplets:
  //   rung A, level 6  (items.ts):  redbrook_blade   6-11 @ 2.2, str 2
  //                                 apprentice_staff 7-12 @ 3.0, int 3, sta 1
  //                                 keen_dirk        4-8  @ 1.7 dagger, agi 2  sell 120
  //   rung B, level 11 (zone2.ts):  deacons_cleaver         11-18 @ 2.4, str 4
  //                                 staff_of_drowned_prayers 12-20 @ 3.0, int 5, spi 2
  //                                 mistbinder_kris          7-12 @ 1.7 dagger, agi 4  sell 300
  // q_gh_grimfang is minLevel 10, so t = (10 - 6) / (11 - 6) = 0.8:
  //   war  min 6 + 0.8*5 = 10 | max 11 + 0.8*7 = 16.6 -> 16 | speed 2.2 + 0.8*0.2 = 2.4
  //        str 2 + 0.8*2 = 3.6 -> 3
  //   mag  min 7 + 0.8*5 = 11 | max 12 + 0.8*8 = 18.4 -> 18 | speed 3.0
  //        int 3 + 0.8*2 = 4.6 -> 4, and spi 1 (rung A carries no spirit at all,
  //        rung B carries 2, so the lower whole number is the only one that
  //        stays strictly inside the two rungs)
  //   rog  min 4 + 0.8*3 = 6.4 -> 6 | max 8 + 0.8*4 = 11.2 -> 11 | speed 1.7 dagger
  //        agi 2 + 0.8*2 = 3.6 -> 3
  //   sell 120 + 0.8*180 = 264 -> 260
  grimfang_splitter: {
    id: 'grimfang_splitter',
    name: 'Grimfang Splitter',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'uncommon',
    weapon: { min: 10, max: 16, speed: 2.4 },
    stats: { str: 3 },
    sellValue: 260,
    requiredClass: WAR,
  },
  coldhearth_emberstaff: {
    id: 'coldhearth_emberstaff',
    name: 'Coldhearth Emberstaff',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'uncommon',
    weapon: { min: 11, max: 18, speed: 3.0 },
    stats: { int: 4, spi: 1 },
    sellValue: 260,
    requiredClass: MAG,
  },
  cragmaw_fang: {
    id: 'cragmaw_fang',
    name: 'Cragmaw Fang',
    kind: 'weapon',
    slot: 'mainhand',
    quality: 'uncommon',
    weapon: { min: 6, max: 11, speed: 1.7, dagger: true },
    stats: { agi: 3 },
    sellValue: 260,
    requiredClass: ROG,
  },
};
