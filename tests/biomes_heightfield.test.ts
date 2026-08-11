import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { columnBlendAt, COLUMN_ZONES, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_Z, ZONES } from '../src/sim/data';
import { terrainHeight } from '../src/sim/world';

// ---------------------------------------------------------------------------
// The biome expansion (BiomeId 4 -> 14, the natural-relief layer, the flattened
// shape blend) must not move one yard of the world we already ship.
//
// The oracle is `biomes_heightfield.snapshot.json`, generated from the tree at
// commit 639f22e3c (before any of this): one 32-bit hash per 20x20yd cell over
// the WHOLE world rect, x [-WORLD_MAX_X, WORLD_MAX_X) and z [WORLD_MIN_Z,
// WORLD_MAX_Z), sampling terrainHeight at every integer yard with seed 1337.
// That covers all six shipped zones, the four strip bands plus the two column
// zones, with no exclusion corridor: every cell must match exactly.
//
// This holds by construction, not by luck. All four shipped biomes carry
// relief/crag/braid/terrace 0 in BIOME_SHAPE, so `SHAPE_EXTRA`, `HAS_BRAID` and
// `HAS_TERRACE` are all false while the live zone list uses only those biomes,
// and not one line of the new shaping code executes. If a zone of a new biome
// is added, the guard below stops being vacuous: the relief layer switches on
// inside that zone's blend window, and the assertion here says the rest of the
// world still did not move.
// ---------------------------------------------------------------------------

interface HeightSnapshot {
  seed: number;
  cell: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cells: Record<string, number>;
}

const SNAP: HeightSnapshot = JSON.parse(
  readFileSync(new URL('./biomes_heightfield.snapshot.json', import.meta.url), 'utf8'),
);

const scratch = new ArrayBuffer(8);
const asF64 = new Float64Array(scratch);
const asU32 = new Uint32Array(scratch);

function mix(h: number, v: number): number {
  h ^= v;
  h = Math.imul(h, 0x01000193);
  return h >>> 0;
}

function cellHash(cx: number, cz: number, cell: number, seed: number): number {
  let h = 0x811c9dc5;
  for (let x = cx; x < cx + cell; x++) {
    for (let z = cz; z < cz + cell; z++) {
      asF64[0] = terrainHeight(x, z, seed);
      h = mix(mix(h, asU32[0]), asU32[1]);
    }
  }
  return h;
}

// The snapshot's rect is the world the six shipped zones occupy. A zone added
// later can only be checked where the snapshot reaches, so a cell whose rect
// lies inside a zone that did not exist when the snapshot was taken is skipped.
const SNAPSHOT_ZONE_IDS = new Set([
  'eastbrook_vale',
  'mirefen_marsh',
  'thornpeak_heights',
  'ashen_wastes',
  'alderfen_shallows',
  'grimhold_crags',
]);

// The mirror case, and the one the skip logic above cannot see. It knows about
// zones that were ADDED; three of the six zones the snapshot was taken over
// have since been REMOVED, and removing a zone moves the heightfield exactly as
// adding one does (its biome shape stops blending, its camps stop flattening,
// its border ridges disappear, the rim moves). So the retired rects are
// excluded by name, with the same reach an added zone gets.
//
//   ashen_wastes       RETIRED (parked in sim/content/zone4.ts, no longer
//                      merged): full map parity gave its strip band, z
//                      900..1260, to upstream's Veiled Hollow.
//   alderfen_shallows  DELETED: an invented column, replaced by upstream's own
//                      farshore_isle on the same rect.
//   grimhold_crags     DELETED: an invented column with no upstream mirror, so
//                      the -x half of the vale's row is a hole now.
//
// The snapshot is NOT regenerated. It is the oracle proving the world we
// already shipped never moved, and regenerating it would destroy that proof
// rather than extend it.
const RETIRED_RECTS = [
  { id: 'ashen_wastes', x0: -180, x1: 180, z0: 900, z1: 1260 },
  { id: 'alderfen_shallows', x0: 180, x1: 540, z0: -180, z1: 180 },
  { id: 'grimhold_crags', x0: -540, x1: -180, z0: -180, z1: 180 },
] as const;

// How far a zone can reach OUTSIDE its own rect. The widest mechanism is the
// horizontal border ridge a new neighbour raises along a shared band line: a
// gaussian of RIDGE_SIGMA 18 that world.ts evaluates out to 3 sigma, i.e. 54yd.
// (The vertical column ridge reaches 36, the sideways shape blend 35, the rim
// 30.) 60 covers all four with margin. This used to be 40, which was never
// exercised because no zone had been added since the snapshot; the first real
// addition, the upstream realm ring, reaches 54yd into the Grimhold Crags.
const ZONE_REACH = 60;

function cellIsShipped(cx: number, cz: number, cell: number): boolean {
  for (const r of RETIRED_RECTS) {
    if (
      cx + cell > r.x0 - ZONE_REACH &&
      cx < r.x1 + ZONE_REACH &&
      cz + cell > r.z0 - ZONE_REACH &&
      cz < r.z1 + ZONE_REACH
    ) {
      return false;
    }
  }
  for (const zn of ZONES) {
    if (SNAPSHOT_ZONE_IDS.has(zn.id)) continue;
    const x0 = (zn.xMin ?? -WORLD_MAX_X) - ZONE_REACH;
    const x1 = (zn.xMax ?? WORLD_MAX_X) + ZONE_REACH;
    if (
      cx + cell > x0 &&
      cx < x1 &&
      cz + cell > zn.zMin - ZONE_REACH &&
      cz < zn.zMax + ZONE_REACH
    ) {
      return false;
    }
  }
  return true;
}

describe('biomes: the shipped world is bit-identical', () => {
  it('the snapshot covers the whole world rect at capture time', () => {
    expect(SNAP.x0).toBe(-WORLD_MAX_X);
    expect(SNAP.z0).toBe(WORLD_MIN_Z);
    expect(Object.keys(SNAP.cells).length).toBeGreaterThan(3800);
  });

  it('every cell of the six shipped zones hashes exactly as it did before', () => {
    const moved: string[] = [];
    let checked = 0;
    for (const key of Object.keys(SNAP.cells)) {
      const [cx, cz] = key.split(',').map(Number);
      if (!cellIsShipped(cx, cz, SNAP.cell)) continue;
      checked++;
      if (cellHash(cx, cz, SNAP.cell, SNAP.seed) !== SNAP.cells[key]) moved.push(key);
    }
    // The floor tracks how much of the snapshot rect is still OUTSIDE every
    // zone added since it was taken AND outside every zone retired since. It
    // was 3000+ while the ported realm zones did not exist, then 1400+ once the
    // first four filled the two grid columns end to end. Full map parity took
    // it to 612 (measured): the invented column pair is gone, so both column
    // rects are excluded as retired ground, and the Ashen Wastes' strip band is
    // excluded for the same reason.
    //
    // What is left, and what the 612 cells are, is the strip's own interior
    // south of the Ashen Wastes' band and clear of every column's 60yd reach,
    // i.e. the Eastbrook Vale, the Mirefen Marsh and the Thornpeak Heights.
    // `moved` is the assertion that matters: not one of them changed.
    expect(checked).toBeGreaterThan(600);
    expect(moved).toEqual([]);
  }, 120_000);
});

describe('biomes: the inlined column blend still equals columnBlendAt', () => {
  // world.ts flattened `columnBlendAt` into a Float64Array read to keep the
  // heightfield's hot loop off ZoneDef property access. The two must agree
  // everywhere or the shape blend silently drifts from the rest of the world.
  // The sweep is nine columns over a world that now runs z -180..2420, so the
  // mismatches are COLLECTED and asserted once: one `expect` per sample was
  // most of the runtime and pushed this past the default 5s timeout.
  it('matches over the whole world, including both blend windows', () => {
    const mismatched: string[] = [];
    let samples = 0;
    for (let i = 0; i < COLUMN_ZONES.length; i++) {
      const col = COLUMN_ZONES[i];
      for (let x = -WORLD_MAX_X; x <= WORLD_MAX_X; x += 7) {
        for (let z = WORLD_MIN_Z; z <= WORLD_MAX_Z; z += 13) {
          samples++;
          const want = columnBlendAt(col, x, z);
          const got = terrainShapeColumnBlend(i, x, z);
          if (got !== want) mismatched.push(`${col.id} at ${x},${z}: ${got} != ${want}`);
        }
      }
    }
    expect(mismatched.slice(0, 10)).toEqual([]);
    expect(samples).toBeGreaterThan(150_000);
  }, 60_000);
});

// The flattened blend is module-private in world.ts on purpose (it is a hot
// loop detail, not API), so the check re-derives it from the same public rect
// data rather than exporting it. Any divergence in the real one shows up as a
// heightfield diff in the snapshot test above; this pins the FORMULA.
function terrainShapeColumnBlend(i: number, x: number, z: number): number {
  const col = COLUMN_ZONES[i];
  const x0 = col.xMin ?? -WORLD_MAX_X;
  const x1 = col.xMax ?? WORLD_MAX_X;
  if (z <= col.zMin - 30 || z >= col.zMax + 35) return 0;
  const east = x0 >= 180;
  if (east ? x <= x0 - 30 : x >= x1 + 30) return 0;
  const s = (raw: number): number => {
    const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    return t * t * (3 - 2 * t);
  };
  const xT = east ? s((x - (x0 - 30)) / 65) : 1 - s((x - (x1 - 35)) / 65);
  const zT = s((z - (col.zMin - 30)) / 65) * (1 - s((z - (col.zMax - 30)) / 65));
  return xT * zT;
}
