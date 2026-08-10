// The Palmreach (level 20), ported from upstream `src/sim/content/palmreach.ts`.
//
// North past the Willowfen the road spills out of the Tanglemouth onto hot
// white sand: a tropical realm of flat coral beaches ringed with palms, a
// jungle interior so green it eats the horizon, and the turquoise Sapphire
// Lagoon cupped in one arm. The beach village of Drifthaven keeps its fires lit
// on the strand. Entered over the Tanglemouth (southPassX -400) from the fen,
// or over the Sunway (eastPassZ 820) off the Thornpeak heights.
//
// See ./willowfen.ts and ./CLAUDE.md for what this port drops from upstream and
// why. TWO PALMREACH-SPECIFIC DROPS:
//   - `q_pr_the_lost_navigator` is an ESCORT quest. We have no escort system
//     (`EscortDef`, `objectives[].type: 'escort'`, `src/sim/escort.ts` are all
//     upstream-only), so the quest, its escortee mob `castaway_navigator` and
//     its reward `saltwalker_sandals` are NOT ported rather than reshaped into
//     something upstream never wrote. The rest of Ryna's chain is unaffected:
//     nothing else requires it.
//   - `ZonePropsDef.greatTrees` (the banyan trunk colliders) has no equivalent
//     here, so the Vinefall banyans are absent and Okku stands in the open.
//
// Direction words in player copy are re-derived for this world (+z NORTH,
// +x WEST) and pinned by `tests/realms_compass.test.ts`.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const PALMREACH_ZONE: ZoneDef = {
  id: 'palmreach',
  name: 'The Palmreach',
  zMin: 700,
  zMax: 1260,
  xMin: -540,
  xMax: -180,
  levelRange: [20, 20],
  biome: 'jungle',
  southPassX: -400, // the Tanglemouth: up from the fen into the green
  eastPassZ: 820, // the Sunway: off the heights, down into the sun
  hub: { x: -300, z: 820, radius: 16, name: 'Drifthaven' },
  graveyard: { x: -318, z: 802 },
  lakes: [
    { x: -270, z: 950, radius: 15 }, // the Sapphire Lagoon
    { x: -380, z: 1000, radius: 10 }, // the jungle pool
    { x: -336, z: 1158, radius: 11 }, // the northern tarn
  ],
  pois: [
    { x: -300, z: 820, label: 'Drifthaven' },
    { x: -420, z: 732, label: 'The Tanglemouth' },
    { x: -460, z: 890, label: 'The Palmstrand' },
    { x: -360, z: 980, label: 'The Emerald Tangle' },
    { x: -400, z: 1080, label: 'The Vinefall' },
    { x: -270, z: 950, label: 'The Sapphire Lagoon' },
    { x: -256, z: 1090, label: 'The Sunken Idol' },
  ],
  welcome:
    'Warm sand, loud birds, and a jungle that eats the horizon. Drifthaven keeps a fire lit on the beach for you.',
  welcomeQuestId: 'q_pr_down_to_drifthaven',
};

export const PALMREACH_ROADS: { x: number; z: number }[][] = [
  [
    { x: -402, z: 706 },
    { x: -400, z: 752 },
    { x: -356, z: 790 },
    { x: -300, z: 820 },
  ], // the Tanglemouth, along the shore, to Drifthaven
  [
    { x: -300, z: 820 },
    { x: -360, z: 860 },
    { x: -420, z: 880 },
    { x: -452, z: 888 },
  ], // Drifthaven to the Palmstrand
  [
    { x: -300, z: 820 },
    { x: -326, z: 900 },
    { x: -350, z: 964 },
  ], // Drifthaven to the Emerald Tangle
  [
    { x: -350, z: 964 },
    { x: -378, z: 1030 },
    { x: -396, z: 1070 },
  ], // the Tangle to the Vinefall
  [
    { x: -300, z: 820 },
    { x: -276, z: 890 },
    { x: -242, z: 928 },
    { x: -238, z: 1018 },
    { x: -256, z: 1072 },
  ], // Drifthaven, around the Lagoon, to the Sunken Idol
  [
    { x: -256, z: 1072 },
    { x: -274, z: 1142 },
    { x: -296, z: 1196 },
    { x: -318, z: 1236 },
    { x: -330, z: 1254 },
  ], // the Sunken Idol up the north cape
  [
    { x: -242, z: 928 },
    { x: -212, z: 874 },
    { x: -186, z: 822 },
  ], // the lagoon road down the Sunway, onto the Thornpeak heights
];

// The Palmreach's inhabitants: crabs work the tide line, boars root the
// thickets, weavers curtain the canopy in web, and the Guardian stands its
// drowned ring at the Sunken Idol.
export const PALMREACH_MOBS: Record<string, MobTemplate> = {
  tide_scuttler: {
    id: 'tide_scuttler',
    name: 'Tide Scuttler',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 54,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 14, // shell
    moveSpeed: 7,
    aggroRadius: 8, // beach crabs mind their tidepools
    loot: [{ copper: 105, chance: 1 }],
    scale: 1.15,
    color: 0xe86848,
  },
  thicket_boar: {
    id: 'thicket_boar',
    name: 'Thicket Boar',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 11,
    loot: [{ copper: 105, chance: 1 }],
    scale: 1.2,
    color: 0x6a4e38,
  },
  canopy_weaver: {
    id: 'canopy_weaver',
    name: 'Canopy Weaver',
    minLevel: 20,
    maxLevel: 20,
    family: 'spider',
    hpBase: 56,
    hpPerLevel: 19,
    dmgBase: 12,
    dmgPerLevel: 2.3,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 12,
    loot: [
      { copper: 105, chance: 1 },
      { itemId: 'spider_leg', chance: 0.4 },
      { itemId: 'canopy_silk_hank', chance: 0.6, questId: 'q_pr_canopy_silk' },
    ],
    scale: 1.25,
    color: 0x4e8a3c,
  },
  idol_guardian: {
    id: 'idol_guardian',
    name: 'The Idol Guardian',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 150,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 18, // carved stone
    moveSpeed: 7,
    aggroRadius: 14,
    elite: true,
    // Carved stone walking its own drowned ring: every movement step passes
    // straight through the toppled relics at the ring's heart (the same knob
    // Thunzharr uses in zone3.ts). Without it the Guardian wedges on the ruin
    // ring colliders just outside its reach and never swings.
    phasesThroughObstacles: true,
    loot: [{ copper: 100, chance: 1 }],
    scale: 1.5,
    color: 0x9aa87e,
  },
};

// The folk of the strand: a watcher keeps the Tanglemouth waycamp, the
// salvage-boss and the Pearl-Mother hold Drifthaven, and one hermit camps alone
// at the Vinefall, the only local who ever walked toward the drums.
export const PALMREACH_NPCS: Record<string, NpcDef> = {
  strandwatcher_pell: {
    id: 'strandwatcher_pell',
    name: 'Strandwatcher Pell',
    title: 'Watcher of the Tanglemouth',
    pos: { x: -416, z: 722 },
    facing: 1.0,
    color: 0xc9b07a,
    questIds: ['q_pr_down_to_drifthaven'],
    greeting:
      'Out of the black trees at last. Breathe, stranger, the sun holds this side of the pass.',
  },
  salvage_boss_ryna: {
    id: 'salvage_boss_ryna',
    name: 'Salvage-Boss Ryna',
    title: 'Mistress of the Wreck Line',
    pos: { x: -296, z: 816 },
    facing: -0.8,
    color: 0xb46a3c,
    questIds: ['q_pr_down_to_drifthaven', 'q_pr_wreck_line_cargo', 'q_pr_scuttler_cull'],
    greeting:
      'A $C with working arms, good. The wreck line pays well, if the crabs leave you enough fingers to count it.',
  },
  pearlmother_isha: {
    id: 'pearlmother_isha',
    name: 'Pearl-Mother Isha',
    title: 'Elder of the Divers',
    pos: { x: -293, z: 810 },
    facing: 0.6,
    color: 0x8fb8b0,
    questIds: ['q_pr_boars_in_the_gardens', 'q_pr_the_man_who_went_in'],
    greeting: 'The sea gives, the sand keeps, and the jungle takes. Stay on the strand, stranger.',
  },
  hermit_okku: {
    id: 'hermit_okku',
    name: 'Okku',
    title: 'The Man Who Went In',
    pos: { x: -397, z: 1068 },
    facing: -0.24,
    color: 0x6f8a5a,
    questIds: [
      'q_pr_the_man_who_went_in',
      'q_pr_canopy_silk',
      'q_pr_what_the_drums_guard',
      'q_pr_idol_guardian',
    ],
    greeting:
      'Quiet now. The drums count everything that walks under the trees, and they have already counted you.',
  },
};

export const PALMREACH_QUESTS: Record<string, QuestDef> = {
  q_pr_down_to_drifthaven: {
    id: 'q_pr_down_to_drifthaven',
    name: 'Down to Drifthaven',
    giverNpcId: 'strandwatcher_pell',
    turnInNpcId: 'salvage_boss_ryna',
    text: 'Out of the black trees and into the sun, $N. Follow the shore road north and you will strike Drifthaven before the tide turns. Ask for Salvage-Boss Ryna, she has work for any pair of hands since the storm, and tell her the Tanglemouth road is still open.',
    completionText:
      'Pell sent you? Then you walked the whole Tanglemouth road alone, and that is reference enough for me. Welcome to Drifthaven, $N. Grab a rope, we are short-handed.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'salvage_boss_ryna',
        count: 1,
        label: 'Report to Salvage-Boss Ryna',
      },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    minLevel: 19,
  },
  q_pr_wreck_line_cargo: {
    id: 'q_pr_wreck_line_cargo',
    name: 'The Wreck Line',
    giverNpcId: 'salvage_boss_ryna',
    turnInNpcId: 'salvage_boss_ryna',
    text: 'The storm three nights back drove the Pearlwake onto the reef, and her cargo is strewn the whole length of the wreck line between here and the Palmstrand. Three crates of trade goods are still lying in the surf, $N. Bring them in before the tide, or the crabs, claim what is left.',
    completionText:
      'Salt-stained but sound, all three. The divers eat this month because of you, $N.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'pearlwake_cargo_crate',
        count: 3,
        label: 'Pearlwake Cargo recovered',
      },
    ],
    xpReward: 4600,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_pr_down_to_drifthaven',
  },
  q_pr_scuttler_cull: {
    id: 'q_pr_scuttler_cull',
    name: 'Shellbacked Thieves',
    giverNpcId: 'salvage_boss_ryna',
    turnInNpcId: 'salvage_boss_ryna',
    text: 'Every wreck on this coast draws the tide scuttlers, and the Pearlwake has drawn half the reef. My salvage crews will not work a line with those claws in the shallows. Crack ten of them, $N, and the wreck line is ours again.',
    completionText:
      'Ten fewer claws in the surf. My crews are already wading back out, and not one of them said thank you, so I will: thank you, $N.',
    objectives: [
      { type: 'kill', targetMobId: 'tide_scuttler', count: 10, label: 'Tide Scuttler cracked' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_pr_down_to_drifthaven',
  },
  q_pr_boars_in_the_gardens: {
    id: 'q_pr_boars_in_the_gardens',
    name: 'Boars in the Gardens',
    giverNpcId: 'pearlmother_isha',
    turnInNpcId: 'pearlmother_isha',
    text: 'Whatever stirs in the deep green, it pushes the thicket boars out onto our strand. They have rooted up the garden terraces twice this week, and they will have the drying racks next. Ten boars, $N, and push the rest back under the trees.',
    completionText:
      'The racks stand and the gardens can be replanted. The boars did not choose to come onto the sand, $N. Remember that: something moved them.',
    objectives: [
      { type: 'kill', targetMobId: 'thicket_boar', count: 10, label: 'Thicket Boar driven off' },
    ],
    xpReward: 4600,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_pr_down_to_drifthaven',
  },
  q_pr_the_man_who_went_in: {
    id: 'q_pr_the_man_who_went_in',
    name: 'The Man Who Went In',
    giverNpcId: 'pearlmother_isha',
    turnInNpcId: 'hermit_okku',
    text: 'The divers will not step past the treeline, $N, and I will not ask them to. You have heard the drums by now: everyone does, by the second night. One man on this island ever walked toward that sound and came back. Okku. He camps at the Vinefall, deep up the Tangle road. Find him, and ask him what the green is hiding.',
    completionText:
      "Isha sent you? The Pearl-Mother has not spoken my name in years. Sit out of the vines' reach, $N, and I will tell you what I know: the drums are not the danger. They are the warning.",
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'hermit_okku',
        count: 1,
        label: 'Find Okku at the Vinefall',
      },
    ],
    xpReward: 2800,
    copperReward: 1100,
    itemRewards: {},
    requiresQuest: 'q_pr_down_to_drifthaven',
    minLevel: 20,
  },
  q_pr_canopy_silk: {
    id: 'q_pr_canopy_silk',
    name: 'Silk from the Canopy',
    giverNpcId: 'hermit_okku',
    turnInNpcId: 'hermit_okku',
    text: 'Look up, $N. Every canopy from here to the idol is webbed like a fishing net, and the weavers grow bolder each season. I string their own silk across the paths, tripline bells, so the jungle cannot creep up on me. Six good hanks off the canopy weavers will restring my lines.',
    completionText:
      'Good, strong silk. My bells will sing a while longer, and nothing walks these paths at night without me knowing, $N. Lately, something has been walking often.',
    objectives: [
      { type: 'collect', itemId: 'canopy_silk_hank', count: 6, label: 'Canopy Silk Hank' },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {
      warrior: 'saltwalker_sandals',
      mage: 'saltwalker_sandals',
      rogue: 'saltwalker_sandals',
    },
    requiresQuest: 'q_pr_the_man_who_went_in',
  },
  q_pr_what_the_drums_guard: {
    id: 'q_pr_what_the_drums_guard',
    name: 'What the Drums Guard',
    giverNpcId: 'hermit_okku',
    turnInNpcId: 'hermit_okku',
    text: 'I have walked as near the Sunken Idol as a living man dares, and I saw two things: the weavers have curtained the idol road in web, and the old offering bowls along it have been filled again. Freshly, $N. Cut eight weavers off the road and bring me three of those offerings. I would know what hand still feeds a dead god.',
    completionText:
      'Moss, pearl-shell, and boar blood, packed by fingers. Something in that ruin still keeps its rites, $N, and the Guardian keeps everything else out. It is time we spoke of it plainly.',
    objectives: [
      { type: 'kill', targetMobId: 'canopy_weaver', count: 8, label: 'Canopy Weaver cut down' },
      {
        type: 'interact',
        targetObjectItemId: 'sunken_offering_bowl',
        count: 3,
        label: 'Refilled Offering Bowl gathered',
      },
    ],
    xpReward: 5200,
    copperReward: 2800,
    itemRewards: {},
    requiresQuest: 'q_pr_canopy_silk',
    minLevel: 20,
  },
  q_pr_idol_guardian: {
    id: 'q_pr_idol_guardian',
    name: 'The Idol Guardian',
    giverNpcId: 'hermit_okku',
    turnInNpcId: 'hermit_okku',
    text: 'The idol is older than the island, $N. Older than the drums, older than the name Palmreach. Its Guardian has stood in that drowned ring since before the palms grew, and now it wakes and walks the columns at night. Whatever the offerings feed, the Guardian is its door-ward. Bring a friend, and break it.',
    completionText:
      'You felled a thing the jungle itself would not touch. Look there, behind the idol: the Guardian was never guarding the columns, $N, it was guarding the steps beneath them. The drums have gone quiet tonight.',
    objectives: [
      { type: 'kill', targetMobId: 'idol_guardian', count: 1, label: 'The Idol Guardian broken' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'sunken_idol_mantle',
      mage: 'sunken_idol_mantle',
      rogue: 'sunken_idol_mantle',
    },
    requiresQuest: 'q_pr_what_the_drums_guard',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

export const PALMREACH_QUEST_ORDER: string[] = [
  'q_pr_down_to_drifthaven',
  'q_pr_wreck_line_cargo',
  'q_pr_scuttler_cull',
  'q_pr_boars_in_the_gardens',
  'q_pr_the_man_who_went_in',
  'q_pr_canopy_silk',
  'q_pr_what_the_drums_guard',
  'q_pr_idol_guardian',
];

export const PALMREACH_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  pearlwake_cargo_crate: {
    id: 'pearlwake_cargo_crate',
    name: 'Pearlwake Cargo Crate',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_pr_wreck_line_cargo',
    noVendorSell: true,
  },
  canopy_silk_hank: {
    id: 'canopy_silk_hank',
    name: 'Canopy Silk Hank',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_pr_canopy_silk',
  },
  sunken_offering_bowl: {
    id: 'sunken_offering_bowl',
    name: 'Refilled Offering Bowl',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_pr_what_the_drums_guard',
    noVendorSell: true,
  },
  // --- quest rewards ---
  // Upstream hangs these on the escort quest we cannot port; they move to the
  // silk chain's first link so the zone still pays out a feet piece at the same
  // point in the chain (same stats, same sell value, same id).
  saltwalker_sandals: {
    id: 'saltwalker_sandals',
    name: 'Saltwalker Sandals',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'feet',
    quality: 'uncommon',
    stats: { armor: 60, sta: 2, agi: 3 },
    sellValue: 1000,
  },
  sunken_idol_mantle: {
    id: 'sunken_idol_mantle',
    name: 'Mantle of the Sunken Idol',
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
export const PALMREACH_CAMPS: CampDef[] = [
  { mobId: 'tide_scuttler', center: { x: -456, z: 878 }, radius: 10, count: 3,
    positions: [{ x: -449.55, z: 879.05 }, { x: -462.86, z: 872.21 }, { x: -465.06, z: 879.83 }] },
  { mobId: 'tide_scuttler', center: { x: -252, z: 840 }, radius: 10, count: 3,
    positions: [{ x: -250.52, z: 838.09 }, { x: -258.14, z: 839.91 }, { x: -253.92, z: 831.4 }] },
  { mobId: 'thicket_boar', center: { x: -368, z: 940 }, radius: 10, count: 3,
    positions: [{ x: -365.75, z: 938.19 }, { x: -362.35, z: 935.87 }, { x: -369.22, z: 932.14 }] },
  { mobId: 'thicket_boar', center: { x: -410, z: 960 }, radius: 10, count: 3,
    positions: [{ x: -409.87, z: 963.17 }, { x: -409.67, z: 963.53 }, { x: -419.53, z: 960.09 }] },
  { mobId: 'canopy_weaver', center: { x: -326, z: 1060 }, radius: 10, count: 3,
    positions: [{ x: -322.21, z: 1058.51 }, { x: -329.66, z: 1054.52 }, { x: -324.34, z: 1068.25 }] },
  { mobId: 'canopy_weaver', center: { x: -426, z: 1120 }, radius: 10, count: 2,
    positions: [{ x: -422.91, z: 1128.76 }, { x: -424.89, z: 1129.55 }] },
  { mobId: 'idol_guardian', center: { x: -256, z: 1090 }, radius: 5, count: 1,
    positions: [{ x: -260.64, z: 1091.61 }] },
];

export const PALMREACH_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'pearlwake_cargo_crate',
    name: 'Pearlwake Cargo Crate',
    // Strewn along the wreck line, hugging the Drifthaven to Palmstrand road.
    positions: [
      { x: -352, z: 866 },
      { x: -396, z: 876 },
      { x: -434, z: 888 },
    ],
  },
  {
    itemId: 'sunken_offering_bowl',
    name: 'Refilled Offering Bowl',
    // The old offering bowls line the last stretch of the idol road, short of
    // the Guardian's drowned ring.
    positions: [
      { x: -244, z: 1036 },
      { x: -252, z: 1056 },
      { x: -266, z: 1072 },
    ],
  },
];

export const PALMREACH_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Drifthaven: a driftwood village on the strand, plus the outlying hamlets
  buildings: [
    { kind: 'inn', x: -308, z: 824, w: 6, d: 7, rot: 0.9 },
    { kind: 'house', x: -292, z: 814, w: 5, d: 5, rot: -0.7 },
    { kind: 'house', x: -380, z: 795, w: 5, d: 5, rot: 0.2 },
    { kind: 'house', x: -370, z: 1045, w: 5, d: 5, rot: 2.9 },
    { kind: 'house', x: -280, z: 1055, w: 5, d: 5, rot: 1.4 },
    { kind: 'house', x: -320, z: 780, w: 5, d: 5, rot: 1.8 },
    { kind: 'house', x: -270, z: 820, w: 5, d: 5, rot: -1.1 },
    { kind: 'house', x: -440, z: 900, w: 5, d: 5, rot: 0.6 },
    { kind: 'house', x: -410, z: 1130, w: 5, d: 5, rot: 2.2 },
  ],
  wells: [{ x: -300, z: 822, r: 1.5 }],
  stalls: [
    { x: -296, z: 828, rot: 0.4, r: 1.6 },
    { x: -305, z: 812, rot: -1.6, r: 1.6 },
  ],
  tents: [
    { x: -288, z: 826, rot: 1.1, scale: 1 },
    { x: -312, z: 834, rot: -2.0, scale: 1.1 },
    { x: -245, z: 876, rot: -0.785, scale: 1 },
    { x: -256, z: 877, rot: 0.983, scale: 1.1 },
    { x: -250, z: 888, rot: 3.14, scale: 1 },
    { x: -445, z: 1000, rot: 2.3, scale: 1 },
    { x: -506, z: 1039, rot: 0.75, scale: 1 },
  ],
  crates: [
    [-302, 816],
    [-294, 820],
    [-246, 884],
    [-376, 797],
    [-374, 1047],
    [-284, 1057],
  ],
  campfires: [
    [-300, 818],
    [-418, 720], // the Tanglemouth's waycamp
    [-250, 881], // the Sunway camp
    [-380, 803],
    [-370, 1053],
    [-280, 1063],
    [-441, 997],
    [-503, 1036],
  ],
  docks: [{ x: -286, z: 838, rot: 0.6, hutLocal: { x: 40, z: 40, hw: 0, hd: 0 } }],
  mudHuts: [
    [-316, 826],
    [-290, 808],
    [-387, 803],
    [-373, 802],
    [-377, 1053],
    [-363, 1052],
    [-287, 1063],
    [-273, 1062],
    [-250, 1000],
    [-220, 1210],
  ],
  // the Sunken Idol: a mossy ring of drowned-temple columns
  ruinRings: [{ x: -256, z: 1090, ringR: 8, columns: 6 }],
  graveyards: [{ x: -318, z: 802 }],
};
