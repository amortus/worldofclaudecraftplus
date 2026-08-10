import { describe, expect, it } from 'vitest';
import { fbm2 } from '../src/sim/rng';
import { cragLayer, highlandMask, reliefBase, warpedCoords } from '../src/sim/terrain_relief';
import type { BiomeId } from '../src/sim/types';
import { BIOME_SHAPE } from '../src/sim/world';

// ---------------------------------------------------------------------------
// The point of the exercise: a new biome must be a PLACE, not a recoloured
// vale. Palette rows are checked by biomes_tables.test.ts; this one checks the
// ground. It re-composes exactly what `baseHeight` composes (the classic hill
// layer cross-faded to the warped, gradient-damped relief field, plus the
// ridged crag layer masked to highlands) for one biome at a time, over the same
// patch of coordinates, and measures the surface each biome produces.
//
// This is the honest stand-in for a screenshot: no zone in the shipped world
// uses a new biome yet, so nothing draws one. Once a zone does, these are the
// numbers behind what it looks like.
// ---------------------------------------------------------------------------

const SEED = 1337;
const HILL_SCALE = 0.013;
const DETAIL_SCALE = 0.05;

/** `baseHeight`'s natural-relief composition, for one biome in isolation. */
function surface(biome: BiomeId, x: number, z: number): number {
  const s = BIOME_SHAPE[biome];
  const hillV = fbm2(x * HILL_SCALE + 100, z * HILL_SCALE + 100, SEED, 4);
  let h: number;
  if (s.relief > 0) {
    const warp = warpedCoords(x, z, SEED, s.relief);
    const wx = warp.x, wz = warp.z;
    const blended = hillV + (reliefBase(wx, wz, SEED, HILL_SCALE) - hillV) * s.relief;
    h = (blended - 0.5) * s.hill + s.base;
    if (s.crag > 0) h += s.crag * highlandMask(blended) * cragLayer(wx, wz, SEED);
  } else {
    h = (hillV - 0.5) * s.hill + s.base;
  }
  return h + (fbm2(x * DETAIL_SCALE, z * DETAIL_SCALE, SEED + 7, 2) - 0.5) * 2.2;
}

interface Profile {
  mean: number;
  sd: number;
  /** mean absolute gradient over a 2yd step: how rugged the ground walks. */
  rough: number;
}

function profile(biome: BiomeId): Profile {
  let sum = 0, sumSq = 0, grad = 0, n = 0;
  for (let x = -160; x < 160; x += 4) {
    for (let z = 0; z < 320; z += 4) {
      const h = surface(biome, x, z);
      sum += h;
      sumSq += h * h;
      grad += Math.abs(surface(biome, x + 2, z) - h) + Math.abs(surface(biome, x, z + 2) - h);
      n++;
    }
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(sumSq / n - mean * mean), rough: grad / (2 * n) };
}

const NEW_BIOMES: BiomeId[] = [
  'dusk', 'ember', 'frost', 'amber', 'fen', 'night', 'haunt', 'jungle', 'garden', 'gale',
];

describe('biomes: the shipped four are untouched by the relief layer', () => {
  it('carries zero relief, crag, braid and terrace', () => {
    for (const b of ['vale', 'marsh', 'peaks', 'blight'] as const) {
      const s = BIOME_SHAPE[b];
      expect(s.relief, b).toBe(0);
      expect(s.crag, b).toBe(0);
      expect(s.braid, b).toBe(0);
      expect(s.terrace, b).toBe(0);
    }
  });

  it('keeps the exact hill, base and hub numbers it shipped with', () => {
    expect(BIOME_SHAPE.vale).toMatchObject({ hill: 26, base: 0, hubHeight: 1.5 });
    expect(BIOME_SHAPE.marsh).toMatchObject({ hill: 11, base: -1.0, hubHeight: 1.2 });
    expect(BIOME_SHAPE.peaks).toMatchObject({ hill: 34, base: 7, hubHeight: 9 });
    expect(BIOME_SHAPE.blight).toMatchObject({ hill: 14, base: -1.5, hubHeight: 1.4 });
  });
});

describe('biomes: each new biome shapes its own ground', () => {
  const profiles = new Map<BiomeId, Profile>();
  for (const b of NEW_BIOMES) profiles.set(b, profile(b));
  const vale = profile('vale');

  it('every new biome asks for the relief layer', () => {
    for (const b of NEW_BIOMES) expect(BIOME_SHAPE[b].relief, b).toBe(1);
  });

  it('no new biome is a height-for-height copy of another', () => {
    const seen: string[] = [];
    for (const [b, p] of profiles) {
      const key = `${p.mean.toFixed(2)}|${p.sd.toFixed(2)}|${p.rough.toFixed(3)}`;
      expect(seen, `${b} duplicates an earlier biome`).not.toContain(key);
      seen.push(key);
    }
  });

  it('the crag biomes are measurably rougher than the calm ones', () => {
    const garden = profiles.get('garden')!; // crag 0, the calmest lawn
    const fen = profiles.get('fen')!; // crag 0, low and wet
    for (const b of ['frost', 'gale', 'ember'] as const) {
      expect(profiles.get(b)!.rough, b).toBeGreaterThan(garden.rough);
      expect(profiles.get(b)!.rough, b).toBeGreaterThan(fen.rough);
    }
    // ...and the calm ones really are calm: gentler ground than the vale
    expect(garden.rough).toBeLessThan(vale.rough);
    expect(fen.rough).toBeLessThan(vale.rough);
  });

  it('each biome sits at the elevation its base says it does', () => {
    for (const b of NEW_BIOMES) {
      const s = BIOME_SHAPE[b];
      // crag only ever adds, so the mean sits at or above the base
      expect(profiles.get(b)!.mean, b).toBeGreaterThanOrEqual(s.base - 0.5);
      expect(profiles.get(b)!.mean, b).toBeLessThan(s.base + s.crag + 4);
    }
  });

  it('the relief field is reproducible run to run', () => {
    for (const b of NEW_BIOMES) {
      const again = profile(b);
      expect(again).toEqual(profiles.get(b));
    }
  });
});
