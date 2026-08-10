import { fbm2, hash2, noise2 } from './rng';
import {
  CAMPS, COLUMN_ZONES, DUNGEON_FLOOR_Y, DUNGEON_X_THRESHOLD, ROADS,
  STRIP_MAX_X, STRIP_MIN_X, STRIP_ZONES, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z,
  worldHalfWidthAt, ZONES, zoneAt, zoneContaining,
} from './data';
import { cragLayer, highlandMask, reliefBase, warpedCoords } from './terrain_relief';
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

// Hill amplitude / base elevation / hub plateau height per biome, plus the
// four shaping weights the natural-relief layer reads (terrain_relief.ts).
//
//   relief  0..1 weight of the domain-warped, gradient-damped hill layer:
//           meandering contours, smooth valley floors, rough uplands.
//   crag    yards of ridged-multifractal crest at full highland mask: how far
//           sharp ridgelines may crown this biome's uplands. 0 keeps a biome
//           exactly as calm as its hills (wetlands, lawns).
//   braid   0..1 the Willowfen's braided water-meadow channels.
//   terrace 0..1 the Frostveil's benched multi-level mountain ground.
//
// THE FOUR SHIPPED BIOMES CARRY ZERO ON ALL FOUR, deliberately. Upstream gives
// vale crag 5 and peaks crag 26, but our vale, marsh, peaks and Ashen Wastes
// are ground players already walk, quest on and path across; taking those rows
// would move every hilltop in the shipped world. The zero rows make the whole
// relief layer weigh exactly nothing there, which is what keeps `terrainHeight`
// bit-identical (tests/biomes_heightfield.test.ts) and costs nothing per
// sample (SHAPE_EXTRA below is false while no live zone asks for relief).
//
// hill/base/hubHeight/crag for the ten new biomes are upstream's own values.
export interface BiomeShape {
  hill: number;
  base: number;
  hubHeight: number;
  relief: number;
  crag: number;
  braid: number;
  terrace: number;
}

export const BIOME_SHAPE: Record<BiomeId, BiomeShape> = {
  vale: { hill: 26, base: 0, hubHeight: 1.5, relief: 0, crag: 0, braid: 0, terrace: 0 },
  marsh: { hill: 11, base: -1.0, hubHeight: 1.2, relief: 0, crag: 0, braid: 0, terrace: 0 },
  peaks: { hill: 34, base: 7, hubHeight: 9, relief: 0, crag: 0, braid: 0, terrace: 0 },
  blight: { hill: 14, base: -1.5, hubHeight: 1.4, relief: 0, crag: 0, braid: 0, terrace: 0 },
  // The Veiled Hollow: a sheltered valley, gentler than the peaks that hide it.
  dusk: { hill: 14, base: 2, hubHeight: 2.5, relief: 1, crag: 4, braid: 0, terrace: 0 },
  // The Drakelands: scorched uplands, ridged where the old flows cooled hard.
  ember: { hill: 16, base: 2.5, hubHeight: 2.5, relief: 1, crag: 8, braid: 0, terrace: 0 },
  // The Frostveil Reach: a snowbound massif that steps into benched paths.
  frost: { hill: 26, base: 6, hubHeight: 3, relief: 1, crag: 10, braid: 0, terrace: 1 },
  // The Amberfall: rolling autumn weald around the Great Mere.
  amber: { hill: 15, base: 2, hubHeight: 2.5, relief: 1, crag: 4, braid: 0, terrace: 0 },
  // The Willowfen: low, wet and gentle, dissolving into braided channels.
  fen: { hill: 8, base: -0.3, hubHeight: 2, relief: 1, crag: 0, braid: 1, terrace: 0 },
  // The Nightbloom: soft moonlit downs, a touch more rolling than the fen.
  night: { hill: 12, base: 1, hubHeight: 2.5, relief: 1, crag: 4, braid: 0, terrace: 0 },
  // The Wraithwood: low haunted forest floor under the giant canopies.
  haunt: { hill: 13, base: 1.5, hubHeight: 2.5, relief: 1, crag: 5, braid: 0, terrace: 0 },
  // The Palmreach: low tropical relief.
  jungle: { hill: 11, base: 1.2, hubHeight: 2, relief: 1, crag: 4, braid: 0, terrace: 0 },
  // The Evergarden: groomed parkland, gentle as a lawn.
  garden: { hill: 9, base: 1.8, hubHeight: 2, relief: 1, crag: 0, braid: 0, terrace: 0 },
  // The Galecrest: wind-scoured headland downs over sea cliffs.
  gale: { hill: 14, base: 2.4, hubHeight: 2.5, relief: 1, crag: 8, braid: 0, terrace: 0 },
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
  /**
   * This end BUTTS INTO another edge on the same line rather than stopping in
   * open ground, so it must be cut off square instead of feathering out.
   *
   * A grid with more than one column per row produces COLINEAR border edges:
   * the wall along z = 180 is three edges (one per column), and the wall along
   * x = -180 is four (one per band it passes). Each carries its own `passAt`,
   * which is why they cannot be merged into one span. Feathering them would be
   * wrong twice over: at the shared end BOTH edges are at full strength, so the
   * ridge doubles to 44yd there, and each one's tail reaches 24yd into its
   * neighbour's zone, which is ground players already stand on.
   *
   * Cutting square is seamless because two abutting edges on the same line
   * evaluate the same profile, the same crest noise (a function of `at` and the
   * along coordinate only) and the same height, so the wall is continuous
   * across the joint. The span is half open, [lo, hi), so exactly one edge owns
   * the joint coordinate.
   */
  cutLo: boolean;
  cutHi: boolean;
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
            cutLo: false,
            cutHi: false,
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
            cutLo: false,
            cutHi: false,
          });
        }
      }
    }
  }
  // Mark the ends that butt into a colinear neighbour (see BorderEdge.cutLo).
  // A sealed edge is left alone: its crest is offset off the line, so it is
  // never colinear with an unsealed one, and it has no pass to preserve.
  for (const edge of edges) {
    if (edge.sealed) continue;
    for (const other of edges) {
      if (other === edge || other.sealed) continue;
      if (other.kind !== edge.kind || other.at !== edge.at) continue;
      if (other.hi === edge.lo) edge.cutLo = true;
      if (other.lo === edge.hi) edge.cutHi = true;
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
    // A cut end owns [lo, hi) and stops dead there; the colinear neighbour that
    // butts into it carries the wall on from the same value.
    if (edge.cutLo && along < edge.lo) return 0;
    if (edge.cutHi && along >= edge.hi) return 0;
    const outside = Math.max(
      edge.cutLo ? 0 : edge.lo - along,
      edge.cutHi ? 0 : along - edge.hi,
      0,
    );
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
const shapeScratch = { hill: 0, base: 0, relief: 0, crag: 0, braid: 0, terrace: 0 };

// ---------------------------------------------------------------------------
// Flattened band/column geometry for the shape blend.
//
// `shapeAt` used to read `STRIP_ZONES[i].zMax`, `STRIP_ZONES[i + 1].biome` and
// `col.xMin/.xMax/.zMin/.zMax` (through `columnBlendAt`) off ZoneDef records on
// EVERY terrain sample. ZoneDef has optional fields, so each zone declaring a
// different subset of them is a different hidden class, and that is exactly how
// `baseHeight` went megamorphic once the world grew from four zones to six (see
// the HUB_FLAT banner below). More zones and more biomes make that worse, so
// the blend now reads plain indexed floats built once at module load and never
// touches a ZoneDef again. The arithmetic below is the same arithmetic in the
// same order, including `columnBlendAt`'s exact window form, so the field is
// bit-for-bit what it was; `tests/biomes_heightfield.test.ts` pins that against
// a whole-world snapshot and `tests/biomes_shape_blend.test.ts` re-checks the
// inlined column blend against `columnBlendAt` itself.
// ---------------------------------------------------------------------------

const SHAPE_STRIDE = 6; // hill, base, relief, crag, braid, terrace

function packShape(zones: readonly ZoneDef[]): Float64Array {
  const out = new Float64Array(zones.length * SHAPE_STRIDE);
  for (let i = 0; i < zones.length; i++) {
    const s = BIOME_SHAPE[zones[i].biome];
    out[i * SHAPE_STRIDE] = s.hill;
    out[i * SHAPE_STRIDE + 1] = s.base;
    out[i * SHAPE_STRIDE + 2] = s.relief;
    out[i * SHAPE_STRIDE + 3] = s.crag;
    out[i * SHAPE_STRIDE + 4] = s.braid;
    out[i * SHAPE_STRIDE + 5] = s.terrace;
  }
  return out;
}

const STRIP_SHAPE = packShape(STRIP_ZONES);
const COLUMN_SHAPE = packShape(COLUMN_ZONES);
const STRIP_COUNT = STRIP_ZONES.length;
const COLUMN_COUNT = COLUMN_ZONES.length;

// zMax of each strip band boundary (one per gap between stacked bands).
const STRIP_BOUND = new Float64Array(Math.max(0, STRIP_COUNT - 1));
for (let i = 0; i + 1 < STRIP_COUNT; i++) STRIP_BOUND[i] = STRIP_ZONES[i].zMax;

// x0, x1, zMin, zMax, east per column zone, in COLUMN_ZONES order.
const COLUMN_RECT = new Float64Array(COLUMN_COUNT * 5);
for (let i = 0; i < COLUMN_COUNT; i++) {
  const col = COLUMN_ZONES[i];
  const x0 = col.xMin ?? STRIP_MIN_X;
  const x1 = col.xMax ?? STRIP_MAX_X;
  COLUMN_RECT[i * 5] = x0;
  COLUMN_RECT[i * 5 + 1] = x1;
  COLUMN_RECT[i * 5 + 2] = col.zMin;
  COLUMN_RECT[i * 5 + 3] = col.zMax;
  COLUMN_RECT[i * 5 + 4] = x0 >= STRIP_MAX_X ? 1 : 0;
}

// True only when some LIVE zone asks for relief, crag, braids or terracing.
// While every live zone is one of the four shipped biomes it is false, the
// blend runs exactly the two lerps it always ran, and no relief code executes
// anywhere in the world.
const SHAPE_EXTRA = ZONES.some((zn) => {
  const s = BIOME_SHAPE[zn.biome];
  return s.relief > 0 || s.crag > 0 || s.braid > 0 || s.terrace > 0;
});
// The two heightfield appliers that need `h`, hoisted to module consts so
// `terrainHeight` pays one compare rather than a second shape blend.
const HAS_BRAID = ZONES.some((zn) => BIOME_SHAPE[zn.biome].braid > 0);
const HAS_TERRACE = ZONES.some((zn) => BIOME_SHAPE[zn.biome].terrace > 0);

function smoothstep01(raw: number): number {
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  return t * t * (3 - 2 * t);
}

/** `columnBlendAt` (data.ts) over the flat rect table; identical arithmetic. */
function columnBlendFlat(i: number, x: number, z: number): number {
  const o = i * 5;
  const x0 = COLUMN_RECT[o], x1 = COLUMN_RECT[o + 1];
  const zMin = COLUMN_RECT[o + 2], zMax = COLUMN_RECT[o + 3];
  if (z <= zMin - 30 || z >= zMax + 35) return 0;
  const east = COLUMN_RECT[o + 4] === 1;
  if (east ? x <= x0 - 30 : x >= x1 + 30) return 0;
  const xT = east
    ? smoothstep01((x - (x0 - 30)) / 65)
    : 1 - smoothstep01((x - (x1 - 35)) / 65);
  const zT = smoothstep01((z - (zMin - 30)) / 65) * (1 - smoothstep01((z - (zMax - 30)) / 65));
  return xT * zT;
}

function shapeAt(x: number, z: number): typeof shapeScratch {
  let hill = STRIP_SHAPE[0];
  let base = STRIP_SHAPE[1];
  let relief = 0, crag = 0, braid = 0, terrace = 0;
  if (SHAPE_EXTRA) {
    relief = STRIP_SHAPE[2];
    crag = STRIP_SHAPE[3];
    braid = STRIP_SHAPE[4];
    terrace = STRIP_SHAPE[5];
  }
  for (let i = 0; i + 1 < STRIP_COUNT; i++) {
    const boundary = STRIP_BOUND[i];
    const t = smoothstep(boundary - 30, boundary + 35, z);
    const o = (i + 1) * SHAPE_STRIDE;
    hill = lerp(hill, STRIP_SHAPE[o], t);
    base = lerp(base, STRIP_SHAPE[o + 1], t);
    if (SHAPE_EXTRA) {
      relief = lerp(relief, STRIP_SHAPE[o + 2], t);
      crag = lerp(crag, STRIP_SHAPE[o + 3], t);
      braid = lerp(braid, STRIP_SHAPE[o + 4], t);
      terrace = lerp(terrace, STRIP_SHAPE[o + 5], t);
    }
  }
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const t = columnBlendFlat(i, x, z);
    if (t <= 0) continue; // exactly +0 outside the window: the strip never moves
    const o = i * SHAPE_STRIDE;
    hill = lerp(hill, COLUMN_SHAPE[o], t);
    base = lerp(base, COLUMN_SHAPE[o + 1], t);
    if (SHAPE_EXTRA) {
      relief = lerp(relief, COLUMN_SHAPE[o + 2], t);
      crag = lerp(crag, COLUMN_SHAPE[o + 3], t);
      braid = lerp(braid, COLUMN_SHAPE[o + 4], t);
      terrace = lerp(terrace, COLUMN_SHAPE[o + 5], t);
    }
  }
  shapeScratch.hill = hill;
  shapeScratch.base = base;
  shapeScratch.relief = relief;
  shapeScratch.crag = crag;
  shapeScratch.braid = braid;
  shapeScratch.terrace = terrace;
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
  const shapeRelief = shape.relief;
  const shapeCrag = shape.crag;
  // The classic hill layer. Where a biome asks for relief, the same value is
  // cross-faded toward the warped, gradient-damped field (terrain_relief.ts)
  // by the blended relief weight, so a new biome's meandering, eroded ground
  // arrives across its border at exactly the rate its palette does. At weight
  // 0 (every shipped biome) nothing below the `if` runs and the expression is
  // the one that shipped, term for term.
  const hillV = fbm2(x * HILL_SCALE + 100, z * HILL_SCALE + 100, seed, 4);
  let h: number;
  if (shapeRelief > 0) {
    const warp = warpedCoords(x, z, seed, shapeRelief);
    const wx = warp.x, wz = warp.z;
    const blended = hillV + (reliefBase(wx, wz, seed, HILL_SCALE) - hillV) * shapeRelief;
    h = (blended - 0.5) * shapeHill + shapeBase;
    // Crags crown ground that already stands high, so ranges grow out of the
    // hills instead of being sprinkled over the flats.
    if (shapeCrag > 0) h += shapeCrag * highlandMask(blended) * cragLayer(wx, wz, seed);
  } else {
    h = (hillV - 0.5) * shapeHill + shapeBase;
  }
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

// ---------------------------------------------------------------------------
// Two per-biome heightfield appliers, ported from upstream's `applyFenBraids`
// and `applyFrostTerraces` (src/sim/world.ts). Upstream gates each one on the
// hardcoded rect of the single zone that uses it; ours are gated on the blended
// biome weight instead, so any zone declaring the biome gets the landform and
// it fades in across the same window every other biome property does. Both are
// pure in (x, z, h, seed) and both leave roads and mob camps alone, because a
// marked route has to stay walkable and a camp has to stay flat.
// ---------------------------------------------------------------------------

// The Braids: a fen's water-meadows dissolve into winding channels and grassy
// islets. Channels follow the valleys of a ridged noise field and only ever cut
// DOWN, so nothing here can raise ground into a wall.
export function fenBraidHeight(x: number, z: number, h: number, seed: number, w: number): number {
  if (h < WATER_LEVEL + 0.5 || h > 5.5) return h;
  const ridge = Math.abs(fbm2(x * 0.021, z * 0.021, seed + 9301, 3) - 0.5) * 2;
  let channel = (1 - smoothstep(0.05, 0.17, ridge)) * w;
  if (channel <= 0) return h;
  channel *= smoothstep(8, 15, roadDistance(x, z));
  if (channel <= 0) return h;
  for (let i = 0; i < CAMP_FLAT.length; i += 3) {
    const dx = x - CAMP_FLAT[i], dz = z - CAMP_FLAT[i + 1], radius = CAMP_FLAT[i + 2];
    const gate = smoothstep(radius * 1.6, radius * 2.4, Math.sqrt(dx * dx + dz * dz));
    if (gate < channel) channel = gate;
  }
  const depth = (WATER_LEVEL - 1.4 - h) * channel;
  return depth < 0 ? h + depth : h;
}

// Benched mountain ground: the massif steps into flats, ramps and short steep
// risers. Suppressed near roads so every marked route stays climbable, and
// below the shore line so beaches ease into the water.
export function terraceHeight(x: number, z: number, h: number, seed: number, w: number): number {
  if (h < WATER_LEVEL + 2) return h;
  const road = roadDistance(x, z);
  if (road < 5) return h;
  const step = 6.5;
  const jit = (noise2(x * 0.045, z * 0.045, seed + 88) - 0.5) * 3.4;
  const hh = h + jit;
  const floor = Math.floor(hh / step) * step;
  const frac = (hh - floor) / step;
  const ledge = floor + step * Math.min(1, Math.max(0, (frac - 0.26) / 0.42));
  const amount =
    0.55 *
    smoothstep(WATER_LEVEL + 2, WATER_LEVEL + 5.5, h) *
    smoothstep(5, 12, road) *
    w;
  return h + (ledge - h) * amount;
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

  // Signature ground for the two biomes whose landform IS a shaping rule
  // rather than a hand-placed landmark. Both run BEFORE the border ridges and
  // the world rim, so no wall, sealed crest or rim can be terraced into a
  // climbable notch (upstream applies them after its walls; ours are the only
  // thing holding players inside the world, so they stay untouched). Both
  // guards are module consts derived from the live zone list, so a world of
  // shipped biomes pays one compare and nothing else.
  if (HAS_BRAID || HAS_TERRACE) {
    const shape = shapeAt(x, z);
    if (HAS_BRAID && shape.braid > 0) h = fenBraidHeight(x, z, h, seed, shape.braid);
    if (HAS_TERRACE && shape.terrace > 0) h = terraceHeight(x, z, h, seed, shape.terrace);
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
      // Density gate + kind mix per biome. The vale/marsh/blight rows and the
      // fallback (which is what `peaks` takes) are unchanged, so every shipped
      // zone scatters exactly the decorations it always did; the rest are
      // upstream's own mixes for those biomes.
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
      } else if (biome === 'dusk') {
        // a glade: sparse pines, more twisted elders and stone
        if (r > 0.38) continue;
        kind = r < 0.14 ? 'tree' : r < 0.28 ? 'tree2' : 'rock';
      } else if (biome === 'ember') {
        // scorched waste: trees thin out, boulders strew the volcanic plain
        if (r > 0.32) continue;
        kind = r < 0.10 ? 'tree' : r < 0.18 ? 'tree2' : 'rock';
      } else if (biome === 'frost') {
        // hardy pines and broken stone on the snow benches
        if (r > 0.36) continue;
        kind = r < 0.18 ? 'tree' : r < 0.23 ? 'tree2' : 'rock';
      } else if (biome === 'amber') {
        // a dense fire-coloured weald, broadleaf-heavy
        if (r > 0.50) continue;
        kind = r < 0.12 ? 'tree' : r < 0.42 ? 'tree2' : 'rock';
      } else if (biome === 'fen') {
        // open and soft: scattered broadleafs, very little stone
        if (r > 0.30) continue;
        kind = r < 0.06 ? 'tree' : r < 0.26 ? 'tree2' : 'rock';
      } else if (biome === 'night') {
        // open moon meadows: sparse silvered groves, standing stones between
        if (r > 0.28) continue;
        kind = r < 0.08 ? 'tree' : r < 0.20 ? 'tree2' : 'rock';
      } else if (biome === 'haunt') {
        // the densest forest in the world: the canopy is the realm
        if (r > 0.62) continue;
        kind = r < 0.30 ? 'tree' : r < 0.54 ? 'tree2' : 'rock';
      } else if (biome === 'jungle') {
        // wall-to-wall broadleaf inland, nothing on the low sand shelf
        if (terrainHeight(gx, gz, seed) < 3) continue;
        if (r > 0.58) continue;
        kind = r < 0.10 ? 'tree' : r < 0.50 ? 'tree2' : 'rock';
      } else if (biome === 'garden') {
        // open parkland: sparse specimen trees on the lawns
        if (r > 0.30) continue;
        kind = r < 0.16 ? 'tree' : r < 0.20 ? 'tree2' : 'rock';
      } else if (biome === 'gale') {
        // wind-scoured downs: rock outcrops everywhere, hardy windbreaks between
        if (r > 0.22) continue;
        kind = r < 0.09 ? 'tree' : r < 0.14 ? 'tree2' : 'rock';
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
