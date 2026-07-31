// Enchanting mechanics: applying to a worn slot in place, the destructive
// replace and its confirmation, the identical-enchant refusal, and disenchant
// yields.
//
// Every module under test is a pure leaf, so nothing here builds a Sim.

import { describe, expect, it } from 'vitest';
import {
  armorClassFor,
  baseDisenchantYield,
  beginEnchant,
  DISENCHANT_MATERIAL_BY_QUALITY,
  type DisenchantInput,
  disenchantSkillGain,
  type EnchantAttempt,
  enchantSkillGain,
  enchantedInstanceFor,
  enchantsForSlot,
  hasEnchantReagents,
  isDisenchantable,
  isEnchantedInstance,
  previewDisenchant,
  replacedEnchantInstanceFor,
  resolveDisenchant,
  resolveEnchant,
  typedSecondaryFor,
} from '../src/sim/professions';
import type { EnchantDef } from '../src/sim/professions';
import { Rng } from '../src/sim/rng';
import type { InvSlot, ItemInstance } from '../src/sim/types';

const MIGHT: EnchantDef = {
  id: 'e_might',
  name: 'Might',
  group: 'base',
  itemSlot: 'mainhand',
  reagents: [{ itemId: 'arcane_dust', count: 5 }],
  statBonus: { str: 2 },
};

const AGILITY: EnchantDef = {
  id: 'e_agility',
  name: 'Agility',
  group: 'base',
  itemSlot: 'mainhand',
  reagents: [{ itemId: 'arcane_dust', count: 5 }],
  statBonus: { agi: 3 },
};

const GREATER: EnchantDef = {
  id: 'e_greater_might',
  name: 'Greater Might',
  group: 'greater',
  itemSlot: 'mainhand',
  reagents: [
    { itemId: 'arcane_shard', count: 1 },
    { itemId: 'arcane_essence', count: 2 },
  ],
  statBonus: { str: 5 },
};

const CHEST_STA: EnchantDef = {
  id: 'e_chest_sta',
  name: 'Chest Stamina',
  group: 'base',
  itemSlot: 'chest',
  reagents: [{ itemId: 'arcane_dust', count: 3 }],
  statBonus: { sta: 3 },
};

const TABLE = { e_might: MIGHT, e_agility: AGILITY, e_greater_might: GREATER, e_chest_sta: CHEST_STA };
const lookup = (id: string): EnchantDef | undefined => (TABLE as Record<string, EnchantDef>)[id];

const dust = (count: number): InvSlot => ({ itemId: 'arcane_dust', count });

const wornAttempt = (over: Partial<EnchantAttempt> = {}): EnchantAttempt => ({
  enchant: MIGHT,
  target: { where: 'worn', slot: 'mainhand' },
  inventory: [dust(10)],
  worn: { itemId: 'vale_forged_blade' },
  targetItemSlot: 'mainhand',
  skill: 0,
  ...over,
});

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

describe('the already-enchanted marker', () => {
  it('reads the explicit marker and nothing else', () => {
    expect(isEnchantedInstance(undefined)).toBe(false);
    expect(isEnchantedInstance({})).toBe(false);
    expect(isEnchantedInstance({ signer: 'Ambrose' })).toBe(false);
    // A masterwork copy carries rolled.stats but is NOT enchanted, so it stays
    // enchantable exactly like a plain copy.
    expect(isEnchantedInstance({ rolled: { masterwork: true, stats: { str: 2 } } })).toBe(false);
    expect(isEnchantedInstance({ enchant: 'e_might' })).toBe(true);
  });
});

describe('applying to a worn slot', () => {
  it('enchants the copy worn in the named slot without unequipping it', () => {
    const a = wornAttempt();
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(true);
    expect(out.applied).toBe('worn');
    expect(out.itemId).toBe('vale_forged_blade');
    expect(out.instance).toEqual({ enchant: 'e_might', rolled: { stats: { str: 2 } } });
    // The reagents left the bag; nothing entered it (the piece is worn).
    expect(a.inventory).toEqual([dust(5)]);
  });

  it('draws no random numbers on any path', () => {
    // resolveEnchant takes no Rng at all, which is the strongest form of the
    // zero-draw contract. This asserts the sibling disenchant helpers agree.
    const { rng, draws } = countingRng(4);
    resolveDisenchant(
      { item: nonDisenchantable(), index: 0, inventory: [], skill: 0 },
      rng,
    );
    expect(draws()).toBe(0);
  });

  it('denies an empty slot with not_held and consumes nothing', () => {
    const a = wornAttempt({ worn: {} });
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('not_held');
    expect(a.inventory).toEqual([dust(10)]);
  });

  it('denies an enchant aimed at another slot', () => {
    const a = wornAttempt({ enchant: CHEST_STA });
    expect(resolveEnchant(a, lookup).reason).toBe('wrong_slot');
    expect(a.inventory).toEqual([dust(10)]);
  });

  it('denies short reagents and consumes nothing', () => {
    const a = wornAttempt({ inventory: [dust(2)] });
    const out = resolveEnchant(a, lookup);
    expect(out.reason).toBe('insufficient_materials');
    expect(a.inventory).toEqual([dust(2)]);
  });

  it('preserves the maker bond and a masterwork bake underneath the enchant', () => {
    const worn: ItemInstance = {
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'recipe_vale_forged_blade',
      rolled: { masterwork: true, stats: { str: 1, sta: 1 } },
    };
    const out = resolveEnchant(wornAttempt({ worn: { itemId: 'vale_forged_blade', instance: worn } }), lookup);
    expect(out.ok).toBe(true);
    expect(out.instance).toEqual({
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'recipe_vale_forged_blade',
      enchant: 'e_might',
      // The enchant's +2 str sums ADDITIVELY on top of the masterwork bake.
      rolled: { masterwork: true, stats: { str: 3, sta: 1 } },
    });
    // And the source payload was not mutated.
    expect(worn.rolled).toEqual({ masterwork: true, stats: { str: 1, sta: 1 } });
  });
});

describe('replacing an existing enchant', () => {
  const enchantedWorn = (id = 'e_might', stats: Record<string, number> = { str: 2 }) => ({
    itemId: 'vale_forged_blade',
    instance: { enchant: id, rolled: { stats } } as ItemInstance,
  });

  it('refuses without confirmation, and names the enchant it would destroy plus the cost', () => {
    const a = wornAttempt({ enchant: AGILITY, worn: enchantedWorn() });
    const start = beginEnchant(a);
    expect(start.ok).toBe(false);
    expect(start.reason).toBe('already_enchanted');
    expect(start.replacing).toBe(true);
    expect(start.replacedEnchantId).toBe('e_might');
    // The confirmation has to state the price, so the rows are populated even
    // on the deny.
    expect(start.reagents).toEqual([
      { itemId: 'arcane_dust', required: 5, held: 10, met: true },
    ]);
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(false);
    expect(a.inventory).toEqual([dust(10)]);
  });

  it('refuses a truthy non-boolean as consent', () => {
    const a = wornAttempt({
      enchant: AGILITY,
      worn: enchantedWorn(),
      confirmReplace: 1 as unknown as boolean,
    });
    expect(resolveEnchant(a, lookup).reason).toBe('already_enchanted');
  });

  it('refuses re-applying the identical enchant even WITH consent', () => {
    const a = wornAttempt({ enchant: MIGHT, worn: enchantedWorn(), confirmReplace: true });
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('same_enchant');
    // Nothing was burned for zero state change.
    expect(a.inventory).toEqual([dust(10)]);
  });

  it('reads already_enchanted, not same_enchant, when the same id is UNconfirmed', () => {
    const a = wornAttempt({ enchant: MIGHT, worn: enchantedWorn() });
    expect(beginEnchant(a).reason).toBe('already_enchanted');
  });

  it('destroys the old enchant and applies the new one with no refund', () => {
    const a = wornAttempt({ enchant: AGILITY, worn: enchantedWorn(), confirmReplace: true });
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(true);
    expect(out.replaced).toBe(true);
    expect(out.replacedEnchantId).toBe('e_might');
    // The old +2 str is gone entirely, not layered under the new bonus.
    expect(out.instance).toEqual({ enchant: 'e_agility', rolled: { stats: { agi: 3 } } });
    // The new reagents were paid; the old ones are NOT returned.
    expect(a.inventory).toEqual([dust(5)]);
  });

  it('keeps the signature and the masterwork bake through a replace', () => {
    const victim: ItemInstance = {
      signer: 'Ambrose',
      signerId: 7,
      boundTo: 42,
      rolled: { masterwork: true, stats: { str: 1 + 2, sta: 1 } },
      enchant: 'e_might',
    };
    const out = resolveEnchant(
      wornAttempt({
        enchant: AGILITY,
        worn: { itemId: 'vale_forged_blade', instance: victim },
        confirmReplace: true,
      }),
      lookup,
    );
    expect(out.instance).toEqual({
      signer: 'Ambrose',
      signerId: 7,
      boundTo: 42,
      enchant: 'e_agility',
      // str 3 minus the old enchant's 2 leaves the masterwork's own 1.
      rolled: { masterwork: true, stats: { str: 1, sta: 1, agi: 3 } },
    });
  });

  it('prunes a stat the old enchant drove to zero rather than leaving residue', () => {
    const victim: ItemInstance = { enchant: 'e_might', rolled: { stats: { str: 2 } } };
    expect(replacedEnchantInstanceFor(victim, MIGHT, AGILITY)).toEqual({
      enchant: 'e_agility',
      rolled: { stats: { agi: 3 } },
    });
  });

  it('refuses a marker id that no longer resolves, rather than stacking bonuses', () => {
    const a = wornAttempt({
      enchant: AGILITY,
      worn: { itemId: 'vale_forged_blade', instance: { enchant: 'e_deleted' } },
      confirmReplace: true,
    });
    const out = resolveEnchant(a, lookup);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('already_enchanted');
    expect(a.inventory).toEqual([dust(10)]);
  });
});

describe('applying to a bagged copy', () => {
  it('enchants exactly the targeted bag slot', () => {
    const inventory: InvSlot[] = [
      { itemId: 'vale_forged_blade', count: 1 },
      { itemId: 'vale_forged_blade', count: 1, instance: { signer: 'Vela' } },
      dust(10),
    ];
    const out = resolveEnchant(
      {
        enchant: MIGHT,
        target: { where: 'bag', index: 1 },
        inventory,
        targetItemSlot: 'mainhand',
        skill: 0,
      },
      lookup,
    );
    expect(out.ok).toBe(true);
    expect(out.applied).toBe('bag');
    // The plain copy is untouched; the signed one came back enchanted.
    expect(inventory).toContainEqual({ itemId: 'vale_forged_blade', count: 1 });
    expect(inventory).toContainEqual({
      itemId: 'vale_forged_blade',
      count: 1,
      instance: { signer: 'Vela', enchant: 'e_might', rolled: { stats: { str: 2 } } },
    });
    expect(inventory).toContainEqual(dust(5));
  });

  it('denies an out-of-range index', () => {
    const inventory: InvSlot[] = [dust(10)];
    const out = resolveEnchant(
      {
        enchant: MIGHT,
        target: { where: 'bag', index: 9 },
        inventory,
        targetItemSlot: 'mainhand',
        skill: 0,
      },
      lookup,
    );
    expect(out.reason).toBe('not_held');
    expect(inventory).toEqual([dust(10)]);
  });

  it('splits a plain stack rather than converting the whole thing', () => {
    const inventory: InvSlot[] = [{ itemId: 'vale_forged_blade', count: 3 }, dust(10)];
    resolveEnchant(
      {
        enchant: MIGHT,
        target: { where: 'bag', index: 0 },
        inventory,
        targetItemSlot: 'mainhand',
        skill: 0,
      },
      lookup,
    );
    expect(inventory).toContainEqual({ itemId: 'vale_forged_blade', count: 2 });
    expect(inventory).toContainEqual({
      itemId: 'vale_forged_blade',
      count: 1,
      instance: { enchant: 'e_might', rolled: { stats: { str: 2 } } },
    });
  });
});

describe('enchant skill', () => {
  it('rides the shared curve at the group rungs and stops at 125', () => {
    expect(enchantSkillGain(0, MIGHT)).toBe(1); // base, tier 0
    expect(enchantSkillGain(75, MIGHT)).toBe(0); // gray three tiers up
    expect(enchantSkillGain(75, GREATER)).toBe(1); // greater is tier 3
    expect(enchantSkillGain(125, GREATER)).toBe(0); // capped
  });

  it('scores a disenchant by the destroyed piece quality', () => {
    expect(disenchantSkillGain(0, 'common')).toBe(1);
    expect(disenchantSkillGain(75, 'common')).toBe(0);
    expect(disenchantSkillGain(75, 'epic')).toBe(1);
    expect(disenchantSkillGain(125, 'epic')).toBe(0);
  });
});

describe('the enchant picker', () => {
  it('lists a slot grouped base, runed, greater then by id', () => {
    expect(enchantsForSlot('mainhand', TABLE).map((e) => e.id)).toEqual([
      'e_agility',
      'e_might',
      'e_greater_might',
    ]);
    expect(enchantsForSlot('chest', TABLE).map((e) => e.id)).toEqual(['e_chest_sta']);
  });

  it('reports whether the reagents are held', () => {
    expect(hasEnchantReagents([dust(5)], MIGHT)).toBe(true);
    expect(hasEnchantReagents([dust(4)], MIGHT)).toBe(false);
  });

  it('states the bonus inline rather than as a bare badge', () => {
    expect(beginEnchant(wornAttempt()).statBonus).toEqual({ str: 2 });
  });
});

// ---------------------------------------------------------------------------

function nonDisenchantable(): DisenchantInput {
  return { itemId: 'copper_ore', kind: 'junk', quality: 'common', itemLevel: 1 };
}

const piece = (over: Partial<DisenchantInput> = {}): DisenchantInput => ({
  itemId: 'thorium_battleplate',
  kind: 'armor',
  quality: 'uncommon',
  stats: { armor: 165, sta: 6, str: 3 },
  itemLevel: 15,
  ...over,
});

describe('disenchant', () => {
  it('accepts weapons and armor of at least common quality', () => {
    expect(isDisenchantable(piece())).toBe(true);
    expect(isDisenchantable(piece({ quality: 'poor' }))).toBe(false);
    expect(isDisenchantable(piece({ quality: undefined }))).toBe(false);
    expect(isDisenchantable(nonDisenchantable())).toBe(false);
  });

  it('picks the ladder material off the destroyed piece quality', () => {
    expect(DISENCHANT_MATERIAL_BY_QUALITY.common).toBe('arcane_dust');
    expect(DISENCHANT_MATERIAL_BY_QUALITY.uncommon).toBe('arcane_dust');
    expect(DISENCHANT_MATERIAL_BY_QUALITY.rare).toBe('arcane_essence');
    expect(DISENCHANT_MATERIAL_BY_QUALITY.epic).toBe('arcane_shard');
    expect(DISENCHANT_MATERIAL_BY_QUALITY.legendary).toBe('arcane_shard');
  });

  it('scales the sub-rare yield with quality and level, and pins rare and up at one', () => {
    expect(baseDisenchantYield('common', 1)).toBe(2); // idx 1 + 0 + 1
    expect(baseDisenchantYield('uncommon', 20)).toBe(5); // idx 2 + 2 + 1
    expect(baseDisenchantYield('rare', 20)).toBe(1);
    expect(baseDisenchantYield('epic', 20)).toBe(1);
  });

  it('infers the armor class from the stat signature when armorType is absent', () => {
    expect(armorClassFor(piece())).toBe('mail');
    expect(armorClassFor(piece({ stats: { armor: 60, int: 7, spi: 4 } }))).toBe('cloth');
    expect(armorClassFor(piece({ stats: { armor: 105, agi: 7, sta: 2 } }))).toBe('leather');
    // An explicit field always wins over the inference.
    expect(armorClassFor(piece({ armorType: 'cloth' }))).toBe('cloth');
  });

  it('yields a typed secondary only from rare and up, keyed by material', () => {
    expect(typedSecondaryFor(piece())).toBeNull(); // uncommon
    expect(typedSecondaryFor(piece({ quality: 'rare' }))).toBe('resonant_links');
    expect(
      typedSecondaryFor(piece({ quality: 'rare', stats: { armor: 60, int: 7, spi: 4 } })),
    ).toBe('resonant_thread');
    expect(
      typedSecondaryFor(piece({ quality: 'epic', stats: { armor: 105, agi: 7 } })),
    ).toBe('resonant_hide');
    // Weapons split caster from melee on the int axis.
    expect(
      typedSecondaryFor(piece({ kind: 'weapon', quality: 'rare', stats: { str: 8, sta: 3 } })),
    ).toBe('resonant_steel');
    expect(
      typedSecondaryFor(piece({ kind: 'weapon', quality: 'rare', stats: { int: 9, spi: 5 } })),
    ).toBe('resonant_timber');
  });

  it('previews the exact yield the confirmation shows, draw-free', () => {
    expect(previewDisenchant(piece())).toEqual({
      materialItemId: 'arcane_dust',
      minCount: 4,
      maxCount: 5,
    });
    expect(previewDisenchant(piece({ quality: 'rare' }))).toEqual({
      materialItemId: 'arcane_essence',
      minCount: 1,
      maxCount: 2,
      secondaryItemId: 'resonant_links',
      secondaryCount: 1,
    });
    expect(previewDisenchant(piece({ quality: 'epic' }))).toEqual({
      materialItemId: 'arcane_shard',
      minCount: 1,
      maxCount: 2,
      secondaryItemId: 'resonant_links',
      secondaryCount: 2,
    });
    expect(previewDisenchant(nonDisenchantable())).toBeNull();
  });

  it('destroys the piece and grants the previewed yield, drawing exactly once', () => {
    const inventory: InvSlot[] = [{ itemId: 'thorium_battleplate', count: 1 }];
    const { rng, draws } = countingRng(77);
    const out = resolveDisenchant({ item: piece(), index: 0, inventory, skill: 0 }, rng);
    expect(out.ok).toBe(true);
    expect(draws()).toBe(1);
    expect(out.materialItemId).toBe('arcane_dust');
    expect(out.count).toBeGreaterThanOrEqual(4);
    expect(out.count).toBeLessThanOrEqual(5);
    expect(inventory.some((s) => s.itemId === 'thorium_battleplate')).toBe(false);
    expect(inventory).toContainEqual({ itemId: 'arcane_dust', count: out.count });
    expect(out.skillGain).toBe(1);
    expect(out.nextSkill).toBe(1);
  });

  it('grants the typed secondary alongside the ladder material on a rare', () => {
    const inventory: InvSlot[] = [{ itemId: 'cinderforged_hauberk', count: 1 }];
    const out = resolveDisenchant(
      {
        item: piece({ itemId: 'cinderforged_hauberk', quality: 'rare', itemLevel: 20 }),
        index: 0,
        inventory,
        skill: 0,
      },
      new Rng(3),
    );
    expect(out.ok).toBe(true);
    expect(out.secondaryItemId).toBe('resonant_links');
    expect(out.secondaryCount).toBe(1);
    expect(inventory).toContainEqual({ itemId: 'resonant_links', count: 1 });
  });

  it('destroys the enchanted copy enchant and all, since the piece is gone anyway', () => {
    const inventory: InvSlot[] = [
      { itemId: 'thorium_battleplate', count: 1, instance: { enchant: 'e_chest_sta' } },
    ];
    const out = resolveDisenchant({ item: piece(), index: 0, inventory, skill: 0 }, new Rng(3));
    expect(out.ok).toBe(true);
    expect(inventory.some((s) => s.itemId === 'thorium_battleplate')).toBe(false);
  });

  it('denies without drawing when the slot does not hold the named piece', () => {
    const inventory: InvSlot[] = [{ itemId: 'copper_ore', count: 4 }];
    const { rng, draws } = countingRng(9);
    const out = resolveDisenchant({ item: piece(), index: 0, inventory, skill: 0 }, rng);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('not_held');
    expect(draws()).toBe(0);
    expect(inventory).toEqual([{ itemId: 'copper_ore', count: 4 }]);
  });

  it('is replayable from a fixed seed', () => {
    const run = () => {
      const inventory: InvSlot[] = [{ itemId: 'thorium_battleplate', count: 1 }];
      const out = resolveDisenchant(
        { item: piece(), index: 0, inventory, skill: 0 },
        new Rng(2024),
      );
      return { out, inventory };
    };
    expect(run()).toEqual(run());
  });
});

describe('the payload transforms in isolation', () => {
  it('starts from an empty payload for a plain copy', () => {
    expect(enchantedInstanceFor(undefined, MIGHT)).toEqual({
      enchant: 'e_might',
      rolled: { stats: { str: 2 } },
    });
  });
});
