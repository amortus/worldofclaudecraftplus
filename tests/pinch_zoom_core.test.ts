// Two-finger pinch zoom + pan math for the world map. Pure on purpose: the DOM
// binding (pinch_zoom.ts) only forwards PointerEvents, so every rule worth
// pinning (deadzone, baselines, third-finger handling, the pan delta) lives here.

import { describe, expect, it } from 'vitest';
import {
  PINCH_DEADZONE_PX,
  PinchGesture,
  pinchCentroid,
  pinchDistance,
  pinchScaleFactor,
} from '../src/ui/pinch_zoom_core';

describe('pinch primitives', () => {
  it('measures the spread between two fingers', () => {
    expect(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('averages the touch points into a centroid', () => {
    expect(pinchCentroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
    expect(pinchCentroid([])).toEqual({ x: 0, y: 0 });
  });

  it('turns a spread change into a multiplicative zoom factor', () => {
    expect(pinchScaleFactor(100, 200)).toBe(2);
    expect(pinchScaleFactor(200, 100)).toBe(0.5);
  });

  it('reports exactly 1 inside the deadzone, so a pan does not jitter the zoom', () => {
    expect(pinchScaleFactor(100, 100 + PINCH_DEADZONE_PX - 1)).toBe(1);
    expect(pinchScaleFactor(100, 100 - (PINCH_DEADZONE_PX - 1))).toBe(1);
    expect(pinchScaleFactor(100, 100 + PINCH_DEADZONE_PX)).toBeGreaterThan(1);
  });

  it('reports 1 for degenerate or non-finite input rather than NaN/Infinity zoom', () => {
    expect(pinchScaleFactor(0, 100)).toBe(1);
    expect(pinchScaleFactor(100, 0)).toBe(1);
    expect(pinchScaleFactor(Number.NaN, 100)).toBe(1);
    expect(pinchScaleFactor(100, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('PinchGesture', () => {
  it('a single finger is not a pinch: the one-finger map pan keeps it', () => {
    const g = new PinchGesture();
    expect(g.pointerDown({ pointerId: 1, x: 0, y: 0 })).toEqual({
      started: false,
      active: false,
      scale: 1,
      panX: 0,
      panY: 0,
    });
    expect(g.isPinching()).toBe(false);
    expect(g.pointerMove({ pointerId: 1, x: 50, y: 50 }).active).toBe(false);
  });

  it('the second finger starts the gesture so the consumer can cancel its drag', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    const started = g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    expect(started.started).toBe(true);
    expect(started.active).toBe(true);
    expect(started.scale).toBe(1);
    expect(g.isPinching()).toBe(true);
  });

  it('spreading the fingers zooms in by the ratio of the spreads', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    const update = g.pointerMove({ pointerId: 2, x: 200, y: 0 });
    expect(update.scale).toBe(2);
    // The centroid moved 50px right, so the pan is reported alongside the zoom.
    expect(update.panX).toBe(50);
    expect(update.panY).toBe(0);
  });

  it('pinching in zooms out', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 200, y: 0 });
    expect(g.pointerMove({ pointerId: 2, x: 100, y: 0 }).scale).toBe(0.5);
  });

  it('two fingers translating together pan, and net out to no zoom', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    // Pointer events arrive one finger at a time, so the intermediate sample DOES
    // see a spread change; what matters is that the pair of samples multiplies
    // back to 1 (both land before the next paint) and that the pan adds up to the
    // real translation.
    const first = g.pointerMove({ pointerId: 1, x: 20, y: 30 });
    const second = g.pointerMove({ pointerId: 2, x: 120, y: 30 });
    expect(first.scale * second.scale).toBeCloseTo(1, 10);
    expect(first.panX + second.panX).toBeCloseTo(20, 10);
    expect(first.panY + second.panY).toBeCloseTo(30, 10);
  });

  it('an anchored finger plus a moving one is a pure zoom about the anchor', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    const update = g.pointerMove({ pointerId: 2, x: 300, y: 0 });
    expect(update.scale).toBe(3);
    // The centroid necessarily drifts toward the finger that moved; that drift is
    // the pan the map applies so the pinch stays anchored under the fingers.
    expect(update.panX).toBe(100);
    expect(update.panY).toBe(0);
  });

  it('a slow pinch accumulates through the deadzone instead of being sampled away', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    // Four 2px steps: each alone is inside the 6px deadzone, but the baseline is
    // deliberately not advanced, so the fourth crosses it.
    expect(g.pointerMove({ pointerId: 2, x: 102, y: 0 }).scale).toBe(1);
    expect(g.pointerMove({ pointerId: 2, x: 104, y: 0 }).scale).toBe(1);
    expect(g.pointerMove({ pointerId: 2, x: 105, y: 0 }).scale).toBe(1);
    expect(g.pointerMove({ pointerId: 2, x: 106, y: 0 }).scale).toBeCloseTo(1.06, 10);
  });

  it('ignores a pointer it never saw go down', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    expect(g.pointerMove({ pointerId: 9, x: 500, y: 500 })).toEqual({
      started: false,
      active: false,
      scale: 1,
      panX: 0,
      panY: 0,
    });
  });

  it('a third finger suspends zoom until the count is back to two', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    const third = g.pointerDown({ pointerId: 3, x: 50, y: 200 });
    // Still one continuous gesture, so no second `started` for the consumer.
    expect(third.started).toBe(false);
    expect(third.active).toBe(true);
    expect(g.pointerCount()).toBe(3);
    expect(g.pointerMove({ pointerId: 2, x: 400, y: 0 })).toEqual({
      started: false,
      active: true,
      scale: 1,
      panX: 0,
      panY: 0,
    });
  });

  it('re-baselines when a finger lifts, so the survivors do not jump the zoom', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    g.pointerDown({ pointerId: 3, x: 400, y: 0 });
    g.pointerEnd(3);
    expect(g.pointerCount()).toBe(2);
    // The baseline is the CURRENT 1-2 spread (100), not the stale pre-third one.
    expect(g.pointerMove({ pointerId: 2, x: 200, y: 0 }).scale).toBe(2);
  });

  it('the last lift ends the gesture and clears the baseline', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    expect(g.pointerEnd(2).active).toBe(false);
    expect(g.isPinching()).toBe(false);
    // The survivor alone must not pan or zoom the map from the pinch path.
    expect(g.pointerMove({ pointerId: 1, x: 900, y: 900 }).active).toBe(false);
    expect(g.pointerEnd(99)).toEqual({
      started: false,
      active: false,
      scale: 1,
      panX: 0,
      panY: 0,
    });
  });

  it('a fresh two-finger gesture after a full release starts again', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    g.pointerEnd(1);
    g.pointerEnd(2);
    g.pointerDown({ pointerId: 4, x: 0, y: 0 });
    expect(g.pointerDown({ pointerId: 5, x: 100, y: 0 }).started).toBe(true);
  });

  it('reset drops every tracked pointer', () => {
    const g = new PinchGesture();
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    g.reset();
    expect(g.pointerCount()).toBe(0);
    expect(g.isPinching()).toBe(false);
  });

  it('honours a custom deadzone', () => {
    const g = new PinchGesture({ deadzone: 0 });
    g.pointerDown({ pointerId: 1, x: 0, y: 0 });
    g.pointerDown({ pointerId: 2, x: 100, y: 0 });
    expect(g.pointerMove({ pointerId: 2, x: 101, y: 0 }).scale).toBeCloseTo(1.01, 10);
  });
});
