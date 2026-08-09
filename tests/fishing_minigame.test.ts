// Fishing minigame wiring: the bite schedule, the hidden state it lives on, the
// reel arm, and the band ladder layered over the EXISTING startFishing /
// completeFishing. The pure mechanics are covered by professions_fishing; this
// file is about the seam, the anti-cheat property, and the compatibility pin.

import { describe, expect, it } from 'vitest';
import {
  FISHING_TABLES_BY_BAND,
  fishingTablesFor,
  GATHERING_MAX_SKILL,
  isFishingJunk,
} from '../src/sim/content/professions';
import { FISHING_TABLES, LAKE } from '../src/sim/data';
import { resolveFishingCatch } from '../src/sim/professions';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import { DT, FISHING_CAST_ID, FISHING_SESSION_CAP, type SimEvent } from '../src/sim/types';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';

const TEST_SWIM_DEPTH = 0.8;
const FISHING_TEST_DISTANCES = [4, 8, 12, 16, 20, 24];

function hasFishableWaterAhead(x: number, z: number, facing: number, seed: number): boolean {
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  return FISHING_TEST_DISTANCES.some(
    (d) => terrainHeight(x + sin * d, z + cos * d, seed) < WATER_LEVEL - TEST_SWIM_DEPTH,
  );
}

function mirrorLakeFishingSpot(seed: number) {
  for (let r = LAKE.radius * 0.7; r <= LAKE.radius * 1.8; r += 1) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const x = LAKE.x + Math.cos(a) * r;
      const z = LAKE.z + Math.sin(a) * r;
      if (terrainHeight(x, z, seed) < WATER_LEVEL) continue;
      const facing = Math.atan2(LAKE.x - x, LAKE.z - z);
      if (hasFishableWaterAhead(x, z, facing, seed)) return { x, z, facing };
    }
  }
  throw new Error('No dry Mirror Lake fishing spot found');
}

function angler(seed = 42, rodId = 'simple_fishing_pole') {
  const sim = new Sim({ seed, playerClass: 'warrior' });
  const spot = mirrorLakeFishingSpot(sim.cfg.seed);
  const p = sim.player;
  p.pos.x = spot.x;
  p.pos.z = spot.z;
  p.pos.y = terrainHeight(spot.x, spot.z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.onGround = true;
  p.facing = spot.facing;
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.pos.x += 10000;
    e.pos.z += 10000;
    e.prevPos = { ...e.pos };
    e.spawnPos = { ...e.pos };
  }
  sim.addItem(rodId, 1);
  sim.events = [];
  return { sim, rodId };
}

/** Cast, then tick until the bite cue fires. Returns the tick it fired on. */
function castAndWaitForBite(sim: Sim, rodId: string): number {
  sim.useItem(rodId);
  for (let i = 0; i < 20 * 15; i++) {
    const events = sim.tick();
    if (events.some((e) => e.type === 'fishing' && e.phase === 'bite')) return sim.tickCount;
  }
  throw new Error('the fish never bit');
}

describe('fishing minigame: the cast', () => {
  it('rolls the bite schedule with exactly ONE draw and hides it off the cast bar', () => {
    const { sim, rodId } = angler();
    const before = (sim as any).rng.s;
    sim.useItem(rodId);
    const after = (sim as any).rng.s;
    // One mulberry32 step is one addition of 0x6D2B79F5 (mod 2^32).
    expect((before + 0x6d2b79f5) >>> 0).toBe(after >>> 0);

    const p = sim.player as any;
    expect(p.fishBiteTick).toBeGreaterThan(sim.tickCount);
    expect(p.fishReelDeadlineTick).toBeGreaterThan(p.fishBiteTick);
    // ANTI-CHEAT: the broadcast cast fields must carry only the session cap, so
    // a client that reads them learns nothing about when the fish bites.
    expect(sim.player.castTotal).toBe(FISHING_SESSION_CAP);
    expect(sim.player.castRemaining).toBe(FISHING_SESSION_CAP);
    expect(sim.player.castTotal).not.toBe(p.fishBiteTick * DT);
  });

  it('refuses to cast without tackle, text-free and draw-free', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' });
    const spot = mirrorLakeFishingSpot(sim.cfg.seed);
    const p = sim.player;
    p.pos.x = spot.x;
    p.pos.z = spot.z;
    p.pos.y = terrainHeight(spot.x, spot.z, sim.cfg.seed);
    p.prevPos = { ...p.pos };
    p.facing = spot.facing;
    const meta = sim.meta(sim.playerId)!;
    sim.events = [];
    const before = (sim as any).rng.s;
    (sim as any).startFishing(p, meta); // empty bags
    expect((sim as any).rng.s).toBe(before);
    expect(p.castingAbility).toBe(null);
    expect(sim.events).toEqual([
      { type: 'fishing', phase: 'no_tackle', pid: sim.playerId },
    ]);
  });

  it('honours the rod tier when scheduling the bite', () => {
    // A tier-3 rod pulls the max delay from 8s down to 5s and widens the reel
    // window from 3s to 4.5s, so its whole schedule fits inside the tier-1 worst
    // case. Checked on the wired state, not the pure helper.
    for (const seed of [1, 7, 42, 99, 1234]) {
      const better = angler(seed, 'wyrmgut_fishing_rod');
      better.sim.useItem('wyrmgut_fishing_rod');
      const p = better.sim.player as any;
      const delaySec = (p.fishBiteTick - better.sim.tickCount) * DT;
      expect(delaySec).toBeGreaterThanOrEqual(3 - DT);
      expect(delaySec).toBeLessThanOrEqual(5 + DT);
      const windowSec = (p.fishReelDeadlineTick - p.fishBiteTick) * DT;
      expect(windowSec).toBeGreaterThanOrEqual(4.5 - DT);
    }
  });
});

describe('fishing minigame: the reel', () => {
  it('lands the catch when the reel falls inside the window', () => {
    const { sim, rodId } = angler();
    castAndWaitForBite(sim, rodId);
    const before = (sim as any).rng.s;
    sim.events = [];
    sim.useItem(rodId);
    // ONE more draw on a landed reel: the catch table.
    expect(((before + 0x6d2b79f5) >>> 0) >>> 0).toBe((sim as any).rng.s >>> 0);
    expect(sim.player.castingAbility).toBe(null);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'fishing', phase: 'landed' }),
    );
    expect(sim.events).toContainEqual(expect.objectContaining({ type: 'castStop', success: true }));
  });

  it('costs nothing but the schedule draw when the reel misses', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    // Past the opening double-press grace (FISH_EARLY_REEL_GRACE_SEC) but still
    // well short of the 3s minimum bite delay, so this is a genuine early reel.
    while (sim.tickCount <= ((sim.player as any).fishGraceUntilTick as number)) sim.tick();
    const before = (sim as any).rng.s;
    sim.events = [];
    sim.useItem(rodId); // far too early
    expect((sim as any).rng.s).toBe(before); // a miss makes NO catch draw
    expect(sim.player.castingAbility).toBe(null);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'fishing', phase: 'escaped', reason: 'too_early' }),
    );
  });

  it('clears the hidden schedule on every exit path', () => {
    for (const exit of ['reel', 'move', 'timeout'] as const) {
      const { sim, rodId } = angler();
      if (exit === 'reel') {
        castAndWaitForBite(sim, rodId);
        sim.useItem(rodId);
      } else if (exit === 'move') {
        sim.useItem(rodId);
        sim.moveInput.forward = true;
        sim.tick();
      } else {
        sim.useItem(rodId);
        for (let i = 0; i < 20 * 15 && sim.player.castingAbility; i++) sim.tick();
      }
      const p = sim.player as any;
      expect(p.castingAbility, exit).toBe(null);
      expect(p.fishBiteTick, exit).toBeUndefined();
      expect(p.fishReelDeadlineTick, exit).toBeUndefined();
    }
  });

  it('fires the got-away one tick past the deadline, not at the session cap', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    const deadline = (sim.player as any).fishReelDeadlineTick as number;
    const events: SimEvent[] = [];
    for (let i = 0; i < 20 * 15 && sim.player.castingAbility; i++) events.push(...sim.tick());
    expect(sim.tickCount).toBe(deadline + 1);
    expect(sim.tickCount * DT).toBeLessThan(FISHING_SESSION_CAP);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'fishing', phase: 'escaped', reason: 'too_late' }),
    );
  });

  it('re-pressing the rod reels instead of eating the busy guard', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    // Only the opening grace window denies a re-press as busy; once it closes,
    // the reel arm outranks the busy guard again, which is the property this
    // case exists for. See tests/fishing_grace.test.ts for the grace itself.
    while (sim.tickCount <= ((sim.player as any).fishGraceUntilTick as number)) sim.tick();
    sim.events = [];
    sim.useItem(rodId);
    expect(sim.events.some((e) => e.type === 'error' && e.text === 'You are busy.')).toBe(false);
    expect(sim.player.castingAbility).not.toBe(FISHING_CAST_ID);
  });

  it('still reels a line already in the water after combat or swimming flags you', () => {
    // The start gates must not strand a session that is already running: a
    // groupmate's pull can flag you mid-cast, and you must still be able to reel.
    for (const flag of ['combat', 'swimming'] as const) {
      const { sim, rodId } = angler();
      castAndWaitForBite(sim, rodId);
      if (flag === 'combat') sim.player.inCombat = true;
      else sim.player.pos.y = -50; // under the waterline
      sim.events = [];
      sim.useItem(rodId);
      expect(sim.player.castingAbility, flag).toBe(null);
      expect(sim.events, flag).toContainEqual(
        expect.objectContaining({ type: 'fishing', phase: 'landed' }),
      );
    }
  });
});

describe('fishing minigame: the catch ladder', () => {
  it('BAND 0 IS THE SHIPPED TABLE, so a fresh character catches what it always did', () => {
    // The compatibility pin: adding the ladder must not be a stealth rebalance.
    for (const zoneId of ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']) {
      expect(FISHING_TABLES_BY_BAND[zoneId][0]).toEqual(FISHING_TABLES[zoneId]);
    }
  });

  it('a fresh character rolls byte-identically to the pre-ladder roll', () => {
    // THE COMPATIBILITY PIN. Replay the OLD single-table implementation against
    // one seeded stream and the wired band resolver against an identical stream,
    // then compare catch for catch: at proficiency 0 (and a tier-1 pole, which
    // caps the band at 0 anyway) they must agree on every single draw.
    for (const zoneId of ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']) {
      const legacyRng = new Rng(7);
      const wiredRng = new Rng(7);
      const table = FISHING_TABLES[zoneId];
      const total = table.reduce((sum, e) => sum + e.weight, 0);
      for (let i = 0; i < 500; i++) {
        let roll = legacyRng.next() * total;
        let legacy: string | null = null;
        for (const entry of table) {
          roll -= entry.weight;
          if (roll < 0) {
            legacy = entry.itemId;
            break;
          }
        }
        const wired = resolveFishingCatch(
          {
            tables: fishingTablesFor(zoneId),
            waterTier: 1,
            proficiency: 0,
            maxSkill: GATHERING_MAX_SKILL.fishing,
            rodTier: 1,
            isJunk: isFishingJunk,
          },
          wiredRng,
        );
        expect(wired.band, `${zoneId} cast ${i}`).toBe(0);
        expect(wired.itemId, `${zoneId} cast ${i}`).toBe(legacy);
      }
    }
  });

  it('a fresh character fishes off band 0 through the wired path', () => {
    const { sim } = angler();
    const meta = sim.meta(sim.playerId)!;
    expect(meta.gathering.fishing).toBe(0);
    // Everything a fresh Vale angler can pull is on the shipped table.
    const shipped = new Set(FISHING_TABLES.eastbrook_vale.map((e) => e.itemId).filter(Boolean));
    for (let i = 0; i < 200; i++) (sim as any).completeFishing(sim.player, meta);
    for (const slot of meta.inventory) {
      if (slot.itemId === 'simple_fishing_pole') continue;
      expect(shipped.has(slot.itemId), slot.itemId).toBe(true);
    }
  });

  it('grants fishing proficiency and announces it, capped at 200', () => {
    const { sim } = angler();
    const meta = sim.meta(sim.playerId)!;
    sim.events = [];
    for (let i = 0; i < 40; i++) (sim as any).completeFishing(sim.player, meta);
    expect(meta.gathering.fishing).toBeGreaterThan(0);
    expect(meta.gathering.fishing).toBeLessThanOrEqual(GATHERING_MAX_SKILL.fishing);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'professionSkill', professionId: 'fishing' }),
    );

    meta.gathering.fishing = GATHERING_MAX_SKILL.fishing;
    sim.events = [];
    for (let i = 0; i < 20; i++) (sim as any).completeFishing(sim.player, meta);
    expect(meta.gathering.fishing).toBe(GATHERING_MAX_SKILL.fishing);
    expect(sim.events.some((e) => e.type === 'professionSkill')).toBe(false);
  });

  it('persists fishing proficiency through a save/load round trip', () => {
    const { sim } = angler();
    const meta = sim.meta(sim.playerId)!;
    meta.gathering.fishing = 63;
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect(saved.gatheringProficiency).toEqual({ fishing: 63 });
    const reloaded = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = reloaded.addPlayer('warrior', 'Angler', { state: saved });
    expect(reloaded.meta(pid)!.gathering.fishing).toBe(63);
  });
});
