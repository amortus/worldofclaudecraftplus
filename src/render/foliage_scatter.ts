// Pure placement math for the vegetation scatter: the deterministic hash, the
// slope gate, and the whole ground-dressing sweep (bushes / ferns / mushrooms).
//
// No THREE and no DOM here, so a Vitest drives the sweep directly and counts
// what it does; `foliage.ts` is the thin consumer that turns the returned spots
// into InstancedMeshes.
//
// The sweep walks the world's bounding box, which is a 3 column grid WITH HOLES
// since the world widened (see world_bounds.ts). It therefore gates exactly the
// way `generateDecorations` (sim/world.ts) does, on `zoneContaining`, and skips
// the holes a row at a time so a hole costs a comparison rather than a hash, a
// biome lookup, three terrain samples and a camp scan.
import { WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z, CAMPS, ZONES, zoneContaining } from '../sim/data';
import type { BiomeId } from '../sim/types';
import { roadDistance, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../sim/world';
import { insideWorldRim, zoneRowSpanX } from './world_bounds';

// deterministic 0..1 hash on integer grid cells / world coords
export function hashAt(a: number, b: number, k: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + k * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Slope gate shared by the dressing sweep and the grass ring: nothing small
// gets pasted onto a cliff face.
export const VEG_MAX_SLOPE = 0.62;
export const VEG_SLOPE_EPS = 1.2;

export function tooSteep(x: number, z: number, seed: number): boolean {
  const hx = terrainHeight(x + VEG_SLOPE_EPS, z, seed) - terrainHeight(x - VEG_SLOPE_EPS, z, seed);
  const hz = terrainHeight(x, z + VEG_SLOPE_EPS, seed) - terrainHeight(x, z - VEG_SLOPE_EPS, seed);
  return Math.hypot(hx, hz) / (2 * VEG_SLOPE_EPS) > VEG_MAX_SLOPE;
}

export type DressKind = 'bush' | 'bushFlowers' | 'fern' | 'mushroom';

export interface DressingSpot {
  x: number;
  z: number;
  kind: DressKind;
  scale: number;
}

// Ground dressing: small props (bushes/ferns/mushrooms) scattered on a hash
// grid, walk-through by design (no colliders, like grass).
export const DRESS_STEP_HIGH = 12;
export const DRESS_STEP_LOW = 10;
// per-biome spawn chance per grid cell (blight is bare ash: none)
export const DRESS_DENSITY: Record<BiomeId, number> = { vale: 0.26, marsh: 0.26, peaks: 0.15, blight: 0 };
export const DRESS_DENSITY_LOW_SCALE = 1.24;
export const DRESS_LOW_SCALE_BOOST = 1.08;
// yards of clearance kept between the dressing field and the rim wall
export const DRESS_RIM_INSET = 16;

export const DRESS_SCALE: Record<DressKind, [number, number]> = {
  bush: [0.9, 0.7], bushFlowers: [0.9, 0.7], fern: [0.85, 0.6], mushroom: [0.9, 0.8],
};

export function dressKindFor(biome: BiomeId, r: number): DressKind {
  if (biome === 'vale') {
    if (r < 0.36) return 'bush';
    if (r < 0.46) return 'bushFlowers';
    if (r < 0.8) return 'fern';
    return 'mushroom';
  }
  if (biome === 'marsh') {
    if (r < 0.3) return 'bush';
    if (r < 0.62) return 'fern';
    return 'mushroom';
  }
  if (biome === 'blight') return r < 0.55 ? 'mushroom' : 'fern';
  return r < 0.62 ? 'bush' : 'fern';
}

export interface DressingSweepOptions {
  /** grid pitch in yards (GFX tier picks it) */
  step: number;
  /** multiplies every biome density (the low tier compensates for its wider step) */
  densityScale: number;
  /** multiplies every placed scale */
  scaleBoost: number;
}

/** What the sweep did, so a test (or a perf run) can measure it. */
export interface DressingSweepStats {
  /** grid cells inside the sweep's bounding box */
  cells: number;
  /** cells actually evaluated, i.e. cells some zone in that row could reach */
  evaluated: number;
  /** cells skipped whole, because no zone rect comes near that row and x */
  skippedVoid: number;
  /** candidates dropped because no zone rect contains them (the grid's holes) */
  outsideZone: number;
  /** candidates dropped for sitting inside the rim wall's clearance */
  outsideRim: number;
}

export interface DressingSweep {
  spots: DressingSpot[];
  stats: DressingSweepStats;
}

/**
 * The deterministic ground-dressing field for a seed. Pure: same seed and
 * options give the same spots, in the same order, in any host.
 */
export function sweepDressing(seed: number, opts: DressingSweepOptions): DressingSweep {
  const { step, densityScale, scaleBoost } = opts;
  const spots: DressingSpot[] = [];
  const stats: DressingSweepStats = {
    cells: 0, evaluated: 0, skippedVoid: 0, outsideZone: 0, outsideRim: 0,
  };
  const xHalf = WORLD_MAX_X - DRESS_RIM_INSET;
  for (let gx = -xHalf; gx < xHalf; gx += step) {
    for (let gz = WORLD_MIN_Z + DRESS_RIM_INSET; gz < WORLD_MAX_Z - DRESS_RIM_INSET; gz += step) {
      stats.cells++;
      // The cell is jittered by up to half a step below, so the row span is
      // widened by a whole step: it can never drop a cell whose jittered
      // position would have landed inside a zone.
      const row = zoneRowSpanX(gz, step);
      if (!row || gx < row.minX || gx > row.maxX) {
        stats.skippedVoid++;
        continue;
      }
      stats.evaluated++;
      const r = hashAt(gx, gz, 41);
      const biome = zoneBiomeAt(gx, gz);
      const density = DRESS_DENSITY[biome] * densityScale;
      if (r > density) continue;
      const x = gx + (hashAt(gx, gz, 42) - 0.5) * step;
      const z = gz + (hashAt(gx, gz, 43) - 0.5) * step;
      // The grid has holes: most rows have no column zone beside the strip, so
      // the bounding box this sweep walks is largely void behind the rim. Strict
      // rect containment keeps dressing out of it, exactly as generateDecorations
      // keeps trees and rocks out of it.
      if (!zoneContaining(x, z)) {
        stats.outsideZone++;
        continue;
      }
      if (!insideWorldRim(x, z, DRESS_RIM_INSET)) {
        stats.outsideRim++;
        continue;
      }
      let blocked = false;
      for (const zone of ZONES) {
        if (Math.hypot(x - zone.hub.x, z - zone.hub.z) < zone.hub.radius + 4) { blocked = true; break; }
      }
      if (blocked) continue;
      for (const camp of CAMPS) {
        if (Math.hypot(x - camp.center.x, z - camp.center.z) < camp.radius + 2) { blocked = true; break; }
      }
      if (blocked) continue;
      if (roadDistance(x, z) < 4) continue;
      if (terrainHeight(x, z, seed) < WATER_LEVEL + 1.2) continue;
      if (tooSteep(x, z, seed)) continue;
      const kind = dressKindFor(biome, hashAt(gx, gz, 44));
      const [sMin, sRange] = DRESS_SCALE[kind];
      spots.push({ x, z, kind, scale: (sMin + hashAt(gx, gz, 45) * sRange) * scaleBoost });
    }
  }
  return { spots, stats };
}
