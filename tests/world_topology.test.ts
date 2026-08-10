import { describe, expect, it } from 'vitest';
import {
  COLUMN_ZONES,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  WORLD_SIZE,
  ZONES,
  zoneAt,
  zoneContaining,
} from '../src/sim/data';
import { zoneBiomeAt } from '../src/sim/world';
import type { BiomeId, ZoneDef } from '../src/sim/types';

// ---------------------------------------------------------------------------
// The world's zone topology, from the 1D strip through the 2D grid.
//
// PHASE 1 grew `zoneAt`/`zoneBiomeAt` an x argument and `ZoneDef` optional x
// bounds while the world stayed byte-identical. PHASE 2 added the first column
// ring: `alderfen_shallows` east and `grimhold_crags` west, both sharing the
// Eastbrook Vale's z band (-180..180).
//
// The ORIGINAL 1D implementations are still the oracle, but their domain is now
// exactly the strip: inside x [-180, 180) the grid must answer precisely what
// the strip-era lookup answered, at every z, forever. That is the promise made
// to every player standing on ground that already exists. Outside the strip is
// where the new world lives, and it is asserted separately below.
//
//   export function zoneAt(z: number): ZoneDef {
//     for (const zone of ZONES) {
//       if (z < zone.zMax) return zone;
//     }
//     return ZONES[ZONES.length - 1];
//   }
//
//   export function zoneBiomeAt(z: number): BiomeId {
//     for (const zone of ZONES) {
//       if (z < zone.zMax) return zone.biome;
//     }
//     return ZONES[ZONES.length - 1].biome;
//   }
// ---------------------------------------------------------------------------

function zoneAtOld(z: number): ZoneDef {
  for (const zone of STRIP_ZONES) {
    if (z < zone.zMax) return zone;
  }
  return STRIP_ZONES[STRIP_ZONES.length - 1];
}

function zoneBiomeAtOld(z: number): BiomeId {
  return zoneAtOld(z).biome;
}

// The x values the strip-era world could produce, plus the exact edges where an
// off-by-one would hide. Instance-plane x values (600, 6000, 12000) are here
// because callers thread a raw position through `zoneAt`; they are outside every
// rect, so the southmost-band fallback must still answer the strip's zone.
const STRIP_X_SAMPLES = (() => {
  const out: number[] = [];
  for (let x = STRIP_MIN_X; x < STRIP_MAX_X; x += 7.5) out.push(x);
  out.push(STRIP_MIN_X, STRIP_MAX_X - 0.001, 0);
  return out;
})();

describe('world topology: the strip answers exactly as it always did', () => {
  it('ships the four strip zones plus the mirrored column rings', () => {
    // 4 strip bands + the first column ring (alderfen/grimhold, ours) + the
    // four zones ported from upstream (willowfen/galecrest/palmreach/evergarden).
    expect(ZONES).toHaveLength(10);
    expect(STRIP_ZONES).toHaveLength(4);
    expect(COLUMN_ZONES).toHaveLength(6);
    for (const zone of STRIP_ZONES) {
      expect(zone.xMin, `${zone.id}.xMin`).toBeUndefined();
      expect(zone.xMax, `${zone.id}.xMax`).toBeUndefined();
    }
    for (const zone of COLUMN_ZONES) {
      expect(zone.xMin, `${zone.id}.xMin`).toBeTypeOf('number');
      expect(zone.xMax, `${zone.id}.xMax`).toBeTypeOf('number');
    }
  });

  it('leaves every strip zone free of the grid fields, so no band moved', () => {
    for (const zone of STRIP_ZONES) {
      expect(zone.eastPassZ, `${zone.id}.eastPassZ`).toBeUndefined();
      expect(zone.westPassZ, `${zone.id}.westPassZ`).toBeUndefined();
      expect(zone.southPassX, `${zone.id}.southPassX`).toBeUndefined();
      expect(zone.sealedSouthBorder, `${zone.id}.sealedSouthBorder`).toBeUndefined();
      expect(zone.trashRespawnSeconds, `${zone.id}.trashRespawnSeconds`).toBeUndefined();
    }
  });

  it('opens each column on exactly one shared edge with the strip, and seals nothing', () => {
    // A column touches the strip on ONE vertical edge (the side facing x = 0),
    // so it declares exactly one of eastPassZ/westPassZ and that pass must fall
    // inside its own z band. A column stacked on another column may also
    // declare a southPassX; that one has to fall inside its own x range.
    for (const zone of COLUMN_ZONES) {
      const passes = [zone.eastPassZ, zone.westPassZ].filter((v) => v !== undefined);
      expect(passes, `${zone.id} border passes`).toHaveLength(1);
      expect(passes[0], `${zone.id} pass z`).toBeGreaterThanOrEqual(zone.zMin);
      expect(passes[0], `${zone.id} pass z`).toBeLessThanOrEqual(zone.zMax);
      // the pass sits on the side that faces the strip, never the outer rim
      const facing = (zone.xMin ?? 0) >= STRIP_MAX_X ? zone.westPassZ : zone.eastPassZ;
      expect(facing, `${zone.id} pass is on the strip-facing edge`).toBeTypeOf('number');
      expect(zone.sealedSouthBorder).toBeUndefined();
      if (zone.southPassX !== undefined) {
        expect(zone.southPassX, `${zone.id} southPassX`).toBeGreaterThanOrEqual(zone.xMin!);
        expect(zone.southPassX, `${zone.id} southPassX`).toBeLessThanOrEqual(zone.xMax!);
      }
    }
  });

  it('keeps the strip column exactly where it was, and widens the grid around it', () => {
    expect(WORLD_SIZE).toBe(360);
    expect(STRIP_MIN_X).toBe(-180);
    expect(STRIP_MAX_X).toBe(180);
    // The bounding box grew by one column on each side. Symmetric, because
    // WORLD_MAX_X is read as a half width in nine call sites outside data.ts
    // (see tests/world_phase2_bands.test.ts).
    expect(WORLD_MIN_X).toBe(-540);
    expect(WORLD_MAX_X).toBe(540);
    expect(WORLD_MIN_X).toBe(-WORLD_MAX_X);
    // z is untouched: the columns share an existing band rather than adding one.
    expect(WORLD_MIN_Z).toBe(-180);
    expect(WORLD_MAX_Z).toBe(1260);
  });

  it('tiles the z axis contiguously along the strip, which is what makes the fallback exact', () => {
    for (let i = 1; i < STRIP_ZONES.length; i++) {
      expect(STRIP_ZONES[i].zMin, `${STRIP_ZONES[i].id}.zMin`).toBe(STRIP_ZONES[i - 1].zMax);
    }
    // A column no longer has to share a strip band (the Willowfen runs
    // z 180..700, straight across the Mirefen/Thornpeak boundary at 540), so
    // the rule that matters is weaker and structural: every column starts at a
    // z another zone in ITS OWN grid column ends at, or at the world's south
    // edge, so each column tiles z contiguously too and leaves no seam.
    for (const col of COLUMN_ZONES) {
      const sameColumn = COLUMN_ZONES.filter((c) => c.xMin === col.xMin && c.xMax === col.xMax);
      expect(
        col.zMin === WORLD_MIN_Z || sameColumn.some((c) => c.zMax === col.zMin),
        `${col.id} south neighbour`,
      ).toBe(true);
    }
  });

  it('zoneAt(x, z).id === zoneAtOld(z).id over a dense grid of the whole STRIP', () => {
    let samples = 0;
    for (const x of STRIP_X_SAMPLES) {
      for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 0.5) {
        const got = zoneAt(x, z);
        const want = zoneAtOld(z);
        if (got !== want) {
          throw new Error(
            `zoneAt(${x}, ${z}) returned ${got.id}, the 1D lookup returned ${want.id}`,
          );
        }
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(100_000);
  });

  it('zoneBiomeAt(x, z) === zoneBiomeAtOld(z) over the same grid', () => {
    for (const x of STRIP_X_SAMPLES) {
      for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 0.5) {
        const got = zoneBiomeAt(x, z);
        const want = zoneBiomeAtOld(z);
        if (got !== want) {
          throw new Error(
            `zoneBiomeAt(${x}, ${z}) returned ${got}, the 1D lookup returned ${want}`,
          );
        }
      }
    }
  });

  it('agrees at every band boundary, where an off-by-one would hide', () => {
    const edges: number[] = [];
    for (const zone of STRIP_ZONES) edges.push(zone.zMin, zone.zMax);
    const deltas = [-1, -0.5, -1e-9, 0, 1e-9, 0.5, 1];
    for (const x of [-180, -179.999, -90, 0, 90, 179.999]) {
      for (const edge of edges) {
        for (const d of deltas) {
          const z = edge + d;
          expect(zoneAt(x, z).id, `zoneAt(${x}, ${z})`).toBe(zoneAtOld(z).id);
          expect(zoneBiomeAt(x, z), `zoneBiomeAt(${x}, ${z})`).toBe(zoneBiomeAtOld(z));
        }
      }
    }
  });

  it('answers the strip zone for every position past the world, instance plane included', () => {
    // Nothing in the far-east instance plane is inside a rect, so the fallback
    // must still resolve the band's strip zone rather than a column.
    for (const x of [600, 900, 6000, 12_000, -600, -900]) {
      for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 3) {
        expect(zoneAt(x, z), `zoneAt(${x}, ${z})`).toBe(zoneAtOld(z));
        expect(zoneContaining(x, z), `zoneContaining(${x}, ${z})`).toBeNull();
      }
    }
  });

  it('zoneBiomeAt delegates to zoneAt, so the two can never disagree', () => {
    for (const x of [-600, -400, -180, 0, 180, 400, 600]) {
      for (let z = WORLD_MIN_Z - 50; z <= WORLD_MAX_Z + 50; z += 3) {
        expect(zoneBiomeAt(x, z)).toBe(zoneAt(x, z).biome);
      }
    }
  });
});

describe('world topology: the grid outside the strip', () => {
  it('resolves the column by rect wherever a column exists', () => {
    for (const col of COLUMN_ZONES) {
      const x0 = col.xMin!;
      const x1 = col.xMax!;
      for (let x = x0; x < x1; x += 7.5) {
        for (let z = col.zMin; z < col.zMax; z += 7.5) {
          expect(zoneAt(x, z), `zoneAt(${x}, ${z})`).toBe(col);
          expect(zoneContaining(x, z), `zoneContaining(${x}, ${z})`).toBe(col);
        }
      }
    }
  });

  it('now tiles the whole bounding box: the realm ring filled the last hole', () => {
    let holes = 0;
    for (let x = WORLD_MIN_X; x < WORLD_MAX_X; x += 7.5) {
      for (let z = WORLD_MIN_Z; z < WORLD_MAX_Z; z += 7.5) {
        const strict = zoneContaining(x, z);
        if (strict === null) {
          holes++;
          expect(Math.abs(x)).toBeGreaterThanOrEqual(STRIP_MAX_X);
          // A hole is always in a row no column occupies, and zoneAt still
          // clamps it to the band's strip zone so no caller can crash.
          expect(zoneAt(x, z)).toBe(zoneAtOld(z));
        } else {
          expect(strict).toBe(zoneAt(x, z));
        }
      }
    }
    // Grimhold/Willowfen/Palmreach fill the west column and Alderfen/Galecrest/
    // Evergarden the east one, so every one of the box's cells is now real
    // ground. The hole handling above is kept, not deleted: `zoneContaining`
    // still has to answer honestly the moment the grid grows unevenly again.
    expect(holes).toBe(0);
  });
});
