// Flavor text when a player interacts with a ground quest sparkle object.
// Every itemId in GROUND_OBJECTS must have an entry here.

export interface GroundPickupLines {
  /** Quest not active (or not accepted). */
  deny: string;
  /** Quest active but collect objective already satisfied. */
  enough: string;
}

export const GROUND_PICKUP_LINES: Record<string, GroundPickupLines> = {
  supply_crate: {
    deny: 'The crate is nailed shut.',
    enough: 'You already have enough supply crates.',
  },
  gravecaller_sigil: {
    deny: 'The sigil repels your touch.',
    enough: "You already carry a Gravecaller's Sigil.",
  },
  weathered_ledger_page: {
    deny: 'The ledger pages are bound too tightly to take.',
    enough: 'You already have enough ledger pages.',
  },
  morthen_grimoire: {
    deny: "The grimoire's clasp is magically sealed.",
    enough: "You already have Morthen's Grimoire.",
  },
  fen_muster_order: {
    deny: 'The wax seal holds until the order is yours to claim.',
    enough: 'You already have the Fenbridge muster order.',
  },
  lost_caravan_goods: {
    deny: "You aren't authorized to salvage these goods yet.",
    enough: 'You already have enough caravan goods.',
  },
  rusted_censer: {
    deny: 'The censer is chained in place.',
    enough: 'You already have enough rusted censers.',
  },
  bastion_ward_stone: {
    deny: 'The ward stone will not budge.',
    enough: 'You already have the Bastion ward stone.',
  },
  unknown_alien_weaponry: {
    deny: 'The meteor debris is too hot to handle without Aldric expecting it.',
    enough: 'You already recovered enough alien wreckage.',
  },
  highwatch_summons: {
    deny: 'The summons are sealed with Highwatch wax.',
    enough: 'You already have the Highwatch summons.',
  },
  ogre_war_totem: {
    deny: 'The totem is planted too firmly to uproot.',
    enough: 'You already have enough ogre war totems.',
  },
  gravewyrm_sigil: {
    deny: 'Dark magic keeps the sigil rooted.',
    enough: 'You already have enough Gravewyrm sigils.',
  },
  sanctum_key_shard: {
    deny: 'The shard is dormant and locked in place.',
    enough: 'You already have enough sanctum key shards.',
  },
  moongate_rubbing: {
    deny: 'The warding is not yours to copy until the watcher asks for it.',
    enough: 'You already have the warding rubbing.',
  },
  grave_sir_aldren: {
    deny: 'The grave is sealed against the living until the dead call you to it.',
    enough: "You have already taken what Captain Aldren's grave will give.",
  },
  grave_high_priest_malric: {
    deny: 'The grave is sealed against the living until the dead call you to it.',
    enough: "You have already taken what High Priest Malric's grave will give.",
  },
  grave_captain_voss: {
    deny: 'The grave is sealed against the living until the dead call you to it.',
    enough: "You have already taken what Royal Assassin Voss's grave will give.",
  },
  crypt_ritual_circle: {
    deny: 'The ritual circle lies cold and dormant.',
    enough: 'The circle has nothing more to give you.',
  },
  // The Eastbrook townsfolk's errands (ZONE1_VALE_OBJECTS in zone1.ts).
  splintered_road_marker: {
    deny: 'A road marker, face down in the grass. Somebody in town will want it, but nobody has asked you.',
    enough: 'You are carrying all the marker the Marshal asked for.',
  },
  sunleaf_frond: {
    deny: 'Sunleaf, waist high and unclaimed. Cut it wrong and it is worth nothing to anybody.',
    enough: 'You have cut all the sunleaf Lin asked for.',
  },
  reliquary_seal: {
    deny: 'The seal is cut, not broken, and it is not yours to lift.',
    enough: 'You have taken enough seals off the hill.',
  },
  splintered_axle: {
    deny: 'A cart axle, snapped clean and left where it fell. It is evidence of something, but not for you.',
    enough: 'You have all the axle the Marshal needs to read the trail.',
  },
  // The expansion pack (src/sim/content/expansion). Every ground object it adds
  // needs a line here: `tests/sim.test.ts` asserts this table and the merged
  // GROUND_OBJECTS have exactly the same item ids.
  houndsbane_root: {
    deny: 'The root clings to the stone; nobody has asked you to pull it.',
    enough: 'You have gathered enough houndsbane.',
  },
  cairn_of_bramble: {
    deny: "Bramble's stones lie undisturbed. Leave them so.",
    enough: 'You have already paid your respects here.',
  },
  cairn_of_old_seld: {
    deny: "Old Seld's stones lie undisturbed. Leave them so.",
    enough: 'You have already paid your respects here.',
  },
  cairn_of_the_first_pack: {
    deny: 'The first pack sleeps under these stones. Leave them so.',
    enough: 'You have already paid your respects here.',
  },
  drowned_lantern: {
    deny: 'The lantern is silted into the bank and will not lift.',
    enough: 'You have recovered enough lanterns.',
  },
  quarried_keystone: {
    deny: 'The keystone is wedged tight in the quarry face.',
    enough: 'You have cut enough keystones.',
  },
  cooled_slag: {
    deny: 'The slag is still fused to the floor.',
    enough: 'You have carried off enough slag.',
  },
  // The column ring (src/sim/content/columns), under the same rule.
  // The upstream realm ring (src/sim/content/realms), under the same rule.
  fenway_mooring_line: {
    deny: 'A chewed-through mooring line, coiled where the skiff slipped it. Bridgemere has not asked you to gather rope.',
    enough: 'You are carrying all the line Alden can splice.',
  },
  bridgemere_toll_chest: {
    deny: 'A strongbox, half sunk in the shallows. Prying at it uninvited is how people vanish out here.',
    enough: 'You have hauled up every chest the toll skiff lost.',
  },
  shear_storm_lantern: {
    deny: 'The wick is soaked and cold, and you have nothing to light it with.',
    enough: 'Every lantern on the cliff road is burning again.',
  },
  wreckfield_flotsam_crate: {
    deny: "Salvage law is simple on this beach, and this crate is not yours yet.",
    enough: 'You have hauled in all the flotsam Edda asked for.',
  },
  pearlwake_cargo_crate: {
    deny: 'The crate is still rolling in the surf. Somebody in Drifthaven will want it, but nobody has asked you.',
    enough: 'You have brought in all the Pearlwake cargo Ryna wanted.',
  },
  sunken_offering_bowl: {
    deny: 'The bowl is packed fresh with moss and shell. Whatever it feeds, it is not yours to disturb.',
    enough: 'You are carrying all the offerings Okku needs to read.',
  },
  hedgewick_tool_cart: {
    deny: 'A tipped cart, iron scattered in the grass. Righting it is somebody else\'s errand.',
    enough: 'Every spilled cart is back on the pegs in Hedgewick.',
  },
  evergarden_statue_rubbing: {
    deny: 'The marble sister looks past you. She has not been asked to notice you yet.',
    enough: 'All four sisters have taken your measure.',
  },
  // ---------------------------------------------------------------------------
  // The upstream realm ring's quest objects (src/sim/content/realms/).
  // ---------------------------------------------------------------------------
  // The Veiled Hollow
  hollow_sealstone: {
    deny: 'The sealstone is cold and shut. Nothing you carry belongs in it yet.',
    enough: 'The seal is set. The Hollow can begin to heal.',
  },
  monument_overlook: {
    deny: 'Weathered verses, and no reason yet to puzzle at them.',
    enough: 'You have already read the Overlook stone.',
  },
  monument_court: {
    deny: 'The sunken verses mean nothing to you until someone asks for them.',
    enough: 'You have already read the Court stone.',
  },
  monument_north: {
    deny: 'A forgotten stone in a forgotten corner. Leave it forgotten.',
    enough: 'You have already read the forgotten stone.',
  },
  // The Frostveil Reach
  hearth_ember_cache: {
    deny: 'The kettle is still banked and sealed; it is not yours to lift.',
    enough: 'You already have enough ember caches.',
  },
  sprung_trap: {
    deny: 'The trap is frozen into the reeds, and it is not your line to work.',
    enough: 'You already have enough sprung traps.',
  },
  // The Farshore
  gullhaven_watchbell: {
    deny: 'The rope is frayed and the clapper still. Tam has not asked you to give it a voice.',
    enough: 'Every bell on the coast has answered you.',
  },
  // The Nightbloom
  gloamfield_nightbloom: {
    deny: 'The blossom is closed tight, and no one has asked you to cut it.',
    enough: 'You already have enough nightbloom blossoms.',
  },
  vigil_star_chart: {
    deny: 'The carved stars mean nothing to you without an astronomer to read them for.',
    enough: 'You have already read enough of the Vigil stones.',
  },
  barrow_grave_offering: {
    deny: 'Taking from a grave is not yours to do until someone asks it of you.',
    enough: 'You already have enough grave offerings.',
  },
  // The Wraithwood
  gallowmere_grave_candle: {
    deny: 'The wick is drowned, and the taper to light it is not yours yet.',
    enough: 'Every boundary candle is already burning.',
  },
  silkbound_remains: {
    deny: 'The wrapped shape sways out of reach, and no one has asked you to cut it down.',
    enough: 'You have already cut down enough of the silkbound dead.',
  },
  // The Amberfall
  amberfall_sap_bucket: {
    deny: 'The bucket is still hooked to its sap-tap.',
    enough: 'You already have enough sap-tap buckets.',
  },
  mere_ferry_lantern: {
    deny: 'The lantern is not yours to lift off the shore.',
    enough: 'You already have enough ferry lanterns.',
  },
  // The Drakelands
  scorched_supply_crate: {
    deny: 'The crate is strapped shut with iron and still too hot to lift.',
    enough: 'You already have enough scorched crates.',
  },
  wyrmwatch_warning_banner: {
    deny: 'The banner stake means nothing to you yet.',
    enough: 'You have planted all the warning banners you need.',
  },
};

export function groundPickupDeny(itemId: string, itemName: string): string {
  return GROUND_PICKUP_LINES[itemId]?.deny ?? `You cannot take the ${itemName} yet.`;
}

export function groundPickupEnough(itemId: string): string {
  return GROUND_PICKUP_LINES[itemId]?.enough ?? 'You have enough of those.';
}
