// Expansion quest lines: four new quest-givers, one per shipped zone, and the
// eighteen quests they hand out.
//
// DESIGN CONSTRAINTS this file was written under:
//   * It adds NO camps. Every kill objective targets a mob that is already
//     spawned by a shipped camp, so the world-gen RNG draw order (and every
//     fixed-seed fixture that depends on it) is untouched. See the ordering
//     comment above ZONE1_CHAPEL_CAMPS in zone1.ts for why that matters.
//   * Collect and interact objectives are served by NEW ground objects, which
//     are placed at explicit positions and draw no RNG at all.
//   * It adds no new overworld mobs, so it needs no new art: every silhouette
//     already ships.
//
// REWARD ANCHORS. Every xp/copper pair names the shipped quest it is anchored
// on at the site. The zone bands, measured off zone1-4, are:
//   Eastbrook Vale (3-6): 420-800 xp, copper about 0.40x xp
//   Mirefen Marsh (8-12): 800-1900 xp, copper about 0.40x xp
//   Thornpeak Heights (14-18): 2200-4500 xp, copper about 0.50x xp
//   Ashen Wastes (20): 4500-9000 xp, copper about 0.55x xp, plus Dawn reputation
// Group and dungeon quests skew the copper ratio up, exactly as the shipped
// named-boss quests do.
import type { GroundObjectDef, NpcDef, QuestDef } from '../../types';

// ---------------------------------------------------------------------------
// NPCs. Positions were chosen clear of every shipped building, stall, well and
// NPC post in their hub (see ZONE{N}_PROPS and ZONE{N}_NPCS).
// ---------------------------------------------------------------------------

export const EXPANSION_NPCS: Record<string, NpcDef> = {
  houndmaster_teel: {
    id: 'houndmaster_teel',
    name: 'Houndmaster Teel',
    title: 'Eastbrook Kennels',
    pos: { x: 17, z: 8 }, // west of the town green, clear of the house at (10,12) and the smithy stall
    facing: -2.0,
    color: 0x6b5a3c,
    questIds: ['q_ev_kennels', 'q_ev_houndsbane', 'q_ev_boars', 'q_ev_last_hound'],
    greeting:
      'Mind the empty runs, $N. I bred hounds in this yard for thirty years and I have four left. The Wolf Run took the rest of them in one night.',
  },
  ferrywoman_odalie: {
    id: 'ferrywoman_odalie',
    name: 'Ferrywoman Odalie',
    title: 'Fenbridge Crossing',
    pos: { x: -12, z: 306 }, // the east landing, clear of the four shipped Fenbridge posts
    facing: 2.0,
    color: 0x2e6f7a,
    questIds: ['q_mf_polings', 'q_mf_lanterns', 'q_mf_drowned_toll', 'q_mf_trollbridge'],
    greeting:
      'You want across, you wait your turn and you keep your hands inside the boat. I have poled this crossing since I was nine, $N, and I have never once looked over the side at night.',
  },
  stonewright_hulda: {
    id: 'stonewright_hulda',
    name: 'Stonewright Hulda',
    title: 'Highwatch Masons',
    pos: { x: -14, z: 664 }, // the mason's yard on the east curtain, clear of the shipped Highwatch posts
    facing: 1.85,
    color: 0x8a8071,
    questIds: ['q_tp_quarry', 'q_tp_keystones', 'q_tp_ogre_wall', 'q_tp_stormcut'],
    greeting:
      'A wall is arithmetic, $C. So many stones, so many hands, so many days before the thing outside gets bored of waiting. Highwatch is behind on all three.',
  },
  dawn_forgewright_calla: {
    id: 'dawn_forgewright_calla',
    name: 'Forgewright Calla',
    title: 'Dawn of Claude',
    pos: { x: 118, z: 1052 }, // the Dawn's watch-post outside the Cinderforge mouth at (122,1058)
    facing: 0.6,
    color: 0xc45a2a,
    questIds: [
      'q_cf_approach',
      'q_cf_slagfall',
      'q_cf_covenant',
      'q_cf_forgewarden',
      'q_cf_bellows',
      'q_cf_unquenched',
    ],
    greeting:
      'Stand upwind of the mouth, $N. My chapter went down that stair eleven winters ago to pour blades that could burn the blight, and the forge has not gone cold a single hour since. Nobody has ever fed it.',
  },
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const EXPANSION_QUESTS: Record<string, QuestDef> = {
  // === Eastbrook Vale: the Houndmaster's line (levels 3 to 6) ==============
  // Anchor for the band: q_murlocs (minLevel 3, 520 xp / 180 copper) and
  // q_mine (minLevel 4, 620 / 220), both zone1.ts.
  q_ev_kennels: {
    id: 'q_ev_kennels',
    name: 'What the Wolves Left',
    giverNpcId: 'houndmaster_teel',
    turnInNpcId: 'houndmaster_teel',
    text: 'They came over the kennel wall on a still night and they did not eat what they killed, $N. That is the part I cannot square. A hungry wolf takes one hound and runs. These ones stayed until the runs were quiet. Go up the Wolf Run and put ten of them down for me.',
    completionText:
      'Ten. Good. It will not bring a single one of mine back, but I sleep better knowing there are ten fewer of them breathing up there tonight.',
    objectives: [{ type: 'kill', targetMobId: 'forest_wolf', count: 10, label: 'Forest Wolf slain' }],
    xpReward: 520,
    copperReward: 190,
    itemRewards: {},
    minLevel: 3,
  },
  q_ev_houndsbane: {
    id: 'q_ev_houndsbane',
    name: 'Houndsbane',
    giverNpcId: 'houndmaster_teel',
    turnInNpcId: 'houndmaster_teel',
    text: 'Four hounds left, and two of them will not eat. Houndsbane grows in the wet ground along the Wolf Run, white flower, black root, and boiled down it draws the fever out of a bitten dog. Bring me five roots, $N, and take these boots for the walking. The ground up there will ruin what you have on.',
    completionText:
      'Five, and they smell right. Give me an hour with the pot and Bramble will be up on her feet again. She was the first one born in this yard, you know. I would like her to not be the last.',
    objectives: [{ type: 'collect', itemId: 'houndsbane_root', count: 5, label: 'Houndsbane Root' }],
    xpReward: 550,
    copperReward: 220,
    // A shared, class-neutral reward: the "one item repeated three times" form
    // used by q_stalker_pelts and q_kazzix (zone3.ts). `oiled_boots` (items.ts,
    // uncommon feet, armor 25, sellValue 80) is the shipped zone1 walking boot.
    itemRewards: { warrior: 'oiled_boots', mage: 'oiled_boots', rogue: 'oiled_boots' },
    requiresQuest: 'q_ev_kennels',
  },
  q_ev_boars: {
    id: 'q_ev_boars',
    name: 'Meat for the Kennels',
    giverNpcId: 'houndmaster_teel',
    turnInNpcId: 'houndmaster_teel',
    text: 'A working hound eats better than a militiaman, and Eastbrook is not about to vote me the difference. The boars in the west meadow are fat and stupid and there are far too many of them. Ten, $N. Bring the carcasses to the edge of the meadow and I will send a cart.',
    completionText:
      'Ten head. That is the kennels fed into the frost, and the meadow will thank you for it come planting. Not every job worth doing has a song in it.',
    objectives: [{ type: 'kill', targetMobId: 'wild_boar', count: 10, label: 'Wild Boar slain' }],
    xpReward: 600,
    copperReward: 240,
    itemRewards: {},
    minLevel: 4,
  },
  q_ev_last_hound: {
    id: 'q_ev_last_hound',
    name: 'The Last Hound',
    giverNpcId: 'houndmaster_teel',
    turnInNpcId: 'houndmaster_teel',
    text: 'I buried the pack north of the road, under three cairns, because I could not make myself dig one big enough for all of them. I have not been able to walk up there since. Go for me, $N. Stand at each cairn a moment. That is all I am asking. A man ought not leave his dead unvisited because his legs have gone coward.',
    completionText:
      'You went. Thank you. Bramble is out in the yard chewing a strap she has no business chewing, and I find I can breathe again. Take this off the rack. It is honest work, and so were you.',
    objectives: [
      { type: 'interact', targetObjectItemId: 'cairn_of_bramble', count: 1, label: "Stand at Bramble's Cairn" },
      { type: 'interact', targetObjectItemId: 'cairn_of_old_seld', count: 1, label: "Stand at Old Seld's Cairn" },
      {
        type: 'interact',
        targetObjectItemId: 'cairn_of_the_first_pack',
        count: 1,
        label: 'Stand at the Cairn of the First Pack',
      },
    ],
    xpReward: 620,
    copperReward: 260,
    // Anchor: the zone1 uncommon chest triplet (items.ts, sellValue 150), the
    // standard level 5-6 Eastbrook reward.
    itemRewards: { warrior: 'militia_vest', mage: 'woven_robe', rogue: 'shadow_jerkin' },
    requiresQuest: 'q_ev_houndsbane',
    minLevel: 5,
  },

  // === Mirefen Marsh: the Ferrywoman's line (levels 8 to 12) ===============
  // Anchor for the band: q_widows (minLevel 8, 1200 / 450), q_drowned
  // (minLevel 9, 1400 / 500) and q_trolls (minLevel 10, 1600 / 600), zone2.ts.
  q_mf_polings: {
    id: 'q_mf_polings',
    name: 'The Poling Road',
    giverNpcId: 'ferrywoman_odalie',
    turnInNpcId: 'ferrywoman_odalie',
    text: 'The channel south of the causeway is my road, $N, and something has moved onto it. Prowlers, laired up in the reeds where I have to stand to push off. I lost my second pole to one last week and my nerve with it. Twelve of them, and I will run the crossing after dark again.',
    completionText:
      'Twelve. I took the boat down at dusk and the reeds were just reeds. You have no idea what that is worth to a woman who has been poling in daylight only, like a child.',
    objectives: [{ type: 'kill', targetMobId: 'mire_prowler', count: 12, label: 'Mire Prowler slain' }],
    xpReward: 1150,
    copperReward: 460,
    itemRewards: {},
    minLevel: 8,
  },
  q_mf_lanterns: {
    id: 'q_mf_lanterns',
    name: 'Lanterns for the Crossing',
    giverNpcId: 'ferrywoman_odalie',
    turnInNpcId: 'ferrywoman_odalie',
    text: 'Every ferry that ever worked this water hung a lamp at the bow, and every one of them is out there in the shallows by the drowned chapel, still hanging. Fetch me five, $N. I will not ask how they got there. I will only say that a lamp taken up out of the fen burns longer than a lamp bought new, and I have stopped asking why.',
    completionText:
      'Five, and three of them still had oil. Look at the brass on this one - that is Corran\'s mark, and Corran went under in my grandmother\'s time. Take the boots. You will be back in that water before the season turns.',
    objectives: [{ type: 'collect', itemId: 'drowned_lantern', count: 5, label: 'Drowned Lantern' }],
    xpReward: 1250,
    copperReward: 500,
    // Anchor: `marshstrider_boots` (zone2.ts, uncommon feet, class-neutral,
    // sellValue 250), the zone's own walking boot.
    itemRewards: {
      warrior: 'marshstrider_boots',
      mage: 'marshstrider_boots',
      rogue: 'marshstrider_boots',
    },
    requiresQuest: 'q_mf_polings',
  },
  q_mf_drowned_toll: {
    id: 'q_mf_drowned_toll',
    name: "The Ferryman's Toll",
    giverNpcId: 'ferrywoman_odalie',
    turnInNpcId: 'ferrywoman_odalie',
    text: 'I have carried the dead across this water for coin my whole life and never once carried one back. Now they walk out of the shallows by the chapel on their own feet, $N, and that is a debt I did not agree to. Twelve of them. Put them under properly.',
    completionText:
      'Down and staying down. There is a right order to things: the living go over the water, the dead go under it, and nobody swaps. You just put twelve of them back on the correct side of it.',
    objectives: [{ type: 'kill', targetMobId: 'drowned_dead', count: 12, label: 'Drowned Dead slain' }],
    xpReward: 1400,
    copperReward: 520,
    itemRewards: {},
    minLevel: 9,
  },
  q_mf_trollbridge: {
    id: 'q_mf_trollbridge',
    name: 'What Sits Under the Bridge',
    giverNpcId: 'ferrywoman_odalie',
    turnInNpcId: 'ferrywoman_odalie',
    text: 'The barrow trolls have started coming west out of the mounds and sitting under the causeway pilings at low water, waiting for the boards to creak. That is my crossing they are under, $N. Twelve of them, and go in daylight - they hear a boat coming a quarter mile off in the dark. Take your pick of the ferry lockers when it is done.',
    completionText:
      'Quiet under the boards again. I walked the whole causeway this morning and stamped every plank of it like a fool, just to hear nothing answer.',
    objectives: [{ type: 'kill', targetMobId: 'fen_troll', count: 12, label: 'Mirefen Troll slain' }],
    xpReward: 1650,
    copperReward: 600,
    // Anchor: the zone2 uncommon mainhand triplet (zone2.ts, sellValue 300).
    itemRewards: {
      warrior: 'deacons_cleaver',
      mage: 'staff_of_drowned_prayers',
      rogue: 'mistbinder_kris',
    },
    requiresQuest: 'q_mf_drowned_toll',
    minLevel: 10,
  },

  // === Thornpeak Heights: the Stonewright's line (levels 14 to 17) =========
  // Anchor for the band: q_kobold_tunnels (minLevel 14, 2500 / 1200),
  // q_ogre_edges (minLevel 15, 2900 / 1400) and q_elementals (minLevel 16,
  // 3600 / 1800), all zone3.ts.
  q_tp_quarry: {
    id: 'q_tp_quarry',
    name: 'Stone from the Deeprock',
    giverNpcId: 'stonewright_hulda',
    turnInNpcId: 'stonewright_hulda',
    text: 'Highwatch has one good quarry face and the kobolds have been under it for two seasons, hollowing out galleries I cannot see and did not survey. The west curtain is already sitting on air, $N. Kill twelve of them in the Deeprock burrows. I need the digging stopped before I can start measuring what they have ruined.',
    completionText:
      'Twelve fewer picks in the dark. I have my apprentices down there now with a plumb line and a lot of swearing. If the curtain stands through the thaw it will be because you went first.',
    objectives: [
      { type: 'kill', targetMobId: 'deeprock_kobold', count: 12, label: 'Deeprock Tunneler slain' },
    ],
    xpReward: 2500,
    copperReward: 1200,
    itemRewards: {},
    minLevel: 14,
  },
  q_tp_keystones: {
    id: 'q_tp_keystones',
    name: 'Keystones',
    giverNpcId: 'stonewright_hulda',
    turnInNpcId: 'stonewright_hulda',
    text: 'The kobolds dragged our cut stone down into the galleries to shore their own tunnels. Dressed keystone, $N - a season of my life in every block, and they are propping mud with it. Six. Bring me six and the gatehouse arch closes before the snow.',
    completionText:
      'Six, and only one of them chipped. Set a keystone right and the whole arch spends the next four hundred years holding itself up out of spite. That is the only kind of defence I actually trust.',
    objectives: [{ type: 'collect', itemId: 'quarried_keystone', count: 6, label: 'Quarried Keystone' }],
    xpReward: 2600,
    copperReward: 1300,
    // Anchor: `ridgestalker_treads` (zone3.ts, uncommon feet, class-neutral,
    // sellValue 600), the zone's own quest green.
    itemRewards: {
      warrior: 'ridgestalker_treads',
      mage: 'ridgestalker_treads',
      rogue: 'ridgestalker_treads',
    },
    requiresQuest: 'q_tp_quarry',
  },
  q_tp_ogre_wall: {
    id: 'q_tp_ogre_wall',
    name: 'They Come Down at Night',
    giverNpcId: 'stonewright_hulda',
    turnInNpcId: 'stonewright_hulda',
    text: 'I can build against weather and I can build against men. I cannot build against something that walks down out of the foothills at night and pulls the scaffold off the wall for the fun of hearing it fall. Twelve ogres, $N, and take them at the edges where they wander alone. My people need three clear nights, that is all.',
    completionText:
      'Three nights, and the east span went up in two of them. My mortar has finally been allowed to set. You would not believe what a mason will forgive a person for that.',
    objectives: [{ type: 'kill', targetMobId: 'thornpeak_ogre', count: 12, label: 'Thornpeak Ogre slain' }],
    xpReward: 2900,
    copperReward: 1450,
    itemRewards: {},
    minLevel: 15,
  },
  q_tp_stormcut: {
    id: 'q_tp_stormcut',
    name: 'Stormcut',
    giverNpcId: 'stonewright_hulda',
    turnInNpcId: 'stonewright_hulda',
    text: 'There is a stone out on Stormcrag that takes an edge like nothing else in these mountains, and I cannot send a single apprentice within a mile of it. The living rock walks out there, $N. Twelve of them, and my cutters go up the day after. Bring me back a whole crew and you may have anything off my rack.',
    completionText:
      'The cutters came down at dusk singing, which for a Highwatch mason is close to a riot. Storm-cut stone in the gatehouse arch, $N. That gate will still be standing when nobody remembers either of our names.',
    objectives: [
      { type: 'kill', targetMobId: 'stormcrag_elemental', count: 12, label: 'Stormcrag Elemental slain' },
    ],
    xpReward: 3600,
    copperReward: 1800,
    // Anchor: the zone3 uncommon mainhand triplet (zone3.ts, sellValue 900).
    itemRewards: {
      warrior: 'zealotsbane_blade',
      mage: 'emberwood_staff',
      rogue: 'cultist_flayer',
    },
    requiresQuest: 'q_tp_ogre_wall',
    minLevel: 16,
  },

  // === The Ashen Wastes and the Cinderforge (level 20) =====================
  // Anchors: q_aw_acolytes (5000 / 2000, rep 400) and q_aw_corrupt_sample
  // (5200 / 2200, rep 450) for the overworld pair; q_ch_breach (6000 / 3000,
  // rep 350, five players), q_ch_pit (6500 / 3300, rep 400), q_ch_forge
  // (6800 / 3500, rep 450) and q_ch_deathlord (9000 / 5000, rep 800) for the
  // dungeon chain. All zone4.ts.
  q_cf_approach: {
    id: 'q_cf_approach',
    name: 'Clearing the Approach',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'The bone reavers out of the Bonefields have worked their way along the ridge to within a stone\'s throw of my watch-post, $N, and I have two people and a signal horn. Ten of them, off the approach. Whatever else the Dawn decides to do about that stair, we are not deciding it while fighting on the doorstep.',
    completionText:
      'The ridge is clear and my two are asleep for the first time in a week. Now we can talk about the hole in the ground.',
    objectives: [{ type: 'kill', targetMobId: 'bone_reaver', count: 10, label: 'Bone Reaver slain' }],
    xpReward: 5000,
    copperReward: 2000,
    itemRewards: {},
    repReward: { faction: 'dawn_of_claude', amount: 400 },
    minLevel: 20,
  },
  q_cf_slagfall: {
    id: 'q_cf_slagfall',
    name: 'Slag and Cinder',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'The forge vents onto the slope and has been raining spoil out of that mouth for eleven years. I want five pieces off the fall, $N, cooled ones, from as deep in the throat as you are willing to reach. Slag remembers what went into the pour. If my chapter was making blades down there, the spoil will say so. If they were making something else, it will say that too.',
    completionText:
      'Iron, ash, and bone. Not cattle bone. I have carried this suspicion for eleven years and I would have given a great deal to be wrong about it, $N.',
    objectives: [{ type: 'collect', itemId: 'cooled_slag', count: 5, label: 'Cooled Slag' }],
    xpReward: 5200,
    copperReward: 2200,
    itemRewards: {},
    repReward: { faction: 'dawn_of_claude', amount: 450 },
    requiresQuest: 'q_cf_approach',
  },
  q_cf_covenant: {
    id: 'q_cf_covenant',
    name: 'The Ember Covenant',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'Then we go down. My chapter called itself the Ember Covenant and it kept a ledger the way a chapel keeps a register, $N - every pour, every price. Break eight of the smiths still working those anvils and take five ledgers off them. I want to read what my own people agreed to before I say one word about them to Gravewatch.',
    completionText:
      'It is all here in a clean hand. Fuel, ore, hours. And on the fourth page the fuel column stops saying charcoal. They kept writing it down, $N. That is the part that will not leave me. They kept the books tidy the whole way down.',
    objectives: [
      { type: 'kill', targetMobId: 'cf_covenant_smith', count: 8, label: 'Ember Covenant Smith slain' },
      { type: 'collect', itemId: 'cf_covenant_ledger', count: 5, label: 'Ember Covenant Ledger' },
    ],
    xpReward: 6000,
    copperReward: 3000,
    itemRewards: {},
    repReward: { faction: 'dawn_of_claude', amount: 350 },
    requiresQuest: 'q_cf_slagfall',
    minLevel: 20,
    suggestedPlayers: 5,
  },
  q_cf_forgewarden: {
    id: 'q_cf_forgewarden',
    name: 'Forgewarden Bexley',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'Bexley signed every page. He was our master smith and he was a kind man, and he is standing at the head anvil in the Forgehall with cinders where his eyes used to be, still working. He will not stop for me. Take a full band, $N. Do not go down there thinking you can talk him out of it - I already spent eleven years thinking that.',
    completionText:
      'He went out like a fire with the air cut off. Quick, and then nothing. Take these, they came off his own rack and they are the last honest thing the Covenant ever made.',
    objectives: [
      { type: 'kill', targetMobId: 'cf_forgewarden_bexley', count: 1, label: 'Forgewarden Bexley slain' },
    ],
    xpReward: 6500,
    copperReward: 3300,
    itemRewards: { warrior: 'cf_ef_feet', mage: 'cf_cs_feet', rogue: 'cf_ss_feet' },
    repReward: { faction: 'dawn_of_claude', amount: 400 },
    requiresQuest: 'q_cf_covenant',
    suggestedPlayers: 5,
  },
  q_cf_bellows: {
    id: 'q_cf_bellows',
    name: 'The Slagheart',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'Past the Forgehall is the bellows vault, and the bellows in it have not been worked by hands in eleven years. Something down there is doing the breathing for them, $N - the spoil says it is more slag than creature by now. Kill it and the whole lower forge loses its draught. Five of you, and keep moving when it blows.',
    completionText:
      'The draught dropped the moment it died. I felt the air change at the mouth up here, eleven years of exhale finally stopping. And then, $N, I felt something further down take a breath to make up the difference.',
    objectives: [{ type: 'kill', targetMobId: 'cf_slagheart', count: 1, label: 'The Slagheart slain' }],
    xpReward: 6800,
    copperReward: 3500,
    itemRewards: {},
    repReward: { faction: 'dawn_of_claude', amount: 450 },
    requiresQuest: 'q_cf_forgewarden',
    suggestedPlayers: 5,
  },
  q_cf_unquenched: {
    id: 'q_cf_unquenched',
    name: 'The Unquenched',
    giverNpcId: 'dawn_forgewright_calla',
    turnInNpcId: 'dawn_forgewright_calla',
    text: 'The last page of the ledger is one line: "It asked for the fire back and we said it could keep it." That is Vharkul, $N, sitting in the heat at the bottom of my chapter\'s mistake, and it has been paid for eleven years without ever once being fed. Take five and end it. Bring me the ember out of its chest so that Gravewatch has something to look at while I explain what the Dawn of Claude did down there.',
    completionText:
      'Cold in my palm inside a minute. Eleven years, and it goes out like a coal on a hearthstone. I will carry this to Commander Sera myself and I will not soften a word of it. My chapter went looking for a fire that could burn the blight, and it found one, and it charged us everything. Whatever else the Dawn owes you, $N, it owes me this: someone finally went down there.',
    objectives: [
      { type: 'kill', targetMobId: 'cf_vharkul', count: 1, label: 'Vharkul the Unquenched slain' },
      { type: 'collect', itemId: 'cf_quenchless_ember', count: 1, label: 'Quenchless Ember' },
    ],
    xpReward: 9000,
    copperReward: 5000,
    itemRewards: { warrior: 'cf_ef_helmet', mage: 'cf_cs_helmet', rogue: 'cf_ss_helmet' },
    repReward: { faction: 'dawn_of_claude', amount: 800 },
    requiresQuest: 'q_cf_bellows',
    minLevel: 20,
    suggestedPlayers: 5,
  },
};

// Offer order inside each giver's list. Mirrors ZONE{N}_QUEST_ORDER: the chain
// heads come before their follow-ups so a giver never offers a quest whose
// prerequisite has not been shown yet.
export const EXPANSION_QUEST_ORDER: string[] = [
  'q_ev_kennels',
  'q_ev_houndsbane',
  'q_ev_boars',
  'q_ev_last_hound',
  'q_mf_polings',
  'q_mf_lanterns',
  'q_mf_drowned_toll',
  'q_mf_trollbridge',
  'q_tp_quarry',
  'q_tp_keystones',
  'q_tp_ogre_wall',
  'q_tp_stormcut',
  'q_cf_approach',
  'q_cf_slagfall',
  'q_cf_covenant',
  'q_cf_forgewarden',
  'q_cf_bellows',
  'q_cf_unquenched',
];

// ---------------------------------------------------------------------------
// Ground objects. Explicit positions, so world-gen draws no RNG for them (see
// the ground-object loop in sim.ts). Each set carries one node more than its
// quest requires, the same slack zone4's desecrated_relic uses.
// ---------------------------------------------------------------------------

export const EXPANSION_OBJECTS: GroundObjectDef[] = [
  {
    // Wet ground along the Wolf Run, between the two shipped forest_wolf camps
    // at (-15,55) and (20,70), and well clear of Mirror Lake at (-92,88).
    itemId: 'houndsbane_root',
    name: 'Houndsbane Root',
    positions: [
      { x: -30, z: 44 },
      { x: -8, z: 62 },
      { x: 12, z: 78 },
      { x: 30, z: 66 },
      { x: -24, z: 74 },
      { x: 4, z: 50 },
    ],
  },
  {
    // Teel's three cairns, north of the Eastbrook road and outside the town
    // radius, on the walk up toward the Wolf Run.
    itemId: 'cairn_of_bramble',
    name: "Bramble's Cairn",
    positions: [{ x: -20, z: 26 }],
  },
  {
    itemId: 'cairn_of_old_seld',
    name: "Old Seld's Cairn",
    positions: [{ x: -14, z: 32 }],
  },
  {
    itemId: 'cairn_of_the_first_pack',
    name: 'Cairn of the First Pack',
    positions: [{ x: -26, z: 33 }],
  },
  {
    // The shallows around the Drowned Chapel, inside the two shipped
    // drowned_dead camps at (90,420) and (115,450).
    itemId: 'drowned_lantern',
    name: 'Drowned Lantern',
    positions: [
      { x: 78, z: 408 },
      { x: 96, z: 402 },
      { x: 104, z: 432 },
      { x: 86, z: 436 },
      { x: 112, z: 418 },
      { x: 70, z: 424 },
    ],
  },
  {
    // The Deeprock burrows, around the shipped deeprock_kobold camps at
    // (75,625) and (105,600).
    itemId: 'quarried_keystone',
    name: 'Quarried Keystone',
    positions: [
      { x: 62, z: 634 },
      { x: 84, z: 612 },
      { x: 96, z: 640 },
      { x: 112, z: 616 },
      { x: 70, z: 606 },
      { x: 100, z: 588 },
      { x: 88, z: 646 },
    ],
  },
  {
    // The spoil fall below the Cinderforge mouth at (122,1058). West of every
    // shipped zone4 camp (the nearest is bone_reaver at (95,1110), radius 20).
    itemId: 'cooled_slag',
    name: 'Cooled Slag',
    positions: [
      { x: 114, z: 1046 },
      { x: 128, z: 1050 },
      { x: 118, z: 1068 },
      { x: 132, z: 1064 },
      { x: 108, z: 1060 },
      { x: 126, z: 1036 },
    ],
  },
];
