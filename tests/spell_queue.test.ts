// Spell queueing: pressing your next ability inside the tail of an in-progress cast
// queues it to fire the instant that cast lands, instead of eating a "You are busy."
// error and a dropped global.
//
// The dangerous half is the negative space. Several paths force-clear castingAbility
// WITHOUT going through cancelCast (death, the Nythraxis ward channel, the arena/fiesta
// resets), and each has to drop the queue by hand. Miss one and the player fires a
// phantom spell off the back of a cast that never completed, so every one of those
// paths is pinned below.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { CAST_QUEUE_WINDOW_SEC, dist2d, FISHING_CAST_ID } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const makeSim = (cls: 'mage' = 'mage', seed = 42) =>
  new Sim({ seed, playerClass: cls, autoEquip: true });

function nearestMob(sim: Sim, templateId: string) {
  const p = sim.player;
  let best: any = null;
  let bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead || e.templateId !== templateId) continue;
    const d = dist2d(p.pos, e.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function teleportTo(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

/** A mage parked next to a wolf, facing it, one tick into a fireball. */
function castingMage() {
  const sim = makeSim();
  sim.setPlayerLevel(8); // frostbolt is learnLevel 4: a level-1 mage would not know it
  const wolf = nearestMob(sim, 'forest_wolf');
  teleportTo(sim, wolf.pos.x + 15, wolf.pos.z);
  sim.targetEntity(wolf.id);
  const p = sim.player;
  p.facing = Math.atan2(wolf.pos.x - p.pos.x, wolf.pos.z - p.pos.z);
  // A level-8 mage one-shots a forest wolf, and a queued spell is re-validated on fire,
  // so a dead target would reject it for the wrong reason. Give the wolf enough health
  // to survive the fireball; the dead-target path gets its own test below.
  wolf.maxHp = 100_000;
  wolf.hp = 100_000;
  sim.castAbility('fireball');
  expect(p.castingAbility).toBe('fireball');
  return { sim, p, wolf };
}

/**
 * Tick until the running cast is inside the queue window, the way a player gets there.
 * Deliberately NOT done by writing castRemaining directly: the cast and the global
 * cooldown run in lockstep (both 1.5s), and firing a queued spell depends on the gcd
 * having drained by the time the cast lands. Forcing one without the other would test
 * a state the game never produces and hide that interaction.
 */
function tickIntoWindow(sim: Sim, p: { castRemaining: number }) {
  for (let i = 0; i < 20 * 5; i++) {
    if (p.castRemaining > 0 && p.castRemaining <= CAST_QUEUE_WINDOW_SEC) return;
    sim.tick();
  }
  throw new Error('cast never reached the queue window');
}

describe('spell queueing', () => {
  it('queues the next ability pressed inside the tail of a cast', () => {
    const { sim, p } = castingMage();
    tickIntoWindow(sim, p);
    sim.events = [];
    sim.castAbility('frostbolt');

    expect(p.queuedCastAbility).toBe('frostbolt');
    expect(p.castingAbility).toBe('fireball'); // the running cast is untouched
    expect(sim.events.some((e) => e.type === 'error')).toBe(false); // no "You are busy."
  });

  it('still rejects a press made before the window opens', () => {
    const { sim, p } = castingMage(); // fresh cast: ~1.5s left, well outside the window
    sim.events = [];
    sim.castAbility('frostbolt');

    expect(p.queuedCastAbility).toBeNull();
    expect(sim.events.some((e) => e.type === 'error')).toBe(true);
  });

  it('fires the queued ability the moment the cast lands', () => {
    const { sim, p } = castingMage();
    tickIntoWindow(sim, p);
    sim.castAbility('frostbolt');
    for (let i = 0; i < 20 * 2; i++) {
      sim.tick();
      if (p.castingAbility === 'frostbolt') break;
    }
    expect(p.castingAbility).toBe('frostbolt'); // fireball landed, frostbolt took over
    expect(p.queuedCastAbility).toBeNull(); // one-shot: consumed, not repeated
  });

  it('re-validates on fire: a spell queued onto a target the cast killed is dropped', () => {
    const { sim, p, wolf } = castingMage();
    wolf.maxHp = 1; // this fireball will kill it
    wolf.hp = 1;
    tickIntoWindow(sim, p);
    sim.castAbility('frostbolt');
    expect(p.queuedCastAbility).toBe('frostbolt');

    for (let i = 0; i < 20 * 2 && !wolf.dead; i++) sim.tick();

    expect(wolf.dead).toBe(true);
    expect(p.queuedCastAbility).toBeNull(); // consumed
    expect(p.castingAbility).toBeNull(); // but rejected: no cast at a corpse
  });

  // ---- the phantom-cast guards: every force-clear path must drop the queue ----

  it('drops the queue when the cast is cancelled (stun)', () => {
    const { sim, p } = castingMage();
    tickIntoWindow(sim, p);
    sim.castAbility('frostbolt');
    expect(p.queuedCastAbility).toBe('frostbolt');

    p.auras.push({
      id: 'test_stun',
      name: 'Test Stun',
      kind: 'stun',
      remaining: 3,
      duration: 3,
      value: 0,
      school: 'physical',
    } as any);
    for (let i = 0; i < 5; i++) sim.tick();

    expect(p.castingAbility).toBeNull();
    expect(p.queuedCastAbility).toBeNull(); // never fires off an interrupted cast
  });

  it('drops the queue on death', () => {
    const { sim, p } = castingMage();
    tickIntoWindow(sim, p);
    sim.castAbility('frostbolt');
    expect(p.queuedCastAbility).toBe('frostbolt');

    (sim as any).handleDeath(p, null);

    expect(p.queuedCastAbility).toBeNull();
    for (let i = 0; i < 20; i++) sim.tick();
    expect(p.castingAbility).toBeNull(); // no phantom cast from the corpse
  });

  it('drops the queue when the Nythraxis ward channel is force-cleared', () => {
    const { sim, p } = castingMage();
    // stand in for the ward channel: that clear path bypasses cancelCast entirely
    p.castingAbility = 'nythraxis_ward_channel';
    p.channeling = true;
    p.queuedCastAbility = 'frostbolt';

    (sim as any).clearNythraxisWardChannelCast(p);

    expect(p.castingAbility).toBeNull();
    expect(p.queuedCastAbility).toBeNull();
  });

  it('does not queue behind the fishing cast (not a spell)', () => {
    const { sim, p } = castingMage();
    tickIntoWindow(sim, p);
    p.castingAbility = FISHING_CAST_ID;
    sim.events = [];
    sim.castAbility('frostbolt');

    expect(p.queuedCastAbility).toBeNull();
    expect(sim.events.some((e) => e.type === 'error')).toBe(true);
  });
});
