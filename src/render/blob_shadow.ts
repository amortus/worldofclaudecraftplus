// Blob shadows: a soft radial-gradient disc under each character, for the tiers that
// run WITHOUT a shadow map (GFX.blobShadows, i.e. low). A real shadow pass re-renders
// scene depth from the sun every few frames; this is ONE InstancedMesh with ONE
// canvas-gradient material, so grounding every visible character costs a single draw
// call and a matrix upload. It is what the phone-class MMOs ship (AQ3D's characters sit
// on exactly this kind of disc) instead of shadow maps.

import * as THREE from 'three';
import { uploadPrefix } from './upload_range';

const TEX_SIZE = 64;

function blobTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(
    TEX_SIZE / 2, TEX_SIZE / 2, 0,
    TEX_SIZE / 2, TEX_SIZE / 2, TEX_SIZE / 2,
  );
  // Dark center fading to fully transparent at the rim; the alpha carries the shadow,
  // the color stays black so it darkens whatever ground it overlays.
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface BlobShadowsView {
  mesh: THREE.InstancedMesh;
  /** start a frame: forget last frame's placements */
  begin(): void;
  /** place one disc; (x, y, z) is the character's FEET position, radius in yards */
  place(x: number, y: number, z: number, radius: number): void;
  /** end a frame: upload the instance matrices actually used */
  commit(): void;
  dispose(): void;
}

const tmpMat = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

export function buildBlobShadows(max: number): BlobShadowsView {
  const geo = new THREE.PlaneGeometry(2, 2); // unit disc footprint; radius scales it
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
    // Lifted a hair above the ground and depth-tested, so slopes clip it naturally
    // instead of it floating through hills; polygonOffset avoids terrain z-fighting.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'blob-shadows';
  mesh.count = 0;
  mesh.frustumCulled = false; // instances move every frame; culling the whole batch mid-update pops
  mesh.renderOrder = -1; // under characters and vfx
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  let used = 0;

  return {
    mesh,
    begin() {
      used = 0;
    },
    place(x: number, y: number, z: number, radius: number) {
      if (used >= max) return; // cap is the budget: past it, farthest characters just lack a disc
      tmpPos.set(x, y + 0.06, z);
      tmpScale.setScalar(radius);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(used, tmpMat);
      used++;
    },
    commit() {
      mesh.count = used;
      // Upload only the discs actually placed this frame, not the whole 48-disc
      // pool (one instance matrix is 16 floats, which uploadPrefix derives from
      // the attribute's itemSize).
      uploadPrefix(mesh.instanceMatrix, used);
    },
    dispose() {
      geo.dispose();
      mat.map?.dispose();
      mat.dispose();
    },
  };
}
