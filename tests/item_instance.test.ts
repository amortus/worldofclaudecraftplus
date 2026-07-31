import { describe, expect, it } from 'vitest';
import {
  addToSlots,
  canStack,
  cloneInstanceMap,
  cloneInvSlot,
  cloneInvSlots,
  findStackTarget,
  isInstanced,
  mintItemInstance,
  parseInstanceMap,
  parseInvSlot,
  parseInvSlots,
  parseItemInstance,
  removeFromSlots,
} from '../src/sim/item_instance';
import { Rng } from '../src/sim/rng';
import { type CharacterState, Sim } from '../src/sim/sim';
import type { InvSlot, ItemInstance } from '../src/sim/types';

const makeSim = (cls = 'warrior', seed = 42) =>
  new Sim({ seed, playerClass: cls as never, autoEquip: false });

const signed = (signer = 'Ambrose'): ItemInstance => ({ signer, signerId: 7 });

// Two ordinary stackable junk items; nothing about them is special.
const STACKABLE = 'linen_scrap';
const OTHER = 'spider_leg';

const bagOf = (sim: Sim, pid: number): InvSlot[] => (sim as any).players.get(pid).inventory;

// A save exactly as a build with no per-item identity wrote it: bare
// { itemId, count } slots, no `instance` key anywhere, no `equipmentInstances`.
function legacySave(sim: Sim, pid: number): CharacterState {
  const state = sim.serializeCharacter(pid);
  if (!state) throw new Error('no state');
  return JSON.parse(JSON.stringify(state)) as CharacterState;
}

describe('item_instance: stacking', () => {
  it('plain stacks merge exactly as before', () => {
    const slots: InvSlot[] = [];
    addToSlots(slots, 'linen', 5);
    addToSlots(slots, 'linen', 3);
    expect(slots).toEqual([{ itemId: 'linen', count: 8 }]);
    expect(isInstanced(slots[0])).toBe(false);
  });

  it('an instanced item never stacks, not even with an identical instance', () => {
    const slots: InvSlot[] = [];
    addToSlots(slots, 'blade', 1, signed());
    addToSlots(slots, 'blade', 1, signed());
    expect(slots).toHaveLength(2);
    expect(canStack(slots[0], 'blade', signed())).toBe(false);
    // ...and not with a plain copy in either direction.
    addToSlots(slots, 'blade', 1);
    expect(slots).toHaveLength(3);
    expect(canStack(slots[0], 'blade', undefined)).toBe(false);
    expect(canStack(slots[2], 'blade', signed())).toBe(false);
    expect(canStack(slots[2], 'blade', undefined)).toBe(true);
  });

  it('a plain add never merges into an instanced slot even when it sits first', () => {
    const slots: InvSlot[] = [{ itemId: 'blade', count: 1, instance: signed() }];
    addToSlots(slots, 'blade', 2);
    expect(findStackTarget(slots, 'blade')).toBe(1);
    expect(slots[0]).toEqual({ itemId: 'blade', count: 1, instance: signed() });
    expect(slots[1]).toEqual({ itemId: 'blade', count: 2 });
  });

  it('removal consumes plain copies before instanced ones and hands the instance back', () => {
    const slots: InvSlot[] = [
      { itemId: 'blade', count: 1, instance: signed() },
      { itemId: 'blade', count: 2 },
    ];
    const first = removeFromSlots(slots, 'blade', 2);
    expect(first).toEqual({ removed: 2, instances: [] });
    expect(slots).toEqual([{ itemId: 'blade', count: 1, instance: signed() }]);

    const second = removeFromSlots(slots, 'blade', 1);
    expect(second.removed).toBe(1);
    expect(second.instances).toEqual([signed()]);
    expect(slots).toEqual([]);
  });

  it('removal is a no-op past what the bags hold', () => {
    const slots: InvSlot[] = [{ itemId: 'linen', count: 2 }];
    expect(removeFromSlots(slots, 'linen', 5)).toEqual({ removed: 2, instances: [] });
    expect(removeFromSlots(slots, 'linen', 1)).toEqual({ removed: 0, instances: [] });
    expect(slots).toEqual([]);
  });
});

describe('item_instance: cloning', () => {
  it('deep-clones nested payload maps so a copy cannot mutate the original', () => {
    const slot: InvSlot = {
      itemId: 'blade',
      count: 1,
      instance: {
        signer: 'A',
        charges: { zap: 3 },
        rolled: { masterwork: true, stats: { str: 4 } },
      },
    };
    const copy = cloneInvSlot(slot);
    expect(copy).toEqual(slot);
    copy.instance!.charges!.zap = 0;
    copy.instance!.rolled!.stats!.str = 99;
    expect(slot.instance?.charges?.zap).toBe(3);
    expect(slot.instance?.rolled?.stats?.str).toBe(4);
  });

  it('cloneInstanceMap omits an empty map entirely', () => {
    expect(cloneInstanceMap({})).toBeUndefined();
    const map = cloneInstanceMap({ mainhand: signed() });
    expect(map).toEqual({ mainhand: signed() });
  });
});

describe('item_instance: back-compat parsing', () => {
  it('degrades every malformed instance to a plain stack instead of throwing', () => {
    for (const bad of [null, undefined, 0, 7, '', 'nope', true, [], [1, 2], {}, { signer: 42 }]) {
      expect(parseItemInstance(bad)).toBeUndefined();
    }
    // A slot whose whole payload is junk simply loads as a plain stack.
    expect(parseInvSlot({ itemId: 'blade', count: 2, instance: 'garbage' })).toEqual({
      itemId: 'blade',
      count: 2,
    });
  });

  it('drops only the fields whose types are wrong, keeping the rest of the payload', () => {
    const parsed = parseItemInstance({
      signer: 'Ambrose',
      signerId: 'not-a-number',
      enchant: 7,
      boundTo: 12,
      charges: { zap: 3, bad: 'x' },
      rolled: { quality: 'rare', masterwork: 'yes', stats: { str: 4, agi: null } },
    });
    expect(parsed).toEqual({
      signer: 'Ambrose',
      boundTo: 12,
      charges: { zap: 3 },
      rolled: { quality: 'rare', stats: { str: 4 } },
    });
  });

  it('preserves fields a newer build wrote, so an old build round-trips them', () => {
    const parsed = parseItemInstance({ signer: 'A', rift: { tier: 3, gems: ['x'] } });
    expect(parsed).toEqual({ signer: 'A', rift: { tier: 3, gems: ['x'] } });
  });

  it('refuses prototype-polluting keys and non-JSON values', () => {
    const raw = JSON.parse('{"signer":"A","__proto__":{"polluted":true},"fn":null}');
    const parsed = parseItemInstance(raw) as Record<string, unknown>;
    expect(parsed.signer).toBe('A');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseItemInstance({ signer: 'A', bad: Number.NaN })).toEqual({ signer: 'A' });
  });

  it('never throws on a hostile bag and keeps every restorable slot', () => {
    const bag = parseInvSlots([
      { itemId: 'linen', count: 3 },
      null,
      'nope',
      { count: 5 },
      { itemId: '', count: 1 },
      { itemId: 'blade', count: Number.NaN },
      { itemId: 'ore', count: 2, craftedRecipeId: 'r_ore', slot: 4 },
    ]);
    expect(bag).toEqual([
      { itemId: 'linen', count: 3 },
      { itemId: 'blade', count: 1 },
      { itemId: 'ore', count: 2, craftedRecipeId: 'r_ore', slot: 4 },
    ]);
    expect(parseInvSlots('not an array')).toEqual([]);
    expect(parseInvSlots(undefined)).toEqual([]);
  });

  it('parses an equipped-instance map and skips unusable entries', () => {
    expect(parseInstanceMap({ mainhand: signed(), chest: 5, legs: {} })).toEqual({
      mainhand: signed(),
    });
    expect(parseInstanceMap(null)).toEqual({});
  });

  it('leaves a legacy bag byte-identical', () => {
    const legacy = [
      { itemId: 'linen', count: 4 },
      { itemId: 'blade', count: 1 },
    ];
    expect(JSON.stringify(parseInvSlots(legacy))).toBe(JSON.stringify(legacy));
  });
});

describe('item_instance: minting', () => {
  it('is reproducible from a fixed seed', () => {
    const mint = (seed: number) => {
      const rng = new Rng(seed);
      return [0, 1, 2, 3, 4, 5].map(() =>
        mintItemInstance(rng, {
          signer: 'Ambrose',
          signerId: 7,
          craftedRecipeId: 'r_blade',
          masterworkChance: 0.5,
          masterworkStats: { str: 4 },
        }),
      );
    };
    expect(mint(1234)).toEqual(mint(1234));
    // The proc is a real roll, not a constant: over six draws it lands both ways.
    const rolls = mint(1234).map((i) => i?.rolled?.masterwork === true);
    expect(rolls).toContain(true);
    expect(rolls).toContain(false);
  });

  it('draws exactly one number whenever a proc is on the table', () => {
    const withMint = new Rng(99);
    mintItemInstance(withMint, { signer: 'A', masterworkChance: 0 });
    const plain = new Rng(99);
    plain.next();
    expect(withMint.next()).toBe(plain.next());
  });

  it('draws nothing when no proc is requested, and mints nothing from nothing', () => {
    const rng = new Rng(5);
    const untouched = new Rng(5);
    expect(mintItemInstance(rng, { signer: 'A' })).toEqual({ signer: 'A' });
    expect(rng.next()).toBe(untouched.next());
    expect(mintItemInstance(new Rng(5), {})).toBeUndefined();
  });

  it('bakes the signature, enchant and bonus roll a profession needs', () => {
    const instance = mintItemInstance(new Rng(1), {
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'r_blade',
      enchant: 'ench_sharp',
      boundTo: 7,
      quality: 'rare',
      masterworkChance: 1,
      masterworkStats: { str: 4 },
    });
    expect(instance).toEqual({
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'r_blade',
      enchant: 'ench_sharp',
      boundTo: 7,
      rolled: { quality: 'rare', masterwork: true, stats: { str: 4 } },
    });
  });
});

describe('item_instance: sim inventory', () => {
  it('an instanced add opens its own slot and never joins a stack', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    sim.addItem(STACKABLE, 2, pid);
    sim.addItem(STACKABLE, 1, pid, signed());
    sim.addItem(STACKABLE, 1, pid, signed());
    sim.addItem(STACKABLE, 3, pid);
    const rows = sim.inventory.filter((s) => s.itemId === STACKABLE);
    expect(rows.map((s) => s.count)).toEqual([5, 1, 1]);
    expect(rows.filter(isInstanced)).toHaveLength(2);
    expect(sim.countItem(STACKABLE, pid)).toBe(7);
  });

  it('spending a stack eats the plain copies first', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    sim.addItem(STACKABLE, 1, pid, signed());
    sim.addItem(STACKABLE, 2, pid);
    sim.removeItem(STACKABLE, 2, pid);
    const rows = sim.inventory.filter((s) => s.itemId === STACKABLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].instance).toEqual(signed());
  });

  it('carries identity through equip and back out on unequip', () => {
    const sim = makeSim();
    const pid = sim.player.id;
    const meta = (sim as any).players.get(pid);
    const worn = meta.equipment.mainhand as string;
    sim.addItem(worn, 1, pid, signed('Smith'));
    sim.equipItem(worn, pid);
    expect(meta.equipmentInstances.mainhand).toEqual(signed('Smith'));
    sim.unequipItem('mainhand', pid);
    expect(meta.equipmentInstances.mainhand).toBeUndefined();
    const rows = sim.inventory.filter((s) => s.itemId === worn);
    expect(rows.filter(isInstanced).map((s) => s.instance)).toEqual([signed('Smith')]);
  });
});

describe('item_instance: persistence', () => {
  it('an old save with no instances loads and re-saves identically', () => {
    const a = makeSim();
    a.addItem(STACKABLE, 4, a.player.id);
    a.addItem(OTHER, 2, a.player.id);
    const old = legacySave(a, a.player.id);
    expect(JSON.stringify(old)).not.toContain('instance');

    const b = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = b.addPlayer('warrior', 'Ambrose', { state: old });
    const again = legacySave(b, pid);
    expect(again).toEqual(old);
    expect('equipmentInstances' in again).toBe(false);
  });

  it('round-trips an instanced slot through save and load', () => {
    const a = makeSim();
    const instance: ItemInstance = {
      signer: 'Ambrose',
      signerId: 7,
      craftedRecipeId: 'r_blade',
      enchant: 'ench_sharp',
      rolled: { masterwork: true, stats: { str: 4 } },
      charges: { zap: 2 },
    };
    a.addItem(STACKABLE, 1, a.player.id, instance);
    a.addItem(STACKABLE, 3, a.player.id);
    const saved = legacySave(a, a.player.id);

    const b = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = b.addPlayer('warrior', 'Ambrose', { state: saved });
    const rows = bagOf(b, pid).filter((s) => s.itemId === STACKABLE);
    expect(rows.map((s) => s.count)).toEqual([1, 3]);
    expect(rows.find(isInstanced)?.instance).toEqual(instance);
    // Loaded payloads are copies, never aliases of the saved state.
    expect(rows.find(isInstanced)?.instance).not.toBe(instance);
    expect(legacySave(b, pid).inventory).toEqual(saved.inventory);
  });

  it('round-trips an equipped instance and omits the field when there is none', () => {
    const a = makeSim();
    const meta = (a as any).players.get(a.player.id);
    const worn = meta.equipment.mainhand as string;
    a.addItem(worn, 1, a.player.id, signed('Smith'));
    a.equipItem(worn, a.player.id);
    const saved = legacySave(a, a.player.id);
    expect(saved.equipmentInstances).toEqual({ mainhand: signed('Smith') });

    const b = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = b.addPlayer('warrior', 'Ambrose', { state: saved });
    expect(legacySave(b, pid).equipmentInstances).toEqual({ mainhand: signed('Smith') });
    b.unequipItem('mainhand', pid);
    expect('equipmentInstances' in legacySave(b, pid)).toBe(false);
  });

  it('loads a save whose instance payloads are corrupt instead of throwing', () => {
    const a = makeSim();
    a.addItem(STACKABLE, 4, a.player.id);
    const saved = legacySave(a, a.player.id) as CharacterState & Record<string, unknown>;
    const bag = saved.inventory as unknown[];
    bag.push({ itemId: OTHER, count: 1, instance: 'corrupt' });
    bag.push({ itemId: OTHER, count: 1, instance: { signer: 99 } });
    bag.push({ itemId: OTHER, count: 1, instance: [] });
    bag.push(null);
    bag.push({ count: 3 });
    saved.equipmentInstances = { mainhand: 'garbage' } as never;

    const b = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    let pid = -1;
    expect(() => {
      pid = b.addPlayer('warrior', 'Ambrose', { state: saved });
    }).not.toThrow();
    const rows = bagOf(b, pid).filter((s) => s.itemId === OTHER);
    // Each corrupt payload degraded to a plain stack. Loading never re-merges
    // rows (it preserves the persisted bag layout), so they stay three slots and
    // simply behave as ordinary items from here on.
    expect(rows).toEqual([
      { itemId: OTHER, count: 1 },
      { itemId: OTHER, count: 1 },
      { itemId: OTHER, count: 1 },
    ]);
    expect(b.countItem(OTHER, pid)).toBe(3);
    expect(b.countItem(STACKABLE, pid)).toBe(4);
    const out = legacySave(b, pid);
    expect('equipmentInstances' in out).toBe(false);
    expect(JSON.stringify(out.inventory)).not.toContain('corrupt');
  });

  it('mints reproducibly from a fixed world seed', () => {
    const run = () => {
      const sim = makeSim('warrior', 20061);
      const pid = sim.player.id;
      const rng = (sim as any).rng as Rng;
      for (let i = 0; i < 4; i++) {
        const instance = mintItemInstance(rng, {
          signer: 'Ambrose',
          signerId: pid,
          craftedRecipeId: 'r_blade',
          masterworkChance: 0.5,
          masterworkStats: { str: 4 },
        });
        sim.addItem(STACKABLE, 1, pid, instance);
      }
      return JSON.stringify(sim.serializeCharacter(pid)?.inventory);
    };
    expect(run()).toBe(run());
  });
});

describe('item_instance: bags stay a plain array', () => {
  it('cloneInvSlots preserves order and shape', () => {
    const slots: InvSlot[] = [
      { itemId: 'linen', count: 2 },
      { itemId: 'blade', count: 1, instance: signed() },
    ];
    expect(cloneInvSlots(slots)).toEqual(slots);
    expect(cloneInvSlots(slots)[1].instance).not.toBe(slots[1].instance);
  });
});
