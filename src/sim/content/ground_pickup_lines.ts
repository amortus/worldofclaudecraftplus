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
  desecrated_relic: {
    deny: 'The relic will not stir until the Chaplain sends you for it.',
    enough: 'You already carry enough desecrated relics.',
  },
  ritual_focus: {
    deny: 'The ritual focus is bound to its rite; it ignores your hand.',
    enough: 'You already have enough ritual foci.',
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
};

export function groundPickupDeny(itemId: string, itemName: string): string {
  return GROUND_PICKUP_LINES[itemId]?.deny ?? `You cannot take the ${itemName} yet.`;
}

export function groundPickupEnough(itemId: string): string {
  return GROUND_PICKUP_LINES[itemId]?.enough ?? 'You have enough of those.';
}
