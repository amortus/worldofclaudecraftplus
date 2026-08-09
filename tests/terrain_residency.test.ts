import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type GfxTier,
  gfxInternalsForTest,
  TERRAIN_RESIDENCY_BY_TIER,
  TERRAIN_RESIDENCY_MIN_HYSTERESIS,
  TERRAIN_RESIDENCY_MIN_KEEP,
} from '../src/render/gfx';
import { TERRAIN_BUILD_CAPS_BY_TIER, terrainBuildBudget } from '../src/render/render_budget';
import {
  chunkEdgeDistance,
  emptyTerrainResidencyPlan,
  nextChunkResidency,
  planTerrainResidency,
  type TerrainChunkFootprint,
  type TerrainResidencyRadii,
} from '../src/render/terrain_residency';

const TIERS: GfxTier[] = ['low', 'medium', 'high', 'ultra'];

const RADII: TerrainResidencyRadii = { keep: 100, release: 160 };
/** Wide enough that a 20-chunk row has a resident set worth budgeting. */
const WIDE: TerrainResidencyRadii = { keep: 400, release: 520 };

const chunk = (centerX: number, centerZ: number, half = 30): TerrainChunkFootprint => ({
  centerX,
  centerZ,
  half,
});

/** A row of `count` 60 yd chunks laid out along +z from the origin. */
function row(count: number): TerrainChunkFootprint[] {
  return Array.from({ length: count }, (_, i) => chunk(0, 30 + i * 60));
}

describe('chunkEdgeDistance', () => {
  it('is zero anywhere inside the chunk footprint', () => {
    expect(chunkEdgeDistance(chunk(0, 0), 0, 0)).toBe(0);
    expect(chunkEdgeDistance(chunk(0, 0), 29, -29)).toBe(0);
  });

  it('measures to the nearest edge, not the centre', () => {
    // a 120 yd super-chunk centred at 0 reaches 60 yd out, so a camera 100 yd
    // away is only 40 yd from the geometry it would have to mesh
    expect(chunkEdgeDistance(chunk(0, 0, 60), 100, 0)).toBe(40);
    expect(chunkEdgeDistance(chunk(0, 0, 30), 100, 0)).toBe(70);
  });

  it('combines both axes outside a corner', () => {
    expect(chunkEdgeDistance(chunk(0, 0), 30 + 30, 30 + 40)).toBeCloseTo(50, 6);
  });
});

describe('residency hysteresis', () => {
  it('builds inside keep and releases past release, whatever the previous state', () => {
    expect(nextChunkResidency(false, 99, RADII)).toBe(true);
    expect(nextChunkResidency(true, 99, RADII)).toBe(true);
    expect(nextChunkResidency(false, 161, RADII)).toBe(false);
    expect(nextChunkResidency(true, 161, RADII)).toBe(false);
  });

  it('holds the current state inside the band, which is the whole point', () => {
    // a resident chunk drifting out stays resident until it clears `release`
    expect(nextChunkResidency(true, 130, RADII)).toBe(true);
    // a released chunk drifting in stays released until it reaches `keep`
    expect(nextChunkResidency(false, 130, RADII)).toBe(false);
  });

  it('never toggles a chunk twice while the camera paces the boundary', () => {
    const footprints = [chunk(0, 0)];
    const resident = [false];
    const plan = emptyTerrainResidencyPlan();
    let builds = 0;
    let releases = 0;
    // 40 passes back and forth across `keep`, but never out past `release`
    for (let pass = 0; pass < 40; pass++) {
      for (const camZ of [30 + RADII.keep - 4, 30 + RADII.keep + 4]) {
        planTerrainResidency(footprints, resident, 0, camZ, RADII, 4, plan);
        for (const i of plan.release) {
          resident[i] = false;
          releases++;
        }
        for (const i of plan.build) {
          resident[i] = true;
          builds++;
        }
      }
    }
    expect(builds).toBe(1);
    expect(releases).toBe(0);
    // and it does come off once the camera really leaves
    planTerrainResidency(footprints, resident, 0, 30 + RADII.release + 1, RADII, 4, plan);
    expect(plan.release).toEqual([0]);
  });

  it('a single-radius policy would thrash where the hysteresis one does not', () => {
    // the negative control: keep === release is the naive policy this replaced
    const naive: TerrainResidencyRadii = { keep: RADII.keep, release: RADII.keep };
    const footprints = [chunk(0, 0)];
    const resident = [false];
    const plan = emptyTerrainResidencyPlan();
    let builds = 0;
    for (let pass = 0; pass < 40; pass++) {
      for (const camZ of [30 + RADII.keep - 4, 30 + RADII.keep + 4]) {
        planTerrainResidency(footprints, resident, 0, camZ, naive, 4, plan);
        for (const i of plan.release) resident[i] = false;
        for (const i of plan.build) {
          resident[i] = true;
          builds++;
        }
      }
    }
    expect(builds).toBe(40);
  });
});

describe('planTerrainResidency', () => {
  it('never mutates its inputs', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const snapshot = resident.slice();
    const frozen = footprints.map((f) => ({ ...f }));
    planTerrainResidency(footprints, resident, 0, 0, WIDE, 3);
    expect(resident).toEqual(snapshot);
    expect(footprints).toEqual(frozen);
  });

  it('caps builds at the frame budget and takes the nearest first', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = planTerrainResidency(footprints, resident, 0, 0, WIDE, 2);
    expect(plan.build).toEqual([0, 1]);
    // the budget defers work, it does not lose it
    expect(plan.pendingBuilds).toBe(plan.desiredResident);
    expect(plan.desiredResident).toBeGreaterThan(2);
  });

  it('reports zero pending once the resident set has converged', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = emptyTerrainResidencyPlan();
    for (let frame = 0; frame < 40; frame++) {
      planTerrainResidency(footprints, resident, 0, 0, WIDE, 2, plan);
      for (const i of plan.release) resident[i] = false;
      for (const i of plan.build) resident[i] = true;
    }
    expect(plan.pendingBuilds).toBe(0);
    expect(resident.filter(Boolean)).toHaveLength(plan.desiredResident);
  });

  it('releases every eligible chunk in one pass, budget or not', () => {
    const footprints = row(20);
    const resident = footprints.map(() => true);
    // camera 10_000 yd away: nothing survives, and holding evicted geometry
    // back for a later frame is exactly the leak this policy exists to avoid
    const plan = planTerrainResidency(footprints, resident, 0, 10_000, WIDE, 1);
    expect(plan.release).toHaveLength(20);
    expect(plan.build).toHaveLength(0);
    expect(plan.desiredResident).toBe(0);
  });

  it('reuses the plan object it is given, so a 60 Hz caller allocates nothing', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = emptyTerrainResidencyPlan();
    const build = plan.build;
    const release = plan.release;
    planTerrainResidency(footprints, resident, 0, 0, WIDE, 2, plan);
    planTerrainResidency(footprints, resident, 0, 5_000, WIDE, 2, plan);
    expect(plan.build).toBe(build);
    expect(plan.release).toBe(release);
    expect(plan.build).toHaveLength(0);
  });

  it('treats a zero budget as "release only", never as "build everything"', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = planTerrainResidency(footprints, resident, 0, 0, WIDE, 0);
    expect(plan.build).toHaveLength(0);
    expect(plan.pendingBuilds).toBeGreaterThan(0);
  });
});

describe('tier residency table', () => {
  it('exposes the tier radii through GFX', () => {
    for (const tier of TIERS) {
      const settings = gfxInternalsForTest.settingsFor(tier);
      expect(settings.terrainResidency).toEqual(TERRAIN_RESIDENCY_BY_TIER[tier]);
    }
  });

  it('keeps every tier above the correctness floor with a real hysteresis band', () => {
    for (const tier of TIERS) {
      const radii = TERRAIN_RESIDENCY_BY_TIER[tier];
      expect(radii.keep).toBeGreaterThanOrEqual(TERRAIN_RESIDENCY_MIN_KEEP);
      expect(radii.release - radii.keep).toBeGreaterThanOrEqual(TERRAIN_RESIDENCY_MIN_HYSTERESIS);
    }
  });

  it('lets phones hold less than desktops', () => {
    // low is the phone baseline (resolveDefaultGraphicsPreset), ultra is the
    // strong-desktop one; the ladder must be monotonic in between
    expect(TERRAIN_RESIDENCY_BY_TIER.low.keep).toBeLessThan(TERRAIN_RESIDENCY_BY_TIER.medium.keep);
    expect(TERRAIN_RESIDENCY_BY_TIER.medium.keep).toBeLessThan(TERRAIN_RESIDENCY_BY_TIER.high.keep);
    expect(TERRAIN_RESIDENCY_BY_TIER.high.keep).toBeLessThan(TERRAIN_RESIDENCY_BY_TIER.ultra.keep);
    // and the saving has to be worth having: a phone keeps under 60 percent of
    // the area ultra does
    const area = (tier: GfxTier): number => TERRAIN_RESIDENCY_BY_TIER[tier].keep ** 2;
    expect(area('low') / area('ultra')).toBeLessThan(0.6);
  });

  /**
   * The floor is not taste: renderer.ts draws terrain out to the current fog far
   * plane and hides nothing before it, so a keep radius under the widest fog far
   * we ever set would carve a hole in the ground short of the fog wall. Read the
   * presets out of renderer.ts rather than restating them, so widening the fog
   * without widening residency fails here instead of on a player's screen.
   */
  it('keeps at least as much terrain as the renderer ever draws', () => {
    const src = readFileSync('src/render/renderer.ts', 'utf8');
    const presetsStart = src.indexOf('private static BIOME_FOG');
    const presetsEnd = src.indexOf('private outdoorFogPreset');
    expect(presetsStart).toBeGreaterThan(0);
    expect(presetsEnd).toBeGreaterThan(presetsStart);
    const outdoorFars = [...src.slice(presetsStart, presetsEnd).matchAll(/far:\s*(\d+)/g)].map(
      (m) => Number(m[1]),
    );
    expect(outdoorFars.length).toBeGreaterThanOrEqual(6);

    // plus the fog the constructor opens with, before the first fog-state change
    const ctor = /new THREE\.Fog\(([^)]*)\)/.exec(src);
    expect(ctor).not.toBeNull();
    const ctorFar = (ctor as RegExpExecArray)[1].split(',').slice(2).join(',');
    const ctorFars = [...ctorFar.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
    expect(ctorFars.length).toBeGreaterThan(0);

    const widestDrawn = Math.max(...outdoorFars, ...ctorFars);
    expect(TERRAIN_RESIDENCY_MIN_KEEP).toBeGreaterThanOrEqual(widestDrawn);
    for (const tier of TIERS) {
      expect(TERRAIN_RESIDENCY_BY_TIER[tier].keep).toBeGreaterThanOrEqual(widestDrawn);
    }
  });
});

describe('terrain build budget', () => {
  it('gives every tier a per-frame cap, smallest on phones', () => {
    for (const tier of TIERS) {
      expect(terrainBuildBudget(tier)).toBe(TERRAIN_BUILD_CAPS_BY_TIER[tier]);
      expect(terrainBuildBudget(tier)).toBeGreaterThanOrEqual(1);
    }
    expect(terrainBuildBudget('low')).toBeLessThan(terrainBuildBudget('ultra'));
  });

  it('never returns zero, so residency always converges', () => {
    // a zero budget would leave a permanent hole in the ground rather than a
    // temporary one, which is worse than a single deferred chunk build
    for (const tier of TIERS) expect(terrainBuildBudget(tier)).toBeGreaterThan(0);
  });
});

/**
 * The number this whole change exists to move. Our world is 6 x 24 = 144 chunk
 * cells; upstream's 3-column world (docs/design/parity-backlog.md) is
 * 1080 x 2600 yd = 18 x 44 = 792. Residency is what keeps that from becoming
 * 5.5x the resident geometry and 5.5x the boot cost on a Samsung A14.
 */
describe('projected residency on a 5.4x world', () => {
  const cell = (cx: number, cz: number): TerrainChunkFootprint =>
    chunk(-540 + cx * 60 + 30, -180 + cz * 60 + 30);
  const world54x = Array.from({ length: 18 * 44 }, (_, i) => cell(i % 18, Math.floor(i / 18)));

  it('spans the 792 cells the backlog measured', () => {
    expect(world54x).toHaveLength(792);
  });

  it('keeps a small fraction of it resident from the starting hub', () => {
    const resident = world54x.map(() => false);
    // Eastbrook, the level-1 hub, is at (0, 0) in both worlds
    const low = planTerrainResidency(world54x, resident, 0, 0, TERRAIN_RESIDENCY_BY_TIER.low, 0);
    const ultra = planTerrainResidency(
      world54x,
      resident,
      0,
      0,
      TERRAIN_RESIDENCY_BY_TIER.ultra,
      0,
    );
    // measured: 212 of 792 on low (26.8 percent), 294 on ultra (37.1 percent)
    expect(low.desiredResident).toBeLessThan(792 * 0.3);
    expect(ultra.desiredResident).toBeLessThan(792 * 0.4);
    expect(low.desiredResident).toBeLessThan(ultra.desiredResident);
    // and the old policy is the thing being replaced: all 792, always
    expect(low.desiredResident).toBeLessThan(792 / 3);
  });

  it('bounds the worst case too, deep inside the map where nothing clips the disc', () => {
    const resident = world54x.map(() => false);
    // (0, 540) sits in the interior of their 1080 x 2600 box, so the residency
    // disc is not trimmed by any world edge: measured 316 of 792 on low, 456 on ultra
    const low = planTerrainResidency(world54x, resident, 0, 540, TERRAIN_RESIDENCY_BY_TIER.low, 0);
    const ultra = planTerrainResidency(
      world54x,
      resident,
      0,
      540,
      TERRAIN_RESIDENCY_BY_TIER.ultra,
      0,
    );
    expect(low.desiredResident).toBeLessThan(792 * 0.45);
    expect(ultra.desiredResident).toBeLessThan(792 * 0.6);
  });
});
