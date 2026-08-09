import { fbm2, hash2 } from './rng';
import {
  CAMPS, columnBlendAt, COLUMN_ZONES, DUNGEON_FLOOR_Y, DUNGEON_X_THRESHOLD, ROADS,
  STRIP_MAX_X, STRIP_MIN_X, STRIP_ZONES, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z,
  worldHalfWidthAt, ZONES, zoneAt, zoneContaining,
} from './data';
import type { BiomeId, ZoneDef } from './types';

// Terrain is a pure function of (x, z, seed): both the sim (ground clamping)
// and the renderer (mesh) sample the same heightfield, so they always agree.
//
// The world is a north-running strip of zone bands (see ZONES in data.ts).
// Each biome shapes the heightfield differently — the vale rolls, the marsh
// lies low and flat, the peaks tower — with smooth blends at the boundaries
// and a mountain ridge wall between zones, pierced by a road pass.

const HILL_SCALE = 0.013;
const DETAIL_SCALE = 0.05;

export const WATER_LEVEL = -4.5;

// Hill amplitude / base elevation / hub plateau height per biome.
const BIOME_SHAPE: Record<BiomeId, { hill: number; base: number; hubHeight: number }> = {
  vale: { hill: 26, base: 0, hubHeight: 1.5 },
  marsh: { hill: 11, base: -1.0, hubHeight: 1.2 },
  peaks: { hill: 34, base: 7, hubHeight: 9 },
  blight: { hill: 14, base: -1.5, hubHeight: 1.4 },
};

// ---------------------------------------------------------------------------
// Border ridges.
//
// The world is a GRID of zone rectangles (data.ts `zoneAt`), so a border is
// either HORIZONTAL (the classic band wall between a zone and its northern
// neighbour) or VERTICAL (a column wall between east-west neighbours, the same
// maths turned a quarter turn). Each is opened by one road pass, except a
// `sealedSouthBorder` zone, which gets a taller, narrower wall with no pass at
// all, its crest pushed into its own band so the southern neighbour's ground is
// left alone.
//
// An edge that spans its whole world row keeps the classic UNBOUNDED wall, so
// the three shipped band walls are bit-identical to the strip era. A partial
// edge (any edge once columns exist) feathers to exactly nothing past its span
// ends; inside the span the feather is exactly 1, and `y * 1 === y`, so the
// strip's arithmetic does not move.
// ---------------------------------------------------------------------------

export interface BorderEdge {
  kind: 'h' | 'v';
  at: number; // the edge line: z for 'h', x for 'v'
  lo: number; // span start along the edge (x for 'h', z for 'v')
  hi: number; // span end
  fullRow: boolean; // spans the whole world row: no end feather
  passAt: number; // pass coordinate along the span
  sealed: boolean;
}

/** All shared edges between adjacent zone rects. Pure; exported for tests. */
export function computeBorderEdges(zones: readonly ZoneDef[]): BorderEdge[] {
  const zx0 = (zn: ZoneDef) => zn.xMin ?? STRIP_MIN_X;
  const zx1 = (zn: ZoneDef) => zn.xMax ?? STRIP_MAX_X;
  const edges: BorderEdge[] = [];
  for (const a of zones) {
    for (const b of zones) {
      // horizontal edge: b sits directly north of a, rects overlapping in x
      if (a.zMax === b.zMin) {
        const lo = Math.max(zx0(a), zx0(b));
        const hi = Math.min(zx1(a), zx1(b));
        if (hi - lo > 1) {
          const sealed = b.sealedSouthBorder === true;
          // full row = nothing touching or crossing the border line lies
          // outside this span (a column whose band SPANS the line counts too:
          // its interior must not inherit the row wall)
          const fullRow = zones.every(
            (zn) => zn.zMax < a.zMax || zn.zMin > a.zMax || (zx0(zn) >= lo && zx1(zn) <= hi),
          );
          edges.push({
            kind: 'h',
            at: a.zMax + (sealed ? SEALED_CREST_OFFSET : 0),
            lo,
            hi,
            fullRow,
            passAt: b.southPassX ?? 0,
            sealed,
          });
        }
      }
      // vertical edge: b sits directly east of a, rects overlapping in z
      if (zx1(a) === zx0(b)) {
        const lo = Math.max(a.zMin, b.zMin);
        const hi = Math.min(a.zMax, b.zMax);
        if (hi - lo > 1) {
          edges.push({
            kind: 'v',
            at: zx1(a),
            lo,
            hi,
            fullRow: false, // a column border never spans the world's full z
            passAt: b.westPassZ ?? a.eastPassZ ?? (lo + hi) / 2,
            sealed: false,
          });
        }
      }
    }
  }
  return edges;
}

const RIDGE_HEIGHT = 22;
const RIDGE_SIGMA = 18; // gaussian width of a band wall
// Column walls are narrower than band walls on purpose: a band wall runs across
// an empty seam, but a column wall stands beside ground that is already built
// and balanced, so its 3-sigma reach (36yd) is kept clear of every shipped camp
// and prop. Widening this moves ground players already know.
const COLUMN_RIDGE_SIGMA = 12;
// A sealed wall must beat PLAYER_MAX_CLIMB_SLOPE on a straight approach: the
// steepest gradient of a gaussian of height H and width s is H / (s * sqrt(e)),
// i.e. 60 / (12 * 1.6487) = 3.03, twice the 1.5 cap. No pass is cut through it.
const SEALED_RIDGE_HEIGHT = 60;
const SEALED_RIDGE_SIGMA = 12;
// A sealed crest sits this far INTO the sealed zone's own band, so its southern
// neighbour's border ground keeps (nearly) its original height.
const SEALED_CREST_OFFSET = 15;
const PASS_HALF_WIDTH = 10; // flat opening around the road
const PASS_SHOULDER = 34; // ...rising to full wall by this far from the pass
const RIDGE_END_FEATHER = 24; // a partial edge fades out over this far past its span

export const MIREFEN_IMPACT_CRATER = {
  x: 149.5,
  z: 295,
  bowlRadius: 20,
  radius: 30,
  depth: 2.6,
  rimHeight: 0.95,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function mirefenImpactCraterOffset(x: number, z: number): number {
  const dx = x - MIREFEN_IMPACT_CRATER.x;
  const dz = z - MIREFEN_IMPACT_CRATER.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= MIREFEN_IMPACT_CRATER.radius) return 0;

  const bowlT = d / MIREFEN_IMPACT_CRATER.bowlRadius;
  const bowl = d < MIREFEN_IMPACT_CRATER.bowlRadius
    ? -MIREFEN_IMPACT_CRATER.depth * (1 - smoothstep(0, 1, bowlT))
    : 0;

  const rimStart = MIREFEN_IMPACT_CRATER.bowlRadius * 0.82;
  if (d <= rimStart) return bowl;
  const rimT = (d - rimStart) / (MIREFEN_IMPACT_CRATER.radius - rimStart);
  const rim = MIREFEN_IMPACT_CRATER.rimHeight
    * smoothstep(0, 0.35, rimT)
    * (1 - smoothstep(0.72, 1, rimT));
  return bowl + rim;
}

// Every shared edge of the live zone grid. Built once; pure in ZONES.
const BORDER_EDGES: readonly BorderEdge[] = computeBorderEdges(ZONES);

// One border edge's height contribution at a position. Pure and per-edge (not
// summed internally) so `terrainHeight` keeps accumulating exactly one `h +=`
// per edge, which is what makes the shipped band walls bit-identical.
function edgeSigma(edge: BorderEdge): number {
  if (edge.sealed) return SEALED_RIDGE_SIGMA;
  return edge.kind === 'v' ? COLUMN_RIDGE_SIGMA : RIDGE_SIGMA;
}

export function borderRidgeContribution(
  edge: BorderEdge,
  x: number,
  z: number,
  seed: number,
): number {
  const sigma = edgeSigma(edge);
  const dPerp = Math.abs((edge.kind === 'h' ? z : x) - edge.at);
  if (dPerp >= sigma * 3) return 0;
  const along = edge.kind === 'h' ? x : z;
  let end = 1;
  if (!edge.fullRow) {
    const outside = Math.max(edge.lo - along, along - edge.hi, 0);
    if (outside >= RIDGE_END_FEATHER) return 0;
    end = 1 - smoothstep(0, RIDGE_END_FEATHER, outside);
  }
  const profile = Math.exp(-(dPerp * dPerp) / (2 * sigma * sigma));
  // A sealed border has no pass: it is the one border a player cannot walk.
  const pass = edge.sealed ? 1 : smoothstep(PASS_HALF_WIDTH, PASS_SHOULDER, Math.abs(along - edge.passAt));
  // jagged crest so the wall reads as mountains, not a berm. A sealed crest
  // only ever ADDS (abs), so no dip can open a climbable notch in it.
  const noise =
    edge.kind === 'h'
      ? (fbm2(x * 0.03, edge.at * 0.03, seed + 19, 2) - 0.5) * 0.7
      : (fbm2(edge.at * 0.03, z * 0.03, seed + 19, 2) - 0.5) * 0.7;
  const crest = 1 + (edge.sealed ? Math.abs(noise) : noise);
  const height = edge.sealed ? SEALED_RIDGE_HEIGHT : RIDGE_HEIGHT;
  return height * crest * profile * pass * end;
}

// Blended biome shape at a position. Zone interiors keep their exact shape:
// the strip's bands cascade by z across +-~35yd windows exactly as they always
// did, and column zones blend in SIDEWAYS across the same window, so an east
// map's hills arrive over its border pass at the rate a northern band's do.
// Returned through a module-level scratch rather than a fresh literal: this is
// the innermost function of the heightfield (one call per sample), and the
// sideways blend loop pushed it past V8's inlining budget, so the object stopped
// being escape-analysed away and started costing a real allocation per sample
// (measured: terrainHeight 5x slower once a large heap makes GC expensive).
// `baseHeight` is the only caller and hoists both fields into locals at once, so
// the shared object is never retained across a second call.
const shapeScratch = { hill: 0, base: 0 };

function shapeAt(x: number, z: number): { hill: number; base: number } {
  let hill = BIOME_SHAPE[STRIP_ZONES[0].biome].hill;
  let base = BIOME_SHAPE[STRIP_ZONES[0].biome].base;
  for (let i = 0; i + 1 < STRIP_ZONES.length; i++) {
    const boundary = STRIP_ZONES[i].zMax;
    const t = smoothstep(boundary - 30, boundary + 35, z);
    const next = BIOME_SHAPE[STRIP_ZONES[i + 1].biome];
    hill = lerp(hill, next.hill, t);
    base = lerp(base, next.base, t);
  }
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    const col = COLUMN_ZONES[i];
    const t = columnBlendAt(col, x, z);
    if (t <= 0) continue; // exactly +0 outside the window: the strip never moves
    const shape = BIOME_SHAPE[col.biome];
    hill = lerp(hill, shape.hill, t);
    base = lerp(base, shape.base, t);
  }
  shapeScratch.hill = hill;
  shapeScratch.base = base;
  return shapeScratch;
}

// ---------------------------------------------------------------------------
// Flattened zone geometry for the heightfield's hot loops.
//
// `baseHeight` runs once per terrain sample and used to read `zone.hub.x` /
// `zone.biome` straight off the ZoneDef records. `ZoneDef` has optional fields,
// so each zone that declares a different subset of them is a different hidden
// class: four strip shapes were inside V8's polymorphic inline-cache limit, and
// the two column zones (xMin/xMax plus a pass field) pushed it over. The named
// access went MEGAMORPHIC and V8 deoptimized baseHeight on EVERY call from the
// first moment anything built a world, making terrainHeight about 4x slower for
// the rest of the process, renderer included.
//
// These arrays hold the identical values in the identical order, so the
// arithmetic is bit-for-bit what it was and the access is a plain indexed float
// load. Anything hot enough to run per terrain sample must read from here, not
// from a ZoneDef. (`tests/world_phase2_terrain.test.ts` pins the heights;
// nothing else can catch this class of regression, so measure if you edit it.)
// ---------------------------------------------------------------------------

// x, z, radius, hubHeight per zone, in ZONES order.
const HUB_FLAT = new Float64Array(ZONES.length * 4);
for (let i = 0; i < ZONES.length; i++) {
  const zone = ZONES[i];
  HUB_FLAT[i * 4] = zone.hub.x;
  HUB_FLAT[i * 4 + 1] = zone.hub.z;
  HUB_FLAT[i * 4 + 2] = zone.hub.radius;
  HUB_FLAT[i * 4 + 3] = BIOME_SHAPE[zone.biome].hubHeight;
}

// x, z, radius per lake, in ZONES order then per-zone lake order.
const LAKE_FLAT = (() => {
  const out: number[] = [];
  for (const zone of ZONES) for (const lake of zone.lakes) out.push(lake.x, lake.z, lake.radius);
  return new Float64Array(out);
})();

// center x, center z, radius per camp, in CAMPS order.
const CAMP_FLAT = new Float64Array(CAMPS.length * 3);
for (let i = 0; i < CAMPS.length; i++) {
  CAMP_FLAT[i * 3] = CAMPS[i].center.x;
  CAMP_FLAT[i * 3 + 1] = CAMPS[i].center.z;
  CAMP_FLAT[i * 3 + 2] = CAMPS[i].radius;
}

function baseHeight(x: number, z: number, seed: number): number {
  const shape = shapeAt(x, z);
  const shapeHill = shape.hill;
  const shapeBase = shape.base;
  let h = (fbm2(x * HILL_SCALE + 100, z * HILL_SCALE + 100, seed, 4) - 0.5) * shapeHill + shapeBase;
  h += (fbm2(x * DETAIL_SCALE, z * DETAIL_SCALE, seed + 7, 2) - 0.5) * 2.2;
  // Flatten each zone's hub settlement into a plateau
  for (let i = 0; i < HUB_FLAT.length; i += 4) {
    const dx = x - HUB_FLAT[i], dz = z - HUB_FLAT[i + 1];
    const radius = HUB_FLAT[i + 2];
    const dHub = Math.sqrt(dx * dx + dz * dz);
    if (dHub < radius * 1.6) {
      const blend = smoothstep(radius * 0.7, radius * 1.6, dHub);
      h = h * blend + HUB_FLAT[i + 3] * (1 - blend);
    }
  }
  // Keep dry land everywhere: soft-floor low dips above the water level...
  const minLand = WATER_LEVEL + 1.4;
  if (h < minLand) h = minLand - (minLand - h) * 0.12;
  // ...except the carved lake basins
  for (let i = 0; i < LAKE_FLAT.length; i += 3) {
    const radius = LAKE_FLAT[i + 2];
    const dLake = Math.sqrt((x - LAKE_FLAT[i]) ** 2 + (z - LAKE_FLAT[i + 1]) ** 2);
    if (dLake < radius * 1.6) {
      const lakeBlend = smoothstep(radius * 0.55, radius * 1.6, dLake);
      h = h * lakeBlend + (WATER_LEVEL - 4) * (1 - lakeBlend);
    }
  }
  return h;
}

// Ground height including instanced dungeon floors (flat, far off-world).
export function groundHeight(x: number, z: number, seed: number): number {
  if (x > DUNGEON_X_THRESHOLD) return DUNGEON_FLOOR_Y;
  return terrainHeight(x, z, seed);
}

export function terrainHeight(x: number, z: number, seed: number): number {
  let h = baseHeight(x, z, seed);

  // Flatten each camp a little so mobs don't stand on cliffs. Reads the flat
  // camp array for the same reason baseHeight reads the flat zone arrays.
  for (let i = 0; i < CAMP_FLAT.length; i += 3) {
    const cx = CAMP_FLAT[i], cz = CAMP_FLAT[i + 1], radius = CAMP_FLAT[i + 2];
    const dx = x - cx, dz = z - cz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < radius * 1.8) {
      const ch = baseHeight(cx, cz, seed);
      const blend = smoothstep(radius * 0.8, radius * 1.8, d);
      h = h * blend + ch * (1 - blend);
    }
  }

  // Mountain ridge walls along every shared zone edge, pierced by the road pass.
  // The gaussian window is re-checked here so an out-of-range edge costs one
  // compare and no call, exactly as the strip-era loop's `if` did: the sample is
  // then bit-identical rather than `h += 0`.
  for (let i = 0; i < BORDER_EDGES.length; i++) {
    const edge = BORDER_EDGES[i];
    const sigma = edgeSigma(edge);
    if (Math.abs((edge.kind === 'h' ? z : x) - edge.at) >= sigma * 3) continue;
    h += borderRidgeContribution(edge, x, z, seed);
  }

  // Raise the world rim so the player naturally stays in bounds. The half width
  // is PER ROW (worldHalfWidthAt): a row a column occupies is rimmed at the
  // column's outer edge, every other row keeps the strip's own rim exactly
  // where it was, and the transition eases in z so no cliff opens at the corner.
  const halfWidth = worldHalfWidthAt(z);
  const rimX = smoothstep(halfWidth - 30, halfWidth, Math.abs(x));
  const rimS = smoothstep(WORLD_MIN_Z + 30, WORLD_MIN_Z, z);
  const rimN = smoothstep(WORLD_MAX_Z - 30, WORLD_MAX_Z, z);
  const rim = Math.max(rimX, rimS, rimN);
  h += rim * 40;
  h += mirefenImpactCraterOffset(x, z);
  return h;
}

// Distance from (x,z) to the nearest road polyline segment.
export function roadDistance(x: number, z: number): number {
  let best = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const a = road[i], b = road[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const apx = x - a.x, apz = z - a.z;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / len2)) : 0;
      const dx = apx - abx * t, dz = apz - abz * t;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

// Deterministic decoration placement (trees, rocks) — used by the renderer,
// kept here so it shares the seed and stays out of mob camps / hubs / roads /
// lakes. Density and mix vary by biome: the vale is wooded, the marsh sparse
// and scrubby, the peaks rocky with hardy pines.
export interface Decoration {
  kind: 'tree' | 'tree2' | 'rock';
  x: number;
  z: number;
  scale: number;
  variant: number;
  biome: BiomeId;
}

const DECORATION_EXCLUSION_RADIUS = 1.2;
const DECORATION_EXCLUSIONS = [
  { x: 2.456450840458274, z: 211.33819991815835 },
];

function isExcludedDecoration(x: number, z: number): boolean {
  return DECORATION_EXCLUSIONS.some((p) => Math.hypot(x - p.x, z - p.z) < DECORATION_EXCLUSION_RADIUS);
}

// Delegates to zoneAt rather than repeating its rect walk over ZONES: a
// private copy here was the one place the biome could disagree with every
// other zone read once zones stop spanning the full-width strip.
export function zoneBiomeAt(x: number, z: number): BiomeId {
  return zoneAt(x, z).biome;
}

export function generateDecorations(seed: number): Decoration[] {
  const out: Decoration[] = [];
  const step = 10;
  const xHalf = WORLD_MAX_X - 14;
  for (let gx = -xHalf; gx < xHalf; gx += step) {
    for (let gz = WORLD_MIN_Z + 14; gz < WORLD_MAX_Z - 14; gz += step) {
      const r = hash2(Math.round(gx), Math.round(gz), seed + 31);
      const biome = zoneBiomeAt(gx, gz);
      // density gate + kind mix per biome
      let kind: Decoration['kind'] | null = null;
      if (biome === 'vale') {
        if (r > 0.48) continue;
        kind = r < 0.30 ? 'tree' : r < 0.40 ? 'tree2' : 'rock';
      } else if (biome === 'marsh') {
        if (r > 0.34) continue;
        kind = r < 0.08 ? 'tree' : r < 0.26 ? 'tree2' : 'rock';
      } else if (biome === 'blight') {
        // dead and sparse: mostly bare trees and grey rocks
        if (r > 0.26) continue;
        kind = r < 0.13 ? 'tree2' : r < 0.17 ? 'tree' : 'rock';
      } else {
        if (r > 0.44) continue;
        kind = r < 0.20 ? 'tree' : r < 0.24 ? 'tree2' : 'rock';
      }
      const ox = (hash2(Math.round(gx), Math.round(gz), seed + 57) - 0.5) * step;
      const oz = (hash2(Math.round(gx), Math.round(gz), seed + 91) - 0.5) * step;
      const x = gx + ox, z = gz + oz;
      // The world is a grid with holes now: the bounding box the sweep walks
      // contains rows a column zone does not occupy, which are void behind the
      // rim. Strict rect containment keeps decorations out of them (and off the
      // rim wall itself). Every decoration the strip-era sweep produced sits
      // inside a strip rect, so none of them is dropped by this.
      if (!zoneContaining(x, z)) continue;
      if (isExcludedDecoration(x, z)) continue;
      let inHub = false;
      for (const zone of ZONES) {
        const dx = x - zone.hub.x, dz = z - zone.hub.z;
        if (Math.sqrt(dx * dx + dz * dz) < zone.hub.radius + 4) { inHub = true; break; }
      }
      if (inHub) continue;
      if (terrainHeight(x, z, seed) < WATER_LEVEL + 1) continue;
      if (roadDistance(x, z) < 5) continue;
      let inCamp = false;
      for (const c of CAMPS) {
        const dx = x - c.center.x, dz = z - c.center.z;
        if (Math.sqrt(dx * dx + dz * dz) < c.radius + 3) { inCamp = true; break; }
      }
      if (inCamp) continue;
      out.push({
        kind,
        x, z,
        scale: 0.7 + hash2(Math.round(gx), Math.round(gz), seed + 13) * 0.9,
        variant: Math.floor(hash2(Math.round(gx), Math.round(gz), seed + 77) * 3),
        biome,
      });
    }
  }
  return out;
}
