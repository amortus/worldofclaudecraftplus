// Localization coverage for the crafting / enchanting UI copy
// (src/ui/crafting_labels.ts + src/ui/crafting_feedback.ts).
//
// `t()` THROWS on an untracked key in dev/test, so every assertion here doubles
// as proof that the whole feature's catalog surface exists: the four craft
// names and blurbs, the three group headers, all 36 enchant names, every deny
// arm, both destructive confirmations, and the tooltip attribution block.

import { describe, expect, it } from 'vitest';
import {
  craftDenyLine,
  craftResultLines,
  craftSkillUpLine,
  disenchantConfirmText,
  disenchantDenyLine,
  disenchantResultLines,
  enchantDenyLine,
  enchantReplaceConfirmText,
  enchantResultLine,
  instanceAttributionHtml,
} from '../src/ui/crafting_feedback';
import {
  craftProfessionDescription,
  craftProfessionName,
  enchantGroupBlurb,
  enchantGroupLabel,
  enchantName,
  localizeCraftedElixirAuraName,
  statBonusLabel,
} from '../src/ui/crafting_labels';
import {
  disenchantPreviewView,
  enchantReplaceConfirmView,
} from '../src/ui/enchanting_ui_view';
import { beginEnchant, CRAFTING_PROFESSION_IDS, ENCHANT_GROUPS } from '../src/sim/professions';
import { ENCHANTS, enchantById } from '../src/sim/content/professions';
import type { InvSlot } from '../src/sim/types';

describe('labels', () => {
  it('names and describes all four crafts', () => {
    for (const id of CRAFTING_PROFESSION_IDS) {
      expect(craftProfessionName(id).length).toBeGreaterThan(0);
      expect(craftProfessionDescription(id).length).toBeGreaterThan(0);
    }
    expect(craftProfessionName('smithing')).toBe('Smithing');
  });

  it('labels the three enchant groups the picker renders', () => {
    expect(ENCHANT_GROUPS.map(enchantGroupLabel)).toEqual(['Base', 'Runed', 'Greater']);
    for (const group of ENCHANT_GROUPS) expect(enchantGroupBlurb(group).length).toBeGreaterThan(0);
  });

  it('has a name key for every shipped enchant, matching the sim source', () => {
    const ids = Object.keys(ENCHANTS);
    expect(ids.length).toBe(36);
    for (const id of ids) expect(enchantName(id)).toBe(ENCHANTS[id].name);
  });

  it('never leaks a raw enchant id into copy', () => {
    expect(enchantName('enchant_from_a_newer_realm')).toBe('an unknown enchantment');
  });

  it('labels every stat axis a bonus can land on', () => {
    for (const stat of ['str', 'agi', 'sta', 'int', 'spi', 'armor'] as const) {
      expect(statBonusLabel(stat).length).toBeGreaterThan(0);
    }
    expect(statBonusLabel('sta')).toBe('Stamina');
  });

  it('localizes the four crafted elixir auras and declines everything else', () => {
    for (const aura of ['Silver Vigor', 'Golden Focus', 'Sunpetal Swiftness', 'Ashen Ward']) {
      expect(localizeCraftedElixirAuraName(aura)).toBe(aura);
    }
    // Not ours: the caller falls through to its own resolvers.
    expect(localizeCraftedElixirAuraName('Might of the Bear')).toBeNull();
  });
});

describe('craft feedback lines', () => {
  it('prints the masterwork, its baked stats and the makers bond', () => {
    const lines = craftResultLines({
      itemId: 'cinderforged_hauberk',
      count: 1,
      masterwork: true,
      masterworkStats: { armor: 72, sta: 3 },
      signedReagentUsed: true,
      signer: 'Aldric',
    }).map((l) => l.text);
    expect(lines[0]).toContain('masterwork');
    expect(lines[0]).toContain('Cinderforged Hauberk');
    expect(lines[1]).toContain('+3 Stamina');
    expect(lines[1]).toContain('+72 Armor');
    expect(lines[2]).toBe('Crafted by Aldric.');
    expect(lines[3].length).toBeGreaterThan(0);
  });

  it('never claims a maker on a fungible output', () => {
    // A potion is not signable (isSignableCraftOutput keys on the output KIND),
    // so a stack of draughts stays a stack and never names a crafter.
    const lines = craftResultLines({
      itemId: 'silverleaf_draught',
      count: 2,
      signer: 'Aldric',
    }).map((l) => l.text);
    expect(lines.some((line) => line.includes('Aldric'))).toBe(false);
    expect(lines[0]).toContain('x2');
  });

  it('names the short reagent on a denial, and covers every host-level arm', () => {
    expect(
      craftDenyLine('insufficient_materials', [{ itemId: 'copper_ore', required: 10, held: 3 }])
        .text,
    ).toContain('Copper Ore');
    for (const reason of ['insufficient_materials', 'unknown_recipe', 'busy', 'dead'] as const) {
      expect(craftDenyLine(reason).text.length).toBeGreaterThan(0);
    }
  });

  it('is silent on a zero gain and announces the ceiling once', () => {
    expect(craftSkillUpLine({ professionId: 'smithing', skillGain: 0, nextSkill: 40 })).toBeNull();
    expect(craftSkillUpLine({ professionId: 'smithing', skillGain: 1, nextSkill: 125 })!.text).toBe(
      'You have mastered Smithing.',
    );
  });
});

describe('enchant feedback lines', () => {
  it('names both enchants on a destructive replace', () => {
    const plain = enchantResultLine({
      enchantId: 'enchant_weapon_might',
      itemId: 'vale_forged_blade',
    }).text;
    expect(plain).toContain('Enchant Weapon - Might');
    expect(plain).toContain('Vale-Forged Blade');
    const replaced = enchantResultLine({
      enchantId: 'enchant_weapon_greater_might',
      itemId: 'vale_forged_blade',
      replaced: true,
      replacedEnchantId: 'enchant_weapon_might',
    }).text;
    expect(replaced).toContain('Enchant Weapon - Greater Might');
    expect(replaced).toContain('Enchant Weapon - Might');
  });

  it('covers every deny arm, the pure core gates and the host-level ones', () => {
    for (const reason of [
      'not_held',
      'wrong_slot',
      'insufficient_materials',
      'already_enchanted',
      'same_enchant',
      'unknown_enchant',
      'busy',
      'dead',
    ] as const) {
      expect(enchantDenyLine(reason, 'vale_forged_blade').text.length).toBeGreaterThan(0);
    }
    for (const reason of ['not_held', 'not_disenchantable', 'busy', 'dead'] as const) {
      expect(disenchantDenyLine(reason).text.length).toBeGreaterThan(0);
    }
  });

  it('lists what a disenchant recovered, one material per line', () => {
    const lines = disenchantResultLines({
      itemId: 'cinderforged_hauberk',
      materialItemId: 'arcane_essence',
      count: 2,
      secondaryItemId: 'resonant_links',
      secondaryCount: 1,
    }).map((l) => l.text);
    expect(lines[0]).toContain('Cinderforged Hauberk');
    expect(lines[1]).toContain('Arcane Essence');
    expect(lines[2]).toContain('Resonant Links');
  });
});

describe('the destructive confirmations, in words', () => {
  const bag: InvSlot[] = [
    { itemId: 'vale_forged_blade', count: 1, instance: { enchant: 'enchant_weapon_might' } },
    { itemId: 'arcane_shard', count: 1 },
    { itemId: 'arcane_essence', count: 2 },
  ];
  const arriving = enchantById('enchant_weapon_greater_might')!;
  const start = beginEnchant({
    enchant: arriving,
    target: { where: 'bag', index: 0 },
    inventory: bag,
    targetItemSlot: 'mainhand',
    skill: 80,
    confirmReplace: true,
  });

  it('names the destroyed enchant in the TITLE, not only the body', () => {
    const text = enchantReplaceConfirmText(
      enchantReplaceConfirmView(start, arriving.statBonus)!,
    );
    // Marked destructive by its words, not only by colour.
    expect(text.title).toContain('Destroy');
    expect(text.title).toContain('Enchant Weapon - Might');
  });

  it('states the cost and both consequences the player cannot walk back', () => {
    const text = enchantReplaceConfirmText(
      enchantReplaceConfirmView(start, arriving.statBonus)!,
    );
    expect(text.body).toContain('Enchant Weapon - Might');
    expect(text.body).toContain('Enchant Weapon - Greater Might');
    expect(text.body).toContain('+5 Strength');
    expect(text.body).toContain('1 Arcane Shard');
    expect(text.body).toContain('2 Arcane Essence');
    expect(text.body).toContain('not refunded');
    expect(text.body).toContain('cannot be undone');
    expect(text.okText.length).toBeGreaterThan(0);
    expect(text.cancelText.length).toBeGreaterThan(0);
  });

  it('previews the disenchant yield as a range plus an exact secondary', () => {
    const text = disenchantConfirmText(
      disenchantPreviewView('cinderforged_hauberk', {
        materialItemId: 'arcane_essence',
        minCount: 1,
        maxCount: 2,
        secondaryItemId: 'resonant_links',
        secondaryCount: 1,
      })!,
    );
    expect(text.title).toContain('Cinderforged Hauberk');
    expect(text.body).toContain('1 to 2 Arcane Essence');
    expect(text.body).toContain('1 Resonant Links');
    expect(text.body).toContain('destroyed');
    expect(text.body).toContain('cannot be undone');
  });
});

describe('tooltip attribution', () => {
  it('names the enchant and separates its lines from the masterwork bake', () => {
    const html = instanceAttributionHtml(
      {
        enchant: 'enchant_weapon_greater_might',
        rolled: { masterwork: true, stats: { str: 8, sta: 2 } },
        signer: 'Aldric',
      },
      { str: 5 },
    );
    expect(html).toContain('Enchanted: Enchant Weapon - Greater Might');
    expect(html).toContain('+5 Strength (enchant)');
    expect(html).toContain('+3 Strength (masterwork)');
    expect(html).toContain('+2 Stamina (masterwork)');
    expect(html).toContain('Crafted by Aldric');
  });

  it('adds nothing at all to an ordinary copy', () => {
    expect(instanceAttributionHtml(undefined)).toBe('');
    expect(instanceAttributionHtml({})).toBe('');
  });
});
