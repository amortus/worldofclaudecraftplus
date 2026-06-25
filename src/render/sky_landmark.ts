import * as THREE from 'three';
import { groundHeight } from '../sim/world';
import { loadGltf } from './assets/loader';

export interface SkyLandmarkOpts {
  /** logical GLB path, e.g. '/models/props/Naxx.glb' */
  url: string;
  /** target max dimension in world units (the model is scaled to this) */
  size: number;
  /** x/z offset from the camera each frame; y is the altitude in HIGH mode. */
  offset: THREE.Vector3;
  /** radians/second of slow yaw spin (0 = still) */
  spin?: number;
  /** When set, hover the model's BASE this many world units above the TERRAIN
   *  (LOW mode) instead of at the fixed offset.y altitude (HIGH skybox mode);
   *  the world seed must be passed to update() so the height tracks the ground. */
  clearance?: number;
  /** Keep scene fog on the model so it sits in the zone's atmosphere (LOW mode);
   *  default off so a HIGH skybox landmark stays crisp at any distance. */
  fog?: boolean;
}

// A large structure that follows the camera in X/Z. Two modes:
//  - HIGH (default): pinned at a fixed sky altitude (offset.y), fog-free - a
//    distant skybox landmark always in the sky.
//  - LOW (clearance set): hovers a little above the terrain (groundHeight +
//    clearance), fog on - e.g. a necropolis drifting low over one zone. The
//    renderer builds one and gates update()'s `visible` to the right zone.
export class SkyLandmark {
  readonly group = new THREE.Group();
  private readonly offset: THREE.Vector3;
  private readonly spin: number;
  private readonly clearance: number | null;
  private angle = 0;
  private ready = false;

  constructor(scene: THREE.Object3D, opts: SkyLandmarkOpts) {
    this.offset = opts.offset.clone();
    this.spin = opts.spin ?? 0;
    this.clearance = opts.clearance ?? null;
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);
    void loadGltf(opts.url)
      .then((gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
        const scale = opts.size / span;
        model.scale.setScalar(scale);
        // Centre on X/Z and drop the model's BASE to the group origin, so the
        // group's Y is the base height (clean for "hovering above the ground").
        const c = box.getCenter(new THREE.Vector3());
        model.position.set(-c.x * scale, -box.min.y * scale, -c.z * scale);
        const keepFog = opts.fog ?? false;
        model.traverse((o) => {
          o.frustumCulled = false;
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const mat = mesh.material;
          for (const m of Array.isArray(mat) ? mat : [mat]) {
            if (m) (m as THREE.Material & { fog?: boolean }).fog = keepFog;
          }
        });
        this.group.add(model);
        this.ready = true;
      })
      .catch(() => {
        /* asset missing or failed to decode: the landmark just stays hidden */
      });
  }

  /** Per-frame: ride the camera, spin slowly, show only while `visible`. In LOW
   *  mode pass the world seed so the altitude tracks the terrain. */
  update(camera: THREE.Camera, dt: number, visible: boolean, seed = 0): void {
    if (!this.ready) return;
    this.group.visible = visible;
    if (!visible) return;
    const x = camera.position.x + this.offset.x;
    const z = camera.position.z + this.offset.z;
    const y = this.clearance !== null ? groundHeight(x, z, seed) + this.clearance : this.offset.y;
    this.group.position.set(x, y, z);
    if (this.spin) {
      this.angle += this.spin * dt;
      this.group.rotation.y = this.angle;
    }
  }
}
