import { DELVES, DUNGEONS, MOBS, NPCS, QUESTS, ZONES } from '../sim/data';

// English world-entity names + narratives (mobs, NPCs, quests, zones, dungeons).
//
// This module is the SINGLE English source for those entities: makeEnglishWorldEntities()
// reads the canonical sim data and shapes it into the `en` slice that src/ui/i18n.catalog
// spreads into the authoritative nested `en` (imported there as `worldNames.en`). The
// build then overlays each per-locale flat overlay (src/ui/i18n.locales/<lang>.ts) onto
// that `en` to produce the dense resolved table.
//
// Non-English entity names are NOT here. The flatten migration inlined every entity key into the
// flat overlays, which left this module's non-English datasets dead (zero runtime
// consumers - tEntity resolves through the resolved table, not this object). A later cleanup
// removed those dead datasets along with the `{} as WorldEntityTranslations` casts that
// faked es_ES->es / fr_CA->fr_FR dialect inheritance here; dialect inheritance is now a
// declared-base merge in the build resolver (scripts/i18n_build.mjs). Only `.en` is
// consumed, so this object carries only `en`.

const MOB_IDS = [
  'forest_wolf',
  'old_greyjaw',
  'wild_boar',
  'webwood_spider',
  'mudfin_murloc',
  'tunnel_rat',
  'vale_bandit',
  'restless_bones',
  'gorrak',
  'mire_prowler',
  'deepfen_murloc',
  'mire_widow',
  'mirefen_broodmother',
  'drowned_dead',
  'fen_troll',
  'grubjaw',
  'gravecaller_cultist',
  'gravecaller_summoner',
  'gravecaller_mender',
  'deacon_voss',
  'ridge_stalker',
  'deeprock_kobold',
  'thornpeak_ogre',
  'ogre_crusher',
  'warlord_drogmar',
  'stormcrag_elemental',
  'shardlord_kazzix',
  'wyrmcult_zealot',
  'wyrmcult_necromancer',
  'boneclad_revenant',
  'crypt_shambler',
  'hollow_acolyte',
  'bonechill_widow',
  'sexton_marrow',
  'morthen',
  'bastion_revenant',
  'tidebound_acolyte',
  'drowned_thrall',
  'knight_commander_olen',
  'vael_the_mistcaller',
  'sanctum_boneguard',
  'sanctum_drakonid',
  'raised_bonewalker',
  'korgath_the_bound',
  'grand_necromancer_velkhar',
  'korzul_the_gravewyrm',
  'bog_bloat',
  'fallen_captain_aldren',
  'corrupted_priest_malric',
  'deathstalker_voss',
  'vision_aldren_warrior',
  'vision_malric_mage',
  'vision_deathstalker_voss',
  'bound_guardian',
  'nythraxis_skeleton_warrior',
  'nythraxis_scourge_of_thornpeak',
  // Collapsed Reliquary delve mobs
  'reliquary_ledger_wraith',
  'reliquary_funeral_ringer',
  'reliquary_gravecall_acolyte',
  'reliquary_bonewalker',
  'reliquary_saintless_effigy',
  'deacon_varric',
  'acolyte_tessa',
  // Zone 4 - The Ashen Wastes (Dawn of Claude)
  'blighted_husk',
  'ashen_ghoul',
  'plague_crawler',
  'corrupted_acolyte',
  'bone_reaver',
  'wraithling',
  'rotting_behemoth',
  'plaguebringer_zealot',
  'naxx_deathguard',
  'morthax_the_hollow',
  'gravelord_oss',
  'blighted_stag',
  'rotting_fox',
  // Claudeholme dungeon (trash + 8 wing bosses)
  'claudeholme_husk',
  'claudeholme_reaver',
  'claudeholme_wraith',
  'plague_acolyte',
  'bone_construct',
  'ch_gatewarden',
  'ch_plaguewright',
  'ch_tollkeeper',
  'ch_maggotlord',
  'ch_cantor',
  'ch_ashmarshal',
  'ch_bonesmith',
  'ch_veholt',
  // Claudexxaramas raid (15 bosses + adds + trash)
  'cx_husk', 'cx_revenant', 'cx_flesh_thrall', 'cx_plague_swarm', 'cx_spiderling',
  'cx_gutpile', 'cx_fleshwright', 'cx_grosh', 'cx_vexil', 'cx_apothecary', 'cx_maggath',
  'cx_vanguard', 'cx_korreth', 'cx_triad', 'cx_vrallka', 'cx_silkbound', 'cx_sethelle',
  'cx_rimecore', 'cx_wardens', 'cx_vorothne',
] as const;

const NPC_IDS = [
  'the_merchant',
  'marshal_redbrook',
  'trader_wilkes',
  'apothecary_lin',
  'brother_aldric',
  'smith_haldren',
  'fisherman_brandt',
  'foreman_odell',
  'warden_fenwick',
  'brother_aldric_fen',
  'provisioner_hale',
  'herbalist_yara',
  'scout_maren',
  'captain_thessaly',
  'brother_aldric_highwatch',
  'scout_maren_highwatch',
  'quartermaster_bree',
  'armorer_hode',
  'loremaster_caddis',
  'auctioneer_voss', // second World Market auctioneer (Highwatch, zone 3)
  'brother_aldric_raid', // dynamically-spawned raid turn-in NPC (Crypt of Nythraxis)
  'brother_halven', // Collapsed Reliquary delve board NPC
  // Zone 4 - The Ashen Wastes (Dawn of Claude garrison at Gravewatch)
  'dawn_commander_sera',
  'dawn_chaplain_orin',
  'dawn_quartermaster_henning',
  'dawn_scout_irelle',
  'dawn_archivist_vael',
  'dawn_vanguard_kael',
  'dawn_reclaimer_sela',
  'dawn_warbringer_torv',
  'dawn_loreseeker_miren',
  'dawn_huntsman_varik',
] as const;

const QUEST_IDS = [
  'q_wolves',
  'q_greyjaw',
  'q_boars',
  'q_spiders',
  'q_murlocs',
  'q_mine',
  'q_bones',
  'q_supplies',
  'q_whispers',
  'q_names_of_the_dead',
  'q_silence_the_call',
  'q_rite',
  'q_hollow',
  'q_sexton',
  'q_gravecallers_trail',
  'q_bandits',
  'q_ringleader',
  'q_fenbridge_muster',
  'q_prowlers',
  'q_prowler_pelts',
  'q_fen_supplies',
  'q_deepfen',
  'q_idols',
  'q_aldrics_fallen_star',
  'q_deepfen_purge',
  'q_widows',
  'q_broodmother',
  'q_drowned',
  'q_drowned_censers',
  'q_no_rest',
  'q_trolls',
  'q_troll_fetishes',
  'q_grubjaw',
  'q_cult_camp',
  'q_summoners',
  'q_deacon',
  'q_bastion_door',
  'q_olen',
  'q_mistcaller',
  'q_highwatch_summons',
  'q_stalkers',
  'q_stalker_pelts',
  'q_kobold_tunnels',
  'q_glowing_wax',
  'q_ogre_edges',
  'q_ogre_totems',
  'q_ogre_bounty',
  'q_crushers',
  'q_drogmar',
  'q_elementals',
  'q_shard_cores',
  'q_kazzix',
  'q_zealots',
  'q_cult_orders',
  'q_necromancers',
  'q_revenants',
  'q_revenant_vanguard',
  'q_wyrm_sigils',
  'q_breaking_the_seal',
  'q_voice_below',
  'q_sanctum_gate',
  'q_korgath',
  'q_velkhar',
  'q_gravewyrm',
  'q_the_codfather',
  'q_nythraxis_restless_dead',
  'q_nythraxis_graves',
  'q_nythraxis_sealed_crypt',
  'q_nythraxis_bound_guardian',
  'q_nythraxis_scourges_end',
  'q_mogger',
  // Zone 4 - The Ashen Wastes (Dawn of Claude)
  'q_aw_arrival',
  'q_aw_husks',
  'q_aw_ghouls',
  'q_aw_crawlers',
  'q_aw_samples',
  'q_aw_acolytes',
  'q_aw_orders',
  'q_aw_reavers',
  'q_aw_wraiths',
  'q_aw_relics',
  'q_aw_hold',
  'q_aw_behemoth',
  'q_aw_zealots',
  'q_aw_deathguard',
  'q_aw_morthax',
  'q_aw_pale_reach',
  'q_aw_ritual',
  'q_aw_attune_1',
  'q_aw_gravelord',
  'q_aw_attunement',
  'q_aw_rotting_herd',
  'q_aw_ash_scavengers',
  'q_aw_corrupt_sample',
  // Claudeholme dungeon quests + the Breachkey (raid attunement) chain
  'q_ch_breach',
  'q_ch_vats',
  'q_ch_toll',
  'q_ch_pit',
  'q_ch_chapel',
  'q_ch_muster',
  'q_ch_forge',
  'q_ch_deathlord',
  'q_ch_streets',
  'q_ch_relics',
  'q_ch_attune_1',
  'q_ch_attune_2',
  'q_ch_attune_3',
  'q_ch_attune_4',
  'q_ch_attune_5',
  // Claudexxaramas raid
  'q_cx_breach', 'q_cx_plague', 'q_cx_barracks', 'q_cx_spinning', 'q_cx_throne',
  'q_cx_legend_1', 'q_cx_legend_2', 'q_cx_legend_3',
] as const;

const ZONE_IDS = ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights', 'ashen_wastes'] as const;
const DUNGEON_IDS = [
  'hollow_crypt',
  'sunken_bastion',
  'gravewyrm_sanctum',
  'nythraxis_crypt',
  'nythraxis_boss_arena',
  'claudeholme',
  'claudexxaramas',
] as const;
const DELVE_IDS = ['collapsed_reliquary'] as const;

type MobId = (typeof MOB_IDS)[number];
type NpcId = (typeof NPC_IDS)[number];
type QuestId = (typeof QUEST_IDS)[number];
type ZoneId = (typeof ZONE_IDS)[number];
type DungeonId = (typeof DUNGEON_IDS)[number];
type DelveId = (typeof DELVE_IDS)[number];

type MobTranslations = Record<MobId, { name: string }>;
type NpcTranslations = Record<NpcId, { name: string; title: string; greeting: string }>;
type QuestTranslation = {
  title: string;
  text: string;
  completion: string;
  objectives: Record<number, { label: string }>;
};
type QuestTranslations = Record<QuestId, QuestTranslation>;
type ZoneTranslations = Record<
  ZoneId,
  { name: string; welcome: string; pois: Record<number, { label: string }> }
>;
type DungeonTranslations = Record<
  DungeonId,
  { name: string; enterText: string; leaveText: string }
>;
type DelveTranslations = Record<DelveId, { name: string; enterText: string; leaveText: string }>;

type WorldEntityTranslations = {
  worldContent: {
    corpseName: string;
    dungeonExitName: string;
    dungeonPartyWarning: string;
    dungeonInstanceBusy: string;
    delveLockedChestInteract: string;
    delveRewardChestInteract: string;
    delveSurfaceExitInteract: string;
  };
  entities: {
    mobs: MobTranslations;
    npcs: NpcTranslations;
    quests: QuestTranslations;
    zones: ZoneTranslations;
    dungeons: DungeonTranslations;
    delves: DelveTranslations;
  };
};

function normalizeSourceText(text: string): string {
  return text
    .replace(/\$N/g, '{playerName}')
    .replace(/\$C/g, '{className}')
    .replace(/\u2014/g, '-');
}

function orderedValues<T>(ids: readonly string[], source: Record<string, T>): T[] {
  return ids.map((id) => {
    const value = source[id];
    if (!value) throw new Error(`Missing world entity source entry for ${id}`);
    return value;
  });
}

function makeEnglishWorldEntities(): WorldEntityTranslations {
  const mobs = {} as MobTranslations;
  orderedValues(MOB_IDS, MOBS).forEach((mob) => {
    mobs[mob.id as MobId] = { name: mob.name };
  });

  const npcs = {} as NpcTranslations;
  orderedValues(NPC_IDS, NPCS).forEach((npc) => {
    npcs[npc.id as NpcId] = {
      name: npc.name,
      title: npc.title,
      greeting: normalizeSourceText(npc.greeting),
    };
  });

  const quests = {} as QuestTranslations;
  orderedValues(QUEST_IDS, QUESTS).forEach((quest) => {
    const objectiveRecord = {} as Record<number, { label: string }>;
    quest.objectives.forEach((objective, objectiveIndex) => {
      objectiveRecord[objectiveIndex] = { label: objective.label };
    });
    quests[quest.id as QuestId] = {
      title: quest.name,
      text: normalizeSourceText(quest.text),
      completion: normalizeSourceText(quest.completionText),
      objectives: objectiveRecord,
    };
  });

  const zones = {} as ZoneTranslations;
  ZONES.forEach((zone) => {
    const poiRecord = {} as Record<number, { label: string }>;
    zone.pois.forEach((poi, index) => {
      poiRecord[index] = { label: poi.label };
    });
    zones[zone.id as ZoneId] = {
      name: zone.name,
      welcome: normalizeSourceText(zone.welcome),
      pois: poiRecord,
    };
  });

  const dungeons = {} as DungeonTranslations;
  orderedValues(DUNGEON_IDS, DUNGEONS).forEach((dungeon) => {
    dungeons[dungeon.id as DungeonId] = {
      name: dungeon.name,
      enterText: normalizeSourceText(dungeon.enterText),
      leaveText: normalizeSourceText(dungeon.leaveText),
    };
  });

  const delves = {} as DelveTranslations;
  orderedValues(DELVE_IDS, DELVES).forEach((delve) => {
    delves[delve.id as DelveId] = {
      name: delve.name,
      enterText: normalizeSourceText(delve.enterText),
      leaveText: normalizeSourceText(delve.leaveText),
    };
  });

  return {
    worldContent: {
      corpseName: '{name} (corpse)',
      dungeonExitName: '{name} Exit',
      dungeonPartyWarning: '{name} is meant for a full party of {count}. Tread carefully.',
      dungeonInstanceBusy: 'All instances of {name} are busy. Try again soon.',
      delveLockedChestInteract: 'Press F to pick the lock',
      delveRewardChestInteract: 'Press F to claim spoils',
      delveSurfaceExitInteract: 'Press F to climb',
    },
    entities: { mobs, npcs, quests, zones, dungeons, delves },
  };
}

// Only `.en` is consumed (by src/ui/i18n.catalog); non-English entity names live in the
// flat per-locale overlays, and dialect inheritance is a declared-base merge in the
// build resolver. So this object intentionally carries English only.
export const worldEntityText = {
  en: makeEnglishWorldEntities(),
};
