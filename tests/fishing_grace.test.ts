// The opening grace on the fishing reel arm.
//
// Any non-landed reel ends the session (that is deliberate; it is what stops a
// player mashing the rod through the whole cast). The cost is that a SECOND
// press the player never meant - a bag double-click, a held key's auto-repeat,
// a touch double-tap on a phone - silently burned the cast the instant the line
// hit the water. FISH_EARLY_REEL_GRACE_SEC swallows that press as an ordinary
// busy denial instead.
//
// The load-bearing property is the RELATIONSHIP, not the number: the grace must
// stay strictly under FISH_BITE_DELAY_MIN_SEC. While it is shorter, it can only
// ever swallow a press that was already guaranteed 'too_early'. At or past that
// bound it would start covering moments a fish could already be hooked, which
// is the reel-with-impunity exploit. That is asserted here, not just commented.

import { describe, expect, it } from 'vitest';

import {
  biteDelayMaxSec,
  biteScheduleTicks,
  earlyReelGraceEndTick,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_EARLY_REEL_GRACE_SEC,
  rollBiteSchedule,
} from '../src/sim/professions';
import { LAKE } from '../src/sim/data';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import { DT, FISHING_CAST_ID, type SimEvent } from '../src/sim/types';
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

function escaped(events: SimEvent[]): boolean {
  return events.some((e) => e.type === 'fishing' && e.phase === 'escaped');
}

describe('fishing: the early-reel grace constant', () => {
  it('stays STRICTLY under the earliest possible bite, or the exploit reopens', () => {
    expect(FISH_EARLY_REEL_GRACE_SEC).toBeGreaterThan(0);
    expect(FISH_EARLY_REEL_GRACE_SEC).toBeLessThan(FISH_BITE_DELAY_MIN_SEC);
  });

  it('holds for every rod tier: no rod can pull a bite into the grace window', () => {
    // biteDelayMaxSec only ever lowers the MAX, never the MIN, so this is the
    // full space of rods, present and future.
    for (let tier = 1; tier <= 8; tier++) {
      expect(biteDelayMaxSec(tier)).toBeGreaterThanOrEqual(FISH_BITE_DELAY_MIN_SEC);
      const rng = new Rng(tier * 7919);
      for (let i = 0; i < 200; i++) {
        const s = rollBiteSchedule(tier, rng);
        expect(s.biteAtSec).toBeGreaterThan(FISH_EARLY_REEL_GRACE_SEC);
      }
    }
  });

  it('the grace end tick always lands before the earliest bite tick', () => {
    for (const startTick of [0, 1, 17, 999]) {
      const graceEnd = earlyReelGraceEndTick(startTick, DT);
      expect(graceEnd).toBeGreaterThan(startTick);
      // never rounds out past its nominal length
      expect((graceEnd - startTick) * DT).toBeLessThanOrEqual(FISH_EARLY_REEL_GRACE_SEC);
      const rng = new Rng(startTick + 1);
      for (let i = 0; i < 200; i++) {
        const ticks = biteScheduleTicks(rollBiteSchedule(1, rng), startTick, DT);
        expect(graceEnd).toBeLessThan(ticks.biteAtTick);
      }
    }
  });
});

describe('fishing: a double-press does not burn the session', () => {
  it('denies an immediate re-press as busy and keeps the line in the water', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    expect(sim.player.castingAbility).toBe(FISHING_CAST_ID);
    const before = (sim.player as any).fishBiteTick as number;

    sim.events = [];
    sim.useItem(rodId); // the accidental second press, same tick
    const events = sim.tick();

    expect(escaped(events), 'the session must survive a double-press').toBe(false);
    expect(sim.player.castingAbility).toBe(FISHING_CAST_ID);
    // the hidden schedule is untouched: no re-roll, no reset
    expect((sim.player as any).fishBiteTick).toBe(before);
    expect(
      events.some((e) => e.type === 'error' && e.text === 'You are busy.'),
      'the re-press falls through to the ordinary busy denial',
    ).toBe(true);
  });

  it('draws nothing extra, so a double-press cannot shift the world rng stream', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    const before = (sim.rng as any).s;
    sim.useItem(rodId);
    sim.useItem(rodId);
    expect((sim.rng as any).s).toBe(before);
  });

  it('still ends the session on a real too-early reel once the grace has passed', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    const graceEnd = (sim.player as any).fishGraceUntilTick as number;
    const biteTick = (sim.player as any).fishBiteTick as number;
    expect(graceEnd).toBeLessThan(biteTick);

    while (sim.tickCount <= graceEnd) sim.tick();
    expect(sim.tickCount).toBeLessThan(biteTick);

    sim.events = [];
    sim.useItem(rodId);
    const events = sim.tick();
    expect(
      events.some((e) => e.type === 'fishing' && e.phase === 'escaped' && e.reason === 'too_early'),
    ).toBe(true);
    expect(sim.player.castingAbility).toBe(null);
  });

  it('clears the grace with the rest of the hidden session state', () => {
    const { sim, rodId } = angler();
    sim.useItem(rodId);
    expect((sim.player as any).fishGraceUntilTick).toBeTypeOf('number');
    while (sim.tickCount <= ((sim.player as any).fishGraceUntilTick as number)) sim.tick();
    sim.useItem(rodId); // too early: ends the session
    sim.tick();
    expect((sim.player as any).fishGraceUntilTick).toBeUndefined();
    expect((sim.player as any).fishBiteTick).toBeUndefined();
  });
});
