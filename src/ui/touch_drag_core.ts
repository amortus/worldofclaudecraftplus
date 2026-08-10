// Pure gesture recognizer for the HUD's long-press-then-drag on touch.
//
// Why it exists: HTML5 drag and drop (`dragstart`/`dragover`/`drop`) never fires
// from touch input, so every drag affordance in the HUD (bag stack onto the
// action bar, spellbook row onto the action bar, action slot onto another slot,
// equipped piece out onto the bags window) was unreachable with a finger. This
// module is the finger equivalent of `dragstart`: it decides WHEN a press
// becomes a drag, and nothing else.
//
// It is deliberately DOM-free so a Vitest can drive it directly (this repo has
// no jsdom, so anything left in the DOM layer is untestable). `touch_drag.ts` is
// the thin consumer that owns PointerEvent, pointer capture, the lifted ghost
// and the drop hit test.
//
// The gesture, in this order:
//  - A press starts a hold. Sliding more than TOUCH_DRAG_MOVE_TOLERANCE_PX
//    before the hold elapses CANCELS it, so a flick still scrolls the bag grid
//    or the spell list (those are the scroll containers; an eager drag kills
//    them). This is also what tells a drag apart from a list scroll.
//  - After TOUCH_DRAG_HOLD_MS the drag arms. That lands well before the 950 ms
//    tooltip peek (TOOLTIP_PEEK_MS in touch_peek.ts), so a drag never pops a
//    tooltip under the finger mid-flight.
//  - A lift while armed RUNS the drop. A cancel (the system stole the touch)
//    never does: it would move an item the player never dropped anywhere.
//  - A mouse pointer is ignored outright: the desktop HTML5 drag still owns it,
//    so the existing mouse path is untouched.

/** Hold (ms) before a touch press on a draggable row becomes a drag. Comfortably
 *  under the 950 ms tooltip peek, and clearly above a tap. */
export const TOUCH_DRAG_HOLD_MS = 320;

/** Movement (px) that cancels a not-yet-armed press, letting the list scroll. */
export const TOUCH_DRAG_MOVE_TOLERANCE_PX = 9;

/** How close to a scrollable drop rail's edge the finger has to be before the
 *  rail scrolls itself. Roughly half an action-bar slot on the phone HUD. */
export const TOUCH_DRAG_EDGE_ZONE_PX = 26;
/** How far one edge-zone sample nudges the rail. */
export const TOUCH_DRAG_EDGE_STEP_PX = 14;

/**
 * Auto-scroll for a horizontally scrollable drop rail (the phone action bar,
 * which is a narrow strip squeezed between the two joysticks: in portrait most
 * slots are scrolled out of view and could never be dropped on).
 *
 * Returns the pixels to add to `scrollLeft`: negative near the left edge,
 * positive near the right, 0 when the finger is comfortably inside or the
 * rail is degenerate. Sampled per pointermove, so it nudges while the finger
 * keeps moving near the edge rather than running on a timer.
 */
export function edgeAutoScrollStep(
  x: number,
  left: number,
  right: number,
  zone = TOUCH_DRAG_EDGE_ZONE_PX,
  step = TOUCH_DRAG_EDGE_STEP_PX,
): number {
  if (!Number.isFinite(x) || !Number.isFinite(left) || !Number.isFinite(right)) return 0;
  // A rail narrower than both edge zones would have them overlap, making every
  // point "at an edge"; there is nothing sensible to scroll toward then.
  if (right - left <= zone * 2) return 0;
  if (x < left || x > right) return 0;
  if (x - left <= zone) return -step;
  if (right - x <= zone) return step;
  return 0;
}

export interface TouchDragPointer {
  pointerId: number;
  /** 'touch' | 'pen' | 'mouse', straight off the PointerEvent. */
  pointerType: string;
  x: number;
  y: number;
}

export type TouchDragPhase = 'idle' | 'pressing' | 'dragging';

/** What a pointerdown asks the consumer to do. */
export type TouchDragDown =
  | { kind: 'ignore' }
  | { kind: 'watch'; pointerId: number; holdMs: number };

/** What a pointermove asks the consumer to do. */
export type TouchDragMove =
  | { kind: 'ignore' }
  /** Slid before arming: stand down and let the scroll container have it. */
  | { kind: 'cancel' }
  /** Armed and moving: move the ghost, repaint drop targets, preventDefault. */
  | { kind: 'track'; x: number; y: number };

/** What a pointerup / pointercancel asks the consumer to do. */
export type TouchDragEnd =
  | { kind: 'ignore' }
  /** The press ended without ever arming, or the gesture was taken away. */
  | { kind: 'cancel' }
  | { kind: 'drop'; x: number; y: number };

export interface TouchDragOptions {
  holdMs?: number;
  moveTolerancePx?: number;
}

/**
 * One press's worth of long-press-drag state. One instance per bound element;
 * it tracks a single pointer at a time (a second finger is ignored, which is
 * what keeps a two-finger scroll or a stray palm from hijacking a drag).
 */
export class TouchDragRecognizer {
  private phase: TouchDragPhase = 'idle';
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private readonly holdMs: number;
  private readonly moveTolerancePx: number;

  constructor(options: TouchDragOptions = {}) {
    this.holdMs = options.holdMs ?? TOUCH_DRAG_HOLD_MS;
    this.moveTolerancePx = options.moveTolerancePx ?? TOUCH_DRAG_MOVE_TOLERANCE_PX;
  }

  getPhase(): TouchDragPhase {
    return this.phase;
  }

  /** The pointer this recognizer is following, or null when idle. */
  getPointerId(): number | null {
    return this.pointerId;
  }

  isDragging(): boolean {
    return this.phase === 'dragging';
  }

  /** Where the tracked press started, for a consumer that wants to place the
   *  ghost before the first move arrives. */
  getStart(): { x: number; y: number } | null {
    return this.pointerId === null ? null : { x: this.startX, y: this.startY };
  }

  pointerDown(pointer: TouchDragPointer): TouchDragDown {
    // The mouse keeps the native HTML5 drag; taking it over here would replace a
    // working desktop path with a worse one.
    if (pointer.pointerType === 'mouse') return { kind: 'ignore' };
    // A second finger while a press is already tracked changes nothing: the
    // first one owns the gesture until it ends.
    if (this.pointerId !== null) return { kind: 'ignore' };
    this.pointerId = pointer.pointerId;
    this.phase = 'pressing';
    this.startX = pointer.x;
    this.startY = pointer.y;
    return { kind: 'watch', pointerId: pointer.pointerId, holdMs: this.holdMs };
  }

  /**
   * The consumer's hold timer fired. Returns true only when this really arms the
   * drag, so a stale timer from an abandoned press can never start one.
   */
  holdElapsed(pointerId: number): boolean {
    if (this.phase !== 'pressing' || this.pointerId !== pointerId) return false;
    this.phase = 'dragging';
    return true;
  }

  pointerMove(pointer: TouchDragPointer): TouchDragMove {
    if (this.pointerId !== pointer.pointerId || this.phase === 'idle') return { kind: 'ignore' };
    if (this.phase === 'pressing') {
      const moved = Math.hypot(pointer.x - this.startX, pointer.y - this.startY);
      if (moved > this.moveTolerancePx) {
        this.reset();
        return { kind: 'cancel' };
      }
      return { kind: 'ignore' };
    }
    return { kind: 'track', x: pointer.x, y: pointer.y };
  }

  pointerUp(pointer: TouchDragPointer): TouchDragEnd {
    if (this.pointerId !== pointer.pointerId || this.phase === 'idle') return { kind: 'ignore' };
    const dragging = this.phase === 'dragging';
    this.reset();
    return dragging ? { kind: 'drop', x: pointer.x, y: pointer.y } : { kind: 'cancel' };
  }

  /** A cancel NEVER drops: the touch was taken away, not released on a target. */
  pointerCancel(pointerId: number): TouchDragEnd {
    if (this.pointerId !== pointerId || this.phase === 'idle') return { kind: 'ignore' };
    this.reset();
    return { kind: 'cancel' };
  }

  reset(): void {
    this.phase = 'idle';
    this.pointerId = null;
    this.startX = 0;
    this.startY = 0;
  }
}
