// Slain OPEN-WORLD boss adds must unravel with their corpse, never respawn in
// place (upstream levy-street/world-of-claudecraft 51b808721).
//
// Regression: spawnBossAdds anchors an add where it ERUPTS, which is wherever the
// fight was dragged (a kited rare hatches its wave in the middle of a road or a
// town). createMob therefore set the add's spawnPos to that eruption point, and
// the generic open-world respawn in updateMob revived it there forever: a corpse
// with no owning encounter left permanently seeded a brand-new spawn point, so
// every wave a kited boss fired grew the world population without bound.
//
// Instance adds are untouched: they already stay dead until the instance resets.

import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

// respawnSeconds: 1 keeps the (respawnSeconds * respawnMult) countdown well inside
// the 60s corpse window, so the corpse timer is the only thing gating the outcome.
function makeSim(seed = 7): AnySim {
  return new Sim({ seed, playerClass: 'warrior', noPlayer: true, respawnSeconds: 1 }) as AnySim;
}

// A live open-world summoner parked away from the camps, with a victim engaged so
// spawnBossAdds takes its normal aggro-seeding path.
function kitedBoss(sim: AnySim, pid: number): AnyEntity {
  const boss = createMob(910100, MOBS.grix_the_tunnelking, 7, { x: -140, y: 0, z: -140 });
  boss.pos.y = sim.groundPos(boss.pos.x, boss.pos.z).y;
  boss.prevPos = { ...boss.pos };
  boss.spawnPos = { ...boss.pos };
  sim.addEntity(boss);
  const p = sim.entities.get(pid) as AnyEntity;
  p.pos = { x: boss.pos.x + 4, y: boss.pos.y, z: boss.pos.z };
  p.prevPos = { ...p.pos };
  sim.rebucket(p);
  boss.aggroTargetId = pid;
  boss.inCombat = true;
  return boss;
}

function liveRats(sim: AnySim): AnyEntity[] {
  return [...sim.entities.values()].filter(
    (e: AnyEntity) => e.templateId === 'tunnel_rat' && !e.dead,
  ) as AnyEntity[];
}

function summonWave(sim: AnySim, boss: AnyEntity): AnyEntity[] {
  const before = new Set([...sim.entities.keys()]);
  (sim as any).spawnBossAdds(boss, 'tunnel_rat', 2);
  return [...sim.entities.values()].filter(
    (e: AnyEntity) => !before.has(e.id) && e.templateId === 'tunnel_rat',
  ) as AnyEntity[];
}

describe('open-world boss adds do not respawn where they were slain', () => {
  it('marks an erupted add as summoned and anchors it at the eruption point', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Kiter');
    const boss = kitedBoss(sim, pid);

    const adds = summonWave(sim, boss);
    expect(adds).toHaveLength(2);
    for (const add of adds) {
      expect(add.summonedAdd).toBe(true);
      // Anchored beside the kited boss, far from the tunnel_rat camps.
      expect(Math.hypot(add.spawnPos.x - boss.pos.x, add.spawnPos.z - boss.pos.z)).toBeLessThan(5);
      // Open world, not the far-east instance plane, so the generic respawn
      // applied to it before this fix.
      expect(add.spawnPos.x).toBeLessThan(600);
    }
  });

  it('drops a slain add once its corpse decays instead of reviving it in place', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Kiter');
    const boss = kitedBoss(sim, pid);
    const [add] = summonWave(sim, boss);
    const addId = add.id;
    const spot = { x: add.spawnPos.x, z: add.spawnPos.z };

    const killer = sim.entities.get(pid) as AnyEntity;
    killer.maxHp = killer.hp = 1_000_000;
    sim.dealDamage(killer, add, add.hp + 1000, false, 'physical', 'Finisher', 'hit', true);
    expect(add.dead).toBe(true);

    // The corpse survives its full loot window (60s), so nothing is yanked out
    // from under a player who is mid-loot.
    for (let t = 0; t < 20 * 30; t++) sim.tick();
    expect(sim.entities.has(addId)).toBe(true);
    expect(sim.entities.get(addId)!.dead).toBe(true);

    // Past the window it unravels entirely: no revived add, and no new tunnel_rat
    // standing at the eruption point.
    for (let t = 0; t < 20 * 40; t++) sim.tick();
    expect(sim.entities.has(addId)).toBe(false);
    for (const rat of liveRats(sim)) {
      expect(Math.hypot(rat.pos.x - spot.x, rat.pos.z - spot.z)).toBeGreaterThan(5);
    }
  });

  it('leaves an ordinary open-world mob respawning in place', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Kiter');
    const wild = createMob(910200, MOBS.tunnel_rat, 5, { x: -160, y: 0, z: -160 });
    wild.pos.y = sim.groundPos(wild.pos.x, wild.pos.z).y;
    wild.prevPos = { ...wild.pos };
    wild.spawnPos = { ...wild.pos };
    sim.addEntity(wild);
    expect(wild.summonedAdd).toBe(false);

    const killer = sim.entities.get(pid) as AnyEntity;
    killer.maxHp = killer.hp = 1_000_000;
    sim.dealDamage(killer, wild, wild.hp + 1000, false, 'physical', 'Finisher', 'hit', true);
    expect(wild.dead).toBe(true);

    for (let t = 0; t < 20 * 70; t++) sim.tick();
    expect(sim.entities.has(wild.id)).toBe(true);
    expect(sim.entities.get(wild.id)!.dead).toBe(false); // revived at its own camp
  });
});
