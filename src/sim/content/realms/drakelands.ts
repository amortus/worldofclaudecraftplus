// The Drakelands (levels 16-20), ported from upstream `src/sim/content/drakelands.ts`.
//
// The volcanic column north of the Pale Causeway: a green gatewood at the
// entrance that dries northward into cinder desert, dune seas, and the Drakemaw
// belt of lava pools and bloodglass crystal, where the dragonkin brood roosts
// and the troll clans raid. The garrison town of Wyrmwatch holds the causeway
// gate; the road climbs in through the Wyrmgate pass on the southern border
// (southPassX 404) and leaves again at the Snowline on the lower-x border.
//
// WHAT CHANGED FROM UPSTREAM, and why. Their rect, ids, level band, mobs, NPCs,
// quests, items, camps, objects and prose are taken verbatim except:
//   - `riftPortalEligible` / `riftTierWeights` are not fields of our ZoneDef.
//     Our rift rotation is DERIVED (`riftEligibleZones`, data.ts: any zone whose
//     level band reaches the cap), and this zone reaches 20, so it joins the
//     rotation anyway.
//   - POI records carry no `id` here; our `ZoneDef.pois` is `{x, z, label}`.
//   - `PortalDef` has no equivalent here and upstream's list is empty anyway:
//     the Drakelands is the one zone walked into on foot from a hidden realm.
//   - `MobTemplate.componentTags` (whelp, broodguard, broodlord, dune troll) is
//     an upstream corpse-harvest surface we do not have, and `offStreamIdle`,
//     `xpMult`, `wanderHaste` and `hardLeashRadius` are upstream spawn/AI knobs
//     our MobTemplate has no field for. All dropped rather than faked. Every
//     `family` used here is already one of our 11 and needed no remap.
//   - The BOSS KIT FIELDS `engageShout`, `arcCleave`, `breathCone` and
//     `counterStun` (the broodlord's and the matriarch's wake-shout, front-arc
//     cleave, fire cone and tail counter-stun) are upstream mob mechanics with
//     no field on our MobTemplate, so they are dropped rather than re-plumbed
//     onto a different primitive (`aoePulse`/`stomp`/`bigCast` would be a fake,
//     not a port). Both keep `elite`, `rare` and their `yells.engage` bark.
//   - The BROOD PUZZLE MOBS are not ported: `dragonkin_egg` (a 1 HP shell) and
//     `dragonkin_whelp` (its hatchling) exist only to drive upstream's
//     `src/sim/mob/dragonkin_brood.ts`, a sim module outside this content port.
//     Without it an egg is an inert one-shot kill that pays FULL level-20 XP
//     (upstream's `xpMult: 0` is not a field we have) and a whelp can never
//     spawn at all, so the two templates and the 15 egg camps that came with
//     them are dropped. The broodguards, the four broodlords and the matriarch
//     they guarded all stay.
//   - `CampDef.offStream` (on the whole brood block) has no field here.
//   - `DRAKELANDS_FLOWER_MEADOWS` and `ZonePropsDef.decorProps` (which upstream
//     fills from `castle_layout`'s `CASTLE_BUILDINGS`) are render-side records
//     keyed to upstream asset packs; `src/render/` is out of this port's scope,
//     and the `castle_layout` import goes with them.
//   - THE LAST KEEP IS A POI ONLY. Upstream rebuilds it as a walled garrison
//     with an interior instance; our dungeon/raid tables live elsewhere and are
//     out of scope, so only the POI, the courtyard well and the market stalls
//     survive. Its interior keepsake `last_keep_signet` is dropped with it: the
//     instance was its one and only source.
//   - `reins_drakemaw_raptor` is dropped. Our `ItemDef.kind` has no `'mount'`
//     member and no `mount` field, and upstream ships the reins with NO
//     acquisition path at all (the drop was pulled), so there is nothing to
//     port but a dead def.
//   - Upstream splits its camps across three exports (`DRAKELANDS_CAMPS`,
//     `DRAKELANDS_QUEST_CAMPS`, `DRAKELANDS_BROOD_CAMPS`) that their data.ts
//     tail-appends in that order. We ship one `DRAKELANDS_CAMPS` holding all
//     three blocks in that same order.
//   - DIRECTION WORDS ARE RE-DERIVED. Upstream writes +x as EAST; this world is
//     +z NORTH and +x WEST, so east is -x. Every compass word in player-visible
//     copy below was recomputed from the live coordinates, with the derivation
//     cited at the site. Two of upstream's own lines were wrong on their own
//     axes as well (the dune fires and the crater's north rim); those are
//     corrected here from the coordinates, not translated.
//
// Camps are authored the way upstream wrote them, as scatter camps with
// `center`/`radius`/`count` and no `positions`. Freezing them to exact spots
// (the rule the rest of this pack holds, so world generation draws no rng) is a
// later central pass, not this file's job.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';
import { emptyZoneProps } from '../../types';

export const DRAKELANDS_ZONE: ZoneDef = {
  id: 'drakelands',
  name: 'The Drakelands',
  zMin: 1820,
  zMax: 2420,
  xMin: 180,
  xMax: 540,
  levelRange: [16, 20],
  biome: 'ember',
  // The Wyrmgate: the pass through this zone's SOUTHERN border ridge, where the
  // causeway road climbs out of the haunted wood and into the ash.
  southPassX: 404,
  // The Snowline, where ash meets ice: the pass through this zone's LOWER-x
  // border. `eastPassZ`/`westPassZ` are the border-edge names world.ts reads
  // (higher-x / lower-x side), not compass words: the lower-x edge is the EAST
  // edge here.
  westPassZ: 1890,
  hub: { x: 404, z: 1900, radius: 24, name: 'Wyrmwatch' },
  graveyard: { x: 422, z: 1885 },
  lakes: [
    { x: 340, z: 1925, radius: 14 }, // Greenshade Pool, under the gatewood
    // ...its shaded eastern finger: (326, 1936) sits at -x from the pool at
    // x 340, and -x is EAST here (upstream called it the western finger).
    { x: 326, z: 1936, radius: 8 },
    { x: 456, z: 1988, radius: 11 }, // the Last Spring, at the forest's edge
    { x: 300, z: 2110, radius: 10 }, // Mirage Hollow, a dune oasis
  ],
  pois: [
    { x: 404, z: 1900, label: 'Wyrmwatch' },
    { x: 360, z: 1940, label: 'The Gatewood' },
    { x: 330, z: 2100, label: 'Cinder Dunes' },
    { x: 460, z: 2140, label: 'Trollmoot' },
    { x: 406, z: 2032, label: 'The Last Keep' },
    { x: 270, z: 2270, label: 'Bloodglass Fields' },
    { x: 390, z: 2320, label: 'Drakemaw Caldera' },
  ],
  welcome:
    'Hot wind rolls off the wastes ahead. Dragons wheel over the Drakemaw, and troll fires burn in the dunes.',
  welcomeQuestId: 'q_dk_ash_on_the_wind',
};

// The causeway road runs on through the Wyrmgate, then forks into the wastes.
export const DRAKELANDS_ROADS: { x: number; z: number }[][] = [
  [
    { x: 404, z: 1804 },
    { x: 404, z: 1850 },
    { x: 404, z: 1900 },
  ], // the Pale Causeway -> the Wyrmgate pass -> Wyrmwatch
  [
    { x: 404, z: 1900 },
    { x: 370, z: 1970 },
    { x: 350, z: 2040 },
    { x: 330, z: 2100 },
  ], // Wyrmwatch -> Cinder Dunes
  [
    { x: 330, z: 2100 },
    { x: 380, z: 2180 },
    { x: 390, z: 2280 },
    { x: 390, z: 2298 },
  ], // Cinder Dunes -> the Drakemaw crater rim
  [
    { x: 380, z: 2180 },
    { x: 460, z: 2140 },
  ], // dune fork -> Trollmoot
  [
    { x: 330, z: 2100 },
    { x: 270, z: 2210 },
    { x: 270, z: 2270 },
  ], // Cinder Dunes -> Bloodglass Fields
  [
    { x: 380, z: 2180 },
    { x: 352, z: 2280 },
    { x: 350, z: 2355 },
  ], // the dune fork -> the crater's NORTHEAST rim: (350, 2355) bears 49 degrees
  // off the caldera at (390, 2320), i.e. +z and -x, and -x is EAST here
  [
    { x: 330, z: 2100 },
    { x: 276, z: 2044 },
    { x: 230, z: 1964 },
    { x: 186, z: 1892 },
  ], // the Cinder Dunes -> the Snowline crossing on the lower-x border (fire
  // meets ice), bearing 145 degrees, i.e. SOUTHEAST here
];

// The wastes' inhabitants: the dragonkin brood holds the Drakemaw belt
// (broodlords standing over their nests, broodguards patrolling between them),
// the ashbone dead muster in the dunes, and the troll clans raid the roads.
export const DRAKELANDS_MOBS: Record<string, MobTemplate> = {
  // RETIRED from spawning upstream (the dragonkin brood rework): the wheeling
  // drake was replaced by the ground brood below. The template stays so nothing
  // that recorded the id (kill credit in old saves, combat logs) dangles; it has
  // no camp, so it never spawns. Its quest scale drop moved to the brood.
  emberwing_drake: {
    id: 'emberwing_drake',
    name: 'Emberwing Drake',
    minLevel: 19,
    maxLevel: 20,
    family: 'dragonkin',
    hpBase: 130,
    hpPerLevel: 32,
    dmgBase: 16,
    dmgPerLevel: 3.0,
    attackSpeed: 2.2,
    armorPerLevel: 16,
    moveSpeed: 9,
    aggroRadius: 18,
    elite: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'emberwing_scale', chance: 0.7, questId: 'q_dk_scales_of_the_maw' },
    ],
    scale: 1.4,
    color: 0xd84028,
  },
  // The brood's rank and file, walking the belt between the nests. (Upstream
  // roots it mid-shout on the pull; `engageShout` is not a field here.)
  dragonkin_broodguard: {
    id: 'dragonkin_broodguard',
    name: 'Dragonkin Broodguard',
    minLevel: 19,
    maxLevel: 20,
    family: 'dragonkin',
    hpBase: 60,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.5,
    attackSpeed: 2.0,
    armorPerLevel: 14,
    moveSpeed: 8.5,
    aggroRadius: 14,
    loot: [
      { copper: 90, chance: 1 },
      { itemId: 'emberwing_scale', chance: 0.5, questId: 'q_dk_scales_of_the_maw' },
    ],
    // the menace ladder reads guard 1.5 -> broodlord 2.25 -> matriarch 2.85
    scale: 1.5,
    color: 0x3e6b4f,
  },
  // The clutch-lords of the Drakemaw: four stand across the dragon belt, each
  // over its own nest. Rare-flagged, so the respawn window keeps them feeling
  // like standing minibosses.
  drakemaw_broodlord: {
    id: 'drakemaw_broodlord',
    name: 'Drakemaw Broodlord',
    minLevel: 20,
    maxLevel: 20,
    family: 'dragonkin',
    hpBase: 150,
    hpPerLevel: 34,
    dmgBase: 17,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 17,
    moveSpeed: 9.5,
    aggroRadius: 20,
    elite: true,
    rare: true,
    loot: [
      { copper: 100, chance: 1 },
      { itemId: 'emberwing_scale', chance: 0.9, questId: 'q_dk_scales_of_the_maw' },
    ],
    scale: 2.25,
    color: 0x50392e,
    yells: {
      engage: 'The brood wakes! Rise, hatchlings, and strip their bones!',
    },
  },
  ashbone_raider: {
    id: 'ashbone_raider',
    name: 'Ashbone Raider',
    minLevel: 17,
    maxLevel: 18,
    family: 'undead',
    hpBase: 50,
    hpPerLevel: 18,
    dmgBase: 10,
    dmgPerLevel: 2.2,
    attackSpeed: 1.9,
    armorPerLevel: 12,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [
      { copper: 90, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.4 },
      { itemId: 'ashbone_war_brand', chance: 0.6, questId: 'q_dk_marrow_and_ash' },
    ],
    scale: 1,
    color: 0xe8dcc8,
  },
  ashbone_warcaller: {
    id: 'ashbone_warcaller',
    name: 'Ashbone Warcaller',
    minLevel: 18,
    maxLevel: 19,
    family: 'undead',
    hpBase: 62,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.4,
    attackSpeed: 2.1,
    armorPerLevel: 13,
    moveSpeed: 8,
    aggroRadius: 13,
    loot: [
      { copper: 95, chance: 1 },
      { itemId: 'bone_fragments', chance: 0.4 },
      { itemId: 'ashbone_war_brand', chance: 0.6, questId: 'q_dk_marrow_and_ash' },
    ],
    scale: 1.1,
    color: 0xd8c8a8,
  },
  dune_troll: {
    id: 'dune_troll',
    name: 'Dune Troll',
    minLevel: 17,
    maxLevel: 19,
    family: 'troll',
    hpBase: 66,
    hpPerLevel: 22,
    dmgBase: 12,
    dmgPerLevel: 2.5,
    attackSpeed: 2.3,
    armorPerLevel: 14,
    moveSpeed: 8.5,
    aggroRadius: 14,
    loot: [
      { copper: 90, chance: 1 },
      { itemId: 'chipped_tusk', chance: 0.4 },
    ],
    scale: 1.15,
    color: 0xb07040,
  },
  // The brood-mother of the whole Drakemaw clutch, gold as a coal about to
  // catch against her green-scaled children (q_dk_matriarch_of_the_maw). Her
  // crater roost sits well off every marked road.
  cindraleth_maw_matriarch: {
    id: 'cindraleth_maw_matriarch',
    name: 'Cindraleth the Maw Matriarch',
    minLevel: 20,
    maxLevel: 20,
    family: 'dragonkin',
    hpBase: 170,
    hpPerLevel: 36,
    dmgBase: 18,
    dmgPerLevel: 3.2,
    attackSpeed: 2.3,
    armorPerLevel: 18,
    moveSpeed: 9,
    aggroRadius: 20,
    elite: true,
    loot: [{ copper: 100, chance: 1 }],
    // the matriarch keeps her half-again margin over the grown broodlords
    scale: 2.85,
    color: 0xf0b040,
    yells: {
      engage: 'You crunch across MY nursery, little thief. The Maw remembers its own.',
    },
  },
};

// The folk of the wastes: the gatecaptain and her quartermaster hold Wyrmwatch,
// and a lone scout camps in the far dunes within sight of the Orkadia wargate.
// The scout stands far from the hub on purpose: the war chain sends players out
// to find her.
export const DRAKELANDS_NPCS: Record<string, NpcDef> = {
  gatecaptain_brannoc: {
    id: 'gatecaptain_brannoc',
    name: 'Gatecaptain Brannoc',
    title: 'Commander of Wyrmwatch',
    pos: { x: 407, z: 1895 },
    facing: 2.6,
    color: 0xa84838,
    questIds: [
      'q_dk_ash_on_the_wind',
      'q_dk_banners_over_the_dunes',
      'q_dk_watcher_at_the_wargate',
      'q_dk_matriarch_of_the_maw',
    ],
    greeting: 'Wyrmwatch holds the gate. Has held it forty years. It will hold it tonight.',
  },
  quartermaster_sela: {
    id: 'quartermaster_sela',
    name: 'Quartermaster Sela',
    title: 'Keeper of the Garrison Stores',
    pos: { x: 398, z: 1908 },
    facing: -0.6,
    color: 0xc09858,
    questIds: ['q_dk_trolls_on_the_road', 'q_dk_scorched_stores'],
    greeting: 'Every crate in this yard crossed forty miles of ash to get here. Treat them kindly.',
  },
  scout_yerrin: {
    id: 'scout_yerrin',
    name: 'Scout Yerrin',
    title: 'Far-Dune Watcher',
    pos: { x: 494, z: 2100 },
    facing: -2.4,
    color: 0x8a7a58,
    questIds: [
      'q_dk_watcher_at_the_wargate',
      'q_dk_marrow_and_ash',
      'q_dk_scales_of_the_maw',
      'q_dk_matriarch_of_the_maw',
    ],
    greeting: 'Keep low. Sound carries strangely off the glass, and the gate below has ears.',
  },
};

export const DRAKELANDS_QUESTS: Record<string, QuestDef> = {
  q_dk_ash_on_the_wind: {
    id: 'q_dk_ash_on_the_wind',
    name: 'Ash on the Wind',
    giverNpcId: 'gatecaptain_brannoc',
    turnInNpcId: 'gatecaptain_brannoc',
    // "Look north off the palisade": the muster fires are the ashbone camps at
    // (356, 2086) and (296, 2184), and Brannoc stands at (407, 1895). Both bear
    // 15 to 21 degrees off him, i.e. +z, and +z is NORTH here. Upstream wrote
    // "south", which is wrong on its own axes too (its dunes are +z as well).
    text: 'Look north off the palisade, $N. Those fires in the dunes are not troll cookfires, they are ashbone musters, and every night there are more. The dead come up out of the bonefields with sand still in their teeth. Cut down ten raiders before they cut a road to my gate.',
    completionText:
      'Ten fewer blades in the dunes, and the muster fires burned lower last night. My sentries slept, which they have not done in a week. Well cut, $N.',
    objectives: [
      { type: 'kill', targetMobId: 'ashbone_raider', count: 10, label: 'Ashbone Raider slain' },
    ],
    xpReward: 3800,
    copperReward: 1800,
    itemRewards: {},
    minLevel: 16,
  },
  q_dk_trolls_on_the_road: {
    id: 'q_dk_trolls_on_the_road',
    name: 'Trolls on the Road',
    giverNpcId: 'quartermaster_sela',
    turnInNpcId: 'quartermaster_sela',
    text: 'The dune trolls have learned the sound of a supply wagon, $N. They hit the Cinder Dunes road three times this month, and the last driver walked in carrying nothing but the reins. Eight trolls off that road and my wagons roll again.',
    completionText:
      'Eight, and my drivers have stopped writing farewell letters before every run. The garrison eats because of you, $N.',
    objectives: [{ type: 'kill', targetMobId: 'dune_troll', count: 8, label: 'Dune Troll slain' }],
    xpReward: 4200,
    copperReward: 2000,
    itemRewards: {},
    minLevel: 16,
  },
  q_dk_scorched_stores: {
    id: 'q_dk_scorched_stores',
    name: 'Scorched Stores',
    giverNpcId: 'quartermaster_sela',
    turnInNpcId: 'quartermaster_sela',
    text: 'The last wagon burned, $N, but iron-strapped crates do not burn through. Four of them are still lying scorched along the dunes road with a season of salt, nails, and bowstrings inside. Bring my stores home before the trolls work out how to open them.',
    completionText:
      'Scorched black and every latch still holding. The smith gets his nails, the fletcher her strings, and you get the boots I was saving for whoever brought my crates back, $N.',
    objectives: [
      {
        type: 'interact',
        targetObjectItemId: 'scorched_supply_crate',
        count: 4,
        label: 'Scorched supply crate recovered',
      },
    ],
    xpReward: 4000,
    copperReward: 1900,
    itemRewards: {
      warrior: 'cinderwalk_treads',
      mage: 'cinderwalk_treads',
      rogue: 'cinderwalk_treads',
    },
    requiresQuest: 'q_dk_trolls_on_the_road',
    minLevel: 17,
  },
  q_dk_banners_over_the_dunes: {
    id: 'q_dk_banners_over_the_dunes',
    name: 'Banners over the Dunes',
    giverNpcId: 'gatecaptain_brannoc',
    turnInNpcId: 'gatecaptain_brannoc',
    text: 'The ashbone muster at the old bonefield graves, $N, and my patrols cannot read the dunes the way they read a wall. Kill five of their warcallers, the ones that scream the dead upright, and plant a warning banner on each muster ground so my sentries can mark it from the ridge.',
    completionText:
      'Three banners snapping in the hot wind, right where my glass can find them. With five warcallers silenced, whatever answers their call will come slower. You bought us time, $N.',
    objectives: [
      {
        type: 'kill',
        targetMobId: 'ashbone_warcaller',
        count: 5,
        label: 'Ashbone Warcaller slain',
      },
      {
        type: 'interact',
        targetObjectItemId: 'wyrmwatch_warning_banner',
        count: 3,
        label: 'Warning banner planted',
      },
    ],
    xpReward: 4800,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_dk_ash_on_the_wind',
    minLevel: 17,
  },
  q_dk_watcher_at_the_wargate: {
    id: 'q_dk_watcher_at_the_wargate',
    name: 'The Watcher at the Wargate',
    giverNpcId: 'gatecaptain_brannoc',
    turnInNpcId: 'scout_yerrin',
    // "pulling the ashbone west": the wargate ridge Yerrin watches is at
    // (494, 2100) and the bonefield musters average (326, 2135), so the pull
    // runs +x (bearing 258 degrees), and +x is WEST here.
    text: 'Something is pulling the ashbone west, $N, and I sent my best to learn what. Scout Yerrin has camped a month in the far dunes past Trollmoot, in sight of a gate nobody built in my lifetime. Her reports stopped ten days ago. Find her camp and get me her eyes.',
    completionText:
      'Brannoc sent you? Then my last runner never made it. Keep your voice down and sit, $N. You see that gate below? Count the war-banners in front of it, and you will understand why I stopped writing things down.',
    objectives: [
      { type: 'interact', targetNpcId: 'scout_yerrin', count: 1, label: 'Find Scout Yerrin' },
    ],
    xpReward: 2400,
    copperReward: 950,
    itemRewards: {},
    requiresQuest: 'q_dk_banners_over_the_dunes',
    minLevel: 18,
  },
  q_dk_marrow_and_ash: {
    id: 'q_dk_marrow_and_ash',
    name: 'Marrow and Ash',
    giverNpcId: 'scout_yerrin',
    turnInNpcId: 'scout_yerrin',
    text: 'Every ashbone raider carries a war-brand, $N: a scorched tally of the host it marches under. I have counted four hosts from this ridge, but guesses are not intelligence. Bring me six brands off the raiders and their warcallers, and I will give Brannoc the shape of the war that is coming.',
    completionText:
      'Six brands, and one mark burned into every one of them. This is no raid muster, $N. Every host in the dunes answers to the wargate below us, the trolls call it Orkadia, and no five soldiers I ever served with could break what drums behind that door. Perhaps five like you.',
    objectives: [
      { type: 'collect', itemId: 'ashbone_war_brand', count: 6, label: 'Ashbone War-Brand' },
    ],
    xpReward: 4400,
    copperReward: 2200,
    itemRewards: {},
    requiresQuest: 'q_dk_watcher_at_the_wargate',
  },
  q_dk_scales_of_the_maw: {
    id: 'q_dk_scales_of_the_maw',
    name: 'Scales of the Maw',
    giverNpcId: 'scout_yerrin',
    turnInNpcId: 'scout_yerrin',
    text: 'When the wind turns off the Drakemaw, the emberwing drakes ride it over my camp low enough to count their teeth, $N. They range farther every day, and something in that crater drives them. Bring me three of their scales. Scales remember heat, and I can read where a drake has been roosting by the burn.',
    completionText:
      'Look at the underside of this one, $N: scorched in a spiral, and only one thing nests in circles. These drakes are brood-guards. Something in the Drakemaw is a mother.',
    objectives: [
      { type: 'collect', itemId: 'emberwing_scale', count: 3, label: 'Emberwing Scale' },
    ],
    xpReward: 5000,
    copperReward: 2600,
    itemRewards: {},
    requiresQuest: 'q_dk_watcher_at_the_wargate',
    minLevel: 19,
    suggestedPlayers: 2,
  },
  q_dk_matriarch_of_the_maw: {
    id: 'q_dk_matriarch_of_the_maw',
    name: 'Matriarch of the Maw',
    giverNpcId: 'scout_yerrin',
    turnInNpcId: 'gatecaptain_brannoc',
    text: 'The scales told it true, $N. I climbed the rim at dawn and saw her on the crater floor: Cindraleth, the matriarch every emberwing in this sky was hatched under, gold as a coal about to catch. While she broods, the drakes grow bolder, and Wyrmwatch cannot fight dragons and the ashbone both. End her in her crater, then carry the word to Gatecaptain Brannoc. Do not go alone.',
    completionText:
      "The sky over the Drakemaw has been empty for two days, and now you walk through my gate with a matriarch's blood on your boots. Wyrmwatch has stood forty years on watch for exactly this, $N. Take these pauldrons, mawscale, worked by our own smith. Wear them where the drakes can see.",
    objectives: [
      {
        type: 'kill',
        targetMobId: 'cindraleth_maw_matriarch',
        count: 1,
        label: 'Cindraleth the Maw Matriarch slain',
      },
    ],
    xpReward: 6000,
    copperReward: 3600,
    itemRewards: {
      warrior: 'mawscale_pauldrons',
      mage: 'mawscale_pauldrons',
      rogue: 'mawscale_pauldrons',
    },
    requiresQuest: 'q_dk_scales_of_the_maw',
    minLevel: 19,
    suggestedPlayers: 2,
  },
};

// Level-braided presentation order (not strictly chain order).
export const DRAKELANDS_QUEST_ORDER: string[] = [
  'q_dk_ash_on_the_wind',
  'q_dk_trolls_on_the_road',
  'q_dk_scorched_stores',
  'q_dk_banners_over_the_dunes',
  'q_dk_watcher_at_the_wargate',
  'q_dk_marrow_and_ash',
  'q_dk_scales_of_the_maw',
  'q_dk_matriarch_of_the_maw',
];

export const DRAKELANDS_ITEMS: Record<string, ItemDef> = {
  // --- quest items ---
  ashbone_war_brand: {
    id: 'ashbone_war_brand',
    name: 'Ashbone War-Brand',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_dk_marrow_and_ash',
  },
  emberwing_scale: {
    id: 'emberwing_scale',
    name: 'Emberwing Scale',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_dk_scales_of_the_maw',
  },
  scorched_supply_crate: {
    id: 'scorched_supply_crate',
    name: 'Scorched Supply Crate',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_dk_scorched_stores',
    noVendorSell: true,
  },
  wyrmwatch_warning_banner: {
    id: 'wyrmwatch_warning_banner',
    name: 'Wyrmwatch Warning Banner',
    kind: 'quest',
    sellValue: 0,
    questId: 'q_dk_banners_over_the_dunes',
    noVendorSell: true,
  },
  // --- quest rewards ---
  cinderwalk_treads: {
    id: 'cinderwalk_treads',
    name: 'Cinderwalk Treads',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'feet',
    quality: 'uncommon',
    stats: { armor: 58, sta: 4, spi: 3 },
    sellValue: 900,
  },
  mawscale_pauldrons: {
    id: 'mawscale_pauldrons',
    name: 'Mawscale Pauldrons',
    kind: 'armor',
    armorType: 'cloth',
    slot: 'shoulder',
    quality: 'rare',
    stats: { armor: 72, sta: 6, int: 4 },
    sellValue: 2200,
  },
};

// Upstream's three camp blocks in their tail-append order: the road camps, then
// the quest camps (a warcaller muster and the matriarch's crater roost), then
// the brood belt (the fourth broodlord and the broodguard patrols). Authored as
// upstream wrote them, as scatter camps with no `positions`.
export const DRAKELANDS_CAMPS: CampDef[] = [
  { mobId: 'dune_troll', center: { x: 460, z: 2140 }, radius: 10, count: 3,
    positions: [{ x: 462.29, z: 2145.21 }, { x: 456.87, z: 2142.88 }, { x: 455.99, z: 2146.09 }] },
  { mobId: 'dune_troll', center: { x: 476, z: 2124 }, radius: 8, count: 2,
    positions: [{ x: 480.04, z: 2121.65 }, { x: 477.03, z: 2126.83 }] },
  { mobId: 'ashbone_raider', center: { x: 356, z: 2086 }, radius: 10, count: 3,
    positions: [{ x: 354.31, z: 2086.81 }, { x: 360.15, z: 2093.27 }, { x: 359.47, z: 2093.57 }] },
  { mobId: 'ashbone_raider', center: { x: 296, z: 2184 }, radius: 10, count: 3,
    positions: [{ x: 296.01, z: 2185.01 }, { x: 303.16, z: 2180.31 }, { x: 287.44, z: 2182.64 }] },
  { mobId: 'ashbone_warcaller', center: { x: 448, z: 2106 }, radius: 8, count: 2,
    positions: [{ x: 444.95, z: 2107.36 }, { x: 451.59, z: 2110.61 }] },
  // the broodlord dens, on the level shelves at the volcano feet
  { mobId: 'drakemaw_broodlord', center: { x: 419, z: 2266 }, radius: 8, count: 1,
    positions: [{ x: 422.25, z: 2261.6 }] },
  { mobId: 'drakemaw_broodlord', center: { x: 288, z: 2278 }, radius: 8, count: 1,
    positions: [{ x: 285.87, z: 2279.27 }] },
  // --- upstream's DRAKELANDS_QUEST_CAMPS ---
  { mobId: 'ashbone_warcaller', center: { x: 302, z: 2180 }, radius: 8, count: 2,
    positions: [{ x: 299.9, z: 2183.99 }, { x: 303.27, z: 2176.91 }] },
  { mobId: 'drakemaw_broodlord', center: { x: 352, z: 2352 }, radius: 8, count: 1,
    positions: [{ x: 346.52, z: 2347.37 }] },
  // Cindraleth's roost: a lava crater on the Drakemaw's WEST flank ((436, 2348)
  // sits at +x from the caldera at x 390, and +x is WEST here), well away from
  // every marked road.
  { mobId: 'cindraleth_maw_matriarch', center: { x: 436, z: 2348 }, radius: 6, count: 1,
    positions: [{ x: 439.87, z: 2348.63 }] },
  // --- upstream's DRAKELANDS_BROOD_CAMPS ---
  // the fourth broodlord: the WEST rim over the wargate approach ((458, 2302)
  // bears 255 degrees off the caldera at (390, 2320), i.e. +x, and +x is WEST
  // here; upstream called it the southeast rim)
  { mobId: 'drakemaw_broodlord', center: { x: 458, z: 2302 }, radius: 8, count: 1,
    positions: [{ x: 450.75, z: 2303.47 }] },
  // broodguard patrols: the caldera belt, Bloodglass, and the dune approach
  { mobId: 'dragonkin_broodguard', center: { x: 378, z: 2242 }, radius: 9, count: 3,
    positions: [{ x: 379.33, z: 2240.28 }, { x: 372.47, z: 2241.92 }, { x: 376.27, z: 2234.26 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 392, z: 2296 }, radius: 9, count: 3,
    positions: [{ x: 390.9, z: 2288.93 }, { x: 394.03, z: 2294.37 }, { x: 397.08, z: 2292.29 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 352, z: 2282 }, radius: 8, count: 2,
    positions: [{ x: 352.26, z: 2284.83 }, { x: 352.11, z: 2284.54 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 418, z: 2338 }, radius: 8, count: 2,
    positions: [{ x: 410.37, z: 2338.07 }, { x: 415.07, z: 2333.62 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 302, z: 2302 }, radius: 9, count: 3,
    positions: [{ x: 305.41, z: 2300.66 }, { x: 303.49, z: 2309.42 }, { x: 304.78, z: 2309.88 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 268, z: 2252 }, radius: 8, count: 2,
    positions: [{ x: 268.89, z: 2259.64 }, { x: 260.58, z: 2254.57 }] },
  { mobId: 'dragonkin_broodguard', center: { x: 438, z: 2384 }, radius: 8, count: 2,
    positions: [{ x: 441.76, z: 2386.97 }, { x: 444.07, z: 2384.23 }] },
];

export const DRAKELANDS_OBJECTS: GroundObjectDef[] = [
  {
    itemId: 'scorched_supply_crate',
    name: 'Scorched Supply Crate',
    // Strewn where the burned wagon broke apart along the Wyrmwatch to Cinder
    // Dunes road. The second crate used to sit at x 360, on the Last Keep's
    // curtain-wall centerline, where upstream's castle lifted it onto the
    // wall-walk and nobody could find it; it lies on the open ground beside the
    // wall foot now, still on the road line.
    positions: [
      { x: 372, z: 1968 },
      { x: 355, z: 2013 },
      { x: 348, z: 2046 },
      { x: 332, z: 2094 },
    ],
  },
  {
    itemId: 'wyrmwatch_warning_banner',
    name: 'Wyrmwatch Warning Banner',
    // Banner stakes dropped at the three bonefield muster grounds, one per
    // grave-ring, waiting to be driven in.
    positions: [
      { x: 350, z: 2090 },
      { x: 302, z: 2180 },
      { x: 450, z: 2110 },
    ],
  },
];

export const DRAKELANDS_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // fallen keeps of the old drake-cult: castle ruins across the wastes
  ruinRings: [
    { x: 330, z: 2114, ringR: 10, columns: 8 }, // the Cinder Bastion
    { x: 338, z: 2124, ringR: 6, columns: 5 },
    { x: 468, z: 2158, ringR: 7, columns: 6 }, // the Trollmoot henge
    { x: 268, z: 2256, ringR: 6, columns: 5 }, // Bloodglass watch
  ],
  graveyards: [
    { x: 354, z: 2092 },
    { x: 300, z: 2176 },
    { x: 452, z: 2112 },
  ],
  // Wyrmwatch: the dragon-watch garrison town on the Wyrmgate road. The SOUTH
  // palisade (z 1882, below the hub centre at z 1900, and -z is SOUTH here)
  // parts at x 400 to 408 for the causeway gate; the dunes road leaves
  // NORTHEAST between the inn and the well ((404, 1900) to (370, 1970) runs -x
  // and +z, and -x is EAST here).
  buildings: [
    { kind: 'inn', x: 390, z: 1904, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: 414, z: 1892, w: 5, d: 5, rot: -1.1 },
    { kind: 'house', x: 393, z: 1888, w: 5, d: 5, rot: 2.0 },
    { kind: 'house', x: 416, z: 1912, w: 5, d: 6, rot: 2.6 },
  ],
  wells: [
    { x: 410, z: 1902, r: 1.5 },
    // the Last Keep's courtyard well. The keep itself is a POI here, not a
    // built castle (upstream's CASTLE_BUILDINGS are render-side decorProps we
    // do not carry), so the well and the market row below stand alone on the
    // road as the old garrison's bones.
    { x: 408, z: 2033, r: 1.5 },
  ],
  stalls: [
    { x: 398, z: 1896, rot: 0.5, r: 1.6 },
    { x: 410, z: 1910, rot: -1.2, r: 1.6 },
    // the keep's market row inside where the main gate stood
    { x: 391, z: 2033, rot: 0.7, r: 1.6 },
    { x: 402, z: 2044.5, rot: -2.1, r: 1.6 },
  ],
  crates: [
    [406, 1892],
    [396, 1912],
  ],
  fences: [
    // the south palisade, parted at the causeway gate
    { x1: 390, z1: 1882, x2: 400, z2: 1882 },
    { x1: 408, z1: 1882, x2: 416, z2: 1882 },
  ],
  // the old waypost stays: a garrison keeps its road camp
  tents: [
    { x: 396, z: 1894, rot: 0.8, scale: 1 },
    { x: 412, z: 1906, rot: -1.9, scale: 1 },
    { x: 497, z: 2097, rot: -2.2, scale: 1 }, // Scout Yerrin's ridge camp above the wargate
  ],
  campfires: [
    [404, 1900],
    [492, 2103], // Yerrin's low fire, banked so the gate does not see it
  ],
};
