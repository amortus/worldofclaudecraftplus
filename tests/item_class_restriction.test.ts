import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { canEquipItem } from '../src/sim/equipment_rules';
import { ALL_CLASSES } from '../src/sim/types';
import { requiredClassesForTooltip } from '../src/ui/item_class_restriction';

// A druid was blocked from equipping "Fang of Korzul" (a rogue/hunter dagger) and a
// player was blocked from "Deathlord Warplate" (warrior/paladin/shaman mail) with no
// in-game explanation. Both items resolve to a recognized weapon-proficiency
// archetype / armor-weight group (equipment_rules.ts), and the tooltip used to hide
// the explicit "Requires: <classes>" line whenever that happened, on the mistaken
// assumption that the armor-weight badge or the archetype grouping alone made the
// restriction obvious. Neither actually names the eligible classes (and weapons have
// no equivalent badge at all), so the line must always render when the item carries a
// restriction that is genuinely enforced.
describe('requiredClassesForTooltip', () => {
  it('names the classes for a rogue/hunter-only weapon (Fang of Korzul)', () => {
    const item = ITEMS.fang_of_korzul;
    expect(item).toBeDefined();
    expect(canEquipItem('druid', item)).toBe(false);
    expect(requiredClassesForTooltip(item)).toEqual(['rogue', 'hunter']);
  });

  it('names the classes for a warrior/paladin/shaman mail chest (Deathlord Warplate)', () => {
    const item = ITEMS.deathlord_warplate;
    expect(item).toBeDefined();
    expect(canEquipItem('mage', item)).toBe(false);
    expect(requiredClassesForTooltip(item)).toEqual(['warrior', 'paladin', 'shaman']);
  });

  it('does not claim a restriction armor does not enforce (Shadowstitch Jerkin)', () => {
    // canEquipItem short-circuits leather armor on weight: every leather AND mail
    // class can wear it, so a druid (a leather class) can equip it even though
    // requiredClass only names rogue/hunter. requiredClass here is loot-targeting
    // metadata, not an enforced restriction, so the tooltip must stay silent.
    const item = ITEMS.shadow_jerkin;
    expect(item).toBeDefined();
    expect(canEquipItem('druid', item)).toBe(true);
    expect(requiredClassesForTooltip(item)).toBeNull();
  });

  it('names the really-admitted classes for a warrior-archetype weapon, not its narrower requiredClass', () => {
    // This fork diverges from the archetype grouping the tooltip line was first
    // written against: weaponArchetypeForItem DETECTS on OLD_WARRIOR_WEAPON_ARCHETYPE
    // (warrior/paladin/shaman) but canEquipItem then ENFORCES the wider
    // WARRIOR_WEAPON_CLASSES (adding rogue/hunter). Naming requiredClass here would
    // tell a rogue they cannot use a blade they can equip right now.
    const item = ITEMS.redbrook_blade;
    expect(item).toBeDefined();
    expect(item.requiredClass).toEqual(['warrior', 'paladin', 'shaman']);
    expect(canEquipItem('rogue', item)).toBe(true);
    expect(requiredClassesForTooltip(item)).toEqual([
      'warrior',
      'paladin',
      'hunter',
      'rogue',
      'shaman',
    ]);
  });

  it('returns null when the item carries no class restriction', () => {
    expect(
      requiredClassesForTooltip({
        id: 'test',
        name: 'Test',
        kind: 'weapon',
        slot: 'mainhand',
        weapon: { min: 1, max: 2, speed: 2 },
        sellValue: 1,
      }),
    ).toBeNull();
  });
});

// The contract, over the whole real item table: the tooltip may stay silent, but it
// must never name a set other than the one canEquipItem actually admits. This is the
// invariant that catches a resolver drifting away from the equip rules (the archetype
// detection/enforcement split in equipment_rules.ts makes requiredClass an unsafe
// stand-in for the admitted set on 48 of the shipped weapons).
describe('requiredClassesForTooltip vs the real ITEMS table', () => {
  it('never claims a class list that disagrees with canEquipItem', () => {
    const wrong: string[] = [];
    for (const item of Object.values(ITEMS)) {
      const shown = requiredClassesForTooltip(item);
      if (!shown) continue;
      const enforced = ALL_CLASSES.filter((cls) => canEquipItem(cls, item));
      const agrees =
        shown.length === enforced.length && shown.every((cls) => enforced.includes(cls));
      if (!agrees)
        wrong.push(`${item.id}: shows ${shown.join(',')} but admits ${enforced.join(',')}`);
    }
    expect(wrong).toEqual([]);
  });

  it('still shows the line for a meaningful number of restricted items', () => {
    // Guards the opposite failure: a resolver that silences everything would pass the
    // agreement check above vacuously.
    const shown = Object.values(ITEMS).filter((i) => requiredClassesForTooltip(i) !== null);
    expect(shown.length).toBeGreaterThan(50);
  });
});

// hud.ts renders the tooltip; assert the source no longer suppresses the classes
// line for items that match a known armor-weight/weapon-archetype grouping (the
// regression), and that it renders through the new pure resolver.
describe('hud.ts item tooltip class-restriction line', () => {
  const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');

  it('renders the classes line for every class-restricted item, not just narrow ones', () => {
    expect(hud).toContain('requiredClassesForTooltip(item)');
    expect(hud).not.toContain(
      'if (item.requiredClass && !armorTypeForItem(item) && !weaponArchetypeForItem(item)) {',
    );
  });
});
