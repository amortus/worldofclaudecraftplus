import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type GfxTier,
  gfxInternalsForTest,
  TERRAIN_RESIDENCY_BY_TIER,
  TERRAIN_RESIDENCY_MIN_HYSTERESIS,
  TERRAIN_RESIDENCY_MIN_KEEP,
} from '../src/render/gfx';
import {
  TERRAIN_BUILD_VERTEX_BUDGET_BY_TIER,
  terrainBuildBudget,
} from '../src/render/render_budget';
import {
  chunkEdgeDistance,
  emptyTerrainResidencyPlan,
  MAX_BUILD_CANDIDATES,
  nextChunkResidency,
  planTerrainResidency,
  type TerrainChunkFootprint,
  type TerrainResidencyRadii,
  terrainChunkVertexCount,
} from '../src/render/terrain_residency';

const TIERS: GfxTier[] = ['low', 'medium', 'high', 'ultra'];

const RADII: TerrainResidencyRadii = { keep: 100, release: 160 };
/** Wide enough that a 20-chunk row has a resident set worth budgeting. */
const WIDE: TerrainResidencyRadii = { keep: 400, release: 520 };

/** Every synthetic chunk costs 100 vertices, so a budget of N*100 buys N of them. */
const COST = 100;
const chunk = (
  centerX: number,
  centerZ: number,
  half = 30,
  cost = COST,
): TerrainChunkFootprint => ({
  centerX,
  centerZ,
  half,
  cost,
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
    planTerrainResidency(footprints, resident, 0, 0, WIDE, 3 * COST);
    expect(resident).toEqual(snapshot);
    expect(footprints).toEqual(frozen);
  });

  it('caps builds at the frame budget and takes the nearest first', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = planTerrainResidency(footprints, resident, 0, 0, WIDE, 2 * COST);
    expect(plan.build).toEqual([0, 1]);
    expect(plan.buildCost).toBe(2 * COST);
    // the budget defers work, it does not lose it
    expect(plan.pendingBuilds).toBe(plan.desiredResident);
    expect(plan.desiredResident).toBeGreaterThan(2);
  });

  it('reports zero pending once the resident set has converged', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = emptyTerrainResidencyPlan();
    for (let frame = 0; frame < 40; frame++) {
      planTerrainResidency(footprints, resident, 0, 0, WIDE, 2 * COST, plan);
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
    const plan = planTerrainResidency(footprints, resident, 0, 10_000, WIDE, COST);
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
    planTerrainResidency(footprints, resident, 0, 0, WIDE, 2 * COST, plan);
    planTerrainResidency(footprints, resident, 0, 5_000, WIDE, 2 * COST, plan);
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

  it('publishes the full desired state in `want`, not just what the budget bought', () => {
    const footprints = row(20);
    const resident = footprints.map(() => false);
    const plan = planTerrainResidency(footprints, resident, 0, 0, WIDE, COST);
    expect(plan.build).toHaveLength(1);
    expect(plan.want).toHaveLength(20);
    expect(plan.want.filter(Boolean)).toHaveLength(plan.desiredResident);
    // `want` is what the boot streamer and the stats read, so it must describe
    // every slot, including the ones this frame could not afford
    for (let i = 0; i < footprints.length; i++) {
      expect(plan.want[i]).toBe(chunkEdgeDistance(footprints[i], 0, 0) <= WIDE.keep);
    }
  });
});

describe('cost-weighted build budget', () => {
  it('buys several cheap chunks or one expensive one', () => {
    // the real splat ladder: a settlement chunk is 2809 vertices, a wilderness
    // one 400, so counting CHUNKS would treat them as the same work
    const cheap = Array.from({ length: 8 }, (_, i) => chunk(0, 30 + i * 60, 30, 400));
    const resident = cheap.map(() => false);
    const cheapPlan = planTerrainResidency(cheap, resident, 0, 0, WIDE, 1_600);
    expect(cheapPlan.build).toHaveLength(4);
    expect(cheapPlan.buildCost).toBe(1_600);

    const dense = Array.from({ length: 8 }, (_, i) => chunk(0, 30 + i * 60, 30, 2_809));
    const densePlan = planTerrainResidency(dense, resident, 0, 0, WIDE, 1_600);
    expect(densePlan.build).toHaveLength(1);
  });

  it('always admits the nearest chunk even when it alone busts the budget', () => {
    // meshing cannot be split across frames, so refusing would stall residency
    // forever and leave a permanent hole rather than a one-frame hitch
    const footprints = [chunk(0, 0, 30, 99_999)];
    const plan = planTerrainResidency(footprints, [false], 0, 0, WIDE, 100);
    expect(plan.build).toEqual([0]);
    expect(plan.buildCost).toBe(99_999);
  });

  it('stops at the first chunk that does not fit rather than reordering', () => {
    // nearest-first is the invariant; skipping a dense near chunk for a cheap far
    // one would leave the ground under the player missing for longer
    const footprints = [chunk(0, 30, 30, 400), chunk(0, 90, 30, 2_000), chunk(0, 150, 30, 400)];
    const plan = planTerrainResidency(footprints, [false, false, false], 0, 0, WIDE, 1_000);
    expect(plan.build).toEqual([0]);
  });

  it('keeps every tier budget inside the candidate ranking window', () => {
    // MAX_BUILD_CANDIDATES bounds the per-frame ranking; if a budget could ever
    // pay for more chunks than that, the extra ones would be silently dropped
    const cheapestChunk = terrainChunkVertexCount(60, 6.5); // low tier's coarsest band
    for (const tier of TIERS) {
      const affordable = TERRAIN_BUILD_VERTEX_BUDGET_BY_TIER[tier] / cheapestChunk;
      expect(affordable).toBeLessThanOrEqual(MAX_BUILD_CANDIDATES);
    }
  });
});

describe('terrainChunkVertexCount', () => {
  it('matches the (n+3)^2 grid the chunk builder walks', () => {
    // interior (n+1)x(n+1) plus a one-vertex skirt ring on each side
    expect(terrainChunkVertexCount(60, 1.2)).toBe(53 * 53); // splat band 0
    expect(terrainChunkVertexCount(60, 2.0)).toBe(33 * 33); // splat band 1
    expect(terrainChunkVertexCount(60, 3.5)).toBe(20 * 20); // splat band 2
    expect(terrainChunkVertexCount(120, 3.5)).toBe(37 * 37); // 2x2 far super-chunk
    expect(terrainChunkVertexCount(60, 3.0)).toBe(23 * 23); // lambert band 0
    expect(terrainChunkVertexCount(60, 6.5)).toBe(12 * 12); // lambert band 2
  });

  it('clamps tiny chunks to the four-division floor the builder uses', () => {
    expect(terrainChunkVertexCount(10, 100)).toBe(7 * 7);
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
  it('gives every tier a per-frame vertex cap, smallest on phones', () => {
    for (const tier of TIERS) {
      expect(terrainBuildBudget(tier)).toBe(TERRAIN_BUILD_VERTEX_BUDGET_BY_TIER[tier]);
      expect(terrainBuildBudget(tier)).toBeGreaterThanOrEqual(1);
    }
    expect(terrainBuildBudget('low')).toBeLessThan(terrainBuildBudget('ultra'));
  });

  it('keeps the phone budget under one dense Lambert chunk plus a cheap one', () => {
    // low runs the Lambert LOD ladder; its densest chunk must be affordable on
    // its own (the one-chunk floor) but two of them must not be
    const dense = terrainChunkVertexCount(60, 3.0);
    expect(terrainBuildBudget('low')).toBeGreaterThanOrEqual(dense);
    expect(terrainBuildBudget('low')).toBeLessThan(dense * 2);
  });

  it('never lets a tier stack more than one dense splat chunk in a frame', () => {
    // the regression the chunk-counted budget shipped: ultra at 4 chunks was up
    // to 4 x 2809 vertices in one frame, a ~57 ms stall
    const dense = terrainChunkVertexCount(60, 1.2);
    for (const tier of ['medium', 'high', 'ultra'] as GfxTier[]) {
      expect(terrainBuildBudget(tier)).toBeLessThan(dense * 2);
    }
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

/**
 * The honesty check. Pins how little residency evicts on the world we actually
 * ship, so nobody reads the 5.4x numbers above as a present-day win, and so a
 * later radius change cannot quietly turn this into a real cull without someone
 * noticing here first.
 */
describe('residency on the world we ship today', () => {
  const cell = (cx: number, cz: number): TerrainChunkFootprint =>
    chunk(-180 + cx * 60 + 30, -180 + cz * 60 + 30);
  const worldToday = Array.from({ length: 6 * 24 }, (_, i) => cell(i % 6, Math.floor(i / 6)));

  it('is a real cull only near the ends of the strip', () => {
    const resident = worldToday.map(() => false);
    const at = (tier: GfxTier, z: number): number =>
      planTerrainResidency(worldToday, resident, 0, z, TERRAIN_RESIDENCY_BY_TIER[tier], 0)
        .desiredResident;
    // spawn, at the south end: measured 78/144 low, 102/144 ultra
    expect(at('low', 0)).toBe(78);
    expect(at('ultra', 0)).toBe(102);
  });

  it('holds essentially the whole strip in the middle, which is the point of the caveat', () => {
    const resident = worldToday.map(() => false);
    const at = (tier: GfxTier, z: number): number =>
      planTerrainResidency(worldToday, resident, 0, z, TERRAIN_RESIDENCY_BY_TIER[tier], 0)
        .desiredResident;
    // our world is only 360 yd wide and 1440 long, so a 560+ yd keep radius
    // covers nearly all of it from the middle: 120/144 on low, 144/144 above
    expect(at('low', 540)).toBe(120);
    expect(at('high', 540)).toBe(144);
    expect(at('ultra', 540)).toBe(144);
  });
});
