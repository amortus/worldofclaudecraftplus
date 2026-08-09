// Prefix-only geometry uploads.
//
// Three.js uploads an attribute's WHOLE array on `needsUpdate` unless the
// attribute carries update ranges, so a pool that is mostly idle still pays
// full `bufferSubData` bandwidth every frame. Every pool in this renderer packs
// its live data into a leading prefix (the VFX ring's high-water mark, the blob
// shadow's placed-instance count), so flagging just that prefix is exact, not an
// approximation.
//
// Two three.js details this encodes once instead of at each call site:
//  - update ranges are measured in ARRAY ELEMENTS, not vertices/instances, hence
//    the itemSize multiply;
//  - `WebGLAttributes` only calls `clearUpdateRanges()` on a frame it actually
//    uploads, so a range pushed on a frame that never rendered would linger and
//    stack. Clearing first keeps it at exactly one range.

import type * as THREE from 'three';

/**
 * Flag the first `count` vertices/instances of `attr` for upload. A `count` of
 * 0 or less uploads nothing at all (deliberately NOT a full upload: leaving
 * `needsUpdate` alone here is what lets a caller's own pending full upload,
 * e.g. after a pool clear, still reach the GPU).
 */
export function uploadPrefix(attr: THREE.BufferAttribute, count: number): void {
  attr.clearUpdateRanges();
  if (count <= 0) return;
  attr.addUpdateRange(0, count * attr.itemSize);
  attr.needsUpdate = true;
}
