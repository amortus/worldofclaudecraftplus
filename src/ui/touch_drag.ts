// Thin DOM consumer for the pure long-press-drag recognizer (touch_drag_core).
//
// It owns exactly the parts that need a browser: PointerEvent plumbing, pointer
// capture, the floating "lifted" ghost that follows the finger, and swallowing
// the synthetic click that a release would otherwise fire. Every decision about
// WHEN a press becomes a drag lives in the pure core; every decision about what
// a drop DOES lives in the caller's `onDrop`.
//
// Gesture disambiguation (this is the whole reason for the hold):
//  - vs a TAP: a drag only exists after TOUCH_DRAG_HOLD_MS, and the release is
//    consumed here (`swallowNextClick`) so a drag never also uses/casts the thing
//    it just moved.
//  - vs a LIST SCROLL: sliding more than the tolerance before the hold elapses
//    stands the gesture down, so a flick still scrolls the bag grid / spell list.
//  - vs the CAMERA LOOK and the MOVE STICK: those are bound on `#game-canvas`
//    and `#mobile-move-zone`, which sit UNDER `#ui` (z-index 60 vs 80 on the
//    phone HUD), so a press that lands on a HUD row never reaches them. Nothing
//    here needs to arbitrate with them; the stacking order already does.

import { TouchDragRecognizer, type TouchDragOptions } from './touch_drag_core';

/** How long after a completed drag the element's synthetic click stays swallowed. */
export const TOUCH_DRAG_CLICK_SUPPRESS_MS = 700;

export interface TouchDragDeps<T> {
  /** True only on the touch HUD; with a mouse the desktop HTML5 drag owns this. */
  isTouchHud(): boolean;
  /** What this element carries right now; null makes it undraggable. */
  payload(): T | null;
  /** Already-escaped markup for the ghost that follows the finger. */
  ghostHtml(payload: T): string;
  /** The drag armed: hide the tooltip, mark the source. */
  onStart(payload: T): void;
  /** The finger moved to (x, y) while dragging: repaint drop-target highlights. */
  onMove(x: number, y: number, payload: T): void;
  /** The finger lifted at (x, y) while dragging: run the drop. */
  onDrop(x: number, y: number, payload: T): void;
  /** The drag ended (dropped or cancelled): clear highlights. */
  onEnd(payload: T): void;
}

/** The body class the CSS keys off while any touch drag is in flight. */
export const TOUCH_DRAGGING_CLASS = 'touch-dragging';
/** The class put on the element the drag started from. */
export const TOUCH_DRAG_SOURCE_CLASS = 'touch-drag-source';

// The tooltip's long-press peek timer (Hud.attachTooltip) lives in a closure we
// cannot reach, but it clears itself on pointercancel. Once the drag arms the
// real pointer stays down (we captured it), so synthesize that cancel to kill the
// pending peek. pointerId -1 never matches a real pointer, so this module's own
// pointercancel handler ignores the echo.
function cancelPendingTooltipPeek(el: HTMLElement): void {
  el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: -1, bubbles: true }));
}

/**
 * Bind the long-press-then-drag gesture to one element. Safe to call on every
 * rebuild: the listeners die with the element.
 *
 * The mouse and keyboard paths are untouched - this only ever engages for a
 * non-mouse pointer on the touch HUD, so the existing HTML5 drag, the
 * right-click/shift-Delete clears and every focusable control keep working
 * exactly as before.
 */
export function bindTouchDrag<T>(
  el: HTMLElement,
  deps: TouchDragDeps<T>,
  options: TouchDragOptions = {},
): void {
  const recognizer = new TouchDragRecognizer(options);
  let holdTimer = 0;
  let ghost: HTMLElement | null = null;
  let held: T | null = null;
  let documentEnd: ((e: PointerEvent) => void) | null = null;

  const removeGhost = (): void => {
    ghost?.remove();
    ghost = null;
  };

  const detachDocumentEnd = (): void => {
    if (!documentEnd) return;
    document.removeEventListener('pointerup', documentEnd);
    document.removeEventListener('pointercancel', documentEnd);
    documentEnd = null;
  };

  // A completed drag is followed by a synthetic click on the capture target.
  // Swallow exactly one, so releasing on a drop target never also fires the
  // element's own action (use the potion, cast the spell, open the window).
  const swallowNextClick = (): void => {
    const swallow = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
      el.removeEventListener('click', swallow, true);
      window.clearTimeout(expiry);
    };
    const expiry = window.setTimeout(() => {
      el.removeEventListener('click', swallow, true);
    }, TOUCH_DRAG_CLICK_SUPPRESS_MS);
    el.addEventListener('click', swallow, true);
  };

  const finish = (payload: T | null, wasDragging: boolean): void => {
    window.clearTimeout(holdTimer);
    detachDocumentEnd();
    removeGhost();
    held = null;
    document.body.classList.remove(TOUCH_DRAGGING_CLASS);
    el.classList.remove(TOUCH_DRAG_SOURCE_CLASS);
    if (wasDragging && payload !== null) deps.onEnd(payload);
  };

  el.addEventListener('pointerdown', (e) => {
    if (!deps.isTouchHud()) return;
    const payload = deps.payload();
    if (payload === null) return;
    const decision = recognizer.pointerDown({
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX,
      y: e.clientY,
    });
    if (decision.kind !== 'watch') return;
    held = payload;
    const startX = e.clientX;
    const startY = e.clientY;
    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      if (!recognizer.holdElapsed(decision.pointerId) || held === null) return;
      const carried = held;
      cancelPendingTooltipPeek(el);
      document.body.classList.add(TOUCH_DRAGGING_CLASS);
      el.classList.add(TOUCH_DRAG_SOURCE_CLASS);
      const lifted = document.createElement('div');
      lifted.className = 'touch-drag-ghost';
      // Decorative: the real state is the highlighted drop target and the source
      // row, both of which stay in the accessibility tree.
      lifted.setAttribute('aria-hidden', 'true');
      lifted.innerHTML = deps.ghostHtml(carried);
      lifted.style.setProperty('--touch-drag-x', `${startX}px`);
      lifted.style.setProperty('--touch-drag-y', `${startY}px`);
      // Appended to <body>, deliberately OUTSIDE #ui: #ui carries
      // `zoom: var(--ui-scale)`, under which an author-space left/top would be
      // multiplied by the scale and drift away from the finger.
      document.body.appendChild(lifted);
      ghost = lifted;
      try {
        el.setPointerCapture?.(decision.pointerId);
      } catch {
        /* pointer already released */
      }
      deps.onStart(carried);
      deps.onMove(startX, startY, carried);
      // Safety net: a HUD window that rebuilds mid-drag (the bag grid repaints on
      // any inventory change) takes this element's listeners with it, which would
      // strand the body class and the ghost for the rest of the session. The
      // document-level end only ever CANCELS, so a stale payload can never drop.
      const onDocumentEnd = (e2: PointerEvent): void => {
        if (recognizer.getPointerId() !== e2.pointerId) return;
        const payloadAtEnd = held;
        const wasDragging = recognizer.isDragging();
        recognizer.reset();
        finish(payloadAtEnd, wasDragging);
      };
      documentEnd = onDocumentEnd;
      document.addEventListener('pointerup', onDocumentEnd);
      document.addEventListener('pointercancel', onDocumentEnd);
    }, decision.holdMs);
  });

  el.addEventListener('pointermove', (e) => {
    const decision = recognizer.pointerMove({
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX,
      y: e.clientY,
    });
    if (decision.kind === 'ignore') return;
    if (decision.kind === 'cancel') {
      finish(held, false);
      return;
    }
    // Armed: the finger owns the item, so nothing under it may scroll.
    e.preventDefault();
    ghost?.style.setProperty('--touch-drag-x', `${decision.x}px`);
    ghost?.style.setProperty('--touch-drag-y', `${decision.y}px`);
    if (held !== null) deps.onMove(decision.x, decision.y, held);
  });

  // The scroll brake. `touch-action` is latched at touchstart, so flipping it to
  // `none` when the drag arms does nothing for the gesture already in flight, and
  // preventDefault on `pointermove` does not stop a compositor scroll either. A
  // NON-PASSIVE touchmove is the one reliable brake: the finger has been still
  // for the whole hold, so no scroll has started yet and this still cancels.
  // Without it the bag grid scrolls out from under the drag and Chrome fires
  // pointercancel, which (correctly) throws the drop away.
  el.addEventListener(
    'touchmove',
    (e) => {
      if (!recognizer.isDragging()) return;
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  el.addEventListener('pointerup', (e) => {
    const decision = recognizer.pointerUp({
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      x: e.clientX,
      y: e.clientY,
    });
    if (decision.kind === 'ignore') return;
    const payload = held;
    if (decision.kind === 'drop' && payload !== null) {
      e.preventDefault();
      swallowNextClick();
      deps.onDrop(decision.x, decision.y, payload);
      finish(payload, true);
      return;
    }
    finish(payload, false);
  });

  const onLost = (e: PointerEvent): void => {
    // Read the phase BEFORE the cancel resets it: a press that never armed must
    // not fire onEnd (onStart never ran for it).
    const wasDragging = recognizer.isDragging();
    const decision = recognizer.pointerCancel(e.pointerId);
    if (decision.kind === 'ignore') return;
    finish(held, wasDragging);
  };
  el.addEventListener('pointercancel', onLost);
  el.addEventListener('lostpointercapture', onLost);
}
