// Mounts: the reins item, the summon cast, the speed aura, and every way a ride
// ends. The pure rules live in src/sim/mounts.ts; this file drives both the
// module and the wiring in sim.ts.
import { describe, expect, it } from 'vitest';

import { ITEMS, MOUNT_VENDOR_NPC_ID, NPCS } from '../src/sim/data';
import {
  MOUNTS,
  MOUNT_AURA_KIND,
  MOUNT_CAST_ID,
  MOUNT_CAST_SECONDS,
  MOUNT_ITEMS,
  MOUNT_SPEED_MULT,
  isMountAuraId,
  mountAuraId,
  mountById,
  mountDenyReason,
  mountIdFromAuraId,
  rideEndReason,
  type MountSituation,
} from '../src/sim/mounts';
import { Sim } from '../src/sim/sim';
import { DT, RUN_SPEED, type SimEvent } from '../src/sim/types';

const MOUNT_ID = 'reins_dawnstrider';
const CAST_TICKS = Math.ceil(MOUNT_CAST_SECONDS / DT) + 1;

const clear: MountSituation = {
  dead: false,
  inCombat: false,
  swimming: false,
  indoors: false,
  casting: false,
};

function makeSim(): Sim {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  sim.addItem(MOUNT_ID, 1, sim.playerId);
  return sim;
}

function ride(sim: Sim): SimEvent[] {
  sim.useItem(MOUNT_ID, sim.playerId);
  const out: SimEvent[] = [];
  for (let i = 0; i < CAST_TICKS; i++) out.push(...sim.tick());
  return out;
}

const mounted = (sim: Sim) =>
  sim.entities.get(sim.playerId)!.auras.some((a) => isMountAuraId(a.id));

describe('mounts: the catalog and the item', () => {
  it('ships a reins item that resolves to a mount', () => {
    expect(Object.keys(MOUNTS)).toContain(MOUNT_ID);
    expect(MOUNT_ITEMS[MOUNT_ID]).toBeTruthy();
    expect(ITEMS[MOUNT_ID]).toBeTruthy();
    expect(ITEMS[MOUNT_ID].use).toEqual({ type: 'mount', mountId: MOUNT_ID });
    expect(mountById(MOUNT_ID)!.itemId).toBe(MOUNT_ID);
    expect(mountById('nope')).toBeNull();
  });

  it('is actually obtainable', () => {
    // Wave 1 shipped 15 gathering tools no vendor sold, and gathering
    // hard-requires a tool, so 42 nodes were permanent scenery. A mount nobody
    // can buy is the same bug.
    const vendor = NPCS[MOUNT_VENDOR_NPC_ID];
    expect(vendor).toBeTruthy();
    for (const id of Object.keys(MOUNT_ITEMS)) {
      expect(vendor.vendorItems, id).toContain(id);
      expect(ITEMS[id].buyValue, id).toBeGreaterThan(0);
    }
  });

  it('anchors its speed between the sustained travel auras and the burst ones', () => {
    // Ghost Wolf / Travel Form are 1.4 sustained; Sprint is 1.7 for 15 s on a
    // 300 s cooldown. The mount is the best SUSTAINED travel and nothing more.
    expect(MOUNT_SPEED_MULT).toBe(1.6);
    expect(MOUNT_SPEED_MULT).toBeGreaterThan(1.4);
    expect(MOUNT_SPEED_MULT).toBeLessThan(1.7);
    expect(MOUNT_AURA_KIND).toBe('buff_speed');
    expect(RUN_SPEED * MOUNT_SPEED_MULT).toBeCloseTo(11.2, 5);
  });

  it('round-trips the aura id', () => {
    expect(mountAuraId(MOUNT_ID)).toBe(`mount_${MOUNT_ID}`);
    expect(mountIdFromAuraId(mountAuraId(MOUNT_ID))).toBe(MOUNT_ID);
    expect(mountIdFromAuraId('buff_speed')).toBeNull();
    expect(isMountAuraId('sprint')).toBe(false);
  });
});

describe('mounts: the pure rules', () => {
  it('refuses in the order a player would blame', () => {
    expect(mountDenyReason(clear)).toBeNull();
    expect(mountDenyReason({ ...clear, dead: true, inCombat: true })).toBe('dead');
    expect(mountDenyReason({ ...clear, inCombat: true, swimming: true })).toBe('combat');
    expect(mountDenyReason({ ...clear, swimming: true })).toBe('water');
    expect(mountDenyReason({ ...clear, indoors: true })).toBe('indoors');
    expect(mountDenyReason({ ...clear, casting: true })).toBe('cast');
  });

  it('ends a live ride on every state, but never on `casting` alone', () => {
    expect(rideEndReason(clear)).toBeNull();
    expect(rideEndReason({ ...clear, casting: true })).toBeNull();
    expect(rideEndReason({ ...clear, dead: true })).toBe('dead');
    expect(rideEndReason({ ...clear, inCombat: true })).toBe('combat');
    expect(rideEndReason({ ...clear, swimming: true })).toBe('water');
    expect(rideEndReason({ ...clear, indoors: true })).toBe('indoors');
  });
});

describe('mounts: summoning', () => {
  it('casts, then grants the speed aura and says so', () => {
    const sim = makeSim();
    sim.useItem(MOUNT_ID, sim.playerId);
    const p = sim.entities.get(sim.playerId)!;
    expect(p.castingAbility).toBe(MOUNT_CAST_ID);
    expect(p.castTotal).toBe(MOUNT_CAST_SECONDS);
    expect(mounted(sim)).toBe(false);

    const events: SimEvent[] = [];
    for (let i = 0; i < CAST_TICKS; i++) events.push(...sim.tick());
    const up = events.find((e) => e.type === 'mountUp') as { mountId: string } | undefined;
    expect(up?.mountId).toBe(MOUNT_ID);
    expect(mounted(sim)).toBe(true);
    expect(sim.moveSpeedMult(p)).toBeCloseTo(MOUNT_SPEED_MULT, 5);
  });

  it('never consumes the reins', () => {
    const sim = makeSim();
    ride(sim);
    expect(sim.countItem(MOUNT_ID, sim.playerId)).toBe(1);
  });

  it('refuses in combat, text-free', () => {
    const sim = makeSim();
    const p = sim.entities.get(sim.playerId)!;
    p.inCombat = true;
    p.combatTimer = 0;
    sim.useItem(MOUNT_ID, sim.playerId);
    expect(p.castingAbility).toBeNull();
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('combat');
  });

  it('refuses inside an instance', () => {
    const sim = makeSim();
    sim.enterDungeon('hollow_crypt', sim.playerId);
    sim.useItem(MOUNT_ID, sim.playerId);
    expect(sim.entities.get(sim.playerId)!.castingAbility).toBeNull();
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('indoors');
  });

  it('abandons the summon when the reins are pressed again mid-cast', () => {
    const sim = makeSim();
    sim.useItem(MOUNT_ID, sim.playerId);
    sim.useItem(MOUNT_ID, sim.playerId);
    const p = sim.entities.get(sim.playerId)!;
    expect(p.castingAbility).toBeNull();
    expect(sim.meta(sim.playerId)!.pendingMountId).toBeNull();
    for (let i = 0; i < CAST_TICKS; i++) sim.tick();
    expect(mounted(sim)).toBe(false);
  });
});

describe('mounts: dismounting', () => {
  it('dismounts on damage, instantly', () => {
    const sim = makeSim();
    ride(sim);
    expect(mounted(sim)).toBe(true);
    const p = sim.entities.get(sim.playerId)!;
    (sim as unknown as { dealDamage: (...a: unknown[]) => void }).dealDamage(
      null,
      p,
      5,
      false,
      'physical',
      'Test',
      'hit',
    );
    expect(mounted(sim)).toBe(false);
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('damage');
  });

  it('dismounts on entering combat', () => {
    const sim = makeSim();
    ride(sim);
    const p = sim.entities.get(sim.playerId)!;
    p.inCombat = true;
    p.combatTimer = 0;
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('combat');
    expect(mounted(sim)).toBe(false);
  });

  it('dismounts instantly on the manual command, and is never refused', () => {
    const sim = makeSim();
    ride(sim);
    sim.dismount(sim.playerId);
    expect(mounted(sim)).toBe(false);
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('manual');
    // A second dismount with nothing to dismount from is a silent no-op.
    sim.dismount(sim.playerId);
    expect(sim.tick().some((e) => e.type === 'mountDown')).toBe(false);
  });

  it('dismounts when the reins are pressed while mounted', () => {
    const sim = makeSim();
    ride(sim);
    sim.useItem(MOUNT_ID, sim.playerId);
    expect(mounted(sim)).toBe(false);
    expect(sim.entities.get(sim.playerId)!.castingAbility).toBeNull();
  });

  it('dismounts when the rider casts anything', () => {
    const sim = makeSim();
    ride(sim);
    sim.castAbility(sim.meta(sim.playerId)!.known[0]!.def.id, sim.playerId);
    const down = sim.tick().find((e) => e.type === 'mountDown') as { reason: string } | undefined;
    expect(down?.reason).toBe('cast');
    expect(mounted(sim)).toBe(false);
  });

  it('restores normal run speed once the ride ends', () => {
    const sim = makeSim();
    ride(sim);
    const p = sim.entities.get(sim.playerId)!;
    expect(sim.moveSpeedMult(p)).toBeGreaterThan(1);
    sim.dismount(sim.playerId);
    expect(sim.moveSpeedMult(p)).toBe(1);
  });
});

describe('mounts: invariants', () => {
  it('adds no persisted field, so a pre-feature save round-trips unchanged', () => {
    const sim = makeSim();
    const before = JSON.stringify(sim.serializeCharacter(sim.playerId));
    ride(sim);
    const after = sim.serializeCharacter(sim.playerId)!;
    expect('mount' in after).toBe(false);
    expect('mounts' in after).toBe(false);
    expect('selectedMount' in after).toBe(false);
    // The only difference is the reins sitting in the bag, which is an ordinary
    // inventory slot: nothing about the RIDE is stored.
    expect(JSON.parse(before).inventory).toEqual(after.inventory);
  });

  it('draws ZERO rng', () => {
    const control = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    const ridden = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    ridden.addItem(MOUNT_ID, 1, ridden.playerId);
    ridden.useItem(MOUNT_ID, ridden.playerId);
    (ridden as unknown as { completeMountSummon: (...a: unknown[]) => void }).completeMountSummon(
      ridden.meta(ridden.playerId),
      ridden.entities.get(ridden.playerId),
    );
    ridden.dismount(ridden.playerId);
    const rngOf = (sim: Sim) => (sim as unknown as { rng: { next(): number } }).rng.next();
    expect(rngOf(ridden)).toBe(rngOf(control));
  });

  it('emits exactly the two pinned event names and no others', async () => {
    // TRAP 1 (docs/design/parity-backlog.md): names are compared as STRINGS
    // across the sim/UI seam, which tsc cannot check.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/sim/sim.ts', 'utf8');
    const emitted = new Set<string>();
    for (const m of src.matchAll(/type: '(mount[A-Za-z]*)'/g)) emitted.add(m[1]);
    expect([...emitted].sort()).toEqual(['mountDown', 'mountUp']);
  });
});
