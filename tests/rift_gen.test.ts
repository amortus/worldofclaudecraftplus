import { describe, expect, it } from 'vitest';
import { layoutColliders } from '../src/sim/dungeon_layout';
import {
  AISLE_HALF,
  BODY_R,
  buildRiftFloor,
  generateRiftFloor,
  generateRiftPlan,
  isClear,
  RIFT_MAX_FLOORS,
  RIFT_MIN_FLOORS,
  RIFT_RANK_BASE_LEVEL,
  riftFloorColliders,
  riftFloorCount,
  RIFT_ENTRY_CLEARANCE,
  type RiftFloorPlan,
  type RiftObjectKind,
} from '../src/sim/rift';

// A spread of seeds wide enough to hit every archetype and every mechanic.
const SEEDS = [1, 7, 42, 99, 1234, 20260731, 0x7fffffff, 555, 8675309, 31337];

function everyFloor(seeds: number[], baseLevel = RIFT_RANK_BASE_LEVEL.C): RiftFloorPlan[] {
  const out: RiftFloorPlan[] = [];
  for (const seed of seeds) {
    const count = riftFloorCount(seed);
    for (let i = 0; i < count; i++) out.push(buildRiftFloor(seed, baseLevel, i));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Determinism: the whole point of the subsystem.
// ---------------------------------------------------------------------------

describe('rift generator determinism', () => {
  it('produces an identical floor from the same descriptor, twice', () => {
    for (const seed of SEEDS) {
      const count = riftFloorCount(seed);
      for (let i = 0; i < count; i++) {
        // buildRiftFloor is the UNCACHED entry point, so these are two truly
        // independent generations, not one object compared with itself.
        const a = buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.C, i);
        const b = buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.C, i);
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
        // Serialising too: the wire form must match, not just the object graph.
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }
    }
  });

  it('produces DIFFERENT dungeons from different seeds (the assertion is not vacuous)', () => {
    const shapes = new Set<string>();
    for (const seed of SEEDS) shapes.add(JSON.stringify(buildRiftFloor(seed, 20, 0)));
    expect(shapes.size).toBe(SEEDS.length);
  });

  it('produces different floors within one rift', () => {
    const seed = 20260731;
    const count = riftFloorCount(seed);
    expect(count).toBeGreaterThan(1);
    const shapes = new Set<string>();
    for (let i = 0; i < count; i++) shapes.add(JSON.stringify(buildRiftFloor(seed, 20, i).layout));
    expect(shapes.size).toBe(count);
  });

  it('generation never touches a shared stream: floor N is unaffected by generating floor M first', () => {
    const seed = 8675309;
    const count = riftFloorCount(seed);
    const forwards = [];
    for (let i = 0; i < count; i++) forwards.push(JSON.stringify(buildRiftFloor(seed, 20, i)));
    const backwards: string[] = new Array(count);
    for (let i = count - 1; i >= 0; i--) backwards[i] = JSON.stringify(buildRiftFloor(seed, 20, i));
    expect(backwards).toEqual(forwards);
  });

  it('the memoised accessor agrees with a fresh build', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      expect(generateRiftFloor(seed, 22, 0)).toEqual(buildRiftFloor(seed, 22, 0));
    }
  });

  it('freezes the memoised plan, so a caller cannot poison a later read', () => {
    const f = generateRiftFloor(1234, 20, 0);
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.layout)).toBe(true);
    expect(Object.isFrozen(f.layout.pillars)).toBe(true);
    expect(Object.isFrozen(f.spawns)).toBe(true);
    expect(Object.isFrozen(f.objects)).toBe(true);
    expect(() => (f.layout.pillars as { x: number; z: number }[]).push({ x: 0, z: 0 })).toThrow();
    // ...and the second read is still the dungeon the descriptor names.
    expect(generateRiftFloor(1234, 20, 0)).toEqual(buildRiftFloor(1234, 20, 0));
  });

  it('rank changes the plan but not the geometry stream', () => {
    const seed = 42;
    const c = buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.C, 0);
    const s = buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.S, 0);
    expect(s.layout).toEqual(c.layout);
    expect(s.rank).toBe('S');
    expect(c.rank).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// Shape of a run
// ---------------------------------------------------------------------------

describe('rift run shape', () => {
  it('runs three to six floors for every seed', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const n = riftFloorCount(seed);
      expect(n).toBeGreaterThanOrEqual(RIFT_MIN_FLOORS);
      expect(n).toBeLessThanOrEqual(RIFT_MAX_FLOORS);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('actually uses the whole floor-count range', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 400; seed++) seen.add(riftFloorCount(seed));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('the plan agrees with the floors it generates', () => {
    for (const seed of SEEDS) {
      const plan = generateRiftPlan(seed, RIFT_RANK_BASE_LEVEL.A);
      expect(plan.floorCount).toBe(riftFloorCount(seed));
      expect(plan.rank).toBe('A');
      const last = buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.A, plan.floorCount - 1);
      expect(last.themeId).toBe(plan.themeId);
    }
  });

  it('rolls a real spread of themes and room archetypes', () => {
    const themes = new Set<string>();
    const widths = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const f = buildRiftFloor(seed, 20, 0);
      themes.add(f.themeId);
      widths.add(f.layout.wallX ?? 0);
    }
    expect(themes.size).toBe(8);
    expect(widths.size).toBeGreaterThan(6);
  });
});

// ---------------------------------------------------------------------------
// The boss
// ---------------------------------------------------------------------------

describe('rift boss placement', () => {
  it('puts exactly one boss on the final floor and none anywhere else', () => {
    for (const seed of SEEDS) {
      const count = riftFloorCount(seed);
      for (let i = 0; i < count; i++) {
        const f = buildRiftFloor(seed, 20, i);
        const bosses = f.spawns.filter((s) => s.boss);
        if (i === count - 1) {
          expect(f.isBoss).toBe(true);
          expect(bosses).toHaveLength(1);
          expect(bosses[0].role).toBe('boss');
          expect(bosses[0].templateId.startsWith('rift_boss_')).toBe(true);
          // The boss stands on its dais.
          expect(bosses[0].x).toBe(0);
          expect(bosses[0].z).toBe(f.layout.dais.z);
        } else {
          expect(f.isBoss).toBe(false);
          expect(bosses).toHaveLength(0);
        }
      }
    }
  });

  it('gives the boss floor an exit and every other floor a descent', () => {
    for (const seed of SEEDS) {
      const count = riftFloorCount(seed);
      for (let i = 0; i < count; i++) {
        const f = buildRiftFloor(seed, 20, i);
        const kinds = f.objects.map((o) => o.kind);
        expect(kinds).toContain('beacon');
        if (f.isBoss) {
          expect(kinds).toContain('exit');
          expect(kinds).toContain('chest');
          expect(kinds).not.toContain('descent');
        } else {
          expect(kinds).toContain('descent');
          expect(kinds).not.toContain('exit');
        }
      }
    }
  });

  it('never spawns anything on top of the arrival point', () => {
    for (const f of everyFloor(SEEDS)) {
      const minZ = f.entry.z + RIFT_ENTRY_CLEARANCE;
      for (const s of f.spawns) expect(s.z).toBeGreaterThanOrEqual(minZ);
    }
  });
});

// ---------------------------------------------------------------------------
// Exactly ONE headline mechanic per floor
// ---------------------------------------------------------------------------

const MECHANIC_OBJECTS: Record<string, RiftObjectKind[]> = {
  rune_pylons: ['rune_pylon'],
  ice_slide: ['ice_goal'],
  boulder_push: ['boulder', 'boulder_pad'],
  sequence: ['seq_rune'],
  switch_gate: ['gate', 'switch'],
  none: [],
};
const ALL_MECHANIC_OBJECTS = new Set(Object.values(MECHANIC_OBJECTS).flat());

describe('rift floor mechanics', () => {
  it('carries at most one headline mechanic, and its state fields agree', () => {
    for (const f of everyFloor(SEEDS)) {
      // The mechanic-specific state fields are a PARTITION: never both, and each
      // present exactly when its own kind is the live one.
      expect([f.iceZone !== null, f.gate !== null].filter(Boolean).length).toBeLessThanOrEqual(1);
      expect(f.iceZone !== null).toBe(f.mechanic.kind === 'ice_slide');
      expect(f.gate !== null).toBe(f.mechanic.kind === 'switch_gate');
      // The placed nodes belong to exactly ONE mechanic's node set.
      const placed = new Set(
        f.objects.map((o) => o.kind).filter((k) => ALL_MECHANIC_OBJECTS.has(k)),
      );
      const owners = Object.entries(MECHANIC_OBJECTS).filter(
        ([kind, kinds]) => kind !== 'none' && kinds.some((k) => placed.has(k)),
      );
      expect(owners.length).toBeLessThanOrEqual(1);
      if (f.mechanic.kind === 'none') expect(placed.size).toBe(0);
      else expect(owners[0][0]).toBe(f.mechanic.kind);
    }
  });

  it('places the objects of its own mechanic and of no other', () => {
    for (const f of everyFloor(SEEDS)) {
      const mine = new Set(MECHANIC_OBJECTS[f.mechanic.kind]);
      const placed = f.objects.map((o) => o.kind).filter((k) => ALL_MECHANIC_OBJECTS.has(k));
      for (const kind of placed) expect(mine.has(kind)).toBe(true);
      for (const kind of mine) expect(placed).toContain(kind);
    }
  });

  it('leaves boss floors clean, so only the boss reads', () => {
    for (const seed of SEEDS) {
      const f = buildRiftFloor(seed, 20, riftFloorCount(seed) - 1);
      expect(f.mechanic.kind).toBe('none');
      expect(f.iceZone).toBeNull();
      expect(f.gate).toBeNull();
    }
  });

  it('surfaces every mechanic kind across enough seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const count = riftFloorCount(seed);
      for (let i = 0; i < count - 1; i++) seen.add(buildRiftFloor(seed, 20, i).mechanic.kind);
    }
    expect([...seen].sort()).toEqual([
      'boulder_push',
      'ice_slide',
      'none',
      'rune_pylons',
      'sequence',
      'switch_gate',
    ]);
  });

  it('gives node-count mechanics real nodes', () => {
    for (const f of everyFloor(SEEDS)) {
      if (f.mechanic.kind === 'rune_pylons') {
        expect(f.mechanic.nodeCount).toBeGreaterThanOrEqual(3);
        expect(f.objects.filter((o) => o.kind === 'rune_pylon')).toHaveLength(f.mechanic.nodeCount);
      }
      if (f.mechanic.kind === 'sequence') {
        const runes = f.objects.filter((o) => o.kind === 'seq_rune');
        expect(runes).toHaveLength(f.mechanic.nodeCount);
        // Slots are a complete 0..n-1 set, so the runtime can order them.
        expect(runes.map((r) => r.slot).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(
          runes.map((_, i) => i),
        );
      }
      if (f.mechanic.kind === 'boulder_push') {
        const boulders = f.objects.filter((o) => o.kind === 'boulder');
        const pads = f.objects.filter((o) => o.kind === 'boulder_pad');
        expect(boulders.length).toBe(pads.length);
        expect(boulders.length).toBeGreaterThan(0);
      }
      if (f.mechanic.kind === 'switch_gate' && f.gate) {
        // The plate must be reached BEFORE the gate, or the floor is unopenable.
        expect(f.gate.switchZ).toBeLessThan(f.gate.z);
        expect(f.gate.z).toBeLessThan(f.layout.dais.z);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Playability: a generated dungeon that cannot be finished is worse than none.
// ---------------------------------------------------------------------------

/** Flood fill the room on a one-yard grid using the SAME clearance test the
 * runtime resolver uses, and return the set of reachable cells. */
function reachableCells(f: RiftFloorPlan): Set<string> {
  const colliders = layoutColliders(f.layout);
  const wallX = f.layout.wallX ?? 23;
  const key = (x: number, z: number) => `${x},${z}`;
  const inRoom = (x: number, z: number) =>
    x >= -wallX && x <= wallX && z >= f.layout.zMin && z <= f.layout.zMax;
  const start = { x: Math.round(f.entry.x), z: Math.round(f.entry.z) };
  const seen = new Set<string>();
  if (!isClear(colliders, start.x, start.z, BODY_R)) return seen;
  const queue = [start];
  seen.add(key(start.x, start.z));
  while (queue.length) {
    const cur = queue.pop() as { x: number; z: number };
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const nz = cur.z + dz;
      const k = key(nx, nz);
      if (seen.has(k) || !inRoom(nx, nz)) continue;
      if (!isClear(colliders, nx, nz, BODY_R)) continue;
      seen.add(k);
      queue.push({ x: nx, z: nz });
    }
  }
  return seen;
}

/** Whether a point of interest has a reachable grid cell beside it. */
function reachable(cells: Set<string>, x: number, z: number, slack = 1): boolean {
  for (let dx = -slack; dx <= slack; dx++) {
    for (let dz = -slack; dz <= slack; dz++) {
      if (cells.has(`${Math.round(x) + dx},${Math.round(z) + dz}`)) return true;
    }
  }
  return false;
}

describe('rift floor playability', () => {
  it('keeps the WHOLE central spine band clear at every depth', () => {
    for (const f of everyFloor(SEEDS)) {
      const colliders = layoutColliders(f.layout);
      for (let z = f.layout.zMin + 2; z <= f.layout.zMax - 2; z += 1) {
        // Not just x = 0: the entire |x| <= AISLE_HALF aisle, which is what the
        // toClear march and the reachability guarantee actually rely on.
        for (let x = -AISLE_HALF; x <= AISLE_HALF; x += 0.5) {
          expect(isClear(colliders, x, z, BODY_R), `x ${x} z ${z}`).toBe(true);
        }
      }
      // And no obstacle CENTRE sits inside the aisle either.
      for (const p of [...f.layout.pillars, ...f.layout.tombs, ...(f.layout.clutter ?? [])]) {
        expect(Math.abs(p.x)).toBeGreaterThan(AISLE_HALF);
      }
    }
  });

  it('makes the boss, the way onward and every placed node reachable from the entrance', () => {
    for (const seed of SEEDS) {
      const count = riftFloorCount(seed);
      for (let i = 0; i < count; i++) {
        const f = buildRiftFloor(seed, 20, i);
        const cells = reachableCells(f);
        // A real fraction of the room, not a pocket by the door: the nave alone
        // (11 wide x the room length) is already well past this.
        const area = (2 * (f.layout.wallX ?? 23) + 1) * (f.layout.zMax - f.layout.zMin + 1);
        expect(cells.size).toBeGreaterThan(area * 0.25);
        const where = `seed ${seed} floor ${i}`;
        // The dais itself.
        expect(reachable(cells, f.layout.dais.x, f.layout.dais.z), `dais ${where}`).toBe(true);
        for (const o of f.objects) {
          expect(reachable(cells, o.x, o.z), `${o.kind} ${where}`).toBe(true);
        }
        for (const s of f.spawns) {
          expect(reachable(cells, s.x, s.z), `${s.templateId} ${where}`).toBe(true);
        }
      }
    }
  });

  it('keeps every spawn and object inside the room', () => {
    for (const f of everyFloor(SEEDS)) {
      const wallX = f.layout.wallX ?? 23;
      for (const p of [...f.spawns, ...f.objects]) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(wallX);
        expect(p.z).toBeGreaterThan(f.layout.zMin);
        expect(p.z).toBeLessThan(f.layout.zMax);
        expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('gives every floor real trash to clear', () => {
    for (const f of everyFloor(SEEDS)) {
      const trash = f.spawns.filter((s) => !s.boss);
      expect(trash.length).toBeGreaterThanOrEqual(4);
      expect(trash.length).toBeLessThanOrEqual(40);
      for (const s of trash) expect(s.role).toBe('trash');
    }
  });

  it('derives its colliders through the shared layoutColliders path', () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const f = generateRiftFloor(seed, 20, 0);
      expect(riftFloorColliders(seed, 20, 0)).toEqual(layoutColliders(f.layout));
    }
  });

  it('the reachability check can actually FAIL (negative control)', () => {
    const f = buildRiftFloor(SEEDS[0], 20, 0);
    const wallX = f.layout.wallX ?? 23;
    const sealed: RiftFloorPlan = {
      ...f,
      layout: {
        ...f.layout,
        // One full-width slab across the nave, spine included: the dais must now
        // be unreachable. If this still passes, the flood fill proves nothing.
        stubs: [
          ...f.layout.stubs,
          { x: 0, z: f.layout.zMin + 40, hw: wallX + 2, hd: 4 },
        ],
      },
    };
    const cells = reachableCells(sealed);
    expect(reachable(cells, sealed.layout.dais.x, sealed.layout.dais.z)).toBe(false);
    // ...while the unsealed original is reachable.
    expect(reachable(reachableCells(f), f.layout.dais.x, f.layout.dais.z)).toBe(true);
  });

  it('fits one instance slot (data.ts stacks slots 500 apart in z, 600 in x)', () => {
    for (const f of everyFloor(SEEDS)) {
      expect(f.layout.zMax - f.layout.zMin).toBeLessThan(400);
      expect((f.layout.endWallHw ?? 0) * 2).toBeLessThan(300);
    }
  });
});
