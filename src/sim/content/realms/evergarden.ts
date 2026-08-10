// The Evergarden (level 20), ported from upstream `src/sim/content/evergarden.ts`.
//
// North past the Galecrest's downs the road climbs through the Garden Gate onto
// clipped lawn: a vast formal garden gone a hundred years without its gardener,
// yet still trimmed. Parterre beds bloom along the Parterre Walk, Dawnhold
// castle holds one lawn, the Petal Pond mirrors another, and at the realm's
// heart stands the Great Maze with the Fountain Court, and something horned
// that guards it, at the center. The hamlet of Hedgewick keeps its lamps lit by
// the gate lawns.
//
// THE GREAT MAZE IS NOT PORTED AS GEOMETRY. Upstream's labyrinth is a grid in
// their `world.ts` that the sim, the renderer and the map all read; we have no
// such structure and `src/render/` is out of scope for this port. The Maze and
// the Fountain Court survive as POIs, the Bull still holds the Court, and the
// three "maze patrol" knight camps are kept because they sit on open ground
// once the hedges are absent. See ./willowfen.ts and ./CLAUDE.md for the rest
// of what this port drops from upstream (rift weights, POI ids, portals,
// componentTags, decorProps, greatTrees, fence kinds).
//
// Direction words in player copy are re-derived for this world (+z NORTH,
// +x WEST) and pinned by `tests/realms_compass.test.ts`. Upstream's own copy
// also placed the Lily Basin and the fourth statue SOUTH of the maze when both
// stand north of it on their own coordinates; that is corrected here too.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const EVERGARDEN_ZONE: ZoneDef = {
  id: 'evergarden',
  name: 'The Evergarden',
  zMin: 700,
  zMax: 1260,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'garden',
  southPassX: 400, // the Garden Gate: where the headland road meets the lawns
  westPassZ: 800, // the Gardenwalk: down from the heights onto the lawns
  hub: { x: 320, z: 810, radius: 16, name: 'Hedgewick' },
  graveyard: { x: 309, z: 793 },
  lakes: [
    { x: 440, z: 850, radius: 11 }, // the Petal Pond
    { x: 340, z: 1170, radius: 10 }, // the Lily Basin
  ],
  pois: [
    { x: 320, z: 810, label: 'Hedgewick' },
    { x: 410, z: 732, label: 'The Garden Gate' },
    { x: 360, z: 875, label: 'The Parterre Walk' },
    { x: 263, z: 889, label: 'Dawnhold Castle' },
    { x: 440, z: 850, label: 'The Petal Pond' },
    { x: 360, z: 946, label: 'The Great Maze' },
    { x: 360, z: 1016, label: 'The Fountain Court' },
    { x: 504, z: 754, label: 'The Old Mill' },
    { x: 412, z: 1112, label: 'The North Watch' },
    { x: 340, z: 1170, label: 'The Lily Basin' },
  ],
  welcome:
    'Someone is still trimming the hedges, though no gardener has been seen for a hundred years. Mind the maze: it minds you back.',
  welcomeQuestId: 'q_eg_gate_report',
};

export const EVERGARDEN_ROADS: { x: number; z: number }[][] = [
  [
    { x: 398, z: 706 },
    { x: 390, z: 752 },
    { x: 358, z: 784 },
    { x: 320, z: 810 },
  ], // the Garden Gate to Hedgewick
  [
    { x: 320, z: 810 },
    { x: 344, z: 844 },
    { x: 360, z: 875 },
    { x: 360, z: 936 },
  ], // Hedgewick, the Parterre Walk, the maze mouth
  [
    { x: 320, z: 810 },
    { x: 298, z: 852 },
    { x: 290, z: 872 },
    { x: 288, z: 887 },
  ], // Hedgewick to Dawnhold's gate
  [
    { x: 320, z: 810 },
    { x: 366, z: 818 },
    { x: 376, z: 826 },
    { x: 388, z: 832 },
    { x: 398, z: 839 },
    { x: 410, z: 836 },
    { x: 422, z: 835 },
  ], // Hedgewick, around the inlet, to the Petal Pond
  [
    { x: 410, z: 836 },
    { x: 438, z: 833 },
    { x: 466, z: 827 },
    { x: 480, z: 812 },
    { x: 488, z: 794 },
    { x: 497, z: 772 },
  ], // the lakeshore walk to the Old Mill lawn
  [
    { x: 422, z: 835 },
    { x: 420, z: 878 },
    { x: 454, z: 920 },
    { x: 458, z: 1020 },
    { x: 440, z: 1110 },
    { x: 396, z: 1162 },
    { x: 352, z: 1170 },
  ], // the pond, the long walk around the maze, the Lily Basin
  [
    { x: 320, z: 810 },
    { x: 268, z: 806 },
    { x: 224, z: 802 },
    { x: 186, z: 800 },
  ], // Hedgewick down the Gardenwalk, onto the Thornpeak heights
  [
    { x: 387, z: 1098 },
    { x: 400, z: 1102 },
    { x: 420, z: 1104 },
    { x: 440, z: 1110 },
  ], // the maze's north mouth out to the long walk
];

// The garden's shapes: stags and wolves clipped from living hedge, the gnome
// groundskeepers, Dawnhold's old garrison, and the Bull that guards the
// Fountain Court.
export const EVERGARDEN_MOBS: Record<string, MobTemplate> = {
  topiary_stag: {
    id: 'topiary_stag',
    name: 'Topiary Stag',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 56,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 9,
    aggroRadius: 0, // clipped leaves grazing the lawn; it minds its own shape
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'evergarden_bloom_clipping', chance: 0.65, questId: 'q_eg_bloom_clippings' },
    ],
    scale: 1.15,
    color: 0x3f7e3c,
  },
  topiary_wolf: {
    id: 'topiary_wolf',
    name: 'Topiary Wolf',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 58,
    hpPerLevel: 19,
    dmgBase: 12,
    dmgPerLevel: 2.3,
    attackSpeed: 1.9,
    armorPerLevel: 11,
    moveSpeed: 8.5,
    aggroRadius: 11, // some of the shapes were pruned into hunger
    loot: [{ copper: 100, chance: 1 }],
    scale: 1.15,
    color: 0x4a8a4e,
  },
  hedge_knight: {
    id: 'hedge_knight',
    name: 'Dawnhold Knight',
    minLevel: 20,
    maxLevel: 20,
    family: 'humanoid',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 13,
    moveSpeed: 8.5,
    aggroRadius: 11, // the castle's old garrison still walks its rounds
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'linen_scrap', chance: 0.3 },
    ],
    scale: 1.0,
    color: 0xb8c4d0, // burnished plate
  },
  hedge_gnome: {
    id: 'hedge_gnome',
    name: 'Hedge Gnome',
    minLevel: 20,
    maxLevel: 20,
    family: 'kobold', // upstream 'burrower'
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 11,
    dmgPerLevel: 2.2,
    attackSpeed: 1.8,
    armorPerLevel: 10,
    moveSpeed: 8.5,
    aggroRadius: 10, // the unseen groundskeepers, and they hate trespass
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'hedgewick_shears', chance: 0.6, questId: 'q_eg_stolen_shears' },
    ],
    scale: 0.95,
    color: 0x5a8a46,
  },
  the_topiary_bull: {
    id: 'the_topiary_bull',
    name: 'The Topiary Bull',
    minLevel: 20,
    maxLevel: 20,
    family: 'beast',
    hpBase: 155,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 17, // a century of hardened green wood
    moveSpeed: 8.5,
    aggroRadius: 12, // the court is his, and the maze feeds him trespassers
    elite: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'tangled_weed', chance: 1 },
    ],
    scale: 1.45,
    color: 0x2e6a34,
  },
};

// The folk of the garden: a gatewarden minds the south entry, the sleepless
// Head Gardener and the Wickmother hold Hedgewick, and far north past the maze,
// by the Lily Basin, works the gardener nobody believes in.
export const EVERGARDEN_NPCS: Record<string, NpcDef> = {
  gatewarden_pell: {
    id: 'gatewarden_pell',
    name: 'Gatewarden Pell',
    title: 'Keeper of the Garden Gate',
    pos: { x: 390, z: 714 },
    facing: -2.6,
    color: 0x8a9a6a,
    questIds: ['q_eg_gate_report'],
    greeting:
      'Mind how you go on the lawns. The garden keeps them trimmed, and it likes them tidy.',
  },
  head_gardener_amaranth: {
    id: 'head_gardener_amaranth',
    name: 'Head Gardener Amaranth',
    title: 'Head Gardener of the Evergarden',
    pos: { x: 323, z: 808 },
    facing: 2.8,
    color: 0xb46a7a,
    questIds: ['q_eg_gate_report', 'q_eg_hungry_shapes', 'q_eg_who_trims_the_hedges'],
    greeting:
      'Do not mind the shadows under my eyes. Someone has to stay awake while the garden dreams.',
  },
  wickmother_sorrel: {
    id: 'wickmother_sorrel',
    name: 'Wickmother Sorrel',
    title: 'Keeper of the Hedgewick Inn',
    pos: { x: 317, z: 814 },
    facing: 0.5,
    color: 0xc98a5a,
    questIds: ['q_eg_stolen_shears', 'q_eg_gnomes_in_the_green'],
    greeting:
      'Come in, sit, there is cordial on the fire. Just keep a hand on anything iron: the gnomes are light-fingered of late.',
  },
  gardener_yew: {
    id: 'gardener_yew',
    name: 'Gardener Yew',
    title: 'The Last Gardener',
    pos: { x: 348, z: 1160 },
    facing: -0.8,
    color: 0x556b45,
    questIds: [
      'q_eg_who_trims_the_hedges',
      'q_eg_bloom_clippings',
      'q_eg_four_statues',
      'q_eg_bull_of_the_court',
    ],
    greeting:
      'Hand me that barrow, would you? These lawns do not walk themselves, whatever the hamlet thinks.',
  },
};

export const EVERGARDEN_QUESTS: Record<string, QuestDef> = {
  q_eg_gate_report: {
    id: 'q_eg_gate_report',
    name: 'Word Through the Gate',
    giverNpcId: 'gatewarden_pell',
    turnInNpcId: 'head_gardener_amaranth',
    text: 'The lawns past this gate have trimmed themselves for a hundred years, $N, and lately they have started trimming visitors. Head Gardener Amaranth keeps the books in Hedgewick, up the road past the gate lawns. Tell her another traveler has come through, and tell her the hedges by the gate moved last night.',
    completionText:
      'Moved, did they. Pell reports that every week, and every week he is right. Forgive my eyes, $N, I have not slept a whole night in years: someone has to watch the garden watch us. Welcome to Hedgewick.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'head_gardener_amaranth',
        count: 1,
        label: 'Report to Head Gardener Amaranth',
      },
    ],
    xpReward: 2600,
    copperReward: 950,
    itemRewards: {},
    minLevel: 19,
  },
  q_eg_hungry_shapes: {
    id: 'q_eg_hungry_shapes',
    name: 'Pruned into Hunger',
    giverNpcId: 'head_gardener_amaranth',
    turnInNpcId: 'head_gardener_amaranth',
    text: 'Whoever shapes this garden has grown careless, or cruel. The wolf shapes out by Dawnhold were clipped for show, yet lately they hunt: green jaws, no bellies, and no reason ever to stop. Cut down ten topiary wolves, $N, and let the lawns be lawns again for a while.',
    completionText:
      'Ten heaps of clippings where ten wolves stood. It should feel like gardening, $N. Why does it feel like war?',
    objectives: [
      { type: 'kill', targetMobId: 'topiary_wolf', count: 10, label: 'Topiary Wolf slain' },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_eg_gate_report',
  },
  q_eg_stolen_shears: {
    id: 'q_eg_stolen_shears',
    name: 'The Stolen Shears',
    giverNpcId: 'wickmother_sorrel',
    turnInNpcId: 'wickmother_sorrel',
    text: 'Every pair of shears in Hedgewick has walked off in a fortnight, $N: off the pegs, out of locked sheds, one pair out of my own apron while I dozed. It is the hedge gnomes, the little groundskeepers who hate us walking their lawns. Get six pairs back before the whole hamlet is down to kitchen knives.',
    completionText:
      'Six pairs, and my own among them, I would know the nick in the blade anywhere. Here, these gloves were knitted for pruning work. Warm hands make steady shears.',
    objectives: [
      { type: 'collect', itemId: 'hedgewick_shears', count: 6, label: 'Stolen Hedgewick Shears' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {
      warrior: 'shearkeeper_gloves',
      mage: 'shearkeeper_gloves',
      rogue: 'shearkeeper_gloves',
    },
    requiresQuest: 'q_eg_gate_report',
  },
  q_eg_gnomes_in_the_green: {
    id: 'q_eg_gnomes_in_the_green',
    name: 'The Groundskeepers Grudge',
    giverNpcId: 'wickmother_sorrel',
    turnInNpcId: 'wickmother_sorrel',
    // "east of the maze": the warren carts sit at x 262..276 against the maze
    // at x 360, i.e. -x from it, and -x is EAST here.
    text: 'The shears were only the start, $N. Last night the gnomes tipped our tool carts into the green, one out by their warren east of the maze, one clean across the garden on the pond walk, and scattered a hundred years of good iron in the grass. Drive off eight of the little devils and haul the spilled carts home.',
    completionText:
      'Three carts back and the pegs full again. Let the little devils sulk in their hedges: Hedgewick works these lawns too.',
    objectives: [
      { type: 'kill', targetMobId: 'hedge_gnome', count: 8, label: 'Hedge Gnome driven off' },
      {
        type: 'interact',
        targetObjectItemId: 'hedgewick_tool_cart',
        count: 3,
        label: 'Tool cart recovered',
      },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_eg_stolen_shears',
    minLevel: 20,
  },
  q_eg_who_trims_the_hedges: {
    id: 'q_eg_who_trims_the_hedges',
    name: 'Who Trims the Hedges',
    giverNpcId: 'head_gardener_amaranth',
    turnInNpcId: 'gardener_yew',
    // "far north lawns": Amaranth stands at z 808 and Yew at z 1160, so the
    // Lily Basin lies north of Hedgewick, not south as upstream's copy read.
    text: 'I have kept the ledgers thirty years, $N, and not slept properly for ten of them, because the sums will not close. Grass wants cutting and hedges want shaping, and nobody here does either, yet every dawn the garden stands trimmed. Lately the woodfolk swear they see an old man with a barrow on the far north lawns, past the maze by the Lily Basin. Find him. If he is real, I can finally sleep. If he is not, I suppose I never will.',
    completionText:
      'So the house finally sent someone. A hundred years I have walked these lawns, $N, and the garden and I have an understanding: I trim what asks to be trimmed. Sit. The hedges can spare you an hour.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'gardener_yew',
        count: 1,
        label: 'Find the gardener by the Lily Basin',
      },
    ],
    xpReward: 2800,
    copperReward: 1000,
    itemRewards: {},
    requiresQuest: 'q_eg_hungry_shapes',
    minLevel: 20,
  },
  q_eg_bloom_clippings: {
    id: 'q_eg_bloom_clippings',
    name: 'Clippings from the Living Green',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    text: 'You want to understand this garden? Then read it the way I do. The stags that graze the lawns grow the truest green: every leaf on them is a page. Bring me six fresh clippings from the topiary stags, $N. They will not thank you for the pruning, but they will regrow. Everything here regrows.',
    completionText:
      'Look here: the leaves are curling in on themselves, every clipping the same. The garden is afraid, $N. In a hundred years I have never once known it afraid.',
    objectives: [
      {
        type: 'collect',
        itemId: 'evergarden_bloom_clipping',
        count: 6,
        label: 'Pruned Bloom Clipping',
      },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_eg_who_trims_the_hedges',
  },
  q_eg_four_statues: {
    id: 'q_eg_four_statues',
    name: 'The Four Quiet Sisters',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    // The four sisters at (280,922) (above Dawnhold), (452,930) (the pond
    // walk, +x = WEST of the maze), (274,1012) (the gnome warren, -x = EAST of
    // the maze) and (426,1118) (+z = NORTH of the maze). Every word below is
    // derived from those coordinates.
    text: 'When the garden was young, the first gardeners raised four marble sisters to watch its quarters: one above Dawnhold, one on the pond walk west of the maze, one on the east lawn where the gnomes keep their warren, and one on the north lawn past the hedges. The maze grew up between them, and most folk never see all four. Walk the quarters, $N, and press your palm to each sister. When the garden has looked you over from all four sides, it will open places it keeps from strangers.',
    completionText:
      'Four rubbings, four sisters, and not one of them wept marble. The garden has taken your measure, $N, and it did not find you wanting. Now I can send you where the trouble truly lives.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'evergarden_statue_rubbing',
        count: 4,
        label: 'Garden statue visited',
      },
    ],
    xpReward: 5200,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_eg_who_trims_the_hedges',
    minLevel: 20,
  },
  q_eg_bull_of_the_court: {
    id: 'q_eg_bull_of_the_court',
    name: 'The Bull of the Fountain Court',
    giverNpcId: 'gardener_yew',
    turnInNpcId: 'gardener_yew',
    text: 'Now the truth, $N. The bull at the heart of the maze was my masterwork: I shaped him to guard the Fountain Court, and for a hundred years he did. But the fear in the green has reached him, and he guards nothing now, he hunts. The maze feeds him whoever wanders in. I am too old to unmake him, and it must be unmaking, root and branch. Bring a friend, walk the maze to the court, and cut my bull down.',
    completionText:
      'I felt it, here, when he came apart. A hundred years of work, and you were right to end it. Take this mantle: I cut it for whoever proved stronger than my best. The court is only a fountain tonight, $N, and the garden is only a garden. Perhaps now the Head Gardener and I can both sleep.',
    objectives: [
      { type: 'kill', targetMobId: 'the_topiary_bull', count: 1, label: 'The Topiary Bull unmade' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'fountain_court_mantle',
      mage: 'fountain_court_mantle',
      rogue: 'fountain_court_mantle',
    },
    requiresQuest: 'q_eg_four_statues',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

export const EVERGARDEN_QUEST_ORDER: string[] = [
  'q_eg_gate_report',
  'q_eg_hungry_shapes',
  'q_eg_stolen_shears',
  'q_eg_who_trims_the_hedges',
  'q_eg_gnomes_in_the_green',
  'q_eg_bloom_clippings',
  'q_eg_four_statues',
  'q_eg_bull_of_the_court',
];

export const EVERGARDEN_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  hedgewick_shears: {
    id: 'hedgewick_shears',
    name: 'Stolen Hedgewick Shears',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_stolen_shears',
  },
  evergarden_bloom_clipping: {
    id: 'evergarden_bloom_clipping',
    name: 'Pruned Bloom Clipping',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_bloom_clippings',
  },
  hedgewick_tool_cart: {
    id: 'hedgewick_tool_cart',
    name: 'Spilled Tool Cart',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_gnomes_in_the_green',
    noVendorSell: true,
  },
  evergarden_statue_rubbing: {
    id: 'evergarden_statue_rubbing',
    name: 'Statue Rubbing',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_eg_four_statues',
    noVendorSell: true,
  },
  // --- quest rewards ---
  shearkeeper_gloves: {
    id: 'shearkeeper_gloves',
    name: 'Shearkeeper Gloves',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'gloves',
    quality: 'uncommon',
    stats: { armor: 52, sta: 3, spi: 3 },
    sellValue: 950,
  },
  fountain_court_mantle: {
    id: 'fountain_court_mantle',
    name: 'Mantle of the Fountain Court',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 74, sta: 6, str: 4 },
    sellValue: 2400,
  },
};

// FROZEN SPAWN SPOTS. Upstream authored these as scatter camps (no `positions`),
// which draw world-gen rng and so move the post-worldgen rng cursor every
// seeded fixture in the suite reads from. The spots below ARE that scatter,
// captured once from the live world seed (20061) and frozen, so world
// generation now draws nothing for them: every shipped spawn AND the cursor
// itself stay bit-identical. Verified dry land at seeds 20061, 1337 and 42.
export const EVERGARDEN_CAMPS: CampDef[] = [
  { mobId: 'topiary_stag', center: { x: 364, z: 898 }, radius: 10, count: 3,
    positions: [{ x: 368.7, z: 901.71 }, { x: 371.58, z: 898.29 }, { x: 355.98, z: 896.01 }] },
  { mobId: 'topiary_stag', center: { x: 326, z: 1146 }, radius: 10, count: 3,
    positions: [{ x: 323.96, z: 1148.94 }, { x: 325.17, z: 1153.43 }, { x: 319.02, z: 1149.51 }] },
  { mobId: 'topiary_wolf', center: { x: 294, z: 906 }, radius: 10, count: 3,
    positions: [{ x: 293.8, z: 902.84 }, { x: 291.85, z: 911.09 }, { x: 293.32, z: 900.4 }] },
  { mobId: 'topiary_wolf', center: { x: 418, z: 1124 }, radius: 10, count: 3,
    positions: [{ x: 420.64, z: 1130.72 }, { x: 410.33, z: 1122.15 }, { x: 410.64, z: 1117.98 }] },
  { mobId: 'hedge_gnome', center: { x: 268, z: 1002 }, radius: 10, count: 3,
    positions: [{ x: 267.22, z: 995.71 }, { x: 272.72, z: 997.11 }, { x: 274.37, z: 1005.23 }] },
  { mobId: 'hedge_gnome', center: { x: 456, z: 942 }, radius: 10, count: 2,
    positions: [{ x: 453.29, z: 950.77 }, { x: 462.46, z: 935.37 }] },
  { mobId: 'the_topiary_bull', center: { x: 360, z: 1016 }, radius: 5, count: 1,
    positions: [{ x: 360.29, z: 1014.72 }] },
  { mobId: 'hedge_knight', center: { x: 276, z: 886 }, radius: 8, count: 3,
    positions: [{ x: 272.2, z: 887.23 }, { x: 271.53, z: 887.96 }, { x: 280.61, z: 889.89 }] },
  { mobId: 'hedge_knight', center: { x: 410, z: 1118 }, radius: 8, count: 2,
    positions: [{ x: 413.02, z: 1113.74 }, { x: 415.88, z: 1120.38 }] },
  { mobId: 'hedge_knight', center: { x: 414, z: 1079.5 }, radius: 3, count: 1,
    positions: [{ x: 413.37, z: 1081.18 }] },
  { mobId: 'hedge_knight', center: { x: 324, z: 1007.5 }, radius: 3, count: 1,
    positions: [{ x: 322.17, z: 1008.1 }] },
  { mobId: 'hedge_knight', center: { x: 396, z: 971.5 }, radius: 3, count: 1,
    positions: [{ x: 393.52, z: 969.85 }] },
];

export const EVERGARDEN_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'evergarden_statue_rubbing',
    name: 'Weathered Garden Statue',
    // The Four Quiet Sisters, one per garden quarter around the Great Maze.
    positions: [
      { x: 280, z: 922 },
      { x: 452, z: 930 },
      { x: 274, z: 1012 },
      { x: 426, z: 1118 },
    ],
  },
  {
    itemId: 'hedgewick_tool_cart',
    name: 'Spilled Tool Cart',
    positions: [
      { x: 262, z: 996 },
      { x: 276, z: 1008 },
      { x: 460, z: 948 },
    ],
  },
];

export const EVERGARDEN_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Hedgewick: the groundskeepers' hamlet by the gate lawns
  buildings: [
    { kind: 'inn', x: 318, z: 808, w: 9, d: 10, rot: 0.7 },
    { kind: 'house', x: 344, z: 826, w: 8, d: 8, rot: -1.0 },
    { kind: 'house', x: 318, z: 828, w: 8, d: 8, rot: 2.1 },
  ],
  wells: [{ x: 324, z: 814, r: 1.5 }],
  stalls: [{ x: 326, z: 802, rot: 0.5, r: 1.6 }],
  crates: [
    [300, 808],
    [330, 806],
  ],
  campfires: [
    [324, 798],
    [388, 716], // the Garden Gate's waycamp
  ],
  // a marble folly on the far lawn
  ruinRings: [{ x: 400, z: 1182, ringR: 6, columns: 5 }],
  graveyards: [{ x: 309, z: 793 }],
};
