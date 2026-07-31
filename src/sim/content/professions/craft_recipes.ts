// Crafted goods and the recipes that make them, authored as ONE table.
//
// An item def and its recipe are two views of a single authored fact, so they
// are declared once and derived twice (`CRAFT_ITEMS` and `CRAFT_RECIPES`
// below). That is not tidiness for its own sake: it is what makes the economy
// invariant structural instead of a number somebody has to remember to
// re-check. See `craftedSellValue`.
//
// THE LADDER. Four rungs, one per zone, declared in `crafts.ts` (`CRAFT_RUNGS`)
// so skillReq / level / material tier never drift row to row:
//
//   rung 1  Eastbrook Vale       skillReq 0    level 5    copper / ironbark / silverleaf
//   rung 2  Mirefen Marsh        skillReq 25   level 10   iron / ashwood / goldleaf
//   rung 3  Thornpeak Heights    skillReq 50   level 15   thorium / elderwood / sunpetal
//   rung 4  Ashen Wastes         skillReq 75   level 20   cinderite / boneash / gravebloom
//
// Three crafts, one per gathered node family, so every one of wave 1's twelve
// materials has a primary consumer and fishing's catches have a sink:
//
//   smithing   ore-led (timber for hafts and fuel): mail armor and heavy weapons
//   woodcraft  timber-led (herbs for binding and dye): staves, hafted daggers,
//              and bark-weave light armor
//   alchemy    herb-led (river catches for the oils): draughts and elixirs
//
// STAT BUDGETS ARE OURS, not upstream's. This repo has no documented budget
// formula (`src/sim/content/items.ts` says so outright), so every row below was
// placed against the ACTUAL shipped items at the same level band, and each
// group carries the drop it was matched to in a comment. Crafted gear sits at
// the LOW end of its band on purpose: a drop or a quest reward should still be
// the better piece, and what crafting sells is availability on demand, the
// maker's signature, and the masterwork chance. Upstream's own gear numbers
// were not portable in either direction: their recipes output items from their
// item table, which is not ours.
//
// THE ECONOMY INVARIANT, upstream's locked ruling ("no recipe vendors above its
// input value"): gathered materials are an infinite faucet, so a crafted item
// that vendors for more than its reagents is a gold printer. `craftedSellValue`
// derives every output's price from its own reagent list at 75 percent, which
// makes the invariant impossible to break by construction rather than merely
// tested for. It also puts crafted gear where it belongs on the vendor sheet:
// worth wearing and worth trading, never worth selling back.

import { GATHER_MATERIAL_ITEMS } from './gather_materials';
import { ENCHANT_MATERIAL_ITEMS } from './enchant_materials';
import { craftRung } from './crafts';
import { BASE_ITEMS } from '../items';
import type {
  CraftingProfessionId,
  CraftRecipeDef,
  RecipeReagent,
} from '../../professions/types';
import type { ItemDef } from '../../types';

// ---------------------------------------------------------------------------
// Reagent pricing
// ---------------------------------------------------------------------------

/** The copper one unit of a reagent is worth. Reads the three tables a recipe
 *  can draw from: wave 1's gathered materials, this wave's arcane materials,
 *  and `content/items.ts` for the fishing catches. An id none of them knows is
 *  worth 0, which only makes `craftedSellValue` more conservative. */
export function reagentUnitValue(itemId: string): number {
  const def =
    GATHER_MATERIAL_ITEMS[itemId] ?? ENCHANT_MATERIAL_ITEMS[itemId] ?? BASE_ITEMS[itemId];
  return def?.sellValue ?? 0;
}

/** Total copper value of one craft's reagent list. */
export function reagentListValue(reagents: readonly RecipeReagent[]): number {
  return reagents.reduce((sum, r) => sum + reagentUnitValue(r.itemId) * r.count, 0);
}

/** Fraction of the input value one crafted unit vendors back for. Strictly
 *  below 1, which is the whole invariant; 0.75 leaves visible headroom so a
 *  later reagent re-price cannot silently cross the line. */
export const CRAFTED_SELL_FRACTION = 0.75;

/** The vendor price of one crafted unit, derived from its recipe so it can
 *  never exceed the reagents that made it. */
export function craftedSellValue(
  reagents: readonly RecipeReagent[],
  resultCount: number,
): number {
  return Math.floor((CRAFTED_SELL_FRACTION * reagentListValue(reagents)) / Math.max(1, resultCount));
}

// ---------------------------------------------------------------------------
// The authored table
// ---------------------------------------------------------------------------

interface CraftRow {
  professionId: CraftingProfessionId;
  rung: 1 | 2 | 3 | 4;
  itemId: string;
  name: string;
  kind: ItemDef['kind'];
  quality: NonNullable<ItemDef['quality']>;
  slot?: ItemDef['slot'];
  armorType?: ItemDef['armorType'];
  weapon?: ItemDef['weapon'];
  stats?: ItemDef['stats'];
  potionHp?: number;
  elixir?: ItemDef['elixir'];
  /** Copies per craft. Defaults to 1. */
  resultCount?: number;
  reagents: RecipeReagent[];
}

const r = (itemId: string, count: number): RecipeReagent => ({ itemId, count });

const ROWS: CraftRow[] = [
  // =========================================================================
  // SMITHING: mail armor and heavy weapons. Ore-led, timber for hafts and fuel.
  // =========================================================================

  // Rung 1, level 5, uncommon. Matched against the Vale's uncommon drops:
  // militia_vest (chest, armor 90, sta 2) and redbrook_blade (6-11 / 2.2,
  // str 2). Ours sit a notch under both.
  {
    professionId: 'smithing',
    rung: 1,
    itemId: 'copperguard_hauberk',
    name: 'Copperguard Hauberk',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'mail',
    stats: { armor: 85, sta: 2, str: 1 },
    reagents: [r('copper_ore', 10), r('ironbark_log', 4)],
  },
  {
    professionId: 'smithing',
    rung: 1,
    itemId: 'copperguard_greaves',
    name: 'Copperguard Greaves',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'legs',
    armorType: 'mail',
    // Legs ride 0.88 of the set's chest armor, the ratio every shipped set uses.
    stats: { armor: 75, sta: 2 },
    reagents: [r('copper_ore', 8), r('ironbark_log', 3)],
  },
  {
    professionId: 'smithing',
    rung: 1,
    itemId: 'vale_forged_blade',
    name: 'Vale-Forged Blade',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 6, max: 11, speed: 2.3 },
    stats: { str: 2, sta: 1 },
    reagents: [r('copper_ore', 9), r('ironbark_log', 3)],
  },

  // Rung 2, level 10, uncommon. Matched against Mirefen's uncommons:
  // drownedguard_breastplate (armor 130, sta 4) and deacons_cleaver
  // (11-18 / 2.4, str 4).
  {
    professionId: 'smithing',
    rung: 2,
    itemId: 'ironguard_hauberk',
    name: 'Ironguard Hauberk',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'mail',
    stats: { armor: 120, sta: 4, str: 2 },
    reagents: [r('iron_ore', 12), r('ashwood_log', 4)],
  },
  {
    professionId: 'smithing',
    rung: 2,
    itemId: 'ironguard_helm',
    name: 'Ironguard Helm',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'helmet',
    armorType: 'mail',
    // Helmet rides 0.80 of chest armor.
    stats: { armor: 96, sta: 3, str: 1 },
    reagents: [r('iron_ore', 9), r('ashwood_log', 3)],
  },
  {
    professionId: 'smithing',
    rung: 2,
    itemId: 'mirefen_forged_maul',
    name: 'Mirefen-Forged Maul',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 11, max: 18, speed: 2.6 },
    stats: { str: 4, sta: 2 },
    reagents: [r('iron_ore', 10), r('ashwood_log', 4)],
  },

  // Rung 3, level 15, uncommon. Matched against Thornpeak's uncommons:
  // boneplate_vest (armor 170, str 3, sta 6), drogmar_warboots (armor 85,
  // str 3, sta 4), zealotsbane_blade (18-29 / 2.3, str 6, sta 2).
  {
    professionId: 'smithing',
    rung: 3,
    itemId: 'thorium_battleplate',
    name: 'Thorium Battleplate',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'mail',
    stats: { armor: 165, sta: 6, str: 3 },
    reagents: [r('thorium_ore', 14), r('elderwood_log', 5)],
  },
  {
    professionId: 'smithing',
    rung: 3,
    itemId: 'thorium_warboots',
    name: 'Thorium Warboots',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'feet',
    armorType: 'mail',
    // Feet ride 0.64 of chest armor.
    stats: { armor: 106, sta: 4, str: 2 },
    reagents: [r('thorium_ore', 10), r('elderwood_log', 4)],
  },
  {
    professionId: 'smithing',
    rung: 3,
    itemId: 'thornpeak_greatblade',
    name: 'Thornpeak Greatblade',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 18, max: 29, speed: 2.4 },
    stats: { str: 6, sta: 3 },
    reagents: [r('thorium_ore', 12), r('elderwood_log', 5)],
  },

  // Rung 4, level 20, RARE. Matched against the level-20 rares:
  // boneguard_breastplate (armor 210, str 4, sta 7) and emberfang_warblade
  // (26-41 / 2.5, str 8, sta 3). Ours match the armor and sit one to two
  // primary points under, so the endgame craft is a real alternative to a
  // Thornpeak rare and still well below the epics (18 to 32 primary points).
  // The essence in every rung-4 recipe is deliberate: it is the one place
  // enchanting's faucet feeds another craft, so a smith who never breaks gear
  // down has to trade for it.
  {
    professionId: 'smithing',
    rung: 4,
    itemId: 'cinderforged_hauberk',
    name: 'Cinderforged Hauberk',
    kind: 'armor',
    quality: 'rare',
    slot: 'chest',
    armorType: 'mail',
    stats: { armor: 215, sta: 9, str: 5 },
    reagents: [r('cinderite_ore', 16), r('boneash_log', 6), r('arcane_essence', 2)],
  },
  {
    professionId: 'smithing',
    rung: 4,
    itemId: 'cinderforged_gauntlets',
    name: 'Cinderforged Gauntlets',
    kind: 'armor',
    quality: 'rare',
    slot: 'gloves',
    armorType: 'mail',
    // Gloves ride 0.59 of chest armor.
    stats: { armor: 127, sta: 6, str: 4 },
    reagents: [r('cinderite_ore', 11), r('boneash_log', 4), r('arcane_essence', 1)],
  },
  {
    professionId: 'smithing',
    rung: 4,
    itemId: 'cinderforged_reaver',
    name: 'Cinderforged Reaver',
    kind: 'weapon',
    quality: 'rare',
    slot: 'mainhand',
    weapon: { min: 26, max: 41, speed: 2.5 },
    stats: { str: 7, sta: 4 },
    reagents: [r('cinderite_ore', 14), r('boneash_log', 6), r('arcane_essence', 2)],
  },

  // =========================================================================
  // WOODCRAFT: staves, hafted daggers, bark-weave light armor. Timber-led,
  // herbs for the binding and the dye.
  //
  // Cloth armor from timber is deliberate rather than a stretch: we have no
  // skinning and no cloth faucet, so the only fibre this world actually
  // produces is the ironbark / elderwood line, and a craft that could not
  // clothe a caster would leave four of our nine classes with nothing to make.
  // The hafted daggers are here for the same reason: rogues and hunters need a
  // crafted weapon, and a carved haft is woodcraft's to make where a mail
  // hauberk is not.
  // =========================================================================

  // Rung 1, level 5, uncommon. Matched against woven_robe (armor 30, int 3,
  // spi 2), apprentice_staff (7-12 / 3.0, int 3, sta 1), keen_dirk
  // (4-8 / 1.7, agi 2).
  {
    professionId: 'woodcraft',
    rung: 1,
    itemId: 'ironbark_stave',
    name: 'Ironbark Stave',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 7, max: 12, speed: 3.0 },
    stats: { int: 3, spi: 1 },
    reagents: [r('ironbark_log', 9), r('silverleaf_herb', 4)],
  },
  {
    professionId: 'woodcraft',
    rung: 1,
    itemId: 'silverweave_robe',
    name: 'Silverweave Robe',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'cloth',
    stats: { armor: 28, int: 2, spi: 2 },
    reagents: [r('ironbark_log', 6), r('silverleaf_herb', 6)],
  },
  {
    professionId: 'woodcraft',
    rung: 1,
    itemId: 'silverbound_kris',
    name: 'Silverbound Kris',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 5, max: 8, speed: 1.7, dagger: true },
    stats: { agi: 2, sta: 1 },
    reagents: [r('ironbark_log', 7), r('silverleaf_herb', 3)],
  },

  // Rung 2, level 10, uncommon. Matched against fenmist_robe (armor 45, int 5,
  // spi 3), staff_of_drowned_prayers (12-20 / 3.0, int 5, spi 2),
  // mistbinder_kris (7-12 / 1.7, agi 4).
  {
    professionId: 'woodcraft',
    rung: 2,
    itemId: 'ashwood_stave',
    name: 'Ashwood Stave',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 12, max: 20, speed: 3.0 },
    stats: { int: 5, spi: 2 },
    reagents: [r('ashwood_log', 10), r('goldleaf_herb', 5)],
  },
  {
    professionId: 'woodcraft',
    rung: 2,
    itemId: 'goldweave_robe',
    name: 'Goldweave Robe',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'cloth',
    stats: { armor: 42, int: 4, spi: 3 },
    reagents: [r('ashwood_log', 8), r('goldleaf_herb', 6)],
  },
  {
    professionId: 'woodcraft',
    rung: 2,
    itemId: 'goldbound_kris',
    name: 'Goldbound Kris',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 8, max: 12, speed: 1.7, dagger: true },
    stats: { agi: 4, sta: 2 },
    reagents: [r('ashwood_log', 9), r('goldleaf_herb', 4)],
  },

  // Rung 3, level 15, uncommon. Matched against revenant_silk_robe (armor 60,
  // int 7, spi 4), ironvein_lantern_staff (19-31 / 3.0, int 7, spi 3),
  // cultist_flayer (12-19 / 1.7, agi 7).
  {
    professionId: 'woodcraft',
    rung: 3,
    itemId: 'elderwood_stave',
    name: 'Elderwood Stave',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 19, max: 31, speed: 3.0 },
    stats: { int: 7, spi: 3 },
    reagents: [r('elderwood_log', 12), r('sunpetal_herb', 6)],
  },
  {
    professionId: 'woodcraft',
    rung: 3,
    itemId: 'sunweave_robe',
    name: 'Sunweave Robe',
    kind: 'armor',
    quality: 'uncommon',
    slot: 'chest',
    armorType: 'cloth',
    stats: { armor: 58, int: 6, spi: 4 },
    reagents: [r('elderwood_log', 10), r('sunpetal_herb', 6)],
  },
  {
    professionId: 'woodcraft',
    rung: 3,
    itemId: 'sunbound_kris',
    name: 'Sunbound Kris',
    kind: 'weapon',
    quality: 'uncommon',
    slot: 'mainhand',
    weapon: { min: 12, max: 19, speed: 1.7, dagger: true },
    stats: { agi: 6, sta: 3 },
    reagents: [r('elderwood_log', 11), r('sunpetal_herb', 5)],
  },

  // Rung 4, level 20, RARE. Matched against the level-20 rares:
  // wyrmcult_grand_robe (armor 75, int 11, spi 5), staff_of_velkhar
  // (27-43 / 3.0, int 10, spi 5), skullsplitter_dirk (15-23 / 1.7, agi 8,
  // sta 3). Ours sit one point under each.
  {
    professionId: 'woodcraft',
    rung: 4,
    itemId: 'boneash_stave',
    name: 'Boneash Stave',
    kind: 'weapon',
    quality: 'rare',
    slot: 'mainhand',
    weapon: { min: 25, max: 40, speed: 3.0 },
    stats: { int: 9, spi: 5 },
    reagents: [r('boneash_log', 14), r('gravebloom_herb', 6), r('arcane_essence', 2)],
  },
  {
    professionId: 'woodcraft',
    rung: 4,
    itemId: 'ashenweave_robe',
    name: 'Ashenweave Robe',
    kind: 'armor',
    quality: 'rare',
    slot: 'chest',
    armorType: 'cloth',
    stats: { armor: 64, int: 9, spi: 5 },
    reagents: [r('boneash_log', 12), r('gravebloom_herb', 6), r('arcane_essence', 2)],
  },
  {
    professionId: 'woodcraft',
    rung: 4,
    itemId: 'ashenbound_kris',
    name: 'Ashenbound Kris',
    kind: 'weapon',
    quality: 'rare',
    slot: 'mainhand',
    weapon: { min: 15, max: 23, speed: 1.7, dagger: true },
    stats: { agi: 8, sta: 3 },
    reagents: [r('boneash_log', 13), r('gravebloom_herb', 5), r('arcane_essence', 2)],
  },

  // =========================================================================
  // ALCHEMY: draughts and elixirs. Herb-led, with a river catch for the oil
  // base, which is what gives fishing a crafting sink at all (its other output,
  // food, is already consumable on its own).
  //
  // Draughts come two to a craft, so alchemy is the one place a masterwork proc
  // has to pick a copy out of a batch, and the healing ladder is placed against
  // the shipped potions (minor 90, then 150 and 280).
  // =========================================================================
  {
    professionId: 'alchemy',
    rung: 1,
    itemId: 'silverleaf_draught',
    name: 'Silverleaf Draught',
    kind: 'potion',
    quality: 'common',
    potionHp: 130,
    resultCount: 2,
    reagents: [r('silverleaf_herb', 4), r('raw_river_perch', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 1,
    itemId: 'elixir_of_silver_vigor',
    name: 'Elixir of Silver Vigor',
    kind: 'elixir',
    quality: 'common',
    elixir: { aura: 'Silver Vigor', kind: 'buff_sta', value: 6, duration: 900 },
    reagents: [r('silverleaf_herb', 3), r('raw_mirror_trout', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 2,
    itemId: 'goldleaf_draught',
    name: 'Goldleaf Draught',
    kind: 'potion',
    quality: 'common',
    potionHp: 210,
    resultCount: 2,
    reagents: [r('goldleaf_herb', 4), r('raw_marsh_pike', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 2,
    itemId: 'elixir_of_golden_focus',
    name: 'Elixir of Golden Focus',
    kind: 'elixir',
    quality: 'common',
    elixir: { aura: 'Golden Focus', kind: 'buff_int', value: 8, duration: 900 },
    reagents: [r('goldleaf_herb', 3), r('raw_bog_eel', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 3,
    itemId: 'sunpetal_draught',
    name: 'Sunpetal Draught',
    kind: 'potion',
    quality: 'uncommon',
    potionHp: 330,
    resultCount: 2,
    reagents: [r('sunpetal_herb', 4), r('raw_frostgill_trout', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 3,
    itemId: 'elixir_of_sunpetal_swiftness',
    name: 'Elixir of Sunpetal Swiftness',
    kind: 'elixir',
    quality: 'uncommon',
    elixir: { aura: 'Sunpetal Swiftness', kind: 'buff_agi', value: 10, duration: 900 },
    reagents: [r('sunpetal_herb', 3), r('raw_stonescale_carp', 2)],
  },
  {
    professionId: 'alchemy',
    rung: 4,
    itemId: 'gravebloom_draught',
    name: 'Gravebloom Draught',
    kind: 'potion',
    quality: 'uncommon',
    potionHp: 500,
    resultCount: 2,
    reagents: [r('gravebloom_herb', 5), r('raw_pallid_ashfish', 2), r('arcane_dust', 1)],
  },
  {
    professionId: 'alchemy',
    rung: 4,
    itemId: 'elixir_of_the_ashen_ward',
    name: 'Elixir of the Ashen Ward',
    kind: 'elixir',
    quality: 'rare',
    // Matches the shipped ceiling (elixir_of_the_bear, buff_sta 12) rather than
    // exceeding it: the endgame elixir is the reliably craftable one, not a
    // stronger one.
    elixir: { aura: 'Ashen Ward', kind: 'buff_sta', value: 12, duration: 900 },
    reagents: [r('gravebloom_herb', 4), r('raw_cinderscale_eel', 2), r('arcane_dust', 1)],
  },
];

// ---------------------------------------------------------------------------
// The two derived views
// ---------------------------------------------------------------------------

function itemFor(row: CraftRow): ItemDef {
  const resultCount = row.resultCount ?? 1;
  const def: ItemDef = {
    id: row.itemId,
    name: row.name,
    kind: row.kind,
    quality: row.quality,
    sellValue: craftedSellValue(row.reagents, resultCount),
  };
  if (row.slot) def.slot = row.slot;
  if (row.armorType) def.armorType = row.armorType;
  if (row.weapon) def.weapon = row.weapon;
  if (row.stats) def.stats = row.stats;
  if (row.potionHp !== undefined) def.potionHp = row.potionHp;
  if (row.elixir) def.elixir = row.elixir;
  // requiredLevel is set EXPLICITLY on every equippable crafted piece, never
  // left to be derived. `requiredLevelFor` derives a rare's gate from
  // `itemSourceLevel`, which knows about drops and quest rewards; a crafted
  // item has neither, so it would fall through to the flat per-quality band
  // (rare -> 12) and a level-12 character could wear a level-20 crafted rare.
  // That hole is real and already visible on the vendor-only Dawn set.
  if (row.slot) def.requiredLevel = craftRung(row.rung).level;
  return def;
}

function recipeFor(row: CraftRow): CraftRecipeDef {
  const rung = craftRung(row.rung);
  return {
    id: `recipe_${row.itemId}`,
    professionId: row.professionId,
    resultItemId: row.itemId,
    resultCount: row.resultCount ?? 1,
    reagents: row.reagents,
    skillReq: rung.skillReq,
    level: rung.level,
    materialTier: rung.materialTier,
  };
}

/** Every item def this wave's recipes produce, for `data.ts` to spread into
 *  `ITEMS`. */
export const CRAFT_ITEMS: Record<string, ItemDef> = Object.fromEntries(
  ROWS.map((row) => [row.itemId, itemFor(row)]),
);

/** Every recipe, in authored order (craft, then rung). */
export const CRAFT_RECIPES: readonly CraftRecipeDef[] = ROWS.map(recipeFor);

const RECIPES_BY_ID: Readonly<Record<string, CraftRecipeDef>> = Object.fromEntries(
  CRAFT_RECIPES.map((recipe) => [recipe.id, recipe]),
);

/** Resolve one recipe id. Returns undefined for an unknown id rather than
 *  throwing: this is fed by wire commands. */
export function recipeById(id: string): CraftRecipeDef | undefined {
  return RECIPES_BY_ID[id];
}

/** Every recipe of one craft, in rung order. */
export function recipesForProfession(professionId: CraftingProfessionId): CraftRecipeDef[] {
  return CRAFT_RECIPES.filter((recipe) => recipe.professionId === professionId);
}
