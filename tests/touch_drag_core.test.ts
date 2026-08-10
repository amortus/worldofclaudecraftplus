// The long-press-then-drag recognizer that makes the HUD's drag affordances
// reachable with a finger (HTML5 drag never fires from touch). The gesture is
// pure math on purpose: this repo has no jsdom, so anything left in the DOM
// consumer (touch_drag.ts) is untestable, and these are exactly the rules a
// regression would break silently on a phone.

import { describe, expect, it } from 'vitest';
import {
  TOUCH_DRAG_EDGE_STEP_PX,
  TOUCH_DRAG_EDGE_ZONE_PX,
  TOUCH_DRAG_HOLD_MS,
  TOUCH_DRAG_MOVE_TOLERANCE_PX,
  TouchDragRecognizer,
  edgeAutoScrollStep,
} from '../src/ui/touch_drag_core';

const touch = (x: number, y: number, pointerId = 1) => ({
  pointerId,
  pointerType: 'touch',
  x,
  y,
});

/** Press, then let the hold elapse: the state every "while dragging" case starts from. */
function armed(recognizer: TouchDragRecognizer, x = 100, y = 100, pointerId = 1): void {
  const down = recognizer.pointerDown(touch(x, y, pointerId));
  expect(down.kind).toBe('watch');
  expect(recognizer.holdElapsed(pointerId)).toBe(true);
}

describe('arming the drag', () => {
  it('a press asks the consumer to watch a hold, and does not drag yet', () => {
    const r = new TouchDragRecognizer();
    const down = r.pointerDown(touch(10, 20));
    expect(down).toEqual({ kind: 'watch', pointerId: 1, holdMs: TOUCH_DRAG_HOLD_MS });
    expect(r.getPhase()).toBe('pressing');
    expect(r.isDragging()).toBe(false);
  });

  it('the hold arms the drag exactly once', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(10, 20));
    expect(r.holdElapsed(1)).toBe(true);
    expect(r.isDragging()).toBe(true);
    // A second (stale) timer must not re-arm or re-fire onStart.
    expect(r.holdElapsed(1)).toBe(false);
  });

  it('a stale hold timer from an abandoned press never arms a drag', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(10, 20));
    r.pointerUp(touch(10, 20));
    expect(r.holdElapsed(1)).toBe(false);
    expect(r.getPhase()).toBe('idle');
  });

  it('a hold for a DIFFERENT pointer is ignored', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(10, 20, 7));
    expect(r.holdElapsed(9)).toBe(false);
    expect(r.getPhase()).toBe('pressing');
  });

  it('honours a custom hold and tolerance', () => {
    const r = new TouchDragRecognizer({ holdMs: 500, moveTolerancePx: 30 });
    expect(r.pointerDown(touch(0, 0))).toEqual({ kind: 'watch', pointerId: 1, holdMs: 500 });
    // 20px would cancel at the default tolerance; here it must not.
    expect(r.pointerMove(touch(20, 0)).kind).toBe('ignore');
    expect(r.pointerMove(touch(31, 0)).kind).toBe('cancel');
  });
});

describe('a drag versus a list scroll', () => {
  it('sliding past the tolerance before the hold stands the gesture down', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(100, 100));
    const slid = r.pointerMove(touch(100, 100 + TOUCH_DRAG_MOVE_TOLERANCE_PX + 1));
    expect(slid).toEqual({ kind: 'cancel' });
    // Standing down is what lets the bag grid / spell list keep scrolling, and a
    // late hold timer must not resurrect the drag.
    expect(r.getPhase()).toBe('idle');
    expect(r.holdElapsed(1)).toBe(false);
  });

  it('a slide exactly AT the tolerance is still a press, not a scroll', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(100, 100));
    expect(r.pointerMove(touch(100 + TOUCH_DRAG_MOVE_TOLERANCE_PX, 100)).kind).toBe('ignore');
    expect(r.getPhase()).toBe('pressing');
  });

  it('once armed, ANY movement tracks: the tolerance no longer applies', () => {
    const r = new TouchDragRecognizer();
    armed(r);
    expect(r.pointerMove(touch(400, 900))).toEqual({ kind: 'track', x: 400, y: 900 });
  });
});

describe('release semantics', () => {
  it('lifting while armed runs the drop at the release point', () => {
    const r = new TouchDragRecognizer();
    armed(r);
    expect(r.pointerUp(touch(250, 480))).toEqual({ kind: 'drop', x: 250, y: 480 });
    expect(r.getPhase()).toBe('idle');
  });

  it('lifting before the hold is a plain tap, never a drop', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(10, 10));
    expect(r.pointerUp(touch(11, 11))).toEqual({ kind: 'cancel' });
  });

  it('a CANCEL never drops: the touch was taken away, not released on a target', () => {
    const r = new TouchDragRecognizer();
    armed(r);
    // Treating this as a release would move an item the player never dropped.
    expect(r.pointerCancel(1)).toEqual({ kind: 'cancel' });
    expect(r.getPhase()).toBe('idle');
  });

  it('a release from an untracked pointer is ignored', () => {
    const r = new TouchDragRecognizer();
    armed(r, 100, 100, 4);
    expect(r.pointerUp(touch(0, 0, 5))).toEqual({ kind: 'ignore' });
    expect(r.isDragging()).toBe(true);
    expect(r.pointerCancel(5)).toEqual({ kind: 'ignore' });
    expect(r.isDragging()).toBe(true);
  });

  it('every event on an idle recognizer is ignored', () => {
    const r = new TouchDragRecognizer();
    expect(r.pointerMove(touch(1, 1))).toEqual({ kind: 'ignore' });
    expect(r.pointerUp(touch(1, 1))).toEqual({ kind: 'ignore' });
    expect(r.pointerCancel(1)).toEqual({ kind: 'ignore' });
    expect(r.getPointerId()).toBe(null);
    expect(r.getStart()).toBe(null);
  });
});

describe('pointer arbitration', () => {
  it('a mouse is ignored outright: the desktop HTML5 drag still owns it', () => {
    const r = new TouchDragRecognizer();
    expect(r.pointerDown({ pointerId: 1, pointerType: 'mouse', x: 0, y: 0 })).toEqual({
      kind: 'ignore',
    });
    expect(r.getPhase()).toBe('idle');
  });

  it('a pen drags like a finger', () => {
    const r = new TouchDragRecognizer();
    expect(r.pointerDown({ pointerId: 3, pointerType: 'pen', x: 0, y: 0 }).kind).toBe('watch');
  });

  it('a second finger cannot hijack a press already in flight', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(10, 10, 1));
    expect(r.pointerDown(touch(200, 200, 2))).toEqual({ kind: 'ignore' });
    expect(r.getPointerId()).toBe(1);
    // ...and the interloper's own moves/releases do nothing to the tracked press.
    expect(r.pointerMove(touch(900, 900, 2))).toEqual({ kind: 'ignore' });
    expect(r.getPhase()).toBe('pressing');
  });

  it('reset returns to idle so a rebuilt row can start clean', () => {
    const r = new TouchDragRecognizer();
    armed(r);
    r.reset();
    expect(r.getPhase()).toBe('idle');
    expect(r.getPointerId()).toBe(null);
  });

  it('reports the press origin so the ghost can be placed before the first move', () => {
    const r = new TouchDragRecognizer();
    r.pointerDown(touch(64, 128));
    expect(r.getStart()).toEqual({ x: 64, y: 128 });
  });
});

describe('edge auto-scroll for the phone action bar', () => {
  // In portrait the bar is a ~120px strip between the two joysticks, so most
  // slots start scrolled out of view; without this they can never be dropped on.
  const LEFT = 100;
  const RIGHT = 400;

  it('does nothing while the finger is comfortably inside the rail', () => {
    expect(edgeAutoScrollStep(250, LEFT, RIGHT)).toBe(0);
  });

  it('scrolls left near the left edge and right near the right edge', () => {
    expect(edgeAutoScrollStep(LEFT + 1, LEFT, RIGHT)).toBe(-TOUCH_DRAG_EDGE_STEP_PX);
    expect(edgeAutoScrollStep(RIGHT - 1, LEFT, RIGHT)).toBe(TOUCH_DRAG_EDGE_STEP_PX);
  });

  it('treats the zone boundary as inside the edge', () => {
    expect(edgeAutoScrollStep(LEFT + TOUCH_DRAG_EDGE_ZONE_PX, LEFT, RIGHT)).toBe(
      -TOUCH_DRAG_EDGE_STEP_PX,
    );
    expect(edgeAutoScrollStep(LEFT + TOUCH_DRAG_EDGE_ZONE_PX + 1, LEFT, RIGHT)).toBe(0);
  });

  it('does nothing once the finger has left the rail entirely', () => {
    expect(edgeAutoScrollStep(LEFT - 5, LEFT, RIGHT)).toBe(0);
    expect(edgeAutoScrollStep(RIGHT + 5, LEFT, RIGHT)).toBe(0);
  });

  it('does nothing for a rail too narrow to have two distinct edges', () => {
    // Both zones would overlap, so every point would read as "at an edge" and the
    // rail would jitter left and right at once.
    expect(edgeAutoScrollStep(110, 100, 100 + TOUCH_DRAG_EDGE_ZONE_PX * 2)).toBe(0);
    expect(edgeAutoScrollStep(100, 100, 100)).toBe(0);
  });

  it('does nothing for non-finite geometry', () => {
    expect(edgeAutoScrollStep(Number.NaN, LEFT, RIGHT)).toBe(0);
    expect(edgeAutoScrollStep(250, Number.NaN, RIGHT)).toBe(0);
    expect(edgeAutoScrollStep(250, LEFT, Number.NaN)).toBe(0);
  });
});
