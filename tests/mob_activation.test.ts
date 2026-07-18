// Mob AI activation radius: an idle open-world mob only runs full AI while a
// player is within MOB_AI_ACTIVATION_RADIUS (150 yd) or while it is engaged
// (combat, threat, target, flee, leash). Dormant mobs freeze in place but dead
// mobs keep ticking corpse/respawn timers, and the rule reads only
// deterministic sim state so every host activates the same mobs each tick.
import { describe, expect, it } from 'vitest';
import { DUNGEON_X_THRESHOLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { dist2d } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

function makeSim(cls: 'warrior' | 'mage' | 'rogue' = 'warrior', seed = 42) {
  return new Sim({ seed, playerClass: cls, autoEquip: true });
}

function nearestMob(sim: Sim, templateId?: string) {
  const p = sim.player;
  let best: any = null,
    bestD = Infinity;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    if (templateId && e.templateId !== templateId) continue;
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
  p.vx = 0;
  p.vz = 0;
  p.vy = 0;
  p.onGround = true;
  p.fallStartY = p.pos.y;
}

// A parking spot far outside every open-world camp but still on the open-world
// side of the instance band (x < DUNGEON_X_THRESHOLD = 600).
const FAR_X = -3000;
const FAR_Z = -3000;
// Idle wander re-rolls every 3 to 10 s and walking a leg takes seconds, so 40 s
// of ticks guarantees multiple wander legs for any active idle mob.
const WANDER_TICKS = 20 * 40;

function openWorldMobs(sim: Sim) {
  const out: any[] = [];
  for (const e of sim.entities.values()) {
    if (e.kind === 'mob' && !e.dead && e.ownerId === null && e.spawnPos.x < DUNGEON_X_THRESHOLD)
      out.push(e);
  }
  return out;
}

describe('mob AI activation radius', () => {
  it('far-away open-world mobs go dormant and do not wander', () => {
    const sim = makeSim();
    teleportTo(sim, FAR_X, FAR_Z);
    const far = openWorldMobs(sim).filter((m) => dist2d(m.pos, sim.player.pos) > 200);
    expect(far.length).toBeGreaterThan(50); // the whole open world is far from here
    const before = far.map((m) => ({ id: m.id, x: m.pos.x, z: m.pos.z }));
    for (let i = 0; i < WANDER_TICKS; i++) sim.tick();
    for (let i = 0; i < far.length; i++) {
      expect(far[i].pos.x).toBe(before[i].x);
      expect(far[i].pos.z).toBe(before[i].z);
      expect(far[i].aiState).toBe('idle');
    }
  });

  it('a mob near the player still wanders (and can aggro)', () => {
    const sim = makeSim();
    const m = nearestMob(sim);
    expect(m).toBeTruthy();
    expect(m.spawnPos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    // 30 yd: inside the 150 yd activation radius, outside the <=20 yd
    // proximity-aggro radius, so any movement is normal idle wander (or a
    // wander leg that drifted into aggro range, either proves it is active).
    teleportTo(sim, m.pos.x + 30, m.pos.z);
    const start = { x: m.pos.x, z: m.pos.z };
    let moved = false;
    for (let i = 0; i < WANDER_TICKS && !moved; i++) {
      sim.tick();
      moved = m.pos.x !== start.x || m.pos.z !== start.z;
    }
    expect(moved).toBe(true);
  });

  it('a mob killed far from every player still respawns', () => {
    const sim = makeSim();
    const m = nearestMob(sim);
    expect(m).toBeTruthy();
    (sim as any).dealDamage(sim.player, m, m.maxHp + 100, false, 'physical', null, 'hit', true);
    expect(m.dead).toBe(true);
    // Shorten the timers so the test does not sit through the full respawn.
    m.respawnTimer = 1;
    m.corpseTimer = 1;
    m.lootable = false;
    m.loot = null;
    teleportTo(sim, FAR_X, FAR_Z);
    expect(dist2d(m.pos, sim.player.pos)).toBeGreaterThan(1000);
    for (let i = 0; i < 20 * 3; i++) sim.tick();
    expect(m.dead).toBe(false);
    expect(m.hp).toBe(m.maxHp);
    expect(m.aiState).toBe('idle');
  });

  it('an engaged mob keeps running AI beyond the radius (threat covers bosses)', () => {
    const sim = makeSim();
    const m = nearestMob(sim);
    expect(m).toBeTruthy();
    teleportTo(sim, m.pos.x + 5, m.pos.z);
    // Non-lethal hit: dealDamage adds threat and aggros an idle mob, exactly
    // the state a kited boss is in. The mob must keep thinking while the
    // player is far away, resolve the leash, evade home, and settle idle,
    // never freeze mid-chase because nobody is nearby.
    (sim as any).dealDamage(sim.player, m, 1, false, 'physical', null, 'hit', true);
    expect(m.threat.size).toBeGreaterThan(0);
    teleportTo(sim, m.spawnPos.x + 500, m.spawnPos.z);
    for (let i = 0; i < 20 * 60; i++) sim.tick();
    expect(m.dead).toBe(false);
    expect(m.aiState).toBe('idle');
    expect(dist2d(m.pos, m.spawnPos)).toBeLessThan(20);
    expect(m.threat.size).toBe(0);
  });

  it('is deterministic: same seed and same scripted movement, identical world', () => {
    const run = () => {
      const sim = makeSim('warrior', 1234);
      // Scripted teleports exercise both edges: mobs waking as the player
      // arrives and going dormant as the player leaves.
      const script: Record<number, [number, number]> = {
        40: [120, 80],
        240: [FAR_X, FAR_Z],
        400: [120, 80],
      };
      for (let t = 0; t < 600; t++) {
        const hop = script[t];
        if (hop) teleportTo(sim, hop[0], hop[1]);
        sim.tick();
      }
      const out: [number, string, number, number, boolean][] = [];
      for (const e of sim.entities.values())
        if (e.kind === 'mob') out.push([e.id, e.templateId, e.pos.x, e.pos.z, e.dead]);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
