// The static game world, rebuilt for the editor from a seed alone. Reuses the exact
// renderer build modules (terrain/water/foliage/props/sky) and the sim height field,
// so what the operator sees and drags markers over is byte-for-byte the world the
// player walks. No Sim, no server, no player avatar: this is just the static scene
// plus lights, driven by a free editor camera (view.ts).
//
// PRECONDITION: initGfxTier(webgl) MUST have run before this is called (view.ts does
// it), because the build* modules read the resolved GFX tier.

import * as THREE from 'three';
import { GFX, SUN_ANCHOR } from '../../render/gfx';
import { buildFoliage } from '../../render/foliage';
import { buildProps } from '../../render/props';
import { buildSky } from '../../render/sky';
import { buildTerrain } from '../../render/terrain';
import { buildWater } from '../../render/water';

const FOG_FAR = 470;

export interface EditorScene {
  scene: THREE.Scene;
  /** per-frame: fog culling + water/foliage/sky animation, keyed off the camera */
  update(target: THREE.Vector3, eye: THREE.Vector3, time: number, dt: number): void;
  dispose(): void;
}

export function buildEditorScene(webgl: THREE.WebGLRenderer, seed: number): EditorScene {
  const scene = new THREE.Scene();
  const lowGfx = !GFX.standardMaterials;
  const skyColor = lowGfx ? 0xb6cddd : 0xa6c6e0;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 130, FOG_FAR);

  const sky = buildSky(lowGfx, SUN_ANCHOR);
  scene.add(sky.dome);

  const terrain = buildTerrain(seed);
  scene.add(terrain.group);
  const water = buildWater(seed);
  for (const m of water.meshes) scene.add(m);
  const foliage = buildFoliage(seed);
  scene.add(foliage.group);
  const props = buildProps(seed);
  scene.add(props.group);

  // Lights mirror the renderer's key + fill so PBR materials read the same.
  const hemi = new THREE.HemisphereLight(0xdcefff, 0x465f39, lowGfx ? 0.98 : 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(lowGfx ? 0xfff0d0 : 0xffedd0, 2.65);
  sun.position.copy(SUN_ANCHOR);
  scene.add(sun);

  // PMREM environment gives the PBR materials their reflections (skipped on low,
  // which uses Lambert and needs no IBL). Falls back to prefiltering the dome.
  const envRTs: THREE.WebGLRenderTarget[] = [];
  if (!lowGfx) {
    const pmrem = new THREE.PMREMGenerator(webgl);
    const eq = sky.envTexture('vale');
    if (eq) {
      const rt = pmrem.fromEquirectangular(eq);
      scene.environment = rt.texture;
      scene.environmentRotation.y = sky.envRotationY('vale');
      envRTs.push(rt);
    } else {
      const envScene = new THREE.Scene();
      envScene.add(sky.dome.clone());
      const rt = pmrem.fromScene(envScene, 0.04, 0.1, 1100);
      scene.environment = rt.texture;
      envRTs.push(rt);
    }
    pmrem.dispose();
  }

  const update = (target: THREE.Vector3, eye: THREE.Vector3, time: number, dt: number): void => {
    terrain.update(target.x, target.z, FOG_FAR);
    water.update(time);
    foliage.update(target.x, target.z, target.x, target.y, target.z, eye.x, eye.y, eye.z, FOG_FAR);
    props.update(target.x, target.y, target.z, eye.x, eye.y, eye.z, FOG_FAR);
    sky.setCameraZ(target.z, dt);
  };

  const dispose = (): void => {
    for (const rt of envRTs) rt.dispose();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose?.();
    });
    scene.clear();
  };

  return { scene, update, dispose };
}
