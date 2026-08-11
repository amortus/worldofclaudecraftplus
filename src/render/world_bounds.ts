// Where the world actually IS, for every render sweep that scatters something
// across it (foliage dressing, the grass ring, critters, fish, motes).
//
// PURE and host-agnostic (no THREE, no DOM), so a Vitest drives it directly.
//
// The world used to be a single 360yd strip, so "in bounds" was one symmetric
// half width: `Math.abs(x) > WORLD_MAX_X - inset`. It is now a 3 column grid,
// and the grid HAS HOLES: `WORLD_MIN_X`/`WORLD_MAX_X` are only the bounding box
// of every zone rect, and most z rows have no column zone beside the strip, so
// large parts of that box belong to no zone at all. Two separate questions come
// out of that, and a sweep needs both:
//
//   1. Is this position inside an authored zone? -> `zoneContaining` (sim/data),
//      the same strict rect lookup `generateDecorations` (sim/world) gates on.
//      Null means the void behind the rim: nothing may be placed there.
//   2. Is it clear of the rim wall? -> `insideWorldRim`. The rim is PER ROW now
//      (sim/world raises it at `worldHalfWidthAt(z)`), so the old constant
//      half-width inset has to follow the row.
import {
  STRIP_MAX_X, STRIP_MIN_X, WORLD_MIN_Z, worldHalfWidthAt, worldNorthEdgeAt, ZONES,
} from '../sim/data';

export interface XSpan {
  minX: number;
  maxX: number;
}

/**
 * Is (x, z) at least `inset` yards clear of the world rim on every side?
 *
 * The x half width is per row, so a row a column zone occupies is bounded at
 * the column's outer edge and every other row keeps the strip's own rim exactly
 * where it always was.
 */
export function insideWorldRim(x: number, z: number, inset: number): boolean {
  // The north edge is per column too (sim/data worldNorthEdgeAt): the strip
  // ends at the Frostveil while the two columns beside it run further north, so
  // a single WORLD_MAX_Z would call the corridor between them in bounds.
  if (z < WORLD_MIN_Z + inset || z > worldNorthEdgeAt(x) - inset) return false;
  return Math.abs(x) <= worldHalfWidthAt(z, x) - inset;
}

/**
 * Bounding x span of every zone rect whose band covers z (widened by `margin`
 * on all four sides), or null when no zone comes within `margin` of the row.
 *
 * A whole-world sweep uses this to skip the holes cheaply: rather than hashing,
 * sampling terrain and testing camps for a cell no zone owns, it walks only the
 * x range some zone in that row could reach. `margin` must cover whatever
 * jitter the sweep applies after picking a cell, so the span can never drop a
 * cell whose jittered position would have landed inside a zone.
 */
export function zoneRowSpanX(z: number, margin = 0): XSpan | null {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const zone of ZONES) {
    if (z + margin < zone.zMin || z - margin >= zone.zMax) continue;
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
  }
  if (minX > maxX) return null;
  return { minX: minX - margin, maxX: maxX + margin };
}

/**
 * Does any zone rect overlap the axis-aligned rect [minX, maxX) x [minZ, maxZ)?
 * The chunk-level early out for the grass ring: a chunk entirely over the void
 * builds nothing at all instead of testing every candidate blade in it.
 */
export function rectHasZone(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  for (const zone of ZONES) {
    if (maxZ <= zone.zMin || minZ >= zone.zMax) continue;
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (maxX > x0 && minX < x1) return true;
  }
  return false;
}
