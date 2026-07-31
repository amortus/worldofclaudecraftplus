// Crafted content: the recipe ladder, the economy invariant, and the item
// budgets the crafted gear was placed against.

import { describe, expect, it } from 'vitest';
import {
  CRAFT_ITEMS,
  CRAFT_RECIPES,
  CRAFT_RUNGS,
  CRAFTED_SELL_FRACTION,
  CRAFTING_MAX_SKILL,
  CRAFTING_PROFESSIONS,
  craftRung,
  reagentListValue,
  recipeById,
  recipesForProfession,
} from '../src/sim/content/professions';
import { CRAFTING_PROFESSION_IDS, CRAFT_MAX_SKILL } from '../src/sim/professions';
import { ITEMS } from '../src/sim/data';
import { EQUIP_SLOTS } from '../src/sim/types';
import { requiredLevelFor } from '../src/sim/item_level_req';

const GEAR_CRAFTS = ['smithing', 'woodcraft'] as const;

describe('the crafting profession roster', () => {
  it('registers exactly the four crafts the union names', () => {
    expect(Object.keys(CRAFTING_PROFESSIONS).sort()).toEqual([...CRAFTING_PROFESSION_IDS].sort());
    for (const id of CRAFTING_PROFESSION_IDS) {
      expect(CRAFTING_PROFESSIONS[id].id).toBe(id);
      expect(CRAFTING_PROFESSIONS[id].category).toBe('crafting');
    }
  });

  it('caps every craft at the shared 125 ceiling', () => {
    for (const id of CRAFTING_PROFESSION_IDS) {
      expect(CRAFTING_MAX_SKILL[id]).toBe(CRAFT_MAX_SKILL);
    }
  });

  it('declares four rungs, one per zone, on the 25-point ladder', () => {
    expect(CRAFT_RUNGS.map((r) => r.skillReq)).toEqual([0, 25, 50, 75]);
    expect(CRAFT_RUNGS.map((r) => r.level)).toEqual([5, 10, 15, 20]);
    expect(CRAFT_RUNGS.map((r) => r.materialTier)).toEqual([0, 1, 2, 3]);
    expect(CRAFT_RUNGS.map((r) => r.zoneId)).toEqual([
      'eastbrook_vale',
      'mirefen_marsh',
      'thornpeak_heights',
      'ashen_wastes',
    ]);
  });
});

describe('the recipe table', () => {
  it('gives every recipe a unique id that resolves', () => {
    const ids = new Set<string>();
    for (const recipe of CRAFT_RECIPES) {
      expect(ids.has(recipe.id)).toBe(false);
      ids.add(recipe.id);
      expect(recipeById(recipe.id)).toBe(recipe);
    }
    expect(recipeById('recipe_does_not_exist')).toBeUndefined();
  });

  it('names a real result item and real reagents', () => {
    for (const recipe of CRAFT_RECIPES) {
      expect(ITEMS[recipe.resultItemId], recipe.id).toBeDefined();
      expect(recipe.reagents.length).toBeGreaterThan(0);
      for (const reagent of recipe.reagents) {
        expect(ITEMS[reagent.itemId], `${recipe.id} -> ${reagent.itemId}`).toBeDefined();
        expect(reagent.count).toBeGreaterThan(0);
      }
    }
  });

  it('files every recipe under a real craft, and only the three making crafts', () => {
    for (const recipe of CRAFT_RECIPES) {
      expect(CRAFTING_PROFESSIONS[recipe.professionId]).toBeDefined();
      // Enchanting has no recipes: its outputs are applied to other items.
      expect(recipe.professionId).not.toBe('enchanting');
    }
    expect(recipesForProfession('enchanting')).toEqual([]);
    for (const id of ['smithing', 'woodcraft', 'alchemy'] as const) {
      expect(recipesForProfession(id).length, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('keeps skillReq, level and material tier locked to the rung', () => {
    const byRung = new Map(CRAFT_RUNGS.map((r) => [r.skillReq, r]));
    for (const recipe of CRAFT_RECIPES) {
      const rung = byRung.get(recipe.skillReq);
      expect(rung, recipe.id).toBeDefined();
      expect(recipe.level).toBe(rung?.level);
      expect(recipe.materialTier).toBe(rung?.materialTier);
    }
  });

  it('covers all four rungs in each making craft', () => {
    for (const id of ['smithing', 'woodcraft', 'alchemy'] as const) {
      const rungs = new Set(recipesForProfession(id).map((r) => r.skillReq));
      expect([...rungs].sort((a, b) => a - b), id).toEqual([0, 25, 50, 75]);
    }
  });
});

describe('the economy invariant', () => {
  // Gathered materials are an infinite faucet, so a crafted item that vendors
  // for more than its reagents is a gold printer. `craftedSellValue` derives
  // every price at CRAFTED_SELL_FRACTION of the input, which makes this
  // structural; the test is the wall against someone hand-editing a price back.
  it('never lets a recipe vendor back more than its input value', () => {
    expect(CRAFTED_SELL_FRACTION).toBeLessThan(1);
    for (const recipe of CRAFT_RECIPES) {
      const input = reagentListValue(recipe.reagents);
      const output = (ITEMS[recipe.resultItemId].sellValue ?? 0) * recipe.resultCount;
      expect(input, recipe.id).toBeGreaterThan(0);
      expect(output, `${recipe.id}: output ${output} vs input ${input}`).toBeLessThan(input);
    }
  });

  it('never gives a crafted good a vendor buy price', () => {
    // Buying a crafted item from an NPC would bypass the whole profession.
    for (const id of Object.keys(CRAFT_ITEMS)) {
      expect(CRAFT_ITEMS[id].buyValue, id).toBeUndefined();
    }
  });
});

describe('crafted item defs', () => {
  it('merges every crafted item into ITEMS', () => {
    for (const id of Object.keys(CRAFT_ITEMS)) {
      expect(ITEMS[id], id).toBe(CRAFT_ITEMS[id]);
    }
  });

  it('pins requiredLevel explicitly on every equippable piece', () => {
    // Left implicit, `requiredLevelFor` would fall through to the flat
    // per-quality band for a crafted item (no drop or quest source), gating a
    // level-20 crafted rare at level 12.
    for (const recipe of CRAFT_RECIPES) {
      const def = ITEMS[recipe.resultItemId];
      if (!def.slot) continue;
      expect(def.requiredLevel, def.id).toBe(recipe.level);
      expect(requiredLevelFor(def), def.id).toBe(recipe.level);
    }
  });

  it('only uses the eight real equip slots', () => {
    for (const def of Object.values(CRAFT_ITEMS)) {
      if (!def.slot) continue;
      expect(EQUIP_SLOTS, def.id).toContain(def.slot);
    }
  });

  it('declares an armor class on every crafted armor piece', () => {
    for (const def of Object.values(CRAFT_ITEMS)) {
      if (def.kind !== 'armor') continue;
      expect(def.armorType, def.id).toBeDefined();
    }
  });

  it('follows the shipped weapon spread and speed conventions', () => {
    for (const def of Object.values(CRAFT_ITEMS)) {
      const w = def.weapon;
      if (!w) continue;
      // Shipped weapons run a wide low-level spread (worn_sword is 2-5, 0.40)
      // that tightens toward min = 0.63 * max at the top. The crafted line
      // stays inside 0.54 to 0.67 across all four rungs, which is the band the
      // shipped level-5-and-up weapons occupy (redbrook_blade is 6-11, 0.545).
      expect(w.min / w.max, def.id).toBeGreaterThanOrEqual(0.54);
      expect(w.min / w.max, def.id).toBeLessThan(0.7);
      if (w.dagger) expect(w.speed, def.id).toBeLessThanOrEqual(1.8);
      else expect(w.speed, def.id).toBeGreaterThanOrEqual(2.2);
    }
  });

  it('keeps crafted gear at or under the best shipped drop of its band', () => {
    // Crafted gear buys availability, a maker's signature and a masterwork
    // chance; it must not also be the best item in its band.
    const primaries = ['str', 'agi', 'sta', 'int', 'spi'] as const;
    const totalPrimary = (stats: Record<string, number> | undefined) =>
      primaries.reduce((sum, k) => sum + (stats?.[k] ?? 0), 0);

    for (const craft of GEAR_CRAFTS) {
      for (const recipe of recipesForProfession(craft)) {
        const def = ITEMS[recipe.resultItemId];
        if (!def.slot) continue;
        // The best NON-crafted item of the same slot whose gate is at or below
        // this piece's level.
        let bandBest = 0;
        for (const other of Object.values(ITEMS)) {
          if (other.slot !== def.slot) continue;
          if (CRAFT_ITEMS[other.id]) continue;
          if (requiredLevelFor(other) > recipe.level) continue;
          bandBest = Math.max(bandBest, totalPrimary(other.stats));
        }
        expect(totalPrimary(def.stats), `${def.id} vs band best ${bandBest}`).toBeLessThanOrEqual(
          bandBest,
        );
      }
    }
  });
});

describe('material coverage', () => {
  const consumed = new Set(CRAFT_RECIPES.flatMap((r) => r.reagents.map((x) => x.itemId)));

  it('gives all twelve gathered materials a consumer', () => {
    for (const family of ['ore', 'log', 'herb'] as const) {
      // Names are spelled out rather than derived so a renamed material fails
      // loudly here instead of silently dropping out of the coverage set.
      const ids = {
        ore: ['copper_ore', 'iron_ore', 'thorium_ore', 'cinderite_ore'],
        log: ['ironbark_log', 'ashwood_log', 'elderwood_log', 'boneash_log'],
        herb: ['silverleaf_herb', 'goldleaf_herb', 'sunpetal_herb', 'gravebloom_herb'],
      }[family];
      for (const id of ids) expect(consumed.has(id), id).toBe(true);
    }
  });

  it('gives the fishing catches a crafting sink', () => {
    const fish = [
      'raw_river_perch',
      'raw_mirror_trout',
      'raw_marsh_pike',
      'raw_bog_eel',
      'raw_frostgill_trout',
      'raw_stonescale_carp',
      'raw_pallid_ashfish',
      'raw_cinderscale_eel',
    ];
    for (const id of fish) expect(consumed.has(id), id).toBe(true);
  });

  it('feeds enchanting material back into the top rung of the making crafts', () => {
    for (const craft of GEAR_CRAFTS) {
      const top = recipesForProfession(craft).filter((r) => r.skillReq === craftRung(4).skillReq);
      expect(top.length, craft).toBeGreaterThan(0);
      for (const recipe of top) {
        expect(
          recipe.reagents.some((r) => r.itemId === 'arcane_essence'),
          recipe.id,
        ).toBe(true);
      }
    }
  });
});
