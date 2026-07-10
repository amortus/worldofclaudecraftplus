// Tier 0 marker map editor: the plain-TS/DOM app shell that composes the pure
// model/canvas/view trio into an authoring surface. Drag hubs, graveyards, lakes,
// POIs, camps, NPCs, and ground objects on a 2D overhead canvas; the app diffs the
// moved markers against a load-time snapshot and emits a human-readable patch to
// hand-paste back into src/sim/content/*.ts. It NEVER feeds the running sim: it
// reads content that is the source of truth and only produces paste-back text.
//
// This is a dev-only authoring aid (served at /editor, noindex, excluded from the
// shipped game bundle and the native app). Its UI strings are English-only inline
// dev-channel text, not t() keys: the tool never ships to players.

import { draw, KIND_COLOR } from './canvas';
import {
  type BaseRec,
  buildApplyOps,
  buildEntities,
  buildPatch,
  type EditorEntity,
  type EntityKind,
  renderPatch,
  snapshotFull,
  type ZoneContent,
} from './model';
import { Camera, pickHandle, type ScreenPoint, type Vec2, type Viewport } from './view';
// Type-only: the 3D subsystem (Three.js + renderer modules) is loaded lazily via a
// dynamic import() when the operator opens 3D, so the 2D editor stays lightweight.
import type { Editor3dView } from './world3d';

// Mirrors WORLD_SEED in src/main.ts (the persistent world's fixed seed). The 3D
// editor must build terrain on the same seed so markers sit on the real surface.
const WORLD_SEED = 20061;

const KIND_LABEL: Record<EntityKind, string> = {
  hub: 'Hub',
  graveyard: 'Graveyard',
  lake: 'Lake',
  poi: 'Point of interest',
  camp: 'Mob camp',
  npc: 'NPC',
  object: 'Ground object',
};

export class EditorApp {
  private readonly content: ZoneContent;
  private entities: EditorEntity[];
  private readonly base: Map<string, BaseRec>;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly patchPre: HTMLPreElement;
  private readonly selInfo: HTMLDivElement;
  private readonly cam = new Camera({ x: 0, z: 0 }, 2);

  private selectedKey: string | null = null;
  private hoverKey: string | null = null;

  // Pointer interaction state.
  private dragKey: string | null = null; // marker being dragged
  private grab: Vec2 = { x: 0, z: 0 }; // world offset from marker point to cursor
  private panning = false;
  private lastPointer: ScreenPoint = { sx: 0, sy: 0 };

  private dirty = true;

  // 3D view state. `stage` hosts either the 2D canvas or the 3D host; `view3d` is the
  // live 3D editor (null in 2D mode). Both modes share `this.entities`, so a drag in
  // either updates the same live points the patch exporter reads.
  private stage!: HTMLElement;
  private view3d: Editor3dView | null = null;
  private entering3d = false;
  private mode3dBtn!: HTMLButtonElement;

  constructor(mount: HTMLElement, content: ZoneContent) {
    this.content = content;
    this.entities = buildEntities(content);
    this.base = snapshotFull(this.entities);

    mount.innerHTML = '';
    mount.classList.add('editor-root');

    const topbar = document.createElement('div');
    topbar.className = 'editor-topbar';
    const title = document.createElement('span');
    title.className = 'editor-title';
    title.textContent = 'Map Editor';
    const hint = document.createElement('span');
    hint.className = 'editor-hint';
    hint.textContent = 'Drag markers to reposition. Emit a patch, then paste it into src/sim/content.';
    topbar.append(title, hint, this.button('Frame all', () => this.frameAll()));
    topbar.append(this.button('Reset view', () => this.resetView()));
    this.mode3dBtn = this.button('3D view', () => void this.toggle3d());
    topbar.append(this.mode3dBtn);
    topbar.append(this.button('Copy patch', () => void this.copyPatch()));
    // Write-back is dev-only: the endpoint lives in a vite serve-time plugin, so gate
    // the button on DEV (vite strips this branch from the production bundle).
    if (import.meta.env.DEV) {
      topbar.append(this.button('Apply to files (dev)', () => void this.applyToFiles()));
    }

    const body = document.createElement('div');
    body.className = 'editor-body';

    const stage = document.createElement('div');
    stage.className = 'editor-stage';
    stage.style.position = 'relative'; // lets the 3D host fill it via inset:0
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    stage.appendChild(this.canvas);

    const side = document.createElement('div');
    side.className = 'editor-side';
    side.appendChild(this.buildLegend());
    this.selInfo = document.createElement('div');
    this.selInfo.className = 'editor-selinfo';
    side.appendChild(this.selInfo);
    const patchHead = document.createElement('div');
    patchHead.className = 'editor-side-head';
    patchHead.textContent = 'Paste-back patch';
    side.appendChild(patchHead);
    this.patchPre = document.createElement('pre');
    this.patchPre.className = 'editor-patch';
    side.appendChild(this.patchPre);

    body.append(stage, side);
    mount.append(topbar, body);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas context unavailable');
    this.ctx = ctx;

    this.refreshSelInfo();
    this.refreshPatch();
    this.attachEvents(stage);
    window.addEventListener('resize', this.resize);
    // Defer the first sizing until layout has run so clientWidth/Height are real.
    requestAnimationFrame(() => {
      this.resize();
      this.frameAll();
      requestAnimationFrame(this.tick);
    });
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'editor-btn';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  private buildLegend(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'editor-legend';
    const head = document.createElement('div');
    head.className = 'editor-side-head';
    head.textContent = 'Marker kinds';
    wrap.appendChild(head);
    (Object.keys(KIND_LABEL) as EntityKind[]).forEach((kind) => {
      const row = document.createElement('div');
      row.className = 'editor-legend-row';
      const sw = document.createElement('span');
      sw.className = 'editor-legend-swatch';
      sw.style.background = KIND_COLOR[kind];
      const lbl = document.createElement('span');
      lbl.textContent = KIND_LABEL[kind];
      row.append(sw, lbl);
      wrap.appendChild(row);
    });
    return wrap;
  }

  // ---- geometry helpers ---------------------------------------------------------------

  private vp(): Viewport {
    return { width: this.canvas.clientWidth, height: this.canvas.clientHeight };
  }

  private pointerAt(ev: { clientX: number; clientY: number }): ScreenPoint {
    const r = this.canvas.getBoundingClientRect();
    return { sx: ev.clientX - r.left, sy: ev.clientY - r.top };
  }

  private pickEntity(s: ScreenPoint): EditorEntity | null {
    const handles = this.entities.map((e) => ({
      id: e.key,
      x: e.point.x,
      z: e.point.z,
      radius: e.radius,
    }));
    const hit = pickHandle(handles, s, this.cam, this.vp());
    return hit ? (this.entities.find((e) => e.key === hit.id) ?? null) : null;
  }

  private frameAll(): void {
    const pts = this.entities.map((e) => e.point);
    if (pts.length === 0) return;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.x > maxX) maxX = p.x;
      if (p.z > maxZ) maxZ = p.z;
    }
    this.cam.frame({ x: minX, z: minZ }, { x: maxX, z: maxZ }, this.vp());
    this.dirty = true;
  }

  private resetView(): void {
    this.cam.center = { x: 0, z: 0 };
    this.cam.pxPerYard = 2;
    this.dirty = true;
  }

  // ---- events -------------------------------------------------------------------------

  private attachEvents(stage: HTMLElement): void {
    stage.addEventListener('pointerdown', (ev) => {
      if (this.view3d) return; // 3D host handles its own pointers
      const s = this.pointerAt(ev);
      this.lastPointer = s;
      const w = this.cam.screenToWorld(s, this.vp());
      // Any non-primary button, or primary on empty space, pans the view.
      if (ev.button !== 0) {
        this.panning = true;
        stage.setPointerCapture(ev.pointerId);
        return;
      }
      const hit = this.pickEntity(s);
      if (hit) {
        this.dragKey = hit.key;
        this.selectedKey = hit.key;
        this.grab = { x: w.x - hit.point.x, z: w.z - hit.point.z };
        this.refreshSelInfo();
        this.dirty = true;
      } else {
        this.panning = true;
      }
      stage.setPointerCapture(ev.pointerId);
    });

    stage.addEventListener('pointermove', (ev) => {
      if (this.view3d) return;
      const s = this.pointerAt(ev);
      const dx = s.sx - this.lastPointer.sx;
      const dy = s.sy - this.lastPointer.sy;
      this.lastPointer = s;
      if (this.dragKey) {
        const e = this.entities.find((x) => x.key === this.dragKey);
        if (e) {
          const w = this.cam.screenToWorld(s, this.vp());
          e.point.x = w.x - this.grab.x;
          e.point.z = w.z - this.grab.z;
          this.refreshSelInfo();
          this.refreshPatch();
          this.dirty = true;
        }
      } else if (this.panning) {
        this.cam.panByPixels(dx, dy);
        this.dirty = true;
      } else {
        const hit = this.pickEntity(s);
        const key = hit ? hit.key : null;
        if (key !== this.hoverKey) {
          this.hoverKey = key;
          stage.style.cursor = key ? 'grab' : 'default';
          this.dirty = true;
        }
      }
    });

    const end = (ev: PointerEvent): void => {
      this.dragKey = null;
      this.panning = false;
      try {
        stage.releasePointerCapture(ev.pointerId);
      } catch {
        // pointer capture may already be gone; ignore.
      }
      this.dirty = true;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('contextmenu', (ev) => ev.preventDefault());

    stage.addEventListener(
      'wheel',
      (ev) => {
        if (this.view3d) return;
        ev.preventDefault();
        const factor = Math.exp(-ev.deltaY * 0.0015);
        this.cam.zoomAt(this.pointerAt(ev), factor, this.vp());
        this.dirty = true;
      },
      { passive: false },
    );

    window.addEventListener('keydown', (ev) => {
      if (this.view3d) return; // the 3D view owns its own key handling
      if (ev.key === 'Escape' && this.selectedKey) {
        this.selectedKey = null;
        this.refreshSelInfo();
        this.dirty = true;
      } else if (ev.key.toLowerCase() === 'f') {
        this.frameAll();
      }
    });
  }

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  };

  // ---- render + panels ----------------------------------------------------------------

  private tick = (): void => {
    if (this.dirty && !this.view3d) {
      draw(this.ctx, this.cam, this.vp(), {
        entities: this.entities,
        roads: this.content.roads ?? [],
        selectedKey: this.selectedKey,
        hoverKey: this.hoverKey,
      });
      this.dirty = false;
    }
    requestAnimationFrame(this.tick);
  };

  private refreshSelInfo(): void {
    const e = this.selectedKey
      ? this.entities.find((x) => x.key === this.selectedKey)
      : undefined;
    if (!e) {
      this.selInfo.textContent = 'No marker selected. Click a marker to select it.';
      return;
    }
    this.selInfo.innerHTML = '';
    const rows: [string, string][] = [
      ['Kind', KIND_LABEL[e.kind]],
      ['Zone', e.zoneId ?? '(unzoned)'],
      ['x', e.point.x.toFixed(2)],
      ['z', e.point.z.toFixed(2)],
    ];
    for (const [k, v] of rows) {
      const row = document.createElement('div');
      row.className = 'editor-selrow';
      const kk = document.createElement('span');
      kk.className = 'editor-selkey';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.textContent = v;
      row.append(kk, vv);
      this.selInfo.appendChild(row);
    }

    // Editable properties.
    for (const p of e.props) {
      const row = document.createElement('label');
      row.className = 'editor-selrow';
      const kk = document.createElement('span');
      kk.className = 'editor-selkey';
      kk.textContent = p.label;
      const input = document.createElement('input');
      input.className = 'editor-prop-input';
      input.type = p.type === 'number' ? 'number' : 'text';
      input.value = p.get();
      // Live: apply + refresh the patch as you type; commit (blur/enter) rebuilds so
      // radius/label changes reflect in the 2D canvas and 3D markers.
      input.addEventListener('input', () => {
        const ok = p.set(input.value);
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (ok) {
          this.refreshPatch();
          this.dirty = true;
        }
      });
      input.addEventListener('change', () => {
        if (p.set(input.value)) this.rebuild();
      });
      row.append(kk, input);
      this.selInfo.appendChild(row);
    }

    // Clone / delete actions.
    if (e.clone || e.removable) {
      const actions = document.createElement('div');
      actions.className = 'editor-selactions';
      if (e.clone) {
        actions.appendChild(this.button('Duplicate', () => {
          e.clone?.();
          this.rebuild();
        }));
      }
      if (e.removable && e.remove) {
        const del = this.button('Delete', () => {
          e.remove?.();
          this.selectedKey = null;
          this.rebuild();
        });
        del.classList.add('editor-btn-danger');
        actions.appendChild(del);
      }
      this.selInfo.appendChild(actions);
    }
  }

  private refreshPatch(): void {
    this.patchPre.textContent = renderPatch(buildPatch(this.entities, this.base));
  }

  // Rebuild the entity list after a structural edit (clone/delete) or a committed
  // property change, then re-sync every surface: 2D redraw, 3D markers, panels, patch.
  private rebuild(): void {
    this.entities = buildEntities(this.content);
    if (this.selectedKey && !this.entities.some((e) => e.key === this.selectedKey)) {
      this.selectedKey = null; // the selected marker was deleted
    }
    this.view3d?.setEntities(this.entities);
    this.refreshSelInfo();
    this.refreshPatch();
    this.dirty = true;
  }

  private async copyPatch(): Promise<void> {
    this.refreshPatch();
    const text = this.patchPre.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable (permissions/insecure context); the patch
      // stays visible in the panel for manual copy.
    }
  }

  // Dev-only: POST the auto-appliable ops (moves + scalar edits) to the vite plugin,
  // which rewrites the matching literals in src/sim/content (with a .bak backup).
  // Adds/deletes stay manual (shown as skipped). Available only under `npm run dev`.
  private async applyToFiles(): Promise<void> {
    const { ops, skipped } = buildApplyOps(this.entities, this.base);
    if (ops.length === 0 && skipped.length === 0) {
      this.patchPre.textContent = 'No changes to apply.';
      return;
    }
    try {
      const res = await fetch('/editor/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ops }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report = (await res.json()) as { applied: number; files: string[]; skipped: { label: string; reason: string }[] };
      const lines = [`Applied ${report.applied} change(s) to: ${report.files.join(', ') || '(none)'}.`];
      const manual = [...skipped, ...(report.skipped ?? [])];
      if (manual.length) {
        lines.push('', 'Not auto-applied (do these by hand):');
        for (const s of manual) lines.push(`  - ${s.label}: ${s.reason}`);
      }
      lines.push('', 'Reload the editor to continue from the saved state.');
      this.patchPre.textContent = lines.join('\n');
    } catch (err) {
      this.patchPre.textContent = `Apply failed (the write-back endpoint only exists under npm run dev): ${String(err)}`;
    }
  }

  // ---- 3D mode ------------------------------------------------------------------------

  private async toggle3d(): Promise<void> {
    if (this.view3d) {
      this.exit3d();
      return;
    }
    await this.enter3d();
  }

  private async enter3d(): Promise<void> {
    if (this.view3d || this.entering3d) return; // guard re-entrancy during the awaits
    this.entering3d = true;
    this.mode3dBtn.disabled = true;
    this.canvas.style.display = 'none';
    const host = document.createElement('div');
    host.className = 'editor3d-host';
    host.style.cssText = 'position:absolute;inset:0';
    const loading = document.createElement('div');
    loading.className = 'editor3d-loading';
    loading.textContent = 'Building world (loading assets)...';
    host.appendChild(loading);
    this.stage.appendChild(host);
    try {
      // Lazy chunk: pulls in Three.js + the renderer build modules only now; the
      // factory awaits the GLB preload the build* modules need.
      const mod = await import('./world3d');
      const view = await mod.Editor3dView.create(host, {
        seed: WORLD_SEED,
        entities: this.entities,
        onChange: () => this.refreshPatch(),
        onSelect: (e) => {
          this.selectedKey = e?.key ?? null;
          this.refreshSelInfo();
        },
      });
      loading.remove();
      this.view3d = view;
      this.mode3dBtn.textContent = '2D view';
      this.mode3dBtn.classList.add('editor-btn-active');
    } catch (err) {
      // Keep the tool usable in 2D if the 3D world fails to build.
      loading.textContent = `3D view failed to load: ${String(err)}`;
      console.error('[editor3d] failed to enter 3D', err);
    } finally {
      this.entering3d = false;
      this.mode3dBtn.disabled = false;
    }
  }

  private exit3d(): void {
    if (!this.view3d) return;
    this.view3d.dispose();
    this.view3d = null;
    this.stage.querySelector('.editor3d-host')?.remove();
    this.canvas.style.display = '';
    this.mode3dBtn.textContent = '3D view';
    this.mode3dBtn.classList.remove('editor-btn-active');
    this.resize();
    this.dirty = true;
  }
}
