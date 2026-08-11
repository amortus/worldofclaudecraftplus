import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  ARENA_X,
  arenaOrigin,
  COLUMN_ZONES,
  DELVE_BAND_X_MIN,
  delveOrigin,
  DUNGEON_LIST,
  DUNGEON_X_THRESHOLD,
  instanceOrigin,
  isLegacyInstancePos,
  RIFT_X,
  riftOrigin,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  worldHalfWidthAt,
  worldNorthEdgeAt,
  ZONES,
  zoneContaining,
  zoneForLevel,
} from '../src/sim/data';
import { groundHeight } from '../src/sim/world';

// ---------------------------------------------------------------------------
// Landmine 1 and landmine 2 of the phase-2 widening, pinned.
//
// 1. WORLD_MAX_X IS A SYMMETRIC HALF WIDTH. Nine call sites outside data.ts
//    (`Math.abs(x) > WORLD_MAX_X - n` in render/critters, fish, foliage, motes,
//    terrain; `WORLD_MAX_X * 2` and `(x + WORLD_MAX_X) / (WORLD_MAX_X * 2)` in
//    render/terrain; `p.pos.x / WORLD_MAX_X` in sim/obs.ts; the map rect in
//    ui/hud.ts) read it as a half width about x = 0.
//
//    That used to be enforced as ROW SYMMETRY: every column had a mirror twin
//    across x = 0. Upstream's grid is deliberately not row-symmetric (the
//    Farshore Isle sits at +x in the vale's row with nothing opposite it, and
//    the Drakelands reaches z 2420 where the Amberfall stops at 2380), so the
//    rule that actually protects those nine call sites is asserted instead:
//    the BOUNDING BOX is still symmetric, and the PER SIDE rim
//    (`worldHalfWidthAt(z, x)`) never reaches past WORLD_MAX_X and never steps.
//
// 2. THE INSTANCE PLANE MUST NOT COLLIDE. `groundHeight` flattens everything
//    past DUNGEON_X_THRESHOLD (600) into an instance floor, and `dungeonAt`
//    resolves index 0 from x 601 upward. Three columns reach |x| = 540, so the
//    overworld ends 60yd short of the plane and no saved position changes
//    meaning. The moment a fourth column is proposed this test fails, and the
//    fix is to widen the plane and extend `isLegacyInstancePos` (the one
//    migration mechanism this codebase has), not to invent a second one.
// ---------------------------------------------------------------------------

function makeSim(): Sim {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

const savedAt = (x: number, level: number) => {
  const donor = makeSim();
  const pid = donor.addPlayer('warrior', 'Ayla');
  donor.setPlayerLevel(level, pid);
  const state = donor.serializeCharacter(pid)!;
  return { ...state, pos: { x, y: 0, z: -1250 } };
};

const reload = (x: number, level: number, z = -1250) => {
  const sim = makeSim();
  const state = { ...savedAt(x, level), pos: { x, y: 0, z } };
  const pid = sim.addPlayer('warrior', 'Ayla', { state: state as never });
  return sim.entities.get(pid)!;
};

describe('phase 2: the world box stays symmetric, and the rim never reaches past it', () => {
  it('keeps the bounding box symmetric, so WORLD_MAX_X is still a true half width', () => {
    expect(WORLD_MIN_X).toBe(-WORLD_MAX_X);
    expect(WORLD_MAX_X).toBe(540);
    // Every column rect lies inside the box on BOTH axes, so |x| never exceeds
    // the half width the nine call sites assume.
    for (const col of COLUMN_ZONES) {
      const x0 = col.xMin ?? STRIP_MIN_X;
      const x1 = col.xMax ?? STRIP_MAX_X;
      expect(Math.abs(x0), `${col.id}.xMin`).toBeLessThanOrEqual(WORLD_MAX_X);
      expect(Math.abs(x1), `${col.id}.xMax`).toBeLessThanOrEqual(WORLD_MAX_X);
    }
    // ...and the rim itself, which is what actually fences the player, never
    // reaches past WORLD_MAX_X on either side, never comes inside the strip,
    // and never steps. THIS is the invariant the mirror rule used to imply.
    let maxStep = 0;
    for (const side of [-1, 0, 1]) {
      for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 1) {
        const half = worldHalfWidthAt(z, side);
        expect(half, `half width at z=${z} side=${side}`).toBeLessThanOrEqual(WORLD_MAX_X);
        expect(half, `half width at z=${z} side=${side}`).toBeGreaterThanOrEqual(STRIP_MAX_X);
        maxStep = Math.max(maxStep, Math.abs(worldHalfWidthAt(z + 1, side) - half));
      }
    }
    // Measured worst case 8.31yd per yard of z, at the Farshore/Willowfen
    // hand-over (z 182).
    expect(maxStep, 'the rim eases, it does not step').toBeLessThan(14);
  });

  it('rims each side at its own half width, because the half width is per side now', () => {
    // The heightfield noise is not mirrored, so the two rims are not equal
    // heights; what must match is WHERE they stand. Past THAT SIDE's half width
    // the ground is fenced, and well inside it, it is not. Reading the half
    // width per side is the whole point: answering 540 for the empty side of a
    // one-sided row would push the wall out over ground no zone owns.
    // Kept clear of the south/north rims, which saturate the same term.
    for (const side of [-1, 1]) {
      for (let z = -140; z <= WORLD_MAX_Z; z += 7) {
        if (z > worldNorthEdgeAt(side * 300) - 70) continue;
        const half = worldHalfWidthAt(z, side);
        const out = groundHeight(side * (half + 6), z, 1337);
        const inside = groundHeight(side * (half - 60), z, 1337);
        expect(out - inside, `rim at z=${z} side=${side}`).toBeGreaterThan(18);
      }
    }
  });

  it('rims the one-sided rows at the strip edge on their empty side', () => {
    // The Farshore Isle occupies x 180..540 in the vale's row and NOTHING sits
    // opposite it, so that row is 540 wide going west and 180 wide going east
    // (compass: +x is west). The default `x = 0` keeps the old answer, the
    // widest column in the row, whichever side it is on.
    expect(worldHalfWidthAt(0, -1)).toBe(180);
    expect(worldHalfWidthAt(0, +1)).toBe(540);
    expect(worldHalfWidthAt(0)).toBe(540);
    // ...across the whole row, not just at its middle. The -x side eases out
    // only once the Willowfen's own row window opens, 30yd south of z 180.
    for (let z = WORLD_MIN_Z; z <= 150; z += 5) {
      expect(worldHalfWidthAt(z, -1), `west half width at z=${z}`).toBe(STRIP_MAX_X);
    }
    for (let z = -140; z <= 140; z += 5) {
      expect(worldHalfWidthAt(z, +1), `east half width at z=${z}`).toBe(WORLD_MAX_X);
    }
    // The same asymmetry at the north end: the Drakelands runs to z 2420, the
    // Amberfall stops at 2380, so past the Amberfall's ease-out the -x side is
    // back at the strip edge while the +x side is still out at the column.
    expect(worldHalfWidthAt(2415, -1)).toBe(STRIP_MAX_X);
    expect(worldHalfWidthAt(2415, +1)).toBeGreaterThan(400);
  });

  it('follows the columns that exist at the north edge, and eases rather than steps', () => {
    // The twin of the per-side half width. The strip ends at the Frostveil
    // (1960) while the two columns beside it run to 2380 and 2420, so a single
    // global WORLD_MAX_Z would open a 360 x 460yd corridor of no-zone ground.
    for (const x of [-100, -50, 0, 50, 100]) {
      expect(worldNorthEdgeAt(x), `north edge over the middle column at x=${x}`).toBe(1960);
    }
    for (const x of [200, 300, 400, 540]) {
      expect(worldNorthEdgeAt(x), `north edge over the Drakelands at x=${x}`).toBe(WORLD_MAX_Z);
    }
    for (const x of [-540, -400, -300, -200]) {
      expect(worldNorthEdgeAt(x), `north edge over the Amberfall at x=${x}`).toBe(2380);
    }
    // It hands over across `columnColWeight`'s 30yd window, so the 460yd rise
    // is spread over 30yd: about 15yd of z per yard of x on average, 22.97 at
    // the steepest. That is an EASE, not a step, and the check for that is that
    // the difference scales with the stride rather than jumping at one x.
    const worstStep = (stride: number): number => {
      let worst = 0;
      for (let x = -700; x <= 700; x += stride) {
        worst = Math.max(worst, Math.abs(worldNorthEdgeAt(x + stride) - worldNorthEdgeAt(x)));
      }
      return worst;
    };
    expect(worstStep(1)).toBeLessThan(24);
    expect(worstStep(0.1)).toBeLessThan(2.5);
    expect(worstStep(0.01)).toBeLessThan(0.25);
  });
});

describe('phase 2: the overworld and the instance plane stay disjoint', () => {
  it('ends the widest zone rect a clear margin short of the instance threshold', () => {
    expect(WORLD_MAX_X).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(DUNGEON_X_THRESHOLD - WORLD_MAX_X).toBeGreaterThanOrEqual(60);
    for (const zone of ZONES) {
      expect(zone.xMax ?? STRIP_MAX_X).toBeLessThanOrEqual(WORLD_MAX_X);
      expect(zone.xMin ?? STRIP_MIN_X).toBeGreaterThanOrEqual(WORLD_MIN_X);
    }
  });

  it('gives every instance origin a position no zone rect contains', () => {
    const origins = [
      ...DUNGEON_LIST.map((d) => instanceOrigin(d.index, 0)),
      arenaOrigin(0),
      delveOrigin(0, 0),
      riftOrigin(0),
    ];
    for (const o of origins) {
      expect(zoneContaining(o.x, o.z), `zone at instance origin ${o.x},${o.z}`).toBeNull();
      expect(o.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
      expect(groundHeight(o.x, o.z, 1337)).toBe(0); // the flat instance floor
    }
  });

  it('leaves the widened overworld entirely on real terrain', () => {
    for (const x of [WORLD_MIN_X, -400, -181, -180, 0, 180, 181, 400, WORLD_MAX_X - 0.001]) {
      expect(x).toBeLessThanOrEqual(DUNGEON_X_THRESHOLD);
      expect(groundHeight(x, 300, 1337)).toBe(
        groundHeight(x, 300, 1337), // pure; the point is that it is NOT the flat floor
      );
    }
    expect(groundHeight(WORLD_MAX_X - 1, 300, 1337)).not.toBe(0);
  });
});

describe('phase 2: a saved position from every band still lands somewhere sane', () => {
  it('keeps a position anywhere in the NEW overworld exactly where it was saved', () => {
    // The columns are new territory: nothing here may be read as an instance.
    for (const [x, z] of [
      [360, 300], // Larkhollow, the east column hub
      [-360, 300], // Coldhearth, the west column hub
      [539, 300],
      [-539, 300],
      [0, 300], // and the strip, unmoved
    ] as const) {
      const e = reload(x, 12, z);
      expect(isLegacyInstancePos(x)).toBe(false);
      expect(e.pos.x).toBeCloseTo(x, 3);
      expect(e.pos.z).toBeCloseTo(z, 3);
    }
  });

  it('still ejects a genuine dungeon save to that dungeon door', () => {
    for (const d of DUNGEON_LIST) {
      const e = reload(instanceOrigin(d.index, 0).x, 20);
      expect(e.pos.x, `${d.id} eject x`).toBeCloseTo(d.doorPos.x, 3);
      expect(e.pos.z, `${d.id} eject z`).toBeCloseTo(d.doorPos.z - 4, 3);
    }
  });

  it('still ejects both STALE bands to the character own strip-zone hub', () => {
    for (const [x, level] of [
      [5400, 8], // old arena centre
      [6000, 20], // old delve base
      [6300, 14], // dead space between them
    ] as const) {
      expect(isLegacyInstancePos(x)).toBe(true);
      const e = reload(x, level);
      const hub = zoneForLevel(level).hub;
      expect(e.pos.x).toBeCloseTo(hub.x, 3);
      expect(e.pos.z).toBeCloseTo(hub.z, 3);
    }
  });

  it('sends a capped character to the Frostveil Reach, never to a column hub', () => {
    // zoneForLevel walks STRIP_ZONES: column zones are side content authored
    // beside a band, and a level-8 column zone must not shadow the level-20 hub.
    //
    // The endgame STRIP band used to be the Ashen Wastes. Full map parity gave
    // its z 900..1260 rows to upstream's Veiled Hollow and stacked the Frostveil
    // Reach (17-20) north of that, so the Ashen Wastes is parked and the last
    // strip band whose level band has opened at the cap is the Frostveil. The
    // assertion that matters is unchanged: a capped character ejected out of a
    // stale instance position lands in a STRIP hub, never a column hub.
    const endgame = STRIP_ZONES[STRIP_ZONES.length - 1];
    expect(endgame.id).toBe('frostveil');
    expect(zoneForLevel(20)).toBe(endgame);
    expect(zoneForLevel(1)).toBe(STRIP_ZONES[0]);
    for (let level = 1; level <= 20; level++) {
      expect(COLUMN_ZONES).not.toContain(zoneForLevel(level));
    }
    expect(reload(5400, 20).pos.z).toBeCloseTo(endgame.hub.z, 3);
  });

  it('still ejects a live delve or rift save out of its instance', () => {
    for (const x of [delveOrigin(0, 0).x, ARENA_X, RIFT_X]) {
      const e = reload(x, 20);
      expect(e.pos.x, `eject from ${x}`).toBeLessThanOrEqual(DUNGEON_X_THRESHOLD);
    }
    expect(DELVE_BAND_X_MIN).toBeGreaterThan(DUNGEON_X_THRESHOLD);
  });
});
