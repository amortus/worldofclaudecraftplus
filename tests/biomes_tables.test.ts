import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { musicZoneForLocation } from '../src/game/music';
import { fbm2 } from '../src/sim/rng';
import { cragLayer, erodedFbm2, highlandMask, reliefBase, ridged2, warpedCoords } from '../src/sim/terrain_relief';
import type { BiomeId } from '../src/sim/types';
import { fenBraidHeight, terraceHeight, WATER_LEVEL } from '../src/sim/world';
import { DRESS_DENSITY, dressKindFor } from '../src/render/foliage_scatter';
import { biomePrecip } from '../src/render/weather';

// ---------------------------------------------------------------------------
// A biome is only real once EVERY exhaustive `Record<BiomeId, ...>` table
// carries a row for it. TypeScript enforces that at compile time, but the
// tables live in six render modules that a Vitest run cannot import (Three.js
// plus DOM), so this reads the sources and checks the literals directly. It
// also fails when a NEW biome is added and one table is forgotten, which is the
// exact half-filled state that produces a recoloured duplicate.
// ---------------------------------------------------------------------------

const root = new URL('../', import.meta.url);
const read = (rel: string): string => readFileSync(new URL(rel, root), 'utf8');

function biomeIds(): BiomeId[] {
  const src = read('src/sim/types.ts');
  const start = src.indexOf('export type BiomeId =');
  expect(start).toBeGreaterThan(0);
  const end = src.indexOf(';', start);
  return [...src.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as BiomeId);
}

const BIOMES = biomeIds();

/**
 * Top-level keys of the object literal that follows `= {` at `from`. Comments
 * are skipped: every one of these tables is annotated with prose that names
 * biomes ("the Amberfall blooms white"), and a naive scan reads those as rows.
 */
function literalKeys(src: string, from: number): string[] {
  const open = src.indexOf('{', src.indexOf('=', from));
  let depth = 0;
  const keys: string[] = [];
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      i = src.indexOf(ch, i + 1);
      if (i < 0) break;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    } else if (depth === 1 && /[a-z]/.test(ch)) {
      const m = /^([a-z_]+)\s*:/.exec(src.slice(i));
      if (m) {
        keys.push(m[1]);
        i += m[0].length - 1;
      }
    }
  }
  return keys;
}

/** Every `Record<BiomeId, ...> = { ... }` table in a file, name -> keys. */
function biomeTables(rel: string): Map<string, string[]> {
  const src = read(rel);
  const out = new Map<string, string[]>();
  const re = /(?:const|let|private static)\s+([A-Za-z0-9_]+)\s*:\s*Record<\s*\n?\s*BiomeId/g;
  for (const m of src.matchAll(re)) {
    out.set(`${rel}:${m[1]}`, literalKeys(src, m.index));
  }
  return out;
}

const TABLE_FILES = [
  'src/sim/world.ts',
  'src/render/terrain.ts',
  'src/render/foliage.ts',
  'src/render/foliage_scatter.ts',
  'src/render/motes.ts',
  'src/render/renderer.ts',
  'src/render/sky.ts',
  'src/game/music.ts',
];

describe('biomes: every exhaustive table carries every biome', () => {
  const tables = new Map<string, string[]>();
  for (const file of TABLE_FILES) for (const [k, v] of biomeTables(file)) tables.set(k, v);

  it('finds the tables it is supposed to police', () => {
    // 19 render/sim tables plus the music map. If this number drops, a table
    // was renamed or removed and the guard silently stopped watching it.
    expect([...tables.keys()].sort().join('\n')).toMatchInlineSnapshot(`
      "src/game/music.ts:BIOME_MUSIC
      src/render/foliage.ts:DRESS_TINT
      src/render/foliage.ts:GRASS_TINT
      src/render/foliage.ts:OAK_TINT
      src/render/foliage.ts:PINE_TINT
      src/render/foliage.ts:ROCK_TINT
      src/render/foliage.ts:TRUNK_TINT
      src/render/foliage_scatter.ts:DRESS_DENSITY
      src/render/motes.ts:MOTE_TINT
      src/render/renderer.ts:BIOME_FOG
      src/render/sky.ts:BACKDROP_Y_BIAS
      src/render/sky.ts:BIOME_BACKDROP_4K
      src/render/sky.ts:BIOME_BACKDROP_8K
      src/render/sky.ts:BIOME_HDRI_1K
      src/render/sky.ts:BIOME_HDRI_2K
      src/render/sky.ts:HDRI_SUN_U
      src/render/sky.ts:HDRI_TUNE
      src/render/terrain.ts:BIOME_PALETTE
      src/render/terrain.ts:ROCK_SLOPE_START
      src/sim/world.ts:BIOME_SHAPE"
    `);
    expect(tables.size).toBeGreaterThanOrEqual(20);
    expect(BIOMES).toContain('vale');
    expect(BIOMES).toContain('blight');
    expect(BIOMES.length).toBe(14);
  });

  it('no table is missing a biome, and none carries a stale one', () => {
    const problems: string[] = [];
    for (const [name, keys] of tables) {
      const missing = BIOMES.filter((b) => !keys.includes(b));
      const extra = keys.filter((k) => !(BIOMES as string[]).includes(k));
      if (missing.length) problems.push(`${name} missing ${missing.join(',')}`);
      if (extra.length) problems.push(`${name} unknown ${extra.join(',')}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('biomes: the non-exhaustive branch sites answer for every biome', () => {
  it('ground dressing has a density and a kind mix', () => {
    for (const b of BIOMES) {
      expect(DRESS_DENSITY[b], b).toBeGreaterThanOrEqual(0);
      // every r in [0,1) must resolve to a real dressing kind
      for (let r = 0; r < 1; r += 0.05) {
        expect(['bush', 'bushFlowers', 'fern', 'mushroom'], `${b} r=${r}`).toContain(dressKindFor(b, r));
      }
    }
  });

  it('precipitation is decided, and the shipped biomes keep their weather', () => {
    for (const b of BIOMES) expect([null, 'rain', 'snow'], b).toContain(biomePrecip(b));
    expect(biomePrecip('peaks')).toBe('snow');
    expect(biomePrecip('marsh')).toBe('rain');
    expect(biomePrecip('vale')).toBe(null);
    expect(biomePrecip('blight')).toBe(null);
    expect(biomePrecip(null)).toBe(null);
  });

  it('every biome resolves to a composed music theme', () => {
    for (const b of BIOMES) {
      const zone = musicZoneForLocation('some_zone', b, false, false);
      expect(['vale', 'marsh', 'peaks'], b).toContain(zone);
    }
    // the shipped mapping is unchanged
    expect(musicZoneForLocation('eastbrook_vale', 'vale', true, false)).toBe('town_eastbrook');
    expect(musicZoneForLocation('thornpeak_heights', 'peaks', false, false)).toBe('vale_legacy');
    expect(musicZoneForLocation('ashen_wastes', 'blight', false, false)).toBe('peaks');
  });
});

describe('biomes: the sky reuses shipped art, consistently', () => {
  const src = read('src/render/sky.ts');
  const table = (name: string): Record<string, string> => {
    const at = src.indexOf(`const ${name}`);
    expect(at, name).toBeGreaterThan(0);
    const open = src.indexOf('{', src.indexOf('=', at));
    const close = src.indexOf('};', open);
    const out: Record<string, string> = {};
    for (const m of src.slice(open, close).matchAll(/([a-z_]+):\s*'([^']+)'/g)) out[m[1]] = m[2];
    return out;
  };

  it('adds no new HDRI or backdrop file', () => {
    const shippedHdri = new Set(['vale_day', 'marsh_overcast', 'peaks_dawn']);
    for (const res of ['2K', '1K'] as const) {
      const t = table(`BIOME_HDRI_${res}`);
      for (const b of BIOMES) {
        const url = t[b];
        expect(url, `${b} ${res}`).toBeTruthy();
        const stem = url.replace('/env/', '').replace(/_[0-9]k\.hdr$/, '');
        expect(shippedHdri, `${b} ${res} -> ${url}`).toContain(stem);
      }
    }
    const shippedBackdrop = new Set(['vale', 'marsh', 'peaks']);
    for (const res of ['8K', '4K'] as const) {
      const t = table(`BIOME_BACKDROP_${res}`);
      for (const b of BIOMES) {
        const url = t[b];
        expect(url, `${b} ${res}`).toBeTruthy();
        const stem = url.replace('/env/', '').replace(/_backdrop(_4k)?\.webp$/, '');
        expect(shippedBackdrop, `${b} ${res} -> ${url}`).toContain(stem);
      }
    }
  });

  it('the 2K and 1K sets pick the same sky for every biome', () => {
    const a = table('BIOME_HDRI_2K');
    const b = table('BIOME_HDRI_1K');
    for (const biome of BIOMES) {
      expect(a[biome].replace('_2k', ''), biome).toBe(b[biome].replace('_1k', ''));
    }
  });

  it("each biome's sun u is the sun u of the HDRI it reuses", () => {
    const hdri = table('BIOME_HDRI_2K');
    const sunAt = src.indexOf('const HDRI_SUN_U');
    const open = src.indexOf('{', src.indexOf('=', sunAt));
    const close = src.indexOf('};', open);
    const sun: Record<string, number> = {};
    for (const m of src.slice(open, close).matchAll(/([a-z_]+):\s*([0-9.]+)/g)) sun[m[1]] = Number(m[2]);
    // measured per file (see the table's own comment)
    const BY_FILE: Record<string, number> = {
      vale_day: 0.595,
      marsh_overcast: 0.657,
      peaks_dawn: 0.631,
    };
    for (const b of BIOMES) {
      const stem = hdri[b].replace('/env/', '').replace(/_2k\.hdr$/, '');
      expect(sun[b], `${b} reuses ${stem}`).toBe(BY_FILE[stem]);
    }
  });
});

describe('biomes: the ported relief math', () => {
  const SEED = 1337;

  it('is a pure function of (x, z, seed)', () => {
    for (let i = 0; i < 50; i++) {
      const x = i * 13.7 - 200, z = i * -21.3 + 400;
      const a = reliefBase(x, z, SEED, 0.013);
      const b = reliefBase(x, z, SEED, 0.013);
      expect(b).toBe(a);
      expect(cragLayer(x, z, SEED)).toBe(cragLayer(x, z, SEED));
    }
  });

  it('stays in [0,1] and reproduces the plain-fbm mean and spread', () => {
    let sum = 0, sumSq = 0, n = 0;
    let plainSum = 0;
    for (let x = -500; x < 500; x += 7) {
      for (let z = -100; z < 900; z += 11) {
        const v = reliefBase(x, z, SEED, 0.013);
        expect(ridged2(x * 0.014, z * 0.014, SEED, 3)).toBeGreaterThanOrEqual(0);
        sum += v; sumSq += v * v; n++;
        plainSum += fbm2(x * 0.013 + 100, z * 0.013 + 100, SEED, 4);
      }
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    // the affine correction targets the plain layer's mean (~0.5) and spread
    expect(Math.abs(mean - plainSum / n)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.08);
    expect(sd).toBeLessThan(0.22);
  });

  it('actually looks different from the plain hill layer', () => {
    // If the relief layer were a no-op the biomes would be recoloured vales.
    let differing = 0, total = 0;
    for (let x = -300; x < 300; x += 9) {
      for (let z = 0; z < 600; z += 9) {
        const plain = fbm2(x * 0.013 + 100, z * 0.013 + 100, SEED, 4);
        const w = warpedCoords(x, z, SEED, 1);
        const relief = reliefBase(w.x, w.z, SEED, 0.013);
        if (Math.abs(plain - relief) > 0.05) differing++;
        total++;
      }
    }
    expect(differing / total).toBeGreaterThan(0.5);
  });

  it('the warp is off at ampScale 0 and the highland mask is a smooth gate', () => {
    const w = warpedCoords(12.5, -33.25, SEED, 0);
    expect(w.x).toBe(12.5);
    expect(w.z).toBe(-33.25);
    expect(highlandMask(0.4)).toBe(0);
    expect(highlandMask(0.9)).toBe(1);
    expect(highlandMask(0.66)).toBeGreaterThan(0);
    expect(highlandMask(0.66)).toBeLessThan(1);
    expect(erodedFbm2(3, 4, SEED, 4, 0)).toBeGreaterThan(0);
  });
});

describe('biomes: the two height appliers', () => {
  const SEED = 1337;

  it('braids only ever cut down, and only inside their height band', () => {
    for (let x = -140; x < 140; x += 3) {
      for (let z = 200; z < 500; z += 7) {
        const h = 1.2;
        expect(fenBraidHeight(x, z, h, SEED, 1)).toBeLessThanOrEqual(h);
      }
    }
    // above the band and below the waterline it is an exact no-op
    expect(fenBraidHeight(10, 300, 9.5, SEED, 1)).toBe(9.5);
    expect(fenBraidHeight(10, 300, WATER_LEVEL, SEED, 1)).toBe(WATER_LEVEL);
    // weight 0 is an exact no-op everywhere
    for (let x = -140; x < 140; x += 11) expect(fenBraidHeight(x, 300, 1.2, SEED, 0)).toBe(1.2);
  });

  it('terraces move ground by less than one step, and never below the shore', () => {
    const STEP = 6.5;
    for (let x = -140; x < 140; x += 3) {
      for (let z = 600; z < 900; z += 7) {
        const h = 20 + ((x + z) % 17) * 0.5;
        const out = terraceHeight(x, z, h, SEED, 1);
        expect(Math.abs(out - h), `${x},${z}`).toBeLessThan(STEP);
      }
    }
    expect(terraceHeight(10, 700, WATER_LEVEL + 1, SEED, 1)).toBe(WATER_LEVEL + 1);
    for (let x = -140; x < 140; x += 11) expect(terraceHeight(x, 700, 25, SEED, 0)).toBe(25);
  });

  it('both are deterministic', () => {
    expect(fenBraidHeight(7, 311, 1.4, SEED, 1)).toBe(fenBraidHeight(7, 311, 1.4, SEED, 1));
    expect(terraceHeight(7, 711, 24, SEED, 1)).toBe(terraceHeight(7, 711, 24, SEED, 1));
  });
});
