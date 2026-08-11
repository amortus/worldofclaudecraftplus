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
import { FARSHORE_ZONE } from '../src/sim/content/realms';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../src/sim/world';

const SEED = 1337;

// ---------------------------------------------------------------------------
// The world GRID: what phase 2 proved about one east/west column pair, now
// asserted about the whole 14-zone map.
//
// Phase 2 shipped an invented pair (Alderfen east, Grimhold west) in the
// Eastbrook Vale's band. Full map parity DELETED both and put upstream's own
// `farshore_isle` in the +x half of that band, so this file no longer names
// them; every assertion here is either about the grid itself or about the one
// zone that occupies the vale's row now.
// ---------------------------------------------------------------------------

describe('the grid: strip bands plus the ported column ring', () => {
  it('ships the three original strip bands plus the two ported strip bands, tiling z', () => {
    expect(STRIP_ZONES.map((z) => z.id)).toEqual([
      'eastbrook_vale',
      'mirefen_marsh',
      'thornpeak_heights',
      // The Ashen Wastes held z 900..1260 until full map parity gave the band
      // to upstream's Veiled Hollow (see the PARKED banner in sim/data.ts).
      'veiled_hollow',
      'frostveil',
    ]);
    expect(COLUMN_ZONES.map((z) => z.id)).toEqual([
      'farshore_isle',
      'willowfen',
      'galecrest',
      'palmreach',
      'evergarden',
      'nightbloom',
      'wraithwood',
      'amberfall',
      'drakelands',
    ]);
    // The strip still tiles the z axis contiguously; that is what makes the
    // zoneAt southmost-band fallback exact for a point beyond a column's rect.
    for (let i = 1; i < STRIP_ZONES.length; i++) {
      expect(STRIP_ZONES[i].zMin).toBe(STRIP_ZONES[i - 1].zMax);
    }
    expect(WORLD_MIN_Z).toBe(-180);
    // The Drakelands is the northmost rect in the whole grid.
    expect(WORLD_MAX_Z).toBe(2420);
  });

  it('gives the vale row a column on the +x side only, exactly as upstream does', () => {
    expect(FARSHORE_ZONE.zMin).toBe(-180);
    expect(FARSHORE_ZONE.zMax).toBe(180);
    expect(FARSHORE_ZONE.xMin).toBe(180);
    expect(FARSHORE_ZONE.xMax).toBe(540);
    // ...and nothing occupies the mirror rect. That asymmetry is why the rim
    // half width is per side now (sim/data worldHalfWidthAt).
    expect(zoneContaining(-300, 0)).toBeNull();
  });

  it('resolves by rect: zoneAt picks the column, zoneContaining reports the holes', () => {
    expect(zoneAt(0, 0).id).toBe('eastbrook_vale');
    expect(zoneAt(300, 0).id).toBe('farshore_isle');
    expect(zoneBiomeAt(300, 0)).toBe('vale');
    expect(zoneContaining(300, 300)?.id).toBe('galecrest');
    expect(zoneContaining(-300, 1000)?.id).toBe('palmreach');
    expect(zoneContaining(900, 300)).toBeNull();
    expect(zoneAt(900, 300).id).toBe('mirefen_marsh'); // the instance plane reads its band
    expect(zoneContaining(300, 0)).toBe(FARSHORE_ZONE);
    expect(zoneContaining(180, 0)).toBe(FARSHORE_ZONE); // half-open: xMin is inside
    expect(zoneContaining(179.999, 0)?.id).toBe('eastbrook_vale');
    expect(zoneContaining(540, 0)).toBeNull(); // ...xMax is not
  });

  it('places every column POI, hub, graveyard and lake inside its own rect', () => {
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

describe('the grid: the column borders are real, walkable borders', () => {
  // The vale/Farshore border at x = 180. Neither zone declares a pass field, so
  // `computeBorderEdges` falls through to the span midpoint, z 0, which is the
  // Eastbrook latitude the road already runs through.
  const PASS_Z = 0;

  it('opens the border at its declared pass', () => {
    const atPass = terrainHeight(180, PASS_Z, SEED);
    const atWall = terrainHeight(180, PASS_Z + 100, SEED);
    expect(atWall - atPass, 'farshore wall vs pass').toBeGreaterThan(15);
    expect(atPass).toBeGreaterThan(WATER_LEVEL); // and the pass is dry land
  });

  it('lets a player walk the pass without meeting a slope the gate refuses', () => {
    let steepest = 0;
    for (let x = 140; x < 240; x += 0.5) {
      const a = terrainHeight(x, PASS_Z, SEED);
      const b = terrainHeight(x + 0.5, PASS_Z, SEED);
      steepest = Math.max(steepest, (b - a) / 0.5);
    }
    expect(steepest, 'climb from x=140 to x=240').toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
  });

  it('still walls the border away from the pass', () => {
    let steepest = 0;
    for (let x = 140; x < 220; x += 0.5) {
      const a = terrainHeight(x, 120, SEED);
      const b = terrainHeight(x + 0.5, 120, SEED);
      steepest = Math.max(steepest, Math.abs(b - a) / 0.5);
    }
    expect(steepest, 'border wall at x=180').toBeGreaterThan(0.9);
  });
});

describe('the grid: world generation draws no new randomness', () => {
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

  it('declares exact positions for every camp outside the strip bands, which is why', () => {
    // EVERY column camp, all nine ported zones plus the two ported strip bands:
    // upstream authored theirs as scatter camps, and that scatter was captured
    // once at the live world seed and frozen into `positions` for exactly this
    // reason (see src/sim/content/realms/CLAUDE.md).
    const originalStrip = new Set(['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']);
    for (const camp of CAMPS) {
      const zone = zoneContaining(camp.center.x, camp.center.z);
      if (!zone || originalStrip.has(zone.id)) continue;
      expect(camp.positions, `camp ${camp.mobId}`).toBeDefined();
      expect(camp.positions).toHaveLength(camp.count);
      expect(MOBS[camp.mobId], `camp ${camp.mobId} template`).toBeDefined();
      for (const p of camp.positions!) {
        expect(zoneContaining(p.x, p.z), `${camp.mobId} spawn ${p.x},${p.z}`).toBe(zone);
        // and on dry land: a fixed-position camp skips the water check. A
        // swimmer may wade.
        const swims = MOBS[camp.mobId].canSwim === true;
        expect(terrainHeight(p.x, p.z, SEED), `${camp.mobId} at ${p.x},${p.z}`).toBeGreaterThan(
          swims ? WATER_LEVEL - 0.5 : WATER_LEVEL + 0.3,
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // RE-BASELINED at full map parity, and this is the record of it.
  //
  // `world_phase2_spawns.snapshot.json` was captured while the Ashen Wastes was
  // still merged. That zone is RETIRED now (see the PARKED banner in
  // sim/data.ts), and its camps were SCATTER camps: they drew world-gen rng, so
  // removing them moves the post-worldgen cursor. There is no way to keep it.
  //
  //   rngAfterWorldgen at seed 42, OLD: 0.8164072453510016
  //   rngAfterWorldgen at seed 42, NEW: 0.7349557857960463
  //
  // The delta is exactly the retired Ashen Wastes' scatter draws, and nothing
  // else. That was verified before regenerating: of the 602 rows in the old
  // snapshot, exactly 137 are missing from the live world, and every one of
  // them sits inside the retired band (bounding box x -137..109, z 984..1244).
  // Not one entity of the three original bands moved a yard, so regenerating
  // reproduced their coordinates byte for byte and the file is still their
  // oracle. The ported roster (918 rows now, up from 602) came in on top.
  //
  // The ported camps themselves still draw NOTHING: they declare exact
  // `positions`. Measured A/B at seeds 20061, 1337 and 42, the cursor with all
  // 117 of them merged is bit-identical to a world where `REALM_CAMPS` is not
  // merged at all. The move above is the Ashen Wastes' removal, not their
  // addition.
  // -------------------------------------------------------------------------

  it('keeps every mob and npc of the three original bands at its exact seed position', () => {
    const liveKeys = new Set(live.rows.map((r) => `${r.kind}|${r.tpl}|${r.x}|${r.z}`));
    const moved = SNAP.entities.filter((e) => !liveKeys.has(`${e.kind}|${e.tpl}|${e.x}|${e.z}`));
    expect(moved).toEqual([]);
    // ...and the three original bands really are in there, so the check above
    // is not passing on an empty or truncated file.
    const original = new Set(['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']);
    const inOriginal = SNAP.entities.filter((e) => {
      const zn = zoneContaining(e.x, e.z);
      return zn !== null && original.has(zn.id);
    });
    expect(inOriginal.length).toBeGreaterThan(400);
  });

  it('adds the ported roster on top rather than replacing anything', () => {
    // Snapshot-independent, because the snapshot is the live world again: the
    // roster is checked against the CONTENT TABLES instead. Every zone outside
    // the three original bands spawns exactly the mobs its camps declare, at
    // frozen positions inside its own rect, so a zone whose content silently
    // stopped being merged shows up here as a zero.
    const original = new Set(['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']);
    for (const zn of ZONES) {
      if (original.has(zn.id)) continue;
      const spawned = live.rows.filter(
        (r) => r.kind === 'mob' && zoneContaining(r.x, r.z) === zn,
      ).length;
      const declared = CAMPS.filter((c) => zoneContaining(c.center.x, c.center.z) === zn).reduce(
        (n, c) => n + c.count,
        0,
      );
      expect(declared, `${zn.id} declares camps`).toBeGreaterThan(0);
      expect(spawned, `${zn.id} spawned mobs`).toBe(declared);
    }
    // and the same total, counted the other way: everything outside the strip.
    const columnMobs = live.rows.filter((r) => r.kind === 'mob' && Math.abs(r.x) > STRIP_MAX_X);
    expect(columnMobs.length).toBe(
      CAMPS.filter((c) => Math.abs(c.center.x) > STRIP_MAX_X).reduce((n, c) => n + c.count, 0),
    );
    expect(live.rows.length).toBe(SNAP.entities.length);
  });

  it('leaves the post-worldgen rng cursor where the re-baseline put it', () => {
    // See the banner above for the old value and why it moved. Every ported
    // camp declares exact `positions`, so world generation makes no rng draw
    // for any of them and this must not move again for a map reason.
    expect(live.rngAfterWorldgen).toBe(SNAP.rngAfterWorldgen);
    expect(SNAP.rngAfterWorldgen).toBe(0.7349557857960463);
  });
});

describe('the grid: the sideways blend behaves like the northward one', () => {
  it('saturates deep inside a column and is exactly zero deep inside the strip', () => {
    expect(columnBlendAt(FARSHORE_ZONE, 400, 0)).toBeCloseTo(1, 6);
    expect(columnBlendAt(FARSHORE_ZONE, 0, 0)).toBe(0);
    expect(columnBlendAt(FARSHORE_ZONE, -400, 0)).toBe(0);
  });

  it('rises monotonically as a player walks through the border', () => {
    let prev = -1;
    for (let x = STRIP_MIN_X; x <= 540; x += 1) {
      const t = columnBlendAt(FARSHORE_ZONE, x, 0);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(prev).toBeCloseTo(1, 6);
  });
});
