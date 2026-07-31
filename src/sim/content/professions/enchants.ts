// The enchant table (data-as-code; the resolution logic lives in
// `../../professions/enchanting.ts`).
//
// Three groups, which is what the picker renders as three sections:
//
//   base    the per-slot basics, bought with arcane_dust and some essence.
//           Every one of our eight equipment slots has at least three, so no
//           build is ever stuck taking an enchant for a stat it does not use.
//   runed   the mid rung, and the ONLY consumer of the five typed weaves a
//           rare-or-better disenchant yields, so no weave is a dead-end
//           currency. Sits strictly between base and Greater on any slot and
//           axis that has both.
//   greater the top rung, and the ONLY consumer of arcane_shard (the
//           epic/legendary disenchant yield). At least base + 3 on the same
//           slot and axis, so the shard premium is always a visible step.
//
// MAGNITUDES ARE PORTED FROM UPSTREAM, and they port cleanly for one specific
// reason: upstream's level cap is 20, exactly like ours, and their design doc
// states these were "tuned against the level-20 BiS gear budgets" to land a
// full set of enchants at roughly 13 to 21 percent of best gear per stat axis.
// Same cap, same target, same numbers.
//
// TWO ADAPTATIONS, both forced by our slot layout:
//
//  1. Upstream has eleven equipment slots (a neck and two rings on top of our
//     eight). Their neck and ring enchants are simply dropped: our `EquipSlot`
//     has no such members, so those rows would be unreachable.
//  2. Because three slots are gone, the per-axis stack shrinks, but not
//     evenly. Every axis landed back inside the 13 to 21 percent band except
//     stamina, which at upstream's per-slot values reached 24 of the 100
//     stamina a full level-20 epic set carries (24 percent, over the band).
//     Every base-tier stamina row is therefore one point lighter than
//     upstream's (helmet 3 -> 2, chest 4 -> 3, waist 3 -> 2, legs 3 -> 2),
//     which lands the stack at 20 and preserves the Greater-beats-base-by-3
//     step exactly. Nothing else was re-tuned.
//
// Per-axis best-path stacks that fall out, against the level-20 epic budgets in
// `src/sim/content/dungeons.ts`: str 15 of 79 (19 percent), agi 19 of 110 (17),
// sta 20 of 100 (20), int 18 of 110 (16), spi 7 of 63 (11, deliberately just
// under the band, as upstream also leaves it: spirit is carried by few slots),
// armor 35, which rides its own scale. `tests/enchanting_content.test.ts` pins
// all of it.
//
// MAGNITUDES ARE FROZEN once this ships, and the reason is mechanical rather
// than stylistic: `resolveApplyEnchant` bakes `statBonus` into the item
// instance at apply time, so a later nerf would not retro-apply and early
// enchanters would keep grandfathered copies. Economy drift is corrected by
// re-pricing REAGENTS, never by touching a magnitude.
//
// Every bonus is a flat primary-stat or armor number, the only categories
// `recalcPlayerStats` reads off an instance's `rolled.stats`. A weapon-damage
// enchant is deliberately out of scope: damage rolls read the item
// DEFINITION's `weapon.min`/`max`, never per-instance data.

import type { EnchantDef, EnchantTable, RecipeReagent } from '../../professions/types';

const dust = (count: number): RecipeReagent => ({ itemId: 'arcane_dust', count });
const essence = (count: number): RecipeReagent => ({ itemId: 'arcane_essence', count });
const shard = (count: number): RecipeReagent => ({ itemId: 'arcane_shard', count });
const weave = (itemId: string): RecipeReagent => ({ itemId, count: 1 });

function enchant(
  id: string,
  name: string,
  group: EnchantDef['group'],
  itemSlot: EnchantDef['itemSlot'],
  reagents: RecipeReagent[],
  statBonus: EnchantDef['statBonus'],
): EnchantDef {
  return { id, name, group, itemSlot, reagents, statBonus };
}

const ROWS: EnchantDef[] = [
  // --- Base: weapon -------------------------------------------------------
  enchant('enchant_weapon_might', 'Enchant Weapon - Might', 'base', 'mainhand', [dust(5)], {
    str: 2,
  }),
  enchant('enchant_weapon_agility', 'Enchant Weapon - Agility', 'base', 'mainhand', [dust(5)], {
    agi: 2,
  }),
  enchant(
    'enchant_weapon_spellpower',
    'Enchant Weapon - Spellpower',
    'base',
    'mainhand',
    [dust(5)],
    { int: 2 },
  ),

  // --- Base: helmet -------------------------------------------------------
  enchant('enchant_helmet_fortitude', 'Enchant Helmet - Fortitude', 'base', 'helmet', [dust(5)], {
    sta: 2,
  }),
  enchant(
    'enchant_helmet_intellect',
    'Enchant Helmet - Intellect',
    'base',
    'helmet',
    [dust(3), essence(2)],
    { int: 4 },
  ),
  enchant(
    'enchant_helmet_reinforcement',
    'Enchant Helmet - Reinforcement',
    'base',
    'helmet',
    [dust(3), essence(1)],
    { armor: 15 },
  ),

  // --- Base: shoulder -----------------------------------------------------
  enchant('enchant_shoulder_strength', 'Enchant Shoulders - Strength', 'base', 'shoulder', [dust(5)], {
    str: 2,
  }),
  enchant('enchant_shoulder_agility', 'Enchant Shoulders - Agility', 'base', 'shoulder', [dust(5)], {
    agi: 2,
  }),
  enchant(
    'enchant_shoulder_intellect',
    'Enchant Shoulders - Intellect',
    'base',
    'shoulder',
    [dust(5)],
    { int: 2 },
  ),

  // --- Base: chest --------------------------------------------------------
  enchant(
    'enchant_chest_stamina',
    'Enchant Chest - Stamina',
    'base',
    'chest',
    [dust(3), essence(2)],
    { sta: 3 },
  ),
  enchant(
    'enchant_chest_spirit',
    'Enchant Chest - Spirit',
    'base',
    'chest',
    [dust(3), essence(2)],
    { spi: 4 },
  ),
  enchant(
    'enchant_chest_reinforcement',
    'Enchant Chest - Reinforcement',
    'base',
    'chest',
    [dust(3), essence(2)],
    { armor: 20 },
  ),

  // --- Base: waist --------------------------------------------------------
  enchant('enchant_waist_stamina', 'Enchant Belt - Stamina', 'base', 'waist', [dust(5)], {
    sta: 2,
  }),
  enchant('enchant_waist_strength', 'Enchant Belt - Strength', 'base', 'waist', [dust(5)], {
    str: 3,
  }),
  enchant('enchant_waist_agility', 'Enchant Belt - Agility', 'base', 'waist', [dust(5)], {
    agi: 3,
  }),

  // --- Base: legs ---------------------------------------------------------
  enchant('enchant_legs_stamina', 'Enchant Legs - Stamina', 'base', 'legs', [dust(3), essence(2)], {
    sta: 2,
  }),
  enchant(
    'enchant_legs_intellect',
    'Enchant Legs - Intellect',
    'base',
    'legs',
    [dust(3), essence(2)],
    { int: 4 },
  ),
  enchant('enchant_legs_agility', 'Enchant Legs - Agility', 'base', 'legs', [dust(5)], { agi: 3 }),

  // --- Base: gloves -------------------------------------------------------
  enchant('enchant_gloves_agility', 'Enchant Gloves - Agility', 'base', 'gloves', [dust(5)], {
    agi: 3,
  }),
  enchant('enchant_gloves_intellect', 'Enchant Gloves - Spellpower', 'base', 'gloves', [dust(5)], {
    int: 3,
  }),
  enchant('enchant_gloves_strength', 'Enchant Gloves - Strength', 'base', 'gloves', [dust(5)], {
    str: 3,
  }),

  // --- Base: feet ---------------------------------------------------------
  enchant('enchant_feet_agility', 'Enchant Boots - Agility', 'base', 'feet', [dust(3)], { agi: 2 }),
  enchant('enchant_feet_strength', 'Enchant Boots - Strength', 'base', 'feet', [dust(3)], {
    str: 2,
  }),
  enchant('enchant_feet_stamina', 'Enchant Boots - Stamina', 'base', 'feet', [dust(3)], { sta: 2 }),
  enchant('enchant_feet_spirit', 'Enchant Boots - Spirit', 'base', 'feet', [dust(3)], { spi: 2 }),

  // --- Runed: the typed-weave sinks. One consumer per weave, so no
  //     disenchant secondary is a dead-end currency. ---------------------
  enchant(
    'enchant_weapon_runed_edge',
    'Enchant Weapon - Runed Edge',
    'runed',
    'mainhand',
    [essence(2), weave('resonant_steel')],
    { str: 3 },
  ),
  enchant(
    'enchant_weapon_runed_sigil',
    'Enchant Weapon - Runed Sigil',
    'runed',
    'mainhand',
    [essence(2), weave('resonant_timber')],
    { int: 3 },
  ),
  enchant(
    'enchant_chest_runed_weave',
    'Enchant Chest - Runed Weave',
    'runed',
    'chest',
    [essence(2), weave('resonant_thread')],
    { spi: 5 },
  ),
  enchant(
    'enchant_legs_runed_hide',
    'Enchant Legs - Runed Hide',
    'runed',
    'legs',
    [essence(2), weave('resonant_hide')],
    { agi: 4 },
  ),
  enchant(
    'enchant_helmet_runed_links',
    'Enchant Helmet - Runed Links',
    'runed',
    'helmet',
    [essence(2), weave('resonant_links')],
    { sta: 4 },
  ),

  // --- Greater: the arcane_shard sink, on the highest-impact slots -------
  enchant(
    'enchant_weapon_greater_might',
    'Enchant Weapon - Greater Might',
    'greater',
    'mainhand',
    [shard(1), essence(2)],
    { str: 5 },
  ),
  enchant(
    'enchant_weapon_greater_spellpower',
    'Enchant Weapon - Greater Spellpower',
    'greater',
    'mainhand',
    [shard(1), essence(2)],
    { int: 5 },
  ),
  enchant(
    'enchant_helmet_greater_fortitude',
    'Enchant Helmet - Greater Fortitude',
    'greater',
    'helmet',
    [shard(1), essence(2)],
    { sta: 5 },
  ),
  enchant(
    'enchant_chest_greater_stamina',
    'Enchant Chest - Greater Stamina',
    'greater',
    'chest',
    [shard(1), essence(3)],
    { sta: 6 },
  ),
  enchant(
    'enchant_legs_greater_stamina',
    'Enchant Legs - Greater Stamina',
    'greater',
    'legs',
    [shard(1), essence(3)],
    { sta: 5 },
  ),
  enchant(
    'enchant_gloves_greater_agility',
    'Enchant Gloves - Greater Agility',
    'greater',
    'gloves',
    [shard(1), essence(2)],
    { agi: 6 },
  ),
];

/** The enchant catalogue, keyed by enchant id. */
export const ENCHANTS: EnchantTable = Object.fromEntries(ROWS.map((e) => [e.id, e]));

/** Resolve one enchant id. Returns undefined for an unknown id rather than
 *  throwing: this is fed by wire commands and persisted markers. */
export function enchantById(id: string): EnchantDef | undefined {
  return ENCHANTS[id];
}
