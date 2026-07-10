// The 3D editor view: owns the WebGL renderer, the free orbit/fly camera, the render
// loop, and all pointer/keyboard interaction. It renders the static world (scene.ts)
// with editor markers (markers.ts) laid over it, and lets the operator orbit/fly the
// camera and drag markers, which mutate the SAME live EditorEntity.point references
// the 2D editor and the patch exporter read. Dev-only tool: English inline strings,
// no t(), never ships to players.

import * as THREE from 'three';
import { assetsReady } from '../../render/assets/preload';
import { initGfxTier } from '../../render/gfx';
import { groundHeight } from '../../sim/world';
import type { EditorEntity } from '../model';
import {
  clampDist,
  flyTarget,
  liftTarget,
  orbitBy,
  orbitEye,
  type OrbitState,
  panTarget,
  zoomDist,
} from './camera';
import { buildMarkers, type MarkerHandles } from './markers';
import { pickGroundXZ, pickMarkerKey, toNdc } from './pick';
import { buildEditorScene, type EditorScene } from './scene';

const FOV = 55;
const FLY_SPEED = 42; // yards/sec at dist=1; scaled by dist so it feels even
const ORBIT_SENS = 0.005;

export interface Editor3dOptions {
  seed: number;
  entities: EditorEntity[]; // SHARED live refs with the 2D model + patch exporter
  onChange: () => void; // after a drag moves a marker (app refreshes the patch panel)
  onSelect?: (entity: EditorEntity | null) => void;
}

export class Editor3dView {
  private readonly webgl: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: EditorScene;
  private markers: MarkerHandles;
  private readonly raycaster = new THREE.Raycaster();
  private readonly byKey = new Map<string, EditorEntity>();

  private readonly cam: OrbitState = { tx: 0, ty: 0, tz: 0, yaw: 0.6, pitch: 0.85, dist: 260 };
  private readonly pressed = new Set<string>();
  private readonly eye = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  private selectedKey: string | null = null;
  private mode: 'idle' | 'orbit' | 'pan' | 'drag' = 'idle';
  private lastX = 0;
  private lastY = 0;
  private dragKey: string | null = null;
  private dragY = 0;

  private raf = 0;
  private prevT = 0;
  private disposed = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly ro: ResizeObserver;
  private readonly opts: Editor3dOptions;

  // The render build modules (foliage/props) read GLBs that must be preloaded first;
  // in the game main.ts awaits assetsReady() before constructing the Renderer, so the
  // editor mirrors that. Use this factory rather than `new` directly.
  static async create(mount: HTMLElement, opts: Editor3dOptions): Promise<Editor3dView> {
    await assetsReady();
    return new Editor3dView(mount, opts);
  }

  constructor(private readonly mount: HTMLElement, opts: Editor3dOptions) {
    this.opts = opts;
    for (const e of opts.entities) this.byKey.set(e.key, e);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'editor3d-canvas';
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    mount.appendChild(this.canvas);

    this.webgl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    initGfxTier(this.webgl); // resolve the GFX tier before building world content

    const { w, h } = this.size();
    this.webgl.setSize(w, h, false);
    this.camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 1200);

    this.world = buildEditorScene(this.webgl, opts.seed);
    this.markers = buildMarkers(opts.entities, opts.seed);
    this.world.scene.add(this.markers.group);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(mount);
    this.prevT = performance.now();
    this.loop();
  }

  private size(): { w: number; h: number } {
    return { w: Math.max(1, this.mount.clientWidth), h: Math.max(1, this.mount.clientHeight) };
  }

  private resize(): void {
    const { w, h } = this.size();
    this.webgl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    return toNdc(clientX, clientY, this.canvas.getBoundingClientRect());
  }

  // World yards per screen pixel at the current orbit distance (for physical panning).
  private worldPerPixel(): number {
    const h = this.size().h;
    return (2 * this.cam.dist * Math.tan((FOV * Math.PI) / 360)) / h;
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (ev) => {
      c.setPointerCapture(ev.pointerId);
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      if (ev.button === 0) {
        const key = pickMarkerKey(this.raycaster, this.camera, this.ndc(ev.clientX, ev.clientY), this.markers.pickMeshes, this.markers.keyOf);
        if (key) {
          this.select(key);
          this.mode = 'drag';
          this.dragKey = key;
          // Drag on a horizontal plane at the marker's own terrain height, so it
          // tracks the cursor; markers.moveTo re-snaps Y to groundHeight after.
          const e = this.byKey.get(key);
          this.dragY = e ? groundHeight(e.point.x, e.point.z, this.opts.seed) : 0;
          c.style.cursor = 'grabbing';
        } else {
          this.mode = 'orbit';
          c.style.cursor = 'grabbing';
        }
      } else {
        this.mode = 'pan';
        c.style.cursor = 'move';
      }
    });
    c.addEventListener('pointermove', (ev) => {
      const dx = ev.clientX - this.lastX;
      const dy = ev.clientY - this.lastY;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      if (this.mode === 'orbit') {
        orbitBy(this.cam, -dx * ORBIT_SENS, -dy * ORBIT_SENS);
      } else if (this.mode === 'pan') {
        const wpp = this.worldPerPixel();
        panTarget(this.cam, -dx * wpp, dy * wpp);
      } else if (this.mode === 'drag' && this.dragKey) {
        const e = this.byKey.get(this.dragKey);
        if (e) {
          const ground = pickGroundXZ(this.raycaster, this.camera, this.ndc(ev.clientX, ev.clientY), this.dragY);
          if (ground) {
            e.point.x = ground.x;
            e.point.z = ground.z;
            this.markers.moveTo(this.dragKey, ground.x, ground.z);
            this.opts.onChange();
          }
        }
      }
    });
    const end = (ev: PointerEvent): void => {
      if (c.hasPointerCapture(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
      this.mode = 'idle';
      this.dragKey = null;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      zoomDist(this.cam, ev.deltaY > 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    // Ignore when typing into a form control (property panel, later phases).
    const t = ev.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = ev.key.toLowerCase();
    if (k === 'f') {
      this.frameAll();
      return;
    }
    if (k === 'escape') {
      this.select(null);
      return;
    }
    this.pressed.add(k);
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.pressed.delete(ev.key.toLowerCase());
  };

  private applyFly(dt: number): void {
    if (this.pressed.size === 0) return;
    const speed = FLY_SPEED * dt * Math.max(0.5, this.cam.dist / 120);
    let fwd = 0;
    let right = 0;
    let up = 0;
    if (this.pressed.has('w') || this.pressed.has('arrowup')) fwd += 1;
    if (this.pressed.has('s') || this.pressed.has('arrowdown')) fwd -= 1;
    if (this.pressed.has('d') || this.pressed.has('arrowright')) right += 1;
    if (this.pressed.has('a') || this.pressed.has('arrowleft')) right -= 1;
    if (this.pressed.has('e')) up += 1;
    if (this.pressed.has('q')) up -= 1;
    if (fwd || right) flyTarget(this.cam, fwd, right, speed);
    if (up) liftTarget(this.cam, up, speed);
  }

  private select(key: string | null): void {
    this.selectedKey = key;
    this.markers.setSelected(key);
    this.opts.onSelect?.(key ? this.byKey.get(key) ?? null : null);
  }

  selectKey(key: string | null): void {
    this.select(key);
  }

  // Rebuild the gizmo layer after the app adds/removes/edits markers (clone, delete,
  // radius change). The entity list is a fresh array sharing the same live points.
  setEntities(entities: EditorEntity[]): void {
    this.byKey.clear();
    for (const e of entities) this.byKey.set(e.key, e);
    this.world.scene.remove(this.markers.group);
    this.markers.dispose();
    this.markers = buildMarkers(entities, this.opts.seed);
    this.world.scene.add(this.markers.group);
    if (this.selectedKey && this.byKey.has(this.selectedKey)) this.markers.setSelected(this.selectedKey);
    else this.selectedKey = null;
  }

  frameAll(): void {
    // Center on the world origin and pull back to frame the ~360-yard strip.
    this.cam.tx = 0;
    this.cam.tz = 0;
    this.cam.ty = 0;
    this.cam.pitch = 0.85;
    this.cam.dist = clampDist(300);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.prevT) / 1000);
    this.prevT = now;

    this.applyFly(dt);
    const e = orbitEye(this.cam);
    this.eye.set(e.x, e.y, e.z);
    this.target.set(this.cam.tx, this.cam.ty, this.cam.tz);
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);

    this.world.update(this.target, this.eye, now / 1000, dt);
    this.webgl.render(this.world.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.markers.dispose();
    this.world.dispose();
    this.webgl.dispose();
    this.webgl.forceContextLoss();
    this.canvas.remove();
  }
}
