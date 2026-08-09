// Freezing static scene-graph transforms.
//
// Three.js recomposes an object's local matrix from position/quaternion/scale on
// EVERY frame for every object with `matrixAutoUpdate` on, whether or not it has
// moved since the world was built. Terrain chunks have opted out of that since
// they were written; props, foliage and dungeon interiors are equally static
// (their variation lives in the geometry, in instance matrices, or in material
// flags) but were still paying for it, several hundred composes a frame on the
// tier that can least afford them.
//
// Freezing is transform-only: `visible`, material flags, instance matrices and
// child add/remove all keep working. Objects added AFTER a freeze are untouched
// and keep their own auto-update, which is what the grass ring and any streamed
// geometry rely on.

import type * as THREE from 'three';

/**
 * Update `root`'s world matrices once, then stop three from recomposing the
 * local matrix of `root` and its current descendants every frame.
 *
 * Anything that still animates its own transform must be listed in `animated`
 * (only the listed object is spared, not its subtree, so pass the actual movers,
 * e.g. the flame meshes the renderer rescales each frame). If you later move a
 * frozen object you must call `updateMatrix()` on it yourself.
 */
export function freezeStaticMatrices(
  root: THREE.Object3D,
  animated?: ReadonlySet<THREE.Object3D>,
): void {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (animated?.has(obj)) return;
    obj.matrixAutoUpdate = false;
  });
}
