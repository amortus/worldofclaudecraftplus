// Crafting mechanics: the shared four-state mastery curve at a 125 cap,
// reagent consumption through the sanctioned remove path, and the single
// masterwork proc draw.
//
// Every module under test is a pure leaf, so nothing here builds a Sim.

import { describe, expect, it } from 'vitest';
import {
  beginCraft,
  CRAFT_BASE_GAIN,
  CRAFT_GAIN_TIER_STEP,
  CRAFT_MAX_SKILL,
  type CraftAttempt,
  craftCapabilityTier,
  craftGainMultiplier,
  craftSkillGain,
  craftingSkillsView,
  emptyCraftingProficiency,
  hasRecipeReagents,
  holdsAnySignedReagent,
  isSignableCraftOutput,
  MASTERWORK_BASE_CHANCE,
  MASTERWORK_CHANCE_CAP,
  MASTERWORK_MATERIAL_TIER_CHANCE,
  MASTERWORK_PER_TIER_ABOVE_CHANCE,
  MASTERWORK_SIGNED_CHANCE,
  masterworkBonusStats,
  masterworkProcChance,
  normalizeCraftingProficiency,
  reagentStatus,
  recipeTierFor,
  resolveCraft,
} from '../src/sim/professions';
import type { CraftRecipeDef } from '../src/sim/professions';
import { Rng } from '../src/sim/rng';
import type { InvSlot } from '../src/sim/types';

const CAPS = { smithing: 125, woodcraft: 125, alchemy: 125, enchanting: 125 } as const;

const recipe = (over: Partial<CraftRecipeDef> = {}): CraftRecipeDef => ({
  id: 'recipe_test_blade',
  professionId: 'smithing',
  resultItemId: 'test_blade',
  resultCount: 1,
  reagents: [{ itemId: 'copper_ore', count: 4 }],
  skillReq: 0,
  level: 5,
  materialTier: 0,
  ...over,
});

const attempt = (over: Partial<CraftAttempt> = {}): CraftAttempt => ({
  recipe: recipe(),
  skill: 0,
  maxSkill: CRAFT_MAX_SKILL,
  inventory: [{ itemId: 'copper_ore', count: 10 }],
  crafterName: 'Ambrose',
  crafterId: 7,
  output: { kind: 'weapon', quality: 'uncommon', stats: { str: 4, sta: 2 } },
  ...over,
});

/** A generator that counts how many numbers were actually drawn. */
function countingRng(seed: number) {
  const rng = new Rng(seed);
  let draws = 0;
  const wrapped = {
    next(): number {
      draws += 1;
      return rng.next();
    },
  } as unknown as Rng;
  return { rng: wrapped, draws: () => draws };
}

// ---------------------------------------------------------------------------

describe('craft mastery curve', () => {
  it('buckets skill and skillReq onto the same 25-point ladder', () => {
    expect(CRAFT_GAIN_TIER_STEP).toBe(25);
    expect(craftCapabilityTier(0)).toBe(0);
    expect(craftCapabilityTier(24)).toBe(0);
    expect(craftCapabilityTier(25)).toBe(1);
    expect(craftCapabilityTier(124)).toBe(4);
    expect(craftCapabilityTier(125)).toBe(5);
    expect(recipeTierFor(0)).toBe(0);
    expect(recipeTierFor(25)).toBe(1);
    expect(recipeTierFor(50)).toBe(2);
    expect(recipeTierFor(75)).toBe(3);
  });

  it('hits all four states: full, reduced, minimal, then zero forever', () => {
    // A rung-1 recipe (skillReq 0, tier 0) against a rising crafter.
    expect(craftGainMultiplier(0, 0)).toBe(1); // capability 0, at tier
    expect(craftGainMultiplier(24, 0)).toBe(1);
    expect(craftGainMultiplier(25, 0)).toBe(0.5); // one tier above
    expect(craftGainMultiplier(50, 0)).toBe(0.25); // two tiers above
    expect(craftGainMultiplier(75, 0)).toBe(0); // three: gray forever
    expect(craftGainMultiplier(124, 0)).toBe(0);
  });

  it('grants the full base amount at or above the recipe tier', () => {
    expect(craftSkillGain(0, 0, CRAFT_MAX_SKILL)).toBe(CRAFT_BASE_GAIN);
    // Crafting ABOVE your capability is still full, never a bonus.
    expect(craftSkillGain(0, 75, CRAFT_MAX_SKILL)).toBe(CRAFT_BASE_GAIN);
  });

  it('grants the fractional amounts in the reduced and minimal states', () => {
    expect(craftSkillGain(25, 0, CRAFT_MAX_SKILL)).toBe(0.5);
    expect(craftSkillGain(50, 0, CRAFT_MAX_SKILL)).toBe(0.25);
    expect(craftSkillGain(75, 0, CRAFT_MAX_SKILL)).toBe(0);
  });

  it('enforces the 125 cap: the last point is partial and then gain stops', () => {
    expect(CRAFT_MAX_SKILL).toBe(125);
    // A full-rate craft one point short of the cap grants that one point only.
    expect(craftSkillGain(124, 125, CRAFT_MAX_SKILL)).toBe(1);
    // Skill 124 against the top rung (tier 3) is one tier above, so 0.5.
    expect(craftSkillGain(124, 75, CRAFT_MAX_SKILL)).toBe(0.5);
    // A gain that would overshoot is truncated to exactly the remainder.
    expect(craftSkillGain(124.75, 75, CRAFT_MAX_SKILL)).toBe(0.25);
    expect(craftSkillGain(125, 75, CRAFT_MAX_SKILL)).toBe(0);
    // At the cap even the hardest rung teaches nothing.
    expect(craftSkillGain(125, 100, CRAFT_MAX_SKILL)).toBe(0);
  });

  it('walks the intended rung-4 climb from 75 to the cap without overshoot', () => {
    let skill = 75;
    const rung4 = 75;
    for (let i = 0; i < 500 && skill < CRAFT_MAX_SKILL; i++) {
      skill += craftSkillGain(skill, rung4, CRAFT_MAX_SKILL);
    }
    expect(skill).toBe(CRAFT_MAX_SKILL);
  });
});

describe('proficiency record helpers', () => {
  it('starts every craft at zero', () => {
    expect(emptyCraftingProficiency()).toEqual({
      smithing: 0,
      woodcraft: 0,
      alchemy: 0,
      enchanting: 0,
    });
  });

  it('normalizes a hostile or pre-feature save row', () => {
    const out = normalizeCraftingProficiency(
      { smithing: 900, woodcraft: -5, alchemy: Number.NaN, bogus: 40 } as never,
      CAPS,
    );
    expect(out).toEqual({ smithing: 125, woodcraft: 0, alchemy: 0, enchanting: 0 });
    expect('bogus' in out).toBe(false);
  });

  it('renders the read-only skills view', () => {
    const view = craftingSkillsView({ ...emptyCraftingProficiency(), smithing: 40 }, CAPS);
    expect(view).toContainEqual({ professionId: 'smithing', skill: 40, maxSkill: 125 });
    expect(view).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------

describe('reagents', () => {
  it('reports each line resolved against the bag', () => {
    const rows = reagentStatus(
      [{ itemId: 'copper_ore', count: 3 }],
      recipe({ reagents: [{ itemId: 'copper_ore', count: 4 }, { itemId: 'ironbark_log', count: 2 }] }),
    );
    expect(rows).toEqual([
      { itemId: 'copper_ore', required: 4, held: 3, met: false },
      { itemId: 'ironbark_log', required: 2, held: 0, met: false },
    ]);
  });

  it('counts instanced copies toward the requirement', () => {
    const bag: InvSlot[] = [
      { itemId: 'copper_ore', count: 2 },
      { itemId: 'copper_ore', count: 2, instance: { signer: 'Vela', signerId: 3 } },
    ];
    expect(hasRecipeReagents(bag, recipe())).toBe(true);
    expect(holdsAnySignedReagent(bag, recipe().reagents)).toBe(true);
  });

  it('denies with insufficient_materials and consumes nothing', () => {
    const a = attempt({ inventory: [{ itemId: 'copper_ore', count: 3 }] });
    const start = beginCraft(a);
    expect(start.ok).toBe(false);
    expect(start.reason).toBe('insufficient_materials');

    const { rng, draws } = countingRng(1);
    const out = resolveCraft(a, rng);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('insufficient_materials');
    expect(a.inventory).toEqual([{ itemId: 'copper_ore', count: 3 }]);
    // A denial must never move the world's rng stream.
    expect(draws()).toBe(0);
  });

  it('consumes the plain copies and leaves the signed one alone', () => {
    const signedOre = { signer: 'Vela', signerId: 3 };
    const bag: InvSlot[] = [
      { itemId: 'copper_ore', count: 1, instance: signedOre },
      { itemId: 'copper_ore', count: 6 },
    ];
    const a = attempt({ inventory: bag });
    const out = resolveCraft(a, new Rng(11));
    expect(out.ok).toBe(true);
    expect(out.consumed).toEqual([{ itemId: 'copper_ore', count: 4 }]);
    // The signed unit is still there, untouched, and only plain ore was spent.
    const signedSlot = bag.find((s) => s.instance?.signer === 'Vela');
    expect(signedSlot).toEqual({ itemId: 'copper_ore', count: 1, instance: signedOre });
    const plain = bag
      .filter((s) => s.itemId === 'copper_ore' && !s.instance)
      .reduce((n, s) => n + s.count, 0);
    expect(plain).toBe(2);
    expect(out.signedReagentUsed).toBe(true);
  });

  it('falls back to the signed copy only once the plain ones are gone', () => {
    const bag: InvSlot[] = [
      { itemId: 'copper_ore', count: 3, instance: { signer: 'Vela', signerId: 3 } },
      { itemId: 'copper_ore', count: 2 },
    ];
    const out = resolveCraft(attempt({ inventory: bag }), new Rng(11));
    expect(out.ok).toBe(true);
    // 2 plain + 2 of the 3 signed.
    expect(bag.filter((s) => s.itemId === 'copper_ore')).toEqual([
      { itemId: 'copper_ore', count: 1, instance: { signer: 'Vela', signerId: 3 } },
    ]);
  });
});

// ---------------------------------------------------------------------------

describe('the masterwork proc', () => {
  it('sums the tuning terms and caps', () => {
    expect(masterworkProcChance({ tiersAboveRecipe: 0, signedReagent: false })).toBeCloseTo(
      MASTERWORK_BASE_CHANCE,
      10,
    );
    expect(masterworkProcChance({ tiersAboveRecipe: 2, signedReagent: false })).toBeCloseTo(
      MASTERWORK_BASE_CHANCE + 2 * MASTERWORK_PER_TIER_ABOVE_CHANCE,
      10,
    );
    expect(
      masterworkProcChance({ tiersAboveRecipe: 2, signedReagent: true, materialTier: 3 }),
    ).toBeCloseTo(
      MASTERWORK_BASE_CHANCE +
        2 * MASTERWORK_PER_TIER_ABOVE_CHANCE +
        MASTERWORK_SIGNED_CHANCE +
        3 * MASTERWORK_MATERIAL_TIER_CHANCE,
      10,
    );
    expect(
      masterworkProcChance({ tiersAboveRecipe: 99, signedReagent: true, materialTier: 99 }),
    ).toBe(MASTERWORK_CHANCE_CAP);
  });

  it('never subtracts for crafting above your own tier', () => {
    expect(masterworkProcChance({ tiersAboveRecipe: -4, signedReagent: false })).toBeCloseTo(
      MASTERWORK_BASE_CHANCE,
      10,
    );
  });

  it('bakes a third of the primary profile, largest remainder, armor apart', () => {
    // 9 primary points -> budget 3, split 8:1 by weight -> str 3, sta 0 dropped.
    expect(masterworkBonusStats({ stats: { str: 8, sta: 1, armor: 90 } })).toEqual({
      armor: 30,
      str: 3,
    });
    // 6 points -> budget 2, exact 1:1.
    expect(masterworkBonusStats({ stats: { int: 3, spi: 3 } })).toEqual({ int: 1, spi: 1 });
  });

  it('returns null when there is nothing to amplify', () => {
    expect(masterworkBonusStats({ stats: undefined })).toBeNull();
    expect(masterworkBonusStats({ stats: {} })).toBeNull();
    // A one-point profile rounds its third away to nothing.
    expect(masterworkBonusStats({ stats: { str: 1 } })).toBeNull();
  });

  it('is deterministic: the same def always bakes the same record', () => {
    const stats = { str: 7, sta: 4, agi: 2 };
    expect(masterworkBonusStats({ stats })).toEqual(masterworkBonusStats({ stats }));
  });
});

describe('resolveCraft', () => {
  it('draws exactly one number per successful craft', () => {
    const { rng, draws } = countingRng(5);
    const out = resolveCraft(attempt(), rng);
    expect(out.ok).toBe(true);
    expect(draws()).toBe(1);
  });

  it('draws exactly one even when the output can never masterwork', () => {
    const { rng, draws } = countingRng(5);
    const out = resolveCraft(
      attempt({
        recipe: recipe({ resultItemId: 'test_potion', resultCount: 2 }),
        output: { kind: 'potion', quality: 'common' },
      }),
      rng,
    );
    expect(out.ok).toBe(true);
    expect(out.masterwork).toBeUndefined();
    expect(draws()).toBe(1);
  });

  it('is replayable from a fixed seed', () => {
    const run = () => {
      const a = attempt({ inventory: [{ itemId: 'copper_ore', count: 10 }] });
      const out = resolveCraft(a, new Rng(1234));
      return { out, bag: a.inventory };
    };
    expect(run()).toEqual(run());
  });

  it('procs a masterwork on a seed that rolls under the chance, and only then', () => {
    // Find the exact draw the shipped tuning compares against, then bracket it
    // with two synthetic generators rather than fishing for a magic seed.
    const chance = masterworkProcChance({ tiersAboveRecipe: 0, signedReagent: false });
    const fixed = (v: number) => ({ next: () => v }) as unknown as Rng;

    const under = attempt();
    const hit = resolveCraft(under, fixed(chance - 1e-9));
    expect(hit.masterwork).toBe(true);
    // str 4 + sta 2 = 6 points -> budget 2 -> str 1, sta 1 by largest remainder.
    expect(hit.masterworkStats).toEqual({ str: 1, sta: 1 });
    const minted = under.inventory.find((s) => s.itemId === 'test_blade');
    expect(minted?.instance?.rolled).toEqual({ masterwork: true, stats: { str: 1, sta: 1 } });

    const over = attempt();
    const miss = resolveCraft(over, fixed(chance + 1e-9));
    expect(miss.masterwork).toBeUndefined();
    expect(over.inventory.find((s) => s.itemId === 'test_blade')?.instance?.rolled).toBeUndefined();
  });

  it('signs equipment with the maker bond and leaves consumables fungible', () => {
    expect(isSignableCraftOutput('weapon')).toBe(true);
    expect(isSignableCraftOutput('armor')).toBe(true);
    expect(isSignableCraftOutput('potion')).toBe(false);

    const gear = attempt();
    resolveCraft(gear, new Rng(3));
    expect(gear.inventory.find((s) => s.itemId === 'test_blade')?.instance).toMatchObject({
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'recipe_test_blade',
    });

    const potions = attempt({
      recipe: recipe({ resultItemId: 'test_potion', resultCount: 3 }),
      output: { kind: 'potion', quality: 'common' },
    });
    resolveCraft(potions, new Rng(3));
    expect(potions.inventory.find((s) => s.itemId === 'test_potion')).toEqual({
      itemId: 'test_potion',
      count: 3,
    });
  });

  it('binds a commissioned craft to the player it was made for', () => {
    const a = attempt({ commissionFor: 42 });
    resolveCraft(a, new Rng(3));
    const minted = a.inventory.find((s) => s.itemId === 'test_blade');
    expect(minted?.instance).toMatchObject({ signer: 'Ambrose', boundTo: 42 });
  });

  it('upgrades exactly one copy of a multi-copy craft', () => {
    const chance = masterworkProcChance({ tiersAboveRecipe: 0, signedReagent: false });
    const fixed = (v: number) => ({ next: () => v }) as unknown as Rng;
    const a = attempt({
      recipe: recipe({ resultItemId: 'test_blade', resultCount: 3 }),
    });
    const out = resolveCraft(a, fixed(chance - 1e-9));
    expect(out.masterwork).toBe(true);
    const copies = a.inventory.filter((s) => s.itemId === 'test_blade');
    // Instanced copies never stack, so three copies are three slots.
    expect(copies).toHaveLength(3);
    expect(copies.filter((s) => s.instance?.rolled?.masterwork)).toHaveLength(1);
  });

  it('reports the skill gained and the resulting skill', () => {
    const a = attempt({ skill: 25, recipe: recipe({ skillReq: 0 }) });
    const out = resolveCraft(a, new Rng(9));
    expect(out.skillGain).toBe(0.5);
    expect(out.nextSkill).toBe(25.5);
  });

  it('reports the proc odds without drawing, so the window can show them', () => {
    // The real ceiling our content can reach: a capped smith (tier 5) working
    // the top rung (tier 3) with signed Ashen Wastes materials.
    const start = beginCraft(
      attempt({
        skill: 125,
        recipe: recipe({ skillReq: 75, materialTier: 3 }),
        inventory: [{ itemId: 'copper_ore', count: 4, instance: { signer: 'Vela' } }],
      }),
    );
    expect(start.ok).toBe(true);
    expect(start.capabilityTier).toBe(5);
    expect(start.recipeTier).toBe(3);
    expect(start.masterworkChance).toBeCloseTo(0.1, 10);
    // The cap is still the hard ceiling for any input.
    expect(start.masterworkChance).toBeLessThanOrEqual(MASTERWORK_CHANCE_CAP);
  });
});
