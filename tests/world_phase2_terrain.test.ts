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
//
// The z bound is GONE, and that is the whole story of the upstream realm port.
// Phase 2 put columns beside ONE band, so the corridor was also bounded to that
// band's -30/+35 window, z (-210, 215). The Willowfen, Galecrest, Palmreach and
// Evergarden fill both grid columns from the world's south edge to its north
// one, so every row of the strip now has a neighbour across a real border and
// the corridor runs the full length of the map.
//
// So: EVERYTHING at |x| <= 144 is bit-identical, at every z, forever. That is
// still 20 of the strip's 24 cell columns, and it is the promise the four
// shipped bands actually need. The 4 border columns are asserted to be exactly
// the border, analytically, below.
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

function cellInCorridor(cx: number, cell: number): boolean {
  const maxAbsX = Math.max(Math.abs(cx), Math.abs(cx + cell - 1));
  return maxAbsX > CORRIDOR_ABS_X;
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
      if (cellInCorridor(cx, SNAP.cell)) continue;
      checked++;
      if (cellHash(cx, cz, SNAP.cell, SNAP.seed) !== SNAP.cells[key]) moved.push(key);
    }
    // 18 cell columns x 72 rows = 1296, less the 4 border columns (288).
    expect(checked).toBe(1008);
    expect(moved).toEqual([]);
  }, 60_000);

  it('the corridor really is only the border, not a quiet reshuffle of the world', () => {
    const inCorridor = Object.keys(SNAP.cells).filter((key) => {
      const [cx] = key.split(',').map(Number);
      return cellInCorridor(cx, SNAP.cell);
    });
    // 4 of the strip's 24 cell columns (|x| in [140, 180)), now over every row.
    expect(inCorridor).toHaveLength(4 * ((SNAP.z1 - SNAP.z0) / SNAP.cell));
    expect(inCorridor.length).toBeLessThan(Object.keys(SNAP.cells).length * 0.23);
  });
});

describe('phase 2 heightfield: the corridor bound is analytic, not measured', () => {
  const SEED = 1337;
  const EDGES = computeBorderEdges(ZONES);

  it('no vertical (column) border ridge reaches |x| <= 144', () => {
    let worst = 0;
    for (const edge of EDGES) {
      if (edge.kind !== 'v') continue;
      for (let x = -CORRIDOR_ABS_X; x <= CORRIDOR_ABS_X; x += 0.5) {
        for (let z = -200; z <= 1300; z += 25) {
          worst = Math.max(worst, borderRidgeContribution(edge, x, z, SEED));
        }
      }
    }
    expect(worst).toBe(0);
  }, 60_000);

  it('no horizontal (band) border ridge changes: they keep the classic wall inside the strip', () => {
    // The three shipped band edges are still one unbounded wall over the strip:
    // their end feather is EXACTLY 1 there, and `y * 1 === y`.
    const bandEdges = EDGES.filter((e) => e.kind === 'h');
    const stripBands = bandEdges.filter((e) => e.lo === STRIP_MIN_X && e.hi === STRIP_MAX_X);
    expect(stripBands.map((e) => e.at).sort((a, b) => a - b)).toEqual([180, 540, 900]);
    for (const edge of stripBands) {
      for (let x = STRIP_MIN_X; x <= STRIP_MAX_X; x += 3) {
        const outside = Math.max(edge.lo - x, x - edge.hi, 0);
        expect(outside, `band edge ${edge.at} feathered at x=${x}`).toBe(0);
      }
    }
    // Every OTHER horizontal edge belongs to a grid column. None of them may
    // put a single yard of ridge inside the strip's interior: the ones on the
    // same line as a strip band butt into it and are cut square (cutLo/cutHi),
    // and the ones on their own line (z 700, where the strip has no boundary)
    // may only feather the 24yd RIDGE_END_FEATHER, which stays in the corridor.
    for (const edge of bandEdges) {
      if (stripBands.includes(edge)) continue;
      for (let x = -CORRIDOR_ABS_X; x <= CORRIDOR_ABS_X; x += 1) {
        expect(
          borderRidgeContribution(edge, x, edge.at, SEED),
          `column band edge ${edge.at} [${edge.lo},${edge.hi}) reached x=${x}`,
        ).toBe(0);
      }
    }
  });

  it('the sideways shape blend is exactly +0 for |x| <= 150, at every z', () => {
    expect(COLUMN_ZONES).toHaveLength(6);
    for (const col of COLUMN_ZONES) {
      for (let x = -150; x <= 150; x += 1) {
        for (let z = -200; z <= 1300; z += 25) {
          expect(columnBlendAt(col, x, z), `blend at ${x},${z}`).toBe(0);
        }
      }
      // and one column never leaks across the strip into the other side
      const east = (col.xMin ?? 0) >= STRIP_MAX_X;
      for (let z = -200; z <= 1300; z += 25) {
        expect(columnBlendAt(col, east ? -400 : 400, z), `${col.id} crossed the strip`).toBe(0);
      }
    }
  });

  it('the world rim is now out at the column edge in every row, and never steps', () => {
    // Phase 2 had columns beside one band only, so the rim came back to the
    // strip half width everywhere else. The realm ring fills both columns from
    // the south edge to the north one, so the rim is out at 540 across the
    // whole map, easing only past the last band's north edge.
    // Where two STACKED columns hand over (z 180 and z 700), each one's row
    // weight is mid-ease, and `worldHalfWidthAt` composes them as a sequential
    // lerp rather than a max, so the rim notches inward. Measured worst case:
    // 517.5 at z 182.5, a 22yd notch in a 540yd half width, over a ~60yd band.
    // It is cosmetic (the notch is outside every authored POI, camp and prop in
    // those rows, the nearest being the Drowned Mill at x 480) and it is
    // asserted here so it cannot quietly get worse.
    for (let z = -145; z <= 1230; z += 0.5) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBeGreaterThan(517);
    }
    // ...and away from the two hand-over seams it really is fully out
    for (const z of [-100, 0, 100, 300, 400, 500, 600, 800, 900, 1000, 1100, 1200]) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBe(540);
    }
    // it never comes back inside the strip anywhere the world exists
    for (let z = -180; z <= 1260; z += 0.5) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBeGreaterThan(STRIP_MAX_X);
    }
    for (const z of [-300, 1400]) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBe(STRIP_MAX_X);
    }
    // and it never steps: the largest jump over a 1yd stride stays small
    let maxStep = 0;
    for (let z = -300; z <= 1400; z += 1) {
      maxStep = Math.max(maxStep, Math.abs(worldHalfWidthAt(z + 1) - worldHalfWidthAt(z)));
    }
    expect(maxStep).toBeLessThan(14);
  });
});

describe('phase 2 border edges', () => {
  it('derives one edge per shared rect boundary of the live world', () => {
    const edges = computeBorderEdges(ZONES);
    const summary = [...new Set(edges.map((e) => `${e.kind}${e.at}`))].sort();
    // Three band lines across the strip, one band line per grid column at
    // z 700 (where the column zones meet each other), and one vertical wall
    // down each side of the strip.
    expect(summary).toEqual(['h180', 'h540', 'h700', 'h900', 'v-180', 'v180']);
    // Every vertical wall is split into one edge per band it passes, and those
    // pieces tile their line with no gap and no overlap.
    for (const at of [-180, 180]) {
      const spans = edges
        .filter((e) => e.kind === 'v' && e.at === at)
        .sort((a, b) => a.lo - b.lo);
      expect(spans[0].lo).toBe(-180);
      expect(spans[spans.length - 1].hi).toBe(1260);
      for (let i = 1; i < spans.length; i++) expect(spans[i].lo).toBe(spans[i - 1].hi);
    }
  });

  it('cuts every colinear edge square where it butts into its neighbour', () => {
    // Two edges on one line are at FULL strength at the coordinate they share.
    // Feathering both would double the ridge to 44yd there and push each one's
    // tail 24yd into the neighbour's zone; cutting square is seamless because
    // the height, profile and crest noise are functions of the line and the
    // along coordinate only. The span is half open, so exactly one edge owns
    // the joint.
    const edges = computeBorderEdges(ZONES);
    const seed = 1337;
    let joints = 0;
    for (const edge of edges) {
      for (const other of edges) {
        if (other === edge || other.kind !== edge.kind || other.at !== edge.at) continue;
        if (other.hi !== edge.lo) continue;
        joints++;
        expect(edge.cutLo, `${edge.kind}${edge.at} lo joint`).toBe(true);
        expect(other.cutHi, `${other.kind}${other.at} hi joint`).toBe(true);
        // Owned by exactly ONE side at the joint (this is the doubling bug),
        // and continuous across it: the crest noise makes the wall rough at
        // roughly a yard per yard, so the joint may not add a step of its own.
        const pair = (along: number): [number, number] =>
          edge.kind === 'h'
            ? [
                borderRidgeContribution(edge, along, edge.at, seed),
                borderRidgeContribution(other, along, edge.at, seed),
              ]
            : [
                borderRidgeContribution(edge, edge.at, along, seed),
                borderRidgeContribution(other, edge.at, along, seed),
              ];
        const sum = (along: number): number => pair(along).reduce((a, b) => a + b, 0);
        const [a, b] = pair(edge.lo);
        expect(a * b, `${edge.kind}${edge.at} doubled at the joint`).toBe(0);
        expect(Math.abs(sum(edge.lo) - sum(edge.lo - 0.5))).toBeLessThan(1.5);
        expect(Math.abs(sum(edge.lo) - sum(edge.lo + 0.5))).toBeLessThan(1.5);
      }
    }
    expect(joints).toBeGreaterThan(4);
  });

  it('opens each column border at the pass its zone declares', () => {
    const edges = computeBorderEdges(ZONES);
    for (const edge of edges.filter((e) => e.kind === 'v')) {
      expect(edge.sealed).toBe(false);
      expect(edge.fullRow).toBe(false);
      expect(Math.abs(edge.at)).toBe(STRIP_MAX_X);
    }
    // Every pass a zone declares is opened on the edge that carries it.
    const passes = edges.filter((e) => e.kind === 'v').map((e) => `${e.at}@${e.passAt}`);
    expect([...new Set(passes)].sort()).toEqual([
      '-180@0', // the Grimhold Stair
      '-180@440', // the Mirewalk, into the Willowfen
      '-180@820', // the Sunway, into the Palmreach
      '180@0', // the Alderfen Crossing
      '180@440', // the Windway, into the Galecrest
      '180@800', // the Gardenwalk, into the Evergarden
    ]);
  });

  it('leaves the three band edges spanning the strip and passing at x = 0', () => {
    const strip = computeBorderEdges(ZONES).filter(
      (e) => e.kind === 'h' && e.lo === STRIP_MIN_X && e.hi === STRIP_MAX_X,
    );
    expect(strip).toHaveLength(3);
    for (const edge of strip) {
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
