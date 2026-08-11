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
import { computeBorderEdges, zoneBiomeAt } from '../src/sim/world';
import type { BiomeId, ZoneDef } from '../src/sim/types';

// ---------------------------------------------------------------------------
// The world's zone topology, from the 1D strip through the 2D grid.
//
// PHASE 1 grew `zoneAt`/`zoneBiomeAt` an x argument and `ZoneDef` optional x
// bounds while the world stayed byte-identical. PHASE 2 added the first column
// ring, an invented pair (`alderfen_shallows` east, `grimhold_crags` west) in
// the Eastbrook Vale's band. FULL MAP PARITY deleted that pair and ported
// upstream's own fourteen zones instead, so the grid is now five strip bands
// (three original plus the Veiled Hollow and the Frostveil Reach, which took
// the band the retired Ashen Wastes used to hold) and nine column zones.
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
  it('ships the five strip bands plus the nine column zones of the 14-zone grid', () => {
    // 3 original strip bands + the 11 zones ported from upstream, two of which
    // (the Veiled Hollow and the Frostveil Reach) are STRIP bands rather than
    // columns. The invented alderfen/grimhold pair is gone, and the Ashen
    // Wastes is parked, not merged (see the PARKED banner in sim/data.ts).
    expect(ZONES).toHaveLength(14);
    expect(STRIP_ZONES).toHaveLength(5);
    expect(COLUMN_ZONES).toHaveLength(9);
    // The two filters partition ZONES: no zone is both, none is neither.
    expect(STRIP_ZONES.length + COLUMN_ZONES.length).toBe(ZONES.length);
    for (const zone of ZONES) {
      expect(
        STRIP_ZONES.includes(zone) !== COLUMN_ZONES.includes(zone),
        `${zone.id} is in exactly one of STRIP_ZONES / COLUMN_ZONES`,
      ).toBe(true);
    }
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
    // The three ORIGINAL bands still declare nothing at all: that is the
    // "no band moved" promise, and it is asserted on them by name.
    const ORIGINAL_BANDS = ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights'];
    for (const zone of STRIP_ZONES) {
      // A strip band spans the whole row, so it can never carry a column pass.
      expect(zone.eastPassZ, `${zone.id}.eastPassZ`).toBeUndefined();
      expect(zone.westPassZ, `${zone.id}.westPassZ`).toBeUndefined();
      expect(zone.sealedSouthBorder, `${zone.id}.sealedSouthBorder`).toBeUndefined();
      expect(zone.trashRespawnSeconds, `${zone.id}.trashRespawnSeconds`).toBeUndefined();
      if (ORIGINAL_BANDS.includes(zone.id)) {
        expect(zone.southPassX, `${zone.id}.southPassX`).toBeUndefined();
      } else {
        // The two PORTED strip bands legitimately declare their own southPassX
        // (upstream's), which must land inside the strip's own x range or the
        // band wall would have no opening at all.
        if (zone.southPassX !== undefined) {
          expect(zone.southPassX, `${zone.id}.southPassX`).toBeGreaterThanOrEqual(STRIP_MIN_X);
          expect(zone.southPassX, `${zone.id}.southPassX`).toBeLessThanOrEqual(STRIP_MAX_X);
        }
      }
    }
    expect(
      STRIP_ZONES.filter((z) => ORIGINAL_BANDS.includes(z.id)),
      'the three original bands are all still strip bands',
    ).toHaveLength(3);
  });

  it('opens each column on a shared edge with the strip, and seals nothing', () => {
    // A column touches the strip on ONE vertical line (the side facing x = 0).
    // Upstream declares a pass on most of them but not all: the Farshore Isle
    // declares none, and `computeBorderEdges` then falls back to the midpoint
    // of the shared span. So the ZONE FIELD is at most one pass, and what must
    // hold unconditionally is the EDGE: every column has at least one vertical
    // border edge on its strip-facing line whose pass lies inside that edge's
    // own span, i.e. a real opening a player can walk.
    const vertical = computeBorderEdges(ZONES).filter((e) => e.kind === 'v');
    for (const zone of COLUMN_ZONES) {
      const passes = [zone.eastPassZ, zone.westPassZ].filter((v) => v !== undefined);
      expect(passes.length, `${zone.id} border passes`).toBeLessThanOrEqual(1);
      if (passes.length === 1) {
        expect(passes[0], `${zone.id} pass z`).toBeGreaterThanOrEqual(zone.zMin);
        expect(passes[0], `${zone.id} pass z`).toBeLessThanOrEqual(zone.zMax);
        // the pass sits on the side that faces the strip, never the outer rim
        const facing = (zone.xMin ?? 0) >= STRIP_MAX_X ? zone.westPassZ : zone.eastPassZ;
        expect(facing, `${zone.id} pass is on the strip-facing edge`).toBeTypeOf('number');
      }
      expect(zone.sealedSouthBorder).toBeUndefined();
      if (zone.southPassX !== undefined) {
        expect(zone.southPassX, `${zone.id} southPassX`).toBeGreaterThanOrEqual(zone.xMin!);
        expect(zone.southPassX, `${zone.id} southPassX`).toBeLessThanOrEqual(zone.xMax!);
      }
      const facingX = (zone.xMin ?? 0) >= STRIP_MAX_X ? zone.xMin! : zone.xMax!;
      const mine = vertical.filter(
        (e) => e.at === facingX && e.lo < zone.zMax && e.hi > zone.zMin,
      );
      expect(mine.length, `${zone.id} strip-facing border edges`).toBeGreaterThan(0);
      for (const e of mine) expect(e.sealed, `${zone.id} border sealed`).toBe(false);
      const opening = mine.filter((e) => e.passAt >= e.lo && e.passAt <= e.hi);
      expect(opening.length, `${zone.id} has a pass inside a shared span`).toBeGreaterThan(0);
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
    // z GREW NORTH. The columns no longer only share an existing band: the
    // ported grid stacks five rows of them, and the Drakelands (z 1820..2420)
    // is the northmost rect in the whole world. The south edge is untouched.
    expect(WORLD_MIN_Z).toBe(-180);
    expect(WORLD_MAX_Z).toBe(2420);
    expect(WORLD_MAX_Z).toBe(Math.max(...ZONES.map((z) => z.zMax)));
    expect(ZONES.find((z) => z.zMax === WORLD_MAX_Z)!.id).toBe('drakelands');
  });

  it('tiles the z axis contiguously along the strip, which is what makes the fallback exact', () => {
    for (let i = 1; i < STRIP_ZONES.length; i++) {
      expect(STRIP_ZONES[i].zMin, `${STRIP_ZONES[i].id}.zMin`).toBe(STRIP_ZONES[i - 1].zMax);
    }
    // A column does not have to share a strip band (the Willowfen runs
    // z 180..700, straight across the Mirefen/Thornpeak boundary at 540), and a
    // column's south neighbour is never a strip band either, so the old "starts
    // where a same-column zone ends, or at the world's south edge" rule no
    // longer holds: the Willowfen starts at z 180 with NOTHING south of it,
    // because upstream leaves the -x half of the vale's row empty.
    //
    // The real rule, and a stronger one: group the columns by their x rect and
    // each GRID COLUMN tiles ONE contiguous z interval, no gap and no overlap.
    // Only where that interval starts is allowed to differ from the strip's.
    const byColumn = new Map<string, ZoneDef[]>();
    for (const col of COLUMN_ZONES) {
      const key = `${col.xMin},${col.xMax}`;
      const list = byColumn.get(key) ?? [];
      list.push(col);
      byColumn.set(key, list);
    }
    // Upstream's grid is two columns wide, one each side of the strip.
    expect([...byColumn.keys()].sort()).toEqual(['-540,-180', '180,540']);
    for (const [key, list] of byColumn) {
      const sorted = [...list].sort((a, b) => a.zMin - b.zMin);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].zMin, `${sorted[i].id}.zMin follows ${sorted[i - 1].id}.zMax`).toBe(
          sorted[i - 1].zMax,
        );
      }
      const span = [sorted[0].zMin, sorted[sorted.length - 1].zMax];
      // The +x column runs the world's whole z extent; the -x column starts at
      // z 180 (the vale's row has no -x zone) and stops 40yd short of the
      // Drakelands' north end. Both holes are asserted as holes further down.
      expect(span, `grid column ${key} z span`).toEqual(
        key === '180,540' ? [WORLD_MIN_Z, WORLD_MAX_Z] : [180, 2380],
      );
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

  it('leaves exactly three holes in the bounding box, and clamps every one to a strip band', () => {
    // The grid used to tile its whole bounding box, because the invented ring
    // mirrored every row. Upstream's grid is DELIBERATELY ragged, so the box
    // has three holes and they are named here rather than tolerated: a hole is
    // ground `zoneContaining` must report honestly, and that `zoneAt` must
    // still clamp to a STRIP band so no caller (zone name, biome, sky,
    // respawn graveyard) can crash or read a column.
    const HOLES: { what: string; x0: number; x1: number; z0: number; z1: number }[] = [
      // Upstream puts `farshore_isle` at +x in the vale's row and nothing
      // opposite it, so the -x half of that row is empty.
      { what: 'the vale row, -x half', x0: WORLD_MIN_X, x1: STRIP_MIN_X, z0: WORLD_MIN_Z, z1: 180 },
      // The strip ends at the Frostveil's north edge (1960) while both columns
      // run further north. Upstream fills this corridor with an ocean bay it
      // shapes in its own world.ts; we have no coast shaper, so it stays a hole
      // and the world's north rim follows the columns instead (worldNorthEdgeAt).
      { what: 'the middle column, north of the strip', x0: STRIP_MIN_X, x1: STRIP_MAX_X, z0: 1960, z1: WORLD_MAX_Z },
      // The Drakelands reaches z 2420, the Amberfall stops at 2380.
      { what: 'the -x column, north of the Amberfall', x0: WORLD_MIN_X, x1: STRIP_MIN_X, z0: 2380, z1: WORLD_MAX_Z },
    ];
    const hit = HOLES.map(() => 0);
    let holes = 0;
    for (let x = WORLD_MIN_X; x < WORLD_MAX_X; x += 7.5) {
      for (let z = WORLD_MIN_Z; z < WORLD_MAX_Z; z += 7.5) {
        const strict = zoneContaining(x, z);
        if (strict === null) {
          holes++;
          const which = HOLES.findIndex((h) => x >= h.x0 && x < h.x1 && z >= h.z0 && z < h.z1);
          expect(which, `hole at ${x},${z} is not one of the three known rects`).toBeGreaterThan(-1);
          hit[which]++;
          // zoneAt still clamps it to the band's strip zone, exactly as the 1D
          // strip-era lookup answered, so no caller can crash.
          expect(zoneAt(x, z)).toBe(zoneAtOld(z));
          expect(STRIP_ZONES).toContain(zoneAt(x, z));
        } else {
          expect(strict).toBe(zoneAt(x, z));
        }
      }
    }
    // All three rects are real, so none of them is a stale entry quietly
    // widening the allow-list above.
    for (let i = 0; i < HOLES.length; i++) {
      expect(hit[i], `${HOLES[i].what} contributes holes`).toBeGreaterThan(0);
    }
    expect(holes).toBe(hit.reduce((a, b) => a + b, 0));
  });
});
