// Dungeon content: mob templates that only spawn inside instances, spawn
// lists, and the DungeonDef registry merged by sim/data.ts.

import type { DungeonDef, DungeonSpawn, ItemDef, MobTemplate } from '../types';

export const DUNGEON_MOBS: Record<string, MobTemplate> = {
  // ---- The Hollow Crypt (5-player elite instance) ----
  crypt_shambler: {
    id: 'crypt_shambler', name: 'Crypt Shambler', minLevel: 7, maxLevel: 8, family: 'undead', elite: true,
    hpBase: 50, hpPerLevel: 20, dmgBase: 7, dmgPerLevel: 2.2, attackSpeed: 2.4,
    armorPerLevel: 18, moveSpeed: 6.5, aggroRadius: 12,
    loot: [{ copper: 90, chance: 1 }, { itemId: 'bone_fragments', chance: 0.8 }],
    scale: 1.1, color: 0xb8c4c4,
  },
  hollow_acolyte: {
    id: 'hollow_acolyte', name: 'Hollow Acolyte', minLevel: 8, maxLevel: 8, family: 'undead', elite: true,
    hpBase: 44, hpPerLevel: 18, dmgBase: 8, dmgPerLevel: 2.3, attackSpeed: 2.0,
    armorPerLevel: 14, moveSpeed: 7, aggroRadius: 12,
    loot: [{ copper: 110, chance: 1 }, { itemId: 'linen_scrap', chance: 0.6 }],
    scale: 1.0, color: 0x5b2c6f,
  },
  bonechill_widow: {
    id: 'bonechill_widow', name: 'Bonechill Widow', minLevel: 8, maxLevel: 9, family: 'spider', elite: true,
    hpBase: 48, hpPerLevel: 19, dmgBase: 8, dmgPerLevel: 2.4, attackSpeed: 1.8,
    armorPerLevel: 12, moveSpeed: 8, aggroRadius: 13,
    loot: [{ copper: 120, chance: 1 }, { itemId: 'spider_leg', chance: 0.7 }],
    scale: 1.25, color: 0xd6eaf8,
  },
  sexton_marrow: {
    id: 'sexton_marrow', name: 'Sexton Marrow', minLevel: 9, maxLevel: 9, family: 'undead', elite: true,
    hpBase: 110, hpPerLevel: 24, dmgBase: 9, dmgPerLevel: 2.5, attackSpeed: 2.2,
    armorPerLevel: 22, moveSpeed: 7, aggroRadius: 14,
    loot: [{ copper: 400, chance: 1 }, { itemId: 'quilted_trousers', chance: 0.4 }, { itemId: 'oiled_boots', chance: 0.4 }],
    scale: 1.2, color: 0x839192,
  },
  morthen: {
    id: 'morthen', name: 'Morthen the Gravecaller', minLevel: 10, maxLevel: 10, family: 'undead',
    elite: true, boss: true,
    hpBase: 230, hpPerLevel: 32, dmgBase: 11, dmgPerLevel: 2.6, attackSpeed: 2.6,
    armorPerLevel: 26, moveSpeed: 7, aggroRadius: 16,
    aoePulse: { min: 12, max: 18, radius: 12, every: 10, name: 'Shadow Pulse' },
    loot: [
      { copper: 2500, chance: 1 },
      { itemId: 'cryptbone_greaves', chance: 0.34, rollGroup: 'morthen_guaranteed_uncommon' },
      { itemId: 'quilted_trousers', chance: 0.33, rollGroup: 'morthen_guaranteed_uncommon' },
      { itemId: 'oiled_boots', chance: 0.33, rollGroup: 'morthen_guaranteed_uncommon' },
      { itemId: 'greyjaw_hide_boots', chance: 0.25, rollGroup: 'morthen_bonus' },
      { itemId: 'cryptbone_helm', chance: 0.18, rollGroup: 'morthen_bonus' },
      { itemId: 'cryptbone_pauldrons', chance: 0.18, rollGroup: 'morthen_bonus' },
    ],
    scale: 1.35, color: 0x4a235a,
  },

  // ---- The Sunken Bastion (5-player elite instance, ~L13) ----
  bastion_revenant: {
    id: 'bastion_revenant', name: 'Bastion Revenant', minLevel: 12, maxLevel: 13, family: 'undead', elite: true,
    hpBase: 54, hpPerLevel: 21, dmgBase: 9, dmgPerLevel: 2.4, attackSpeed: 2.3,
    armorPerLevel: 18, moveSpeed: 6.5, aggroRadius: 12,
    loot: [{ copper: 150, chance: 1 }, { itemId: 'bone_fragments', chance: 0.7 }, { itemId: 'mistveil_cord', chance: 0.06, rollGroup: 'revenant_bonus' }],
    scale: 1.1, color: 0x7fa8a0,
    mortalStrike: { chance: 0.3, healReduction: 0.5, duration: 6, name: 'Mortal Strike' },
  },
  tidebound_acolyte: {
    id: 'tidebound_acolyte', name: 'Tidebound Acolyte', minLevel: 12, maxLevel: 13, family: 'humanoid', elite: true,
    hpBase: 50, hpPerLevel: 20, dmgBase: 10, dmgPerLevel: 2.5, attackSpeed: 2.0,
    armorPerLevel: 14, moveSpeed: 7, aggroRadius: 12,
    loot: [{ copper: 170, chance: 1 }, { itemId: 'linen_scrap', chance: 0.5 }, { itemId: 'mistveil_grips', chance: 0.06, rollGroup: 'acolyte_bonus' }],
    desperateHeal: { belowHpPct: 0.3, healPct: 0.25 },
    scale: 1.0, color: 0x1f618d,
  },
  drowned_thrall: {
    id: 'drowned_thrall', name: 'Drowned Thrall', minLevel: 11, maxLevel: 11, family: 'undead',
    hpBase: 40, hpPerLevel: 14, dmgBase: 7, dmgPerLevel: 2.0, attackSpeed: 2.0,
    armorPerLevel: 10, moveSpeed: 7.5, aggroRadius: 12,
    loot: [], // summoned add — nothing to loot
    scale: 0.95, color: 0x6fae9e,
  },
  knight_commander_olen: {
    id: 'knight_commander_olen', name: 'Knight-Commander Olen', minLevel: 13, maxLevel: 13, family: 'undead', elite: true,
    hpBase: 120, hpPerLevel: 26, dmgBase: 11, dmgPerLevel: 2.6, attackSpeed: 2.2,
    armorPerLevel: 24, moveSpeed: 7, aggroRadius: 14,
    loot: [
      { copper: 800, chance: 1 },
      { itemId: 'trollhide_leggings', chance: 0.50, rollGroup: 'olen_guaranteed_uncommon' },
      { itemId: 'marshstrider_boots', chance: 0.50, rollGroup: 'olen_guaranteed_uncommon' },
      { itemId: 'fenmist_robe', chance: 0.25, rollGroup: 'olen_bonus' },
      { itemId: 'tideguard_greaves', chance: 0.10, rollGroup: 'olen_bonus' },
      { itemId: 'tideguard_sabatons', chance: 0.10, rollGroup: 'olen_bonus' },
      { itemId: 'eelscale_leggings', chance: 0.10, rollGroup: 'olen_bonus' },
    ], // his greaves are Maren's quest reward, not a drop
    scale: 1.2, color: 0x95a5a6,
    cleave: { radius: 8, mult: 0.6, name: 'Cleave' },
  },
  vael_the_mistcaller: {
    id: 'vael_the_mistcaller', name: 'Vael the Mistcaller', minLevel: 13, maxLevel: 13, family: 'humanoid',
    elite: true, boss: true,
    hpBase: 240, hpPerLevel: 34, dmgBase: 12, dmgPerLevel: 2.6, attackSpeed: 2.4,
    armorPerLevel: 26, moveSpeed: 7, aggroRadius: 16,
    aoePulse: { min: 16, max: 24, radius: 12, every: 10, name: 'Mist Surge' },
    summonAdds: { mobId: 'drowned_thrall', count: 2, atHpPct: [0.6, 0.3] },
    loot: [
      { copper: 5000, chance: 1 },
      { itemId: 'trollhide_leggings', chance: 0.34, rollGroup: 'vael_guaranteed_uncommon' },
      { itemId: 'marshstrider_boots', chance: 0.33, rollGroup: 'vael_guaranteed_uncommon' },
      { itemId: 'fenmist_robe', chance: 0.33, rollGroup: 'vael_guaranteed_uncommon' },
      { itemId: 'deepfen_pearl', chance: 1 },
      { itemId: 'eelskin_tunic', chance: 0.20, rollGroup: 'vael_bonus' },
      { itemId: 'tidescale_vest', chance: 0.10, rollGroup: 'vael_bonus' },
      { itemId: 'drowned_prayer_leggings', chance: 0.10, rollGroup: 'vael_bonus' },
      { itemId: 'drowned_prayer_sandals', chance: 0.10, rollGroup: 'vael_bonus' },
      { itemId: 'eelscale_treads', chance: 0.10, rollGroup: 'vael_bonus' },
      { itemId: 'mistveil_cord', chance: 0.12, rollGroup: 'vael_bonus' },
      { itemId: 'mistveil_grips', chance: 0.12, rollGroup: 'vael_bonus' },
    ],
    scale: 1.35, color: 0x48c9b0,
  },

  // ---- Gravewyrm Sanctum (5-player elite instance, L20 finale) ----
  sanctum_boneguard: {
    id: 'sanctum_boneguard', name: 'Sanctum Boneguard', minLevel: 19, maxLevel: 19, family: 'undead', elite: true,
    hpBase: 64, hpPerLevel: 23, dmgBase: 12, dmgPerLevel: 2.7, attackSpeed: 2.3,
    armorPerLevel: 22, moveSpeed: 6.5, aggroRadius: 12,
    loot: [{ copper: 300, chance: 1 }, { itemId: 'bone_fragments', chance: 0.6 }, { itemId: 'boundstone_helm', chance: 0.04, rollGroup: 'boneguard_bonus' }, { itemId: 'boundstone_girdle', chance: 0.04, rollGroup: 'boneguard_bonus' }],
    scale: 1.15, color: 0xcfc8b0,
  },
  sanctum_drakonid: {
    id: 'sanctum_drakonid', name: 'Sanctum Drakonid', minLevel: 19, maxLevel: 20, family: 'dragonkin', elite: true,
    hpBase: 68, hpPerLevel: 24, dmgBase: 13, dmgPerLevel: 2.8, attackSpeed: 2.2,
    armorPerLevel: 26, moveSpeed: 7, aggroRadius: 13,
    loot: [{ copper: 350, chance: 1 }, { itemId: 'cracked_wyrm_scale', chance: 0.5 }, { itemId: 'gravewyrm_mantle', chance: 0.05, rollGroup: 'drakonid_bonus' }, { itemId: 'gravewyrm_gauntlets', chance: 0.05, rollGroup: 'drakonid_bonus' }],
    scale: 1.45, color: 0x567d46, // Korzul's rig at 0.8x his bulk
  },
  raised_bonewalker: {
    id: 'raised_bonewalker', name: 'Raised Bonewalker', minLevel: 18, maxLevel: 18, family: 'undead',
    hpBase: 42, hpPerLevel: 15, dmgBase: 9, dmgPerLevel: 2.2, attackSpeed: 2.2,
    armorPerLevel: 12, moveSpeed: 7, aggroRadius: 12,
    loot: [], // summoned add — nothing to loot
    scale: 1.0, color: 0xc8cfc8,
  },
  korgath_the_bound: {
    id: 'korgath_the_bound', name: 'Korgath the Bound', minLevel: 20, maxLevel: 20, family: 'ogre', elite: true,
    hpBase: 260, hpPerLevel: 36, dmgBase: 14, dmgPerLevel: 2.9, attackSpeed: 2.8,
    armorPerLevel: 30, moveSpeed: 7, aggroRadius: 15,
    enrage: { belowHpPct: 0.30, dmgMult: 1.5, hasteMult: 1.3 },
    stomp: { radius: 10, every: 12, duration: 1.5, min: 20, max: 30, name: 'War Stomp' },
    loot: [
      { copper: 5000, chance: 1 },
      { itemId: 'boneplate_vest', chance: 0.34, rollGroup: 'korgath_guaranteed_uncommon' },
      { itemId: 'revenant_silk_robe', chance: 0.33, rollGroup: 'korgath_guaranteed_uncommon' },
      { itemId: 'nightwalk_jerkin', chance: 0.33, rollGroup: 'korgath_guaranteed_uncommon' },
      { itemId: 'zealotsbane_blade', chance: 0.20, rollGroup: 'korgath_bonus' },
      { itemId: 'korgaths_chainwraps', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'staff_of_velkhar', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'shadowmeld_tunic', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'wyrmcult_grand_robe', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'gravewyrm_sabatons', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'wyrmcult_soulsteps', chance: 0.10, rollGroup: 'korgath_bonus' },
      { itemId: 'wyrmshadow_treads', chance: 0.05, rollGroup: 'korgath_bonus' },
      { itemId: 'boundstone_helm', chance: 0.08, rollGroup: 'korgath_bonus' },
      { itemId: 'gravewyrm_mantle', chance: 0.08, rollGroup: 'korgath_bonus' },
    ],
    scale: 1.5, color: 0x8f6f46,
  },
  grand_necromancer_velkhar: {
    id: 'grand_necromancer_velkhar', name: 'Grand Necromancer Velkhar', minLevel: 20, maxLevel: 20, family: 'humanoid', elite: true,
    hpBase: 230, hpPerLevel: 33, dmgBase: 13, dmgPerLevel: 2.8, attackSpeed: 2.0,
    armorPerLevel: 20, moveSpeed: 7, aggroRadius: 15,
    summonAdds: { mobId: 'raised_bonewalker', count: 3, atHpPct: [0.66, 0.33] },
    loot: [
      { copper: 5000, chance: 1 },
      { itemId: 'boneplate_vest', chance: 0.34, rollGroup: 'velkhar_guaranteed_uncommon' },
      { itemId: 'revenant_silk_robe', chance: 0.33, rollGroup: 'velkhar_guaranteed_uncommon' },
      { itemId: 'nightwalk_jerkin', chance: 0.33, rollGroup: 'velkhar_guaranteed_uncommon' },
      { itemId: 'emberwood_staff', chance: 0.20, rollGroup: 'velkhar_bonus' },
      { itemId: 'boneguard_breastplate', chance: 0.10, rollGroup: 'velkhar_bonus' },
      { itemId: 'shadowmeld_tunic', chance: 0.10, rollGroup: 'velkhar_bonus' },
      { itemId: 'staff_of_velkhar', chance: 0.10, rollGroup: 'velkhar_bonus' },
      { itemId: 'gravewyrm_stalkers_treads', chance: 0.10, rollGroup: 'velkhar_bonus' },
      { itemId: 'deathlord_legguards', chance: 0.05, rollGroup: 'velkhar_bonus' },
      { itemId: 'necromancers_soulsteps', chance: 0.05, rollGroup: 'velkhar_bonus' },
      { itemId: 'wyrmshadow_legguards', chance: 0.05, rollGroup: 'velkhar_bonus' },
    ],
    scale: 1.25, color: 0x512e5f,
  },
  korzul_the_gravewyrm: {
    id: 'korzul_the_gravewyrm', name: 'Korzul the Gravewyrm', minLevel: 20, maxLevel: 20, family: 'dragonkin',
    elite: true, boss: true,
    hpBase: 420, hpPerLevel: 48, dmgBase: 15, dmgPerLevel: 3.0, attackSpeed: 2.6,
    armorPerLevel: 34, moveSpeed: 7, aggroRadius: 18,
    aoePulse: { min: 30, max: 42, radius: 14, every: 8, name: 'Necrotic Shockwave' },
    enrage: { belowHpPct: 0.30, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [
      { copper: 50000, chance: 1 },
      { itemId: 'boneplate_vest', chance: 0.34, rollGroup: 'korzul_guaranteed_uncommon' },
      { itemId: 'revenant_silk_robe', chance: 0.33, rollGroup: 'korzul_guaranteed_uncommon' },
      { itemId: 'nightwalk_jerkin', chance: 0.33, rollGroup: 'korzul_guaranteed_uncommon' },
      { itemId: 'cultist_flayer', chance: 0.10, rollGroup: 'korzul_bonus' },
      { itemId: 'wyrmfang_greatblade', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'staff_of_the_gravewyrm', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'fang_of_korzul', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'deathlord_warplate', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'necromancers_starshroud', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'wyrmshadow_harness', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'boundstone_girdle', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'gravewyrm_gauntlets', chance: 0.05, rollGroup: 'korzul_bonus' },
      { itemId: 'deathlords_dread_visage', chance: 0.04, rollGroup: 'korzul_bonus' },
      { itemId: 'necromancers_soulspire_mantle', chance: 0.04, rollGroup: 'korzul_bonus' },
      { itemId: 'wyrmshadow_talongrips', chance: 0.04, rollGroup: 'korzul_bonus' },
    ],
    scale: 1.8, color: 0x3d5c45,
  },

  // ---- Abandoned Crypt raid encounter (10-player, Nythraxis) ----
  nythraxis_skeleton_warrior: {
    id: 'nythraxis_skeleton_warrior', name: 'Risen Royal Guard', minLevel: 20, maxLevel: 20, family: 'undead',
    elite: true, ccImmune: true,
    hpBase: 150, hpPerLevel: 28, dmgBase: 26, dmgPerLevel: 5.6, attackSpeed: 2.2,
    armorPerLevel: 24, moveSpeed: 10, aggroRadius: 14,
    loot: [],
    scale: 1.25, color: 0xc7c0b2,
  },
  // Brother Aldric is now a dynamically-spawned NPC (see NPCS.brother_aldric_raid
  // in zone3.ts and spawnNythraxisAldric in sim.ts), not a mob.
  nythraxis_scourge_of_thornpeak: {
    id: 'nythraxis_scourge_of_thornpeak', name: 'Nythraxis, Scourge of Thornpeak', minLevel: 20, maxLevel: 20, family: 'undead',
    elite: true, boss: true, ccImmune: true,
    hpBase: 51239 / 2.3, hpPerLevel: 0, dmgBase: 54, dmgPerLevel: 11.4, attackSpeed: 2.6,
    armorPerLevel: 42, moveSpeed: 10.5, aggroRadius: 22,
    loot: [
      { copper: 150000, chance: 1 },
      { itemId: 'deathless_heartwood', chance: 0.03, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'crownforged_dreadhelm', chance: 0.17, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'nighttalon_crown', chance: 0.16, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'soulflame_cowl', chance: 0.16, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'stormcallers_crown', chance: 0.16, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'nighttalon_shoulderguards', chance: 0.16, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'soulflame_mantle', chance: 0.16, rollGroup: 'nythraxis_drop_1' },
      { itemId: 'kingsbane_last_oath', chance: 0.03, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'crownforged_warspaulders', chance: 0.17, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'nighttalon_shoulderguards', chance: 0.16, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'soulflame_mantle', chance: 0.16, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'crownforged_dreadhelm', chance: 0.16, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'nighttalon_crown', chance: 0.16, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'stormcallers_spaulders', chance: 0.16, rollGroup: 'nythraxis_drop_2' },
      { itemId: 'crownforged_dreadhelm', chance: 0.17, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'nighttalon_crown', chance: 0.17, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'soulflame_cowl', chance: 0.17, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'stormcallers_crown', chance: 0.17, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'nighttalon_shoulderguards', chance: 0.16, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'soulflame_mantle', chance: 0.16, rollGroup: 'nythraxis_drop_3' },
      { itemId: 'soulflame_mantle', chance: 0.17, rollGroup: 'nythraxis_drop_4' },
      { itemId: 'crownforged_warspaulders', chance: 0.17, rollGroup: 'nythraxis_drop_4' },
      { itemId: 'nighttalon_shoulderguards', chance: 0.17, rollGroup: 'nythraxis_drop_4' },
      { itemId: 'stormcallers_spaulders', chance: 0.17, rollGroup: 'nythraxis_drop_4' },
      { itemId: 'crownforged_dreadhelm', chance: 0.16, rollGroup: 'nythraxis_drop_4' },
      { itemId: 'nighttalon_crown', chance: 0.16, rollGroup: 'nythraxis_drop_4' },
    ],
    scale: 3.1, color: 0x221b2d,
  },

  // === Claudeholme: the plague-fallen town's deep ossuary (8 wing bosses) ===
  // Trash
  claudeholme_husk: {
    id: 'claudeholme_husk', name: 'Claudeholme Husk', minLevel: 20, maxLevel: 21, family: 'undead',
    hpBase: 120, hpPerLevel: 26, dmgBase: 15, dmgPerLevel: 3.0, attackSpeed: 2.3, armorPerLevel: 22,
    moveSpeed: 6.5, aggroRadius: 11,
    loot: [
      { copper: 160, chance: 1 },
      { itemId: 'claudeholme_relic', chance: 0.4 },
    ],
    scale: 1.0, color: 0x6b6f5c,
  },
  claudeholme_reaver: {
    id: 'claudeholme_reaver', name: 'Claudeholme Reaver', minLevel: 20, maxLevel: 21, family: 'undead',
    hpBase: 130, hpPerLevel: 28, dmgBase: 16, dmgPerLevel: 3.2, attackSpeed: 2.2, armorPerLevel: 26,
    moveSpeed: 7, aggroRadius: 11,
    cleave: { radius: 6, mult: 0.6, name: 'Rusted Cleave' },
    loot: [
      { copper: 170, chance: 1 },
      { itemId: 'claudeholme_relic', chance: 0.4 },
    ],
    scale: 1.05, color: 0xcac3b0,
  },
  claudeholme_wraith: {
    id: 'claudeholme_wraith', name: 'Hollow Wraith', minLevel: 20, maxLevel: 21, family: 'undead',
    hpBase: 115, hpPerLevel: 25, dmgBase: 16, dmgPerLevel: 3.3, attackSpeed: 2.1, armorPerLevel: 18,
    moveSpeed: 7.5, aggroRadius: 12,
    enervate: { chance: 0.3, sta: 16, duration: 12, name: 'Withering Touch', school: 'shadow' },
    loot: [{ copper: 165, chance: 1 }],
    scale: 1.0, color: 0x9fb6c4,
  },
  plague_acolyte: {
    id: 'plague_acolyte', name: 'Plague Acolyte', minLevel: 20, maxLevel: 21, family: 'humanoid',
    hpBase: 110, hpPerLevel: 24, dmgBase: 15, dmgPerLevel: 3.1, attackSpeed: 2.0, armorPerLevel: 18,
    moveSpeed: 7, aggroRadius: 12,
    manaBurn: { chance: 0.25, amount: 110, name: 'Plague Sermon', school: 'shadow' },
    loot: [{ copper: 175, chance: 1 }],
    scale: 1.0, color: 0x6a8a4f,
  },
  bone_construct: {
    id: 'bone_construct', name: 'Bone Construct', minLevel: 20, maxLevel: 21, family: 'undead',
    hpBase: 150, hpPerLevel: 30, dmgBase: 17, dmgPerLevel: 3.4, attackSpeed: 2.6, armorPerLevel: 30,
    moveSpeed: 6, aggroRadius: 10,
    loot: [],
    scale: 1.2, color: 0xd8d0bd,
  },
  // Wing 1 boss
  ch_gatewarden: {
    id: 'ch_gatewarden', name: 'The Gatewarden', minLevel: 21, maxLevel: 21, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 320, hpPerLevel: 40, dmgBase: 20, dmgPerLevel: 3.8, attackSpeed: 2.5, armorPerLevel: 36,
    moveSpeed: 7, aggroRadius: 16,
    cleave: { radius: 8, mult: 0.7, name: 'Gate-Breaker' },
    knockback: { chance: 0.3, distance: 6, name: 'Warding Slam' },
    loot: [
      { copper: 1200, chance: 1 },
      { itemId: 'pw_feet', chance: 0.34, rollGroup: 'ch_gatewarden_set' },
      { itemId: 'hm_feet', chance: 0.33, rollGroup: 'ch_gatewarden_set' },
      { itemId: 'as_feet', chance: 0.33, rollGroup: 'ch_gatewarden_set' },
    ],
    scale: 1.4, color: 0x7a7060,
  },
  // Wing 2 boss
  ch_plaguewright: {
    id: 'ch_plaguewright', name: 'Plaguewright Sevra', minLevel: 21, maxLevel: 21, family: 'humanoid', elite: true, boss: true, ccImmune: true,
    hpBase: 280, hpPerLevel: 36, dmgBase: 19, dmgPerLevel: 3.6, attackSpeed: 2.2, armorPerLevel: 28,
    moveSpeed: 7, aggroRadius: 16,
    aoePulse: { min: 28, max: 40, radius: 11, every: 9, name: 'Plague Vat Burst', school: 'nature', fx: 'nova' },
    mendAlly: { healMin: 50, healMax: 72, radius: 14, every: 8, name: 'Foul Poultice', school: 'shadow' },
    loot: [
      { copper: 1300, chance: 1 },
      { itemId: 'pw_gloves', chance: 0.34, rollGroup: 'ch_plaguewright_set' },
      { itemId: 'hm_gloves', chance: 0.33, rollGroup: 'ch_plaguewright_set' },
      { itemId: 'as_gloves', chance: 0.33, rollGroup: 'ch_plaguewright_set' },
    ],
    scale: 1.2, color: 0x6a8a4f,
  },
  // Wing 3 boss
  ch_tollkeeper: {
    id: 'ch_tollkeeper', name: 'The Tollkeeper', minLevel: 21, maxLevel: 21, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 290, hpPerLevel: 38, dmgBase: 20, dmgPerLevel: 3.7, attackSpeed: 2.1, armorPerLevel: 26,
    moveSpeed: 7.2, aggroRadius: 16,
    enervate: { chance: 0.4, sta: 20, duration: 12, name: 'Soul Toll', school: 'shadow' },
    summonAdds: { mobId: 'claudeholme_wraith', count: 2, atHpPct: [0.66, 0.33] },
    loot: [
      { copper: 1300, chance: 1 },
      { itemId: 'pw_waist', chance: 0.34, rollGroup: 'ch_tollkeeper_set' },
      { itemId: 'hm_waist', chance: 0.33, rollGroup: 'ch_tollkeeper_set' },
      { itemId: 'as_waist', chance: 0.33, rollGroup: 'ch_tollkeeper_set' },
    ],
    scale: 1.3, color: 0xa9c0cf,
  },
  // Wing 4 boss
  ch_maggotlord: {
    id: 'ch_maggotlord', name: 'Maggot-Lord Brulk', minLevel: 21, maxLevel: 22, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 380, hpPerLevel: 46, dmgBase: 21, dmgPerLevel: 3.9, attackSpeed: 2.8, armorPerLevel: 34,
    moveSpeed: 6.2, aggroRadius: 16,
    aoePulse: { min: 30, max: 44, radius: 11, every: 10, name: 'Bilge Eruption', school: 'nature', fx: 'nova' },
    enrage: { belowHpPct: 0.3, dmgMult: 1.45, hasteMult: 1.3 },
    knockback: { chance: 0.3, distance: 7, name: 'Heaving Maw' },
    loot: [
      { copper: 1500, chance: 1 },
      { itemId: 'pw_helmet', chance: 0.34, rollGroup: 'ch_maggotlord_set' },
      { itemId: 'hm_helmet', chance: 0.33, rollGroup: 'ch_maggotlord_set' },
      { itemId: 'as_helmet', chance: 0.33, rollGroup: 'ch_maggotlord_set' },
    ],
    scale: 1.6, color: 0x7d8a4f,
  },
  // Wing 5 boss
  ch_cantor: {
    id: 'ch_cantor', name: 'Cantor Mowl', minLevel: 21, maxLevel: 22, family: 'humanoid', elite: true, boss: true, ccImmune: true,
    hpBase: 290, hpPerLevel: 38, dmgBase: 20, dmgPerLevel: 3.7, attackSpeed: 2.2, armorPerLevel: 26,
    moveSpeed: 7, aggroRadius: 16,
    mendAlly: { healMin: 56, healMax: 80, radius: 16, every: 7, name: 'Unhallowed Rite', school: 'shadow' },
    petSpell: { name: 'Dirge of Ash', school: 'shadow', min: 40, max: 58, range: 28, every: 2.8 },
    manaBurn: { chance: 0.35, amount: 140, name: 'Silencing Verse', school: 'shadow' },
    loot: [
      { copper: 1500, chance: 1 },
      { itemId: 'pw_legs', chance: 0.34, rollGroup: 'ch_cantor_set' },
      { itemId: 'hm_legs', chance: 0.33, rollGroup: 'ch_cantor_set' },
      { itemId: 'as_legs', chance: 0.33, rollGroup: 'ch_cantor_set' },
    ],
    scale: 1.25, color: 0xc9b6e0,
  },
  // Wing 6 boss
  ch_ashmarshal: {
    id: 'ch_ashmarshal', name: 'The Ash-Marshal', minLevel: 22, maxLevel: 22, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 360, hpPerLevel: 44, dmgBase: 23, dmgPerLevel: 4.1, attackSpeed: 2.3, armorPerLevel: 40,
    moveSpeed: 7.2, aggroRadius: 16,
    cleave: { radius: 8, mult: 0.75, name: 'Ash-Sweep' },
    mortalStrike: { chance: 0.4, healReduction: 0.5, duration: 10, name: 'Sundering Edict', school: 'physical' },
    rally: { radius: 16, every: 12, ap: 48, duration: 10, name: 'Dead Muster' },
    loot: [
      { copper: 1700, chance: 1 },
      { itemId: 'pw_shoulder', chance: 0.34, rollGroup: 'ch_ashmarshal_set' },
      { itemId: 'hm_shoulder', chance: 0.33, rollGroup: 'ch_ashmarshal_set' },
      { itemId: 'as_shoulder', chance: 0.33, rollGroup: 'ch_ashmarshal_set' },
    ],
    scale: 1.4, color: 0x8b94a0,
  },
  // Wing 7 boss
  ch_bonesmith: {
    id: 'ch_bonesmith', name: 'The Bonesmith', minLevel: 22, maxLevel: 22, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 370, hpPerLevel: 45, dmgBase: 23, dmgPerLevel: 4.2, attackSpeed: 2.5, armorPerLevel: 42,
    moveSpeed: 6.5, aggroRadius: 16,
    summonAdds: { mobId: 'bone_construct', count: 2, atHpPct: [0.66, 0.33] },
    stoneskin: { amount: 280, every: 14, duration: 8, name: 'Ash-Iron Plating', school: 'shadow' },
    loot: [
      { copper: 1700, chance: 1 },
      { itemId: 'pw_chest', chance: 0.34, rollGroup: 'ch_bonesmith_set' },
      { itemId: 'hm_chest', chance: 0.33, rollGroup: 'ch_bonesmith_set' },
      { itemId: 'as_chest', chance: 0.33, rollGroup: 'ch_bonesmith_set' },
      { itemId: 'ash_iron', chance: 1, questId: 'q_ch_attune_4' },
    ],
    scale: 1.45, color: 0xd0c8b4,
  },
  // Wing 8 boss (final deathlord)
  ch_veholt: {
    id: 'ch_veholt', name: 'Lord Veholt the Hollow', minLevel: 22, maxLevel: 22, family: 'undead', elite: true, boss: true, ccImmune: true,
    hpBase: 520, hpPerLevel: 64, dmgBase: 24, dmgPerLevel: 4.4, attackSpeed: 2.4, armorPerLevel: 46,
    moveSpeed: 6.8, aggroRadius: 18,
    aoePulse: { min: 34, max: 50, radius: 12, every: 9, name: 'Hollow Reckoning', school: 'shadow', fx: 'nova' },
    summonAdds: { mobId: 'claudeholme_husk', count: 3, atHpPct: [0.7, 0.45, 0.2] },
    stomp: { radius: 11, every: 13, duration: 1.5, min: 26, max: 38, name: 'Deathknell Stomp' },
    enrage: { belowHpPct: 0.25, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [
      { copper: 3000, chance: 1 },
      { itemId: 'pw_mh', chance: 0.34, rollGroup: 'ch_veholt_set' },
      { itemId: 'hm_mh', chance: 0.33, rollGroup: 'ch_veholt_set' },
      { itemId: 'as_mh', chance: 0.33, rollGroup: 'ch_veholt_set' },
      { itemId: 'veholt_war', chance: 0.2, rollGroup: 'ch_veholt_chase' },
      { itemId: 'veholt_mag', chance: 0.2, rollGroup: 'ch_veholt_chase' },
      { itemId: 'veholt_rog', chance: 0.2, rollGroup: 'ch_veholt_chase' },
      { itemId: 'veholt_sigil', chance: 1, questId: 'q_ch_attune_1' },
      { itemId: 'breach_core', chance: 1, questId: 'q_ch_attune_3' },
      { itemId: 'hollow_crown', chance: 1, questId: 'q_ch_attune_5' },
    ],
    scale: 1.7, color: 0x5a5060,
  },
};

// Trash packs of 2 elites (spaced beyond social-aggro range so groups can
// pull them one pack at a time), a miniboss pair, then Morthen with guards.
const CRYPT_SPAWN_LIST: DungeonSpawn[] = [
  { mobId: 'crypt_shambler', x: -3, z: 18 },
  { mobId: 'crypt_shambler', x: 3, z: 19 },
  { mobId: 'crypt_shambler', x: -9, z: 38 },
  { mobId: 'hollow_acolyte', x: -5, z: 39 },
  { mobId: 'crypt_shambler', x: 9, z: 54 },
  { mobId: 'hollow_acolyte', x: 5, z: 55 },
  { mobId: 'bonechill_widow', x: -5, z: 68 },
  { mobId: 'bonechill_widow', x: -1, z: 70 },
  { mobId: 'sexton_marrow', x: -4, z: 82 },
  { mobId: 'hollow_acolyte', x: 1, z: 83 },
  { mobId: 'morthen', x: 0, z: 98 },
  { mobId: 'crypt_shambler', x: -4, z: 96 },
  { mobId: 'crypt_shambler', x: 4, z: 96 },
];

// Sunken Bastion: same 13-spawn pacing as the crypt — packs of 2 elites,
// the Knight-Commander as miniboss, then Vael on the dais with two guards.
const BASTION_SPAWN_LIST: DungeonSpawn[] = [
  { mobId: 'bastion_revenant', x: -3, z: 18 },
  { mobId: 'bastion_revenant', x: 3, z: 19 },
  { mobId: 'bastion_revenant', x: -9, z: 38 },
  { mobId: 'tidebound_acolyte', x: -5, z: 39 },
  { mobId: 'tidebound_acolyte', x: 9, z: 54 },
  { mobId: 'bastion_revenant', x: 5, z: 55 },
  { mobId: 'bastion_revenant', x: -5, z: 68 },
  { mobId: 'tidebound_acolyte', x: -1, z: 70 },
  { mobId: 'knight_commander_olen', x: -4, z: 82 },
  { mobId: 'bastion_revenant', x: 1, z: 83 },
  { mobId: 'vael_the_mistcaller', x: 0, z: 98 },
  { mobId: 'tidebound_acolyte', x: -4, z: 96 },
  { mobId: 'bastion_revenant', x: 4, z: 96 },
];

// Gravewyrm Sanctum: three chambers — the Boneworks (z<60), the Ritual Vault
// (75-115) and the Wyrm's Hollow (115+) — with Korgath holding the first
// waist, Velkhar the second, and Korzul on the great dais at the end.
const SANCTUM_SPAWN_LIST: DungeonSpawn[] = [
  { mobId: 'sanctum_boneguard', x: -3, z: 16 },
  { mobId: 'sanctum_boneguard', x: 3, z: 17 },
  { mobId: 'sanctum_boneguard', x: -8, z: 30 },
  { mobId: 'sanctum_drakonid', x: -4, z: 31 },
  { mobId: 'sanctum_drakonid', x: 7, z: 44 },
  { mobId: 'sanctum_boneguard', x: 3, z: 45 },
  { mobId: 'sanctum_boneguard', x: -6, z: 58 },
  { mobId: 'sanctum_drakonid', x: -2, z: 59 },
  { mobId: 'korgath_the_bound', x: 0, z: 72 },
  { mobId: 'sanctum_drakonid', x: -7, z: 86 },
  { mobId: 'sanctum_boneguard', x: -3, z: 87 },
  { mobId: 'sanctum_boneguard', x: 6, z: 100 },
  { mobId: 'sanctum_drakonid', x: 2, z: 101 },
  { mobId: 'grand_necromancer_velkhar', x: 0, z: 114 },
  { mobId: 'sanctum_boneguard', x: -4, z: 112 },
  { mobId: 'sanctum_boneguard', x: 4, z: 112 },
  { mobId: 'sanctum_drakonid', x: -5, z: 130 },
  { mobId: 'sanctum_drakonid', x: -1, z: 132 },
  { mobId: 'korzul_the_gravewyrm', x: 0, z: 146 },
  { mobId: 'sanctum_drakonid', x: -5, z: 144 },
  { mobId: 'sanctum_drakonid', x: 5, z: 144 },
];

const NYTHRAXIS_RAID_SPAWN_LIST: DungeonSpawn[] = [
  { mobId: 'nythraxis_scourge_of_thornpeak', x: 0, z: 96 },
];

// Claudeholme: a long descent of 8 wings, each a trash pack then a wing boss, the
// deathlord Veholt on the great dais at z 214. (Boss z: 18/46/74/102/130/158/186/214.)
const CLAUDEHOLME_SPAWN_LIST: DungeonSpawn[] = [
  // Wing 1 - the broken gate
  { mobId: 'claudeholme_husk', x: -3, z: 6 },
  { mobId: 'claudeholme_husk', x: 3, z: 8 },
  { mobId: 'claudeholme_reaver', x: -8, z: 14 },
  { mobId: 'ch_gatewarden', x: 0, z: 18 },
  { mobId: 'claudeholme_husk', x: -5, z: 24 },
  { mobId: 'claudeholme_husk', x: 5, z: 25 },
  // Wing 2 - the plague-vats
  { mobId: 'plague_acolyte', x: -6, z: 40 },
  { mobId: 'claudeholme_husk', x: 6, z: 41 },
  { mobId: 'ch_plaguewright', x: 0, z: 46 },
  { mobId: 'plague_acolyte', x: 0, z: 54 },
  // Wing 3 - the toll of souls
  { mobId: 'claudeholme_wraith', x: -7, z: 66 },
  { mobId: 'claudeholme_wraith', x: 7, z: 68 },
  { mobId: 'ch_tollkeeper', x: 0, z: 74 },
  { mobId: 'claudeholme_wraith', x: -4, z: 82 },
  // Wing 4 - the carrion pit
  { mobId: 'claudeholme_husk', x: -8, z: 94 },
  { mobId: 'claudeholme_reaver', x: 8, z: 95 },
  { mobId: 'ch_maggotlord', x: 0, z: 102 },
  { mobId: 'claudeholme_husk', x: 0, z: 110 },
  // Wing 5 - the unhallowed chapel
  { mobId: 'plague_acolyte', x: -6, z: 122 },
  { mobId: 'claudeholme_wraith', x: 6, z: 124 },
  { mobId: 'ch_cantor', x: 0, z: 130 },
  { mobId: 'plague_acolyte', x: 4, z: 138 },
  // Wing 6 - the muster yard
  { mobId: 'claudeholme_reaver', x: -8, z: 150 },
  { mobId: 'claudeholme_reaver', x: 8, z: 151 },
  { mobId: 'ch_ashmarshal', x: 0, z: 158 },
  { mobId: 'claudeholme_husk', x: 0, z: 166 },
  // Wing 7 - the bonesmithy
  { mobId: 'bone_construct', x: -7, z: 178 },
  { mobId: 'bone_construct', x: 7, z: 178 },
  { mobId: 'ch_bonesmith', x: 0, z: 186 },
  { mobId: 'claudeholme_husk', x: -4, z: 194 },
  // Wing 8 - the deathlord's hold
  { mobId: 'claudeholme_wraith', x: -6, z: 206 },
  { mobId: 'claudeholme_reaver', x: 6, z: 206 },
  { mobId: 'ch_veholt', x: 0, z: 214 },
  { mobId: 'claudeholme_husk', x: -5, z: 220 },
  { mobId: 'claudeholme_husk', x: 5, z: 220 },
];

export const DUNGEON_DEFS: Record<string, DungeonDef> = {
  hollow_crypt: {
    id: 'hollow_crypt',
    name: 'The Hollow Crypt',
    index: 0,
    doorPos: { x: 80, z: 90 }, // entrance portal at the chapel ruin
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: CRYPT_SPAWN_LIST,
    interior: 'crypt',
    suggestedPlayers: 5,
    enterText: 'You descend into the Hollow Crypt...',
    leaveText: 'You climb back into daylight.',
  },
  sunken_bastion: {
    id: 'sunken_bastion',
    name: 'The Sunken Bastion',
    index: 1,
    doorPos: { x: 45, z: 515 }, // drowned keep south of the Gravecaller camp
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: BASTION_SPAWN_LIST,
    interior: 'crypt',
    suggestedPlayers: 5,
    enterText: 'You wade down into the Sunken Bastion...',
    leaveText: 'You climb out of the drowning dark.',
  },
  gravewyrm_sanctum: {
    id: 'gravewyrm_sanctum',
    name: 'Gravewyrm Sanctum',
    index: 2,
    doorPos: { x: 0, z: 880 }, // sealed gate at the head of the Sanctum Approach
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: SANCTUM_SPAWN_LIST,
    interior: 'sanctum',
    suggestedPlayers: 5,
    enterText: 'The air goes cold. Something vast breathes below...',
    leaveText: 'You stagger back into the mountain wind.',
  },
  nythraxis_crypt: {
    id: 'nythraxis_crypt',
    name: 'Abandoned Crypt',
    index: 4,
    doorPos: { x: -152, z: 610 },
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: [],
    objects: [
      // The three attunement relics: interacting raises the guardian undead
      // (fallen_captain_aldren/corrupted_priest_malric/deathstalker_voss) that
      // drop the keystone halves + diary — see activateNythraxisRelic in sim.ts.
      // Spread down the nave so they read as the crypt's quest interactables.
      // (The Royal Graves live in the overworld for q_nythraxis_graves; they do
      // not belong inside the crypt, where that quest is already complete.)
      { itemId: 'captains_crest', name: 'Crypt Keystone Upper', x: -7, z: 28 },
      { itemId: 'priests_sigil', name: 'Crypt Keystone Lower', x: 0, z: 52 },
      { itemId: 'royal_seal', name: 'Ancient Diary', x: 7, z: 76 },
      // Sealed royal door to the raid: flush-centre on the crypt back wall.
      // Back wall collider spans z 111-113 (centre 112, hd 1); sit the door just
      // in front of its inner face so it reads as set into the wall but stays
      // interactable (isBlocked r=0.5 needs centre z <= 110.5).
      { itemId: '', name: 'Sealed Royal Door', x: 0, z: 110.4, templateId: 'dungeon_door', dungeonId: 'nythraxis_boss_arena' },
    ],
    interior: 'crypt',
    suggestedPlayers: 1,
    enterText: 'You cross the threshold of the Abandoned Crypt.',
    leaveText: 'You return to the cold air of Thornpeak.',
  },
  nythraxis_boss_arena: {
    id: 'nythraxis_boss_arena',
    name: 'Nythraxis Raid Arena',
    index: 5,
    doorPos: { x: -152, z: 610 },
    overworldDoor: false,
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: NYTHRAXIS_RAID_SPAWN_LIST,
    objects: [
      // Three soul wardstones in a wide forward triangle in front of the boss
      // (spawn 0,96), well clear of his body so all three read distinctly and
      // raiders must split to channel them. Kept within the encounter's
      // wardstone search radius (see nythraxisWardstones in sim.ts).
      { itemId: 'bastion_ward_stone', name: 'Left Wardstone', x: -40, z: 79 },
      { itemId: 'bastion_ward_stone', name: 'Right Wardstone', x: 40, z: 79 },
      { itemId: 'bastion_ward_stone', name: 'Threshold Wardstone', x: 0, z: 63 },
    ],
    interior: 'nythraxis',
    suggestedPlayers: 10,
    enterText: 'You pass through the sealed royal door.',
    leaveText: 'You return to the cold air of Thornpeak.',
  },
  claudeholme: {
    id: 'claudeholme',
    name: 'Claudeholme',
    index: 6, // instance origin x = 900 + 6*600 = 4500 (clear, below the relocated arena at 5400)
    doorPos: { x: 99, z: 1191 }, // the ruined-town portal in the Ashen Wastes
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: CLAUDEHOLME_SPAWN_LIST,
    interior: 'claudeholme',
    suggestedPlayers: 5,
    enterText: 'You step through the breach into Claudeholme, and the dead town stirs.',
    leaveText: 'You climb back out of Claudeholme into the ashen light.',
  },
};

const PLATE = ['warrior', 'paladin', 'shaman'] as const;
const CLOTH = ['mage', 'priest', 'warlock', 'druid'] as const;
const LEATHER = ['rogue', 'hunter'] as const;

// Tier 0.55 sets (epic, a notch above the Dawn of Claude tier 0.5): one slot drops
// per Claudeholme wing boss; the deathlord Veholt drops the weapons + chase epics.
// Plate = Plaguewarden's, Cloth = Hollowmancer's, Leather = Ashstalker's.
export const CLAUDEHOLME_ITEMS: Record<string, ItemDef> = {
  // Plate (warrior/paladin/shaman)
  pw_feet: { id: 'pw_feet', name: "Plaguewarden's Sabatons", kind: 'armor', slot: 'feet', quality: 'epic', stats: { armor: 165, sta: 9, str: 6 }, sellValue: 2400, requiredClass: [...PLATE] },
  pw_gloves: { id: 'pw_gloves', name: "Plaguewarden's Gauntlets", kind: 'armor', slot: 'gloves', quality: 'epic', stats: { armor: 155, sta: 8, str: 7 }, sellValue: 2400, requiredClass: [...PLATE] },
  pw_waist: { id: 'pw_waist', name: "Plaguewarden's Girdle", kind: 'armor', slot: 'waist', quality: 'epic', stats: { armor: 160, sta: 9, str: 6 }, sellValue: 2400, requiredClass: [...PLATE] },
  pw_helmet: { id: 'pw_helmet', name: "Plaguewarden's Greathelm", kind: 'armor', slot: 'helmet', quality: 'epic', stats: { armor: 210, sta: 12, str: 8 }, sellValue: 3200, requiredClass: [...PLATE] },
  pw_legs: { id: 'pw_legs', name: "Plaguewarden's Legplates", kind: 'armor', slot: 'legs', quality: 'epic', stats: { armor: 230, sta: 13, str: 9 }, sellValue: 3200, requiredClass: [...PLATE] },
  pw_shoulder: { id: 'pw_shoulder', name: "Plaguewarden's Pauldrons", kind: 'armor', slot: 'shoulder', quality: 'epic', stats: { armor: 195, sta: 11, str: 8 }, sellValue: 3200, requiredClass: [...PLATE] },
  pw_chest: { id: 'pw_chest', name: "Plaguewarden's Breastplate", kind: 'armor', slot: 'chest', quality: 'epic', stats: { armor: 260, sta: 16, str: 11 }, sellValue: 4000, requiredClass: [...PLATE] },
  pw_mh: { id: 'pw_mh', name: "Plaguewarden's Cleaver", kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 38, max: 58, speed: 2.6 }, stats: { str: 12, sta: 6 }, sellValue: 6000, requiredClass: [...PLATE] },
  // Cloth (mage/priest/warlock/druid)
  hm_feet: { id: 'hm_feet', name: "Hollowmancer's Slippers", kind: 'armor', slot: 'feet', quality: 'epic', stats: { armor: 46, int: 9, spi: 6 }, sellValue: 2400, requiredClass: [...CLOTH] },
  hm_gloves: { id: 'hm_gloves', name: "Hollowmancer's Handwraps", kind: 'armor', slot: 'gloves', quality: 'epic', stats: { armor: 42, int: 9, spi: 5 }, sellValue: 2400, requiredClass: [...CLOTH] },
  hm_waist: { id: 'hm_waist', name: "Hollowmancer's Cord", kind: 'armor', slot: 'waist', quality: 'epic', stats: { armor: 44, int: 9, spi: 5 }, sellValue: 2400, requiredClass: [...CLOTH] },
  hm_helmet: { id: 'hm_helmet', name: "Hollowmancer's Cowl", kind: 'armor', slot: 'helmet', quality: 'epic', stats: { armor: 58, int: 12, spi: 7 }, sellValue: 3200, requiredClass: [...CLOTH] },
  hm_legs: { id: 'hm_legs', name: "Hollowmancer's Leggings", kind: 'armor', slot: 'legs', quality: 'epic', stats: { armor: 64, int: 13, spi: 8 }, sellValue: 3200, requiredClass: [...CLOTH] },
  hm_shoulder: { id: 'hm_shoulder', name: "Hollowmancer's Mantle", kind: 'armor', slot: 'shoulder', quality: 'epic', stats: { armor: 54, int: 11, spi: 7 }, sellValue: 3200, requiredClass: [...CLOTH] },
  hm_chest: { id: 'hm_chest', name: "Hollowmancer's Robe", kind: 'armor', slot: 'chest', quality: 'epic', stats: { armor: 74, int: 16, spi: 9 }, sellValue: 4000, requiredClass: [...CLOTH] },
  hm_mh: { id: 'hm_mh', name: "Hollowmancer's Scepter", kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 31, max: 47, speed: 2.6 }, stats: { int: 12, spi: 6 }, sellValue: 6000, requiredClass: [...CLOTH] },
  // Leather (rogue/hunter)
  as_feet: { id: 'as_feet', name: "Ashstalker's Treads", kind: 'armor', slot: 'feet', quality: 'epic', stats: { armor: 100, agi: 9, sta: 5 }, sellValue: 2400, requiredClass: [...LEATHER] },
  as_gloves: { id: 'as_gloves', name: "Ashstalker's Grips", kind: 'armor', slot: 'gloves', quality: 'epic', stats: { armor: 94, agi: 9, sta: 4 }, sellValue: 2400, requiredClass: [...LEATHER] },
  as_waist: { id: 'as_waist', name: "Ashstalker's Belt", kind: 'armor', slot: 'waist', quality: 'epic', stats: { armor: 97, agi: 9, sta: 5 }, sellValue: 2400, requiredClass: [...LEATHER] },
  as_helmet: { id: 'as_helmet', name: "Ashstalker's Mask", kind: 'armor', slot: 'helmet', quality: 'epic', stats: { armor: 128, agi: 12, sta: 6 }, sellValue: 3200, requiredClass: [...LEATHER] },
  as_legs: { id: 'as_legs', name: "Ashstalker's Legguards", kind: 'armor', slot: 'legs', quality: 'epic', stats: { armor: 138, agi: 13, sta: 7 }, sellValue: 3200, requiredClass: [...LEATHER] },
  as_shoulder: { id: 'as_shoulder', name: "Ashstalker's Spaulders", kind: 'armor', slot: 'shoulder', quality: 'epic', stats: { armor: 116, agi: 11, sta: 6 }, sellValue: 3200, requiredClass: [...LEATHER] },
  as_chest: { id: 'as_chest', name: "Ashstalker's Tunic", kind: 'armor', slot: 'chest', quality: 'epic', stats: { armor: 150, agi: 16, sta: 8 }, sellValue: 4000, requiredClass: [...LEATHER] },
  as_mh: { id: 'as_mh', name: "Ashstalker's Dagger", kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 34, max: 52, speed: 1.8 }, stats: { agi: 12, sta: 6 }, sellValue: 6000, requiredClass: [...LEATHER] },
  // Veholt's chase epics (off-set signature weapons)
  veholt_war: { id: 'veholt_war', name: 'Hollowblade of Veholt', kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 45, max: 67, speed: 2.7 }, stats: { str: 14, sta: 7 }, sellValue: 8000, requiredClass: [...PLATE] },
  veholt_mag: { id: 'veholt_mag', name: "Veholt's Deathwhisper", kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 35, max: 53, speed: 2.5 }, stats: { int: 14, spi: 7 }, sellValue: 8000, requiredClass: [...CLOTH] },
  veholt_rog: { id: 'veholt_rog', name: "Veholt's Hollowfang", kind: 'weapon', slot: 'mainhand', quality: 'epic', weapon: { min: 39, max: 59, speed: 1.8 }, stats: { agi: 14, sta: 7 }, sellValue: 8000, requiredClass: [...LEATHER] },
  // Quest + Claudexxaramas raid-attunement chain items
  claudeholme_relic: { id: 'claudeholme_relic', name: 'Reclaimed Relic', kind: 'quest', sellValue: 0, questId: 'q_ch_relics' },
  veholt_sigil: { id: 'veholt_sigil', name: 'Hollow Sigil', kind: 'quest', sellValue: 0, questId: 'q_ch_attune_1' },
  breach_core: { id: 'breach_core', name: 'Breach Core', kind: 'quest', sellValue: 0, questId: 'q_ch_attune_3' },
  ash_iron: { id: 'ash_iron', name: 'Ash-Iron Ingot', kind: 'quest', sellValue: 0, questId: 'q_ch_attune_4' },
  hollow_crown: { id: 'hollow_crown', name: "Veholt's Hollow Crown", kind: 'quest', sellValue: 0, questId: 'q_ch_attune_5' },
  breachkey_dawn: { id: 'breachkey_dawn', name: 'Breachkey of the Dawn', kind: 'quest', sellValue: 0, questId: 'q_ch_attune_5' },
};
