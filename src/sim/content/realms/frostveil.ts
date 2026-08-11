// The Frostveil Reach (levels 17-20), ported from upstream `src/sim/content/frostveil.ts`.
//
// A snowbound mountain realm of terraced benches, frozen tarns and auroras,
// sitting on the ORIGINAL full-width strip (no xMin/xMax) north of the volcanic
// belt. Walked into like the Drakelands: the Snowline pass climbs out of the
// rim on a flat valley floor whose green fades under the snow mile by mile
// (southPassX 44, the Wyrmgate). The village of Icemantle rings a firelit
// market plaza; the Aurorist reads the lights from her camp out on the Steps
// and a trapper works the Shiverfen reeds.
//
// WHAT CHANGED FROM UPSTREAM, and why. Their rect, ids, level band, mobs,
// NPCs, quests, items, camps, objects and prose are taken verbatim except:
//   - `riftPortalEligible` / `riftTierWeights` are not fields of our ZoneDef.
//     Our rift rotation is DERIVED (`riftEligibleZones`, data.ts: any zone whose
//     level band reaches the cap), and this zone reaches 20, so it joins the
//     rotation anyway.
//   - POI records carry no `id` here; our `ZoneDef.pois` is `{x, z, label}`.
//   - `PortalDef` has no equivalent here and upstream's `FROSTVEIL_PORTALS` is
//     empty anyway: the Reach is walked into over the Snowline pass.
//   - `MobTemplate.componentTags` (on the wolf and the howler) is an upstream
//     corpse-harvest surface we do not have, so it is dropped rather than faked.
//     The mobs' `family` is remapped onto our 11-member `MobFamily` (burrower ->
//     kobold for the fey sprites); every value used here already has a rig in
//     `src/render/characters/`.
//   - `EscortDef` and `objectives[].type: 'escort'` have no equivalent: our
//     `QuestObjective.type` is only kill/collect/interact. So upstream's
//     `FROSTVEIL_ESCORTS`, the quest `q_fv_seeing_wren_home` and its escortee
//     mob `apprentice_wren` are NOT ported. That quest granted no item reward
//     (`itemRewards: {}`) and nothing depended on it, so the chain is otherwise
//     intact; its id is also gone from Brosk's and Veyla's `questIds` and from
//     the quest order.
//   - Upstream keeps its terrace-howler spawns in a second `FROSTVEIL_QUEST_CAMPS`
//     export that their data.ts tail-appends. We ship one `FROSTVEIL_CAMPS`, so
//     those two camps are the last two rows of it (see below).
//   - DIRECTION WORDS ARE RE-DERIVED. Upstream writes +x as EAST; this world is
//     +z NORTH and +x WEST, so east is -x. Every compass word in player-visible
//     copy below was recomputed from the live coordinates, with the derivation
//     cited at the site.
//
// Camps are authored the way upstream wrote them, as scatter camps with
// `center`/`radius`/`count` and no `positions`. Freezing them to exact spots
// (the rule the rest of this pack holds, so world generation draws no rng) is a
// later central pass, not this file's job.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const FROSTVEIL_ZONE: ZoneDef = {
  id: 'frostveil',
  name: 'The Frostveil Reach',
  zMin: 1440,
  zMax: 1960,
  levelRange: [17, 20],
  biome: 'frost',
  // The Wyrmgate: the pass through this zone's SOUTHERN border ridge, where the
  // causeway road climbs out of the volcanic rim and into the snow.
  southPassX: 44,
  hub: { x: -30, z: 1560, radius: 22, name: 'Icemantle' },
  graveyard: { x: -34, z: 1576 },
  lakes: [
    { x: 60, z: 1640, radius: 16 }, // Glacier Tarn
    { x: 48, z: 1652, radius: 9 }, // ...its still northern finger
    { x: -90, z: 1760, radius: 12 }, // the Shiverfen pool
  ],
  pois: [
    { x: -30, z: 1560, label: 'Icemantle' },
    { x: -10, z: 1495, label: 'The Snowline' },
    { x: 60, z: 1640, label: 'Glacier Tarn' },
    { x: 30, z: 1740, label: 'The Aurora Steps' },
    { x: -90, z: 1760, label: 'The Shiverfen' },
    { x: 100, z: 1810, label: 'The Howling Terraces' },
  ],
  welcome: 'Snow swallows every sound. Under the dancing lights, the cold itself feels awake.',
  welcomeQuestId: 'q_fv_snowline_report',
};

// Bench-to-bench mountain paths; terracing is suppressed near roads so every
// marked route stays climbable.
export const FROSTVEIL_ROADS: { x: number; z: number }[][] = [
  [
    { x: -30, z: 1560 },
    { x: 10, z: 1600 },
    { x: 42, z: 1626 },
  ], // Icemantle to the Glacier Tarn shore
  [
    { x: 42, z: 1626 },
    { x: 28, z: 1662 },
    { x: 40, z: 1700 },
    { x: 30, z: 1740 },
  ], // the tarn shore to the Aurora Steps, skirting the tarn's finger
  [
    { x: -30, z: 1560 },
    { x: -70, z: 1660 },
    { x: -78, z: 1746 },
  ], // Icemantle to the Shiverfen's edge
  [
    { x: 30, z: 1740 },
    { x: 70, z: 1790 },
    { x: 90, z: 1830 },
  ], // the Aurora Steps to the Howling Terraces
  [
    { x: 30, z: 1740 },
    { x: -40, z: 1800 },
    { x: -120, z: 1860 },
    { x: -176, z: 1888 },
  ], // the Aurora Steps to the Goldmelt crossing at the far -x edge (into the autumn)
  [
    { x: -30, z: 1560 },
    { x: 20, z: 1612 },
    { x: 30, z: 1666 },
    { x: 80, z: 1694 },
    { x: 130, z: 1760 },
    { x: 120, z: 1840 },
    { x: 142, z: 1876 },
    { x: 176, z: 1888 },
  ], // Icemantle, around the tarn, to the crossing at the far +x edge
  [
    { x: -30, z: 1560 },
    { x: -10, z: 1520 },
    { x: 20, z: 1480 },
    { x: 44, z: 1448 },
  ], // Icemantle south to the Wyrmgate (down to the causeway)
];

// The Reach's inhabitants: wolves and rime elementals hunt the benches, wisps
// drift the aurora country, sprites keep to the fen, howlers have come down off
// the peaks, and a yeti stalks the far terraces.
export const FROSTVEIL_MOBS: Record<string, MobTemplate> = {
  snowdrift_wolf: {
    id: 'snowdrift_wolf',
    name: 'Snowdrift Wolf',
    minLevel: 17,
    maxLevel: 18,
    family: 'beast',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.8,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 14,
    loot: [
      { copper: 80, chance: 1 },
      { itemId: 'thick_winter_pelt', chance: 0.6, questId: 'q_fv_winter_pelts' },
    ],
    scale: 1.1,
    color: 0xeef4f8,
  },
  ice_wisp: {
    id: 'ice_wisp',
    name: 'Ice Wisp',
    minLevel: 17,
    maxLevel: 18,
    family: 'elemental',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 8,
    dmgPerLevel: 2.0,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 7.5,
    aggroRadius: 0, // drifting cold light, harmless unless harmed
    loot: [
      { copper: 90, chance: 1 },
      { itemId: 'aurora_mote', chance: 0.65, questId: 'q_fv_aurora_motes' },
    ],
    scale: 0.7,
    color: 0xbfe4ff,
  },
  rime_elemental: {
    id: 'rime_elemental',
    name: 'Rime Elemental',
    minLevel: 18,
    maxLevel: 19,
    family: 'elemental',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 11,
    dmgPerLevel: 2.4,
    attackSpeed: 2.2,
    armorPerLevel: 14,
    moveSpeed: 7,
    aggroRadius: 12,
    loot: [{ copper: 95, chance: 1 }],
    scale: 1.15,
    color: 0x9fd0f0,
  },
  fen_sprite: {
    id: 'fen_sprite',
    name: 'Fen Sprite',
    minLevel: 17,
    maxLevel: 18,
    family: 'kobold', // upstream 'burrower'
    hpBase: 48,
    hpPerLevel: 17,
    dmgBase: 9,
    dmgPerLevel: 2.1,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8,
    aggroRadius: 10,
    loot: [{ copper: 90, chance: 1 }],
    scale: 0.9,
    color: 0xcfe0ea,
  },
  // Bigger throats off the peaks: the pack that pushed the snowdrift wolves
  // down onto the tarn road (q_fv_howl_above).
  terrace_howler: {
    id: 'terrace_howler',
    name: 'Terrace Howler',
    minLevel: 19,
    maxLevel: 20,
    family: 'beast',
    hpBase: 68,
    hpPerLevel: 22,
    dmgBase: 12,
    dmgPerLevel: 2.5,
    attackSpeed: 1.9,
    armorPerLevel: 13,
    moveSpeed: 8.5,
    aggroRadius: 15,
    loot: [{ copper: 105, chance: 1 }],
    scale: 1.3,
    color: 0x9db4c8,
  },
  frostmane_yeti: {
    id: 'frostmane_yeti',
    name: 'Frostmane Yeti',
    minLevel: 19,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 120,
    hpPerLevel: 30,
    dmgBase: 15,
    dmgPerLevel: 2.8,
    attackSpeed: 2.4,
    armorPerLevel: 16,
    moveSpeed: 8,
    aggroRadius: 16,
    elite: true,
    loot: [{ copper: 100, chance: 1 }],
    scale: 1.5,
    color: 0xf2f6fa,
  },
};

// The folk of the Reach: the warden and hearthkeeper hold Icemantle, a scout
// watches the Snowline pass, the Aurorist reads the lights from her camp on the
// Steps, and a trapper works the Shiverfen. Two of them stand far from the hub
// on purpose: the chains send players out to find them.
export const FROSTVEIL_NPCS: Record<string, NpcDef> = {
  warden_kaldra: {
    id: 'warden_kaldra',
    name: 'Warden Kaldra',
    title: 'Warden of Icemantle',
    pos: { x: -27, z: 1557 },
    facing: 2.4,
    color: 0x9fb8cc,
    questIds: [
      'q_fv_snowline_report',
      'q_fv_wolves_at_the_door',
      'q_fv_lights_over_steps',
      'q_fv_howl_above',
      'q_fv_frostmane_tyrant',
    ],
    greeting: 'Mind the benches, stranger. The snow keeps what it takes.',
  },
  hearthkeeper_maeve: {
    id: 'hearthkeeper_maeve',
    name: 'Hearthkeeper Maeve',
    title: 'Keeper of the Hearth-Lodge',
    pos: { x: -40, z: 1557 },
    facing: 0.8,
    color: 0xd9a066,
    questIds: ['q_fv_winter_pelts', 'q_fv_ember_caches', 'q_fv_silent_trapline'],
    greeting: 'Come in off the cold. The lodge fire never goes out, so long as I draw breath.',
  },
  scout_einna: {
    id: 'scout_einna',
    name: 'Scout Einna',
    title: 'Snowline Scout',
    pos: { x: -12, z: 1502 },
    facing: -0.4,
    color: 0x8fa8b8,
    questIds: ['q_fv_snowline_report'],
    greeting: 'You walked the pass alive. Good. Icemantle should hear of it.',
  },
  aurorist_veyla: {
    id: 'aurorist_veyla',
    name: 'Aurorist Veyla',
    title: 'Reader of the Lights',
    pos: { x: 32, z: 1744 },
    facing: -2.2,
    color: 0xb8a2e0,
    // 'q_fv_seeing_wren_home' is dropped with the escort system, so it is not
    // listed here (Veyla was its turn-in).
    questIds: ['q_fv_lights_over_steps', 'q_fv_aurora_motes', 'q_fv_rime_unbound'],
    greeting: 'Hush. The lights are speaking tonight, and they do not repeat themselves.',
  },
  trapper_brosk: {
    id: 'trapper_brosk',
    name: 'Trapper Brosk',
    title: 'Shiverfen Trapper',
    pos: { x: -82, z: 1744 },
    facing: 1.6,
    color: 0x7d8a6a,
    // 'q_fv_seeing_wren_home' is dropped with the escort system (Brosk was its giver).
    questIds: ['q_fv_silent_trapline', 'q_fv_sprung_traps'],
    greeting: 'Fen took three of my lines this week. Fen never took a line in twenty years.',
  },
};

export const FROSTVEIL_QUESTS: Record<string, QuestDef> = {
  q_fv_snowline_report: {
    id: 'q_fv_snowline_report',
    name: 'Word from the Snowline',
    giverNpcId: 'scout_einna',
    turnInNpcId: 'warden_kaldra',
    // "up the north road" holds on our axes: Kaldra stands at x -27 / z 1557
    // against Einna at x -12 / z 1502, i.e. 55 yd of +z against 15 yd of -x, a
    // bearing of 15 degrees, so NORTH is the nearest rose point. Left as written.
    text: 'Every soul who climbs out of the Drakelands passes my fire, $N, and fewer climb every week. Warden Kaldra holds Icemantle up the north road. Tell her the pass is still open, and tell her a stranger walked it alone.',
    completionText:
      'The pass holds, then. Einna sits that waycamp through storms that bury the road markers, and she has never once sent me idle news. Welcome to Icemantle, $N.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'warden_kaldra',
        count: 1,
        label: 'Report to Warden Kaldra',
      },
    ],
    xpReward: 2400,
    copperReward: 900,
    itemRewards: {},
    minLevel: 16,
  },
  q_fv_wolves_at_the_door: {
    id: 'q_fv_wolves_at_the_door',
    name: 'Wolves at the Door',
    giverNpcId: 'warden_kaldra',
    turnInNpcId: 'warden_kaldra',
    text: 'The snowdrift packs used to keep to the high benches. Now they cross the tarn road in daylight and my woodcutters will not leave the walls. Thin the packs, $N, ten of them, and the road is a road again.',
    completionText:
      'Ten fewer shadows between here and the tarn. The woodcutters are already arguing over who goes out first.',
    objectives: [
      { type: 'kill', targetMobId: 'snowdrift_wolf', count: 10, label: 'Snowdrift Wolf slain' },
    ],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {},
    requiresQuest: 'q_fv_snowline_report',
  },
  q_fv_winter_pelts: {
    id: 'q_fv_winter_pelts',
    name: 'Pelts for the Lodge',
    giverNpcId: 'hearthkeeper_maeve',
    turnInNpcId: 'hearthkeeper_maeve',
    text: 'Firewood keeps a body alive, $N, but wool will not turn this cold, only wolf-fur will. Six thick winter pelts off the snowdrift packs and I can line bedrolls for everyone the lodge shelters.',
    completionText:
      'Fur like this is the only argument winter listens to. Take these treads, they are lined with the last batch.',
    objectives: [
      { type: 'collect', itemId: 'thick_winter_pelt', count: 6, label: 'Thick Winter Pelt' },
    ],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {
      warrior: 'hearthlined_treads',
      mage: 'hearthlined_treads',
      rogue: 'hearthlined_treads',
    },
    requiresQuest: 'q_fv_snowline_report',
  },
  q_fv_ember_caches: {
    id: 'q_fv_ember_caches',
    name: 'Embers on the Tarn Road',
    giverNpcId: 'hearthkeeper_maeve',
    turnInNpcId: 'hearthkeeper_maeve',
    text: 'A sledge of ember caches overturned on the tarn road in last night: iron kettles that hold a banked fire alive for a month. Three of them are still lying in the snow, $N, and the lodge cannot spare what they hold. Bring the fire home.',
    completionText: 'Still warm, every one. You have bought the lodge a whole winter of mercy, $N.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'hearth_ember_cache',
        count: 3,
        label: 'Ember Cache recovered',
      },
    ],
    xpReward: 4000,
    copperReward: 1900,
    itemRewards: {},
    requiresQuest: 'q_fv_snowline_report',
  },
  q_fv_lights_over_steps: {
    id: 'q_fv_lights_over_steps',
    name: 'Lights over the Steps',
    giverNpcId: 'warden_kaldra',
    turnInNpcId: 'aurorist_veyla',
    // "southeast past the tarn": Veyla camps at x 32 / z 1744 against Kaldra at
    // x -27 / z 1557, i.e. 187 yd of +z with only 59 yd of +x, and +x is WEST
    // here, so the bearing is 342 degrees and the Steps lie NORTH of Icemantle.
    text: 'The aurora has burned green every night this month, and the old folk will not walk under it. One woman might know why: Veyla, the Aurorist. She camps alone on the Aurora Steps, north past the tarn. Find her camp, $N, and hear what the lights have told her.',
    completionText:
      'Kaldra sent you? Then she is finally worried, and she is right to be. Sit, $N. Watch the sky with me a while.',
    objectives: [
      { type: 'interact', targetNpcId: 'aurorist_veyla', count: 1, label: 'Find Aurorist Veyla' },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_fv_wolves_at_the_door',
    minLevel: 17,
  },
  q_fv_aurora_motes: {
    id: 'q_fv_aurora_motes',
    name: 'Motes of the Aurora',
    giverNpcId: 'aurorist_veyla',
    turnInNpcId: 'aurorist_veyla',
    text: 'The wisps that drift these steps are shed by the lights themselves, and each carries a mote of the aurora in its heart. I need six to read what the sky is writing, $N. The wisps do not fight back. Whether that makes the work easier or harder is between you and your conscience.',
    completionText:
      'Six motes, still glowing. Look at them, $N: they pulse in time with each other. The lights are not weather. They are a signal.',
    objectives: [{ type: 'collect', itemId: 'aurora_mote', count: 6, label: 'Aurora Mote' }],
    xpReward: 4400,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_fv_lights_over_steps',
  },
  q_fv_rime_unbound: {
    id: 'q_fv_rime_unbound',
    name: 'Rime Unbound',
    giverNpcId: 'aurorist_veyla',
    turnInNpcId: 'aurorist_veyla',
    text: 'When the aurora burns this bright, the cold stands up and walks: rime elementals, frost given a will. They gather where the lights touch the benches, and they are wandering closer to my camp each night. Break eight of them apart, $N, before one of them breaks me.',
    completionText:
      'The night feels thinner already. Whatever wakes them is not done, but you have bought the Steps some quiet.',
    objectives: [
      { type: 'kill', targetMobId: 'rime_elemental', count: 8, label: 'Rime Elemental slain' },
    ],
    xpReward: 4400,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_fv_lights_over_steps',
  },
  q_fv_silent_trapline: {
    id: 'q_fv_silent_trapline',
    name: 'The Silent Trapline',
    giverNpcId: 'hearthkeeper_maeve',
    turnInNpcId: 'trapper_brosk',
    // "west of here": Brosk's fen camp is at x -82 / z 1744 against Maeve at
    // x -40 / z 1557, i.e. 187 yd of +z with 42 yd of -x, and -x is EAST here,
    // so the bearing is 13 degrees and the Shiverfen lies NORTH of the lodge.
    text: 'Old Brosk works the Shiverfen trapline north of here, and every week for eleven years he has sent a bundle of furs up with the wood sledge. Two weeks now, nothing. He is too stubborn to freeze and too careful to drown, $N, so something else is wrong. Find his camp at the fen and see him breathing.',
    completionText:
      "Maeve sent you? Ha. Eleven years and the woman still thinks the fen will eat me. Well... this year she might be right. Look at what it's done to my lines.",
    objectives: [
      { type: 'interact', targetNpcId: 'trapper_brosk', count: 1, label: 'Find Trapper Brosk' },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    minLevel: 17,
  },
  q_fv_sprung_traps: {
    id: 'q_fv_sprung_traps',
    name: 'Sprites in the Traps',
    giverNpcId: 'trapper_brosk',
    turnInNpcId: 'trapper_brosk',
    text: 'Fen sprites, $N. The little devils spring my traps for sport and scatter the iron in the reeds. Drive them off, eight should teach the rest, and gather up what is left of my traplines while you are out there.',
    completionText:
      'Four good traps back and the reeds gone quiet. You trap with a heavier hand than I do, $N, but I cannot argue with the results.',
    objectives: [
      { type: 'kill', targetMobId: 'fen_sprite', count: 8, label: 'Fen Sprite driven off' },
      { type: 'interact', targetObjectItemId: 'sprung_trap', count: 4, label: 'Trap recovered' },
    ],
    xpReward: 4800,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_fv_silent_trapline',
  },
  q_fv_howl_above: {
    id: 'q_fv_howl_above',
    name: 'The Howl on the Terraces',
    giverNpcId: 'warden_kaldra',
    turnInNpcId: 'warden_kaldra',
    text: 'You hear it at dusk, $N: a howl off the Howling Terraces that is not the snowdrift packs. Bigger throats. The terrace howlers have come down from the peaks for the first time since my grandmother held this post, and they are what pushed the wolves onto my road. Cull eight and push them back.',
    completionText:
      'Eight, and the dusk chorus is thinner for it. But howlers do not leave the peaks for nothing. Something up there moved them, and I fear it has a name.',
    objectives: [
      { type: 'kill', targetMobId: 'terrace_howler', count: 8, label: 'Terrace Howler slain' },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_fv_lights_over_steps',
    minLevel: 18,
  },
  q_fv_frostmane_tyrant: {
    id: 'q_fv_frostmane_tyrant',
    name: 'The Frostmane Tyrant',
    giverNpcId: 'warden_kaldra',
    turnInNpcId: 'warden_kaldra',
    text: 'The howlers were not hunting when they came down the terraces. They were fleeing. A yeti has claimed the high ground, the mountain folk call it the Frostmane, and even the packs will not share a slope with it. It has to end, $N, before winter drives it down to my walls. Bring a friend. Bring two.',
    completionText:
      'When the wind dropped last night the whole village heard the silence where the Frostmane used to be. The Reach owes you a debt it will be years in paying, $N. Wear this, and every door in Icemantle is open to you.',
    objectives: [
      { type: 'kill', targetMobId: 'frostmane_yeti', count: 1, label: 'The Frostmane slain' },
    ],
    xpReward: 6000,
    copperReward: 3600,
    itemRewards: {
      warrior: 'frostmane_mantle',
      mage: 'frostmane_mantle',
      rogue: 'frostmane_mantle',
    },
    requiresQuest: 'q_fv_howl_above',
    minLevel: 19,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (not strictly chain order). Upstream's
// 'q_fv_seeing_wren_home' sat between the howl and the tyrant; it is dropped
// with the escort system, so the row is simply gone.
export const FROSTVEIL_QUEST_ORDER: string[] = [
  'q_fv_snowline_report',
  'q_fv_wolves_at_the_door',
  'q_fv_winter_pelts',
  'q_fv_ember_caches',
  'q_fv_lights_over_steps',
  'q_fv_silent_trapline',
  'q_fv_aurora_motes',
  'q_fv_rime_unbound',
  'q_fv_sprung_traps',
  'q_fv_howl_above',
  'q_fv_frostmane_tyrant',
];

export const FROSTVEIL_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  thick_winter_pelt: {
    id: 'thick_winter_pelt',
    name: 'Thick Winter Pelt',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_fv_winter_pelts',
  },
  aurora_mote: {
    id: 'aurora_mote',
    name: 'Aurora Mote',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_fv_aurora_motes',
  },
  hearth_ember_cache: {
    id: 'hearth_ember_cache',
    name: 'Ember Cache',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_fv_ember_caches',
    noVendorSell: true,
  },
  sprung_trap: {
    id: 'sprung_trap',
    name: 'Sprung Fen Trap',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_fv_sprung_traps',
    noVendorSell: true,
  },
  // --- quest rewards ---
  hearthlined_treads: {
    id: 'hearthlined_treads',
    name: 'Hearth-Lined Treads',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'feet',
    quality: 'uncommon',
    stats: { armor: 58, sta: 4, spi: 3 },
    sellValue: 900,
  },
  frostmane_mantle: {
    id: 'frostmane_mantle',
    name: 'Mantle of the Frostmane',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 72, sta: 6, str: 4 },
    sellValue: 2200,
  },
};

// Scatter camps exactly as upstream authored them (center/radius/count, no
// `positions`): freezing them to exact spots is a later central pass.
// The last two rows are upstream's separate `FROSTVEIL_QUEST_CAMPS`, the
// terrace howlers that back q_fv_howl_above; they stay at the tail so the
// merged array keeps upstream's draw order.
export const FROSTVEIL_CAMPS: CampDef[] = [
  { mobId: 'snowdrift_wolf', center: { x: 20, z: 1610 }, radius: 10, count: 3,
    positions: [{ x: 10.59, z: 1607.49 }, { x: 14.85, z: 1610.1 }, { x: 23.81, z: 1618.93 }] },
  { mobId: 'snowdrift_wolf', center: { x: -60, z: 1690 }, radius: 10, count: 3,
    positions: [{ x: -54.36, z: 1690.15 }, { x: -65.35, z: 1697.02 }, { x: -60.67, z: 1694.69 }] },
  { mobId: 'ice_wisp', center: { x: 30, z: 1745 }, radius: 12, count: 4,
    positions: [{ x: 25.42, z: 1742.13 }, { x: 37.36, z: 1747.93 }, { x: 30.96, z: 1751.43 }, { x: 39.23, z: 1743.19 }] },
  { mobId: 'rime_elemental', center: { x: 66, z: 1622 }, radius: 9, count: 2,
    positions: [{ x: 67.66, z: 1629.94 }, { x: 73.97, z: 1619.42 }] },
  { mobId: 'rime_elemental', center: { x: 10, z: 1800 }, radius: 10, count: 2,
    positions: [{ x: 17.11, z: 1796.24 }, { x: 1.41, z: 1799.32 }] },
  { mobId: 'fen_sprite', center: { x: -84, z: 1738 }, radius: 11, count: 3,
    positions: [{ x: -92.72, z: 1741.83 }, { x: -84.42, z: 1740.71 }, { x: -91.02, z: 1732.69 }] },
  { mobId: 'frostmane_yeti', center: { x: 96, z: 1816 }, radius: 6, count: 1,
    positions: [{ x: 92.09, z: 1814.6 }] },
  { mobId: 'terrace_howler', center: { x: 112, z: 1800 }, radius: 10, count: 3,
    positions: [{ x: 111.68, z: 1808.9 }, { x: 116.77, z: 1806.19 }, { x: 117.91, z: 1805.98 }] },
  { mobId: 'terrace_howler', center: { x: 84, z: 1830 }, radius: 9, count: 3,
    positions: [{ x: 87.17, z: 1836.77 }, { x: 77.89, z: 1826.21 }, { x: 89.03, z: 1822.88 }] },
];

export const FROSTVEIL_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'hearth_ember_cache',
    name: 'Ember Cache',
    // Scattered where the sledge overturned along the Icemantle to tarn road.
    positions: [
      { x: 8, z: 1598 },
      { x: 24, z: 1613 },
      { x: 38, z: 1623 },
    ],
  },
  {
    itemId: 'sprung_trap',
    name: 'Sprung Fen Trap',
    // Brosk's scattered trapline in the Shiverfen reeds.
    positions: [
      { x: -92, z: 1750 },
      { x: -98, z: 1764 },
      { x: -80, z: 1770 },
      { x: -72, z: 1756 },
    ],
  },
];

export const FROSTVEIL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Icemantle: a snug village ringing its firelit market plaza (the well and the
  // great fire at the centre, stalls and crates crowding in, homes and the lodge
  // shouldering close against the cold)
  buildings: [
    { kind: 'inn', x: -42, z: 1554, w: 6, d: 7, rot: 0.9 }, // the Hearth-Lodge
    { kind: 'house', x: -20, z: 1550, w: 6, d: 6, rot: -0.5 },
    { kind: 'house', x: -40, z: 1572, w: 6, d: 6, rot: 2.2 },
    { kind: 'chapel', x: -18, z: 1570, w: 5, d: 7, rot: -2.0 },
    { kind: 'house', x: -30, z: 1544, w: 5, d: 5, rot: 0.1 }, // the fisher's hut
    { kind: 'house', x: -44, z: 1563, w: 5, d: 5, rot: 1.4 },
    { kind: 'inn', x: -22, z: 1578, w: 5, d: 6, rot: -2.6 }, // the trade hall
  ],
  wells: [{ x: -30, z: 1562, r: 1.5 }],
  stalls: [
    { x: -24, z: 1556, rot: 0.6, r: 1.6 },
    { x: -36, z: 1566, rot: -1.2, r: 1.6 },
    { x: -34, z: 1554, rot: 2.1, r: 1.6 },
    { x: -25, z: 1568, rot: -0.4, r: 1.6 },
  ],
  crates: [
    [-27, 1558],
    [-33, 1565],
    [-23, 1562],
    [-38, 1558],
  ],
  fences: [
    { x1: -46, z1: 1546, x2: -38, z2: 1542 },
    { x1: -16, z1: 1558, x2: -14, z2: 1566 },
    { x1: -44, z1: 1578, x2: -36, z2: 1580 },
  ],
  tents: [
    { x: -12, z: 1500, rot: 0.4, scale: 1 }, // the Snowline waycamp
    { x: 34, z: 1746, rot: -1.8, scale: 1 }, // Aurorist Veyla's camp on the Steps
    { x: -80, z: 1742, rot: 2.4, scale: 1 }, // Trapper Brosk's fen camp
  ],
  campfires: [
    [-30, 1560],
    [-28, 1564], // the plaza's great fire is really two, for a wider glow
    [-11, 1498],
    [31, 1743], // the Aurorist reads the lights beside her fire
    [-83, 1746], // Brosk's camp
  ],
  // Upstream authors no `graveyards` cluster for this zone (the ZoneDef's
  // graveyard point still drives respawn), so none is invented here.
};
