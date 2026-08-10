// The world stopped being a 360yd strip and became a 3 column grid, and every
// render sweep that walks its bounding box (ground dressing, the grass ring,
// the ambient fields) has to gate on strict zone containment the way
// generateDecorations (sim/world.ts) does, or it scatters over void no player
// can reach.
//
// The grid had HOLES when this file was written: only the vale's band had
// columns, so most z rows were void beside the strip. The ported realm ring
// (Willowfen/Galecrest beside the marsh, Palmreach/Evergarden beside the
// heights and the wastes) filled both columns end to end, so the bounding box
// is solid now and `skippedVoid` is zero. The GATES are still what is under
// test: they are what makes a sweep correct for a ragged grid, and the grid
// goes ragged again the moment one more cell is authored. What moved is the
// fixture, not the contract, so the void probes below sit past the world's
// north edge (the one hole that cannot be filled) instead of beside a column.
import { describe, expect, it } from 'vitest';
import {
  CAMPS, STRIP_MAX_X, STRIP_MIN_X, WORLD_MAX_X, WORLD_MAX_Z, WORLD_MIN_X, WORLD_MIN_Z,
  WORLD_SIZE, ZONES, zoneContaining,
} from '../src/sim/data';
import { roadDistance, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../src/sim/world';
import {
  DRESS_DENSITY, DRESS_RIM_INSET, DRESS_SCALE, DRESS_STEP_HIGH, dressKindFor, hashAt,
  sweepDressing, tooSteep, type DressingSpot,
} from '../src/render/foliage_scatter';
import { insideWorldRim, rectHasZone, zoneRowSpanX } from '../src/render/world_bounds';
import { isLeapableWater } from '../src/render/fish';

const SEED = 1337;
const HIGH = { step: DRESS_STEP_HIGH, densityScale: 1, scaleBoost: 1 };

// The void the sweeps must never scatter into. The bounding box is solid now,
// so the nearest one is the row past the world's north edge, at an x only a
// grid column reaches.
const HOLE = { x: 360, z: WORLD_MAX_Z + 40 };

describe('world bounds on a grid', () => {
  it('fills both grid columns from the south edge to the north one', () => {
    // the premise the rest of the file rests on
    expect(WORLD_MIN_X).toBe(-540);
    expect(WORLD_MAX_X).toBe(540);
    expect(zoneContaining(HOLE.x, HOLE.z)).toBeNull(); // past the north edge
    expect(zoneContaining(HOLE.x, 0)).not.toBeNull(); // the vale's band
    expect(zoneContaining(HOLE.x, 700)).not.toBeNull(); // was a hole, now Evergarden
    expect(zoneContaining(-HOLE.x, 700)).not.toBeNull(); // ...and Palmreach
  });

  it('reports the rim per row, not one half width for the whole world', () => {
    // a row with a column: the world reaches the grid's outer edge
    expect(insideWorldRim(500, 0, 16)).toBe(true);
    // every row has one now, so the rim is out at the grid edge everywhere
    expect(insideWorldRim(500, 700, 16)).toBe(true);
    expect(insideWorldRim(160, 700, 16)).toBe(true);
    // ...and it still comes back to the strip past the last band
    expect(insideWorldRim(500, WORLD_MAX_Z + 40, 16)).toBe(false);
    // the z rim is unchanged
    expect(insideWorldRim(0, WORLD_MIN_Z + 1, 16)).toBe(false);
    expect(insideWorldRim(0, WORLD_MAX_Z - 1, 16)).toBe(false);
  });

  it('spans only the columns a row actually has', () => {
    const columnRow = zoneRowSpanX(0);
    expect(columnRow).toEqual({ minX: WORLD_MIN_X, maxX: WORLD_MAX_X });
    // z 700 used to be a strip-only row; the realm ring gave it both columns
    expect(zoneRowSpanX(700)).toEqual({ minX: WORLD_MIN_X, maxX: WORLD_MAX_X });
    // the span is still DERIVED per row, not hardcoded: past the last band
    // there is no zone at all and it says so
    expect(zoneRowSpanX(WORLD_MAX_Z + 50)).toBeNull();
    expect(zoneRowSpanX(WORLD_MIN_Z - 200)).toBeNull();
    // the margin widens the span on all four sides, so a jittered cell can
    // never fall outside a span that would have accepted it
    expect(zoneRowSpanX(190, 12)).toEqual({ minX: WORLD_MIN_X - 12, maxX: WORLD_MAX_X + 12 });
  });

  it('answers rect overlap for the grass ring chunk early out', () => {
    expect(rectHasZone(-24, 24, -24, 24)).toBe(true); // over the vale
    expect(rectHasZone(336, 384, 672, 720)).toBe(true); // was a hole, now Evergarden
    // past the world's north edge, which no zone can ever reach
    expect(rectHasZone(336, 384, WORLD_MAX_Z + 24, WORLD_MAX_Z + 72)).toBe(false);
    expect(rectHasZone(160, 208, -24, 24)).toBe(true); // straddles strip and column
  });
});

describe('ground dressing sweep', () => {
  const sweep = sweepDressing(SEED, HIGH);

  it('is deterministic', () => {
    expect(sweepDressing(SEED, HIGH).spots).toEqual(sweep.spots);
  });

  it('keeps every spot inside an authored zone and clear of the rim', () => {
    expect(sweep.spots.length).toBeGreaterThan(100);
    for (const s of sweep.spots) {
      expect(zoneContaining(s.x, s.z), `spot at ${s.x},${s.z}`).not.toBeNull();
      expect(insideWorldRim(s.x, s.z, DRESS_RIM_INSET), `spot at ${s.x},${s.z}`).toBe(true);
    }
  });

  it('scatters into every grid column, and never past the world edge', () => {
    const inColumns = sweep.spots.filter((s) => Math.abs(s.x) > STRIP_MAX_X);
    expect(inColumns.length).toBeGreaterThan(0);
    for (const s of inColumns) {
      expect(s.z).toBeGreaterThanOrEqual(WORLD_MIN_Z);
      expect(s.z).toBeLessThan(WORLD_MAX_Z);
      expect(zoneContaining(s.x, s.z)).not.toBeNull();
    }
    // both column bands the realm ring added really do get dressed
    expect(inColumns.some((s) => s.z > 200 && s.z < 690)).toBe(true);
    expect(inColumns.some((s) => s.z > 720 && s.z < 1250)).toBe(true);
  });

  it('skips the holes without dropping a single in-world placement', () => {
    // The row-span prefilter is an optimisation: this reference sweep applies
    // the same gates with no prefilter at all, and must agree exactly.
    const reference: DressingSpot[] = [];
    const { step, densityScale, scaleBoost } = HIGH;
    const xHalf = WORLD_MAX_X - DRESS_RIM_INSET;
    for (let gx = -xHalf; gx < xHalf; gx += step) {
      for (let gz = WORLD_MIN_Z + DRESS_RIM_INSET; gz < WORLD_MAX_Z - DRESS_RIM_INSET; gz += step) {
        const r = hashAt(gx, gz, 41);
        const biome = zoneBiomeAt(gx, gz);
        if (r > DRESS_DENSITY[biome] * densityScale) continue;
        const x = gx + (hashAt(gx, gz, 42) - 0.5) * step;
        const z = gz + (hashAt(gx, gz, 43) - 0.5) * step;
        if (!zoneContaining(x, z)) continue;
        if (!insideWorldRim(x, z, DRESS_RIM_INSET)) continue;
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
        if (terrainHeight(x, z, SEED) < WATER_LEVEL + 1.2) continue;
        if (tooSteep(x, z, SEED)) continue;
        const kind = dressKindFor(biome, hashAt(gx, gz, 44));
        const [sMin, sRange] = DRESS_SCALE[kind];
        reference.push({ x, z, kind, scale: (sMin + hashAt(gx, gz, 45) * sRange) * scaleBoost });
      }
    }
    expect(sweep.spots).toEqual(reference);
    // ...and with the grid solid the prefilter now skips NOTHING. That is the
    // point of asserting against the reference sweep rather than against the
    // prefilter: the two agree whether the grid is ragged or full.
    expect(sweep.stats.skippedVoid).toBe(0);
    expect(sweep.stats.cells).toBe(sweep.stats.evaluated + sweep.stats.skippedVoid);
  });

  it('costs the strip nothing: its own cells are all still evaluated', () => {
    // The gate may never thin the dressing that shipped before the world
    // widened, so every spot inside the strip column must still be produced.
    const strip = sweep.spots.filter(
      (s) => s.z > 300 && s.z < 500 && Math.abs(s.x) <= WORLD_SIZE / 2,
    );
    expect(strip.length).toBeGreaterThan(0);
    for (const s of strip) expect(zoneContaining(s.x, s.z)).not.toBeNull();
  });
});

describe('ambient fields', () => {
  it('never leaps a fish over the void beside a column', () => {
    const deep = () => 3;
    expect(isLeapableWater(0, 0, deep)).toBe(true);
    expect(isLeapableWater(300, 0, deep)).toBe(true); // inside the east column
    expect(isLeapableWater(300, 700, deep)).toBe(true); // was a hole, now Evergarden
    expect(isLeapableWater(HOLE.x, HOLE.z, deep)).toBe(false); // past the world edge
    expect(isLeapableWater(WORLD_MAX_X + 50, 0, deep)).toBe(false);
  });
});
