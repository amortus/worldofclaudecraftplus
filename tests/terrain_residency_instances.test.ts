import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Same stubs as the rebuild suite: no network, no canvas, no GPU. This suite is
// about WHERE the camera is, not about what a chunk looks like.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));
vi.mock('../src/render/textures', () => {
  const texture = (): THREE.DataTexture =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  return {
    groundDetailTexture: vi.fn(texture),
    groundSplatMaps: vi.fn(() => ({})),
    macroNoiseTexture: vi.fn(texture),
  };
});

const { buildTerrain } = await import('../src/render/terrain');
const { DUNGEON_X_THRESHOLD, DUNGEON_LIST, INSTANCE_SLOT_COUNT, instanceOrigin } = await import(
  '../src/sim/data'
);

const SEED = 20061;
const HUB = { x: 0, z: 0 };
/** Interior fog never reaches past far = 90, so nothing overworld is drawn inside. */
const INTERIOR_FOG_FAR = 90;

type View = ReturnType<typeof buildTerrain>;

function converge(view: View, x: number, z: number, fogFar = 1e9): void {
  for (let frame = 0; frame < 600; frame++) {
    view.update(x, z, fogFar);
    if (view.residency().pending === 0) return;
  }
  throw new Error('terrain residency never converged');
}

/**
 * Every place the game teleports a player to on the instance plane. There is no
 * fade or loading overlay on these transitions, so anything residency tears down
 * on the way in, the player watches rebuild on the way out.
 */
function instanceSpots(): { name: string; x: number; z: number }[] {
  const spots: { name: string; x: number; z: number }[] = [];
  for (const dungeon of DUNGEON_LIST) {
    for (const slot of [0, INSTANCE_SLOT_COUNT - 1]) {
      const origin = instanceOrigin(dungeon.index, slot);
      spots.push({ name: `${dungeon.id}:${slot}`, x: origin.x, z: origin.z });
    }
  }
  return spots;
}

describe('residency across an instance round trip', () => {
  it('would evict the entire overworld at every instance origin, on every tier', async () => {
    // The premise of the freeze, stated as the counterfactual it prevents.
    // Instance origins are (900 + index*600, -1250 + slot*500), so even the
    // nearest one is over 1200 yd from the closest terrain chunk.
    const { TERRAIN_RESIDENCY_BY_TIER } = await import('../src/render/gfx');
    const { planTerrainResidency } = await import('../src/render/terrain_residency');
    const world = Array.from({ length: 6 * 24 }, (_, i) => ({
      centerX: -180 + (i % 6) * 60 + 30,
      centerZ: -180 + Math.floor(i / 6) * 60 + 30,
      half: 30,
      cost: 400,
    }));
    const allResident = world.map(() => true);
    for (const spot of instanceSpots()) {
      expect(spot.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
      // the phone tier, which is the one that matters here, loses the WHOLE
      // overworld at every single instance origin
      const low = planTerrainResidency(
        world,
        allResident,
        spot.x,
        spot.z,
        TERRAIN_RESIDENCY_BY_TIER.low,
        0,
      );
      expect(low.desiredResident).toBe(0);
      expect(low.release).toHaveLength(world.length);
      // and no tier keeps even half of it: the widest release radius (ultra, 940)
      // still cannot reach past the instance plane's x offset of 900+
      for (const radii of Object.values(TERRAIN_RESIDENCY_BY_TIER)) {
        const plan = planTerrainResidency(world, allResident, spot.x, spot.z, radii, 0);
        expect(plan.release.length).toBeGreaterThanOrEqual(world.length / 2);
      }
    }
    // and the very first dungeon slot, the one a player reaches first, takes all
    // 144 down on every tier
    const first = instanceOrigin(0, 0);
    for (const radii of Object.values(TERRAIN_RESIDENCY_BY_TIER)) {
      const plan = planTerrainResidency(world, allResident, first.x, first.z, radii, 0);
      expect(plan.desiredResident).toBe(0);
      expect(plan.release).toHaveLength(144);
    }
  });

  it('rebuilds nothing after entering and leaving an instance', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB.x, HUB.z);
    const settled = view.residency();
    expect(settled.resident).toBeGreaterThan(20);

    for (const spot of instanceSpots()) {
      // walk in: interior fog, camera hundreds of yards off the terrain grid
      for (let frame = 0; frame < 120; frame++) view.update(spot.x, spot.z, INTERIOR_FOG_FAR);
      expect(view.residency().frozen).toBe(true);
      // and walk back out
      for (let frame = 0; frame < 120; frame++) view.update(HUB.x, HUB.z, 470);
    }

    const after = view.residency();
    expect(after.frozen).toBe(false);
    expect(after.resident).toBe(settled.resident);
    // the whole point: not one chunk was released, so not one had to be remeshed
    expect(after.released).toBe(settled.released);
    expect(after.built).toBe(settled.built);
    expect(after.pending).toBe(0);
  });

  it('still culls the frozen overworld to nothing while inside', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB.x, HUB.z);
    const spot = instanceSpots()[0];

    view.update(spot.x, spot.z, INTERIOR_FOG_FAR);
    // eviction would have bought nothing here: interior fog already makes every
    // overworld chunk free to draw
    expect(view.group.children.length).toBeGreaterThan(20);
    expect(view.group.children.some((c) => c.visible)).toBe(false);
  });

  it('resumes normal planning the moment the camera is back on the overworld', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB.x, HUB.z);
    const atHub = view.residency().resident;

    view.update(instanceSpots()[0].x, instanceSpots()[0].z, INTERIOR_FOG_FAR);
    // a real walk to the far end of the strip must still evict, freeze or no freeze
    converge(view, 0, 1200);
    expect(view.residency().frozen).toBe(false);
    expect(view.residency().released).toBeGreaterThan(0);
    expect(view.residency().resident).toBeLessThan(view.residency().total);

    converge(view, HUB.x, HUB.z);
    expect(view.residency().resident).toBeGreaterThanOrEqual(atHub);
  });
});

describe('replanning is skipped when nothing can change', () => {
  it('does no residency work while the camera sits still and converged', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB.x, HUB.z);
    const before = view.residency();

    // 300 frames of standing perfectly still
    for (let frame = 0; frame < 300; frame++) view.update(HUB.x, HUB.z, 470);
    const after = view.residency();
    expect(after.built).toBe(before.built);
    expect(after.released).toBe(before.released);
    expect(after.resident).toBe(before.resident);
  });

  it('picks planning back up as soon as the camera really moves', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB.x, HUB.z);
    const before = view.residency().built;

    // a sub-epsilon nudge must not replan, a real walk must
    view.update(HUB.x + 0.5, HUB.z, 470);
    expect(view.residency().built).toBe(before);
    converge(view, 0, 600);
    expect(view.residency().built).toBeGreaterThan(before);
  });
});
