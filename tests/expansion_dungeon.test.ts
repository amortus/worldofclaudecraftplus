// The Cinderforge: layout expressibility, spawn placement and encounter budget.
//
// The dungeon is authored in src/sim/content/expansion/cinderforge.ts and is not
// merged into data.ts yet, so this file checks it against the real layout and
// collider primitives directly.
import { describe, expect, it } from 'vitest';

import { CINDERFORGE_DUNGEON_DEFS, CINDERFORGE_LAYOUT, CINDERFORGE_MOBS } from '../src/sim/content/expansion';
import { DUNGEONS, ARENA_X_MIN, instanceOrigin } from '../src/sim/data';
import type { DungeonLayout } from '../src/sim/dungeon_layout';
import {
  DUNGEON_WALK_HALF_X,
  SANCTUM_LAYOUT,
  layoutColliders,
} from '../src/sim/dungeon_layout';
import type { DungeonSpawn, MobTemplate } from '../src/sim/types';

const CINDERFORGE = CINDERFORGE_DUNGEON_DEFS.cinderforge;
// The interior key the def actually ships on decides which layout the renderer
// and the collider resolver use.
const SHIPPED_LAYOUT: DungeonLayout = SANCTUM_LAYOUT;

const bosses = Object.values(CINDERFORGE_MOBS).filter((m) => m.boss);
const spawnedIds = new Set(CINDERFORGE.spawns.map((s) => s.mobId));

/** Does a body of radius `r` centred at (x,z) intersect this collider? */
function blocked(c: ReturnType<typeof layoutColliders>[number], x: number, z: number, r: number): boolean {
  if (c.type === 'circle') {
    const dx = x - c.x;
    const dz = z - c.z;
    return Math.hypot(dx, dz) < c.r + r;
  }
  // Every layout OBB is authored at rot 0, so an AABB test is exact here.
  expect(c.rot).toBe(0);
  return Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r;
}

describe('Cinderforge: the def', () => {
  it('is a five-player dungeon on an interior key that already ships', () => {
    expect(CINDERFORGE.suggestedPlayers).toBe(5);
    // The union in types.ts is closed; using an unlisted key would not compile,
    // but pin the intent so a later "dedicated interior" pass is deliberate.
    expect(['crypt', 'sanctum', 'temple']).toContain(CINDERFORGE.interior);
  });

  it('takes the next free instance index, and records the band it needs', () => {
    const used = Object.values(DUNGEONS).map((d) => d.index);
    expect(CINDERFORGE.index).toBe(Math.max(...used) + 1);
    // Documented wiring debt: index 8 lands past the current arena band edge, so
    // `dungeonAt` cannot resolve it until ARENA_X/DELVE_X_MIN move out by 600.
    // This assertion is the tripwire that keeps that fact from being forgotten.
    expect(instanceOrigin(CINDERFORGE.index, 0).x).toBeGreaterThanOrEqual(ARENA_X_MIN);
  });

  it('has an overworld door inside the Ashen Wastes and the shipped world width', () => {
    expect(CINDERFORGE.doorPos.z).toBeGreaterThanOrEqual(900);
    expect(CINDERFORGE.doorPos.z).toBeLessThan(1260);
    expect(Math.abs(CINDERFORGE.doorPos.x)).toBeLessThanOrEqual(180);
  });

  it('entry and exit sit in the entrance porch, like every shipped dungeon', () => {
    expect(CINDERFORGE.entry).toEqual({ x: 0, z: 4 });
    expect(CINDERFORGE.exitOffset).toEqual({ x: 0, z: -6 });
  });
});

describe('Cinderforge: the layout is expressible by the real layout type', () => {
  it('the proposed layout produces a valid collider set', () => {
    const colliders = layoutColliders(CINDERFORGE_LAYOUT);
    expect(colliders.length).toBeGreaterThan(0);
    for (const c of colliders) {
      expect(['circle', 'obb']).toContain(c.type);
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.z)).toBe(true);
    }
    // Four walls: two side slabs plus the front and back end walls.
    expect(colliders.filter((c) => c.type === 'obb' && c.hw === 1).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the shipped sanctum shell, so adopting it moves no mob', () => {
    expect(CINDERFORGE_LAYOUT.zMin).toBe(SANCTUM_LAYOUT.zMin);
    expect(CINDERFORGE_LAYOUT.zMax).toBe(SANCTUM_LAYOUT.zMax);
    expect(CINDERFORGE_LAYOUT.sideWallZ).toBe(SANCTUM_LAYOUT.sideWallZ);
    expect(CINDERFORGE_LAYOUT.sideWallHd).toBe(SANCTUM_LAYOUT.sideWallHd);
    expect(CINDERFORGE_LAYOUT.dais).toEqual(SANCTUM_LAYOUT.dais);
    expect(CINDERFORGE_LAYOUT.stubs.map((s) => s.z).sort()).toEqual(
      SANCTUM_LAYOUT.stubs.map((s) => s.z).sort(),
    );
    // It must not widen the room: the shared KayKit wall modules assume the
    // default width, and the def carries no wallX override either.
    expect(CINDERFORGE_LAYOUT.wallX).toBeUndefined();
    expect(CINDERFORGE_LAYOUT.floorHalfX).toBeUndefined();
  });

  it('the dressing it changes stays inside the room', () => {
    for (const p of [...CINDERFORGE_LAYOUT.pillars, ...CINDERFORGE_LAYOUT.tombs]) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(DUNGEON_WALK_HALF_X);
      expect(p.z).toBeGreaterThan(CINDERFORGE_LAYOUT.zMin);
      expect(p.z).toBeLessThan(CINDERFORGE_LAYOUT.zMax);
    }
  });
});

describe('Cinderforge: spawn placement', () => {
  const inBounds = (s: DungeonSpawn, layout: DungeonLayout): boolean =>
    Math.abs(s.x) <= DUNGEON_WALK_HALF_X && s.z > layout.zMin && s.z < layout.zMax;

  it('every spawn is inside the walkable room of the layout it ships on', () => {
    for (const s of CINDERFORGE.spawns) {
      expect(inBounds(s, SHIPPED_LAYOUT), `${s.mobId} at ${s.x},${s.z}`).toBe(true);
    }
  });

  it('no spawn is buried inside a wall, waist stub, pillar or trough', () => {
    // Checked against BOTH the layout the def ships on and the proposed one, so
    // adopting CINDERFORGE_LAYOUT later cannot strand a mob in geometry.
    for (const layout of [SHIPPED_LAYOUT, CINDERFORGE_LAYOUT]) {
      const colliders = layoutColliders(layout);
      for (const s of CINDERFORGE.spawns) {
        for (const c of colliders) {
          expect(blocked(c, s.x, s.z, 0.5), `${s.mobId} at ${s.x},${s.z} inside ${c.type}`).toBe(false);
        }
      }
    }
  });

  it('the entrance porch stays clear so a wiping group can regroup', () => {
    const nearEntry = CINDERFORGE.spawns.filter((s) => s.z < CINDERFORGE.entry.z + 8);
    expect(nearEntry).toEqual([]);
  });

  it('paces three bosses down the three chambers, each with two guards at z-2', () => {
    const bossSpawns = CINDERFORGE.spawns.filter((s) => s.mobId in CINDERFORGE_MOBS && CINDERFORGE_MOBS[s.mobId].boss);
    expect(bossSpawns.map((s) => s.z)).toEqual([72, 114, 146]);
    for (const b of bossSpawns) {
      expect(b.x).toBe(0);
      const guards = CINDERFORGE.spawns.filter((s) => s.z === b.z - 2);
      expect(guards.length, `guards for boss at z ${b.z}`).toBe(2);
    }
    // The final boss stands on the dais the layout reserves for him.
    expect(bossSpawns[2].z).toBe(SHIPPED_LAYOUT.dais.z);
  });

  it('every spawned mob id is defined in the pack, and the summoned add is not pre-placed', () => {
    for (const s of CINDERFORGE.spawns) expect(CINDERFORGE_MOBS[s.mobId], s.mobId).toBeTruthy();
    expect(spawnedIds.has('cf_cinder_wisp')).toBe(false);
    expect(CINDERFORGE_MOBS.cf_cinder_wisp.loot).toEqual([]);
  });
});

describe('Cinderforge: encounter budget', () => {
  const effectiveHp = (m: MobTemplate, level: number): number =>
    (m.hpBase + m.hpPerLevel * level) * (m.elite ? 2.3 : 1);

  it('difficulty rises boss to boss', () => {
    const order = ['cf_forgewarden_bexley', 'cf_slagheart', 'cf_vharkul'];
    const hp = order.map((id) => effectiveHp(CINDERFORGE_MOBS[id], CINDERFORGE_MOBS[id].maxLevel));
    for (let i = 1; i < hp.length; i++) expect(hp[i]).toBeGreaterThan(hp[i - 1]);
    const copper = order.map((id) => CINDERFORGE_MOBS[id].loot[0].copper ?? 0);
    for (let i = 1; i < copper.length; i++) expect(copper[i]).toBeGreaterThan(copper[i - 1]);
  });

  it('the final boss sits under the Claudeholme deathlord, its sibling dungeon peer', () => {
    // ch_veholt (dungeons.ts): hpBase 520, hpPerLevel 64, level 22, copper 3000.
    const veholtHp = (520 + 64 * 22) * 2.3;
    const vharkul = CINDERFORGE_MOBS.cf_vharkul;
    expect(effectiveHp(vharkul, vharkul.maxLevel)).toBeLessThan(veholtHp);
    expect(vharkul.loot[0].copper).toBeLessThan(3000);
    // ...and above the first Claudeholme wing boss (ch_gatewarden, 320/40, L21).
    expect(effectiveHp(vharkul, vharkul.maxLevel)).toBeGreaterThan((320 + 40 * 21) * 2.3);
  });

  it('every boss is a cc-immune elite and drops exactly one archetype piece', () => {
    expect(bosses.length).toBe(3);
    for (const b of bosses) {
      expect(b.elite, b.id).toBe(true);
      expect(b.ccImmune, b.id).toBe(true);
      const groups = new Map<string, number>();
      for (const l of b.loot) {
        if (!l.rollGroup) continue;
        groups.set(l.rollGroup, (groups.get(l.rollGroup) ?? 0) + l.chance);
      }
      expect([...groups.keys()].some((g) => g.endsWith('_set')), `${b.id} set group`).toBe(true);
      for (const [group, total] of groups) {
        if (group.endsWith('_set')) expect(total, `${group}`).toBeCloseTo(1, 5);
        else expect(total, `${group}`).toBeLessThan(1);
      }
    }
  });

  it('trash is elite and cheaper than any boss', () => {
    const cheapestBoss = Math.min(...bosses.map((b) => b.loot[0].copper ?? 0));
    for (const id of spawnedIds) {
      const m = CINDERFORGE_MOBS[id];
      if (m.boss) continue;
      expect(m.elite, `${id} should be elite trash`).toBe(true);
      expect(m.loot[0].copper ?? 0, `${id} copper`).toBeLessThan(cheapestBoss);
    }
  });

  it('uses only mob families that already ship a rig', () => {
    // FAMILY_KEYS in src/render/characters/manifest.ts. Anything outside this set
    // would need new art, which this pack is explicitly not allowed to require.
    const SHIPPED = new Set([
      'beast',
      'humanoid',
      'murloc',
      'spider',
      'kobold',
      'undead',
      'troll',
      'ogre',
      'elemental',
      'dragonkin',
      'demon',
    ]);
    for (const m of Object.values(CINDERFORGE_MOBS)) expect(SHIPPED.has(m.family), m.id).toBe(true);
  });
});
