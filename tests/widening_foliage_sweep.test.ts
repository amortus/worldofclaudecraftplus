// The world stopped being a 360yd strip and became a 3 column grid, and every
// render sweep that walks its bounding box (ground dressing, the grass ring,
// the ambient fields) has to gate on strict zone containment the way
// generateDecorations (sim/world.ts) does, or it scatters over void no player
// can reach.
//
// The grid has HOLES, and after the full map parity pass it has them for good.
// Upstream's 14-zone map is deliberately RAGGED, and the bounding box
// (x -540..540, z -180..2420) leaves exactly three cells with no zone in them:
//
//   1. the -x half of the vale's row (z -180..180): `farshore_isle` is the only
//      column in that band and it sits on +x, with nothing opposite it;
//   2. the middle column past z 1960, where the strip ends at the Frostveil
//      while the two columns beside it run on to 2380 and 2420;
//   3. the -x column at z 2380..2420, where the Amberfall stops 40yd short of
//      the Drakelands.
//
// So the GATES this file pins are load bearing again rather than merely
// future-proofing: `skippedVoid` is non-zero and the sweep must still agree
// exactly with a gate-only reference walk. What moved since the file was
// written is the fixture, not the contract.
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

// The void the sweeps must never scatter into: the row past the world's north
// edge, at an x only a grid column reaches.
const HOLE = { x: 360, z: WORLD_MAX_Z + 40 };

describe('world bounds on a grid', () => {
  it('fills the grid except the three holes upstream\'s map leaves', () => {
    // the premise the rest of the file rests on
    expect(WORLD_MIN_X).toBe(-540);
    expect(WORLD_MAX_X).toBe(540);
    expect(zoneContaining(HOLE.x, HOLE.z)).toBeNull(); // past the north edge
    expect(zoneContaining(HOLE.x, 0)).not.toBeNull(); // the vale's band, Farshore
    expect(zoneContaining(HOLE.x, 700)).not.toBeNull(); // Evergarden
    expect(zoneContaining(-HOLE.x, 700)).not.toBeNull(); // ...and Palmreach
    // ...and the three holes inside the bounding box, in the order the header
    // lists them. These are the fixture the gates below are tested against.
    expect(zoneContaining(-HOLE.x, 0)).toBeNull(); // no -x column in the vale's row
    expect(zoneContaining(0, 2000)).toBeNull(); // the strip ends at the Frostveil
    expect(zoneContaining(-HOLE.x, 2400)).toBeNull(); // Amberfall stops at 2380
  });

  it('reports the rim per row, not one half width for the whole world', () => {
    // a row with a column on both sides: the world reaches the grid's outer edge
    expect(insideWorldRim(500, 400, 16)).toBe(true);
    expect(insideWorldRim(-500, 400, 16)).toBe(true);
    // the vale's row has a column on the +x side ONLY, so the rim is out at the
    // grid edge there and back at the strip's own wall on the -x side. This is
    // the PER SIDE half width (`worldHalfWidthAt(z, x)`) the ragged grid needs:
    // one half width for the row would push the wall 360yd out over the hole.
    expect(insideWorldRim(500, 0, 16)).toBe(true);
    expect(insideWorldRim(160, 0, 16)).toBe(true);
    expect(insideWorldRim(-500, 0, 16)).toBe(false);
    // ...and it still comes back to the strip past the last band
    expect(insideWorldRim(500, WORLD_MAX_Z + 40, 16)).toBe(false);
    // the z rim is unchanged, and is now per COLUMN too: the middle column ends
    // at the Frostveil (1960) while the columns beside it run past 2380
    expect(insideWorldRim(0, WORLD_MIN_Z + 1, 16)).toBe(false);
    expect(insideWorldRim(0, WORLD_MAX_Z - 1, 16)).toBe(false);
    expect(insideWorldRim(0, 2000, 16)).toBe(false);
    expect(insideWorldRim(360, 2000, 16)).toBe(true);
  });

  it('spans only the columns a row actually has', () => {
    // The vale's row: Farshore on +x, nothing on -x, so the span stops at the
    // strip's own west edge rather than reaching the grid's bounding box.
    expect(zoneRowSpanX(0)).toEqual({ minX: STRIP_MIN_X, maxX: WORLD_MAX_X });
    // z 700 used to be a strip-only row; the realm ring gave it both columns
    expect(zoneRowSpanX(700)).toEqual({ minX: WORLD_MIN_X, maxX: WORLD_MAX_X });
    // the northmost row is a single column again (Drakelands, +x only)
    expect(zoneRowSpanX(2400)).toEqual({ minX: 180, maxX: WORLD_MAX_X });
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
    // ...and the prefilter really is skipping the three holes: the reference
    // walk above visits those cells and rejects them on the gates, the real
    // sweep never visits them at all, and the two agree spot for spot. That
    // agreement is the contract; the count is only evidence the holes exist.
    expect(sweep.stats.skippedVoid).toBeGreaterThan(0);
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
