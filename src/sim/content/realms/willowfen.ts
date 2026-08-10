// The Willowfen (levels 19-20), ported from upstream `src/sim/content/willowfen.ts`.
//
// A bright, gentle wetland in the WEST grid column beside the Mirefen Marsh:
// bog pools and lake-mazes with little islands, weeping willows trailing into
// the water, and the town of Bridgemere on its own island inside a ring moat,
// entered over the Fenway causeway. Walked into from the marsh over the
// Mirewalk (the border pass at eastPassZ 440).
//
// WHAT CHANGED FROM UPSTREAM, and why. Their rect, ids, level band, mobs,
// NPCs, quests, items, camps, objects and prose are taken verbatim except:
//   - `riftPortalEligible` / `riftTierWeights` are not fields of our ZoneDef.
//     Our rift rotation is DERIVED (`riftEligibleZones`, data.ts: any zone whose
//     level band reaches the cap), and this zone reaches 20, so it joins the
//     rotation anyway.
//   - POI records carry no `id` here; our `ZoneDef.pois` is `{x, z, label}`.
//   - `PortalDef` has no equivalent here and upstream's list is empty anyway.
//   - `MobTemplate.componentTags` and `ZonePropsDef.decorProps` are upstream
//     render/harvest fields we do not have, so they are dropped rather than
//     faked. The mobs' `family` is remapped onto our 11-member `MobFamily`
//     (mudfin -> murloc, burrower -> kobold); every value used here already has
//     a rig in `src/render/characters/`.
//   - DIRECTION WORDS ARE RE-DERIVED. Upstream writes +x as EAST; this world is
//     +z NORTH and +x WEST, so east is -x. Every compass word in player-visible
//     copy below was recomputed from the live coordinates through the HUD's own
//     bearing math and is pinned by `tests/realms_compass.test.ts`.
//
// Camps carry FROZEN exact `positions` (see WILLOWFEN_CAMPS below), so world
// generation draws no new rng at all and the whole pack is still tail-appended
// in data.ts: nothing shipped moves, and neither does the rng cursor.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

// The moat: a ring of overlapping carves around the Bridgemere island, with one
// gap at the south where the Fenway causeway crosses.
const MOAT: { x: number; z: number; radius: number }[] = [
  { x: -384, z: 336, radius: 11 },
  { x: -396, z: 361, radius: 11 },
  { x: -386, z: 387, radius: 11 },
  { x: -360, z: 398, radius: 11 },
  { x: -334, z: 387, radius: 11 },
  { x: -324, z: 361, radius: 11 },
  { x: -336, z: 336, radius: 11 },
];

export const WILLOWFEN_ZONE: ZoneDef = {
  id: 'willowfen',
  name: 'The Willowfen',
  zMin: 180,
  zMax: 700,
  xMin: -540,
  xMax: -180,
  levelRange: [19, 20],
  biome: 'fen',
  // The Mirewalk: the pass through this zone's HIGHER-x border, the shared edge
  // with the Mirefen Marsh. `eastPassZ`/`westPassZ` are the border-edge names
  // world.ts reads (higher-x / lower-x side), not compass words.
  eastPassZ: 440,
  hub: { x: -360, z: 362, radius: 20, name: 'Bridgemere' },
  graveyard: { x: -344, z: 306 },
  lakes: [
    ...MOAT,
    // the Lilymoors
    { x: -436, z: 286, radius: 13 },
    { x: -468, z: 304, radius: 11 },
    { x: -442, z: 330, radius: 11 },
    { x: -416, z: 310, radius: 9 },
    // Bogshine Pools
    { x: -290, z: 280, radius: 12 },
    { x: -268, z: 298, radius: 9 },
    { x: -302, z: 304, radius: 8 },
    // the Drowsy Flats
    { x: -336, z: 474, radius: 13 },
    { x: -302, z: 500, radius: 12 },
    { x: -332, z: 516, radius: 11 },
    { x: -426, z: 460, radius: 14 }, // Willowweep's pool
    { x: -444, z: 478, radius: 10 },
  ],
  pois: [
    { x: -360, z: 362, label: 'Bridgemere' },
    { x: -380, z: 208, label: 'The Amberfen Steps' },
    { x: -444, z: 308, label: 'The Lilymoors' },
    { x: -286, z: 292, label: 'Bogshine Pools' },
    { x: -430, z: 466, label: 'Willowweep' },
    { x: -320, z: 496, label: 'The Drowsy Flats' },
  ],
  welcome:
    'The fen hums with dragonflies and bees. Cross the bridge into Bridgemere and rest your feet awhile.',
  welcomeQuestId: 'q_wf_across_the_fenway',
};

export const WILLOWFEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: -372, z: 260 },
    { x: -360, z: 322 },
    { x: -360, z: 362 },
  ], // the Amberfen Steps to the Fenway causeway to Bridgemere
  // every spoke leaves over the causeway: the moat has ONE crossing
  [
    { x: -360, z: 324 },
    { x: -390, z: 300 },
    { x: -416, z: 296 },
  ], // the causeway to the Lilymoors' southern edge
  [
    { x: -360, z: 324 },
    { x: -326, z: 308 },
    { x: -312, z: 286 },
  ], // the causeway to Bogshine Pools' southern edge
  [
    { x: -360, z: 322 },
    { x: -404, z: 314 },
    { x: -418, z: 362 },
    { x: -416, z: 406 },
    { x: -412, z: 442 },
  ], // the causeway, wide around the moat's east side, to Willowweep's shore
  [
    { x: -360, z: 322 },
    { x: -332, z: 312 },
    { x: -306, z: 336 },
    { x: -308, z: 404 },
    { x: -330, z: 456 },
  ], // the causeway, around the moat's west side, to the Drowsy Flats' shore
  [
    { x: -412, z: 442 },
    { x: -404, z: 520 },
    { x: -396, z: 590 },
    { x: -394, z: 660 },
    { x: -398, z: 706 },
  ], // Willowweep's shore to the north fen and the Tanglemouth (meets the
  // Palmreach road, which starts 4yd past the shared border at z 706)
  [
    { x: -310, z: 396 },
    { x: -278, z: 418 },
    { x: -230, z: 434 },
    { x: -186, z: 440 },
  ], // the Drowsy Flats track, west over the moors, to the Mirewalk
];

// The fen's inhabitants: bogtoads gnaw the mooring ropes, wisps drift the pools
// at all hours, sprites tangle the eel nets, and the toad-king snores on his
// islet out on the Drowsy Flats.
export const WILLOWFEN_MOBS: Record<string, MobTemplate> = {
  bogtoad: {
    id: 'bogtoad',
    name: 'Bogtoad',
    minLevel: 19,
    maxLevel: 20,
    family: 'murloc', // upstream 'mudfin'
    hpBase: 56,
    hpPerLevel: 20,
    dmgBase: 11,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 8,
    aggroRadius: 12,
    canSwim: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'plump_fen_eel', chance: 0.6, questId: 'q_wf_eels_for_the_smokehouse' },
    ],
    scale: 1,
    color: 0x7aa848,
  },
  drowsy_croaker: {
    id: 'drowsy_croaker',
    name: 'The Drowsy Croaker',
    minLevel: 20,
    maxLevel: 20,
    family: 'murloc', // upstream 'mudfin'
    hpBase: 140,
    hpPerLevel: 34,
    dmgBase: 16,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 17,
    moveSpeed: 7.5,
    aggroRadius: 14,
    elite: true,
    canSwim: true,
    loot: [{ copper: 100, chance: 1 }],
    scale: 1.65,
    color: 0x5a9858,
  },
  lily_wisp: {
    id: 'lily_wisp',
    name: 'Lily Wisp',
    minLevel: 19,
    maxLevel: 19,
    family: 'elemental',
    hpBase: 44,
    hpPerLevel: 16,
    dmgBase: 8,
    dmgPerLevel: 2.0,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 7.5,
    aggroRadius: 0, // pale lights adrift over the pools
    loot: [
      { copper: 95, chance: 1 },
      { itemId: 'wisplight_globe', chance: 0.65, questId: 'q_wf_wisplight_charms' },
    ],
    scale: 0.7,
    color: 0xd0f2c8,
  },
  willow_sprite: {
    id: 'willow_sprite',
    name: 'Willow Sprite',
    minLevel: 19,
    maxLevel: 20,
    family: 'kobold', // upstream 'burrower'
    hpBase: 50,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 10,
    loot: [{ copper: 100, chance: 1 }],
    scale: 0.9,
    color: 0xc8e0b8,
  },
};

// The folk of the fen: a waykeeper watches the Amberfen Steps, the bridgewright
// and an eel-netter hold Bridgemere, and the fen-witch keeps her own company out
// at Willowweep. Sedge stands far from the hub on purpose: the chain sends
// players out to find her.
export const WILLOWFEN_NPCS: Record<string, NpcDef> = {
  waykeeper_pell: {
    id: 'waykeeper_pell',
    name: 'Waykeeper Pell',
    title: 'Keeper of the Amberfen Steps',
    pos: { x: -377, z: 214 },
    facing: 0.6,
    color: 0xa8b878,
    questIds: ['q_wf_across_the_fenway'],
    greeting: 'Down the Steps and into the soft country. Mind where you plant your boots.',
  },
  bridgewright_alden: {
    id: 'bridgewright_alden',
    name: 'Bridgewright Alden',
    title: 'Master of the Fenway',
    pos: { x: -359, z: 354 },
    facing: 2.9,
    color: 0x8a6f4d,
    questIds: [
      'q_wf_across_the_fenway',
      'q_wf_rope_chewers',
      'q_wf_mind_the_moorings',
      'q_wf_witch_of_willowweep',
    ],
    greeting: 'Every plank in this town is mine to keep, and the fen chews on all of them.',
  },
  netter_maris: {
    id: 'netter_maris',
    name: 'Netter Maris',
    title: 'Eel-Netter of Bridgemere',
    pos: { x: -354, z: 364 },
    facing: -0.8,
    color: 0x6f9aa0,
    questIds: ['q_wf_eels_for_the_smokehouse', 'q_wf_toll_and_tangle'],
    greeting: 'Smell that? Smoked eel. Half this town stands on stilts I bought with it.',
  },
  mother_sedge: {
    id: 'mother_sedge',
    name: 'Mother Sedge',
    title: 'Fen-Witch of Willowweep',
    pos: { x: -414, z: 446 },
    facing: 1.2,
    color: 0x7d8a5a,
    questIds: ['q_wf_witch_of_willowweep', 'q_wf_wisplight_charms', 'q_wf_croakers_hush'],
    greeting: 'The willows told me you were coming before your boots left the bridge.',
  },
};

export const WILLOWFEN_QUESTS: Record<string, QuestDef> = {
  q_wf_across_the_fenway: {
    id: 'q_wf_across_the_fenway',
    name: 'Across the Fenway',
    giverNpcId: 'waykeeper_pell',
    turnInNpcId: 'bridgewright_alden',
    text: 'A gentle country, the Willowfen, but gentle is not the same as safe, $N. Follow the road north to the Fenway causeway and cross into Bridgemere. Tell Bridgewright Alden the Steps are open and the waycamp fire is lit.',
    completionText:
      'Pell keeps that fire burning through every fog the fen can breathe at her. If she says the Steps are open, they are open. Welcome to Bridgemere, $N. Watch your step on my planks and we will get along fine.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'bridgewright_alden',
        count: 1,
        label: 'Report to Bridgewright Alden',
      },
    ],
    xpReward: 2600,
    copperReward: 950,
    itemRewards: {},
    minLevel: 18,
  },
  q_wf_rope_chewers: {
    id: 'q_wf_rope_chewers',
    name: 'The Rope-Chewers',
    giverNpcId: 'bridgewright_alden',
    turnInNpcId: 'bridgewright_alden',
    text: 'Bogtoads, $N. They haul up out of the moat at night and chew through my mooring ropes like they were reed stems. Three skiffs went drifting last week, and one of them had my good winch aboard. Thin them out, ten of the fat things, and the boats stay where we tie them.',
    completionText:
      'Ten fewer sets of teeth in my moat. The skiffs sat their moorings all night for the first time in a month, $N. You have the thanks of every netter in town.',
    objectives: [{ type: 'kill', targetMobId: 'bogtoad', count: 10, label: 'Bogtoad slain' }],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_wf_across_the_fenway',
  },
  q_wf_mind_the_moorings: {
    id: 'q_wf_mind_the_moorings',
    name: 'Mind the Moorings',
    giverNpcId: 'bridgewright_alden',
    turnInNpcId: 'bridgewright_alden',
    text: 'Good rope is dear out here, $N: every line the toads bite through is a week of eel-money gone. The cut ends are still lying along the moat shore where the boats slipped them. Walk the boardwalks and bring me back four lines, and I can splice them good as new.',
    completionText:
      'Look at that: clean bites, every one, but there is rope enough left to splice. You have saved me a month of coin and the netters a month of grumbling, $N.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'fenway_mooring_line',
        count: 4,
        label: 'Cut Mooring Line recovered',
      },
    ],
    xpReward: 4400,
    copperReward: 2100,
    itemRewards: {},
    requiresQuest: 'q_wf_across_the_fenway',
  },
  q_wf_eels_for_the_smokehouse: {
    id: 'q_wf_eels_for_the_smokehouse',
    name: 'Eels for the Smokehouse',
    giverNpcId: 'netter_maris',
    turnInNpcId: 'netter_maris',
    text: 'The bogtoads are not just eating my ropes, $N, they are eating my catch: they gulp the eels down whole, straight out of the traps. Cut six plump ones free of the greedy things before the meat spoils, and the smokehouse fires stay lit.',
    completionText:
      'Six good eels, barely bruised. The smokehouse will smell like money by morning. Here, these waders were mine when I was quicker: eelskin turns the wet like nothing else.',
    objectives: [{ type: 'collect', itemId: 'plump_fen_eel', count: 6, label: 'Plump Fen Eel' }],
    xpReward: 4400,
    copperReward: 2200,
    itemRewards: {
      warrior: 'eelskin_mudwaders',
      mage: 'eelskin_mudwaders',
      rogue: 'eelskin_mudwaders',
    },
    requiresQuest: 'q_wf_across_the_fenway',
  },
  q_wf_toll_and_tangle: {
    id: 'q_wf_toll_and_tangle',
    name: 'Toll and Tangle',
    giverNpcId: 'netter_maris',
    turnInNpcId: 'netter_maris',
    // "west track": the sunken toll-chests sit at x -324..-326 against
    // Bridgemere at x -360, i.e. +x, and +x is WEST here.
    text: 'The willow sprites think it is a fine game to cut a ferry loose, $N, and last week the toll skiff went over on the west track with a season of bridge-toll aboard. The chests went down in the shallows and the sprites dance on the boardwalks like they own them. Drive off eight and haul up three toll-chests, and Bridgemere eats this winter.',
    completionText:
      'Three chests, and the coin still dry inside. The sprites will sulk in the withies for a week, $N, and the town owes you its winter bread.',
    objectives: [
      { type: 'kill', targetMobId: 'willow_sprite', count: 8, label: 'Willow Sprite driven off' },
      {
        type: 'interact',
        targetObjectItemId: 'bridgemere_toll_chest',
        count: 3,
        label: 'Toll-Chest recovered',
      },
    ],
    xpReward: 5400,
    copperReward: 2800,
    itemRewards: {},
    requiresQuest: 'q_wf_eels_for_the_smokehouse',
    minLevel: 19,
  },
  q_wf_witch_of_willowweep: {
    id: 'q_wf_witch_of_willowweep',
    name: 'The Witch of Willowweep',
    giverNpcId: 'bridgewright_alden',
    turnInNpcId: 'mother_sedge',
    // "east around the moat": Alden stands at x -359 and Mother Sedge at
    // x -414, i.e. -x from him, and -x is EAST here.
    text: 'You have heard it by now, $N: the snore. Slow and heavy, out past the Drowsy Flats, like the fen itself turning over in its sleep. The toads, the sprites, the wisps burning at noon: it all started when that sound did. One soul might know what it is. Mother Sedge keeps a camp at Willowweep, east around the moat and down the far shore. Find her, and ask her what sleeps at the middle of my fen.',
    completionText:
      'Alden sent you all this way to ask about the snoring? Then the bridge-folk are finally listening. Sit down out of the damp, $N. That sound has a name, and a throat, and I have been waiting for someone fool enough to help me quiet it.',
    objectives: [
      { type: 'interact', targetNpcId: 'mother_sedge', count: 1, label: 'Find Mother Sedge' },
    ],
    xpReward: 2800,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_wf_rope_chewers',
    minLevel: 19,
  },
  q_wf_wisplight_charms: {
    id: 'q_wf_wisplight_charms',
    name: 'Wisplight Charms',
    giverNpcId: 'mother_sedge',
    turnInNpcId: 'mother_sedge',
    text: "The wisps over the pools are the fen dreaming out loud, $N, and their light is the only thing that holds against the Croaker's lull. I weave it into willow charms: one round your neck and the snore cannot drag your eyelids down. Bring me six wisplight globes. The wisps will not fight you for them, which makes it a kindness or a theft, depending on how you carry it.",
    completionText:
      'Six globes, still warm with dreaming. Give me till moonrise and I will have charms woven for you and whoever is brave enough to stand beside you.',
    objectives: [
      { type: 'collect', itemId: 'wisplight_globe', count: 6, label: 'Wisplight Globe' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_wf_witch_of_willowweep',
  },
  q_wf_croakers_hush: {
    id: 'q_wf_croakers_hush',
    name: "The Croaker's Hush",
    giverNpcId: 'mother_sedge',
    turnInNpcId: 'mother_sedge',
    text: "Now you know the snorer's name, $N: the Drowsy Croaker, the old toad-king out on the Drowsy Flats. Every year his croak grows heavier, and every year more of the fen forgets to wake. The charms will keep your eyes open, but his bulk is another matter: bring a friend, and do not fight him in the water. Put the old king to a quieter sleep.",
    completionText:
      'Listen, $N. Nothing. The first true silence over this fen in thirty years, and half the town will not sleep tonight for the strangeness of it. The willows say thank you, in their way. Wear this, woven from his own lily-bed, and the fen will know you for a friend wherever the water reaches.',
    objectives: [
      { type: 'kill', targetMobId: 'drowsy_croaker', count: 1, label: 'The Drowsy Croaker slain' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'lilybed_mantle',
      mage: 'lilybed_mantle',
      rogue: 'lilybed_mantle',
    },
    requiresQuest: 'q_wf_wisplight_charms',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

export const WILLOWFEN_QUEST_ORDER: string[] = [
  'q_wf_across_the_fenway',
  'q_wf_rope_chewers',
  'q_wf_eels_for_the_smokehouse',
  'q_wf_mind_the_moorings',
  'q_wf_witch_of_willowweep',
  'q_wf_toll_and_tangle',
  'q_wf_wisplight_charms',
  'q_wf_croakers_hush',
];

export const WILLOWFEN_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  plump_fen_eel: {
    id: 'plump_fen_eel',
    name: 'Plump Fen Eel',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_wf_eels_for_the_smokehouse',
  },
  wisplight_globe: {
    id: 'wisplight_globe',
    name: 'Wisplight Globe',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_wf_wisplight_charms',
  },
  fenway_mooring_line: {
    id: 'fenway_mooring_line',
    name: 'Cut Mooring Line',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_wf_mind_the_moorings',
    noVendorSell: true,
  },
  bridgemere_toll_chest: {
    id: 'bridgemere_toll_chest',
    name: 'Sunken Toll-Chest',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_wf_toll_and_tangle',
    noVendorSell: true,
  },
  // --- quest rewards ---
  eelskin_mudwaders: {
    id: 'eelskin_mudwaders',
    name: 'Eelskin Mudwaders',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'feet',
    quality: 'uncommon',
    stats: { armor: 60, sta: 3, spi: 2 },
    sellValue: 1000,
  },
  lilybed_mantle: {
    id: 'lilybed_mantle',
    name: 'Mantle of the Lily-Bed',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 76, sta: 6, spi: 4 },
    sellValue: 2400,
  },
};

// FROZEN SPAWN SPOTS. Upstream authored these as scatter camps (no `positions`),
// which draw world-gen rng and so move the post-worldgen rng cursor every
// seeded fixture in the suite reads from. The spots below ARE that scatter,
// captured once from the live world seed (20061) and frozen, so world
// generation now draws nothing for them: every shipped spawn AND the cursor
// itself stay bit-identical. Verified dry land at seeds 20061, 1337 and 42.
export const WILLOWFEN_CAMPS: CampDef[] = [
{ mobId: 'bogtoad', center: { x: -430, z: 270 }, radius: 10, count: 3,
    positions: [{ x: -432.5, z: 276.43 }, { x: -428.44, z: 277.4 }, { x: -437.45, z: 265.29 }] },
  { mobId: 'bogtoad', center: { x: -284, z: 316 }, radius: 10, count: 3,
    positions: [{ x: -282.54, z: 321.29 }, { x: -286.93, z: 321.63 }, { x: -289.43, z: 321.55 }] },
  { mobId: 'lily_wisp', center: { x: -426, z: 440 }, radius: 12, count: 4,
    positions: [{ x: -423.58, z: 442.51 }, { x: -420.15, z: 439.78 }, { x: -426.71, z: 431.58 }, { x: -416.2, z: 437 }] },
  { mobId: 'willow_sprite', center: { x: -396, z: 376 }, radius: 10, count: 3,
    positions: [{ x: -400.41, z: 373.76 }, { x: -398.28, z: 371.21 }, { x: -401.01, z: 379.51 }] },
  { mobId: 'willow_sprite', center: { x: -316, z: 380 }, radius: 10, count: 2,
    positions: [{ x: -318.9, z: 378.65 }, { x: -310.79, z: 377.65 }] },
  { mobId: 'drowsy_croaker', center: { x: -322, z: 496 }, radius: 5, count: 1,
    positions: [{ x: -321.87, z: 494.04 }] },
  { mobId: 'bogtoad', center: { x: -334, z: 436 }, radius: 10, count: 3,
    positions: [{ x: -336.24, z: 428.74 }, { x: -327.93, z: 440.81 }, { x: -331.07, z: 426.64 }] },
  { mobId: 'bogtoad', center: { x: -406, z: 288 }, radius: 10, count: 3,
    positions: [{ x: -405.59, z: 295.68 }, { x: -414.55, z: 288.58 }, { x: -396.79, z: 285.5 }] },
];

export const WILLOWFEN_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'fenway_mooring_line',
    name: 'Cut Mooring Line',
    positions: [
      { x: -348, z: 344 },
      { x: -338, z: 340 },
      { x: -372, z: 336 },
      { x: -384, z: 346 },
    ],
  },
  {
    itemId: 'bridgemere_toll_chest',
    name: 'Sunken Toll-Chest',
    positions: [
      { x: -324, z: 360 },
      { x: -320, z: 398 },
      { x: -326, z: 428 },
    ],
  },
];

export const WILLOWFEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Bridgemere: the island town inside the moat ring
  buildings: [
    { kind: 'inn', x: -370, z: 369, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: -350, z: 354, w: 6, d: 6, rot: -0.9 },
    { kind: 'house', x: -371, z: 349, w: 5, d: 5, rot: 2.4 },
    { kind: 'chapel', x: -351, z: 370, w: 5, d: 7, rot: -2.1 },
    { kind: 'house', x: -360, z: 375, w: 5, d: 5, rot: 0.1 },
  ],
  wells: [{ x: -356, z: 361, r: 1.5 }],
  stalls: [
    { x: -365, z: 359, rot: 0.5, r: 1.6 },
    { x: -352, z: 314, rot: -1.3, r: 1.6 }, // the gate market at the causeway approach
  ],
  crates: [
    [-368, 365],
    [-352, 358],
  ],
  campfires: [
    [-358, 366],
    [-379, 212], // the Steps' waycamp (Waykeeper Pell's fire)
    [-416, 449], // Mother Sedge's fire at Willowweep
  ],
  tents: [{ x: -411, z: 449, rot: 2.0, scale: 1 }],
  // the Fenway: rail fences flanking the causeway's south approach
  fences: [
    { x1: -364, z1: 325, x2: -364, z2: 336 },
    { x1: -356, z1: 325, x2: -356, z2: 336 },
  ],
  graveyards: [{ x: -344, z: 306 }],
};
