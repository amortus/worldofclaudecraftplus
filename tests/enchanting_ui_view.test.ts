// Unit tests for the pure enchanting view model
// (src/ui/enchanting_ui_view.ts): the grouped Apply Enchant picker, the
// destructive replace confirmation, the disenchant preview, and the per-line
// tooltip attribution.
//
// No DOM: the module under test is DOM-free and i18n-free by contract.

import { describe, expect, it } from 'vitest';
import {
  buildEnchantPickerView,
  disenchantPreviewFor,
  disenchantPreviewView,
  DISENCHANT_WARNINGS,
  ENCHANT_GROUPS,
  ENCHANT_REPLACE_WARNINGS,
  enchantReplaceConfirmView,
  enchantsForSlot,
  instanceStatAttribution,
} from '../src/ui/enchanting_ui_view';
import { beginEnchant, previewDisenchant } from '../src/sim/professions';
import { ENCHANTS, enchantById } from '../src/sim/content/professions';
import type { EnchantDef } from '../src/sim/professions';
import type { InvSlot, ItemInstance } from '../src/sim/types';

function bag(...rows: ([string, number] | [string, number, ItemInstance])[]): InvSlot[] {
  return rows.map(([itemId, count, instance]) =>
    instance ? { itemId, count, instance } : { itemId, count },
  ) as InvSlot[];
}

const MAINHAND = enchantsForSlot('mainhand', ENCHANTS);

/** A bag holding a mainhand weapon at index 0, plus the reagents listed after. */
function weaponBag(instance?: ItemInstance, ...reagents: [string, number][]): InvSlot[] {
  const weapon: InvSlot = instance
    ? { itemId: 'vale_forged_blade', count: 1, instance }
    : { itemId: 'vale_forged_blade', count: 1 };
  return [weapon, ...bag(...reagents)];
}

describe('the grouped Apply Enchant picker', () => {
  it('returns all three groups in Base, Runed, Greater order, always', () => {
    const view = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: weaponBag(),
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    expect(view.sections.map((section) => section.group)).toEqual([...ENCHANT_GROUPS]);
    expect(view.sections.map((section) => section.group)).toEqual(['base', 'runed', 'greater']);
  });

  it('files every option under its own group, and nothing lands twice', () => {
    const view = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: weaponBag(),
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    for (const section of view.sections) {
      for (const option of section.options) {
        expect(option.group).toBe(section.group);
        expect(ENCHANTS[option.enchantId].group).toBe(section.group);
      }
    }
    const flat = view.sections.flatMap((section) => section.options.map((o) => o.enchantId));
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toHaveLength(MAINHAND.length);
    expect(view.totalOptions).toBe(MAINHAND.length);
  });

  it('leaves a group empty rather than dropping it, when the slot has no such rung', () => {
    const view = buildEnchantPickerView({
      enchants: enchantsForSlot('waist', ENCHANTS),
      inventory: bag(['arcane_dust', 99]),
      target: { where: 'bag', index: 99 },
      targetItemSlot: 'waist',
      skill: 0,
    });
    // The belt has only base enchants; the runed and greater sections are
    // present and empty so the consumer decides whether to print a heading.
    expect(view.sections.find((s) => s.group === 'base')!.options.length).toBeGreaterThan(0);
    expect(view.sections.find((s) => s.group === 'runed')!.options).toEqual([]);
    expect(view.sections.find((s) => s.group === 'greater')!.options).toEqual([]);
  });

  it('states each option stat bonus inline, ordered', () => {
    const view = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: weaponBag(),
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    const might = view.sections[0].options.find((o) => o.enchantId === 'enchant_weapon_might')!;
    expect(might.bonus).toEqual([{ stat: 'str', value: 2 }]);
    const greater = view.sections[2].options.find(
      (o) => o.enchantId === 'enchant_weapon_greater_might',
    )!;
    expect(greater.bonus).toEqual([{ stat: 'str', value: 5 }]);
  });

  it('marks an option affordable or short from the live bag', () => {
    const view = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: weaponBag(undefined, ['arcane_dust', 5]),
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    const might = view.sections[0].options.find((o) => o.enchantId === 'enchant_weapon_might')!;
    expect(might.reagentsMet).toBe(true);
    expect(might.ok).toBe(true);
    expect(might.shortItemIds).toEqual([]);
    const greater = view.sections[2].options.find(
      (o) => o.enchantId === 'enchant_weapon_greater_might',
    )!;
    expect(greater.reagentsMet).toBe(false);
    expect(greater.denyReason).toBe('insufficient_materials');
    expect(greater.shortItemIds).toEqual(['arcane_shard', 'arcane_essence']);
    expect(view.availableCount).toBeGreaterThan(0);
  });

  it('reports the enchant a row would destroy, and refuses an identical re-apply', () => {
    const inventory = weaponBag({ enchant: 'enchant_weapon_might' }, ['arcane_dust', 99]);
    const view = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory,
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    expect(view.currentEnchantId).toBe('enchant_weapon_might');
    const same = view.sections[0].options.find((o) => o.enchantId === 'enchant_weapon_might')!;
    expect(same.isCurrent).toBe(true);
    expect(same.ok).toBe(false);
    expect(same.denyReason).toBe('same_enchant');
    const other = view.sections[0].options.find((o) => o.enchantId === 'enchant_weapon_agility')!;
    expect(other.isCurrent).toBe(false);
    expect(other.replaces).toBe('enchant_weapon_might');
    expect(other.ok).toBe(true);
  });

  it('resolves the target item id, and reports none for a target that names nothing', () => {
    const held = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: weaponBag(),
      target: { where: 'bag', index: 0 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    expect(held.itemId).toBe('vale_forged_blade');
    const missing = buildEnchantPickerView({
      enchants: MAINHAND,
      inventory: [],
      target: { where: 'bag', index: 4 },
      targetItemSlot: 'mainhand',
      skill: 0,
    });
    expect(missing.itemId).toBeUndefined();
    expect(missing.sections.flatMap((s) => s.options).every((o) => o.denyReason === 'not_held')).toBe(
      true,
    );
  });

  it('is a pure function of its inputs', () => {
    const input = {
      enchants: MAINHAND,
      inventory: weaponBag(undefined, ['arcane_dust', 5]),
      target: { where: 'bag', index: 0 } as const,
      targetItemSlot: 'mainhand' as const,
      skill: 40,
    };
    expect(buildEnchantPickerView(input)).toEqual(buildEnchantPickerView(input));
  });
});

describe('the destructive replace confirmation', () => {
  const victim: ItemInstance = { enchant: 'enchant_weapon_might' };
  const arriving = enchantById('enchant_weapon_greater_might') as EnchantDef;

  function start(inventory: InvSlot[]) {
    return beginEnchant({
      enchant: arriving,
      target: { where: 'bag', index: 0 },
      inventory,
      targetItemSlot: 'mainhand',
      skill: 80,
      confirmReplace: true,
    });
  }

  it('NAMES the enchant being destroyed', () => {
    const view = enchantReplaceConfirmView(
      start(weaponBag(victim, ['arcane_shard', 1], ['arcane_essence', 2])),
      arriving.statBonus,
    )!;
    expect(view).not.toBeNull();
    expect(view.destroyedEnchantId).toBe('enchant_weapon_might');
    expect(view.enchantId).toBe('enchant_weapon_greater_might');
    expect(view.itemId).toBe('vale_forged_blade');
  });

  it('states the full reagent cost and whether the bag covers it', () => {
    const rich = enchantReplaceConfirmView(
      start(weaponBag(victim, ['arcane_shard', 1], ['arcane_essence', 2])),
    )!;
    expect(rich.cost).toEqual([
      { itemId: 'arcane_shard', required: 1, held: 1, met: true, short: 0 },
      { itemId: 'arcane_essence', required: 2, held: 2, met: true, short: 0 },
    ]);
    expect(rich.costMet).toBe(true);
    const poor = enchantReplaceConfirmView(start(weaponBag(victim)))!;
    expect(poor.costMet).toBe(false);
    expect(poor.cost.map((row) => row.short)).toEqual([1, 2]);
  });

  it('carries both warnings, no refund and no undo, and the destructive flag', () => {
    const view = enchantReplaceConfirmView(
      start(weaponBag(victim, ['arcane_shard', 1], ['arcane_essence', 2])),
    )!;
    expect(view.warnings).toEqual(ENCHANT_REPLACE_WARNINGS);
    expect(view.warnings).toContain('materialsNotRefunded');
    expect(view.warnings).toContain('cannotUndo');
    expect(view.destructive).toBe(true);
  });

  it('shows what is gained, so the trade reads on both sides', () => {
    const view = enchantReplaceConfirmView(
      start(weaponBag(victim, ['arcane_shard', 1], ['arcane_essence', 2])),
      arriving.statBonus,
    )!;
    expect(view.gaining).toEqual([{ stat: 'str', value: 5 }]);
  });

  it('is null when nothing would be destroyed, and null for an identical re-apply', () => {
    expect(
      enchantReplaceConfirmView(start(weaponBag(undefined, ['arcane_shard', 1], ['arcane_essence', 2]))),
    ).toBeNull();
    const same = beginEnchant({
      enchant: arriving,
      target: { where: 'bag', index: 0 },
      inventory: weaponBag({ enchant: arriving.id }, ['arcane_shard', 1], ['arcane_essence', 2]),
      targetItemSlot: 'mainhand',
      skill: 80,
      confirmReplace: true,
    });
    expect(same.reason).toBe('same_enchant');
    expect(enchantReplaceConfirmView(same)).toBeNull();
  });
});

describe('the disenchant preview', () => {
  it('previews the ladder material as a range and the typed weave as an exact count', () => {
    const input = {
      itemId: 'cinderforged_hauberk',
      kind: 'armor' as const,
      quality: 'rare' as const,
      armorType: 'mail' as const,
      stats: { armor: 215, sta: 9, str: 5 },
      itemLevel: 20,
    };
    const view = disenchantPreviewFor(input)!;
    const plan = previewDisenchant(input)!;
    expect(view.itemId).toBe('cinderforged_hauberk');
    expect(view.materialItemId).toBe('arcane_essence');
    expect([view.minCount, view.maxCount]).toEqual([plan.minCount, plan.maxCount]);
    expect(view.maxCount).toBe(view.minCount + 1);
    expect(view.exactMaterial).toBe(false);
    expect(view.secondaryItemId).toBe('resonant_links');
    expect(view.secondaryCount).toBe(1);
  });

  it('gives a sub-rare piece dust only, scaled by its level, with no weave', () => {
    const view = disenchantPreviewFor({
      itemId: 'copperguard_hauberk',
      kind: 'armor',
      quality: 'uncommon',
      armorType: 'mail',
      stats: { armor: 85, sta: 2, str: 1 },
      itemLevel: 20,
    })!;
    expect(view.materialItemId).toBe('arcane_dust');
    // qualityIndex(uncommon)=2 + floor(20/10)=2 + 1 => 5, plus the bonus unit.
    expect(view.minCount).toBe(5);
    expect(view.maxCount).toBe(6);
    expect(view.secondaryItemId).toBeUndefined();
    expect(view.secondaryCount).toBeUndefined();
  });

  it('carries the destroyed and cannot-undo warnings', () => {
    const view = disenchantPreviewView('x', {
      materialItemId: 'arcane_dust',
      minCount: 2,
      maxCount: 3,
    })!;
    expect(view.warnings).toEqual(DISENCHANT_WARNINGS);
    expect(view.warnings).toContain('itemDestroyed');
    expect(view.warnings).toContain('cannotUndo');
    expect(view.destructive).toBe(true);
  });

  it('is null for a piece that cannot be broken down at all', () => {
    expect(
      disenchantPreviewFor({
        itemId: 'silverleaf_draught',
        kind: 'potion',
        quality: 'common',
        itemLevel: 5,
      }),
    ).toBeNull();
    expect(disenchantPreviewView('x', null)).toBeNull();
  });
});

describe('per-line tooltip attribution', () => {
  it('splits the baked profile into the enchant share and the masterwork residue', () => {
    // A masterwork copy baked +3 str / +2 sta, then took a +5 str enchant.
    const instance: ItemInstance = {
      enchant: 'enchant_weapon_greater_might',
      rolled: { masterwork: true, stats: { str: 8, sta: 2 } },
      signer: 'Aldric',
    };
    const view = instanceStatAttribution(instance, { str: 5 });
    expect(view.enchantId).toBe('enchant_weapon_greater_might');
    expect(view.enchantLines).toEqual([{ stat: 'str', value: 5 }]);
    expect(view.masterwork).toBe(true);
    expect(view.masterworkLines).toEqual([
      { stat: 'str', value: 3 },
      { stat: 'sta', value: 2 },
    ]);
    expect(view.signer).toBe('Aldric');
    expect(view.hasAny).toBe(true);
  });

  it('attributes everything to the enchant on a plain enchanted copy', () => {
    const view = instanceStatAttribution({ enchant: 'x', rolled: { stats: { agi: 3 } } }, { agi: 3 });
    expect(view.enchantLines).toEqual([{ stat: 'agi', value: 3 }]);
    expect(view.masterwork).toBe(false);
    expect(view.masterworkLines).toEqual([]);
  });

  it('never invents an enchant line it cannot name', () => {
    // A marker id no table knows: the whole bake stays with the masterwork.
    const view = instanceStatAttribution({
      enchant: 'enchant_from_a_newer_realm',
      rolled: { masterwork: true, stats: { int: 4 } },
    });
    expect(view.enchantLines).toEqual([]);
    expect(view.masterworkLines).toEqual([{ stat: 'int', value: 4 }]);
  });

  it('reports nothing worth printing for an ordinary copy', () => {
    expect(instanceStatAttribution(undefined).hasAny).toBe(false);
    expect(instanceStatAttribution({}).hasAny).toBe(false);
    expect(instanceStatAttribution({ craftedRecipeId: 'r' }).hasAny).toBe(false);
    expect(instanceStatAttribution({ signer: 'Aldric' }).hasAny).toBe(true);
  });
});
