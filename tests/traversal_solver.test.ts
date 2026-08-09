import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import {
  BODY_RADIUS,
  floorHeightAt,
  isClearAt,
  MAX_STEP_HEIGHT,
  moveBody,
  overlapCollider,
  supportTopAt,
  type TraversalMoveResult,
  sweepCollider,
} from '../src/sim/traversal';

// The solver half of the traversal core: swept collision, multi-pass sliding,
// depenetration and step-up. Synthetic collider sets only, so every assertion
// is about the math and not about whatever the world seed happens to contain.

const R = BODY_RADIUS;

function box(x: number, z: number, hw: number, hd: number, rot = 0): Collider {
  return { type: 'obb', x, z, hw, hd, rot };
}
function circle(x: number, z: number, r: number): Collider {
  return { type: 'circle', x, z, r };
}

/** A collider set plus the movement-top lookup the solver needs. */
function scene(entries: [Collider, number | undefined][]) {
  const tops = new Map<Collider, number | undefined>(entries);
  return {
    colliders: entries.map((e) => e[0]),
    topOf: (c: Collider) => tops.get(c),
  };
}

function solve(
  s: ReturnType<typeof scene>,
  x: number,
  z: number,
  dx: number,
  dz: number,
  feetY = 0,
  airborne = false,
): TraversalMoveResult {
  return moveBody({
    x,
    z,
    feetY,
    dx,
    dz,
    radius: R,
    colliders: s.colliders,
    topOf: s.topOf,
    airborne,
  });
}

describe('swept collision', () => {
  it('moves the full distance over open ground and costs nothing', () => {
    const s = scene([[circle(50, 50, 1), undefined]]);
    const res = solve(s, 0, 0, 0.35, 0);
    expect(res.x).toBeCloseTo(0.35, 12);
    expect(res.z).toBeCloseTo(0, 12);
    expect(res.hitWall).toBe(false);
    expect(res.sweeps).toBe(0); // the reach reject drops the far collider
  });

  it('stops in front of a full-height wall instead of entering it', () => {
    const s = scene([[box(3, 0, 0.5, 5), undefined]]);
    const res = solve(s, 0, 0, 5, 0);
    expect(res.hitWall).toBe(true);
    expect(res.steppedUp).toBe(false);
    // Wall near face at x = 2.5, body radius 0.5, so the centre stops at 2.0.
    expect(res.x).toBeLessThanOrEqual(2.0);
    expect(res.x).toBeGreaterThan(1.9);
    expect(isClearAt(res.x, res.z, R, 0, s.colliders, s.topOf)).toBe(true);
  });

  it('does not tunnel through a thin wall at any speed', () => {
    const s = scene([[box(3, 0, 0.05, 20), undefined]]);
    for (const speed of [1, 5, 20, 200]) {
      const res = solve(s, 0, 0, speed, 0);
      // Wall near face at x = 2.95, body radius 0.5: the centre may reach 2.45.
      expect(res.x, `speed ${speed}`).toBeLessThanOrEqual(2.45);
      expect(isClearAt(res.x, res.z, R, 0, s.colliders, s.topOf)).toBe(true);
    }
  });

  it('slides along a wall rather than sticking to it', () => {
    const s = scene([[box(3, 0, 0.5, 40), undefined]]);
    // 45 degrees into the wall: the into-wall half is cancelled, the along-wall
    // half survives.
    const res = solve(s, 0, 0, 2, 2);
    expect(res.hitWall).toBe(true);
    expect(res.z).toBeGreaterThan(0.5); // travelled along the face
    expect(res.x).toBeLessThanOrEqual(2.0);
    expect(isClearAt(res.x, res.z, R, 0, s.colliders, s.topOf)).toBe(true);
  });

  it('slides out of a corner instead of locking in it', () => {
    const s = scene([
      [box(3, 0, 0.5, 40), undefined],
      [box(0, 3, 40, 0.5), undefined],
    ]);
    const res = solve(s, 0, 0, 3, 3);
    // Both walls block the diagonal; the body still ends clear, not wedged
    // inside either.
    expect(isClearAt(res.x, res.z, R, 0, s.colliders, s.topOf)).toBe(true);
    expect(res.x).toBeLessThanOrEqual(2.0);
    expect(res.z).toBeLessThanOrEqual(2.0);
  });

  it('rounds OBB corners so a body cannot catch on a phantom square edge', () => {
    const c = box(0, 0, 1, 1); // inflated extents 1.5, corner at (1, -1)
    const hit = { t: 0, nx: 0, nz: 0 };
    // Pass the corner at x = 1.4, which is outside the box (hw = 1) but inside
    // the inflated slab (ex = 1.5). The raw slab test enters at z = -1.5
    // (t = 0.25); the true rounded shape is only touched at z = -1.3
    // (t = 0.2833). Deleting the corner branch makes this fail.
    expect(sweepCollider(c, 1.4, -3, 0, 6, R, hit)).toBe(true);
    expect(hit.t).toBeCloseTo((-1.3 + 3) / 6, 9);
    expect(hit.t).toBeGreaterThan(0.25);
    // The normal points away from the corner, not along a face axis.
    expect(Math.abs(hit.nx)).toBeGreaterThan(0.5);
    expect(Math.abs(hit.nz)).toBeGreaterThan(0.5);
    expect(Math.hypot(hit.nx, hit.nz)).toBeCloseTo(1, 9);
    // Well clear of the corner: no hit at all.
    expect(sweepCollider(c, 1.6, -3, 0, 6, R, hit)).toBe(false);
  });
});

describe('depenetration', () => {
  it('pushes a body that starts inside a circle back to its surface', () => {
    const s = scene([[circle(0, 0, 2), undefined]]);
    const res = solve(s, 0.3, 0.1, 0, 0);
    expect(res.depenetrated).toBe(true);
    const d = Math.hypot(res.x, res.z);
    // Freed to the surface plus one skin, so the next tick's sweep does not
    // start exactly on it.
    expect(d).toBeGreaterThanOrEqual(2 + R);
    expect(d).toBeLessThan(2 + R + 0.02);
  });

  it('lets a trapped body move OUT while it is still overlapping', () => {
    // A t = 0 contact must not have its escape component projected away, or
    // depenetration and the slide fight each other and pin the body.
    const s = scene([[circle(0, 0, 2), undefined]]);
    const res = solve(s, 1.0, 0, 0.4, 0);
    expect(res.x).toBeGreaterThan(2 + R);
  });

  it('pushes a body out of a box along the shallowest axis', () => {
    const s = scene([[box(0, 0, 4, 0.5), undefined]]);
    const res = solve(s, 0, 0.2, 0, 0);
    expect(res.depenetrated).toBe(true);
    expect(res.z).toBeGreaterThanOrEqual(0.5 + R);
    expect(Math.abs(res.x)).toBeLessThan(1e-6);
  });

  it('leaves a body that is exactly touching alone', () => {
    const s = scene([[circle(0, 0, 2), undefined]]);
    const push = { nx: 0, nz: 0, depth: 0 };
    expect(overlapCollider(s.colliders[0], 2 + R, 0, R, push)).toBe(false);
  });
});

describe('step up', () => {
  const lip = (top: number) => scene([[box(3, 0, 1, 5), top]]);

  it('strides onto a low lip and ends supported on it', () => {
    const s = lip(0.5);
    const res = solve(s, 0, 0, 1.5, 0);
    expect(res.steppedUp).toBe(true);
    expect(res.feetY).toBeCloseTo(0.5, 12);
    // Supported means the body's CENTRE is over the surface, not merely
    // touching it: a body raised at the contact point falls straight back off.
    expect(supportTopAt(res.x, res.z, s.colliders, s.topOf, res.feetY + 1e-3)).toBeCloseTo(0.5, 12);
  });

  it('strides onto the tallest lip the ladder allows and refuses the next one', () => {
    const okay = solve(lip(MAX_STEP_HEIGHT), 0, 0, 1.5, 0);
    expect(okay.steppedUp).toBe(true);
    expect(okay.feetY).toBeCloseTo(MAX_STEP_HEIGHT, 12);

    const tooTall = solve(lip(MAX_STEP_HEIGHT + 0.05), 0, 0, 1.5, 0);
    expect(tooTall.steppedUp).toBe(false);
    expect(tooTall.feetY).toBe(0);
    expect(tooTall.hitWall).toBe(true);
  });

  it('steps up at every approach angle, not only head on', () => {
    // Probing along the motion instead of the contact normal makes the budget
    // radius / cos(approach) and quietly turns a curb into a wall past about
    // twenty degrees. A long lip so the diagonal cannot simply walk around it.
    for (const deg of [0, 15, 30, 45, 60, 75]) {
      const a = (deg * Math.PI) / 180;
      const s = scene([[box(3, 0, 1, 60), 0.5]]);
      let x = 0;
      let z = 0;
      let feetY = 0;
      let stepped = false;
      for (let tick = 0; tick < 60 && !stepped; tick++) {
        const res = moveBody({
          x,
          z,
          feetY,
          dx: Math.cos(a) * 0.35,
          dz: Math.sin(a) * 0.35,
          radius: R,
          colliders: s.colliders,
          topOf: s.topOf,
        });
        x = res.x;
        z = res.z;
        feetY = res.feetY;
        stepped = res.steppedUp;
      }
      expect(stepped, `${deg} degrees`).toBe(true);
      expect(feetY).toBeCloseTo(0.5, 12);
    }
  });

  it('slides along a lip it is running parallel to instead of hopping onto it', () => {
    const s = scene([[box(3, 0, 1, 60), 0.5]]);
    const res = solve(s, 1.99, 0, 0, 0.35);
    expect(res.steppedUp).toBe(false);
    expect(res.z).toBeCloseTo(0.35, 12);
  });

  it('gains at most one body radius of free distance, once per tick', () => {
    const s = scene([[box(3, 0, 1, 60), 0.5]]);
    const asked = 0.35;
    const res = solve(s, 1.8, 0, asked, 0);
    expect(res.steppedUp).toBe(true);
    // A commit is a positional correction, not a speed burst: bounded by the
    // requested motion plus one radius of normal travel, and it happens once.
    expect(res.x - 1.8).toBeLessThanOrEqual(asked + R + 4 * 0.01 + 1e-9);
  });

  it('steps up at a crawl, not only at a run', () => {
    // The commit is what makes this work: a slow mover contacts the lip with
    // almost no motion left and would otherwise be raised, unsupported, and
    // ejected on the next tick.
    for (const speed of [0.05, 0.1, 0.2, 0.35]) {
      const s = lip(0.5);
      let x = 0;
      let feetY = 0;
      let stepped = false;
      for (let tick = 0; tick < 200 && !stepped; tick++) {
        const res = moveBody({
          x,
          z: 0,
          feetY,
          dx: speed,
          dz: 0,
          radius: R,
          colliders: s.colliders,
          topOf: s.topOf,
        });
        x = res.x;
        feetY = res.feetY;
        stepped = res.steppedUp;
      }
      expect(stepped, `speed ${speed}`).toBe(true);
      expect(feetY).toBeCloseTo(0.5, 12);
    }
  });

  it('never steps onto a full-height blocker, however the ladder is tuned', () => {
    const s = scene([[box(3, 0, 1, 5), undefined]]);
    const res = solve(s, 0, 0, 5, 0);
    expect(res.steppedUp).toBe(false);
    expect(res.feetY).toBe(0);
  });

  it('abandons the step and slides when the landing spot is occupied', () => {
    // A low lip whose top the body could stride onto, with a full-height
    // blocker standing exactly where the body would have to land.
    const s = scene([
      [box(2, 0, 1, 5), 0.5], // near face x = 1.0, contact at x = 0.5
      [box(2, 0, 0.5, 5), undefined], // near face x = 1.5, inflated to x = 1.0
    ]);
    const res = solve(s, 0, 0, 3, 0);
    expect(res.steppedUp).toBe(false);
    expect(res.feetY).toBe(0);
    expect(res.hitWall).toBe(true);
    expect(isClearAt(res.x, res.z, R, 0, s.colliders, s.topOf)).toBe(true);
  });
});

describe('airborne mantle', () => {
  it('passes straight over a top within the mantle reach', () => {
    const s = scene([[box(3, 0, 1, 5), 0.9]]);
    const res = solve(s, 0, 0, 5, 0, 0, true);
    expect(res.x).toBeCloseTo(5, 12);
    expect(res.hitWall).toBe(false);
    expect(res.steppedUp).toBe(false); // airborne bodies mantle, they do not step
  });

  it('is still blocked by a top above the mantle reach', () => {
    const s = scene([[box(3, 0, 1, 5), 1.6]]);
    const res = solve(s, 0, 0, 5, 0, 0, true);
    expect(res.hitWall).toBe(true);
    expect(res.x).toBeLessThanOrEqual(1.5);
  });
});

describe('floor queries', () => {
  it('raises the floor onto a standable top the body is over', () => {
    const s = scene([[box(0, 0, 2, 2), 1.2]]);
    expect(floorHeightAt(0, 0, 0.3, s.colliders, s.topOf, 2)).toBeCloseTo(1.2, 12);
    // Outside the footprint the heightfield wins.
    expect(floorHeightAt(9, 0, 0.3, s.colliders, s.topOf, 2)).toBeCloseTo(0.3, 12);
    // A top above the allowance is not a floor this body can be seated on.
    expect(floorHeightAt(0, 0, 0.3, s.colliders, s.topOf, 1.0)).toBeCloseTo(0.3, 12);
  });

  it('never treats a full-height blocker as a floor', () => {
    const s = scene([[box(0, 0, 2, 2), undefined]]);
    expect(supportTopAt(0, 0, s.colliders, s.topOf, Infinity)).toBe(-Infinity);
  });
});

describe('solver determinism', () => {
  it('returns bit-identical results for identical inputs', () => {
    const s = scene([
      [box(3, 0, 0.5, 40), undefined],
      [circle(1.2, 1.4, 0.7), 0.5],
      [box(-2, 2, 1, 1, 0.7), 1.9],
    ]);
    const run = () => {
      const out: number[] = [];
      let x = -4;
      let z = -1;
      let feetY = 0;
      for (let tick = 0; tick < 60; tick++) {
        const res = moveBody({
          x,
          z,
          feetY,
          dx: 0.31,
          dz: 0.17,
          radius: R,
          colliders: s.colliders,
          topOf: s.topOf,
        });
        x = res.x;
        z = res.z;
        feetY = res.feetY;
        out.push(x, z, feetY);
      }
      return out;
    };
    const a = run();
    const b = run();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) expect(Object.is(a[i], b[i]), `index ${i}`).toBe(true);
  });

  it('does not depend on a caller-supplied result object being fresh', () => {
    const s = scene([[box(3, 0, 0.5, 40), undefined]]);
    const reused: TraversalMoveResult = {
      x: 99,
      z: 99,
      feetY: 99,
      hitWall: true,
      steppedUp: true,
      depenetrated: true,
      passes: 7,
      sweeps: 7,
      overlaps: 7,
    };
    const params = {
      x: 0,
      z: 0,
      feetY: 0,
      dx: 0.4,
      dz: 0.2,
      radius: R,
      colliders: s.colliders,
      topOf: s.topOf,
    };
    const fresh = moveBody(params);
    const recycled = moveBody(params, reused);
    for (const key of Object.keys(fresh) as (keyof TraversalMoveResult)[]) {
      expect(Object.is(fresh[key], recycled[key]), key).toBe(true);
    }
  });
});
