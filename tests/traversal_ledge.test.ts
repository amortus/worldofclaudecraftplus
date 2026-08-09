import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import {
  BODY_RADIUS,
  climbDuration,
  climbPoseAt,
  findLedgeGrab,
  type LedgeQuery,
  PLAYER_TRAVERSAL_BANDS,
} from '../src/sim/traversal';

// The climb rung: what a body may grab mid-jump, what it must refuse, and the
// shape of the pull-up.

const R = BODY_RADIUS;
const bands = PLAYER_TRAVERSAL_BANDS;

function box(x: number, z: number, hw: number, hd: number): Collider {
  return { type: 'obb', x, z, hw, hd, rot: 0 };
}
function circle(x: number, z: number, r: number): Collider {
  return { type: 'circle', x, z, r };
}

function query(entries: [Collider, number | undefined][], over: Partial<LedgeQuery> = {}): LedgeQuery {
  const tops = new Map<Collider, number | undefined>(entries);
  return {
    radius: R,
    facing: Math.PI / 2, // sim convention: forward = (sin f, cos f) = (+1, 0)
    vx: 0,
    vz: 0,
    vy: -0.4,
    colliders: entries.map((e) => e[0]),
    topOf: (c: Collider) => tops.get(c),
    groundAt: () => 0,
    ...over,
  };
}

// A wall whose top is a dock-hut roof: the probe point (1, 0) lands on it.
const hutRoof: [Collider, number | undefined] = [box(1.5, 0, 1, 4), 2.9];

describe('ledge grab', () => {
  it('grabs a roof inside the climb band at the top of the jump arc', () => {
    const grab = findLedgeGrab(query([hutRoof]), 0, bands.jumpApex, 0, 0);
    expect(grab).not.toBeNull();
    expect(grab!.topY).toBeCloseTo(2.9, 12);
    expect(grab!.x).toBeCloseTo(1.0, 12); // radius + LEDGE_GRAB_FORWARD ahead
    expect(grab!.z).toBeCloseTo(0, 12);
  });

  it('refuses anything the jump arc already carries the body over', () => {
    // The ladder's middle seam. A top just under the vault ceiling is a vault,
    // never a climb, even though it sits well inside the arms' reach.
    const topY = bands.climbMinOverhead - 0.2;
    const low: [Collider, number | undefined] = [box(1.5, 0, 1, 4), topY];
    const feetY = topY - bands.grabMin - 0.05; // squarely inside the grab window
    expect(findLedgeGrab(query([low]), 0, feetY, 0, 0)).toBeNull();
    // ...and the same top one notch above the seam IS grabbed.
    const high: [Collider, number | undefined] = [box(1.5, 0, 1, 4), bands.climbMinOverhead + 0.05];
    expect(findLedgeGrab(query([high]), 0, feetY, 0, 0)).not.toBeNull();
  });

  it('refuses anything above the arms', () => {
    const column: [Collider, number | undefined] = [box(1.5, 0, 1, 4), 4.3];
    expect(findLedgeGrab(query([column]), 0, bands.jumpApex, 0, 0)).toBeNull();
  });

  it('refuses a full-height blocker outright', () => {
    const wall: [Collider, number | undefined] = [box(1.5, 0, 1, 4), undefined];
    expect(findLedgeGrab(query([wall]), 0, bands.jumpApex, 0, 0)).toBeNull();
  });

  it('refuses when the body would not fit where it lands', () => {
    const post: [Collider, number | undefined] = [circle(1.0, 0, 0.3), undefined];
    expect(findLedgeGrab(query([hutRoof, post]), 0, bands.jumpApex, 0, 0)).toBeNull();
  });

  it('refuses while the body is still rising fast enough to clear it unaided', () => {
    const rim: [Collider, number | undefined] = [box(1.5, 0, 1, 4), 1.7];
    // launchFloorY is a yard below, so the overhead rule does not decide this.
    const rising = query([rim], { vy: 5 });
    expect(findLedgeGrab(rising, 0, 0.2, 0, -1)).toBeNull();
    const falling = query([rim], { vy: -1 });
    expect(findLedgeGrab(falling, 0, 0.2, 0, -1)).not.toBeNull();
  });

  it('probes along real motion, and along facing only when barely moving', () => {
    // Ledge to the north (+z); the body faces east (+x).
    const north: [Collider, number | undefined] = [box(0, 1.5, 4, 1), 2.9];
    const drifting = findLedgeGrab(query([north], { vx: 0, vz: 3 }), 0, bands.jumpApex, 0, 0);
    expect(drifting).not.toBeNull();
    expect(drifting!.z).toBeCloseTo(1.0, 12);
    // Facing east with no meaningful motion: nothing under the hands.
    expect(findLedgeGrab(query([north]), 0, bands.jumpApex, 0, 0)).toBeNull();
    // Facing north with no motion: the same ledge is found.
    const facingNorth = findLedgeGrab(query([north], { facing: 0 }), 0, bands.jumpApex, 0, 0);
    expect(facingNorth).not.toBeNull();
  });

  it('never grabs terrain unless the caller can say how steep it is', () => {
    const bank = query([], { groundAt: () => 2.9 });
    expect(findLedgeGrab(bank, 0, bands.jumpApex, 0, 0)).toBeNull();
    const measured = query([], { groundAt: () => 2.9, steepnessAt: () => 0.5 });
    expect(findLedgeGrab(measured, 0, bands.jumpApex, 0, 0)).not.toBeNull();
    const cliff = query([], { groundAt: () => 2.9, steepnessAt: () => 9 });
    expect(findLedgeGrab(cliff, 0, bands.jumpApex, 0, 0)).toBeNull();
  });

  it('returns the same grab for the same query', () => {
    const a = findLedgeGrab(query([hutRoof]), 0, bands.jumpApex, 0, 0);
    const b = findLedgeGrab(query([hutRoof]), 0, bands.jumpApex, 0, 0);
    expect(Object.is(a!.x, b!.x)).toBe(true);
    expect(Object.is(a!.z, b!.z)).toBe(true);
    expect(Object.is(a!.topY, b!.topY)).toBe(true);
  });

  it('does not hand two callers the same object', () => {
    // A grab OUTLIVES the call: the caller stores it for the whole climb. A
    // shared module singleton would let the second body in a tick silently
    // rewrite the first body's destination.
    const ahead: [Collider, number | undefined] = [box(0, 1.5, 4, 1), 2.9];
    const first = findLedgeGrab(query([hutRoof]), 0, bands.jumpApex, 0, 0)!;
    const second = findLedgeGrab(query([ahead], { facing: 0 }), 0, bands.jumpApex, 0, 0)!;
    expect(first).not.toBe(second);
    expect(first.x).toBeCloseTo(1.0, 12);
    expect(first.z).toBeCloseTo(0, 12);
    expect(second.z).toBeCloseTo(1.0, 12);
  });

  it('writes into a caller-owned result when given one', () => {
    const out = { topY: 0, x: 0, z: 0 };
    const grab = findLedgeGrab(query([hutRoof]), 0, bands.jumpApex, 0, 0, out);
    expect(grab).toBe(out);
    expect(out.topY).toBeCloseTo(2.9, 12);
  });
});

describe('climb curve', () => {
  const from = { x: 0, y: 0.98, z: 0 };
  const to = { x: 1, y: 2.9, z: 0 };
  const duration = climbDuration(to.y - from.y);

  it('scales its length with the rise', () => {
    expect(climbDuration(0)).toBeCloseTo(0.3, 12);
    expect(duration).toBeCloseTo(0.3 + 0.16 * 1.92, 12);
    expect(climbDuration(-5)).toBeCloseTo(0.3, 12); // never negative
  });

  it('starts at the launch pose and finishes exactly on the destination', () => {
    const start = climbPoseAt(from, to, 0, duration);
    expect(start.x).toBeCloseTo(from.x, 12);
    expect(start.y).toBeCloseTo(from.y, 12);
    const end = climbPoseAt(from, to, duration, duration);
    expect(Object.is(end.x, to.x)).toBe(true);
    expect(Object.is(end.y, to.y)).toBe(true);
    expect(Object.is(end.z, to.z)).toBe(true);
    const past = climbPoseAt(from, to, duration * 3, duration);
    expect(Object.is(past.y, to.y)).toBe(true);
  });

  it('rises before it pulls forward, and both move only one way', () => {
    let prevY = from.y;
    let prevX = from.x;
    let leads = 0;
    for (let e = 0; e <= duration + 1e-9; e += duration / 40) {
      const p = climbPoseAt(from, to, e, duration);
      expect(p.y).toBeGreaterThanOrEqual(prevY - 1e-12);
      expect(p.x).toBeGreaterThanOrEqual(prevX - 1e-12);
      const upFrac = (p.y - from.y) / (to.y - from.y);
      const fwdFrac = (p.x - from.x) / (to.x - from.x);
      if (upFrac > fwdFrac + 1e-9) leads++;
      prevY = p.y;
      prevX = p.x;
    }
    // A mantle, not a slide up an invisible ramp: the rise leads for most of it.
    expect(leads).toBeGreaterThan(20);
  });

  it('is safe with a zero-length climb', () => {
    const p = climbPoseAt(from, to, 0, 0);
    expect(Object.is(p.y, to.y)).toBe(true);
  });
});
