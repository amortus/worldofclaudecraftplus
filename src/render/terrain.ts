import * as THREE from 'three';
import {
  columnBlendAt, COLUMN_ZONES, DUNGEON_X_THRESHOLD, STRIP_ZONES, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z,
  worldHalfWidthAt, WORLD_SIZE, ZONES,
} from '../sim/data';
import type { BiomeId } from '../sim/types';
import { roadDistance, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../sim/world';
import { loadTexture } from './assets/loader';
import { registerPreload } from './assets/preload';
import { GFX } from './gfx';
import { runIdleQueue } from './idle_queue';
import { impactCraterTerrainBlend } from './impact_terrain';
import { terrainBuildBudget } from './render_budget';
import { freezeStaticMatrices } from './static_matrices';
import {
  emptyTerrainResidencyPlan,
  planTerrainResidency,
  type TerrainChunkFootprint,
  type TerrainResidencyPlan,
  terrainChunkDivisions,
  terrainChunkVertexCount,
} from './terrain_residency';
import { groundDetailTexture, groundSplatMaps, macroNoiseTexture } from './textures';

// Chunked terrain across the whole 360x1080 zone strip.
//
// - ~60u chunks with their own bounding volumes so frustum culling actually
//   works (the old single-plane-per-zone terrain was always fully submitted).
// - LOD by distance from the nearest hub at build time: settlements (where
//   the camera lingers) get dense vertices, the wilderness gets coarse ones.
// - Distance-based RESIDENCY (see terrain_residency.ts): only chunks near the
//   camera are meshed, far ones release their geometry, and approaching one
//   rebuilds it under a per-frame vertex budget. A rebuilt chunk is byte-identical
//   to the one it replaced because the geometry is a pure function of
//   (x0, z0, size, spacing, seed) and the seed never changes.
//   KNOWN COST: renderer.ts's `world.geometry-upload` prewarm force-shows every
//   chunk once behind the loading screen so their buffers reach the GPU before
//   the camera can rotate one into view. It can only reach the chunks that exist
//   at that moment, so a chunk meshed later during play still pays a lazy upload
//   on its first draw. Bounded in practice: the residency disc covers the whole
//   fog plane, so late builds happen at the horizon under near-opaque fog, a few
//   at a time, and the instance freeze above removes the one case (leaving a
//   dungeon) that would otherwise rebuild a whole disc at once.
// - 0.3u skirts hang from every chunk edge to hide LOD cracks.
// - High tier: MeshStandardMaterial + splat shading (grass/dirt/rock/sand
//   weights precomputed per vertex from slope/height/roadDistance into a vec4
//   attribute) over the biome vertex-color tint, plus a world-space macro
//   normal map baked from terrainHeight.
// - Low tier: the legacy vertex-color Lambert look, still chunked for culling.

const CHUNK_SIZE = 60;
const SKIRT_DROP = 0.3;
const SLOPE_EPS = 1.5; // matches the legacy color pass so tints don't shift

// ---------------------------------------------------------------------------
// Real PBR splat layers (ambientCG 1K, shipped under public/textures/terrain).
// Kicked off at module import and registered with the preload gate, so by the
// time buildTerrain runs the resolved textures are available synchronously.
// ---------------------------------------------------------------------------

const TERRAIN_TEX: Record<string, THREE.Texture> = {};

function kickTerrainTex(key: string, file: string, srgb: boolean): void {
  registerPreload(loadTexture(`/textures/terrain/${file}`, { srgb, repeat: true }).then((tex) => {
    // Albedo gets the full tier cap; normals never need more than 4. Desktop stays 8/4,
    // mobile tiers drop to 2/2 (medium) or 1/1 (low).
    tex.anisotropy = srgb ? GFX.anisotropy : Math.min(GFX.anisotropy, 4);
    TERRAIN_TEX[key] = tex;
    return tex;
  }));
}

// ~15MB of JPEGs — skip when the URL already forces the Lambert tier (an
// auto-detected low tier still fetches them; the URL guess can't know yet)
if (GFX.terrainSplat) {
  kickTerrainTex('grassC', 'Grass001_Color.jpg', true);
  kickTerrainTex('grassN', 'Grass001_NormalGL.jpg', false);
  kickTerrainTex('dirtC', 'Ground048_Color.jpg', true);
  kickTerrainTex('dirtN', 'Ground048_NormalGL.jpg', false);
  kickTerrainTex('rockC', 'Rock051_Color.jpg', true);
  kickTerrainTex('rockN', 'Rock051_NormalGL.jpg', false);
  kickTerrainTex('sandC', 'Ground080_Color.jpg', true);
  kickTerrainTex('sandN', 'Ground080_NormalGL.jpg', false);
  kickTerrainTex('mudC', 'Ground071_Color.jpg', true); // marsh wet mud (dirt variant)
  kickTerrainTex('snowC', 'Snow010A_Color.jpg', true);
}

export function hasTerrainSplatAssets(): boolean {
  return Boolean(
    TERRAIN_TEX.grassC && TERRAIN_TEX.grassN
      && TERRAIN_TEX.dirtC && TERRAIN_TEX.dirtN
      && TERRAIN_TEX.rockC && TERRAIN_TEX.rockN
      && TERRAIN_TEX.sandC && TERRAIN_TEX.sandN
      && TERRAIN_TEX.mudC && TERRAIN_TEX.snowC,
  );
}

// Per-layer constant roughness, eyeballed from the packs' roughness-map means
// (saves four samplers vs. real roughness maps; terrain is never glossy
// enough for the difference to read at gameplay camera distance).
const ROUGH_GRASS = 0.8;
const ROUGH_DIRT = 0.9;
const ROUGH_ROCK = 0.75;
const ROUGH_SAND = 0.85;
const ROUGH_MUD = 0.62; // wet sheen
const ROUGH_SNOW = 0.72;

// vertex spacing by distance from the nearest hub centre
const LOD_BANDS = {
  high: [
    { maxHubDist: 95, spacing: 1.2 },
    { maxHubDist: 185, spacing: 2.0 },
    { maxHubDist: Infinity, spacing: 3.5 },
  ],
  low: [
    { maxHubDist: 95, spacing: 3.0 },
    { maxHubDist: 185, spacing: 4.4 },
    { maxHubDist: Infinity, spacing: 6.5 },
  ],
} as const;

// Terrain macro-normal resolution. It covers the WHOLE world box in the
// geometry's planar uv, so 640x1920 was a density (~0.56u per texel over the
// 360yd strip), not a constant: left as literals it squashed the macro relief
// 3x along x the moment the world became a 3 column grid. Rescale both axes so
// the TEXEL BUDGET (1.23M boot terrainHeight samples plus the upload) and the
// axis density ratio are exactly what they were on the strip.
const NORMAL_TEX_COLUMNS = (WORLD_MAX_X * 2) / WORLD_SIZE;
const NORMAL_TEX_W = Math.round((640 * NORMAL_TEX_COLUMNS) / Math.sqrt(NORMAL_TEX_COLUMNS));
const NORMAL_TEX_H = Math.round(1920 / Math.sqrt(NORMAL_TEX_COLUMNS));
const NORMAL_TEX_STRENGTH = 1.35;

// Ground colors per biome; boundaries blend across the same window as the
// heightfield's shape blend. This is the tint layer the splat albedo
// multiplies into (splat textures are authored near mid-gray).
const BIOME_PALETTE: Record<BiomeId, { grass: number; grassDark: number; grassYellow: number; dirt: number; sand: number }> = {
  vale: { grass: 0x548545, grassDark: 0x3e6635, grassYellow: 0x768c44, dirt: 0x8a6f47, sand: 0xc2b283 },
  marsh: { grass: 0x596d36, grassDark: 0x41522b, grassYellow: 0x71764a, dirt: 0x6e5a3e, sand: 0x8f7f5c },
  peaks: { grass: 0x687a55, grassDark: 0x4d5c45, grassYellow: 0x8d9168, dirt: 0x7d6a50, sand: 0xb0a486 },
  // blight: dead, desaturated dark grey-brown ground (no living green at all)
  blight: { grass: 0x3c3a33, grassDark: 0x2b2a24, grassYellow: 0x46433a, dirt: 0x322d27, sand: 0x423c33 },
  // dusk: violet-cast glade greens over dusty rose soil
  dusk: { grass: 0x6d7566, grassDark: 0x4c4e58, grassYellow: 0x8c8078, dirt: 0x6e5a68, sand: 0xa593a2 },
  // ember: scorched ochre waste
  ember: { grass: 0xc9a86a, grassDark: 0xa8854f, grassYellow: 0xd8bc80, dirt: 0x9a6a44, sand: 0xe0c088 },
  // frost: snowfields over blue-grey rock
  frost: { grass: 0xeef4fa, grassDark: 0xd8e4f0, grassYellow: 0xcfdce8, dirt: 0x9fb0c0, sand: 0xdfe8f2 },
  // amber: fire-gold autumn weald (runs hot: the splat albedo is green-authored)
  amber: { grass: 0xc9a44e, grassDark: 0xa88438, grassYellow: 0xe0c060, dirt: 0x8a6a42, sand: 0xd8bc84 },
  // fen: lush wet green over peat
  fen: { grass: 0x7cab68, grassDark: 0x5c8a52, grassYellow: 0xa2c47a, dirt: 0x6e6448, sand: 0xb8bc8e },
  // night: the dream meadows run violet, and hot, for the same reason amber does
  night: { grass: 0xc06cf2, grassDark: 0x8f4ecc, grassYellow: 0xe08cf8, dirt: 0x8a5cb8, sand: 0xd8a8f0 },
  // haunt: dead mossy floor, cold wet earth, everything a shade too dark
  haunt: { grass: 0x46543e, grassDark: 0x2e382c, grassYellow: 0x5a6644, dirt: 0x453c34, sand: 0x6b6754 },
  // jungle: saturated tropical green over bright coral sand
  jungle: { grass: 0x3f9448, grassDark: 0x2c7038, grassYellow: 0x74b04e, dirt: 0x8a6e4a, sand: 0xf2e2b4 },
  // garden: mown lawn over warm gravel, tidy even where it has run wild
  garden: { grass: 0x58a04e, grassDark: 0x3f7e3c, grassYellow: 0x86b85c, dirt: 0x8a7a5a, sand: 0xd8cca8 },
  // gale: wind-dried sage downs over grey shingle
  gale: { grass: 0x6a9a62, grassDark: 0x4c7a4e, grassYellow: 0x9ab070, dirt: 0x7a6e58, sand: 0xd8d0b8 },
};

// rock starts creeping in at lower slopes in the peaks, later in the marsh
const ROCK_SLOPE_START: Record<BiomeId, number> = {
  vale: 0.55, marsh: 0.62, peaks: 0.45, blight: 0.5,
  dusk: 0.52, ember: 0.5, frost: 0.5, amber: 0.52, fen: 0.6,
  night: 0.55, haunt: 0.58, jungle: 0.6, garden: 0.6,
  gale: 0.5, // the sea cliffs crag early
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// One terrain sample, written into a flat Float64Array rather than returned as an
// object. Chunks are meshed DURING GAMEPLAY now (residency rebuilds them on
// approach), not just once at boot, so the old shape -- a Map<number, VertexSample>
// holding one object per grid cell, each owning four sub-arrays -- was about 14k
// short-lived objects per chunk landing in the middle of a frame. GC churn is a
// root cause of this project's stutter that we have already had to fix once.
// Float64 (not Float32) so a rebuilt chunk stays BYTE-IDENTICAL: the values reach
// the geometry's Float32Arrays through the same single rounding step they always
// did, instead of being rounded once here and again on write.
const S_HEIGHT = 0;
const S_NORMAL = 1; // 3 floats
const S_COLOR = 4; // 3 floats
const S_SPLAT = 7; // 4 floats: grass, dirt, rock, sand
const S_EXTRA = 11; // 4 floats: mud, snow, impact scorch, impact ash
const SAMPLE_STRIDE = 15;

let sampleData = new Float64Array(0);
let sampleMark = new Int32Array(0);
// Monotonic per-build stamp, so a rebuild never has to clear the mark array.
let sampleStamp = 0;

function beginSampleScratch(cells: number): void {
  if (sampleMark.length < cells) {
    sampleData = new Float64Array(cells * SAMPLE_STRIDE);
    sampleMark = new Int32Array(cells);
    sampleStamp = 0;
  }
  if (sampleStamp >= 0x7fff_fff0) {
    sampleMark.fill(0);
    sampleStamp = 0;
  }
  sampleStamp++;
}

// Shared scratch colors for the palette blend (hot loop, avoid allocation).
const cTmp = new THREE.Color();
const grassC = new THREE.Color(), grassDarkC = new THREE.Color(), grassYellowC = new THREE.Color();
const dirtC = new THREE.Color(), sandC = new THREE.Color();
const dirtDarkC = new THREE.Color(0x73592f);
const rockC = new THREE.Color(0x7a7a72);
const impactAshC = new THREE.Color(0x18110d);
const impactScorchC = new THREE.Color(0x2a160c);
const hazyPeakC = new THREE.Color(0xa8bdd4); // world-rim mountains, atmospheric
const snowCapC = new THREE.Color(0xedf3fa);
const lowSunC = new THREE.Color(0xe7d9a5);
const lowShadeC = new THREE.Color(0x60745b);
// The palette cascade is a NORTH-SOUTH stack, so it walks STRIP_ZONES (the
// full-width bands) and not ZONES: the grid's column zones are appended to
// ZONES after the bands, share the vale's z band, and would otherwise blend
// their palette into the northmost band's rim (see STRIP_ZONES in sim/data).
const toPalette = (zn: { biome: BiomeId }) => {
  const p = BIOME_PALETTE[zn.biome];
  return {
    grass: new THREE.Color(p.grass), grassDark: new THREE.Color(p.grassDark),
    grassYellow: new THREE.Color(p.grassYellow), dirt: new THREE.Color(p.dirt), sand: new THREE.Color(p.sand),
  };
};
const zonePalettes = STRIP_ZONES.map(toPalette);
// ...and the column zones, blended in SIDEWAYS by the same window the
// heightfield's shape blend uses (sim/world.ts shapeAt). Without this a column
// zone paints the ground of whatever band it shares a z with, so both shipped
// columns rendered as vale despite being marsh and peaks, and any new column
// biome would be invisible no matter what its palette said. `columnBlendAt`
// returns exactly +0 outside its window, so every full-width band keeps the
// exact colour it had.
const columnPalettes = COLUMN_ZONES.map(toPalette);

function paletteAt(x: number, z: number): void {
  grassC.copy(zonePalettes[0].grass);
  grassDarkC.copy(zonePalettes[0].grassDark);
  grassYellowC.copy(zonePalettes[0].grassYellow);
  dirtC.copy(zonePalettes[0].dirt);
  sandC.copy(zonePalettes[0].sand);
  for (let i = 0; i + 1 < STRIP_ZONES.length; i++) {
    const b = STRIP_ZONES[i].zMax;
    const t = clamp01((z - (b - 30)) / 65);
    const tt = t * t * (3 - 2 * t);
    if (tt <= 0) break;
    grassC.lerp(zonePalettes[i + 1].grass, tt);
    grassDarkC.lerp(zonePalettes[i + 1].grassDark, tt);
    grassYellowC.lerp(zonePalettes[i + 1].grassYellow, tt);
    dirtC.lerp(zonePalettes[i + 1].dirt, tt);
    sandC.lerp(zonePalettes[i + 1].sand, tt);
  }
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    const tt = columnBlendAt(COLUMN_ZONES[i], x, z);
    if (tt <= 0) continue;
    grassC.lerp(columnPalettes[i].grass, tt);
    grassDarkC.lerp(columnPalettes[i].grassDark, tt);
    grassYellowC.lerp(columnPalettes[i].grassYellow, tt);
    dirtC.lerp(columnPalettes[i].dirt, tt);
    sandC.lerp(columnPalettes[i].sand, tt);
  }
}

// How "marsh" a given position is — mirrors the palette/heightfield blend
// windows (bands northward, columns sideways) so the mud texture fades in
// exactly where the marsh palette does.
function marshWeightAt(x: number, z: number): number {
  let w = STRIP_ZONES[0].biome === 'marsh' ? 1 : 0;
  for (let i = 0; i + 1 < STRIP_ZONES.length; i++) {
    const b = STRIP_ZONES[i].zMax;
    const t = clamp01((z - (b - 30)) / 65);
    const tt = t * t * (3 - 2 * t);
    if (tt <= 0) break;
    w += ((STRIP_ZONES[i + 1].biome === 'marsh' ? 1 : 0) - w) * tt;
  }
  for (let i = 0; i < COLUMN_ZONES.length; i++) {
    const tt = columnBlendAt(COLUMN_ZONES[i], x, z);
    if (tt <= 0) continue;
    w += ((COLUMN_ZONES[i].biome === 'marsh' ? 1 : 0) - w) * tt;
  }
  return w;
}

// The world's half width at a row, memoized on z AND on the side of the strip
// the sample sits on. sampleVertex runs down a chunk's inner loop with z held
// constant, so one slot hits on every vertex but the first of each row and the
// rim tint costs no per-vertex column scan.
//
// The side is part of the key because the half width is per side now: upstream's
// grid has rows with a column on ONE side only (the Farshore's band), and the
// empty side keeps the strip's own rim (see sim/data worldHalfWidthAt). A chunk
// never straddles x = 0 by more than its own width, so this stays a 1-slot hit.
let rimHalfZ = Number.NaN;
let rimHalfSide = 0;
let rimHalfWidth = 0;
function rimHalfWidthAt(z: number, x: number): number {
  const side = x < 0 ? -1 : 1;
  if (z !== rimHalfZ || side !== rimHalfSide) {
    rimHalfZ = z;
    rimHalfSide = side;
    rimHalfWidth = worldHalfWidthAt(z, side);
  }
  return rimHalfWidth;
}

// blend the splat weight vector toward a single layer
function lerpSplat(w: number[], layer: 0 | 1 | 2 | 3, t: number): void {
  if (t <= 0) return;
  w[0] -= w[0] * t;
  w[1] -= w[1] * t;
  w[2] -= w[2] * t;
  w[3] -= w[3] * t;
  w[layer] += t;
}

// Reused splat accumulator: one array for the whole session instead of one per
// vertex (see the SAMPLE_STRIDE note above).
const splatScratch = [1, 0, 0, 0];

/**
 * One terrain sample -- height, analytic normal, legacy tint color and splat
 * weights -- written into `out` at `o`. Both tiers use the color; only the splat
 * tier consumes the weights.
 *
 * Reads `GFX.lowPlus` / `GFX.terrainSplat` live. `GFX` is an `export let` that
 * `initGfxTier` reassigns, which is safe TODAY because that runs once, before
 * `buildTerrain`. If a runtime tier switch is ever added it MUST rebuild the whole
 * terrain view: chunks are rebuilt on approach now, so a mid-session tier change
 * would otherwise give a rebuilt chunk a different tint from the neighbours it
 * shares an edge with.
 */
function sampleVertex(x: number, z: number, seed: number, out: Float64Array, o: number): void {
  const h = terrainHeight(x, z, seed);
  const hx = terrainHeight(x + SLOPE_EPS, z, seed) - terrainHeight(x - SLOPE_EPS, z, seed);
  const hz = terrainHeight(x, z + SLOPE_EPS, seed) - terrainHeight(x, z - SLOPE_EPS, seed);
  const slope = Math.sqrt(hx * hx + hz * hz) / (2 * SLOPE_EPS);
  const invLen = 1 / Math.hypot(hx / (2 * SLOPE_EPS), 1, hz / (2 * SLOPE_EPS));
  out[o + S_NORMAL] = -(hx / (2 * SLOPE_EPS)) * invLen;
  out[o + S_NORMAL + 1] = invLen;
  out[o + S_NORMAL + 2] = -(hz / (2 * SLOPE_EPS)) * invLen;

  paletteAt(x, z);
  const biome = zoneBiomeAt(x, z);
  const w = splatScratch;
  w[0] = 1;
  w[1] = 0;
  w[2] = 0;
  w[3] = 0;
  const impact = impactCraterTerrainBlend(x, z);

  // base grass with patchy variation
  const v = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + 1) / 2;
  cTmp.copy(grassC).lerp(grassDarkC, v);
  const v2 = (Math.sin(x * 0.043 + 5) * Math.cos(z * 0.05 + 2) + 1) / 2;
  cTmp.lerp(grassYellowC, v2 * 0.35);
  // the marsh reads muddier: patches of wet dirt across the lowland
  if (biome === 'marsh') lerpSplat(w, 1, 0.3 * v2 * clamp01((4 - h) / 6));
  // the blight is dead bare earth: the splat defaults to the GREEN grass texture,
  // so drop it for the dirt layer and pull the tint toward bare brown. Without
  // this the 3D ground stays grassy-green even though the palette/minimap is brown.
  if (biome === 'blight') {
    lerpSplat(w, 1, 0.9);
    cTmp.lerp(dirtC, 0.6);
  }
  // shoreline sand — color and splat weight share one feathered falloff so
  // the beach blends out instead of cutting a razor-hard grass/sand line
  const shore = clamp01((WATER_LEVEL + 1.6 - h) / 1.6);
  cTmp.lerp(sandC, shore);
  lerpSplat(w, 3, shore);
  // packed dirt at each hub settlement (same feather as the splat weight —
  // a constant lerp stamped a clean-edged brown disc on the grass)
  for (const zn of ZONES) {
    const dHub = Math.hypot(x - zn.hub.x, z - zn.hub.z);
    if (dHub < 14) {
      const hubT = clamp01((14 - dHub) / 3);
      cTmp.lerp(dirtDarkC, 0.7 * hubT);
      lerpSplat(w, 1, 0.75 * hubT);
      break;
    }
  }
  const rd = roadDistance(x, z);
  if (rd < 2.0) {
    cTmp.lerp(dirtC, 0.85);
    lerpSplat(w, 1, 0.85);
  } else if (rd < 3.4) {
    const t = 0.85 * (1 - (rd - 2.0) / 1.4);
    cTmp.lerp(dirtC, t);
    lerpSplat(w, 1, t);
  }
  const rockStart = ROCK_SLOPE_START[biome];
  if (slope > rockStart) {
    const t = Math.min(1, (slope - rockStart) * 2);
    cTmp.lerp(rockC, t);
    lerpSplat(w, 2, t);
  }
  // high ground (ridges, peaks) goes rocky then snowy
  let snow = 0;
  if (h > 22) {
    cTmp.lerp(rockC, clamp01((h - 22) / 10) * 0.7);
    snow = clamp01((h - 34) / 14) * 0.85;
    cTmp.lerp(snowCapC, snow);
    lerpSplat(w, 2, clamp01((h - 22) / 10) * 0.8);
  }
  if (impact.scorch > 0) {
    cTmp.lerp(impactScorchC, 0.88 * impact.scorch);
    cTmp.lerp(impactAshC, 0.58 * impact.ash);
    lerpSplat(w, 1, impact.dirt);
    lerpSplat(w, 2, impact.rock);
  }
  // the rim wall reads as distant sunlit peaks, not a black cliff. The x half
  // width is PER ROW (sim/world raises the wall at worldHalfWidthAt(z)), so a
  // row without a column zone still gets the haze on its own wall at |x| = 180
  // instead of only at the grid's outer box edge.
  const edge = Math.max(
    Math.abs(x) - (rimHalfWidthAt(z, x) - 32),
    WORLD_MIN_Z + 32 - z,
    z - (WORLD_MAX_Z - 32),
  );
  const rim = clamp01(edge / 26);
  if (rim > 0) {
    cTmp.lerp(hazyPeakC, rim * 0.9);
    const rimSnow = clamp01((h - 26) / 16) * rim * 0.8;
    cTmp.lerp(snowCapC, rimSnow);
    snow = Math.max(snow, rimSnow);
    lerpSplat(w, 2, rim * 0.85);
  }
  // mud rides the dirt layer wherever the marsh palette is active
  const mud = marshWeightAt(x, z);
  if (GFX.lowPlus && !GFX.terrainSplat) {
    const ridge = clamp01((slope - 0.22) * 1.6);
    const lowland = clamp01((WATER_LEVEL + 7 - h) / 12);
    const upland = clamp01((h - 8) / 22);
    cTmp.lerp(lowShadeC, 0.07 * ridge + 0.05 * lowland * mud);
    cTmp.lerp(lowSunC, 0.035 * (1 - shore) + 0.045 * upland);
    cTmp.multiplyScalar(0.98 + upland * 0.04 - ridge * 0.025);
  }
  out[o + S_HEIGHT] = h;
  out[o + S_COLOR] = cTmp.r;
  out[o + S_COLOR + 1] = cTmp.g;
  out[o + S_COLOR + 2] = cTmp.b;
  out[o + S_SPLAT] = w[0];
  out[o + S_SPLAT + 1] = w[1];
  out[o + S_SPLAT + 2] = w[2];
  out[o + S_SPLAT + 3] = w[3];
  out[o + S_EXTRA] = mud;
  out[o + S_EXTRA + 1] = snow;
  out[o + S_EXTRA + 2] = impact.scorch;
  out[o + S_EXTRA + 3] = impact.ash;
}

// ---------------------------------------------------------------------------
// Chunk geometry: interior (nx+1)x(nz+1) grid wrapped in a skirt ring whose
// vertices sit on the chunk border but 0.3u lower, hiding LOD cracks.
// ---------------------------------------------------------------------------

/**
 * Index buffer for a chunk of `vertexCount` vertices. Index width follows the
 * chunk instead of the worst case: the densest chunk here is about 530 vertices,
 * so 16-bit indices address it with room to spare at half the buffer memory and
 * half the upload of the unconditional Uint32 this used to allocate (and no
 * OES_element_index_uint dependency). The guard keeps a hypothetical dense chunk
 * correct: the largest index written is vertexCount - 1.
 */
export function terrainIndexArray(
  vertexCount: number,
  indexCount: number,
): Uint16Array | Uint32Array {
  return vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
}

function buildChunkGeometry(x0: number, z0: number, size: number, spacing: number, seed: number, withSplat: boolean): THREE.BufferGeometry {
  const nx = terrainChunkDivisions(size, spacing);
  const nz = nx;
  const stepX = size / nx;
  const stepZ = size / nz;
  const gw = nx + 3; // grid width including the skirt ring
  const gh = nz + 3;
  const count = gw * gh;

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const splats = withSplat ? new Float32Array(count * 4) : null;
  const extras = withSplat ? new Float32Array(count * 4) : null;

  const worldDepth = WORLD_MAX_Z - WORLD_MIN_Z;
  beginSampleScratch(count);
  const samples = sampleData;
  const marks = sampleMark;
  const stamp = sampleStamp;
  for (let gj = 0; gj < gh; gj++) {
    for (let gi = 0; gi < gw; gi++) {
      const i = gi - 1, j = gj - 1; // interior indices; -1 / n+1 are skirt
      const ci = Math.max(0, Math.min(nx, i));
      const cj = Math.max(0, Math.min(nz, j));
      const isSkirt = i !== ci || j !== cj;
      const x = x0 + ci * stepX;
      const z = z0 + cj * stepZ;
      // skirt verts share the border sample — cache by clamped grid index
      const cacheKey = cj * gw + ci;
      const s = cacheKey * SAMPLE_STRIDE;
      if (marks[cacheKey] !== stamp) {
        sampleVertex(x, z, seed, samples, s);
        marks[cacheKey] = stamp;
      }
      const vi = gj * gw + gi;
      positions[vi * 3] = x;
      positions[vi * 3 + 1] = samples[s + S_HEIGHT] - (isSkirt ? SKIRT_DROP : 0);
      positions[vi * 3 + 2] = z;
      normals[vi * 3] = samples[s + S_NORMAL];
      normals[vi * 3 + 1] = samples[s + S_NORMAL + 1];
      normals[vi * 3 + 2] = samples[s + S_NORMAL + 2];
      colors[vi * 3] = samples[s + S_COLOR];
      colors[vi * 3 + 1] = samples[s + S_COLOR + 1];
      colors[vi * 3 + 2] = samples[s + S_COLOR + 2];
      uvs[vi * 2] = (x + WORLD_MAX_X) / (WORLD_MAX_X * 2);
      uvs[vi * 2 + 1] = (z - WORLD_MIN_Z) / worldDepth;
      if (splats) {
        splats[vi * 4] = samples[s + S_SPLAT];
        splats[vi * 4 + 1] = samples[s + S_SPLAT + 1];
        splats[vi * 4 + 2] = samples[s + S_SPLAT + 2];
        splats[vi * 4 + 3] = samples[s + S_SPLAT + 3];
      }
      if (extras) {
        extras[vi * 4] = samples[s + S_EXTRA];
        extras[vi * 4 + 1] = samples[s + S_EXTRA + 1];
        extras[vi * 4 + 2] = samples[s + S_EXTRA + 2];
        extras[vi * 4 + 3] = samples[s + S_EXTRA + 3];
      }
    }
  }

  const quadsX = gw - 1, quadsZ = gh - 1;
  const indices = terrainIndexArray(gw * gh, quadsX * quadsZ * 6);
  let k = 0;
  for (let gj = 0; gj < quadsZ; gj++) {
    for (let gi = 0; gi < quadsX; gi++) {
      const a = gj * gw + gi;
      const b = a + 1;
      const c = a + gw;
      const d = c + 1;
      indices[k++] = a; indices[k++] = c; indices[k++] = b;
      indices[k++] = b; indices[k++] = c; indices[k++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (splats) geo.setAttribute('aSplat', new THREE.BufferAttribute(splats, 4));
  if (extras) geo.setAttribute('aExtra', new THREE.BufferAttribute(extras, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Macro relief: a DataTexture normal map baked from terrainHeight in
// strip-planar UV space — cliffs and ridges get per-pixel light response far
// beyond the vertex density.
// ---------------------------------------------------------------------------

function terrainNormalTexture(seed: number): THREE.DataTexture {
  const w = NORMAL_TEX_W, h = NORMAL_TEX_H;
  const worldW = WORLD_MAX_X * 2;
  const worldD = WORLD_MAX_Z - WORLD_MIN_Z;
  const stepX = worldW / w;
  const stepZ = worldD / h;
  const heights = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = WORLD_MIN_Z + (j + 0.5) * stepZ;
    for (let i = 0; i < w; i++) {
      heights[j * w + i] = terrainHeight(-WORLD_MAX_X + (i + 0.5) * stepX, z, seed);
    }
  }
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const iw = Math.max(0, i - 1), ie = Math.min(w - 1, i + 1);
      const jn = Math.max(0, j - 1), js = Math.min(h - 1, j + 1);
      const dhdx = (heights[j * w + ie] - heights[j * w + iw]) / ((ie - iw) * stepX);
      const dhdz = (heights[js * w + i] - heights[jn * w + i]) / ((js - jn) * stepZ);
      const nx = -dhdx * NORMAL_TEX_STRENGTH;
      const nz = -dhdz * NORMAL_TEX_STRENGTH;
      const inv = 1 / Math.hypot(nx, 1, nz);
      const o = (j * w + i) * 4;
      data[o] = (nx * inv * 0.5 + 0.5) * 255;
      data[o + 1] = (nz * inv * 0.5 + 0.5) * 255; // green follows +v (+z)
      data[o + 2] = (inv * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function buildSplatMaterial(seed: number): THREE.MeshStandardMaterial {
  // Legacy canvas splats are still generated (result unused): textures.ts
  // shares one LCG across all generators, so dropping this call would shift
  // the look of every texture generated after it (foliage, props, ...).
  groundSplatMaps();
  const macro = macroNoiseTexture();
  const t = TERRAIN_TEX;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1.0,
    metalness: 0,
    normalMap: terrainNormalTexture(seed),
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uGrass: { value: t.grassC },
      uGrassN: { value: t.grassN },
      uDirt: { value: t.dirtC },
      uDirtN: { value: t.dirtN },
      uRock: { value: t.rockC },
      uRockN: { value: t.rockN },
      uSand: { value: t.sandC },
      uSandN: { value: t.sandN },
      uMud: { value: t.mudC },
      uSnow: { value: t.snowC },
      uMacro: { value: macro },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSplat;
        attribute vec4 aExtra;
        varying vec4 vSplat;
        varying vec4 vExtra;
        varying vec3 vWPos;
        varying vec3 vWNorm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSplat = aSplat;
        vExtra = aExtra;
        vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWNorm = objectNormal; // terrain mesh is untransformed: object == world`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vSplat;
        varying vec4 vExtra;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        uniform sampler2D uGrass, uGrassN, uDirt, uDirtN, uRock, uRockN, uSand, uSandN, uMud, uSnow, uMacro;`)
      .replace('#include <map_fragment>', `
        vec2 tuv = vWPos.xz * 0.22;
        // grass blends two scales so the 1K photo source never reads as tile
        vec3 grassAlb = mix(texture2D(uGrass, tuv).rgb, texture2D(uGrass, tuv * 0.31).rgb, 0.42);
        // marsh swaps packed dirt for wet mud (roads, hub discs included)
        vec3 dirtAlb = mix(texture2D(uDirt, tuv * 0.8).rgb, texture2D(uMud, tuv * 0.8).rgb, vExtra.x);
        // rock: top-down projection smears into vertical streaks on cliffs,
        // so steep faces blend toward wall-planar (world XY/ZY) samples
        vec3 an = abs(normalize(vWNorm));
        float wallW = clamp(1.0 - an.y * 1.45, 0.0, 1.0);
        float axisW = an.x / max(1e-4, an.x + an.z);
        vec3 rockFlat = texture2D(uRock, tuv * 0.6).rgb;
        vec3 rockWall = mix(
          texture2D(uRock, vWPos.xy * 0.132).rgb,
          texture2D(uRock, vWPos.zy * 0.132).rgb,
          axisW);
        vec3 rockAlb = mix(rockFlat, rockWall, wallW);
        vec3 alb = grassAlb * vSplat.x
                 + dirtAlb * vSplat.y
                 + rockAlb * vSplat.z
                 + texture2D(uSand, tuv).rgb * vSplat.w;
        // snow cover on the peaks/rim, by baked per-vertex weight
        alb = mix(alb, texture2D(uSnow, tuv * 0.7).rgb, vExtra.y);
        // gentle macro brightness swing breaks distant tiling
        float macro = mix(0.92, 1.08, texture2D(uMacro, vWPos.xz * 0.012).r);
        // Meteor impact terrain is authored by the same crater profile as the
        // heightfield. Apply it in albedo space so the PBR textures do not wash
        // the crater floor back toward marsh sand.
        vec3 impactAlb = mix(vec3(0.20, 0.08, 0.035), vec3(0.055, 0.040, 0.032), vExtra.w);
        alb = mix(alb, impactAlb, clamp(vExtra.z * 0.86 + vExtra.w * 0.18, 0.0, 0.96));
        // very-low-frequency hue drift (~100u wavelength) keeps distant
        // hills from flattening into one uniform lawn green
        float macro2 = texture2D(uMacro, vWPos.xz * 0.0045 + 0.37).r;
        alb = mix(alb, alb * vec3(1.07, 1.03, 0.86), (macro2 - 0.5) * 0.5 * vSplat.x);
        // real albedo carries the hue now; vertex color only modulates gently
        // so the biome painting (roads, hub discs, snowline) still reads.
        // (vColor was authored as a full sRGB ground color, so re-centre it
        // around 1.0 before using it as a multiplier.)
        vec3 vtint = clamp(vColor.rgb * 2.0, 0.0, 2.0);
        diffuseColor.rgb *= alb * mix(vec3(1.0), vtint, 0.35) * macro;`)
      .replace('#include <color_fragment>', `
        // vertex color already folded into the splat albedo above (gently);
        // the stock full multiply would re-tint the real textures to mush`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * mix(
          dot(vSplat, vec4(${ROUGH_GRASS}, mix(${ROUGH_DIRT}, ${ROUGH_MUD}, vExtra.x), ${ROUGH_ROCK}, ${ROUGH_SAND})),
          ${ROUGH_SNOW}, vExtra.y);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // per-layer detail normals (GL-convention), weighted by splat
        vec3 gN = texture2D(uGrassN, tuv).xyz * 2.0 - 1.0;
        vec3 dN = texture2D(uDirtN, tuv * 0.8).xyz * 2.0 - 1.0;
        vec3 rN = texture2D(uRockN, tuv * 0.6).xyz * 2.0 - 1.0;
        vec3 sN = texture2D(uSandN, tuv).xyz * 2.0 - 1.0;
        vec2 detN = gN.xy * vSplat.x * 0.65
                  + dN.xy * vSplat.y * 0.8
                  + rN.xy * vSplat.z * 0.9 * (1.0 - wallW)
                  + sN.xy * vSplat.w * 0.55;
        detN *= 1.0 - vExtra.y * 0.7; // snow softens the relief beneath it
        normal = normalize(normal + tbn * vec3(detN, 0.0));
        // cliffs: wall-projected rock normal so steep faces get real relief
        // (approximate world-space tangent frames per projection plane; the
        // handedness flip on back faces is invisible on noisy rock)
        if (vSplat.z * wallW > 0.01) {
          vec3 rNx = texture2D(uRockN, vWPos.zy * 0.132).xyz * 2.0 - 1.0; // +-x faces
          vec3 rNz = texture2D(uRockN, vWPos.xy * 0.132).xyz * 2.0 - 1.0; // +-z faces
          vec3 wallPerturb = mix(vec3(rNz.x, rNz.y, 0.0), vec3(0.0, rNx.y, rNx.x), axisW);
          normal = normalize(normal + mat3(viewMatrix) * wallPerturb * (vSplat.z * wallW * 0.8));
        }`);
  };
  return mat;
}

// yards per repeat of the low tier's ground detail texture. The uv is planar
// over the WHOLE world box (see buildChunkGeometry), so the repeat count has to
// be derived from the box: the historical literal 160 meant "160 repeats across
// the 360yd strip", and left as a literal it stretched the detail 3x in x the
// moment the world became a 3 column grid.
const DETAIL_PERIOD_X = WORLD_SIZE / 160; // 2.25yd
const DETAIL_PERIOD_Z = (WORLD_MAX_Z - WORLD_MIN_Z) / 480; // 3yd

function buildLambertMaterial(): THREE.MeshLambertMaterial {
  const detail = groundDetailTexture();
  // strip-planar uv: keep the legacy texture period in both axes
  detail.repeat.set(
    Math.round((WORLD_MAX_X * 2) / DETAIL_PERIOD_X),
    Math.round((WORLD_MAX_Z - WORLD_MIN_Z) / DETAIL_PERIOD_Z),
  );
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: detail,
    emissive: GFX.lowPlus ? 0x182014 : 0x000000,
    emissiveIntensity: GFX.lowPlus ? 0.08 : 1,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Live residency counters. Every field is recomputed on read, never a stale plan field. */
export interface TerrainResidencyStats {
  /** chunks currently meshed and in `group` */
  resident: number;
  /** chunks the residency policy wants meshed as of the last plan */
  desired: number;
  /** chunk slots in the whole world, i.e. what the pre-residency build kept resident */
  total: number;
  /** wanted-but-not-yet-meshed chunks still waiting on the per-frame build budget */
  pending: number;
  /** chunk geometries released since this view was built (disposal evidence) */
  released: number;
  /** chunk geometries meshed since this view was built (initial builds included) */
  built: number;
  /** true while the camera is on the instance plane and residency is frozen */
  frozen: boolean;
}

export interface TerrainView {
  group: THREE.Group;
  /**
   * Per-frame terrain maintenance, in two passes:
   *  1. RESIDENCY: meshes chunks that came within the tier's keep radius (as many
   *     as `terrainBuildBudget(tier)` vertices buy, nearest first) and releases
   *     the geometry of chunks that passed the release radius. Ignores `fogFar` on
   *     purpose, so the loading screen's force-everything-visible upload pass
   *     (`update(x, z, 1e9)`) cannot drag the whole world back into memory.
   *     FROZEN while the camera is on the instance plane, and skipped entirely
   *     while the camera has not moved and nothing is pending.
   *  2. VISIBILITY: hides resident chunks that sit entirely past the fog far
   *     plane, since those are pure overdraw.
   */
  update(camX: number, camZ: number, fogFar: number): void;
  /** Live residency counters, for tests and the perf harness. */
  residency(): TerrainResidencyStats;
  /**
   * Resolves once the initial resident set has finished streaming in. Only the
   * near ring around the world's zone hubs is built synchronously; the rest of
   * the resident set streams in across idle slots so first paint isn't gated on
   * geometry. Most callers don't need this: the chunk table is live, so the fog
   * cull already sees streamed chunks as they arrive. Use it only when a caller
   * needs the resident map built before doing something else (e.g. a screenshot
   * tour).
   *
   * This is safe because nothing about gameplay reads this mesh: ground height,
   * collision, pathing and player motion all sample the pure math in
   * `src/sim/world.ts`. A not-yet-streamed (or evicted) chunk is a visual gap,
   * never a physics gap.
   */
  streamingDone: Promise<void>;
  /** Stops any in-flight far-chunk streaming. Call before discarding this view. */
  cancelStreaming(): void;
}

// Chunks farther than the near ring stream in this many at a time per idle slot.
const STREAM_BATCH_SIZE = 4;
// Idle-timeout budget. requestIdleCallback's timeout is a DEADLINE, not a delay:
// while the main thread is genuinely idle (the common case right after login)
// every queued callback runs in registration order anyway, so terrain still
// streams promptly. The timeout only decides who gets FORCED through when the
// thread stays busy, and there we deliberately rank last. We share the idle
// queue with player-facing work upstream does not have: the HUD's world-map
// terrain prewarm (timeout 2000) and minimap prewarm (timeout 1000) in
// src/ui/hud.ts. Upstream's 200 would expire ~5x/second and force terrain ahead
// of both, starving the prewarm and pushing map-open latency onto the player at
// exactly the moment they log in. 3000 sits above both prewarms, so under
// sustained load the order is minimap -> world map -> terrain. That is the right
// ranking: an unpainted map is a stall the player waits on, while an unstreamed
// far chunk is only distant scenery that is fog-culled anyway and never gates
// movement (ground height is pure sim math, see TerrainView.streamingDone).
const STREAM_TIMEOUT_MS = 3000;

/** One deferred chunk build: the exact buildChunkGeometry inputs, plus its band. */
export interface ChunkJob {
  x0: number;
  z0: number;
  size: number;
  spacing: number;
  /** true for the densest, closest-to-a-hub band, which builds synchronously */
  near: boolean;
}

/**
 * Far-chunk stream order: nearest to `priorityPoint` first. A returning
 * character can log out anywhere, not just at a zone hub, so the synchronous
 * near ring alone can leave them standing on not-yet-streamed terrain. Ordering
 * by distance to the actual entry point puts the chunk directly underfoot
 * first, rather than wherever row-major order happens to reach it. Pure, and
 * returns a new array (never mutates `jobs`); with no priority point the
 * original row-major order stands.
 */
export function orderFarChunkJobs(
  jobs: readonly ChunkJob[],
  priorityPoint?: { x: number; z: number },
): ChunkJob[] {
  const ordered = jobs.slice();
  if (!priorityPoint) return ordered;
  const distSq = (job: ChunkJob): number => {
    const dx = job.x0 + job.size / 2 - priorityPoint.x;
    const dz = job.z0 + job.size / 2 - priorityPoint.z;
    return dx * dx + dz * dz;
  };
  return ordered.sort((a, b) => distSq(a) - distSq(b));
}

/**
 * How far the camera must move before residency is replanned, in yards. The
 * hysteresis band is 120 yd wide and `keep` clears the widest fog plane by at
 * least 20 yd, so a yard of staleness cannot make a drawn chunk missing.
 */
const REPLAN_EPS = 1;

/** One chunk slot: its immutable build recipe, its footprint, and its mesh when resident. */
interface ChunkSlot {
  job: ChunkJob;
  footprint: TerrainChunkFootprint;
  mesh: THREE.Mesh | null;
}

export function buildTerrain(seed: number, priorityPoint?: { x: number; z: number }): TerrainView {
  const lowGfx = !GFX.terrainSplat || !hasTerrainSplatAssets();
  const mat = lowGfx ? buildLambertMaterial() : buildSplatMaterial(seed);
  const bands = lowGfx ? LOD_BANDS.low : LOD_BANDS.high;
  const group = new THREE.Group();
  group.name = 'terrain';
  const worldDepth = WORLD_MAX_Z - WORLD_MIN_Z;
  const chunksX = Math.ceil((WORLD_MAX_X * 2) / CHUNK_SIZE);
  const chunksZ = Math.ceil(worldDepth / CHUNK_SIZE);

  const bandIndexAt = (cx: number, cz: number): number => {
    const centerX = -WORLD_MAX_X + cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = WORLD_MIN_Z + cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    let hubDist = Infinity;
    for (const zn of ZONES) {
      hubDist = Math.min(hubDist, Math.hypot(centerX - zn.hub.x, centerZ - zn.hub.z));
    }
    const idx = bands.findIndex((b) => hubDist <= b.maxHubDist);
    return idx === -1 ? bands.length - 1 : idx;
  };

  // Collect every chunk to build as a job first, instead of building inline, so
  // the near ring (around the zone hubs, i.e. where a fresh character actually
  // stands) can build synchronously while the rest streams in across idle slots
  // below. bandIndexAt returns 0 only for the densest, closest-to-a-hub band,
  // which is what we treat as "near".
  const jobs: ChunkJob[] = [];

  // far-LOD cells merge 2x2 into super-chunks: the far field is where draw
  // count hurts and culling granularity matters least
  const farBand = bands.length - 1;
  const built = new Set<number>();
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      if (built.has(cz * chunksX + cx)) continue;
      const superOk = cx % 2 === 0 && cz % 2 === 0 && cx + 1 < chunksX && cz + 1 < chunksZ
        && bandIndexAt(cx, cz) === farBand && bandIndexAt(cx + 1, cz) === farBand
        && bandIndexAt(cx, cz + 1) === farBand && bandIndexAt(cx + 1, cz + 1) === farBand;
      if (superOk) {
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          built.add((cz + dz) * chunksX + (cx + dx));
        }
        // a merged super-chunk only forms from four far-band cells, so it is
        // never near
        jobs.push({
          x0: -WORLD_MAX_X + cx * CHUNK_SIZE,
          z0: WORLD_MIN_Z + cz * CHUNK_SIZE,
          size: CHUNK_SIZE * 2,
          spacing: bands[farBand].spacing,
          near: false,
        });
      } else {
        built.add(cz * chunksX + cx);
        const bandIdx = bandIndexAt(cx, cz);
        jobs.push({
          x0: -WORLD_MAX_X + cx * CHUNK_SIZE,
          z0: WORLD_MIN_Z + cz * CHUNK_SIZE,
          size: CHUNK_SIZE,
          spacing: bands[bandIdx].spacing,
          near: bandIdx === 0,
        });
      }
    }
  }

  // Every chunk in the world gets a SLOT; only the ones the residency policy
  // wants get a mesh. The slot table is the full map (cheap: a few hundred plain
  // objects), the meshes are the expensive part and come and go.
  const slots: ChunkSlot[] = jobs.map((job) => ({
    job,
    footprint: {
      centerX: job.x0 + job.size / 2,
      centerZ: job.z0 + job.size / 2,
      half: job.size / 2,
      cost: terrainChunkVertexCount(job.size, job.spacing),
    },
    mesh: null,
  }));
  const footprints = slots.map((slot) => slot.footprint);
  const resident: boolean[] = slots.map(() => false);
  const radii = GFX.terrainResidency;
  const buildBudget = terrainBuildBudget(GFX.tier);
  const plan: TerrainResidencyPlan = emptyTerrainResidencyPlan();
  let builtCount = 0;
  let releasedCount = 0;
  // Replanning state (see update()).
  let planCamX = Number.NaN;
  let planCamZ = Number.NaN;
  let settled = false;
  let frozen = false;

  const buildSlot = (index: number): void => {
    const slot = slots[index];
    if (slot.mesh) return;
    const { x0, z0, size, spacing } = slot.job;
    const geo = buildChunkGeometry(x0, z0, size, spacing, seed, !lowGfx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `terrain:${index}`;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A chunk's transform never changes while it is resident (its shape lives in
    // the geometry, not the mesh matrix), so freeze it now: otherwise every chunk
    // recomposes its world matrix every frame for the rest of the session. A
    // rebuilt chunk is a fresh mesh, so this has to run on every build, not once.
    freezeStaticMatrices(mesh);
    slot.mesh = mesh;
    resident[index] = true;
    builtCount++;
  };

  const releaseSlot = (index: number): void => {
    const slot = slots[index];
    const mesh = slot.mesh;
    if (!mesh) return;
    group.remove(mesh);
    // The one GPU resource a chunk owns is its geometry: the material (and its
    // baked normal map) is shared by every chunk of this view and outlives any
    // single eviction, so disposing it here would blank the terrain. Without this
    // dispose the vertex buffers stay live in the WebGLRenderer's memory pool and
    // residency would just trade boot cost for a leak.
    mesh.geometry.dispose();
    slot.mesh = null;
    resident[index] = false;
    releasedCount++;
  };

  // The initial resident set is the disc around the entry point, so boot only
  // pays for terrain the player can see from where they log in, not for the map.
  // Budget 0: this call is asked only for `want`, never for a build list, which
  // is also what keeps boot planning O(n) instead of ranking all n candidates.
  const origin = priorityPoint ?? { x: 0, z: 0 };
  planTerrainResidency(footprints, resident, origin.x, origin.z, radii, 0, plan);
  planCamX = origin.x;
  planCamZ = origin.z;
  const jobIndex = new Map<ChunkJob, number>();
  jobs.forEach((job, i) => jobIndex.set(job, i));

  for (let i = 0; i < slots.length; i++) {
    if (plan.want[i] && slots[i].job.near) buildSlot(i);
  }
  const farJobs = orderFarChunkJobs(
    jobs.filter((job) => !job.near && plan.want[jobIndex.get(job) as number]),
    priorityPoint,
  );
  let cancelled = false;
  const streamingDone = runIdleQueue(
    farJobs,
    (job) => {
      // The camera can move during login, so re-check against the LIVE plan:
      // otherwise the queue happily rebuilds a chunk update() just released.
      const index = jobIndex.get(job) as number;
      if (plan.want[index]) buildSlot(index);
    },
    { batchSize: STREAM_BATCH_SIZE, timeoutMs: STREAM_TIMEOUT_MS, cancelled: () => cancelled },
  );

  return {
    group,
    streamingDone,
    cancelStreaming(): void {
      cancelled = true;
    },
    residency(): TerrainResidencyStats {
      let count = 0;
      let desired = 0;
      let pending = 0;
      for (let i = 0; i < slots.length; i++) {
        const meshed = slots[i].mesh !== null;
        if (meshed) count++;
        if (plan.want[i]) {
          desired++;
          if (!meshed) pending++;
        }
      }
      return {
        resident: count,
        desired,
        total: slots.length,
        pending,
        released: releasedCount,
        built: builtCount,
        frozen,
      };
    },
    update(camX: number, camZ: number, fogFar: number): void {
      // 1. residency. Deliberately independent of fogFar: the loading screen's
      // upload pass calls update(x, z, 1e9) to force every resident chunk visible
      // once, and that must not pull the whole world back into memory.
      //
      // FREEZE on the instance plane. Dungeons, delves, the arena and rifts all
      // live past DUNGEON_X_THRESHOLD, hundreds of yards from any terrain chunk,
      // so planning there would evict the ENTIRE overworld on every instance
      // entry and make the player watch it reassemble on the way out. Evicting
      // buys nothing while inside either: interior fog (far 90 at most) already
      // culls every overworld chunk to zero draw cost. So hold the overworld set
      // exactly as the player left it and resume planning on return.
      frozen = camX > DUNGEON_X_THRESHOLD;
      // Nothing can change while the camera sits still with the plan converged,
      // and on our narrow strip the high tiers are converged nearly everywhere,
      // so this skip is what keeps residency from costing an O(n) scan a frame
      // for no reason.
      const moved = !(Math.abs(camX - planCamX) <= REPLAN_EPS && Math.abs(camZ - planCamZ) <= REPLAN_EPS);
      if (!frozen && (moved || !settled)) {
        planTerrainResidency(footprints, resident, camX, camZ, radii, buildBudget, plan);
        planCamX = camX;
        planCamZ = camZ;
        for (let i = 0; i < plan.release.length; i++) releaseSlot(plan.release[i]);
        for (let i = 0; i < plan.build.length; i++) buildSlot(plan.build[i]);
        settled = plan.pendingBuilds === plan.build.length;
      }

      // 2. visibility: fully-fogged chunks are pure overdraw; drop them before
      // the frustum. Squared compare, same result as the old hypot < fogFar.
      const fogFarSq = fogFar * fogFar;
      for (let i = 0; i < slots.length; i++) {
        const mesh = slots[i].mesh;
        if (!mesh) continue;
        const chunk = footprints[i];
        const dx = Math.max(Math.abs(camX - chunk.centerX) - chunk.half, 0);
        const dz = Math.max(Math.abs(camZ - chunk.centerZ) - chunk.half, 0);
        mesh.visible = dx * dx + dz * dz < fogFarSq;
      }
    },
  };
}
