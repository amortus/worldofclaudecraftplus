import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  columnBlendAt,
  COLUMN_ZONES,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  worldHalfWidthAt,
  ZONES,
} from '../src/sim/data';
import { borderRidgeContribution, computeBorderEdges, terrainHeight } from '../src/sim/world';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import type { ZoneDef } from '../src/sim/types';

// ---------------------------------------------------------------------------
// Phase 2 of the 2D-world topology: two column zones now sit beside the strip,
// so `terrainHeight` grew a border-edge model, a sideways shape blend and a
// per-row rim. The world the four shipped zones describe must not move.
//
// The oracle is `world_phase2_heightfield.snapshot.json`, generated from the
// tree at commit 1b91a409d (phase 1, world byte-identical to the strip era):
// one 32-bit hash per 20x20yd cell over x [-180, 180) and z [-180, 1260),
// sampling terrainHeight at every integer yard with seed 1337.
//
// THE ONE CORRIDOR THAT MOVES, and why it has to. Opening a walkable border
// means deleting the rim wall that used to stand at |x| = 180 in those rows and
// putting a passable ridge there instead, so the ground within reach of that
// border necessarily changes. The corridor is bounded by three independent
// mechanisms, each asserted analytically below:
//   - the column border ridge   reaches |x| > 144 (COLUMN_RIDGE_SIGMA * 3)
//   - the sideways shape blend  reaches |x| > 150 (columnBlendAt's 30yd window)
//   - the per-row rim           reaches |x| > 150 (its 30yd smoothstep window)
// and all three are inert outside z (-210, 215), the column band's own -30/+35
// window. So: EVERYTHING outside { |x| > 144 AND -210 < z < 215 } is bit-identical.
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
  readFileSync(new URL('./world_phase2_heightfield.snapshot.json', import.meta.url), 'utf8'),
);

// The corridor, in the snapshot's own 20yd cells: a cell is "in" when any part
// of it lies inside the analytic corridor.
const CORRIDOR_ABS_X = 144;
const CORRIDOR_Z_MIN = -210;
const CORRIDOR_Z_MAX = 215;

function cellInCorridor(cx: number, cz: number, cell: number): boolean {
  const maxAbsX = Math.max(Math.abs(cx), Math.abs(cx + cell - 1));
  return maxAbsX > CORRIDOR_ABS_X && cz + cell - 1 > CORRIDOR_Z_MIN && cz < CORRIDOR_Z_MAX;
}

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

describe('phase 2 heightfield: the shipped world outside the border corridor is bit-identical', () => {
  it('samples the whole strip, so the claim covers the four zones end to end', () => {
    expect(Object.keys(SNAP.cells)).toHaveLength(
      ((SNAP.x1 - SNAP.x0) / SNAP.cell) * ((SNAP.z1 - SNAP.z0) / SNAP.cell),
    );
    expect(SNAP.x0).toBe(STRIP_MIN_X);
    expect(SNAP.x1).toBe(STRIP_MAX_X);
  });

  it('every cell outside the corridor hashes exactly as it did before the columns', () => {
    const moved: string[] = [];
    let checked = 0;
    for (const key of Object.keys(SNAP.cells)) {
      const [cx, cz] = key.split(',').map(Number);
      if (cellInCorridor(cx, cz, SNAP.cell)) continue;
      checked++;
      if (cellHash(cx, cz, SNAP.cell, SNAP.seed) !== SNAP.cells[key]) moved.push(key);
    }
    expect(checked).toBeGreaterThan(1100);
    expect(moved).toEqual([]);
  });

  it('the corridor really is only the border, not a quiet reshuffle of the world', () => {
    const inCorridor = Object.keys(SNAP.cells).filter((key) => {
      const [cx, cz] = key.split(',').map(Number);
      return cellInCorridor(cx, cz, SNAP.cell);
    });
    // 4 cell columns (|x| in [140, 180)) by the column band's cell rows.
    expect(inCorridor).toHaveLength(80);
    expect(inCorridor.length).toBeLessThan(Object.keys(SNAP.cells).length * 0.07);
  });
});

describe('phase 2 heightfield: the corridor bound is analytic, not measured', () => {
  const SEED = 1337;
  const EDGES = computeBorderEdges(ZONES);

  it('no vertical (column) border ridge reaches |x| <= 144', () => {
    for (const edge of EDGES) {
      if (edge.kind !== 'v') continue;
      for (let x = -CORRIDOR_ABS_X; x <= CORRIDOR_ABS_X; x += 0.5) {
        for (let z = -200; z <= 1300; z += 25) {
          expect(borderRidgeContribution(edge, x, z, SEED), `v edge at ${x},${z}`).toBe(0);
        }
      }
    }
  });

  it('no horizontal (band) border ridge changes: they keep the classic wall inside the strip', () => {
    // The three shipped band edges are still one unbounded wall over the strip:
    // their end feather is EXACTLY 1 there, and `y * 1 === y`.
    const bandEdges = EDGES.filter((e) => e.kind === 'h');
    expect(bandEdges.map((e) => e.at)).toEqual([180, 540, 900]);
    for (const edge of bandEdges) {
      for (let x = STRIP_MIN_X; x <= STRIP_MAX_X; x += 3) {
        const outside = Math.max(edge.lo - x, x - edge.hi, 0);
        expect(outside, `band edge ${edge.at} feathered at x=${x}`).toBe(0);
      }
    }
  });

  it('the sideways shape blend is exactly +0 for |x| <= 150 and outside the column band', () => {
    expect(COLUMN_ZONES).toHaveLength(2);
    for (const col of COLUMN_ZONES) {
      for (let x = -150; x <= 150; x += 1) {
        for (let z = -200; z <= 1300; z += 25) {
          expect(columnBlendAt(col, x, z), `blend at ${x},${z}`).toBe(0);
        }
      }
      for (const z of [-200, 0, 149, 150, 575, 576, 900, 1300]) {
        for (const x of [-539, -400, -181, 0, 181, 400, 539]) {
          if (z > CORRIDOR_Z_MIN && z < CORRIDOR_Z_MAX) continue;
          expect(columnBlendAt(col, x, z), `blend at ${x},${z}`).toBe(0);
        }
      }
    }
  });

  it('the world rim keeps the strip half-width in every row no column occupies', () => {
    for (let z = -300; z <= 1400; z += 0.5) {
      const half = worldHalfWidthAt(z);
      if (z > CORRIDOR_Z_MIN && z < CORRIDOR_Z_MAX) {
        expect(half).toBeGreaterThanOrEqual(STRIP_MAX_X);
        expect(half).toBeLessThanOrEqual(540);
      } else {
        expect(half, `rim half width at z=${z}`).toBe(STRIP_MAX_X);
      }
    }
    // deep inside the column band the rim is fully out at the column edge
    expect(worldHalfWidthAt(0)).toBe(540);
    // and it never steps: the largest jump over a 1yd stride stays small
    let maxStep = 0;
    for (let z = -220; z <= 230; z += 1) {
      maxStep = Math.max(maxStep, Math.abs(worldHalfWidthAt(z + 1) - worldHalfWidthAt(z)));
    }
    expect(maxStep).toBeLessThan(14);
  });
});

describe('phase 2 border edges', () => {
  it('derives one edge per shared rect boundary of the live world', () => {
    const edges = computeBorderEdges(ZONES);
    const summary = edges.map((e) => `${e.kind}${e.at}`).sort();
    expect(summary).toEqual(['h180', 'h540', 'h900', 'v-180', 'v180']);
  });

  it('opens each column border at the pass its zone declares', () => {
    const edges = computeBorderEdges(ZONES);
    for (const edge of edges.filter((e) => e.kind === 'v')) {
      expect(edge.passAt, `pass of the column edge at x=${edge.at}`).toBe(0);
      expect(edge.sealed).toBe(false);
      expect(edge.fullRow).toBe(false);
      expect(edge.lo).toBe(-180);
      expect(edge.hi).toBe(180);
    }
  });

  it('leaves the three band edges spanning the strip and passing at x = 0', () => {
    for (const edge of computeBorderEdges(ZONES).filter((e) => e.kind === 'h')) {
      expect(edge.passAt).toBe(0);
      expect(edge.lo).toBe(STRIP_MIN_X);
      expect(edge.hi).toBe(STRIP_MAX_X);
      expect(edge.sealed).toBe(false);
    }
  });

  // No shipped zone is sealed. The support exists because a portal-only zone is
  // the next thing the grid needs, so pin its two load-bearing properties on a
  // synthetic pair rather than shipping dead behaviour untested.
  describe('a sealedSouthBorder zone', () => {
    const south: ZoneDef = { ...STRIP_ZONES[0], zMin: 0, zMax: 100 };
    const sealedNorth: ZoneDef = {
      ...STRIP_ZONES[1],
      zMin: 100,
      zMax: 200,
      sealedSouthBorder: true,
    };
    const edges = computeBorderEdges([south, sealedNorth]);

    it('gets one sealed edge whose crest sits inside its own band', () => {
      expect(edges).toHaveLength(1);
      expect(edges[0].sealed).toBe(true);
      expect(edges[0].at).toBeGreaterThan(sealedNorth.zMin); // pushed north, off the neighbour
      expect(edges[0].at).toBe(115);
    });

    it('has NO pass: the wall is full height at every x along it', () => {
      const seed = 99;
      const atCrest = [];
      for (let x = -180; x < 180; x += 5) atCrest.push(borderRidgeContribution(edges[0], x, 115, seed));
      expect(Math.min(...atCrest)).toBeGreaterThan(30);
    });

    it('is steeper than the player climb cap on a straight approach', () => {
      const seed = 99;
      const step = 0.25;
      let steepest = 0;
      for (let z = 100; z <= 130; z += step) {
        const a = borderRidgeContribution(edges[0], 0, z, seed);
        const b = borderRidgeContribution(edges[0], 0, z + step, seed);
        steepest = Math.max(steepest, Math.abs(b - a) / step);
      }
      expect(steepest).toBeGreaterThan(PLAYER_MAX_CLIMB_SLOPE);
    });
  });
});
