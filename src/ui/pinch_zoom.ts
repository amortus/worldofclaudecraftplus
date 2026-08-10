// Thin DOM binding for the pure two-finger gesture core (pinch_zoom_core).
//
// Everything decision-shaped (deadzone, baselines, third-finger handling, the
// pan delta) is in the core; this owns PointerEvent, pointer capture and
// preventDefault only. The world map's mouse wheel zoom and one-finger drag pan
// stay exactly as they were: this drives the SAME `zoomMap` / `mapCenter` state
// from two fingers.

import { PinchGesture } from './pinch_zoom_core';

export interface PinchZoomHooks {
  /** A second finger landed: cancel whatever one-finger drag was in flight. */
  onStart(): void;
  /** `scale` is multiplicative since the last sample (1 is filtered out before
   *  this fires); `panX`/`panY` are the centroid's travel in CSS px. */
  onGesture(scale: number, panX: number, panY: number): void;
  /** The last of the two fingers lifted. */
  onEnd(): void;
}

export interface PinchZoomBinding {
  isPinching(): boolean;
  reset(): void;
}

/** Bind pinch zoom + two-finger pan to a surface. Touch pointers only: a mouse
 *  keeps the wheel/drag path, and a stylus is treated like a finger. */
export function bindPinchZoom(el: HTMLElement, hooks: PinchZoomHooks): PinchZoomBinding {
  const gesture = new PinchGesture();

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const update = gesture.pointerDown({ pointerId: e.pointerId, x: e.clientX, y: e.clientY });
    if (!update.active) return;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already released */
    }
    e.preventDefault();
    if (update.started) hooks.onStart();
  });

  el.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'mouse') return;
      const update = gesture.pointerMove({ pointerId: e.pointerId, x: e.clientX, y: e.clientY });
      if (!update.active) return;
      e.preventDefault();
      if (update.scale === 1 && update.panX === 0 && update.panY === 0) return;
      hooks.onGesture(update.scale, update.panX, update.panY);
    },
    { passive: false },
  );

  const end = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    const wasPinching = gesture.isPinching();
    gesture.pointerEnd(e.pointerId);
    if (wasPinching && !gesture.isPinching()) hooks.onEnd();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);

  return {
    isPinching: () => gesture.isPinching(),
    reset: () => gesture.reset(),
  };
}
