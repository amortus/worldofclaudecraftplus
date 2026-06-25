import * as THREE from 'three';
import { loadGltf } from './assets/loader';

export interface SkyLandmarkOpts {
  /** logical GLB path, e.g. '/models/props/Naxx.glb' */
  url: string;
  /** target max dimension in world units (the model is scaled to this) */
  size: number;
  /** x/z offset from the camera each frame; y is the fixed world altitude */
  offset: THREE.Vector3;
  /** radians/second of slow yaw spin (0 = still) */
  spin?: number;
}

// A large structure floating in the sky, meant to be visible from anywhere
// outdoors (e.g. a flying necropolis over the whole world). It rides WITH the
// camera in X/Z, so it stays at a fixed point of the sky like a distant skybox
// landmark (no parallax to outrun), at a fixed altitude, turning slowly. Its
// materials render fog-free and frustum-cull-free so distance never hides or
// washes it out. A new visual system in its own module per the render rules;
// the renderer creates one and ticks update() each frame.
export class SkyLandmark {
  readonly group = new THREE.Group();
  private readonly offset: THREE.Vector3;
  private readonly spin: number;
  private angle = 0;
  private ready = false;

  constructor(scene: THREE.Object3D, opts: SkyLandmarkOpts) {
    this.offset = opts.offset.clone();
    this.spin = opts.spin ?? 0;
    this.group.visible = false;
    this.group.frustumCulled = false;
    scene.add(this.group);
    void loadGltf(opts.url)
      .then((gltf) => {
        const model = gltf.scene;
        // Scale to the requested world size from the model's own bounding box,
        // then recenter so the group origin is the model's centre (clean spin).
        const box = new THREE.Box3().setFromObject(model);
        const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
        const scale = opts.size / span;
        model.scale.setScalar(scale);
        model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(scale));
        model.traverse((o) => {
          o.frustumCulled = false;
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const mat = mesh.material;
          for (const m of Array.isArray(mat) ? mat : [mat]) if (m) (m as THREE.Material & { fog?: boolean }).fog = false;
        });
        this.group.add(model);
        this.ready = true;
      })
      .catch(() => {
        /* asset missing or failed to decode: the landmark just stays hidden */
      });
  }

  /** Per-frame: ride the camera, spin slowly, show only while `visible`. */
  update(camera: THREE.Camera, dt: number, visible: boolean): void {
    if (!this.ready) return;
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(
      camera.position.x + this.offset.x,
      this.offset.y,
      camera.position.z + this.offset.z,
    );
    if (this.spin) {
      this.angle += this.spin * dt;
      this.group.rotation.y = this.angle;
    }
  }
}
