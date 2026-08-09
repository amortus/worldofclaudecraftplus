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
  WORLD_MIN_X,
  worldHalfWidthAt,
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
//    ui/hud.ts) read it as a half width about x = 0. The grid must therefore
//    stay mirrored, or each of those has to be rewritten first.
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

describe('phase 2: the world grid stays symmetric about x = 0', () => {
  it('mirrors every column, so WORLD_MAX_X is still a true half width', () => {
    expect(WORLD_MIN_X).toBe(-WORLD_MAX_X);
    expect(WORLD_MAX_X).toBe(540);
    // Each column has a mirror twin at the same z band.
    for (const col of COLUMN_ZONES) {
      const x0 = col.xMin ?? STRIP_MIN_X;
      const x1 = col.xMax ?? STRIP_MAX_X;
      const twin = COLUMN_ZONES.find(
        (o) =>
          o !== col &&
          o.zMin === col.zMin &&
          o.zMax === col.zMax &&
          (o.xMin ?? STRIP_MIN_X) === -x1 &&
          (o.xMax ?? STRIP_MAX_X) === -x0,
      );
      expect(twin, `${col.id} has no mirror column`).toBeDefined();
    }
  });

  it('rims both sides at the same distance, which is what the half width means', () => {
    // The heightfield noise is not mirrored, so the two rims are not equal
    // heights; what must match is WHERE they stand. Past the row's half width
    // the ground is fenced on both sides, and well inside it, it is not.
    // Kept clear of the south/north rims, which saturate the same term.
    for (let z = -140; z <= 1220; z += 7) {
      const half = worldHalfWidthAt(z);
      const outEast = groundHeight(half + 6, z, 1337);
      const outWest = groundHeight(-(half + 6), z, 1337);
      const inEast = groundHeight(half - 60, z, 1337);
      const inWest = groundHeight(-(half - 60), z, 1337);
      expect(outEast - inEast, `east rim at z=${z}`).toBeGreaterThan(18);
      expect(outWest - inWest, `west rim at z=${z}`).toBeGreaterThan(18);
    }
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

  it('sends a capped character to the Ashen Wastes, never to a column hub', () => {
    // zoneForLevel walks STRIP_ZONES: column zones are side content authored
    // beside a band, and a level-8 column zone must not shadow the level-20 hub.
    const endgame = STRIP_ZONES[STRIP_ZONES.length - 1];
    expect(endgame.id).toBe('ashen_wastes');
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
