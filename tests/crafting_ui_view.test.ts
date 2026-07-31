// Unit tests for the pure Crafting-window view model (src/ui/crafting_ui_view.ts).
//
// No DOM: the module under test is DOM-free and i18n-free by contract (the same
// split tests/vendor_view.test.ts and tests/skills_panel_view.test.ts drive), so
// every assertion here is on structure and numbers.

import { describe, expect, it } from 'vitest';
import {
  buildCraftingWindowView,
  CRAFT_TONE_COLOR,
  craftDenyView,
  craftMasteryColor,
  craftMasteryState,
  craftResultView,
  craftSkillUpView,
  MASTERY_STATE_COLOR,
  STAT_LINE_ORDER,
  statBonusLines,
} from '../src/ui/crafting_ui_view';
import { MASTERY_STATE_COLOR as WAVE_ONE_COLORS } from '../src/ui/skills_panel_view';
import {
  beginCraft,
  CRAFT_MAX_SKILL,
  type CraftingProfessionId,
  type CraftRecipeDef,
  type PlayerCraftSkill,
} from '../src/sim/professions';
import { CRAFT_RECIPES, CRAFTING_MAX_SKILL } from '../src/sim/content/professions';
import type { InvSlot } from '../src/sim/types';

const CAPS = CRAFTING_MAX_SKILL;

function skills(partial: Partial<Record<CraftingProfessionId, number>> = {}): PlayerCraftSkill[] {
  return (['smithing', 'woodcraft', 'alchemy', 'enchanting'] as const).map((professionId) => ({
    professionId,
    skill: partial[professionId] ?? 0,
    maxSkill: CAPS[professionId],
  }));
}

function bag(...rows: [string, number][]): InvSlot[] {
  return rows.map(([itemId, count]) => ({ itemId, count }));
}

/** A recipe literal, so the reagent-row tests never depend on shipped content. */
function recipe(over: Partial<CraftRecipeDef> = {}): CraftRecipeDef {
  return {
    id: 'recipe_test',
    professionId: 'smithing',
    resultItemId: 'copperguard_hauberk',
    resultCount: 1,
    reagents: [
      { itemId: 'copper_ore', count: 10 },
      { itemId: 'ironbark_log', count: 4 },
    ],
    skillReq: 0,
    level: 5,
    materialTier: 0,
    ...over,
  };
}

function findRow(view: ReturnType<typeof buildCraftingWindowView>, professionId: CraftingProfessionId) {
  return view.professions.find((row) => row.professionId === professionId)!;
}

describe('reagent rows: held versus required', () => {
  it('reports held, required and the shortfall per line, in the recipe order', () => {
    const view = buildCraftingWindowView({
      skills: skills(),
      recipes: [recipe()],
      inventory: bag(['copper_ore', 3], ['ironbark_log', 9]),
    });
    const row = findRow(view, 'smithing').recipes[0];
    expect(row.reagents).toEqual([
      { itemId: 'copper_ore', required: 10, held: 3, met: false, short: 7 },
      { itemId: 'ironbark_log', required: 4, held: 9, met: true, short: 0 },
    ]);
  });

  it('sums a split stack of the same reagent across bag slots', () => {
    const view = buildCraftingWindowView({
      skills: skills(),
      recipes: [recipe()],
      inventory: bag(['copper_ore', 6], ['copper_ore', 4], ['ironbark_log', 4]),
    });
    const row = findRow(view, 'smithing').recipes[0];
    expect(row.reagents[0]).toMatchObject({ held: 10, met: true, short: 0 });
    expect(row.craftable).toBe(true);
    expect(row.denyReason).toBeUndefined();
  });

  it('disables the craft with a reason and names every short line', () => {
    const view = buildCraftingWindowView({
      skills: skills(),
      recipes: [recipe()],
      inventory: bag(['copper_ore', 1]),
    });
    const row = findRow(view, 'smithing').recipes[0];
    expect(row.craftable).toBe(false);
    expect(row.denyReason).toBe('insufficient_materials');
    expect(row.shortItemIds).toEqual(['copper_ore', 'ironbark_log']);
  });

  it('agrees with the sim gate it is built on, line for line', () => {
    const inventory = bag(['copper_ore', 10], ['ironbark_log', 2]);
    const r = recipe();
    const start = beginCraft({
      recipe: r,
      skill: 40,
      maxSkill: CRAFT_MAX_SKILL,
      inventory,
      crafterName: 'Test',
      crafterId: 1,
      output: { kind: 'armor' },
    });
    const view = buildCraftingWindowView({
      skills: skills({ smithing: 40 }),
      recipes: [r],
      inventory,
    });
    const row = findRow(view, 'smithing').recipes[0];
    expect(row.craftable).toBe(start.ok);
    expect(row.skillGain).toBe(start.skillGain);
    expect(row.masterworkChance).toBe(start.masterworkChance);
    expect(row.reagents.map((line) => line.held)).toEqual(start.reagents.map((line) => line.held));
  });

  it('never mutates the bag it was handed', () => {
    const inventory = bag(['copper_ore', 10], ['ironbark_log', 4]);
    const before = JSON.stringify(inventory);
    buildCraftingWindowView({ skills: skills(), recipes: [recipe()], inventory });
    expect(JSON.stringify(inventory)).toBe(before);
  });
});

describe('the classic mastery colouring', () => {
  it('reuses wave 1s four colours rather than a second copy', () => {
    expect(MASTERY_STATE_COLOR).toBe(WAVE_ONE_COLORS);
    expect(craftMasteryColor('full')).toBe('#ff8040');
    expect(craftMasteryColor('reduced')).toBe('#ffe14d');
    expect(craftMasteryColor('minimal')).toBe('#5fd45f');
    expect(craftMasteryColor('none')).toBe('#9d9d9d');
  });

  it('walks orange to grey as skill outgrows a rung-1 recipe', () => {
    // A rung-1 recipe sits at skillReq 0 (tier 0). 25 skill points is one tier.
    expect(craftMasteryState(0, 0)).toBe('full');
    expect(craftMasteryState(25, 0)).toBe('reduced');
    expect(craftMasteryState(50, 0)).toBe('minimal');
    expect(craftMasteryState(75, 0)).toBe('none');
  });

  it('keeps the top rung orange from its own tier to the 125 ceiling', () => {
    // Rung 4 (skillReq 75, tier 3) is the only rung that still teaches at full
    // rate all the way up: capability tier 5 minus recipe tier 3 is 2 rungs.
    expect(craftMasteryState(75, 75)).toBe('full');
    expect(craftMasteryState(100, 75)).toBe('reduced');
    expect(craftMasteryState(125, 75)).toBe('minimal');
  });

  it('paints each recipe row with its own state colour and a teaches flag', () => {
    const rung1 = recipe({ id: 'a', skillReq: 0 });
    const rung4 = recipe({ id: 'b', skillReq: 75 });
    const view = buildCraftingWindowView({
      skills: skills({ smithing: 75 }),
      recipes: [rung1, rung4],
      inventory: [],
    });
    const rows = findRow(view, 'smithing').recipes;
    expect(rows[0].mastery).toBe('none');
    expect(rows[0].masteryColor).toBe(craftMasteryColor('none'));
    expect(rows[0].teaches).toBe(false);
    expect(rows[1].mastery).toBe('full');
    expect(rows[1].masteryColor).toBe(craftMasteryColor('full'));
    expect(rows[1].teaches).toBe(true);
  });
});

describe('the window shell', () => {
  it('groups the shipped recipes under their own craft and counts what is ready', () => {
    const view = buildCraftingWindowView({
      skills: skills(),
      recipes: CRAFT_RECIPES,
      inventory: bag(['silverleaf_herb', 20], ['raw_river_perch', 20]),
    });
    expect(view.professions.map((row) => row.professionId)).toEqual([
      'smithing',
      'woodcraft',
      'alchemy',
      'enchanting',
    ]);
    // Enchanting has no recipe list at all: its bench is the enchant flow.
    expect(findRow(view, 'enchanting').recipes).toHaveLength(0);
    // The one alchemy draught those reagents cover.
    expect(findRow(view, 'alchemy').craftableCount).toBe(1);
    expect(view.totalCraftable).toBe(1);
  });

  it('carries the 125 ceiling and the progress numbers per craft', () => {
    const view = buildCraftingWindowView({
      skills: skills({ smithing: 25 }),
      recipes: [],
      inventory: [],
    });
    const row = findRow(view, 'smithing');
    expect(row.maxSkill).toBe(125);
    expect(row.fraction).toBeCloseTo(0.2, 10);
    expect(row.percent).toBe(20);
    expect(row.capped).toBe(false);
    expect(row.capabilityTier).toBe(1);
    expect(row.pointsToNextTier).toBe(25);
    expect(view.totalMaxSkill).toBe(500);
  });

  it('clamps a stale skill above the ceiling instead of overfilling the bar', () => {
    const view = buildCraftingWindowView({
      skills: [{ professionId: 'smithing', skill: 999, maxSkill: 125 }],
      recipes: [],
      inventory: [],
    });
    expect(view.professions[0].skill).toBe(125);
    expect(view.professions[0].percent).toBe(100);
    expect(view.professions[0].capped).toBe(true);
    expect(view.professions[0].pointsToNextTier).toBeNull();
  });

  it('falls back to the first craft when the requested tab is unknown', () => {
    const view = buildCraftingWindowView({
      skills: skills(),
      recipes: [],
      inventory: [],
      activeProfessionId: 'alchemy',
    });
    expect(view.active).toBe('alchemy');
    const stale = buildCraftingWindowView({
      skills: [{ professionId: 'alchemy', skill: 0, maxSkill: 125 }],
      recipes: [],
      inventory: [],
      activeProfessionId: 'smithing',
    });
    expect(stale.active).toBe('alchemy');
  });

  it('is a pure function of its inputs', () => {
    const input = {
      skills: skills({ smithing: 30 }),
      recipes: CRAFT_RECIPES,
      inventory: bag(['copper_ore', 10], ['ironbark_log', 4]),
    };
    expect(buildCraftingWindowView(input)).toEqual(buildCraftingWindowView(input));
  });
});

describe('stat lines', () => {
  it('orders the five primaries first and armor last, dropping empty axes', () => {
    expect(statBonusLines({ armor: 20, sta: 3, str: 2 })).toEqual([
      { stat: 'str', value: 2 },
      { stat: 'sta', value: 3 },
      { stat: 'armor', value: 20 },
    ]);
    expect(STAT_LINE_ORDER).toEqual(['str', 'agi', 'sta', 'int', 'spi', 'armor']);
  });

  it('drops zero and negative entries, which are residue rather than a bonus', () => {
    expect(statBonusLines({ str: 0, agi: -2, sta: 1 })).toEqual([{ stat: 'sta', value: 1 }]);
    expect(statBonusLines(undefined)).toEqual([]);
  });
});

describe('feedback views', () => {
  it('gives the masterwork its own tone and surfaces its baked stats', () => {
    const view = craftResultView(
      {
        itemId: 'cinderforged_hauberk',
        count: 1,
        masterwork: true,
        masterworkStats: { armor: 72, sta: 3, str: 2 },
        signedReagentUsed: true,
        skillGain: 1,
        nextSkill: 76,
      },
      'Aldric',
    );
    expect(view.tone).toBe('proc');
    expect(view.tone).not.toBe(craftResultView({ itemId: 'x', count: 1, skillGain: 0, nextSkill: 0 }).tone);
    expect(view.masterworkStats).toEqual([
      { stat: 'str', value: 2 },
      { stat: 'sta', value: 3 },
      { stat: 'armor', value: 72 },
    ]);
    expect(view.signer).toBe('Aldric');
    expect(view.signedReagentUsed).toBe(true);
    expect(CRAFT_TONE_COLOR[view.tone]).toBe('#ffd100');
  });

  it('does not claim a masterwork when the proc landed on a stats-free output', () => {
    const view = craftResultView({
      itemId: 'silverleaf_draught',
      count: 2,
      skillGain: 1,
      nextSkill: 2,
    });
    expect(view.masterwork).toBe(false);
    expect(view.masterworkStats).toEqual([]);
    expect(view.tone).toBe('good');
    expect(view.count).toBe(2);
  });

  it('turns a craft denial into the short lines only', () => {
    const start = beginCraft({
      recipe: recipe(),
      skill: 0,
      maxSkill: CRAFT_MAX_SKILL,
      inventory: bag(['ironbark_log', 4]),
      crafterName: 'Test',
      crafterId: 1,
      output: { kind: 'armor' },
    });
    const view = craftDenyView(start)!;
    expect(view.reason).toBe('insufficient_materials');
    expect(view.short.map((row) => row.itemId)).toEqual(['copper_ore']);
    expect(view.short[0].short).toBe(10);
    expect(view.tone).toBe('warn');
  });

  it('prints nothing for a craft that passed', () => {
    const start = beginCraft({
      recipe: recipe(),
      skill: 0,
      maxSkill: CRAFT_MAX_SKILL,
      inventory: bag(['copper_ore', 10], ['ironbark_log', 4]),
      crafterName: 'Test',
      crafterId: 1,
      output: { kind: 'armor' },
    });
    expect(craftDenyView(start)).toBeNull();
  });

  it('stays silent on a zero skill gain and announces the 125 cap once', () => {
    expect(
      craftSkillUpView({ professionId: 'smithing', skillGain: 0, nextSkill: 40 }).show,
    ).toBe(false);
    const up = craftSkillUpView({ professionId: 'smithing', skillGain: 1, nextSkill: 40 });
    expect(up.show).toBe(true);
    expect(up.reachedCap).toBe(false);
    const capped = craftSkillUpView({ professionId: 'smithing', skillGain: 1, nextSkill: 125 });
    expect(capped.reachedCap).toBe(true);
    expect(capped.tone).toBe('good');
    expect(capped.maxSkill).toBe(CRAFT_MAX_SKILL);
  });
});
