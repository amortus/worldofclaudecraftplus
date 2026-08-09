import { describe, expect, it } from 'vitest';
import {
  STRIP_MAX_X,
  STRIP_MIN_X,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  WORLD_SIZE,
  ZONES,
  zoneAt,
} from '../src/sim/data';
import { zoneBiomeAt } from '../src/sim/world';
import type { BiomeId, ZoneDef } from '../src/sim/types';

// ---------------------------------------------------------------------------
// Phase 1 of the 2D-world topology: `zoneAt`/`zoneBiomeAt` grew an x argument
// and `ZoneDef` grew optional x bounds, but the world they describe must be
// byte-identical. These are the ORIGINAL 1D implementations, copied verbatim
// from the pre-change `src/sim/data.ts` and `src/sim/world.ts`. They are the
// oracle: every sample of the new 2D lookup must agree with them.
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
  for (const zone of ZONES) {
    if (z < zone.zMax) return zone;
  }
  return ZONES[ZONES.length - 1];
}

function zoneBiomeAtOld(z: number): BiomeId {
  for (const zone of ZONES) {
    if (z < zone.zMax) return zone.biome;
  }
  return ZONES[ZONES.length - 1].biome;
}

// x sweep: well past both strip edges on each side, so the far-east instance
// plane (dungeons/arena/delves/rifts, whose x the callers now thread through)
// is covered too. z sweep: 200yd of margin past both world ends, where the old
// lookup clamped.
const X_SAMPLES = (() => {
  const out: number[] = [];
  for (let x = -600; x <= 600; x += 7.5) out.push(x);
  // the exact strip edges and the instance-plane x values callers pass
  out.push(STRIP_MIN_X, STRIP_MAX_X, STRIP_MIN_X - 0.001, STRIP_MAX_X - 0.001, 0, 600, 6000, 12_000);
  return out;
})();

describe('world topology: the 2D lookup is a no-op over the shipped world', () => {
  it('ships four zones, none of which declares an x range', () => {
    expect(ZONES).toHaveLength(4);
    for (const zone of ZONES) {
      expect(zone.xMin, `${zone.id}.xMin`).toBeUndefined();
      expect(zone.xMax, `${zone.id}.xMax`).toBeUndefined();
    }
  });

  it('leaves the new ZoneDef fields unset, so no zone changes behaviour', () => {
    for (const zone of ZONES) {
      expect(zone.eastPassZ, `${zone.id}.eastPassZ`).toBeUndefined();
      expect(zone.westPassZ, `${zone.id}.westPassZ`).toBeUndefined();
      expect(zone.southPassX, `${zone.id}.southPassX`).toBeUndefined();
      expect(zone.sealedSouthBorder, `${zone.id}.sealedSouthBorder`).toBeUndefined();
      expect(zone.trashRespawnSeconds, `${zone.id}.trashRespawnSeconds`).toBeUndefined();
    }
  });

  it('keeps the world bounds exactly where they were', () => {
    expect(WORLD_SIZE).toBe(360);
    expect(STRIP_MIN_X).toBe(-180);
    expect(STRIP_MAX_X).toBe(180);
    // Derived from the zones now; with every zone on the strip they must still
    // be the strip's own edges, or something already moved.
    expect(WORLD_MIN_X).toBe(-180);
    expect(WORLD_MAX_X).toBe(180);
    expect(WORLD_MIN_Z).toBe(-180);
    expect(WORLD_MAX_Z).toBe(1260);
  });

  it('tiles the z axis contiguously, which is what makes the fallback exact', () => {
    for (let i = 1; i < ZONES.length; i++) {
      expect(ZONES[i].zMin, `${ZONES[i].id}.zMin`).toBe(ZONES[i - 1].zMax);
    }
  });

  it('zoneAt(x, z).id === zoneAtOld(z).id over a dense grid of the whole world', () => {
    let samples = 0;
    for (const x of X_SAMPLES) {
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
    for (const x of X_SAMPLES) {
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
    for (const zone of ZONES) edges.push(zone.zMin, zone.zMax);
    const deltas = [-1, -0.5, -1e-9, 0, 1e-9, 0.5, 1];
    for (const x of [-180, -179.999, -90, 0, 90, 179.999, 180, 400]) {
      for (const edge of edges) {
        for (const d of deltas) {
          const z = edge + d;
          expect(zoneAt(x, z).id, `zoneAt(${x}, ${z})`).toBe(zoneAtOld(z).id);
          expect(zoneBiomeAt(x, z), `zoneBiomeAt(${x}, ${z})`).toBe(zoneBiomeAtOld(z));
        }
      }
    }
  });

  it('is x-independent today: every x answers the same zone for a given z', () => {
    for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 1.5) {
      const ref = zoneAt(0, z);
      for (const x of X_SAMPLES) {
        expect(zoneAt(x, z), `zoneAt(${x}, ${z})`).toBe(ref);
      }
    }
  });

  it('zoneBiomeAt delegates to zoneAt, so the two can never disagree', () => {
    for (const x of [-400, -180, 0, 180, 400]) {
      for (let z = WORLD_MIN_Z - 50; z <= WORLD_MAX_Z + 50; z += 3) {
        expect(zoneBiomeAt(x, z)).toBe(zoneAt(x, z).biome);
      }
    }
  });
});
