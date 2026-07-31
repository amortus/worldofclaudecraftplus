// Enchant content: the three-group ladder, the reagent sinks, and the per-axis
// magnitude budget the table was tuned against.

import { describe, expect, it } from 'vitest';
import {
  ARCANE_LADDER_IDS,
  ENCHANT_MATERIAL_ITEMS,
  ENCHANTS,
  RESONANT_WEAVE_IDS,
  enchantById,
} from '../src/sim/content/professions';
import { ENCHANT_GROUPS, enchantsForSlot } from '../src/sim/professions';
import type { EnchantDef } from '../src/sim/professions';
import { ITEMS } from '../src/sim/data';
import { EQUIP_SLOTS, type EquipSlot, type Stats } from '../src/sim/types';
import { requiredLevelFor } from '../src/sim/item_level_req';

const ROWS = Object.values(ENCHANTS);
const AXES = ['str', 'agi', 'sta', 'int', 'spi', 'armor'] as const;

/** The strongest bonus on `axis` any enchant of `group` gives `slot`, or 0. */
function best(group: EnchantDef['group'], slot: EquipSlot, axis: keyof Stats): number {
  let out = 0;
  for (const e of ROWS) {
    if (e.group !== group || e.itemSlot !== slot) continue;
    out = Math.max(out, e.statBonus[axis] ?? 0);
  }
  return out;
}

describe('the enchant table', () => {
  it('keys every row by its own id', () => {
    for (const [key, e] of Object.entries(ENCHANTS)) {
      expect(e.id).toBe(key);
      expect(enchantById(key)).toBe(e);
    }
    expect(enchantById('enchant_does_not_exist')).toBeUndefined();
  });

  it('only targets the eight real equip slots', () => {
    for (const e of ROWS) expect(EQUIP_SLOTS, e.id).toContain(e.itemSlot);
  });

  it('uses only the three declared groups', () => {
    for (const e of ROWS) expect(ENCHANT_GROUPS, e.id).toContain(e.group);
  });

  it('grants only the six stat axes recalcPlayerStats reads off an instance', () => {
    for (const e of ROWS) {
      const keys = Object.keys(e.statBonus);
      expect(keys.length, e.id).toBeGreaterThan(0);
      for (const key of keys) expect(AXES, `${e.id}.${key}`).toContain(key);
      for (const value of Object.values(e.statBonus)) expect(value, e.id).toBeGreaterThan(0);
    }
  });

  it('offers at least three base options for every slot, so no build is stranded', () => {
    for (const slot of EQUIP_SLOTS) {
      const base = ROWS.filter((e) => e.group === 'base' && e.itemSlot === slot);
      expect(base.length, slot).toBeGreaterThanOrEqual(3);
      // And the picker lists them grouped.
      const listed = enchantsForSlot(slot, ENCHANTS);
      expect(listed.length, slot).toBeGreaterThanOrEqual(base.length);
      expect(listed.map((e) => e.group)).toEqual([...listed.map((e) => e.group)].sort(
        (a, b) => ENCHANT_GROUPS.indexOf(a) - ENCHANT_GROUPS.indexOf(b),
      ));
    }
  });
});

describe('the tier ladder', () => {
  it('makes Greater at least base + 3 on the same slot and axis', () => {
    for (const slot of EQUIP_SLOTS) {
      for (const axis of AXES) {
        const g = best('greater', slot, axis);
        if (g === 0) continue;
        const b = best('base', slot, axis);
        expect(g, `${slot}/${axis}`).toBeGreaterThanOrEqual(b + 3);
      }
    }
  });

  it('keeps Runed strictly between base and Greater, and never above Greater', () => {
    for (const slot of EQUIP_SLOTS) {
      for (const axis of AXES) {
        const r = best('runed', slot, axis);
        if (r === 0) continue;
        const b = best('base', slot, axis);
        const g = best('greater', slot, axis);
        expect(r, `${slot}/${axis} runed vs base`).toBeGreaterThan(b);
        if (g > 0) expect(r, `${slot}/${axis} runed vs greater`).toBeLessThan(g);
      }
    }
  });
});

describe('reagent sinks', () => {
  it('spends only known enchanting materials', () => {
    for (const e of ROWS) {
      expect(e.reagents.length, e.id).toBeGreaterThan(0);
      for (const r of e.reagents) {
        expect(ENCHANT_MATERIAL_ITEMS[r.itemId], `${e.id} -> ${r.itemId}`).toBeDefined();
        expect(r.count, e.id).toBeGreaterThan(0);
      }
    }
  });

  it('gives every typed weave exactly one consumer, all of them Runed', () => {
    for (const weave of RESONANT_WEAVE_IDS) {
      const users = ROWS.filter((e) => e.reagents.some((r) => r.itemId === weave));
      expect(users.map((e) => e.id), weave).toHaveLength(1);
      expect(users[0].group, weave).toBe('runed');
    }
  });

  it('makes Greater the only sink for arcane_shard', () => {
    const users = ROWS.filter((e) => e.reagents.some((r) => r.itemId === 'arcane_shard'));
    expect(users.length).toBeGreaterThan(0);
    for (const e of users) expect(e.group, e.id).toBe('greater');
  });

  it('prices the ladder strictly upward and merges it into ITEMS', () => {
    let previous = 0;
    for (const id of ARCANE_LADDER_IDS) {
      const def = ENCHANT_MATERIAL_ITEMS[id];
      expect(ITEMS[id], id).toBe(def);
      expect(def.sellValue, id).toBeGreaterThan(previous);
      previous = def.sellValue;
    }
    for (const id of RESONANT_WEAVE_IDS) expect(ITEMS[id], id).toBe(ENCHANT_MATERIAL_ITEMS[id]);
  });

  it('never gives an enchanting material a vendor buy price', () => {
    // Gold must buy materials from PLAYERS, never mint them at an NPC.
    for (const def of Object.values(ENCHANT_MATERIAL_ITEMS)) {
      expect(def.buyValue, def.id).toBeUndefined();
    }
  });
});

describe('the per-axis magnitude budget', () => {
  // The full best-path stack (the strongest enchant per slot, per axis) against
  // the level-20 best-in-slot budget the same axis can actually wear. Upstream
  // tunes this to roughly 13 to 21 percent of BiS per axis, with spirit
  // deliberately just under the band because so few slots carry it.
  const bestInSlotBudget = (axis: keyof Stats): number => {
    let total = 0;
    for (const slot of EQUIP_SLOTS) {
      let slotBest = 0;
      for (const def of Object.values(ITEMS)) {
        if (def.slot !== slot) continue;
        if (def.quality !== 'epic' && def.quality !== 'legendary') continue;
        if (requiredLevelFor(def) > 20) continue;
        slotBest = Math.max(slotBest, def.stats?.[axis] ?? 0);
      }
      total += slotBest;
    }
    return total;
  };

  const enchantStack = (axis: keyof Stats): number => {
    let total = 0;
    for (const slot of EQUIP_SLOTS) {
      let slotBest = 0;
      for (const e of ROWS) {
        if (e.itemSlot !== slot) continue;
        slotBest = Math.max(slotBest, e.statBonus[axis] ?? 0);
      }
      total += slotBest;
    }
    return total;
  };

  it('lands str, agi, sta and int inside the finishing-bonus band', () => {
    for (const axis of ['str', 'agi', 'sta', 'int'] as const) {
      const share = enchantStack(axis) / bestInSlotBudget(axis);
      expect(share, `${axis} share ${share}`).toBeGreaterThanOrEqual(0.1);
      expect(share, `${axis} share ${share}`).toBeLessThanOrEqual(0.22);
    }
  });

  it('leaves spirit just under the band, as upstream deliberately does', () => {
    const share = enchantStack('spi') / bestInSlotBudget('spi');
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.15);
  });

  it('pins the exact stacks, so a magnitude edit is a deliberate act', () => {
    // Magnitudes are FROZEN post-launch: an applied enchant bakes its bonus
    // into the item instance, so a later nerf would not retro-apply.
    expect(enchantStack('str')).toBe(15);
    expect(enchantStack('agi')).toBe(19);
    expect(enchantStack('sta')).toBe(20);
    expect(enchantStack('int')).toBe(18);
    expect(enchantStack('spi')).toBe(7);
    expect(enchantStack('armor')).toBe(35);
  });
});
