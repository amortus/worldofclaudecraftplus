// The world stopped being a 360yd strip and became a 3 column grid WITH HOLES:
// WORLD_MIN_X/WORLD_MAX_X are only the bounding box of every zone rect, and most
// z rows have no column zone beside the strip. Every render sweep that walks that
// box (ground dressing, the grass ring, the ambient fields) therefore has to gate
// on strict zone containment the way generateDecorations (sim/world.ts) does, or
// it scatters over void no player can reach.
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

// A row the columns do NOT occupy (they share the vale's band, z -180..180), at
// an x only the columns could reach: the middle of one of the grid's holes.
const HOLE = { x: 360, z: 700 };

describe('world bounds on a grid with holes', () => {
  it('places the two grid columns beside the vale and nowhere else', () => {
    // the premise the rest of the file rests on
    expect(WORLD_MIN_X).toBe(-540);
    expect(WORLD_MAX_X).toBe(540);
    expect(zoneContaining(HOLE.x, HOLE.z)).toBeNull();
    expect(zoneContaining(HOLE.x, 0)).not.toBeNull(); // same x, inside the column band
  });

  it('reports the rim per row, not one half width for the whole world', () => {
    // a row with a column: the world reaches the grid's outer edge
    expect(insideWorldRim(500, 0, 16)).toBe(true);
    // the same x in a row without one: that is behind the strip's own rim wall
    expect(insideWorldRim(500, 700, 16)).toBe(false);
    expect(insideWorldRim(160, 700, 16)).toBe(true);
    expect(insideWorldRim(170, 700, 16)).toBe(false); // inside the wall's clearance
    // the z rim is unchanged
    expect(insideWorldRim(0, WORLD_MIN_Z + 1, 16)).toBe(false);
    expect(insideWorldRim(0, WORLD_MAX_Z - 1, 16)).toBe(false);
  });

  it('spans only the columns a row actually has', () => {
    const columnRow = zoneRowSpanX(0);
    expect(columnRow).toEqual({ minX: WORLD_MIN_X, maxX: WORLD_MAX_X });
    const stripRow = zoneRowSpanX(700);
    expect(stripRow).toEqual({ minX: STRIP_MIN_X, maxX: STRIP_MAX_X });
    expect(zoneRowSpanX(WORLD_MAX_Z + 50)).toBeNull();
    // the margin widens the span on all four sides, so a jittered cell can
    // never fall outside a span that would have accepted it
    expect(zoneRowSpanX(190, 12)).toEqual({ minX: WORLD_MIN_X - 12, maxX: WORLD_MAX_X + 12 });
  });

  it('answers rect overlap for the grass ring chunk early out', () => {
    expect(rectHasZone(-24, 24, -24, 24)).toBe(true); // over the vale
    expect(rectHasZone(336, 384, 672, 720)).toBe(false); // wholly inside a hole
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

  it('scatters into the two new columns, not into the holes beside them', () => {
    const inColumns = sweep.spots.filter((s) => Math.abs(s.x) > STRIP_MAX_X);
    expect(inColumns.length).toBeGreaterThan(0);
    for (const s of inColumns) expect(Math.abs(s.z)).toBeLessThan(180);
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
    // ...and the prefilter really did skip about half the box, which is what
    // the widening added: three columns of cells over a world with two holes.
    expect(sweep.stats.skippedVoid).toBeGreaterThan(sweep.stats.cells * 0.4);
    expect(sweep.stats.cells).toBe(sweep.stats.evaluated + sweep.stats.skippedVoid);
  });

  it('costs a strip-only world nothing: every sweep cell is still evaluated there', () => {
    // Rows the columns do not touch must evaluate exactly the strip's cells, so
    // the gate cannot thin the dressing that shipped before the world widened.
    const strip = sweep.spots.filter((s) => s.z > 300 && s.z < 500);
    expect(strip.length).toBeGreaterThan(0);
    for (const s of strip) expect(Math.abs(s.x)).toBeLessThanOrEqual(WORLD_SIZE / 2);
  });
});

describe('ambient fields', () => {
  it('never leaps a fish over the void beside a column', () => {
    const deep = () => 3;
    expect(isLeapableWater(0, 0, deep)).toBe(true);
    expect(isLeapableWater(300, 0, deep)).toBe(true); // inside the east column
    expect(isLeapableWater(HOLE.x, HOLE.z, deep)).toBe(false); // a hole in the grid
    expect(isLeapableWater(WORLD_MAX_X + 50, 0, deep)).toBe(false);
  });
});
