// Pure two-finger gesture math: how a pair of pointers becomes a zoom factor and
// a pan delta. DOM-free so a Vitest drives it directly; `pinch_zoom.ts` is the
// thin consumer that owns PointerEvent, pointer capture and preventDefault.
//
// The world map already zooms with the wheel and pans with a mouse drag; this is
// the touch path onto the SAME state (Hud.mapZoom / Hud.mapCenter), not a second
// zoom model. Each move reports:
//  - `scale`, a MULTIPLICATIVE factor since the previous accepted sample, so the
//    consumer just calls its existing `zoomMap(factor)`;
//  - `panX`/`panY`, the centroid's travel in CSS px since the previous sample, so
//    the consumer reuses its existing px-to-world conversion.
//
// Deadzone: a distance change smaller than PINCH_DEADZONE_PX reports scale 1 and
// does NOT advance the baseline, so two fingers that merely slide together (a
// pan) do not jitter the zoom, while a slow deliberate pinch still accumulates
// until it crosses the threshold.

export const PINCH_DEADZONE_PX = 6;

export interface PinchPointer {
  pointerId: number;
  x: number;
  y: number;
}

export interface PinchPoint {
  x: number;
  y: number;
}

export interface PinchUpdate {
  /** True on the sample where the second finger lands: the consumer should
   *  cancel any one-finger drag it had started. */
  started: boolean;
  /** True while two or more pointers are down: the consumer preventDefaults. */
  active: boolean;
  /** Multiplicative zoom since the last accepted sample; 1 means "no zoom". */
  scale: number;
  /** Two-finger pan in CSS px since the last sample. */
  panX: number;
  panY: number;
}

const IDLE: PinchUpdate = { started: false, active: false, scale: 1, panX: 0, panY: 0 };

function idle(): PinchUpdate {
  return { ...IDLE };
}

export function pinchDistance(a: PinchPoint, b: PinchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchCentroid(points: readonly PinchPoint[]): PinchPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * The zoom factor between two finger spreads. Returns exactly 1 (a no-op the
 * consumer can skip) for a non-finite, degenerate or inside-the-deadzone change.
 */
export function pinchScaleFactor(
  previousDistance: number,
  currentDistance: number,
  deadzone = PINCH_DEADZONE_PX,
): number {
  if (
    !Number.isFinite(previousDistance) ||
    !Number.isFinite(currentDistance) ||
    previousDistance <= 0 ||
    currentDistance <= 0 ||
    Math.abs(currentDistance - previousDistance) < deadzone
  )
    return 1;
  return currentDistance / previousDistance;
}

/**
 * Two-finger pinch + pan state for one surface. Tracks every live pointer so a
 * third finger, or one finger being replaced mid-gesture, re-baselines instead
 * of producing a jump.
 */
export class PinchGesture {
  private readonly pointers = new Map<number, PinchPoint>();
  private previousDistance: number | null = null;
  private previousCentroid: PinchPoint | null = null;
  private readonly deadzone: number;

  constructor(options: { deadzone?: number } = {}) {
    this.deadzone = options.deadzone ?? PINCH_DEADZONE_PX;
  }

  pointerCount(): number {
    return this.pointers.size;
  }

  isPinching(): boolean {
    return this.pointers.size > 1;
  }

  pointerDown(pointer: PinchPointer): PinchUpdate {
    const wasPinching = this.isPinching();
    this.pointers.set(pointer.pointerId, { x: pointer.x, y: pointer.y });
    if (this.pointers.size < 2) {
      this.clearBaseline();
      return idle();
    }
    this.rebaseline();
    return {
      started: !wasPinching,
      active: true,
      scale: 1,
      panX: 0,
      panY: 0,
    };
  }

  pointerMove(pointer: PinchPointer): PinchUpdate {
    if (!this.pointers.has(pointer.pointerId)) return idle();
    this.pointers.set(pointer.pointerId, { x: pointer.x, y: pointer.y });
    if (this.pointers.size !== 2 || this.previousDistance === null || this.previousCentroid === null)
      return { started: false, active: this.isPinching(), scale: 1, panX: 0, panY: 0 };

    const points = [...this.pointers.values()];
    const distance = pinchDistance(points[0], points[1]);
    const centroid = pinchCentroid(points);
    const panX = centroid.x - this.previousCentroid.x;
    const panY = centroid.y - this.previousCentroid.y;
    this.previousCentroid = centroid;

    const scale = pinchScaleFactor(this.previousDistance, distance, this.deadzone);
    // Inside the deadzone the baseline deliberately stays put, so a slow pinch
    // still accumulates toward the threshold instead of being sampled away.
    if (scale !== 1) this.previousDistance = distance;

    return { started: false, active: true, scale, panX, panY };
  }

  /** A finger lifted or its capture was lost. */
  pointerEnd(pointerId: number): PinchUpdate {
    if (!this.pointers.delete(pointerId)) return idle();
    if (this.pointers.size === 2) this.rebaseline();
    else this.clearBaseline();
    return { started: false, active: this.isPinching(), scale: 1, panX: 0, panY: 0 };
  }

  reset(): void {
    this.pointers.clear();
    this.clearBaseline();
  }

  private rebaseline(): void {
    const points = [...this.pointers.values()];
    if (points.length !== 2) {
      this.clearBaseline();
      return;
    }
    this.previousDistance = pinchDistance(points[0], points[1]);
    this.previousCentroid = pinchCentroid(points);
  }

  private clearBaseline(): void {
    this.previousDistance = null;
    this.previousCentroid = null;
  }
}
