// The Wraithwood (level 20), ported from upstream `src/sim/content/wraithwood.ts`.
//
// A drowned-grey haunted forest in the x 180..540 grid column, directly NORTH
// (+z) of the Evergarden: the road climbs off the garden's lawns, slips under
// the Crowgate at the southern border pass, and the canopy closes overhead.
// Giant overgrown trees shut out the sky, the drizzle never quite stops, and
// things between the trunks watch the road. The hamlet of Gallowmere holds the
// center; Widow's Thicket crawls northeast of it, the Hanging Glade swings
// northwest, the ruined Mournstone Chapel moulders by its black tarn to the
// north, and the Pale Huntsman keeps his clearing in the far north.
//
// WHAT CHANGED FROM UPSTREAM, and why. Their rect, ids, level band, mobs,
// NPCs, quests, items, camps, objects and prose are taken verbatim except:
//   - `riftPortalEligible` / `riftTierWeights` are not fields of our ZoneDef.
//     Our rift rotation is DERIVED (`riftEligibleZones`, data.ts: any zone whose
//     level band reaches the cap), and this zone is a flat 20, so it joins the
//     rotation anyway.
//   - POI records carry no `id` here; our `ZoneDef.pois` is `{x, z, label}`.
//   - `PortalDef` has no equivalent here and upstream's list is empty anyway:
//     this zone is walked into under the Crowgate.
//   - `MobTemplate.componentTags` (upstream's corpse-harvest surface) is
//     dropped rather than faked. No family needed remapping: spider, elemental,
//     ogre and undead are all already members of our 11-value `MobFamily`.
//   - `ZonePropsDef.greatTrees` is an upstream render/collider record we do not
//     have, so the ten giant trunks are dropped rather than faked.
//   - `EscortDef` + `objectives[].type: 'escort'`: there is no escort system
//     here, so `q_ww_walking_mosley_home`, its `WRAITHWOOD_ESCORTS` entry
//     (`esc_ww_mosley`) and its escortee mob `gravedigger_mosley` are NOT
//     ported. That quest granted no item reward, so nothing had to be moved.
//   - Three road comments named upstream neighbour zones we have not ported
//     (the Veilmelt, the Ashmere, the Wyrmroad); those names are dropped and
//     the comments now describe only local landmarks.
//   - DIRECTION WORDS ARE RE-DERIVED. Upstream writes +x as EAST; this world is
//     +z NORTH and +x WEST, so east is -x. Every compass word in player-visible
//     copy below was recomputed from the live coordinates (bearing 0 = +z, 90 =
//     -x, 180 = -z, 270 = +x, snapped to the 8-point rose) and is commented at
//     its site.
//
// Camps are authored exactly as upstream wrote them: scatter camps with
// `center`/`radius`/`count` and no `positions`. Freezing them to exact spawn
// spots (the rng-cursor rule in realms/CLAUDE.md) is a later central pass.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const WRAITHWOOD_ZONE: ZoneDef = {
  id: 'wraithwood',
  name: 'The Wraithwood',
  zMin: 1260,
  zMax: 1820,
  xMin: 180,
  xMax: 540,
  levelRange: [20, 20],
  biome: 'haunt',
  southPassX: 390, // the Crowgate: the climb up from the garden's lawns
  hub: { x: 360, z: 1430, radius: 17, name: 'Gallowmere' },
  graveyard: { x: 378, z: 1412 },
  lakes: [
    { x: 290, z: 1500, radius: 10 }, // the Black Looking-Glass
    { x: 312, z: 1640, radius: 9 }, // the chapel tarn
    { x: 452, z: 1444, radius: 11 }, // the Drowned Coppice
  ],
  pois: [
    { x: 360, z: 1430, label: 'Gallowmere' },
    { x: 390, z: 1292, label: 'The Crowgate' },
    { x: 280, z: 1484, label: "Widow's Thicket" },
    { x: 440, z: 1530, label: 'The Hanging Glade' },
    { x: 300, z: 1620, label: 'The Mournstone Chapel' },
    { x: 380, z: 1680, label: "The Huntsman's Clearing" },
  ],
  welcome:
    'The canopy closes over the road like a lid. Keep to the lanterns of Gallowmere, and do not answer if the wood calls your name.',
  welcomeQuestId: 'q_ww_bells_of_gallowmere',
};

export const WRAITHWOOD_ROADS: { x: number; z: number }[][] = [
  [
    { x: 390, z: 1268 },
    { x: 384, z: 1326 },
    { x: 370, z: 1382 },
    { x: 360, z: 1430 },
  ], // the Crowgate to Gallowmere
  [
    { x: 360, z: 1430 },
    { x: 322, z: 1454 },
    { x: 296, z: 1472 },
  ], // Gallowmere to Widow's Thicket
  [
    { x: 360, z: 1430 },
    { x: 396, z: 1468 },
    { x: 422, z: 1504 },
  ], // Gallowmere to the Hanging Glade
  [
    { x: 360, z: 1430 },
    { x: 338, z: 1500 },
    { x: 318, z: 1570 },
    { x: 306, z: 1608 },
  ], // Gallowmere to the Mournstone Chapel
  [
    { x: 360, z: 1430 },
    { x: 368, z: 1510 },
    { x: 374, z: 1590 },
    { x: 378, z: 1660 },
    { x: 390, z: 1706 },
    { x: 398, z: 1748 },
    { x: 404, z: 1794 },
  ], // Gallowmere to the Huntsman's Clearing and on to the far north bound
  [
    { x: 360, z: 1430 },
    { x: 332, z: 1520 },
    { x: 327, z: 1620 },
    { x: 326, z: 1660 },
    { x: 306, z: 1744 },
  ], // Gallowmere, WEST past the chapel tarn (the road runs x 327 against the
  // tarn at x 312, i.e. +x, and +x is WEST here), to the north shore
  [
    { x: 296, z: 1472 },
    { x: 262, z: 1496 },
    { x: 244, z: 1512 },
  ], // Widow's Thicket, on down to the grey shore
];

// The wood's inhabitants: the spinners string their larders over the lanterns,
// the wraiths were chapel wardens once, the shamblers stand guard under the
// hanging dead, and the Pale Huntsman rides his own clearing in the far north.
export const WRAITHWOOD_MOBS: Record<string, MobTemplate> = {
  widowsilk_spinner: {
    id: 'widowsilk_spinner',
    name: 'Widowsilk Spinner',
    minLevel: 20,
    maxLevel: 20,
    family: 'spider',
    hpBase: 56,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8.5,
    aggroRadius: 12,
    loot: [
      { copper: 105, chance: 1 },
      { itemId: 'spider_leg', chance: 0.4 },
      { itemId: 'widowsilk_skein', chance: 0.6, questId: 'q_ww_widows_skeins' },
    ],
    scale: 1.3,
    color: 0x3a3440,
  },
  wood_wraith: {
    id: 'wood_wraith',
    name: 'Wood Wraith',
    minLevel: 20,
    maxLevel: 20,
    family: 'elemental',
    hpBase: 52,
    hpPerLevel: 18,
    dmgBase: 11,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 10,
    moveSpeed: 8,
    aggroRadius: 12, // it drifts between the trunks, and it minds trespass
    loot: [{ copper: 100, chance: 1 }],
    scale: 1.3,
    color: 0x9ab4a0,
  },
  gravenbark_shambler: {
    id: 'gravenbark_shambler',
    name: 'Gravenbark Shambler',
    minLevel: 20,
    maxLevel: 20,
    family: 'ogre',
    hpBase: 90,
    hpPerLevel: 26,
    dmgBase: 14,
    dmgPerLevel: 2.6,
    attackSpeed: 2.6,
    armorPerLevel: 15,
    moveSpeed: 6.5, // a tree that decided to walk does not hurry
    aggroRadius: 8,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'tangled_weed', chance: 0.4 },
    ],
    scale: 1.35,
    color: 0x4e4a3a,
  },
  pale_huntsman: {
    id: 'pale_huntsman',
    name: 'The Pale Huntsman',
    minLevel: 20,
    maxLevel: 20,
    family: 'undead',
    hpBase: 155,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 17,
    moveSpeed: 8.5,
    aggroRadius: 16, // the clearing is his, and he knows when you enter it
    elite: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'bone_fragments', chance: 1 },
    ],
    scale: 1.4,
    color: 0xc8d8c0,
  },
};

// The folk of the wood: a lampman minds the Crowgate waycamp, the sexton and
// the candlewright hold Gallowmere, and the last vicar still tends the ruined
// Mournstone Chapel alone. The vicar stands far from the hub on purpose: the
// chapel chain sends players out to find him.
export const WRAITHWOOD_NPCS: Record<string, NpcDef> = {
  lampman_cobb: {
    id: 'lampman_cobb',
    name: 'Lampman Cobb',
    title: 'Keeper of the Crowgate Lanterns',
    pos: { x: 387, z: 1283 },
    facing: 2.9,
    color: 0xc9a86a,
    questIds: ['q_ww_bells_of_gallowmere'],
    greeting: 'Stay in the lamplight, friend. The wood counts everyone who passes the gate.',
  },
  sexton_marrow: {
    id: 'sexton_marrow',
    name: 'Sexton Marrow',
    title: 'Sexton of Gallowmere',
    pos: { x: 363, z: 1436 },
    facing: -2.0,
    color: 0x6a6a72,
    questIds: ['q_ww_bells_of_gallowmere', 'q_ww_silk_in_the_eaves', 'q_ww_the_last_vicar'],
    greeting: 'We bury them deep here, and we ring the bells so they remember to stay down.',
  },
  widow_tansy: {
    id: 'widow_tansy',
    name: 'Widow Tansy',
    title: 'Candlewright of Gallowmere',
    pos: { x: 357, z: 1424 },
    facing: 0.7,
    color: 0xb8a2c8,
    questIds: ['q_ww_widows_skeins', 'q_ww_candles_at_the_bounds'],
    greeting: 'A candle for every grave, and not one may go out. Not one, do you hear me?',
  },
  vicar_creel: {
    id: 'vicar_creel',
    name: 'Vicar Creel',
    title: 'Last Vicar of the Mournstone',
    pos: { x: 296, z: 1614 },
    facing: 0.4,
    color: 0x8f9a88,
    questIds: [
      'q_ww_the_last_vicar',
      'q_ww_wraiths_of_the_tarn',
      'q_ww_what_the_bark_holds',
      'q_ww_horn_of_the_huntsman',
    ],
    greeting: 'The chapel fell years ago. The dead beneath it did not notice, and so I stayed.',
  },
};

export const WRAITHWOOD_QUESTS: Record<string, QuestDef> = {
  q_ww_bells_of_gallowmere: {
    id: 'q_ww_bells_of_gallowmere',
    name: 'The Bells of Gallowmere',
    giverNpcId: 'lampman_cobb',
    turnInNpcId: 'sexton_marrow',
    // "the north road" stands: Cobb is at (387, 1283) and Gallowmere at
    // (360, 1430), i.e. +z with a hair of -x, bearing 10 degrees, which is N.
    text: 'Hear that tolling, $N? That is Gallowmere, up the north road, ringing its dead to sleep. Sexton Marrow keeps the count of every soul under the canopy, living and buried. Go and be counted, before the wood counts you itself.',
    completionText:
      'Cobb sent you up the road whole, did he? Good man. He has kept those gate lanterns lit for thirty years, and the wood has never once got past him. Welcome to Gallowmere, $N. Mind the bells.',
    objectives: [
      {
        type: 'interact',
        targetNpcId: 'sexton_marrow',
        count: 1,
        label: 'Report to Sexton Marrow',
      },
    ],
    xpReward: 2600,
    copperReward: 1000,
    itemRewards: {},
    minLevel: 19,
  },
  q_ww_silk_in_the_eaves: {
    id: 'q_ww_silk_in_the_eaves',
    name: 'Silk in the Eaves',
    giverNpcId: 'sexton_marrow',
    turnInNpcId: 'sexton_marrow',
    // "the west road": the Thicket road runs from Gallowmere at (360, 1430) to
    // Widow's Thicket at (280, 1484), i.e. -x and +z, bearing 56 degrees, and
    // -x is EAST here, so the road out to it is the NORTHEAST road.
    text: 'Look up when you walk the northeast road, $N, and you will see them: wrapped shapes in the canopy, swaying where no wind reaches. The widowsilk spinners have crept out of the Thicket and strung their larders over my lanterns. Kill ten, and the road is a road again.',
    completionText:
      'Ten fewer weavers in the eaves. The lamplighters will walk their rounds tonight without looking up, and that is worth more here than you know.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'widowsilk_spinner',
        count: 10,
        label: 'Widowsilk Spinner slain',
      },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_ww_bells_of_gallowmere',
  },
  q_ww_widows_skeins: {
    id: 'q_ww_widows_skeins',
    name: "The Widow's Skeins",
    giverNpcId: 'widow_tansy',
    turnInNpcId: 'widow_tansy',
    text: 'The spinners take our dead for their larders, $N, so I take their silk for our shrouds. It burns clean and it holds a blessing better than linen ever did. Bring me six skeins of widowsilk, and the next soul we bury goes down wrapped and warded.',
    completionText:
      'Six skeins, soft as a held breath. The dead will lie easier in this. Take these wraps, I sewed them from the last batch, and the wood has never once bitten through them.',
    objectives: [
      { type: 'collect', itemId: 'widowsilk_skein', count: 6, label: 'Widowsilk Skein' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {
      warrior: 'gravebound_silk_wraps',
      mage: 'gravebound_silk_wraps',
      rogue: 'gravebound_silk_wraps',
    },
    requiresQuest: 'q_ww_bells_of_gallowmere',
  },
  q_ww_candles_at_the_bounds: {
    id: 'q_ww_candles_at_the_bounds',
    name: 'Candles at the Bounds',
    giverNpcId: 'widow_tansy',
    turnInNpcId: 'widow_tansy',
    text: 'Four boundary stones ring Gallowmere, $N, one on each road out, and a grave-candle burns on every stone. While they burn, the buried stay buried. The drizzle has drowned them, all four, and I am too old to walk the bounds alone. Take my taper and relight them, quickly.',
    completionText:
      'All four burning? Then breathe, $N. You did not hear it, but the whole village did: the bells rang easier the moment the last wick caught.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'gallowmere_grave_candle',
        count: 4,
        label: 'Grave-candle relit',
      },
    ],
    xpReward: 4600,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_ww_bells_of_gallowmere',
  },
  q_ww_the_last_vicar: {
    id: 'q_ww_the_last_vicar',
    name: 'The Last Vicar',
    giverNpcId: 'sexton_marrow',
    turnInNpcId: 'vicar_creel',
    // "South of here": Marrow stands at (363, 1436) and the Mournstone Chapel
    // sits at (300, 1620), i.e. +z with some -x, bearing 19 degrees, so NORTH.
    text: 'North of here the Mournstone Chapel moulders by its black tarn, and one man still tends it: Vicar Creel, who would not leave when the roof came down. He knows the old rites better than my bells do, $N, and he has not sent word in a month. Walk the chapel road and see him breathing.',
    completionText:
      'Marrow worries after me? That is new. Tell him the Mournstone stands, after a fashion, and so do I. Stay a while, $N. The tarn has been whispering, and I would rather not listen alone.',
    objectives: [
      { type: 'interact', targetNpcId: 'vicar_creel', count: 1, label: 'Find Vicar Creel' },
    ],
    xpReward: 2800,
    copperReward: 1100,
    itemRewards: {},
    requiresQuest: 'q_ww_silk_in_the_eaves',
    minLevel: 20,
  },
  q_ww_wraiths_of_the_tarn: {
    id: 'q_ww_wraiths_of_the_tarn',
    name: 'Wraiths of the Tarn',
    giverNpcId: 'vicar_creel',
    turnInNpcId: 'vicar_creel',
    text: 'The wood wraiths were the chapel wardens once, $N, grown from trees planted over the honored dead. Since the tarn turned black they have forgotten their office, and now they drift through my graveyard pulling at the soil. Break eight of them apart before they finish what they have started.',
    completionText:
      'Eight wardens laid down at last. I will not call it a mercy in daylight, but between us, $N, it was one.',
    objectives: [
      { type: 'kill', targetMobId: 'wood_wraith', count: 8, label: 'Wood Wraith slain' },
    ],
    xpReward: 4800,
    copperReward: 2400,
    itemRewards: {},
    requiresQuest: 'q_ww_the_last_vicar',
  },
  q_ww_what_the_bark_holds: {
    id: 'q_ww_what_the_bark_holds',
    name: 'What the Bark Holds',
    giverNpcId: 'vicar_creel',
    turnInNpcId: 'vicar_creel',
    // "east of Gallowmere": the Hanging Glade sits at (440, 1530) against the
    // hub at (360, 1430), i.e. +x and +z, bearing 321 degrees, and +x is WEST
    // here, so the glade hangs NORTHWEST of the hamlet.
    text: 'In the Hanging Glade northwest of Gallowmere the spinners hang their silk-wrapped dead from the boughs, and the gravenbark shamblers stand guard beneath like patient pallbearers. Those are our people up there, $N. Break five shamblers, cut down three of the wrapped dead, and bring them home to soil.',
    completionText:
      'Three souls back under honest ground before nightfall. The shamblers will grow back, bark always does, but tonight the glade hangs empty, and that is enough.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'gravenbark_shambler',
        count: 5,
        label: 'Gravenbark Shambler felled',
      },
      {
        type: 'interact',
        targetObjectItemId: 'silkbound_remains',
        count: 3,
        label: 'Silkbound remains cut down',
      },
    ],
    xpReward: 5200,
    copperReward: 2800,
    itemRewards: {},
    requiresQuest: 'q_ww_the_last_vicar',
  },
  q_ww_horn_of_the_huntsman: {
    id: 'q_ww_horn_of_the_huntsman',
    name: 'The Horn of the Huntsman',
    giverNpcId: 'vicar_creel',
    turnInNpcId: 'vicar_creel',
    // "north of here": Creel speaks from the chapel at (296, 1614) and the
    // Huntsman's Clearing is at (380, 1680), i.e. +x and +z, bearing 308
    // degrees, and +x is WEST here, so the clearing lies NORTHWEST of him.
    text: 'You have heard the horn by now, $N, thin and far off, the sound the whole wood holds its breath for. The Pale Huntsman rides his clearing northwest of here, and every grave he passes grows shallower. He was a man once, and he was buried wrong, and I am done pretending prayer will do it. Take a friend, take two, and unhorse him.',
    completionText:
      'The horn stopped mid-note. Every bell in Gallowmere rang once, on its own, and then the wood went quieter than I have heard it in thirty years. You have done the rite I could not, $N. Wear this, and walk under the canopy unafraid.',
    objectives: [
      { type: 'kill', targetMobId: 'pale_huntsman', count: 1, label: 'The Pale Huntsman unhorsed' },
    ],
    xpReward: 6200,
    copperReward: 3800,
    itemRewards: {
      warrior: 'mantle_of_the_unhorsed',
      mage: 'mantle_of_the_unhorsed',
      rogue: 'mantle_of_the_unhorsed',
    },
    requiresQuest: 'q_ww_what_the_bark_holds',
    minLevel: 20,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (not strictly chain order), matching the
// Veiled Hollow convention. Upstream's `q_ww_walking_mosley_home` sat between
// the bark quest and the horn; it is an escort quest and is not ported.
export const WRAITHWOOD_QUEST_ORDER: string[] = [
  'q_ww_bells_of_gallowmere',
  'q_ww_silk_in_the_eaves',
  'q_ww_widows_skeins',
  'q_ww_candles_at_the_bounds',
  'q_ww_the_last_vicar',
  'q_ww_wraiths_of_the_tarn',
  'q_ww_what_the_bark_holds',
  'q_ww_horn_of_the_huntsman',
];

export const WRAITHWOOD_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  widowsilk_skein: {
    id: 'widowsilk_skein',
    name: 'Widowsilk Skein',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ww_widows_skeins',
  },
  gallowmere_grave_candle: {
    id: 'gallowmere_grave_candle',
    name: 'Grave-Candle',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ww_candles_at_the_bounds',
    noVendorSell: true,
  },
  silkbound_remains: {
    id: 'silkbound_remains',
    name: 'Silkbound Remains',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_ww_what_the_bark_holds',
    noVendorSell: true,
  },
  // --- quest rewards ---
  gravebound_silk_wraps: {
    id: 'gravebound_silk_wraps',
    name: 'Gravebound Silk Wraps',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'gloves',
    quality: 'uncommon',
    stats: { armor: 52, sta: 3, spi: 3 },
    sellValue: 1000,
  },
  mantle_of_the_unhorsed: {
    id: 'mantle_of_the_unhorsed',
    name: 'Mantle of the Unhorsed',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 76, sta: 6, spi: 4 },
    sellValue: 2400,
  },
};

// Upstream's scatter camps, verbatim: no `positions`, so world generation still
// places these itself. The central freeze pass (realms/CLAUDE.md) captures the
// scatter and pins it; that pass is not this file's.
export const WRAITHWOOD_CAMPS: CampDef[] = [
  { mobId: 'widowsilk_spinner', center: { x: 282, z: 1478 }, radius: 10, count: 3,
    positions: [{ x: 282.41, z: 1485.68 }, { x: 280.64, z: 1481.97 }, { x: 272.65, z: 1474.59 }] },
  { mobId: 'widowsilk_spinner', center: { x: 468, z: 1464 }, radius: 10, count: 3,
    positions: [{ x: 467.6, z: 1467.43 }, { x: 468.58, z: 1459.51 }, { x: 461.43, z: 1471.05 }] },
  { mobId: 'wood_wraith', center: { x: 306, z: 1616 }, radius: 9, count: 3,
    positions: [{ x: 311.57, z: 1618.98 }, { x: 309.31, z: 1619.54 }, { x: 309.76, z: 1615.7 }] },
  { mobId: 'wood_wraith', center: { x: 418, z: 1568 }, radius: 10, count: 3,
    positions: [{ x: 417.37, z: 1576.24 }, { x: 418.4, z: 1570.76 }, { x: 415, z: 1567.42 }] },
  { mobId: 'gravenbark_shambler', center: { x: 444, z: 1526 }, radius: 10, count: 2,
    positions: [{ x: 450.85, z: 1528.6 }, { x: 434.96, z: 1529.47 }] },
  { mobId: 'pale_huntsman', center: { x: 380, z: 1680 }, radius: 5, count: 1,
    positions: [{ x: 376.63, z: 1681.89 }] },
];

export const WRAITHWOOD_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'gallowmere_grave_candle',
    name: 'Grave-Candle',
    // The four boundary stones of Gallowmere, one on each road out of the
    // hamlet (q_ww_candles_at_the_bounds).
    positions: [
      { x: 370, z: 1384 }, // the Crowgate road
      { x: 324, z: 1452 }, // the Widow's Thicket road
      { x: 394, z: 1466 }, // the Hanging Glade road
      { x: 340, z: 1498 }, // the chapel road
    ],
  },
  {
    itemId: 'silkbound_remains',
    name: 'Silkbound Remains',
    // Wrapped shapes hung low in the Hanging Glade, under the shamblers'
    // watch (q_ww_what_the_bark_holds).
    positions: [
      { x: 432, z: 1516 },
      { x: 446, z: 1536 },
      { x: 438, z: 1544 },
    ],
  },
];

export const WRAITHWOOD_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Gallowmere: a shuttered hamlet under the eaves
  buildings: [
    { kind: 'inn', x: 352, z: 1434, w: 6, d: 7, rot: 0.5 },
    { kind: 'house', x: 368, z: 1426, w: 6, d: 6, rot: -1.2 },
    { kind: 'house', x: 354, z: 1420, w: 5, d: 5, rot: 2.3 },
    { kind: 'chapel', x: 365, z: 1440, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: 360, z: 1432, r: 1.5 }],
  stalls: [{ x: 356, z: 1426, rot: 0.6, r: 1.6 }],
  crates: [
    [349, 1430],
    [369, 1432],
  ],
  campfires: [
    [360, 1428],
    [389, 1280], // the Crowgate's waycamp
  ],
  fences: [
    // the hamlet huddles behind its fence line
    { x1: 346, z1: 1416, x2: 374, z2: 1416 },
    { x1: 346, z1: 1446, x2: 374, z2: 1446 },
  ],
  // the Mournstone Chapel ruin and the Huntsman's ring of broken columns
  ruinRings: [
    { x: 300, z: 1620, ringR: 8, columns: 6 },
    { x: 380, z: 1680, ringR: 9, columns: 5 },
  ],
  // grave fields: the wood buries its own
  graveyards: [
    { x: 294, z: 1612 },
    { x: 386, z: 1420 },
    { x: 434, z: 1538 },
  ],
};
