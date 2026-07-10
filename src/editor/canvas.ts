// Canvas painter for the marker map editor. Thin: it reads the camera, entities,
// and roads and draws them; it owns no editing state. All hit-testing and math live
// in view.ts, so this stays a pure render pass over the current model.
//
// This is the Tier 0 marker-only painter: grid, roads, and the seven draggable
// marker kinds. It has zero sim/render dependencies (no terrain/biome/placement
// layers from the upstream 3D editor), so the whole editor never touches the sim.

import type { EditorEntity, EntityKind } from './model';
import type { Camera, Vec2, Viewport } from './view';

type Roads = readonly (readonly Vec2[])[];

const KIND_COLOR: Record<EntityKind, string> = {
  hub: '#ffd100',
  graveyard: '#9aa7b4',
  lake: '#2f6f9f',
  poi: '#e8c170',
  camp: '#d9534f',
  npc: '#5fb35f',
  object: '#b07cc6',
};

export interface DrawState {
  entities: readonly EditorEntity[];
  roads: Roads;
  selectedKey: string | null;
  hoverKey: string | null;
}

export function draw(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  state: DrawState,
): void {
  ctx.save();
  ctx.clearRect(0, 0, vp.width, vp.height);
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, vp.width, vp.height);

  drawGrid(ctx, cam, vp);
  drawRoads(ctx, cam, vp, state.roads);

  // Filled areas (lakes, hub) first so point markers sit on top of them.
  for (const e of state.entities) {
    if (e.kind === 'lake' || e.kind === 'hub') drawArea(ctx, cam, vp, e);
  }
  for (const e of state.entities) {
    if (e.kind === 'lake' || e.kind === 'hub') continue;
    drawMarker(ctx, cam, vp, e, e.key === state.selectedKey, e.key === state.hoverKey);
  }
  // Selected area markers get their outline re-stroked on top for visibility.
  for (const e of state.entities) {
    if ((e.kind === 'lake' || e.kind === 'hub') && e.key === state.selectedKey) {
      drawAreaSelection(ctx, cam, vp, e);
    }
  }
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport): void {
  // Grid spacing in yards, chosen so lines stay roughly 60-120px apart at any zoom.
  const targetPx = 80;
  const rawStep = targetPx / cam.pxPerYard;
  const step = niceStep(rawStep);
  const tl = cam.screenToWorld({ sx: 0, sy: 0 }, vp);
  const br = cam.screenToWorld({ sx: vp.width, sy: vp.height }, vp);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#161b22';
  ctx.fillStyle = '#3a424d';
  ctx.font = '10px monospace';
  ctx.beginPath();
  for (let x = Math.ceil(tl.x / step) * step; x <= br.x; x += step) {
    const s = cam.worldToScreen({ x, z: 0 }, vp);
    ctx.moveTo(s.sx, 0);
    ctx.lineTo(s.sx, vp.height);
  }
  for (let z = Math.ceil(tl.z / step) * step; z <= br.z; z += step) {
    const s = cam.worldToScreen({ x: 0, z }, vp);
    ctx.moveTo(0, s.sy);
    ctx.lineTo(vp.width, s.sy);
  }
  ctx.stroke();
  // Origin axes, brighter.
  const o = cam.worldToScreen({ x: 0, z: 0 }, vp);
  ctx.strokeStyle = '#2b3a4a';
  ctx.beginPath();
  ctx.moveTo(o.sx, 0);
  ctx.lineTo(o.sx, vp.height);
  ctx.moveTo(0, o.sy);
  ctx.lineTo(vp.width, o.sy);
  ctx.stroke();
}

function drawRoads(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport, roads: Roads): void {
  ctx.strokeStyle = '#4a3f2e';
  ctx.lineWidth = Math.max(1, 3 * cam.pxPerYard * 0.5);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const road of roads) {
    if (road.length < 2) continue;
    ctx.beginPath();
    road.forEach((p, i) => {
      const s = cam.worldToScreen(p, vp);
      if (i === 0) ctx.moveTo(s.sx, s.sy);
      else ctx.lineTo(s.sx, s.sy);
    });
    ctx.stroke();
  }
}

function drawArea(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport, e: EditorEntity): void {
  const c = cam.worldToScreen(e.point, vp);
  const r = e.radius * cam.pxPerYard;
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
  ctx.fillStyle = e.kind === 'lake' ? 'rgba(47,111,159,0.35)' : 'rgba(255,209,0,0.12)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = KIND_COLOR[e.kind];
  ctx.stroke();
}

function drawAreaSelection(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  e: EditorEntity,
): void {
  const c = cam.worldToScreen(e.point, vp);
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, e.radius * cam.pxPerYard, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  drawDot(ctx, c, 4, '#ffffff');
  drawLabel(ctx, c, e.label);
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  e: EditorEntity,
  selected: boolean,
  hover: boolean,
): void {
  const c = cam.worldToScreen(e.point, vp);
  if (e.kind === 'camp') {
    // Show the camp's spawn radius as a faint ring around the spawn centre.
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, e.radius * cam.pxPerYard, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(217,83,79,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const baseR = selected ? 6 : hover ? 5 : 4;
  drawDot(ctx, c, baseR + 1.5, '#0c0f14'); // dark halo for contrast on roads/lakes
  drawDot(ctx, c, baseR, KIND_COLOR[e.kind]);
  if (selected) {
    ctx.beginPath();
    ctx.arc(c.sx, c.sy, baseR + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Labels are dense; show them only when zoomed in, on hover, or when selected.
  if (selected || hover || cam.pxPerYard >= 3) drawLabel(ctx, c, e.label);
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  c: { sx: number; sy: number },
  r: number,
  fill: string,
): void {
  ctx.beginPath();
  ctx.arc(c.sx, c.sy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  c: { sx: number; sy: number },
  text: string,
): void {
  ctx.font = '11px monospace';
  const w = ctx.measureText(text).width;
  const x = c.sx + 8;
  const y = c.sy - 8;
  ctx.fillStyle = 'rgba(8,10,14,0.78)';
  ctx.fillRect(x - 2, y - 10, w + 4, 14);
  ctx.fillStyle = '#e8eef4';
  ctx.fillText(text, x, y);
}

// Round a raw spacing up to the nearest 1/2/5 x 10^n so grid lines land on
// readable yard values.
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

export { KIND_COLOR };
