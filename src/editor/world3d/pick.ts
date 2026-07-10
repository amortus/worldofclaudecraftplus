// Raycasting helpers for the 3D editor: turn a pointer position into either the
// marker under the cursor (selection) or a ground-plane (x, z) (drag target). The
// ground pick intersects a horizontal plane at a chosen Y rather than the terrain
// mesh, so dragging is stable over LOD chunk seams; the caller then snaps the final
// Y to groundHeight (markers.ts does this in moveTo).

import * as THREE from 'three';

// Pointer client coords -> normalized device coords in [-1, 1], y flipped.
export function toNdc(clientX: number, clientY: number, rect: DOMRect): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -(((clientY - rect.top) / rect.height) * 2 - 1),
  );
}

// The entity key of the nearest marker under the cursor, or null. `keyOf` walks an
// intersected object up to its marker group's userData.key (markers.ts supplies it).
export function pickMarkerKey(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  ndc: THREE.Vector2,
  pickMeshes: THREE.Object3D[],
  keyOf: (obj: THREE.Object3D) => string | null,
): string | null {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  for (const h of hits) {
    const k = keyOf(h.object);
    if (k) return k;
  }
  return null;
}

const scratchPlane = new THREE.Plane();
const scratchHit = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// The (x, z) where the cursor ray meets the horizontal plane y = planeY, or null if
// the ray is parallel to it. Y is intentionally dropped; the caller re-derives it.
export function pickGroundXZ(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  ndc: THREE.Vector2,
  planeY: number,
): { x: number; z: number } | null {
  raycaster.setFromCamera(ndc, camera);
  scratchPlane.setFromNormalAndCoplanarPoint(UP, new THREE.Vector3(0, planeY, 0));
  const hit = raycaster.ray.intersectPlane(scratchPlane, scratchHit);
  if (!hit) return null;
  return { x: hit.x, z: hit.z };
}
