// The Amberfall (levels 18-20), ported from upstream `src/sim/content/amberfall.ts`.
//
// An eternal-autumn weald in the WEST grid column: fire-colored forests under a
// honey-gold sky, harvest meadows, and the Great Mere at its heart, ringed by
// the lantern town of Lanternmere. Walked into over the Goldmelt, the southern
// pass where the snow road melts mile by mile into gold (southPassX -350).
//
// WHAT CHANGED FROM UPSTREAM, and why. Their rect, ids, level band, mobs, NPCs,
// quests, items, camps, objects and prose are taken verbatim except:
//   - `riftPortalEligible` / `riftTierWeights` are not fields of our ZoneDef.
//     Our rift rotation is DERIVED (`riftEligibleZones`, data.ts: any zone whose
//     level band reaches the cap), and this zone reaches 20, so it joins the
//     rotation anyway.
//   - POI records carry no `id` here; our `ZoneDef.pois` is `{x, z, label}`.
//   - `PortalDef` has no equivalent here, and upstream's `AMBERFALL_PORTALS` is
//     empty anyway: the Amberfall is walked into, never portalled into. The
//     export and its prose banner are dropped rather than faked.
//   - `MobTemplate.componentTags` is an upstream corpse-harvest surface we do
//     not have (it rode on `gilded_stag` and `gloam_fox`), so it is dropped.
//     The mobs' `family` is remapped onto our 11-member `MobFamily` (mudfin ->
//     murloc, burrower -> kobold); every value used here already has a rig in
//     `src/render/characters/`, so this pack adds no new art.
//   - Upstream's separate `AMBERFALL_QUEST_CAMPS` export (the Meredark's lone
//     jetty camp) is folded in as the LAST entry of `AMBERFALL_CAMPS`, keeping
//     its tail position in the merged array.
//   - DIRECTION WORDS ARE RE-DERIVED. Upstream writes +x as EAST; this world is
//     +z NORTH and +x WEST, so east is -x. Every compass word in player-visible
//     copy below was recomputed from the live coordinates, with the derivation
//     cited at the site. Four of upstream's own authoring comments were wrong on
//     their own axes too (both Mere ring roads, the ferry-lantern shore and the
//     Meredark's jetty); those are corrected here with the same citation.
//
// Camps are authored as upstream wrote them: scatter camps with center/radius/
// count and no `positions`. Freezing them to exact spots (the rng-cursor rule
// this pack holds itself to, see ./CLAUDE.md) is a later central pass.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const AMBERFALL_ZONE: ZoneDef = {
  id: 'amberfall',
  name: 'The Amberfall',
  zMin: 1820,
  zMax: 2380,
  xMin: -540,
  xMax: -180,
  levelRange: [18, 20],
  biome: 'amber',
  // The Goldmelt: the old gold road up through this zone's SOUTHERN border
  // ridge, where the snow country ends and the weald begins.
  southPassX: -350,
  // The pass through this zone's HIGHER-x border, the shared vertical edge with
  // the neighbouring column. `eastPassZ`/`westPassZ` are the border-edge names
  // world.ts reads (higher-x / lower-x side), not compass words. Upstream's own
  // comment called this one "the Goldmelt" as well, but the Goldmelt shrine and
  // its waywatcher sit on the southern crossing at z 1820, not on this edge.
  eastPassZ: 1890,
  hub: { x: -360, z: 2072, radius: 24, name: 'Lanternmere' },
  graveyard: { x: -336, z: 2050 },
  lakes: [
    { x: -360, z: 2132, radius: 26 }, // the Great Mere
    // ...its reeded WEST reach (x -332 against the Mere's x -360, i.e. +x, and
    // +x is WEST here; upstream called it "eastern")
    { x: -332, z: 2146, radius: 14 },
    // ...and its willow-shaded EAST arm (x -390, i.e. -x, and -x is EAST here;
    // upstream called it "west")
    { x: -390, z: 2144, radius: 13 },
    { x: -444, z: 2002, radius: 10 }, // the Orchard Pool
    { x: -264, z: 2246, radius: 9 }, // the Monolith tarn
  ],
  pois: [
    { x: -360, z: 2072, label: 'Lanternmere' },
    { x: -350, z: 1848, label: 'The Goldmelt' },
    { x: -432, z: 1992, label: 'The Gilded Orchard' },
    { x: -290, z: 1960, label: 'Harvest Hollow' },
    { x: -360, z: 2132, label: 'The Great Mere' },
    { x: -430, z: 2210, label: 'Cindermaple Rise' },
    { x: -276, z: 2230, label: 'The Leaning Monolith' },
  ],
  welcome:
    'Every leaf here burns gold and red, yet none ever fall. The lanterns of Lanternmere are lit for you.',
  welcomeQuestId: 'q_af_goldmelt_road',
};

export const AMBERFALL_ROADS: { x: number; z: number }[][] = [
  [
    { x: -350, z: 1822 },
    { x: -366, z: 1880 },
    { x: -374, z: 2030 },
    { x: -360, z: 2072 },
  ], // the Goldmelt pass to Lanternmere
  [
    { x: -372, z: 2050 },
    { x: -410, z: 2020 },
    { x: -432, z: 1994 },
  ], // Lanternmere to the Gilded Orchard's edge
  [
    { x: -348, z: 2050 },
    { x: -315, z: 2000 },
    { x: -290, z: 1960 },
  ], // Lanternmere to Harvest Hollow
  [
    { x: -374, z: 2090 },
    { x: -418, z: 2146 },
    { x: -430, z: 2210 },
  ], // Lanternmere to Cindermaple Rise, EAST of the Mere (upstream wrote "west":
  // the road runs x -418 against the Mere's x -360, i.e. -x, and -x is EAST here)
  [
    { x: -344, z: 2092 },
    { x: -292, z: 2156 },
    { x: -272, z: 2226 },
  ], // Lanternmere to the Leaning Monolith, WEST of the Mere (upstream wrote
  // "east": the road runs x -292 against the Mere's x -360, i.e. +x, and +x is WEST)
  [
    { x: -374, z: 2090 },
    { x: -404, z: 2108 },
    { x: -412, z: 2180 },
    { x: -384, z: 2250 },
    { x: -380, z: 2300 },
  ], // Lanternmere, EAST around the Mere (x -412 against x -360, i.e. -x), to the
  // north shore (z 2300 against the Mere's z 2132, i.e. +z, and +z is NORTH)
];

// The beasts and the folk of the weald: gilded stags graze the gold meadows and
// carry sap-amber in their coats, gloam foxes raid the lantern stores, harvest
// sprites strip the orchard's sap-taps, treants keep the old rows, and the
// lurkers of the Great Mere are being driven up out of the deep water by
// something older than any of them.
export const AMBERFALL_MOBS: Record<string, MobTemplate> = {
  gilded_stag: {
    id: 'gilded_stag',
    name: 'Gilded Stag',
    minLevel: 18,
    maxLevel: 19,
    family: 'beast',
    hpBase: 54,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 9,
    aggroRadius: 0, // grazes the gold meadows, fights only if pressed
    loot: [{ itemId: 'gilded_sap_clot', chance: 0.6, questId: 'q_af_amber_from_the_herd' }],
    scale: 1.15,
    color: 0xd8a848,
  },
  gloam_fox: {
    id: 'gloam_fox',
    name: 'Gloam Fox',
    minLevel: 18,
    maxLevel: 18,
    family: 'beast',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 9,
    dmgPerLevel: 2.0,
    attackSpeed: 1.8,
    armorPerLevel: 10,
    moveSpeed: 9.5,
    aggroRadius: 0,
    loot: [{ copper: 90, chance: 1 }],
    scale: 1,
    color: 0xd87838,
  },
  orchard_treant: {
    id: 'orchard_treant',
    name: 'Orchard Treant',
    minLevel: 19,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 110,
    hpPerLevel: 28,
    dmgBase: 14,
    dmgPerLevel: 2.6,
    attackSpeed: 2.6,
    armorPerLevel: 16,
    moveSpeed: 6.5,
    aggroRadius: 0, // ancient and calm, until an axe is raised
    elite: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'tangled_weed', chance: 0.4 },
    ],
    scale: 1.4,
    color: 0xc89838,
  },
  harvest_sprite: {
    id: 'harvest_sprite',
    name: 'Harvest Sprite',
    minLevel: 18,
    maxLevel: 19,
    family: 'kobold', // upstream 'burrower'
    hpBase: 48,
    hpPerLevel: 17,
    dmgBase: 10,
    dmgPerLevel: 2.1,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 11, // orchard thieves, and territorial about it
    loot: [{ copper: 95, chance: 1 }],
    scale: 0.85,
    color: 0xe8c878,
  },
  mere_lurker: {
    id: 'mere_lurker',
    name: 'Mere Lurker',
    minLevel: 19,
    maxLevel: 20,
    family: 'murloc', // upstream 'mudfin'
    hpBase: 58,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 2.0,
    armorPerLevel: 13,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'mudfin_scale', chance: 0.4 },
    ],
    scale: 1.1,
    color: 0xa8b048,
  },
  // The Meredark: the first lurker, old as the lake and twice as patient
  // (q_af_the_meredark). Suns itself on the drowned jetty on the Great Mere's
  // NORTH shore at dusk (upstream wrote "south": its camp sits at z 2186
  // against the Mere's z 2132, i.e. +z, and +z is NORTH here). Named elite,
  // deliberately not rare.
  the_meredark: {
    id: 'the_meredark',
    name: 'The Meredark',
    minLevel: 20,
    maxLevel: 20,
    family: 'murloc', // upstream 'mudfin'
    hpBase: 120,
    hpPerLevel: 30,
    dmgBase: 15,
    dmgPerLevel: 2.8,
    attackSpeed: 2.4,
    armorPerLevel: 16,
    moveSpeed: 8,
    aggroRadius: 16,
    elite: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'mudfin_scale', chance: 1 },
    ],
    scale: 1.6,
    color: 0x5a7038,
  },
};

// The folk of the Amberfall: the Reeve holds Lanternmere, a waywatcher keeps
// the Goldmelt shrine at the zone door, the Ferrymaster works the Mere jetty
// above the town, and the Orchardist tends the Gilded Orchard alone on the
// orchard road. Two of them stand far from the hub on purpose: the chains send
// players out to find them.
export const AMBERFALL_NPCS: Record<string, NpcDef> = {
  reeve_ottoline: {
    id: 'reeve_ottoline',
    name: 'Reeve Ottoline',
    title: 'Reeve of Lanternmere',
    pos: { x: -358, z: 2070 },
    facing: -0.6,
    color: 0xc08848,
    questIds: ['q_af_goldmelt_road', 'q_af_foxes_in_the_lamplight', 'q_af_orchard_call'],
    greeting: 'Welcome to Lanternmere, where the harvest never ends and neither does the work.',
  },
  waywatcher_sorrel: {
    id: 'waywatcher_sorrel',
    name: 'Waywatcher Sorrel',
    title: 'Watcher of the Goldmelt',
    pos: { x: -351, z: 1846 },
    facing: 2.8,
    color: 0x9a7d5a,
    questIds: ['q_af_goldmelt_road'],
    greeting:
      'Snow behind you, gold ahead. Few walk the Goldmelt twice, so make the crossing count.',
  },
  ferrymaster_caddow: {
    id: 'ferrymaster_caddow',
    name: 'Ferrymaster Caddow',
    title: 'Keeper of the Lantern Ferries',
    pos: { x: -356, z: 2098 },
    facing: 0.2,
    color: 0x6a7d8a,
    questIds: ['q_af_lanterns_on_the_water', 'q_af_what_took_the_moorings', 'q_af_the_meredark'],
    greeting:
      'Fog is on the Mere again. When the lanterns go out on the water, wise folk stay ashore.',
  },
  orchardist_pomeline: {
    id: 'orchardist_pomeline',
    name: 'Orchardist Pomeline',
    title: 'Keeper of the Gilded Rows',
    pos: { x: -428, z: 1996 },
    facing: 1.2,
    color: 0x8a9a4a,
    questIds: ['q_af_orchard_call', 'q_af_sprites_and_spigots', 'q_af_amber_from_the_herd'],
    greeting:
      'Mind where you step. Every root in these rows is older than the town, and they remember.',
  },
};

export const AMBERFALL_QUESTS: Record<string, QuestDef> = {
  q_af_goldmelt_road: {
    id: 'q_af_goldmelt_road',
    name: 'The Gold Road Down',
    giverNpcId: 'waywatcher_sorrel',
    turnInNpcId: 'reeve_ottoline',
    text: 'You came over the Goldmelt, $N, snow still on your boots. I keep this shrine so Lanternmere knows who walks in from the cold, and lately I have had little to report. Take the gold road down to the town, find Reeve Ottoline by the well, and tell her the pass is quiet.',
    completionText:
      'Quiet on the Goldmelt, and a traveler with snow in their hair to prove it. Sorrel keeps her watch too well to send idle word. Be welcome in Lanternmere, $N. The lanterns burn for you.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'reeve_ottoline',
        count: 1,
        label: 'Report to Reeve Ottoline',
      },
    ],
    xpReward: 2400,
    copperReward: 900,
    itemRewards: {},
    minLevel: 17,
  },
  q_af_foxes_in_the_lamplight: {
    id: 'q_af_foxes_in_the_lamplight',
    name: 'Foxes in the Lamplight',
    giverNpcId: 'reeve_ottoline',
    turnInNpcId: 'reeve_ottoline',
    text: 'The gloam foxes have learned what the lantern stores are worth, $N. Every dusk they slip the fences and carry off the tallow we press for the ferry lamps. Soft paws, softer conscience. Cull ten of them and the rest will remember to fear the town.',
    completionText:
      'Ten, and the stores went untouched last night for the first time this season. The lamplighters send their thanks, $N.',
    objectives: [{ type: 'kill', targetMobId: 'gloam_fox', count: 10, label: 'Gloam Fox slain' }],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {},
    requiresQuest: 'q_af_goldmelt_road',
  },
  q_af_orchard_call: {
    id: 'q_af_orchard_call',
    name: 'A Cart for the Orchard',
    giverNpcId: 'reeve_ottoline',
    turnInNpcId: 'orchardist_pomeline',
    // "west road" twice upstream: the Gilded Orchard sits at x -432, z 1992
    // against Lanternmere at x -360, z 2072, i.e. -x and -z. -x is EAST here and
    // -z is SOUTH, bearing 138 degrees, so the road runs SOUTHEAST.
    text: 'Orchardist Pomeline keeps the Gilded Orchard on the southeast road, and her sap carts are three days overdue. The whole town runs on that amber sap, $N: lamp resin, sweetening, the harvest ale. Walk the southeast road and find out what keeps her.',
    completionText:
      'The Reeve counts her carts, does she? Well, she can count them missing a while longer. Look at my rows, $N. I have greater troubles than a late delivery.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'orchardist_pomeline',
        count: 1,
        label: 'Find Orchardist Pomeline',
      },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_af_goldmelt_road',
    minLevel: 18,
  },
  q_af_sprites_and_spigots: {
    id: 'q_af_sprites_and_spigots',
    name: 'Sprites and Spigots',
    giverNpcId: 'orchardist_pomeline',
    turnInNpcId: 'orchardist_pomeline',
    text: 'Harvest sprites, $N. They pry my sap-taps from the trunks for the sweetness inside and fling the buckets into the grass. Drive off eight of the little thieves and bring back four of my buckets, and the carts roll again.',
    completionText:
      'Four buckets back on their hooks and the rows gone quiet. You have a heavier hand with sprites than I do, $N, and today I am glad of it.',
    objectives: [
      { type: 'kill', targetMobId: 'harvest_sprite', count: 8, label: 'Harvest Sprite driven off' },
      {
        type: 'interact',
        targetObjectItemId: 'amberfall_sap_bucket',
        count: 4,
        label: 'Sap-Tap Bucket recovered',
      },
    ],
    xpReward: 4800,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_af_orchard_call',
  },
  q_af_amber_from_the_herd: {
    id: 'q_af_amber_from_the_herd',
    name: 'Amber off the Herd',
    giverNpcId: 'orchardist_pomeline',
    turnInNpcId: 'orchardist_pomeline',
    text: 'The gilded stags bed down beneath my oldest trees, and the sap drips gold into their coats all night. Combed clots of it are the purest amber in the weald. Bring me six, $N. The stags will not thank you, but they will not miss it either.',
    completionText:
      'Six clots, clean as poured honey. These gloves are stitched with the last batch, $N: sap-stiffened, and warmer than they look.',
    objectives: [
      { type: 'collect', itemId: 'gilded_sap_clot', count: 6, label: 'Gilded Sap Clot' },
    ],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {
      warrior: 'orchard_sapbinder_grips',
      mage: 'orchard_sapbinder_grips',
      rogue: 'orchard_sapbinder_grips',
    },
    requiresQuest: 'q_af_orchard_call',
  },
  q_af_lanterns_on_the_water: {
    id: 'q_af_lanterns_on_the_water',
    name: 'Lanterns on the Water',
    giverNpcId: 'ferrymaster_caddow',
    turnInNpcId: 'ferrymaster_caddow',
    // "east shore" upstream: the washed-up lanterns lie at x -338, -320 and -300
    // against the Great Mere's x -360, i.e. +x, and +x is WEST here (mean
    // bearing 260 degrees from the Mere's centre).
    text: 'Every ferry on the Mere carries a stern lantern, $N, and three of my boats came back at dawn without theirs. The fog took them, or something in the fog did. They wash up along the west shore when the wind turns. Walk the shore road and bring my lanterns home.',
    completionText:
      'All three, and still burning. Ferry lanterns do not go out in water, $N. That is the point of them. What worries me is what pulled them loose.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'mere_ferry_lantern',
        count: 3,
        label: 'Ferry Lantern recovered',
      },
    ],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {},
    requiresQuest: 'q_af_goldmelt_road',
  },
  q_af_what_took_the_moorings: {
    id: 'q_af_what_took_the_moorings',
    name: 'What Took the Moorings',
    giverNpcId: 'ferrymaster_caddow',
    turnInNpcId: 'ferrymaster_caddow',
    text: 'Now I will tell you what I did not say in front of the town. The moorings were not slipped, they were bitten through. Mere lurkers, bolder every night, dragging at the ropes and the rudders. Put eight of them back under the water for good, $N, before a ferryman goes with them.',
    completionText:
      'Eight fewer shapes in the shallows, and the crossing ran on time today for the first time in a fortnight. But bold lurkers are driven lurkers, $N. Something beneath the Mere is moving them.',
    objectives: [
      { type: 'kill', targetMobId: 'mere_lurker', count: 8, label: 'Mere Lurker slain' },
    ],
    xpReward: 4600,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_af_lanterns_on_the_water',
    minLevel: 18,
  },
  q_af_the_meredark: {
    id: 'q_af_the_meredark',
    name: 'The Meredark',
    giverNpcId: 'ferrymaster_caddow',
    turnInNpcId: 'ferrymaster_caddow',
    // "south shore" upstream: the jetty camp sits at x -358, z 2186 against the
    // Great Mere's x -360, z 2132, i.e. +z with almost no x offset, bearing 358
    // degrees, and +z is NORTH here. The far shore from Lanternmere, which sits
    // at z 2072 on the Mere's south side.
    text: 'The old ferrymen have a name they only say ashore: the Meredark, the first lurker, old as the lake and twice as patient. It rose once before, the year the drowned jetty went under, and it is rising now. At dusk it suns itself on the jetty ruin off the north shore, $N. Take a friend, take two, and end it while it can still be ended.',
    completionText:
      'The fog lifted off the Mere this morning, $N, and the whole town saw it. The ferries will run the night crossing again, and every lantern on the water will burn in your name. Take this: it was dredged from the drowned jetty, and no one has better right to wear it.',
    objectives: [
      { type: 'kill', targetMobId: 'the_meredark', count: 1, label: 'The Meredark slain' },
    ],
    xpReward: 6000,
    copperReward: 3600,
    itemRewards: {
      warrior: 'mantle_of_the_meredark',
      mage: 'mantle_of_the_meredark',
      rogue: 'mantle_of_the_meredark',
    },
    requiresQuest: 'q_af_what_took_the_moorings',
    minLevel: 19,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (not strictly chain order), matching the
// Veiled Hollow convention.
export const AMBERFALL_QUEST_ORDER: string[] = [
  'q_af_goldmelt_road',
  'q_af_foxes_in_the_lamplight',
  'q_af_lanterns_on_the_water',
  'q_af_orchard_call',
  'q_af_amber_from_the_herd',
  'q_af_what_took_the_moorings',
  'q_af_sprites_and_spigots',
  'q_af_the_meredark',
];

export const AMBERFALL_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  gilded_sap_clot: {
    id: 'gilded_sap_clot',
    name: 'Gilded Sap Clot',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_amber_from_the_herd',
  },
  amberfall_sap_bucket: {
    id: 'amberfall_sap_bucket',
    name: 'Sap-Tap Bucket',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_sprites_and_spigots',
    noVendorSell: true,
  },
  mere_ferry_lantern: {
    id: 'mere_ferry_lantern',
    name: 'Ferry Lantern',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_af_lanterns_on_the_water',
    noVendorSell: true,
  },
  // --- quest rewards ---
  orchard_sapbinder_grips: {
    id: 'orchard_sapbinder_grips',
    name: 'Sapbinder Grips',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'gloves',
    quality: 'uncommon',
    stats: { armor: 54, sta: 4, int: 3 },
    sellValue: 950,
  },
  mantle_of_the_meredark: {
    id: 'mantle_of_the_meredark',
    name: 'Mantle of the Meredark',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 74, sta: 6, spi: 4 },
    sellValue: 2300,
  },
};

// Upstream's scatter camps, verbatim: center/radius/count and no `positions`.
export const AMBERFALL_CAMPS: CampDef[] = [
  { mobId: 'gilded_stag', center: { x: -300, z: 1976 }, radius: 12, count: 3,
    positions: [{ x: -292.95, z: 1968.58 }, { x: -309.67, z: 1971.28 }, { x: -293.92, z: 1966.16 }] },
  { mobId: 'gilded_stag', center: { x: -420, z: 2020 }, radius: 11, count: 2,
    positions: [{ x: -419.08, z: 2019.89 }, { x: -410.34, z: 2024.96 }] },
  { mobId: 'gloam_fox', center: { x: -330, z: 2030 }, radius: 10, count: 2,
    positions: [{ x: -331.37, z: 2025.61 }, { x: -327.92, z: 2032.54 }] },
  { mobId: 'harvest_sprite', center: { x: -436, z: 1984 }, radius: 10, count: 3,
    positions: [{ x: -437.01, z: 1975.38 }, { x: -439.87, z: 1985.32 }, { x: -436.73, z: 1985.68 }] },
  { mobId: 'orchard_treant', center: { x: -426, z: 2202 }, radius: 9, count: 2,
    positions: [{ x: -427.69, z: 2203.59 }, { x: -429.41, z: 2204.51 }] },
  { mobId: 'mere_lurker', center: { x: -312, z: 2158 }, radius: 8, count: 2,
    positions: [{ x: -314.29, z: 2151.1 }, { x: -317.84, z: 2158.37 }] },
  { mobId: 'mere_lurker', center: { x: -282, z: 2226 }, radius: 8, count: 2,
    positions: [{ x: -275.16, z: 2224.77 }, { x: -284.3, z: 2223.43 }] },
  // The quest camp (upstream's separate AMBERFALL_QUEST_CAMPS): the Meredark on
  // the drowned jetty off the Great Mere's north shore, well off both shore
  // roads. Camps draw world-gen rng in array order, so it stays LAST here to
  // keep the tail position upstream gave it.
  { mobId: 'the_meredark', center: { x: -358, z: 2186 }, radius: 6, count: 1,
    positions: [{ x: -360.7, z: 2182.22 }] },
];

export const AMBERFALL_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'amberfall_sap_bucket',
    name: 'Sap-Tap Bucket',
    // Flung into the grass by harvest sprites, around the Gilded Orchard's
    // rows and the orchard road.
    positions: [
      { x: -424, z: 2000 },
      { x: -438, z: 1986 },
      { x: -450, z: 2014 },
      { x: -414, z: 2014 },
    ],
  },
  {
    itemId: 'mere_ferry_lantern',
    name: 'Ferry Lantern',
    // Washed up along the Mere's WEST shore, near the Monolith road (upstream
    // wrote "east": these lie at x -338 to -300 against the Mere's x -360, i.e.
    // +x, and +x is WEST here).
    positions: [
      { x: -338, z: 2102 },
      { x: -320, z: 2124 },
      { x: -300, z: 2148 },
    ],
  },
];

export const AMBERFALL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Lanternmere: an autumn market town on the Mere's SOUTH shore (upstream wrote
  // "north": the town sits at z 2072 against the Mere's z 2132, i.e. -z, and -z
  // is SOUTH here)
  buildings: [
    { kind: 'inn', x: -372, z: 2066, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: -348, z: 2062, w: 6, d: 6, rot: -0.8 },
    { kind: 'house', x: -374, z: 2084, w: 6, d: 6, rot: 2.0 },
    { kind: 'chapel', x: -346, z: 2082, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: -360, z: 2074, r: 1.5 }],
  stalls: [
    { x: -354, z: 2068, rot: 0.4, r: 1.6 },
    { x: -366, z: 2080, rot: -1.4, r: 1.6 },
  ],
  fences: [
    { x1: -378, z1: 2058, x2: -368, z2: 2054 },
    { x1: -352, z1: 2088, x2: -342, z2: 2090 },
  ],
  // the Goldmelt shrine: column rings flanking the pass, statue-lined, so
  // the crossing reads as a gilded threshold between snow and autumn
  ruinRings: [
    { x: -338, z: 1852, ringR: 7, columns: 6 },
    { x: -364, z: 1838, ringR: 5, columns: 5 },
    { x: -350, z: 1872, ringR: 4, columns: 4 },
  ],
  campfires: [
    [-360, 2068],
    [-352, 1845],
    [-338, 1852],
    [-364, 1838],
  ],
};
