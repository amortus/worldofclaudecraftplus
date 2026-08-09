import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BODY_EYE_HEIGHT,
  BODY_RADIUS,
  GRAVITY,
  GROUND_SNAP_BASE,
  JUMP_VELOCITY,
  MAX_CLIMB_SLOPE,
  MAX_STEP_HEIGHT,
  RUN_STEP_PER_TICK,
} from '../src/sim/traversal';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { DT, RUN_SPEED } from '../src/sim/types';

// The traversal core mirrors a handful of movement constants that are private
// to `sim.ts` (or that live behind imports which would make the traversal leaf
// depend on the whole collider/world graph). Mirrors rot silently, and a rotten
// mirror here means the traversal ladder is derived from numbers the sim no
// longer uses. So this file reads the REAL sources and fails on drift.
//
// Copying the pattern of tests/crafting_event_contract.test.ts: two modules
// that must agree on a value the type system cannot relate.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const simSrc = read('../src/sim/sim.ts');
const rendererSrc = read('../src/render/renderer.ts');

function num(src: string, re: RegExp, what: string): number {
  const m = src.match(re);
  expect(m, `could not find ${what}; the mirror in src/sim/traversal/ladder.ts is now unverifiable`).
    not.toBeNull();
  return Number(m![1]);
}

describe('traversal constants mirror the real movement constants', () => {
  it('matches GRAVITY and JUMP_VELOCITY in sim.ts', () => {
    expect(num(simSrc, /^const GRAVITY = ([\d.]+);/m, 'GRAVITY in sim.ts')).toBe(GRAVITY);
    expect(num(simSrc, /^const JUMP_VELOCITY = ([\d.]+);/m, 'JUMP_VELOCITY in sim.ts')).toBe(
      JUMP_VELOCITY,
    );
  });

  it('shares the ground-snap base sim.ts absorbs without falling', () => {
    // This used to parse the bare `0.4` literal out of sim.ts, because the two
    // numbers were separate values that could drift. The wiring step made them
    // ONE value: sim.ts imports GROUND_SNAP_BASE and builds maxStepDown from it,
    // so drift is now impossible by construction rather than caught after the
    // fact. What is left to check is that sim.ts really consumes the shared
    // constant and has not quietly gone back to a literal.
    expect(simSrc).toMatch(/import \{ GROUND_SNAP_BASE \} from '\.\/traversal';/);
    expect(simSrc).toMatch(/const maxStepDown = GROUND_SNAP_BASE \+ run \* MAX_CLIMB_SLOPE;/);
    // And the derivation itself: step up equals the step down a running body
    // already absorbs, so any lip you can walk off you can walk back up.
    expect(MAX_STEP_HEIGHT).toBe(GROUND_SNAP_BASE + RUN_SPEED * DT * PLAYER_MAX_CLIMB_SLOPE);
  });

  it('matches the body the router already uses', () => {
    expect(BODY_RADIUS).toBe(PLAYER_BODY_RADIUS);
    expect(MAX_CLIMB_SLOPE).toBe(PLAYER_MAX_CLIMB_SLOPE);
    expect(RUN_STEP_PER_TICK).toBe(RUN_SPEED * DT);
  });

  it('matches the eye pivot the renderer uses as the head', () => {
    // The one body-height number the sim side and the presentation side agree
    // on: the renderer passes feet + this to cameraOcclusion.
    expect(num(rendererSrc, /const eyeY = py \+ ([\d.]+);/, 'the eyeY pivot in renderer.ts')).toBe(
      BODY_EYE_HEIGHT,
    );
  });
});
