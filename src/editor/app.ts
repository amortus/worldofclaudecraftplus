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
  buildEntities,
  diffMoved,
  type EditorEntity,
  type EntityKind,
  formatPatch,
  snapshot,
  type ZoneContent,
} from './model';
import { Camera, pickHandle, type ScreenPoint, type Vec2, type Viewport } from './view';

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
  private readonly base: Map<string, Vec2>;

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

  constructor(mount: HTMLElement, content: ZoneContent) {
    this.content = content;
    this.entities = buildEntities(content);
    this.base = snapshot(this.entities);

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
    topbar.append(this.button('Copy patch', () => void this.copyPatch()));

    const body = document.createElement('div');
    body.className = 'editor-body';

    const stage = document.createElement('div');
    stage.className = 'editor-stage';
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
        ev.preventDefault();
        const factor = Math.exp(-ev.deltaY * 0.0015);
        this.cam.zoomAt(this.pointerAt(ev), factor, this.vp());
        this.dirty = true;
      },
      { passive: false },
    );

    window.addEventListener('keydown', (ev) => {
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
    if (this.dirty) {
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
      ['Label', e.label],
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
  }

  private refreshPatch(): void {
    const moved = diffMoved(this.entities, this.base);
    this.patchPre.textContent = formatPatch(moved);
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
}
