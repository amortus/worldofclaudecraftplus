import {
  CINDERFORGE_DUNGEON_DEFS,
  CINDERFORGE_MOBS,
  EXPANSION_NPCS,
  EXPANSION_QUESTS,
} from '../sim/content/expansion';
import { GATHER_NODES } from '../sim/content/professions';
import { RIFT_MOBS } from '../sim/content/rift';
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
  // Thunzharr, the Waking Peak (world boss) + its summoned stormlings
  'thunzharr_waking_peak',
  'thunzharr_stormling',
  // Collapsed Reliquary delve mobs
  'reliquary_ledger_wraith',
  'reliquary_funeral_ringer',
  'reliquary_gravecall_acolyte',
  'reliquary_bonewalker',
  'reliquary_saintless_effigy',
  'deacon_varric',
  'acolyte_tessa',
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
  // The ring zones (willowfen, galecrest, palmreach, evergarden).
  'bogtoad', 'drowsy_croaker', 'lily_wisp', 'willow_sprite', 'moor_ram',
  'gale_wisp', 'shoal_scuttler', 'downs_bandit', 'wreck_thief', 'the_wreck_warden',
  'drowned_deckhand', 'tide_scuttler', 'thicket_boar', 'canopy_weaver', 'idol_guardian',
  'topiary_stag', 'topiary_wolf', 'hedge_knight', 'hedge_gnome', 'the_topiary_bull',
  // ---------------------------------------------------------------------------
  // The upstream realm ring (src/sim/content/realms/): the eleven grid zones of
  // the 14-zone map that are not one of the three original strip bands.
  // ---------------------------------------------------------------------------
  // The Veiled Hollow
  'glimmerwisp', 'duskwisp', 'veiled_stag', 'veiled_doe', 'gleamstag',
  'mushroom_pixie', 'sporeling_gatherer', 'corrupted_sporeling', 'treant_elder',
  'ancient_guardian', 'old_marrowshell', 'aurelhorn', 'waking_warden',
  // The Frostveil Reach
  'snowdrift_wolf', 'ice_wisp', 'rime_elemental', 'fen_sprite', 'terrace_howler',
  'frostmane_yeti',
  // The Farshore
  'riftspawn', 'breach_wretch', 'void_stalker', 'sundered_horror',
  // The Nightbloom
  'moonfleece_grazer', 'gloam_strider', 'nightkin_stargazer', 'barrow_king',
  'barrow_wight',
  // The Wraithwood
  'widowsilk_spinner', 'wood_wraith', 'gravenbark_shambler', 'pale_huntsman',
  // The Amberfall
  'gilded_stag', 'gloam_fox', 'orchard_treant', 'harvest_sprite', 'mere_lurker',
  'the_meredark',
  // The Drakelands
  'emberwing_drake', 'dragonkin_broodguard', 'drakemaw_broodlord',
  'ashbone_raider', 'ashbone_warcaller', 'dune_troll', 'cindraleth_maw_matriarch',
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
  // The ring zones.
  'waykeeper_pell', 'bridgewright_alden', 'netter_maris', 'mother_sedge',
  'watcher_maren', 'harbormaster_odile', 'keeper_bram', 'salvager_edda',
  'strandwatcher_pell', 'salvage_boss_ryna', 'pearlmother_isha', 'hermit_okku',
  'gatewarden_pell', 'head_gardener_amaranth', 'wickmother_sorrel', 'gardener_yew',
  // The upstream realm ring.
  // The Veiled Hollow
  'keeper_saelwyn', 'loremother_bryn', 'provisioner_fenna', 'wardsmith_orun',
  'archivist_tullo', 'huntsman_deral',
  // The Frostveil Reach
  'warden_kaldra', 'hearthkeeper_maeve', 'scout_einna', 'aurorist_veyla', 'trapper_brosk',
  // The Farshore
  'warden_coalfast', 'riftwatch_ollun', 'quartermaster_edda', 'mender_saul',
  'bellkeeper_tam', 'fisher_nell',
  // The Nightbloom
  'lamplighter_sorrel', 'lira_dewsong', 'weaver_amelle', 'astronomer_cassian',
  // The Wraithwood
  'lampman_cobb', 'sexton_marrow', 'widow_tansy', 'vicar_creel',
  // The Amberfall
  'reeve_ottoline', 'waywatcher_sorrel', 'ferrymaster_caddow', 'orchardist_pomeline',
  // The Drakelands
  'gatecaptain_brannoc', 'quartermaster_sela', 'scout_yerrin',
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
  // when the old chains were retired.
  'q_haldren_fangs',
  'q_redbrook_mileposts',
  'q_haldren_scale',
  'q_lin_glade',
  'q_haldren_tallow',
  'q_lin_boneash',
  'q_wilkes_colors',
  'q_aldric_reliquary',
  'q_moggers_trail',
  'q_redbrook_verlan',
  // The ring zones.
  'q_wf_across_the_fenway', 'q_wf_rope_chewers', 'q_wf_mind_the_moorings',
  'q_wf_eels_for_the_smokehouse', 'q_wf_toll_and_tangle', 'q_wf_witch_of_willowweep',
  'q_wf_wisplight_charms', 'q_wf_croakers_hush',
  'q_gc_down_the_windway', 'q_gc_wool_off_the_downs', 'q_gc_scuttlers_in_the_pots',
  'q_gc_keeper_of_the_flame', 'q_gc_lanterns_on_the_shear', 'q_gc_wind_against_the_wick',
  'q_gc_the_far_shore', 'q_gc_dead_mens_cargo', 'q_gc_the_wreck_warden',
  'q_pr_down_to_drifthaven', 'q_pr_wreck_line_cargo', 'q_pr_scuttler_cull',
  'q_pr_boars_in_the_gardens', 'q_pr_the_man_who_went_in', 'q_pr_canopy_silk',
  'q_pr_what_the_drums_guard', 'q_pr_idol_guardian',
  'q_eg_gate_report', 'q_eg_hungry_shapes', 'q_eg_stolen_shears',
  'q_eg_gnomes_in_the_green', 'q_eg_who_trims_the_hedges', 'q_eg_bloom_clippings',
  'q_eg_four_statues', 'q_eg_bull_of_the_court',
  // The upstream realm ring.
  // The Veiled Hollow
  'q_veil_thinned', 'q_calming_the_deep', 'q_spore_hearts', 'q_sunken_court',
  'q_waking_warden', 'q_seal_restored', 'q_gleaming_antlers', 'q_wisp_lights',
  'q_treant_accord', 'q_monument_tour', 'q_grove_menace', 'q_shards_of_starfall',
  'q_spore_tide', 'q_wardens_echoes', 'q_hollow_the_huntsman',
  'q_hollow_old_marrowshell', 'q_hollow_first_of_the_herd',
  // The Frostveil Reach
  'q_fv_snowline_report', 'q_fv_wolves_at_the_door', 'q_fv_winter_pelts',
  'q_fv_ember_caches', 'q_fv_lights_over_steps', 'q_fv_aurora_motes',
  'q_fv_rime_unbound', 'q_fv_silent_trapline', 'q_fv_sprung_traps',
  'q_fv_howl_above', 'q_fv_frostmane_tyrant',
  // The Farshore
  'q_fs_bell_at_the_landing', 'q_fs_hold_the_riftfields', 'q_fs_steel_for_the_redoubt',
  'q_fs_the_three_bells', 'q_fs_song_before_the_break', 'q_fs_moss_and_mending',
  'q_fs_stalkers_off_the_light', 'q_fs_the_great_break',
  // The Nightbloom
  'q_nb_road_of_lanterns', 'q_nb_striders_in_the_dark', 'q_nb_wool_by_moonlight',
  'q_nb_night_gardens', 'q_nb_eyes_on_the_vigil', 'q_nb_charts_of_the_stones',
  'q_nb_restless_mounds', 'q_nb_the_barrow_king',
  // The Wraithwood
  'q_ww_bells_of_gallowmere', 'q_ww_silk_in_the_eaves', 'q_ww_widows_skeins',
  'q_ww_candles_at_the_bounds', 'q_ww_the_last_vicar', 'q_ww_wraiths_of_the_tarn',
  'q_ww_what_the_bark_holds', 'q_ww_horn_of_the_huntsman',
  // The Amberfall
  'q_af_goldmelt_road', 'q_af_foxes_in_the_lamplight', 'q_af_orchard_call',
  'q_af_sprites_and_spigots', 'q_af_amber_from_the_herd', 'q_af_lanterns_on_the_water',
  'q_af_what_took_the_moorings', 'q_af_the_meredark',
  // The Drakelands
  'q_dk_ash_on_the_wind', 'q_dk_trolls_on_the_road', 'q_dk_scorched_stores',
  'q_dk_banners_over_the_dunes', 'q_dk_watcher_at_the_wargate', 'q_dk_marrow_and_ash',
  'q_dk_scales_of_the_maw', 'q_dk_matriarch_of_the_maw',
] as const;

// The four strip bands plus the two column zones that flank the Vale's band east
// and west. Names, welcomes, hub names and POI labels all resolve from here.
const ZONE_IDS = [
  'eastbrook_vale',
  'mirefen_marsh',
  'thornpeak_heights',
  // The ring: upstream's four zones that close the grid around our strip.
  'willowfen',
  'galecrest',
  'palmreach',
  'evergarden',
  // The rest of the 14-zone grid, ported from upstream.
  'veiled_hollow',
  'frostveil',
  'farshore_isle',
  'nightbloom',
  'wraithwood',
  'amberfall',
  'drakelands',
] as const;

/**
 * Gatherable world nodes are named per (node type, zone), not per node: all
 * three Copper Veins in the Vale carry one name, so there are twelve names for
 * the thirty-nine placements. `gatherNodeNameKey` is the ONE place that
 * encoding lives, shared with entity_i18n.ts's `gatherNode` resolver.
 */
export function gatherNodeNameKey(type: string, zoneId: string): string {
  return `${type}_${zoneId}`;
}

type GatherNodeTranslations = Record<string, { name: string }>;

/**
 * The 26 procedural-rift creatures (16 trash elites, 8 theme bosses, 2
 * boss-summoned adds). Sourced straight from `content/rift`, the way the gather
 * nodes above are sourced from `GATHER_NODES`, rather than through the merged
 * `MOBS` table: the run-lifecycle wave is what spreads `RIFT_MOBS` into
 * `sim/data.ts`, and a rift creature's NAME should not have to wait on that.
 * Ids stay in the same `entities.mobs.*` namespace as every other creature, so
 * `tEntity({ kind: 'mob' })` resolves them with no special case.
 */
const RIFT_MOB_IDS = [
  'rift_frost_revenant',
  'rift_rime_elemental',
  'rift_ember_fiend',
  'rift_magma_brute',
  'rift_venom_weaver',
  'rift_thornback',
  'rift_boneclad',
  'rift_marrow_troll',
  'rift_stone_ogre',
  'rift_iron_reaver',
  'rift_void_acolyte',
  'rift_dread_stalker',
  'rift_storm_caller',
  'rift_stormscale',
  'rift_tide_thrall',
  'rift_deep_lurker',
  'rift_boss_frost',
  'rift_boss_ember',
  'rift_boss_venom',
  'rift_boss_necro',
  'rift_boss_brute',
  'rift_boss_arcane',
  'rift_boss_storm',
  'rift_boss_tide',
  'rift_riftspawn',
  'rift_shardling',
] as const;

/**
 * The expansion content pack (src/sim/content/expansion/): the Cinderforge and
 * the four new quest lines.
 *
 * Sourced STRAIGHT from the pack rather than through the merged `MOBS` / `NPCS`
 * / `QUESTS` / `DUNGEONS` tables, exactly as the rift creatures above are, and
 * for the same reason: `data.ts` is the wiring wave's file, and a Cinderforge
 * boss's NAME should not ship untranslated in fourteen locales while it waits on
 * a merge in a different change. The ids land in the same `entities.*`
 * namespaces as every other entity, so `tEntity` resolves them with no special
 * case, and the lists stay correct once the merge does land.
 */
const EXPANSION_MOB_IDS = [
  'cf_covenant_smith',
  'cf_ashbound_zealot',
  'cf_slag_elemental',
  'cf_emberling',
  'cf_cinder_wisp',
  'cf_forgewarden_bexley',
  'cf_slagheart',
  'cf_vharkul',
] as const;

const EXPANSION_NPC_IDS = [
  'houndmaster_teel',
  'ferrywoman_odalie',
  'stonewright_hulda',
  'dawn_forgewright_calla',
] as const;

const EXPANSION_QUEST_IDS = [
  // Eastbrook Vale
  'q_ev_kennels',
  'q_ev_houndsbane',
  'q_ev_boars',
  'q_ev_last_hound',
  // Mirefen Marsh
  'q_mf_polings',
  'q_mf_lanterns',
  'q_mf_drowned_toll',
  'q_mf_trollbridge',
  // Thornpeak Heights
  'q_tp_quarry',
  'q_tp_keystones',
  'q_tp_ogre_wall',
  'q_tp_stormcut',
  // The Ashen Wastes and the Cinderforge
  'q_cf_approach',
  'q_cf_slagfall',
  'q_cf_covenant',
  'q_cf_forgewarden',
  'q_cf_bellows',
  'q_cf_unquenched',
] as const;

const EXPANSION_DUNGEON_IDS = ['cinderforge'] as const;

/** The translation id for a rift boss's signature pulse. One per boss that
 *  carries an `aoePulse`; the two bosses whose kit is summons and healing cast
 *  nothing named, so they have no row. */
export function riftMobAbilityId(mobId: string): string {
  return `${mobId}_pulse`;
}

/**
 * Rift boss ability names, keyed by `riftMobAbilityId`. These are ENTITY names,
 * not HUD chrome: the sim splices the raw English into its combat text, and
 * `sim_i18n.ts` reverses it back through `tEntity` exactly as it does for a
 * player ability. Derived from the templates so a renamed pulse can never drift
 * from the one the player is actually being hit by.
 */
export const RIFT_MOB_ABILITY_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(RIFT_MOBS)
    .filter((mob) => !!mob.aoePulse)
    .map((mob) => [riftMobAbilityId(mob.id), mob.aoePulse!.name]),
);

type MobAbilityTranslations = Record<string, { name: string }>;
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

type MobId =
  | (typeof MOB_IDS)[number]
  | (typeof RIFT_MOB_IDS)[number]
  | (typeof EXPANSION_MOB_IDS)[number];
type NpcId = (typeof NPC_IDS)[number] | (typeof EXPANSION_NPC_IDS)[number];
type QuestId = (typeof QUEST_IDS)[number] | (typeof EXPANSION_QUEST_IDS)[number];
type ZoneId = (typeof ZONE_IDS)[number];
type DungeonId = (typeof DUNGEON_IDS)[number] | (typeof EXPANSION_DUNGEON_IDS)[number];
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
    gatherNodes: GatherNodeTranslations;
    mobAbilities: MobAbilityTranslations;
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
  orderedValues(RIFT_MOB_IDS, RIFT_MOBS).forEach((mob) => {
    mobs[mob.id as MobId] = { name: mob.name };
  });
  orderedValues(EXPANSION_MOB_IDS, CINDERFORGE_MOBS).forEach((mob) => {
    mobs[mob.id as MobId] = { name: mob.name };
  });

  const mobAbilities = {} as MobAbilityTranslations;
  for (const [id, name] of Object.entries(RIFT_MOB_ABILITY_NAMES)) {
    mobAbilities[id] = { name };
  }

  const npcs = {} as NpcTranslations;
  const addNpc = (npc: { id: string; name: string; title: string; greeting: string }): void => {
    npcs[npc.id as NpcId] = {
      name: npc.name,
      title: npc.title,
      greeting: normalizeSourceText(npc.greeting),
    };
  };
  orderedValues(NPC_IDS, NPCS).forEach(addNpc);
  orderedValues(EXPANSION_NPC_IDS, EXPANSION_NPCS).forEach(addNpc);

  const quests = {} as QuestTranslations;
  const addQuest = (quest: {
    id: string;
    name: string;
    text: string;
    completionText: string;
    objectives: readonly { label: string }[];
  }): void => {
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
  };
  orderedValues(QUEST_IDS, QUESTS).forEach(addQuest);
  orderedValues(EXPANSION_QUEST_IDS, EXPANSION_QUESTS).forEach(addQuest);

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
  const addDungeon = (dungeon: {
    id: string;
    name: string;
    enterText: string;
    leaveText: string;
  }): void => {
    dungeons[dungeon.id as DungeonId] = {
      name: dungeon.name,
      enterText: normalizeSourceText(dungeon.enterText),
      leaveText: normalizeSourceText(dungeon.leaveText),
    };
  };
  orderedValues(DUNGEON_IDS, DUNGEONS).forEach(addDungeon);
  orderedValues(EXPANSION_DUNGEON_IDS, CINDERFORGE_DUNGEON_DEFS).forEach(addDungeon);

  const delves = {} as DelveTranslations;
  orderedValues(DELVE_IDS, DELVES).forEach((delve) => {
    delves[delve.id as DelveId] = {
      name: delve.name,
      enterText: normalizeSourceText(delve.enterText),
      leaveText: normalizeSourceText(delve.leaveText),
    };
  });

  // Twelve names, one per (node type, zone). Derived from GATHER_NODES rather
  // than restated, so a re-named vein can never drift from the world object the
  // player actually clicks. First writer wins: every node of a pair carries the
  // same objectName by construction.
  const gatherNodes = {} as GatherNodeTranslations;
  for (const node of GATHER_NODES) {
    const key = gatherNodeNameKey(node.type, node.zoneId);
    if (!gatherNodes[key]) gatherNodes[key] = { name: node.objectName };
  }

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
    entities: { mobs, npcs, quests, zones, dungeons, delves, gatherNodes, mobAbilities },
  };
}

// Only `.en` is consumed (by src/ui/i18n.catalog); non-English entity names live in the
// flat per-locale overlays, and dialect inheritance is a declared-base merge in the
// build resolver. So this object intentionally carries English only.
export const worldEntityText = {
  en: makeEnglishWorldEntities(),
};
