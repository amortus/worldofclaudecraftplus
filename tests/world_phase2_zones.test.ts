import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import {
  CAMPS,
  columnBlendAt,
  COLUMN_ZONES,
  MOBS,
  STRIP_MAX_X,
  STRIP_MIN_X,
  STRIP_ZONES,
  WORLD_MAX_Z,
  WORLD_MIN_Z,
  ZONES,
  zoneAt,
  zoneContaining,
} from '../src/sim/data';
import { ALDERFEN_ZONE, COLUMN_PASS_Z, GRIMHOLD_ZONE } from '../src/sim/content/columns';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../src/sim/world';

const SEED = 1337;

describe('phase 2: the two column zones', () => {
  it('ships exactly the strip plus one mirrored east/west column ring', () => {
    expect(STRIP_ZONES.map((z) => z.id)).toEqual([
      'eastbrook_vale',
      'mirefen_marsh',
      'thornpeak_heights',
      'ashen_wastes',
    ]);
    expect(COLUMN_ZONES.map((z) => z.id)).toEqual(['alderfen_shallows', 'grimhold_crags']);
    // The strip still tiles the z axis contiguously; that is what makes the
    // zoneAt southmost-band fallback exact for a point beyond a column's rect.
    for (let i = 1; i < STRIP_ZONES.length; i++) {
      expect(STRIP_ZONES[i].zMin).toBe(STRIP_ZONES[i - 1].zMax);
    }
    expect(WORLD_MIN_Z).toBe(-180);
    expect(WORLD_MAX_Z).toBe(1260);
  });

  it('adds NO new biome, because BiomeId feeds exhaustive render tables', () => {
    const shipped = new Set(STRIP_ZONES.map((z) => z.biome));
    for (const col of COLUMN_ZONES) expect(shipped.has(col.biome)).toBe(true);
  });

  it('shares the vale band exactly, so the columns are a row and not a band', () => {
    for (const col of COLUMN_ZONES) {
      expect(col.zMin).toBe(-180);
      expect(col.zMax).toBe(180);
    }
    expect(ALDERFEN_ZONE.xMin).toBe(180);
    expect(ALDERFEN_ZONE.xMax).toBe(540);
    expect(GRIMHOLD_ZONE.xMin).toBe(-540);
    expect(GRIMHOLD_ZONE.xMax).toBe(-180);
  });

  it('resolves by rect: zoneAt picks the column, zoneContaining reports the holes', () => {
    expect(zoneAt(0, 0).id).toBe('eastbrook_vale');
    expect(zoneAt(300, 0).id).toBe('alderfen_shallows');
    expect(zoneAt(-300, 0).id).toBe('grimhold_crags');
    expect(zoneBiomeAt(300, 0)).toBe('marsh');
    expect(zoneBiomeAt(-300, 0)).toBe('peaks');

    // Rows without a column are holes in the grid: zoneAt clamps (it must
    // always answer), zoneContaining tells the truth.
    expect(zoneContaining(300, 300)).toBeNull();
    expect(zoneContaining(-300, 1000)).toBeNull();
    expect(zoneContaining(300, 0)).toBe(ALDERFEN_ZONE);
    expect(zoneContaining(180, 0)).toBe(ALDERFEN_ZONE); // half-open: xMin is inside
    expect(zoneContaining(179.999, 0)?.id).toBe('eastbrook_vale');
    expect(zoneContaining(540, 0)).toBeNull(); // ...xMax is not
  });

  it('places every column POI, hub, graveyard and camp inside its own rect', () => {
    for (const col of COLUMN_ZONES) {
      const points = [
        { x: col.hub.x, z: col.hub.z, what: 'hub' },
        { x: col.graveyard.x, z: col.graveyard.z, what: 'graveyard' },
        ...col.pois.map((p) => ({ x: p.x, z: p.z, what: `poi ${p.label}` })),
        ...col.lakes.map((l) => ({ x: l.x, z: l.z, what: 'lake' })),
      ];
      for (const p of points) {
        expect(zoneContaining(p.x, p.z), `${col.id} ${p.what} at ${p.x},${p.z}`).toBe(col);
      }
    }
  });

  it('gives every POI label a name no other zone already uses', () => {
    const labels = ZONES.flatMap((z) => z.pois.map((p) => p.label));
    expect(new Set(labels).size).toBe(labels.length);
    const zoneNames = ZONES.map((z) => z.name);
    expect(new Set(zoneNames).size).toBe(zoneNames.length);
    const hubNames = ZONES.map((z) => z.hub.name);
    expect(new Set(hubNames).size).toBe(hubNames.length);
  });
});

describe('phase 2: the column borders are real, walkable borders', () => {
  it('opens each column border at its declared pass', () => {
    for (const [borderX, zone] of [
      [180, ALDERFEN_ZONE],
      [-180, GRIMHOLD_ZONE],
    ] as const) {
      const atPass = terrainHeight(borderX, COLUMN_PASS_Z, SEED);
      const atWall = terrainHeight(borderX, COLUMN_PASS_Z + 100, SEED);
      expect(atWall - atPass, `${zone.id} wall vs pass`).toBeGreaterThan(15);
      expect(atPass).toBeGreaterThan(WATER_LEVEL); // and the pass is dry land
    }
  });

  it('lets a player walk the pass without meeting a slope the gate refuses', () => {
    // Straight east/west through each pass, at the sim's own climb gate.
    for (const [from, to] of [
      [140, 240],
      [-140, -240],
    ] as const) {
      const step = to > from ? 0.5 : -0.5;
      let steepest = 0;
      for (let x = from; (step > 0 ? x < to : x > to); x += step) {
        const a = terrainHeight(x, COLUMN_PASS_Z, SEED);
        const b = terrainHeight(x + step, COLUMN_PASS_Z, SEED);
        steepest = Math.max(steepest, (b - a) / Math.abs(step));
      }
      expect(steepest, `climb from x=${from} to x=${to}`).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    }
  });

  it('still walls the border away from the pass', () => {
    for (const borderX of [180, -180]) {
      let steepest = 0;
      for (let x = borderX - 40; x < borderX + 40; x += 0.5) {
        const a = terrainHeight(x, 120, SEED);
        const b = terrainHeight(x + 0.5, 120, SEED);
        steepest = Math.max(steepest, Math.abs(b - a) / 0.5);
      }
      expect(steepest, `border wall at x=${borderX}`).toBeGreaterThan(0.9);
    }
  });
});

describe('phase 2: world generation draws no new randomness', () => {
  interface SpawnSnapshot {
    seed: number;
    rngAfterWorldgen: number;
    entities: { kind: string; tpl: string; x: number; y: number; z: number }[];
  }
  const SNAP: SpawnSnapshot = JSON.parse(
    readFileSync(new URL('./world_phase2_spawns.snapshot.json', import.meta.url), 'utf8'),
  );

  const live = (() => {
    const sim = new Sim({ seed: SNAP.seed, playerClass: 'warrior', noPlayer: true });
    const rows = [];
    for (const e of sim.entities.values()) {
      const any = e as unknown as Record<string, unknown>;
      rows.push({
        kind: e.kind,
        tpl: String(any.templateId ?? any.npcId ?? any.name),
        x: e.pos.x,
        y: e.pos.y,
        z: e.pos.z,
      });
    }
    const rngAfterWorldgen = (sim as unknown as { rng: { next(): number } }).rng.next();
    return { rows, rngAfterWorldgen };
  })();

  it('leaves the post-worldgen rng cursor bit-identical', () => {
    // Every column camp declares exact `positions`, so world generation makes
    // no rng draw for them at all. This is the single assertion that proves no
    // shipped mob moved: if the cursor matches, every draw before it matched.
    expect(live.rngAfterWorldgen).toBe(SNAP.rngAfterWorldgen);
  });

  it('declares exact positions for every column camp, which is why', () => {
    const columnIds = new Set(COLUMN_ZONES.map((z) => z.id));
    for (const camp of CAMPS) {
      const zone = zoneContaining(camp.center.x, camp.center.z);
      if (!zone || !columnIds.has(zone.id)) continue;
      expect(camp.positions, `camp ${camp.mobId}`).toBeDefined();
      expect(camp.positions).toHaveLength(camp.count);
      expect(MOBS[camp.mobId], `camp ${camp.mobId} template`).toBeDefined();
      for (const p of camp.positions!) {
        expect(zoneContaining(p.x, p.z), `${camp.mobId} spawn ${p.x},${p.z}`).toBe(zone);
        // and on dry land: a fixed-position camp skips the water check
        expect(terrainHeight(p.x, p.z, SEED)).toBeGreaterThan(WATER_LEVEL + 0.3);
      }
    }
  });

  it('keeps every shipped mob and npc at its exact seed-generated position', () => {
    const liveKeys = new Set(live.rows.map((r) => `${r.kind}|${r.tpl}|${r.x}|${r.z}`));
    const moved = SNAP.entities.filter((e) => !liveKeys.has(`${e.kind}|${e.tpl}|${e.x}|${e.z}`));
    expect(moved).toEqual([]);
  });

  it('adds the column roster on top rather than replacing anything', () => {
    expect(live.rows.length).toBeGreaterThan(SNAP.entities.length);
    const columnMobs = live.rows.filter(
      (r) => r.kind === 'mob' && Math.abs(r.x) > STRIP_MAX_X,
    );
    expect(columnMobs.length).toBe(
      CAMPS.filter((c) => Math.abs(c.center.x) > STRIP_MAX_X).reduce((n, c) => n + c.count, 0),
    );
  });
});

describe('phase 2: the sideways blend behaves like the northward one', () => {
  it('saturates deep inside a column and is exactly zero deep inside the strip', () => {
    expect(columnBlendAt(ALDERFEN_ZONE, 400, 0)).toBeCloseTo(1, 6);
    expect(columnBlendAt(GRIMHOLD_ZONE, -400, 0)).toBeCloseTo(1, 6);
    expect(columnBlendAt(ALDERFEN_ZONE, 0, 0)).toBe(0);
    expect(columnBlendAt(GRIMHOLD_ZONE, 0, 0)).toBe(0);
    // and one column never leaks into the other
    expect(columnBlendAt(ALDERFEN_ZONE, -400, 0)).toBe(0);
    expect(columnBlendAt(GRIMHOLD_ZONE, 400, 0)).toBe(0);
  });

  it('rises monotonically as a player walks east through the border', () => {
    let prev = -1;
    for (let x = STRIP_MIN_X; x <= 540; x += 1) {
      const t = columnBlendAt(ALDERFEN_ZONE, x, 0);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(prev).toBeCloseTo(1, 6);
  });
});
