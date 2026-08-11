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
// THE ONE BAND THAT MOVES, and why it has to. The snapshot was taken while the
// Ashen Wastes held the strip's z 900..1260 rows. Full map parity RETIRED that
// zone (see the PARKED banner in sim/data.ts) and gave the band to upstream's
// Veiled Hollow, which is a different biome with a different shape, different
// camps to flatten, and a different north rim (the strip now runs on to 1960
// instead of ending at 1260). Every yard of that band therefore legitimately
// changed, and it is excluded here by rect, exactly the way a cell near a zone
// that did not exist at capture time is excluded in
// tests/biomes_heightfield.test.ts. The snapshot is NOT regenerated: it is the
// oracle proving the ORIGINAL world never moved, and regenerating it would
// destroy the proof rather than extend it.
//
// So: EVERYTHING at |x| <= 144 and south of the retired band is bit-identical,
// at every z, forever. That is the promise the three original bands actually
// need. The 4 border columns are asserted to be exactly the border,
// analytically, below.
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

// Zones that EXISTED when the snapshot was taken and do not exist now. The
// corridor rule above only knows about ground a zone was added NEXT TO; it has
// no notion of ground a zone was REMOVED from, and removing one moves the
// heightfield exactly as adding one does (biome shape, camp flattening, border
// ridges, the rim). So the retired rects are excluded by name, with the same
// reach an added zone gets in tests/biomes_heightfield.test.ts.
//
//   ashen_wastes       RETIRED, its strip band handed to the Veiled Hollow
//   alderfen_shallows  DELETED, an invented column replaced by farshore_isle
//   grimhold_crags     DELETED, an invented column with no upstream mirror
//
// Only the Ashen Wastes' rect lies inside this snapshot's strip; the other two
// are listed because they are the same class of change and their 60yd reach
// does clip the strip's two outermost non-corridor cell columns.
const RETIRED_RECTS = [
  { id: 'ashen_wastes', x0: -180, x1: 180, z0: 900, z1: 1260 },
  { id: 'alderfen_shallows', x0: 180, x1: 540, z0: -180, z1: 180 },
  { id: 'grimhold_crags', x0: -540, x1: -180, z0: -180, z1: 180 },
] as const;

// How far a retired zone can reach OUTSIDE its own rect: the widest mechanism
// is the horizontal border ridge along a shared band line, a gaussian of
// RIDGE_SIGMA 18 evaluated out to 3 sigma. 60 covers that, the 36yd column
// ridge, the 35yd sideways shape blend and the 30yd rim, with margin.
const RETIRED_REACH = 60;

function cellNearRetired(cx: number, cz: number, cell: number): boolean {
  for (const r of RETIRED_RECTS) {
    if (
      cx + cell > r.x0 - RETIRED_REACH &&
      cx < r.x1 + RETIRED_REACH &&
      cz + cell > r.z0 - RETIRED_REACH &&
      cz < r.z1 + RETIRED_REACH
    ) {
      return true;
    }
  }
  return false;
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
      if (cellNearRetired(cx, cz, SNAP.cell)) continue;
      checked++;
      if (cellHash(cx, cz, SNAP.cell, SNAP.seed) !== SNAP.cells[key]) moved.push(key);
    }
    // The snapshot is 18 cell columns x 72 rows = 1296. The 4 border columns
    // take 288 of them, which left 1008 while the Ashen Wastes still held the
    // strip's northern band. The retired rects take 336 more: the Ashen
    // Wastes' own band plus its 60yd reach is 21 of the 72 rows across all 14
    // remaining columns (294), and the two deleted columns' reach clips one
    // non-corridor cell column each over 21 rows (42). 1008 - 336 = 672.
    //
    // What is still checked is the whole strip south of z 840 plus its two
    // northern-most rows, i.e. the Eastbrook Vale, the Mirefen Marsh and the
    // Thornpeak Heights end to end, minus the 4 border columns. `moved` is the
    // assertion that matters: not one of those 672 cells changed.
    expect(checked).toBe(672);
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
        for (let z = -250; z <= 2500; z += 25) {
          worst = Math.max(worst, borderRidgeContribution(edge, x, z, SEED));
        }
      }
    }
    expect(worst).toBe(0);
  }, 60_000);

  it('no horizontal (band) border ridge changes: they keep the classic wall inside the strip', () => {
    // Every band edge that spans the strip is one unbounded wall over it: its
    // end feather is EXACTLY 1 there, and `y * 1 === y`. There are five strip
    // bands now (the Veiled Hollow and the Frostveil Reach were ported in), so
    // the lines are derived from the live band stack rather than listed: one
    // per boundary between consecutive strip bands.
    const bandEdges = EDGES.filter((e) => e.kind === 'h');
    const stripBands = bandEdges.filter((e) => e.lo === STRIP_MIN_X && e.hi === STRIP_MAX_X);
    const bandLines = STRIP_ZONES.slice(0, -1).map((z) => z.zMax);
    expect(bandLines).toEqual([180, 540, 900, 1440]);
    expect(stripBands.map((e) => e.at).sort((a, b) => a - b)).toEqual(bandLines);
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

  // Nine columns over a world that now runs z -180..2420, so the leaks are
  // COLLECTED and asserted once: one `expect` per sample was most of the
  // runtime and pushed this past the default 5s timeout.
  it('the sideways shape blend is exactly +0 for |x| <= 150, at every z', () => {
    expect(COLUMN_ZONES).toHaveLength(9);
    const leaks: string[] = [];
    for (const col of COLUMN_ZONES) {
      for (let x = -150; x <= 150; x += 1) {
        for (let z = -250; z <= 2500; z += 25) {
          const t = columnBlendAt(col, x, z);
          if (t !== 0) leaks.push(`${col.id} blend ${t} at ${x},${z}`);
        }
      }
      // and one column never leaks across the strip into the other side
      const east = (col.xMin ?? 0) >= STRIP_MAX_X;
      for (let z = -250; z <= 2500; z += 25) {
        const t = columnBlendAt(col, east ? -400 : 400, z);
        if (t !== 0) leaks.push(`${col.id} crossed the strip: ${t} at z=${z}`);
      }
    }
    expect(leaks.slice(0, 10)).toEqual([]);
  }, 60_000);

  it('puts the world rim out at the column edge in every row that HAS a column, per side', () => {
    // Phase 2 had columns beside one band only, so the rim came back to the
    // strip half width everywhere else, and the grid was row-symmetric so one
    // half width described both sides. Upstream's grid is neither: the +x
    // column runs the world's whole z extent (-180 to 2420) while the -x one
    // covers only 180 to 2380, so `worldHalfWidthAt` is PER SIDE and the empty
    // side of a one-sided row is rimmed at the strip's own edge.
    //
    // Where two STACKED columns hand over (z 180, 700, 1260, 1820), each one's
    // row weight is mid-ease and `worldHalfWidthAt` composes them as a
    // sequential lerp rather than a max, so the rim notches inward. Measured
    // worst case: exactly 450 at the hand-over midpoints, a 90yd notch in a
    // 540yd half width over a ~60yd band. It is cosmetic (the notch is outside
    // every authored POI, camp and prop in those rows) and it is asserted here
    // so it cannot quietly get worse.
    // The z rows each side's column actually covers, inset past the ease-in and
    // ease-out windows at its two ends.
    const WEST_COVERED = [215, 2350]; // the -x column: Willowfen 180 through Amberfall 2380
    const EAST_COVERED = [-145, 2390]; // the +x column: Farshore -180 through Drakelands 2420
    for (const side of [-1, 1] as const) {
      const [z0, z1] = side < 0 ? WEST_COVERED : EAST_COVERED;
      for (let z = z0; z <= z1; z += 0.5) {
        expect(worldHalfWidthAt(z, side), `rim half width at z=${z} side=${side}`).toBeGreaterThanOrEqual(450);
      }
    }
    // ...and away from the hand-over seams it really is fully out, both sides
    for (const z of [-100, 0, 100, 300, 400, 500, 600, 800, 900, 1000, 1100, 1500, 1600, 1700, 2000, 2100, 2200, 2300]) {
      if (z >= WEST_COVERED[0] && z <= WEST_COVERED[1]) {
        expect(worldHalfWidthAt(z, -1), `rim half width at z=${z} side=-1`).toBe(540);
      }
      expect(worldHalfWidthAt(z, +1), `rim half width at z=${z} side=+1`).toBe(540);
    }
    // The default `x = 0` keeps the OLD answer, the widest column in the row
    // whichever side it is on, so every caller that predates the per-side split
    // reads exactly what it did. It never comes back inside the strip anywhere
    // the world exists, and it is exactly the strip half width outside it.
    for (let z = -180; z <= 2419; z += 0.5) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBeGreaterThan(STRIP_MAX_X);
    }
    for (const z of [-300, 2500]) {
      expect(worldHalfWidthAt(z), `rim half width at z=${z}`).toBe(STRIP_MAX_X);
    }
    // and it never steps, on either side: the largest jump over a 1yd stride
    // stays small (measured worst 8.31, at the Farshore/Willowfen hand-over).
    let maxStep = 0;
    for (const side of [-1, 0, 1]) {
      for (let z = -300; z <= 2500; z += 1) {
        maxStep = Math.max(
          maxStep,
          Math.abs(worldHalfWidthAt(z + 1, side) - worldHalfWidthAt(z, side)),
        );
      }
    }
    expect(maxStep).toBeLessThan(14);
  });
});

describe('phase 2 border edges', () => {
  it('derives one edge per shared rect boundary of the live world', () => {
    const edges = computeBorderEdges(ZONES);
    const summary = [...new Set(edges.map((e) => `${e.kind}${e.at}`))].sort();
    // Re-derived for the 14-zone grid. Four band lines across the strip
    // (z 180/540/900/1440, one per boundary of the five strip bands), three
    // band lines where the column zones meet each other on their own lines
    // (z 700/1260/1820), and one vertical wall down each side of the strip.
    // The columns' z 180 and z 1820 boundaries fall on strip band lines and so
    // share those, which is why there are seven h lines and not nine.
    expect(summary).toEqual([
      'h1260',
      'h1440',
      'h180',
      'h1820',
      'h540',
      'h700',
      'h900',
      'v-180',
      'v180',
    ]);
    // Every vertical wall is split into one edge per band it passes, and those
    // pieces tile their line with no gap and no overlap. Where each line STARTS
    // and STOPS is the ragged part of upstream's grid, so it is derived: a
    // vertical edge only exists where a column and the strip share a z row, so
    // the line runs from the first z the column occupies to the strip's own
    // north end (the columns run further north than the strip, and there is
    // nothing to share a border with up there).
    const stripNorth = STRIP_ZONES[STRIP_ZONES.length - 1].zMax;
    expect(stripNorth).toBe(1960);
    for (const [at, wantLo] of [
      [-180, 180], // the -x column starts at the Willowfen; the vale's row is empty
      [180, -180], // the +x column starts at the Farshore, on the world's south edge
    ] as const) {
      const spans = edges
        .filter((e) => e.kind === 'v' && e.at === at)
        .sort((a, b) => a.lo - b.lo);
      const column = COLUMN_ZONES.filter((c) => (at < 0 ? c.xMax === at : c.xMin === at));
      expect(spans[0].lo, `v${at} starts`).toBe(Math.min(...column.map((c) => c.zMin)));
      expect(spans[0].lo, `v${at} starts`).toBe(wantLo);
      expect(spans[spans.length - 1].hi, `v${at} stops at the strip north end`).toBe(stripNorth);
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
    // Every pass a zone declares is opened on the edge that carries it,
    // re-derived for the 14-zone grid. A column border that crosses two strip
    // bands is two edges carrying the SAME pass coordinate (the piece that
    // contains it opens; the other is solid wall), and a border row where
    // neither side declares a pass falls back to the span midpoint.
    const passes = edges.filter((e) => e.kind === 'v').map((e) => `${e.at}@${e.passAt}`);
    expect([...new Set(passes)].sort()).toEqual([
      '-180@1350', // Nightbloom row, midpoint fallback: upstream declares none
      '-180@1630', // Amberfall/Frostveil row, midpoint fallback
      '-180@1890', // the Amberfall's own eastPassZ
      '-180@440', // the Mirewalk, into the Willowfen
      '-180@820', // the Sunway, into the Palmreach
      '180@0', // the Farshore crossing, midpoint of the vale's row
      '180@1350', // Wraithwood row, midpoint fallback
      '180@1630', // Drakelands/Frostveil row, midpoint fallback
      '180@1890', // the Drakelands' own westPassZ
      '180@440', // the Windway, into the Galecrest
      '180@800', // the Gardenwalk, into the Evergarden
    ]);
    // ...and every column really has a way in: at least one of its
    // strip-facing edges carries its pass INSIDE that edge's own span.
    for (const col of COLUMN_ZONES) {
      const facingX = (col.xMin ?? 0) >= STRIP_MAX_X ? col.xMin! : col.xMax!;
      const mine = edges.filter(
        (e) => e.kind === 'v' && e.at === facingX && e.lo < col.zMax && e.hi > col.zMin,
      );
      expect(
        mine.some((e) => e.passAt >= e.lo && e.passAt <= e.hi),
        `${col.id} has an opening onto the strip`,
      ).toBe(true);
    }
  });

  it('leaves every band edge spanning the strip, each opened at its own pass', () => {
    const strip = computeBorderEdges(ZONES).filter(
      (e) => e.kind === 'h' && e.lo === STRIP_MIN_X && e.hi === STRIP_MAX_X,
    );
    // One per boundary between consecutive strip bands: four now that the
    // Veiled Hollow and the Frostveil Reach are stacked north of the Thornpeak.
    expect(strip).toHaveLength(STRIP_ZONES.length - 1);
    for (const edge of strip) {
      // The pass is the NORTH band's own southPassX, or x = 0 when it declares
      // none, and it always lands inside the strip so the wall really opens.
      const north = STRIP_ZONES.find((z) => z.zMin === edge.at);
      expect(north, `a strip band starts at z=${edge.at}`).toBeTruthy();
      expect(edge.passAt, `band edge ${edge.at} pass`).toBe(north!.southPassX ?? 0);
      expect(edge.passAt).toBeGreaterThanOrEqual(STRIP_MIN_X);
      expect(edge.passAt).toBeLessThanOrEqual(STRIP_MAX_X);
      expect(edge.lo).toBe(STRIP_MIN_X);
      expect(edge.hi).toBe(STRIP_MAX_X);
      expect(edge.sealed).toBe(false);
    }
    // The three ORIGINAL band walls still pass at exactly x = 0: no shipped
    // band moved its road. Only the ported Frostveil Reach carries its own
    // (upstream's southPassX 44).
    for (const at of [180, 540, 900]) {
      expect(strip.find((e) => e.at === at)!.passAt, `band edge ${at}`).toBe(0);
    }
    expect(strip.find((e) => e.at === 1440)!.passAt).toBe(44);
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
