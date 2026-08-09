// What makes the two column zones playable: six NPCs and fourteen quests, seven
// per zone, plus the ground objects their collect and interact objectives need.
//
// DESIGN CONSTRAINTS this file was written under, all of them inherited from
// the expansion pack (`../expansion/quests.ts`), which is the shape to copy:
//   * It adds NO camps. Every kill objective targets a mob a column camp in
//     `./world.ts` already spawns. Those camps declare exact `positions`, so
//     world generation draws no rng for them; adding one would draw rng and
//     move every shipped spawn (see the ordering note above COLUMN_CAMPS).
//   * Collect and interact objectives are served by COLUMN_OBJECTS below, which
//     carry explicit positions and draw no rng either.
//   * It adds NO art. The six NPCs carry no `NPC_KEYS` override, so they render
//     on the shipped `npc_villager` rig tinted by their `color`, exactly like
//     the expansion pack's four givers.
//
// COMPASS. +z is NORTH and +x is WEST, so east is -x. Every direction word
// below was derived from the live coordinates through the HUD's own bearing
// math and is pinned by `tests/columns_content.test.ts`. In compass terms
// Reedwatch (x 360) lies WEST of Eastbrook and Coldhearth (x -360) lies EAST of
// it, which is what the two zones' `welcome` lines say.
//
// REWARD ANCHORS. Every xp/copper pair names the shipped quest it is derived
// from at the site. Measured off the live tables, the bands these two zones sit
// between are:
//   Eastbrook Vale, levels 3-6 (zone1.ts + expansion): 520-800 xp, copper about
//     0.38x xp; its level-4 rung is q_mine at 620/220.
//   Mirefen Marsh, levels 6-11 (zone2.ts): 800-1700 xp, copper about 0.40x xp;
//     its level-6 floor is q_prowlers at 800/300 and q_prowler_pelts at 850/350.
// Alderfen (4-8) therefore runs from the vale's level-4 rung up to the fen's
// floor, and Grimhold (6-10) from the fen's floor up to q_trolls at 1600/600.
// The two 3-player rare-elite capstones skew copper up the way every shipped
// named-target quest does (q_ringleader 800/500, q_mogger 1200/900).
import type { GroundObjectDef, NpcDef, QuestDef } from '../../types';

// ---------------------------------------------------------------------------
// NPCs.
//
// Both hubs are flat inside their 20yd radius and carry no props, wells or
// stalls, so these six positions need only stay inside the hub and clear of the
// zone graveyard (Reedwatch (342,-14), Coldhearth (-342,-14)). `color` follows
// the shipped convention that every provisioner is 0x1e8449 (Trader Wilkes,
// Provisioner Hale).
// ---------------------------------------------------------------------------

export const COLUMN_NPCS: Record<string, NpcDef> = {
  // --- Reedwatch, Alderfen Shallows ----------------------------------------
  weirwarden_ondrey: {
    id: 'weirwarden_ondrey',
    name: 'Weirwarden Ondrey',
    title: 'Keeper of the Alderfen Weir',
    pos: { x: 356, z: 6 }, // north side of the crossing road, facing the way in
    facing: -1.9,
    color: 0x4a6b52,
    questIds: ['q_af_boards', 'q_af_withies', 'q_af_sedgewatch', 'q_af_miller'],
    greeting:
      'The weir is eighty years of other men\'s work, $N, and it is mine for as long as it holds. Stand on the crossing and listen. That is not the fen moving. That is the fen leaning.',
  },
  bailiff_hesk: {
    id: 'bailiff_hesk',
    name: 'Bailiff Hesk',
    title: 'Reedwatch Crossing',
    pos: { x: 366, z: -4 },
    facing: -1.4,
    color: 0x8a6d3b,
    questIds: ['q_af_snappers', 'q_af_poachers'],
    greeting:
      'Every soul who comes through Reedwatch owes the crossing a toll and gets a night under a roof for it. What is out in those reeds pays nothing and takes what it likes. That is the whole of my job, $C, stated plain.',
  },
  provisioner_tarrow: {
    id: 'provisioner_tarrow',
    name: 'Provisioner Tarrow',
    title: 'Provisioner',
    pos: { x: 352, z: -6 },
    facing: -1.6,
    color: 0x1e8449,
    questIds: ['q_af_char'],
    // Stock is the shipped tier-1 shelf, item for item. Alderfen is rung 1 in
    // ZONE_GATHER_TIER, so it sells the same three tier-1 tools Trader Wilkes
    // does (gathering hard-requires a tool) plus the tier-1 rod, because a fen
    // town with a lake and no pole on the shelf is a broken zone. The two
    // Mirefen potions are on here as well: Alderfen's top half (6-8) IS the
    // Mirefen's opening band, and both are shipped prices. No gear: Reedwatch
    // is a crossing post, Smith Haldren covers the whole 1-7 gear band one road
    // east, and stocking gear here would mean inventing buy prices.
    vendorItems: [
      'baked_bread',
      'spring_water',
      'roasted_boar',
      'tough_jerky',
      'minor_healing_potion',
      'minor_mana_potion',
      'lesser_healing_potion',
      'lesser_mana_potion',
      'simple_fishing_pole',
      'worn_miners_pick',
      'worn_logging_axe',
      'worn_herbalists_sickle',
    ],
    greeting:
      'Bread, salt, oil and a pole. Anything that will not keep three days in this air I do not stock, $N, and I would advise you not to want it.',
  },

  // --- Coldhearth, Grimhold Crags ------------------------------------------
  hearthwarden_ottil: {
    id: 'hearthwarden_ottil',
    name: 'Hearthwarden Ottil',
    title: 'Keeper of the Coldhearth Fire',
    pos: { x: -356, z: 6 },
    facing: 1.7,
    color: 0xb03a2e,
    questIds: ['q_gh_lurkers', 'q_gh_coal', 'q_gh_binders', 'q_gh_grimfang'],
    greeting:
      'The fire in that hall was lit before the hold had walls around it and it has not been out since, $N. Not once. Ask anyone here what happens if it goes out and you will get seven answers, and not one of them from somebody who wants to find out.',
  },
  pickmaster_gethin: {
    id: 'pickmaster_gethin',
    name: 'Pickmaster Gethin',
    title: 'Ironvein Cut',
    pos: { x: -366, z: -4 },
    facing: 1.4,
    color: 0x707b7c,
    questIds: ['q_gh_ironvein', 'q_gh_watchtower'],
    greeting:
      'One road, one cut, one seam, $C. Everything Coldhearth is stands on ore coming down that road, and for six weeks what comes down it has been bad news and empty carts.',
  },
  provisioner_dagny: {
    id: 'provisioner_dagny',
    name: 'Provisioner Dagny',
    title: 'Provisioner',
    pos: { x: -352, z: -6 },
    facing: 1.6,
    color: 0x1e8449,
    questIds: ['q_gh_sled'],
    // Grimhold is rung 2 in ZONE_GATHER_TIER, so this is Provisioner Hale's
    // shelf with the tier-2 tools intact and the fen-cut gear swapped for Smith
    // Haldren's Eastbrook whites, which is what a hold at the top of the vale
    // stair would actually have carried up. Both food ladders are stocked
    // because the zone spans 6 to 10: the vale rung feeds the bottom of that
    // and the Fenbridge rung the top. Every id and every price is shipped.
    vendorItems: [
      'baked_bread',
      'spring_water',
      'roasted_boar',
      'fenbridge_rye',
      'marsh_mint_tea',
      'minor_healing_potion',
      'minor_mana_potion',
      'lesser_healing_potion',
      'lesser_mana_potion',
      'eastbrook_arming_sword',
      'bronzework_mace',
      'vale_carving_knife',
      'hickory_shortstaff',
      'eastbrook_chain_vest',
      'tanned_leather_jerkin',
      'valespun_robe',
      'hobnail_boots',
      'eastbrook_wool_trousers',
      'simple_fishing_pole',
      'braided_fishing_rod',
      'sturdy_miners_pick',
      'sturdy_logging_axe',
      'sturdy_herbalists_sickle',
    ],
    greeting:
      'Everything on this table came up the stair on somebody\'s back, so do not haggle with me, haggle with the mountain. Fair prices, $N, and up here the pick is worth more to you than the sword.',
  },
};

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------

export const COLUMN_QUESTS: Record<string, QuestDef> = {
  // === Alderfen Shallows: Reedwatch holds the crossing (levels 4 to 8) =====
  //
  // The zone has one problem and everything in it is a face of that problem:
  // the weir under the crossing is failing, Reedwatch has no reason to exist
  // without the crossing, and the last time this water was allowed to win it
  // took a whole town. Ondrey carries the weir, Hesk carries the road, Tarrow
  // carries the larder.

  q_af_boards: {
    id: 'q_af_boards',
    name: 'What Chews the Boards',
    giverNpcId: 'weirwarden_ondrey',
    turnInNpcId: 'weirwarden_ondrey',
    text: 'You crossed on my boards coming in, so you have already trusted them once. Do not do it twice without looking. The skitterers nest under the walkway out at Otter Hollow, southeast of here, and they eat the withy lashings out of the underside where nobody thinks to check. Eight of them, $N. I will do the looking after that.',
    completionText:
      'Eight, and you brought the mess back on your boots, which tells me you went under the boards and not around them. Most people go around.',
    objectives: [
      { type: 'kill', targetMobId: 'sedge_skitterer', count: 8, label: 'Sedge Skitterer slain' },
    ],
    // Anchor: q_mine (zone1.ts, minLevel 4, 620/220) and q_ev_boars
    // (expansion/quests.ts, minLevel 4, 600/240). This is the same rung.
    xpReward: 620,
    copperReward: 240,
    itemRewards: {},
    minLevel: 4,
  },
  q_af_snappers: {
    id: 'q_af_snappers',
    name: 'Mudfin Water',
    giverNpcId: 'bailiff_hesk',
    turnInNpcId: 'bailiff_hesk',
    text: 'There is a shelf of shallow water southeast of Alderfen Water where the snappers lie up in the weed with only their backs showing. Two of my toll-payers went in there to fill a cask and one came back out. Eight of them, and mind that they are quicker in that water than you are.',
    completionText:
      'Good. I will have the cask filled myself tomorrow and I will do it standing in the boat like a coward, which is how a sensible man does it.',
    objectives: [
      { type: 'kill', targetMobId: 'mudfin_snapper', count: 8, label: 'Mudfin Snapper slain' },
    ],
    // Anchor: between q_mine (zone1.ts, minLevel 4, 620/220) and q_bones
    // (zone1.ts, minLevel 5, 700/260), which is exactly where level 5 sits.
    xpReward: 660,
    copperReward: 260,
    itemRewards: {},
    minLevel: 5,
  },
  q_af_withies: {
    id: 'q_af_withies',
    name: 'Withies for the Weir',
    giverNpcId: 'weirwarden_ondrey',
    turnInNpcId: 'weirwarden_ondrey',
    text: 'A weir is not stone, $N, whatever the songs have to say about it. It is ten thousand willow withies woven wet and left to dry hard, and every one of them has a life of about nine years. Mine are all of an age. Cut me six good lengths out of the beds southwest of Reedwatch, and take those boots off the peg while you are at it, because you will be standing in water to the knee.',
    completionText:
      'Green, straight, and no heart-rot in any of the six. That is one panel of the south face I do not have to lie awake about. There are two hundred panels.',
    objectives: [{ type: 'collect', itemId: 'cut_withy', count: 6, label: 'Cut Withy' }],
    // Anchor: q_bones (zone1.ts, minLevel 5, 700/260).
    xpReward: 700,
    copperReward: 280,
    // Reward anchor: `oiled_boots` (items.ts, uncommon feet, armor 25 / agi 1,
    // sellValue 80, class-neutral) handed to all three archetypes, which is
    // exactly what expansion q_ev_houndsbane does with the same item at this
    // rung. Reused rather than reprinted: it is already the shipped wading boot.
    itemRewards: { warrior: 'oiled_boots', mage: 'oiled_boots', rogue: 'oiled_boots' },
    requiresQuest: 'q_af_boards',
    minLevel: 5,
  },
  q_af_poachers: {
    id: 'q_af_poachers',
    name: 'The Reed Toll',
    giverNpcId: 'bailiff_hesk',
    turnInNpcId: 'bailiff_hesk',
    text: 'The men working out of the Rotting Weir, southwest of Reedwatch, call themselves fowlers. What they are is cutting the withy beds bare to sell the lengths back to Ondrey at four times the honest price, and last month they started charging travellers to use a crossing they did not build. Ten of them, $N. I have written the warrant. I am short the arm to serve it.',
    completionText:
      'Served. I will walk out there myself in the morning and pull their toll-post down, and I will do it slowly, in front of whoever is left to watch.',
    objectives: [
      { type: 'kill', targetMobId: 'reedwatch_poacher', count: 10, label: 'Reedwatch Poacher slain' },
    ],
    // Anchor: q_prowlers (zone2.ts, 800/300), the Mirefen's own level-6 floor
    // quest. Alderfen's top half is that band, so it pays that band.
    xpReward: 800,
    copperReward: 320,
    itemRewards: {},
    minLevel: 6,
  },
  q_af_char: {
    id: 'q_af_char',
    name: 'Alder Char',
    giverNpcId: 'provisioner_tarrow',
    turnInNpcId: 'provisioner_tarrow',
    text: 'Everything I sell has to survive a fen summer, and the only thing that gets it there is char burnt from drowned alder. It burns cold, it burns slow, and it does not spit. The dead stands are northwest of Reedwatch on the shore of Alderfen Water. Six baskets. I am not asking you to burn it. Only to carry it.',
    completionText:
      'Cold to the hand and it does not crumble. That is the smokehouse fed until the frost, and it means the ones going on north to Fenbridge leave here with food that will still be food when they arrive.',
    objectives: [{ type: 'collect', itemId: 'alder_char', count: 6, label: 'Alder Char' }],
    // Anchor: q_fen_supplies (zone2.ts, minLevel 7, 900/350), one notch down
    // because Alderfen's ceiling is level 8 and the Mirefen's is 13.
    xpReward: 860,
    copperReward: 340,
    itemRewards: {},
    minLevel: 7,
  },
  q_af_sedgewatch: {
    id: 'q_af_sedgewatch',
    name: 'The Sedgewatch Never Stood Down',
    giverNpcId: 'weirwarden_ondrey',
    turnInNpcId: 'weirwarden_ondrey',
    text: 'Before there was Reedwatch there was Sedgewatch, northeast of here, and it held this water for two hundred years until the night the fen came over the top of it. There are men still standing at that wall, $N. Not standing guard. Just standing. Ten of them, and be quick about the ones by the gate, because they still know what a gate is for.',
    completionText:
      "Ten down. My grandfather's name is cut into that wall and I have never once been able to walk close enough to read it. You have bought me the walk. I will take it alone, if that is all the same to you.",
    objectives: [{ type: 'kill', targetMobId: 'weir_husk', count: 10, label: 'Weir Husk slain' }],
    // Anchor: q_fen_supplies (zone2.ts, minLevel 7, 900/350).
    xpReward: 900,
    copperReward: 360,
    itemRewards: {},
    requiresQuest: 'q_af_withies',
    minLevel: 7,
  },
  q_af_miller: {
    id: 'q_af_miller',
    name: 'The Drowned Miller',
    giverNpcId: 'weirwarden_ondrey',
    turnInNpcId: 'weirwarden_ondrey',
    text: 'Now I will tell you the part Reedwatch does not say out loud. Sedgewatch did not drown because the fen rose. It drowned because a miller northwest of here opened his sluice to fill his own race and then could not get it shut again, and he is still down at that wheel, $N, still winding it the wrong way. Take two others with you. Put him under, then wind the sluice closed. Eighty years is long enough for one man\'s mistake to keep running.',
    completionText:
      'The wheel is turning against the water now instead of with it. I felt the level drop at the crossing while you were still walking back. Take what is off the warden\'s peg. It was cut for somebody who never had to be told any of this.',
    objectives: [
      { type: 'kill', targetMobId: 'the_drowned_miller', count: 1, label: 'The Drowned Miller slain' },
      {
        type: 'interact',
        targetObjectItemId: 'mill_sluice_wheel',
        count: 1,
        label: 'Mill Sluice Wheel wound shut',
      },
    ],
    // Anchor: q_deepfen_purge (zone2.ts, 1100/450) for the xp band, held just
    // under it because this is a level-8 zone capstone and that is a level-9
    // fen quest. Copper skews up on a named target exactly as q_ringleader
    // (zone1.ts, 800/500) and q_mogger (zone1.ts, 1200/900, suggestedPlayers 3)
    // already do.
    xpReward: 1050,
    copperReward: 500,
    itemRewards: {
      warrior: 'weirguard_hauberk',
      mage: 'sedgeweave_robe',
      rogue: 'millrace_jerkin',
    },
    requiresQuest: 'q_af_sedgewatch',
    minLevel: 8,
    suggestedPlayers: 3,
  },

  // === Grimhold Crags: Coldhearth burns against them (levels 6 to 10) ======
  //
  // The hold's whole existence is one fire that has never been out, and the
  // fire is fed by a single ore road. Ottil carries the fire, Gethin carries
  // the road, Dagny carries what the road was supposed to bring. The chain is
  // the hold changing what it burns, and the mountain answering.

  q_gh_lurkers: {
    id: 'q_gh_lurkers',
    name: 'What Comes Down the Scree',
    giverNpcId: 'hearthwarden_ottil',
    turnInNpcId: 'hearthwarden_ottil',
    text: 'Wood does not grow above the cut, so Coldhearth burns what it can drag up, and the drag road runs under Scree Fall, southwest of here. The lurkers have learned to sit above it and come down with the stones. My haulers will not walk it any more and I do not blame them. Ten, $N, and the fire eats tonight.',
    completionText:
      'The road is walked again. You will hear the haulers before you see them. They sing going up and they are silent coming down, and both of those are about the weight.',
    objectives: [{ type: 'kill', targetMobId: 'crag_lurker', count: 10, label: 'Crag Lurker slain' }],
    // Anchor: q_prowler_pelts (zone2.ts, 850/350), the Mirefen's level-6 floor
    // rung. Grimhold opens at 6, so it opens on that number.
    xpReward: 850,
    copperReward: 340,
    itemRewards: {},
    minLevel: 6,
  },
  q_gh_ironvein: {
    id: 'q_gh_ironvein',
    name: 'The Cut',
    giverNpcId: 'pickmaster_gethin',
    turnInNpcId: 'pickmaster_gethin',
    text: 'The scavengers are in my gallery. Not raiding it, living in it. They have hung the ore road with their own lamps and they are working my face with my own picks, and every cart that does come down comes down light. Ten of them out of the Ironvein Cut, northwest of the hold. Take the gloves off the rack. You will want them on that rock.',
    completionText:
      'Ten, and they left their lamps burning. I will work by that light for a week out of pure spite and then I will pull every one of them down.',
    objectives: [
      { type: 'kill', targetMobId: 'grimhold_scavenger', count: 10, label: 'Grimhold Scavenger slain' },
    ],
    // Anchor: q_fen_supplies (zone2.ts, minLevel 7, 900/350).
    xpReward: 900,
    copperReward: 360,
    // Reward anchor: `roughspun_gloves` (items.ts, uncommon gloves, armor 28 /
    // agi 1 / sta 1, sellValue 95, class-neutral), the shipped working glove of
    // this band. Reused rather than reprinted; nothing new was needed.
    itemRewards: {
      warrior: 'roughspun_gloves',
      mage: 'roughspun_gloves',
      rogue: 'roughspun_gloves',
    },
    minLevel: 7,
  },
  q_gh_coal: {
    id: 'q_gh_coal',
    name: 'Fuel for the Coldhearth',
    giverNpcId: 'hearthwarden_ottil',
    turnInNpcId: 'hearthwarden_ottil',
    text: 'Dragging timber up a stair is what we do because we must, not because it is sense. There is better fuel lying loose on the scree southwest of Coldhearth: black stone the mountain has been making since before there were men to burn it. Six loads, $N. If it takes, I will never send another hauler down that road again.',
    completionText:
      'It caught in under a minute and it burns without a flame worth the name, just heat and a smell like a struck flint. Eighty years of dragging wood up a stair, and it was under our feet the whole time.',
    objectives: [{ type: 'collect', itemId: 'cragcoal', count: 6, label: 'Cragcoal' }],
    // Anchor: q_deepfen (zone2.ts, minLevel 7, 1000/400), held one notch under
    // because Grimhold's ceiling is level 10 and the Mirefen's is 13.
    xpReward: 950,
    copperReward: 380,
    itemRewards: {},
    requiresQuest: 'q_gh_lurkers',
    minLevel: 7,
  },
  q_gh_binders: {
    id: 'q_gh_binders',
    name: 'The Mountain Answers',
    giverNpcId: 'hearthwarden_ottil',
    turnInNpcId: 'hearthwarden_ottil',
    text: 'We took the coal and the crags have answered. There are things standing up out of the scree southwest of Coldhearth Tarn that were scree yesterday, and they come down toward the drag road with the deliberation of a man walking to a duel. Eight of them. I have kept this hold\'s fire for thirty years and this is the first time the mountain has said anything back.',
    completionText:
      'Eight, and every one of them came apart into exactly the stone it was made of, which I find worse than if it had bled. We will keep burning the coal. I want it written down that the decision was mine and nobody else\'s.',
    objectives: [{ type: 'kill', targetMobId: 'scree_binder', count: 8, label: 'Scree Binder slain' }],
    // Anchor: q_deepfen_purge (zone2.ts, 1100/450).
    xpReward: 1100,
    copperReward: 440,
    itemRewards: {},
    requiresQuest: 'q_gh_coal',
    minLevel: 8,
  },
  q_gh_sled: {
    id: 'q_gh_sled',
    name: 'The Sled That Did Not Come Back',
    giverNpcId: 'provisioner_dagny',
    turnInNpcId: 'provisioner_dagny',
    text: 'Six weeks of stock went up the northeast road on one sled and never reached the watchtower, and I have since had it described to me by three separate men who saw marauders wearing my oilcloth. Bring five loads back off them, $N. I am not sentimental about the sled. I am extremely sentimental about the salt.',
    completionText:
      'Salt, lamp oil and two crates of nails, which up here is the same as gold and rather more use. You will notice I have not raised my prices. That is not generosity. That is you having earned it.',
    objectives: [
      { type: 'collect', itemId: 'plundered_sledload', count: 5, label: 'Plundered Sled Load' },
    ],
    // Anchor: q_broodmother (zone2.ts, 1250/500).
    xpReward: 1250,
    copperReward: 500,
    itemRewards: {},
    minLevel: 9,
  },
  q_gh_watchtower: {
    id: 'q_gh_watchtower',
    name: 'The Broken Watchtower',
    giverNpcId: 'pickmaster_gethin',
    turnInNpcId: 'pickmaster_gethin',
    text: 'The tower northeast of Coldhearth was our eyes for four hundred years, and the marauders are camped in what is left of it, which means they watch us coming and we never see them at all. That is the whole of why the ore road is not safe, and it stays the whole of it until somebody goes up there. Ten.',
    completionText:
      'I stood on the stump of that tower this morning and I could see the smoke off the hold, the tarn and every foot of the cut at once. Four hundred years of men knew what I know now, and I had to be told it by a stranger with a wet weapon.',
    objectives: [
      { type: 'kill', targetMobId: 'coldhearth_marauder', count: 10, label: 'Coldhearth Marauder slain' },
    ],
    // Anchor: q_drowned (zone2.ts, minLevel 9, 1400/500).
    xpReward: 1400,
    copperReward: 560,
    itemRewards: {},
    requiresQuest: 'q_gh_ironvein',
    minLevel: 9,
  },
  q_gh_grimfang: {
    id: 'q_gh_grimfang',
    name: 'Old Grimfang',
    giverNpcId: 'hearthwarden_ottil',
    turnInNpcId: 'hearthwarden_ottil',
    text: 'Every hauler I have lost in thirty years I lost on the drag road, and every one of them I put down to the stone. That was easier than the truth. There is an old thing denned up in the Cragmaw Dens southeast of here that has taken one man a season out of my line since before I held the hearth, and it has never once needed to hurry. Take two others and end it, $N. Then I will go and say the names properly.',
    completionText:
      'Thirty years I wrote rockfall on the paper, because rockfall is nobody\'s fault. Take the weapon. It came off a hauler\'s sled the year I took the hearth and I have kept it hanging where I could see it, which I understand now was not respect. It was a debt.',
    objectives: [{ type: 'kill', targetMobId: 'old_grimfang', count: 1, label: 'Old Grimfang slain' }],
    // Anchor: q_trolls (zone2.ts, minLevel 10, 1600/600) for the band, and
    // q_grubjaw (zone2.ts, minLevel 11, 1700/700) as the named-beast rung just
    // above it, which this stays under on xp. The copper skew for a 3-player
    // rare elite follows q_mogger (zone1.ts, 1200/900, suggestedPlayers 3).
    xpReward: 1650,
    copperReward: 750,
    itemRewards: {
      warrior: 'grimfang_splitter',
      mage: 'coldhearth_emberstaff',
      rogue: 'cragmaw_fang',
    },
    requiresQuest: 'q_gh_binders',
    minLevel: 10,
    suggestedPlayers: 3,
  },
};

// Offer order inside each giver's list. Mirrors ZONE{N}_QUEST_ORDER: a chain
// head always precedes its follow-ups, so a giver never offers a quest whose
// prerequisite has not been shown yet.
export const COLUMN_QUEST_ORDER: string[] = [
  'q_af_boards',
  'q_af_snappers',
  'q_af_withies',
  'q_af_poachers',
  'q_af_char',
  'q_af_sedgewatch',
  'q_af_miller',
  'q_gh_lurkers',
  'q_gh_ironvein',
  'q_gh_coal',
  'q_gh_binders',
  'q_gh_sled',
  'q_gh_watchtower',
  'q_gh_grimfang',
];

// ---------------------------------------------------------------------------
// Ground objects. Explicit positions, so world generation draws no rng for
// them. Every position below was checked against `terrainHeight` for dry land
// and against `resolvePosition` for a clear cell. Each collect set carries one
// node more than its quest requires, the slack the expansion pack uses.
// ---------------------------------------------------------------------------

export const COLUMN_OBJECTS: GroundObjectDef[] = [
  {
    // The withy beds along the channel between Reedwatch (360,0) and the
    // Rotting Weir (462,-62): southwest of the hub, and clear of the
    // reedwatch_poacher camp at (458,-62) so the cutting is its own errand.
    itemId: 'cut_withy',
    name: 'Cut Withy',
    positions: [
      { x: 398, z: -22 },
      { x: 412, z: -30 },
      { x: 424, z: -18 },
      { x: 436, z: -40 },
      { x: 410, z: -46 },
      { x: 430, z: -34 },
      { x: 444, z: -26 },
    ],
  },
  {
    // The drowned alder stands ringing Alderfen Water (440,90, radius 22).
    // Every node sits 28 to 33 yards out from the lake centre, so none of them
    // falls inside the lake carve.
    itemId: 'alder_char',
    name: 'Alder Char',
    positions: [
      { x: 414, z: 74 },
      { x: 424, z: 66 },
      { x: 444, z: 62 },
      { x: 462, z: 72 },
      { x: 470, z: 90 },
      { x: 408, z: 96 },
      { x: 416, z: 110 },
    ],
  },
  {
    // The sluice itself, six yards off the Drowned Miller at (480,152): inside
    // his aggro radius on purpose, so the wheel is the thing you reach past him
    // rather than instead of him.
    itemId: 'mill_sluice_wheel',
    name: 'Mill Sluice Wheel',
    positions: [{ x: 484, z: 148 }],
  },
  {
    // The coal apron spilling off Scree Fall (-300,-110) toward the hold:
    // southwest of Coldhearth, on the same slope the drag road runs under.
    itemId: 'cragcoal',
    name: 'Cragcoal',
    positions: [
      { x: -306, z: -78 },
      { x: -318, z: -84 },
      { x: -300, z: -92 },
      { x: -312, z: -96 },
      { x: -324, z: -74 },
      { x: -330, z: -90 },
      { x: -296, z: -84 },
    ],
  },
  {
    // What is left of Dagny's sled, strewn along the last of the ore road up to
    // the Broken Watchtower (-482,154), northeast of the hold.
    itemId: 'plundered_sledload',
    name: 'Plundered Sled Load',
    positions: [
      { x: -462, z: 138 },
      { x: -470, z: 146 },
      { x: -458, z: 152 },
      { x: -490, z: 166 },
      { x: -496, z: 150 },
      { x: -468, z: 168 },
      { x: -486, z: 138 },
    ],
  },
];
