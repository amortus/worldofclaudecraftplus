// Pure-math tests for the 3D editor's free orbit/fly camera. No THREE, no DOM: the
// camera geometry (camera.ts) is host-agnostic so it is verified directly here, the
// same pure-core + thin-consumer split the 2D editor uses (tests/editor_view.test.ts).

import { describe, expect, it } from 'vitest';
import {
  clampDist,
  clampPitch,
  flyTarget,
  MAX_DIST,
  MAX_PITCH,
  MIN_DIST,
  MIN_PITCH,
  orbitBy,
  orbitEye,
  type OrbitState,
  panTarget,
  zoomDist,
} from '../src/editor/world3d/camera';

const state = (over: Partial<OrbitState> = {}): OrbitState => ({
  tx: 0,
  ty: 0,
  tz: 0,
  yaw: 0,
  pitch: 0,
  dist: 10,
  ...over,
});

describe('orbitEye', () => {
  it('places the eye at +z when yaw=0, pitch=0', () => {
    const e = orbitEye(state());
    expect(e.x).toBeCloseTo(0);
    expect(e.y).toBeCloseTo(0);
    expect(e.z).toBeCloseTo(10);
  });

  it('rotates the eye to +x at yaw=PI/2', () => {
    const e = orbitEye(state({ yaw: Math.PI / 2 }));
    expect(e.x).toBeCloseTo(10);
    expect(e.z).toBeCloseTo(0);
  });

  it('lifts the eye straight up at pitch=PI/2', () => {
    const e = orbitEye(state({ pitch: Math.PI / 2 }));
    expect(e.x).toBeCloseTo(0);
    expect(e.y).toBeCloseTo(10);
    expect(e.z).toBeCloseTo(0);
  });

  it('offsets from the target, not the origin', () => {
    const e = orbitEye(state({ tx: 100, tz: -50 }));
    expect(e.x).toBeCloseTo(100);
    expect(e.z).toBeCloseTo(-40); // target.z (-50) + dist (10) at yaw 0
  });
});

describe('clamps', () => {
  it('clampPitch keeps pitch within [MIN_PITCH, MAX_PITCH]', () => {
    expect(clampPitch(-5)).toBe(MIN_PITCH);
    expect(clampPitch(99)).toBe(MAX_PITCH);
    expect(clampPitch(0.5)).toBe(0.5);
  });

  it('clampDist keeps distance within [MIN_DIST, MAX_DIST]', () => {
    expect(clampDist(0)).toBe(MIN_DIST);
    expect(clampDist(1e6)).toBe(MAX_DIST);
    expect(clampDist(120)).toBe(120);
  });
});

describe('flyTarget', () => {
  it('moves the target toward -z at yaw=0 (forward = into the screen)', () => {
    const s = state();
    flyTarget(s, 1, 0, 5);
    expect(s.tx).toBeCloseTo(0);
    expect(s.tz).toBeCloseTo(-5);
  });

  it('strafes along +x at yaw=0 (right)', () => {
    const s = state();
    flyTarget(s, 0, 1, 5);
    expect(s.tx).toBeCloseTo(5);
    expect(s.tz).toBeCloseTo(0);
  });

  it('reorients with yaw', () => {
    const s = state({ yaw: Math.PI / 2 });
    flyTarget(s, 1, 0, 5); // forward now points toward -x
    expect(s.tx).toBeCloseTo(-5);
    expect(s.tz).toBeCloseTo(0);
  });
});

describe('panTarget', () => {
  it('screen-right moves the target along +x at yaw=0', () => {
    const s = state();
    panTarget(s, 3, 0);
    expect(s.tx).toBeCloseTo(3);
    expect(s.tz).toBeCloseTo(0);
  });
});

describe('orbitBy / zoomDist', () => {
  it('orbitBy adds yaw and clamps pitch', () => {
    const s = state({ pitch: MAX_PITCH });
    orbitBy(s, 0.2, 1); // pitch would exceed MAX, must clamp
    expect(s.yaw).toBeCloseTo(0.2);
    expect(s.pitch).toBe(MAX_PITCH);
  });

  it('zoomDist scales multiplicatively and clamps', () => {
    const s = state({ dist: 100 });
    zoomDist(s, 1.5);
    expect(s.dist).toBeCloseTo(150);
    zoomDist(s, 1e9); // blow past MAX
    expect(s.dist).toBe(MAX_DIST);
  });
});
