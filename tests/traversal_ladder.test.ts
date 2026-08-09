import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import {
  BODY_RADIUS,
  canStillVault,
  classifyObstacle,
  findLadderGap,
  GRAVITY,
  jumpArcSamples,
  JUMP_VELOCITY,
  LEDGE_GRAB_MAX,
  LEDGE_GRAB_MIN,
  makeTraversalBands,
  MANTLE_REACH,
  MAX_STEP_HEIGHT,
  moveBody,
  PLAYER_TRAVERSAL_BANDS,
  remainingRise,
  RUN_STEP_PER_TICK,
  type TraversalRung,
} from '../src/sim/traversal';
import { DT } from '../src/sim/types';

// The traversal ladder's whole promise is that there is NO obstacle height that
// can be neither crossed nor climbed. This file is where that promise is
// checked, including a negative control that breaks the ladder on purpose and
// proves the check would have caught it.

const bands = PLAYER_TRAVERSAL_BANDS;

describe('traversal band derivation', () => {
  it('derives the step height from the drop sim.ts already absorbs', () => {
    // maxStepDown = 0.4 + run * MAX_CLIMB_SLOPE, with run = RUN_SPEED * DT.
    // Step up equals step down, so traversal is reversible.
    expect(RUN_STEP_PER_TICK).toBeCloseTo(0.35, 12);
    expect(MAX_STEP_HEIGHT).toBeCloseTo(0.925, 12);
  });

  it('pins the mantle reach and the grab floor to the step height', () => {
    // The ladder's bottom seam. A top a grounded body strides over must never
    // read as a wall to the same body in mid-air.
    expect(MANTLE_REACH).toBe(MAX_STEP_HEIGHT);
    expect(LEDGE_GRAB_MIN).toBe(MAX_STEP_HEIGHT);
  });

  it('uses the DISCRETE jump apex, not the closed form', () => {
    const analytic = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY);
    expect(analytic).toBeCloseTo(1.125, 12);
    // sim.ts integrates with semi-implicit Euler at 20 Hz, which undershoots.
    expect(bands.jumpApex).toBeCloseTo(0.98, 12);
    expect(bands.jumpApex).toBeLessThan(analytic);
  });

  it('places every band ceiling where the derivation puts it', () => {
    expect(bands.stepHeight).toBeCloseTo(0.925, 12);
    expect(bands.vaultMax).toBeCloseTo(1.905, 12);
    expect(bands.grabMax).toBeCloseTo(2.2, 12);
    expect(bands.climbMax).toBeCloseTo(3.18, 12);
    // The middle seam: a climb starts exactly where the vault stops.
    expect(bands.climbMinOverhead).toBe(bands.vaultMax);
  });

  it('classifies the shipped prop silhouettes the way the design intends', () => {
    // Tops taken from the collider set in src/sim/colliders.ts.
    const cases: [string, number, TraversalRung][] = [
      ['crate', 1.35, 'vault'],
      ['campfire', 1.45, 'vault'],
      ['fence rail', 2.8, 'climb'],
      ['dock hut', 2.9, 'climb'],
      ['market stall', 3.1, 'climb'],
      ['tent', 3.4, 'wall'],
      ['well', 3.7, 'wall'],
      ['ruin column', 4.3, 'wall'],
      ['mine mound', 5.2, 'wall'],
      ['inn', 7.8, 'wall'],
      ['chapel', 10.8, 'wall'],
      ['mud hut', 12.5, 'wall'],
    ];
    for (const [name, top, want] of cases) {
      expect(classifyObstacle(top), `${name} at ${top}yd`).toBe(want);
    }
  });
});

describe('the ladder invariant: no gap', () => {
  it('leaves no height that is neither crossable nor climbable', () => {
    expect(findLadderGap(bands, 0.001)).toBeNull();
  });

  it('holds for every jump strength the game can produce', () => {
    // 0.7 is the water hop in sim.ts; 2.8 is the strongest buff_jump aura
    // (src/sim/content/augments.ts). Everything between must hold too.
    for (const mult of [0.7, 0.85, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.4, 2.8]) {
      const b = makeTraversalBands({ jumpVelocity: JUMP_VELOCITY * mult });
      expect(findLadderGap(b, 0.002), `jump mult ${mult}`).toBeNull();
    }
  });

  it('keeps the grab window wider than one tick of vertical travel', () => {
    // Sufficient (not necessary) condition for the two-sided grab window to be
    // sampled by the discrete arc. It is the ceiling on how strong a jump buff
    // can get before the climb rung starts skipping heights.
    const window = LEDGE_GRAB_MAX - LEDGE_GRAB_MIN;
    expect(window).toBeCloseTo(1.275, 12);
    expect(JUMP_VELOCITY * 2.8 * DT).toBeLessThan(window);
  });

  it('agrees rung by rung with a simulated jump', () => {
    const arc = jumpArcSamples();
    const clears = (h: number) =>
      h <= bands.stepHeight || arc.some((s) => h <= s.y + bands.mantleReach);
    const grabs = (h: number) =>
      h >= bands.climbMinOverhead &&
      arc.some(
        (s) =>
          h >= s.y + bands.grabMin &&
          h <= s.y + bands.grabMax &&
          !canStillVault(s.y, s.vy, h, bands),
      );
    for (let h = 0.005; h <= 4; h += 0.005) {
      const rung = classifyObstacle(h);
      if (rung === 'step' || rung === 'vault') expect(clears(h), `${h}`).toBe(true);
      if (rung === 'climb') expect(grabs(h), `${h}`).toBe(true);
      if (rung === 'wall') expect(clears(h) || grabs(h), `${h}`).toBe(false);
    }
  });
});

describe('the ladder invariant: the step rung is real', () => {
  // `findLadderGap` checks the HEIGHT ALGEBRA and asserts the step rung true by
  // fiat (`h <= stepHeight` returns crossable). That is a blind spot: a lip in
  // the step band that the SOLVER refuses is a gap the algebra cannot see,
  // because the climb refuses everything below `climbMinOverhead`. So the step
  // rung is checked end to end, against the real solver.
  const lip = (top: number) => {
    const c: Collider = { type: 'obb', x: 6, z: 0, hw: 1, hd: 200, rot: 0 };
    return { colliders: [c], topOf: () => top as number | undefined };
  };

  function walkInto(top: number, degrees: number): { steppedUp: boolean; feetY: number } {
    const a = (degrees * Math.PI) / 180;
    const s = lip(top);
    let x = 0;
    let z = 0;
    let feetY = 0;
    let steppedUp = false;
    for (let tick = 0; tick < 120 && !steppedUp; tick++) {
      const res = moveBody({
        x,
        z,
        feetY,
        dx: Math.cos(a) * RUN_STEP_PER_TICK,
        dz: Math.sin(a) * RUN_STEP_PER_TICK,
        radius: BODY_RADIUS,
        colliders: s.colliders,
        topOf: s.topOf,
      });
      x = res.x;
      z = res.z;
      feetY = res.feetY;
      steppedUp = res.steppedUp;
    }
    return { steppedUp, feetY };
  }

  it('strides over every height in the step band, from any approach angle', () => {
    for (let h = 0.025; h <= bands.stepHeight; h += 0.025) {
      for (const deg of [0, 20, 40, 60, 75]) {
        const r = walkInto(h, deg);
        expect(r.steppedUp, `${h.toFixed(3)}yd at ${deg} degrees`).toBe(true);
        expect(r.feetY).toBeCloseTo(h, 12);
      }
    }
  });

  it('refuses the first height above the step band, so the rung boundary is real', () => {
    const r = walkInto(bands.stepHeight + 0.05, 0);
    expect(r.steppedUp).toBe(false);
    expect(r.feetY).toBe(0);
  });
});

describe('the ladder invariant: negative controls', () => {
  it('CATCHES the closed-form-apex mistake that would have shipped a real gap', () => {
    // The exact bug this port nearly had: derive the vault ceiling (and with it
    // the climb refusal) from v^2/2g = 1.125 instead of the 0.98 the 20 Hz
    // integrator actually reaches. Heights in (1.905, 2.05] then become
    // uncrossable (the arc is too low) AND unclimbable (refused as vaultable).
    const broken = makeTraversalBands({ jumpApex: (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY) });
    const gap = findLadderGap(broken, 0.001);
    expect(gap).not.toBeNull();
    expect(gap!.reason).toBe('uncrossable-and-unclimbable');
    expect(gap!.height).toBeGreaterThan(1.905);
    expect(gap!.height).toBeLessThanOrEqual(2.05);
  });

  it('CATCHES a broken middle seam', () => {
    // Raising the climb refusal above the vault ceiling opens the band between
    // them: too high to jump over, refused as "you could have jumped over it".
    const broken = makeTraversalBands({});
    const gap = findLadderGap({ ...broken, climbMinOverhead: broken.vaultMax + 0.3 }, 0.001);
    expect(gap).not.toBeNull();
    expect(gap!.reason).toBe('uncrossable-and-unclimbable');
    expect(gap!.height).toBeGreaterThan(broken.vaultMax);
  });

  it('CATCHES a body that cannot leave the ground but still claims a climb', () => {
    // Degenerate arc: nothing above the stride is reachable at all.
    const broken = makeTraversalBands({ jumpVelocity: 0.2 });
    const gap = findLadderGap({ ...broken, climbMax: 3 }, 0.001);
    expect(gap).not.toBeNull();
  });
});

describe('traversal ladder determinism', () => {
  it('produces bit-identical bands and arcs on repeated runs', () => {
    const a = makeTraversalBands();
    const b = makeTraversalBands();
    for (const key of Object.keys(a) as (keyof typeof a)[]) {
      expect(Object.is(a[key], b[key]), key).toBe(true);
    }
    const arcA = jumpArcSamples();
    const arcB = jumpArcSamples();
    expect(arcA.length).toBe(arcB.length);
    for (let i = 0; i < arcA.length; i++) {
      expect(Object.is(arcA[i].y, arcB[i].y)).toBe(true);
      expect(Object.is(arcA[i].vy, arcB[i].vy)).toBe(true);
    }
  });

  it('never lets the discrete remaining rise exceed the closed form', () => {
    for (let vy = 0; vy <= 20; vy += 0.25) {
      const discrete = remainingRise(vy);
      const analytic = (vy * vy) / (2 * GRAVITY);
      expect(discrete).toBeLessThanOrEqual(analytic + 1e-9);
      expect(Object.is(discrete, remainingRise(vy))).toBe(true);
    }
  });
});
