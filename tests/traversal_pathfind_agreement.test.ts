import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { interiorColliders, isBlocked, resolveMovement } from '../src/sim/colliders';
import { DUNGEON_LIST, instanceOrigin } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  BODY_RADIUS,
  isClearAt,
  MAX_CLIMB_SLOPE,
  MAX_STEP_HEIGHT,
  moveBody,
  RUN_STEP_PER_TICK,
} from '../src/sim/traversal';

// The AI and the player must share ONE notion of passable. `findPlayerPath`
// routes mobs and pets through `isBlocked`; the traversal core resolves what a
// body actually does. If those two disagree, the AI paths into geometry a
// player cannot cross, or refuses ground a player walks over every day.

const R = PLAYER_BODY_RADIUS;
const SEED = 20061;

/** Full-height movement tops: what the world's colliders mean today. */
const fullHeight = () => undefined;

describe('the traversal core and the router share one body', () => {
  it('uses the same radius and climb limit', () => {
    expect(BODY_RADIUS).toBe(PLAYER_BODY_RADIUS);
    expect(MAX_CLIMB_SLOPE).toBe(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('keeps step-up away from the heightfield, where it would out-climb the router', () => {
    // Applying a per-tick step allowance to terrain would be a cliff-climbing
    // ladder: a body covering RUN_SPEED * DT per tick would reach an effective
    // climb limit of stepHeight / (RUN_SPEED * DT), far past what the router
    // calls walkable. That ratio is the hazard, not the guarantee.
    expect(MAX_STEP_HEIGHT / RUN_STEP_PER_TICK).toBeGreaterThan(MAX_CLIMB_SLOPE);
    // The guarantee is that the solver cannot sample terrain at all: it takes
    // no heightfield argument and imports none. A future `groundHeight` import
    // in solver.ts re-opens the hazard, so it fails here.
    const src = readFileSync(fileURLToPath(new URL('../src/sim/traversal/solver.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/from '\.\.\/world'/);
    expect(src).not.toMatch(/groundHeight|terrainHeight|WATER_LEVEL/);
  });

  it('never raises a body onto a full-height blocker', () => {
    const wall = [{ type: 'obb', x: 3, z: 0, hw: 1, hd: 8, rot: 0 } as const];
    const res = moveBody({
      x: 0,
      z: 0,
      feetY: 0,
      dx: 9,
      dz: 0,
      radius: R,
      colliders: wall,
      topOf: fullHeight,
    });
    expect(res.steppedUp).toBe(false);
    expect(res.feetY).toBe(0);
    expect(res.hitWall).toBe(true);
  });
});

describe('clearance agrees with the collision the router consults', () => {
  const crypt = DUNGEON_LIST.find((d) => d.interior === 'crypt');
  const colliders = interiorColliders('crypt');

  it('finds a crypt interior to sample', () => {
    expect(crypt).toBeTruthy();
    expect(colliders.length).toBeGreaterThan(0);
  });

  it('matches isBlocked over the whole interior footprint', () => {
    const origin = instanceOrigin(crypt!.index, 0);
    let checked = 0;
    const disagreements: string[] = [];
    for (let lx = -30; lx <= 30; lx += 0.7) {
      for (let lz = -30; lz <= 30; lz += 0.7) {
        // Skip points sitting exactly ON a surface. `resolvePosition` reports
        // blocked through a 1e-4 displacement tolerance while this reports it
        // through a strict overlap, so a body tangent to a wall (real overlaps
        // of about 1e-14 show up on the crypt's grid-aligned walls) is called
        // clear there and overlapping here. Comparing at a slightly larger and
        // a slightly smaller body keeps the sample away from that edge.
        const clear = isClearAt(lx, lz, R, 0, colliders, fullHeight);
        if (clear !== isClearAt(lx, lz, R + 2e-3, 0, colliders, fullHeight)) continue;
        if (clear !== isClearAt(lx, lz, R - 2e-3, 0, colliders, fullHeight)) continue;
        checked++;
        const blocked = isBlocked(SEED, origin.x + lx, origin.z + lz, R);
        if (blocked === clear) disagreements.push(`(${lx.toFixed(2)}, ${lz.toFixed(2)})`);
      }
    }
    expect(checked).toBeGreaterThan(3000);
    expect(disagreements.slice(0, 10)).toEqual([]);
  });

  it('never resolves a move to a spot the router calls blocked', () => {
    const origin = instanceOrigin(crypt!.index, 0);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const res = moveBody({
        x: 0,
        z: 0,
        feetY: 0,
        dx: Math.sin(a) * 40,
        dz: Math.cos(a) * 40,
        radius: R,
        colliders,
        topOf: fullHeight,
      });
      expect(isClearAt(res.x, res.z, R, 0, colliders, fullHeight), `ray ${i}`).toBe(true);
      expect(isBlocked(SEED, origin.x + res.x, origin.z + res.z, R), `ray ${i}`).toBe(false);
    }
  });
});

describe('the new solver against the resolver it will replace', () => {
  const crypt = DUNGEON_LIST.find((d) => d.interior === 'crypt')!;
  const colliders = interiorColliders('crypt');

  it('reaches at least as far as resolveMovement and is never less clear', () => {
    // Not an equality: swept collision with real sliding is expected to get
    // FURTHER than the iterative push-out it replaces. What must hold is that
    // it never ends up somewhere the old resolver would call blocked, and never
    // gives up ground the old one covered.
    const origin = instanceOrigin(crypt.index, 0);
    let strictlyFurther = 0;
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const dx = Math.sin(a) * 40;
      const dz = Math.cos(a) * 40;
      const old = resolveMovement(SEED, origin.x, origin.z, origin.x + dx, origin.z + dz, R);
      const next = moveBody({
        x: 0,
        z: 0,
        feetY: 0,
        dx,
        dz,
        radius: R,
        colliders,
        topOf: fullHeight,
      });
      expect(isBlocked(SEED, origin.x + next.x, origin.z + next.z, R), `ray ${i}`).toBe(false);
      const oldTravel = Math.hypot(old.x - origin.x, old.z - origin.z);
      const newTravel = Math.hypot(next.x, next.z);
      expect(newTravel, `ray ${i}`).toBeGreaterThan(oldTravel - 0.02);
      if (newTravel > oldTravel + 0.02) strictlyFurther++;
    }
    // Sliding is the point; if nothing ever gets further, the solver is not
    // doing the thing it was built to do.
    expect(strictlyFurther).toBeGreaterThan(0);
  });
});
