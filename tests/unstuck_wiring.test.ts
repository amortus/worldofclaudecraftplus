// Unstuck wiring: the seam between the pure `src/sim/unstuck.ts` state machine
// and the live Sim. The state machine itself is covered by unstuck.test.ts;
// everything here is about the WIRING — the command, the snapshot the Sim
// composes, the tick position, the respawn path on completion, and the
// determinism property (the whole system draws zero rng).

import { describe, expect, it } from 'vitest';
import { dungeonAt, zoneAt } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { DT, type SimEvent } from '../src/sim/types';
import {
  UNSTUCK_COOLDOWN_ID,
  UNSTUCK_COUNTDOWN_SECONDS,
  UNSTUCK_RETRY_COOLDOWN_SECONDS,
  UNSTUCK_SICKNESS_ID,
  UNSTUCK_SICKNESS_MIN_LEVEL,
  UNSTUCK_SUCCESS_COOLDOWN_SECONDS,
} from '../src/sim/unstuck';
import { terrainHeight } from '../src/sim/world';

/** A world with nothing alive in it, so nothing can interrupt a countdown. */
function quietSim(cls: 'warrior' = 'warrior', seed = 42) {
  const sim = new Sim({ seed, playerClass: cls });
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.pos.x += 10000;
    e.pos.z += 10000;
    e.prevPos = { ...e.pos };
    e.spawnPos = { ...e.pos };
  }
  // Out of the 5s post-combat window from the very first tick.
  sim.player.combatTimer = 99;
  sim.player.inCombat = false;
  return sim;
}

function stand(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.vx = p.vz = p.vy = 0;
  p.onGround = true;
  p.jumping = false;
  p.fallStartY = p.pos.y;
}

/** Tick the countdown to its resolution, collecting events. */
function runCountdown(sim: Sim, seconds = UNSTUCK_COUNTDOWN_SECONDS + 2): SimEvent[] {
  const out: SimEvent[] = [];
  const ticks = Math.ceil(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    out.push(...sim.tick());
    // The player is standing still: keep prevPos pinned so terrain settling
    // never reads as movement.
    sim.player.combatTimer = 99;
    if (!sim.meta(sim.playerId)!.pendingUnstuck) break;
  }
  return out;
}

describe('unstuck wiring: the command', () => {
  it('arms the countdown from /unstuck and stamps the retry cooldown', () => {
    const sim = quietSim();
    sim.events = [];
    sim.chat('/unstuck');
    const meta = sim.meta(sim.playerId)!;
    expect(meta.pendingUnstuck).not.toBe(null);
    expect(meta.pendingUnstuck!.endsAt).toBeCloseTo(sim.time + UNSTUCK_COUNTDOWN_SECONDS, 6);
    expect(sim.player.cooldowns.get(UNSTUCK_COOLDOWN_ID)).toBe(UNSTUCK_RETRY_COOLDOWN_SECONDS);
    expect(sim.events).toContainEqual(
      expect.objectContaining({
        type: 'unstuck',
        phase: 'started',
        seconds: UNSTUCK_COUNTDOWN_SECONDS,
      }),
    );
  });

  it('also answers to /stuck', () => {
    const sim = quietSim();
    sim.chat('/stuck');
    expect(sim.meta(sim.playerId)!.pendingUnstuck).not.toBe(null);
  });

  it('refuses a combat escape, text-free, and still stamps the retry cooldown', () => {
    const sim = quietSim();
    sim.player.inCombat = true;
    sim.events = [];
    sim.chat('/unstuck');
    expect(sim.meta(sim.playerId)!.pendingUnstuck).toBe(null);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'unstuck', phase: 'blocked', reason: 'combat' }),
    );
    expect(sim.player.cooldowns.get(UNSTUCK_COOLDOWN_ID)).toBe(UNSTUCK_RETRY_COOLDOWN_SECONDS);
  });

  it('never lets a spammer extend their own lockout', () => {
    const sim = quietSim();
    sim.player.cooldowns.set(UNSTUCK_COOLDOWN_ID, 4);
    sim.events = [];
    sim.chat('/unstuck');
    // The refusal IS the cooldown, so it must not be re-stamped to 15s.
    expect(sim.player.cooldowns.get(UNSTUCK_COOLDOWN_ID)).toBe(4);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'unstuck', phase: 'blocked', reason: 'cooldown', seconds: 4 }),
    );
  });
});

describe('unstuck wiring: the countdown', () => {
  it('announces once per second and completes at the graveyard', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    stand(sim, -40, 20);
    const origin = { ...sim.player.pos };
    sim.chat('/unstuck');
    const events = runCountdown(sim);

    const counts = events.filter((e) => e.type === 'unstuck' && e.phase === 'countdown');
    expect(counts).toHaveLength(UNSTUCK_COUNTDOWN_SECONDS - 1);
    expect((counts[0] as any).seconds).toBe(UNSTUCK_COUNTDOWN_SECONDS - 1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'unstuck',
        phase: 'completed',
        outcome: 'moved_to_graveyard',
      }),
    );

    // The destination rule is IDENTICAL to releaseSpirit's.
    const gy = zoneAt(dungeonAt(origin.x) ? dungeonAt(origin.x)!.doorPos.z : origin.z).graveyard;
    expect(sim.player.pos.x).toBeCloseTo(gy.x, 6);
    expect(sim.player.pos.z).toBeCloseTo(gy.z, 6);
    expect(sim.meta(sim.playerId)!.pendingUnstuck).toBe(null);
    expect(sim.player.cooldowns.get(UNSTUCK_COOLDOWN_ID)).toBeCloseTo(
      UNSTUCK_SUCCESS_COOLDOWN_SECONDS,
      1,
    );
  });

  it('never kills: a living player arrives alive with their pools', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    stand(sim, -40, 20);
    sim.player.hp = Math.floor(sim.player.maxHp * 0.2);
    sim.chat('/unstuck');
    runCountdown(sim);
    expect(sim.player.dead).toBe(false);
    // Alive in, alive out: the pool is neither zeroed (unstuck never kills) nor
    // refilled the way the death path refills it. Out-of-combat regen ticks
    // during the ten-second countdown, so only the bounds are asserted.
    expect(sim.player.hp).toBeGreaterThan(0);
    expect(sim.player.hp).toBeLessThan(sim.player.maxHp);
  });

  it('revives a corpse on arrival', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    stand(sim, -40, 20);
    sim.player.dead = true;
    sim.player.hp = 0;
    sim.chat('/unstuck');
    const events = runCountdown(sim);
    expect(sim.player.dead).toBe(false);
    expect(sim.player.hp).toBe(sim.player.maxHp);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'unstuck', outcome: 'revived_at_graveyard' }),
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'respawn' }));
  });

  it('applies Unstuck Sickness at level and waives it below the line', () => {
    const sick = quietSim();
    sick.setPlayerLevel(20);
    stand(sick, -40, 20);
    const baseStr = sick.player.stats.str;
    sick.chat('/unstuck');
    runCountdown(sick);
    const aura = sick.player.auras.find((a) => a.id === UNSTUCK_SICKNESS_ID);
    expect(aura).toBeTruthy();
    expect(aura!.value).toBeLessThan(0);
    // The debuff is folded into the derived stats, not just parked on the entity.
    expect(sick.player.stats.str).toBeLessThan(baseStr);
    expect(sick.player.stats.str).toBeGreaterThanOrEqual(1);

    const young = quietSim();
    young.setPlayerLevel(UNSTUCK_SICKNESS_MIN_LEVEL - 1);
    stand(young, -40, 20);
    young.chat('/unstuck');
    runCountdown(young);
    expect(young.player.auras.some((a) => a.id === UNSTUCK_SICKNESS_ID)).toBe(false);
  });

  it('cancels on movement, and the cancel is reported', () => {
    const sim = quietSim();
    stand(sim, -40, 20);
    sim.chat('/unstuck');
    sim.moveInput.forward = true;
    const events = sim.tick();
    expect(sim.meta(sim.playerId)!.pendingUnstuck).toBe(null);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'unstuck', phase: 'cancelled', reason: 'moved' }),
    );
  });

  it('cancels on damage taken', () => {
    const sim = quietSim();
    stand(sim, -40, 20);
    sim.chat('/unstuck');
    sim.tick();
    const source = [...sim.entities.values()].find((e) => e.kind === 'mob')!;
    (sim as any).dealDamage(source, sim.player, 1, false, 'physical', null, 'hit');
    const events = sim.tick();
    expect(sim.meta(sim.playerId)!.pendingUnstuck).toBe(null);
    const cancel = events.find((e) => e.type === 'unstuck' && e.phase === 'cancelled') as any;
    // 'damaged' or 'combat' — either is a correct refusal to be a combat escape.
    expect(['damaged', 'combat']).toContain(cancel.reason);
  });
});

describe('unstuck wiring: instanced content', () => {
  it('lands a delve player back at their module entrance, never out in the world', () => {
    // The module's graveyard rule cannot see delves (`dungeonAt` returns null for
    // the delve x-band), so without the wiring override an unstuck would be a
    // free escape from a failing run with the run still registered.
    const sim = quietSim();
    sim.setPlayerLevel(20);
    sim.enterDelve('collapsed_reliquary', 'normal');
    const run = (sim as any).delveRunForPlayer(sim.playerId);
    expect(run).toBeTruthy();
    const entry = (sim as any).delveModuleEntry(run);
    const p = sim.player;
    p.pos = { x: entry.x + 6, y: entry.y, z: entry.z + 6 };
    p.prevPos = { ...p.pos };
    p.onGround = true;
    p.combatTimer = 99;
    p.inCombat = false;

    sim.chat('/unstuck');
    expect(sim.meta(sim.playerId)!.pendingUnstuck).not.toBe(null);
    runCountdown(sim);

    expect(sim.player.pos.x).toBeCloseTo(entry.x, 6);
    expect(sim.player.pos.z).toBeCloseTo(entry.z, 6);
    // Still inside the delve band, and the run is untouched.
    expect(sim.player.pos.x).toBeGreaterThan(1000);
    expect((sim as any).delveRunForPlayer(sim.playerId)).toBe(run);
  });
});

describe('unstuck wiring: invariants', () => {
  it('draws ZERO rng across a whole successful attempt', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    stand(sim, -40, 20);
    // Warm the world past the world-gen draws, then measure only the attempt.
    sim.tick();
    const before = (sim as any).rng.s;
    sim.chat('/unstuck');
    runCountdown(sim);
    expect((sim as any).rng.s).toBe(before);
  });

  it('exposes the countdown on the IWorld seam and clears it on leave', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Ayla');
    for (const e of sim.entities.values()) {
      if (e.kind === 'mob') {
        e.dead = true;
        e.pos.x += 10000;
      }
    }
    const p = sim.entities.get(pid)!;
    p.combatTimer = 99;
    p.prevPos = { ...p.pos };
    expect(sim.unstuckCountdownFor(pid)).toBe(null);
    sim.startUnstuck(pid);
    expect(sim.unstuckCountdownFor(pid)).toBe(UNSTUCK_COUNTDOWN_SECONDS);
    sim.tick();
    expect(sim.unstuckCountdownFor(pid)).toBeLessThanOrEqual(UNSTUCK_COUNTDOWN_SECONDS);

    // A live attempt never survives the leave.
    sim.removePlayer(pid);
    expect(sim.unstuckCountdownFor(pid)).toBe(null);
  });
});
