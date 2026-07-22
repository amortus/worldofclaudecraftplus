// The shared same-faction ally scan behind the mob support mechanics (Mend,
// Ward, Rally, War Cadence): Sim.findNearbyAllies queries the SpatialGrid
// instead of walking the full entity map. The grid yields entities in
// cell-bucket order, so the helper must re-sort by id to preserve the exact
// entity-creation iteration order the old entities.values() scan had: mendAlly
// draws one rng value PER wounded ally, so any ordering drift is a determinism
// break, not just cosmetics.
import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import { dist2d, type Entity } from '../src/sim/types';

function makeSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true });
}

// Plant a mob of the given template near a base point and register it with the
// sim (addEntity keeps the spatial grid roster-exact on spawn).
function plant(sim: Sim, templateId: string, x: number, z: number): Entity {
  const tmpl = MOBS[templateId];
  const mob = createMob((sim as any).nextId++, tmpl, tmpl.minLevel, { x, y: 0, z });
  mob.hostile = true;
  (sim as any).addEntity(mob);
  return mob;
}

function scanAllies(sim: Sim, mob: Entity, radius: number, pred?: (a: Entity) => boolean) {
  return (sim as any).findNearbyAllies(mob, radius, pred) as Entity[];
}

describe('findNearbyAllies (grid-backed mob support scan)', () => {
  it('matches the old brute-force entity-map scan exactly, in ascending id order', () => {
    const sim = makeSim();
    // A quiet spot away from the seeded camps so the roster is fully controlled.
    const base = { x: -400, z: -900 };
    const caster = plant(sim, 'gravecaller_mender', base.x, base.z);
    plant(sim, 'gravecaller_cultist', base.x - 15, base.z); // different grid cell
    plant(sim, 'gravecaller_cultist', base.x + 10, base.z + 5);
    plant(sim, 'gravecaller_cultist', base.x + 100, base.z); // out of radius
    const pet = plant(sim, 'gravecaller_cultist', base.x + 3, base.z);
    pet.ownerId = sim.playerId; // owned: must be skipped
    const corpse = plant(sim, 'gravecaller_cultist', base.x - 3, base.z);
    corpse.dead = true; // corpse: must be skipped
    const friendly = plant(sim, 'gravecaller_cultist', base.x, base.z + 4);
    friendly.hostile = false; // other faction: must be skipped

    const radius = 16;
    const got = scanAllies(sim, caster, radius).map((e) => e.id);
    const bruteForce: number[] = [];
    for (const ally of sim.entities.values()) {
      if (ally.kind !== 'mob' || ally.dead || ally.ownerId !== null) continue;
      if (ally.hostile !== caster.hostile) continue;
      if (dist2d(ally.pos, caster.pos) > radius) continue;
      bruteForce.push(ally.id);
    }
    expect(got).toEqual(bruteForce);
    expect(got).toEqual([...got].sort((a, b) => a - b));
    expect(got).toContain(caster.id); // the caster mends/wards itself too
  });

  it('returns id order even when grid bucket order was churned by movement', () => {
    const sim = makeSim();
    const base = { x: -400, z: -700 };
    const caster = plant(sim, 'gravecaller_mender', base.x, base.z);
    const a = plant(sim, 'gravecaller_cultist', base.x + 2, base.z);
    const b = plant(sim, 'gravecaller_cultist', base.x + 4, base.z);
    // Walk the LOWER-id ally out of the cell and back: it re-enters at the END
    // of the cell's bucket, so raw bucket order is now [caster, b, a] while
    // creation order is [caster, a, b].
    a.pos.x = base.x + 200;
    sim.rebucket(a);
    a.pos.x = base.x + 2;
    sim.rebucket(a);
    const got = scanAllies(sim, caster, 16).map((e) => e.id);
    expect(got).toEqual([caster.id, a.id, b.id]);
  });

  it('applies the caller predicate on top of the faction/radius filter (wounded-only)', () => {
    const sim = makeSim();
    const base = { x: -400, z: -500 };
    const caster = plant(sim, 'gravecaller_mender', base.x, base.z);
    const wounded = plant(sim, 'gravecaller_cultist', base.x + 3, base.z);
    wounded.hp = Math.floor(wounded.maxHp / 2);
    const healthy = plant(sim, 'gravecaller_cultist', base.x - 3, base.z);
    const got = scanAllies(sim, caster, 16, (ally) => ally.hp < ally.maxHp).map((e) => e.id);
    expect(got).toEqual([wounded.id]);
    expect(got).not.toContain(healthy.id);
  });
});

describe('mob support mechanics stay deterministic on the grid scan', () => {
  // Same seed + same script -> identical outcomes, with a mender pack actually
  // proccing Mend (one rng draw per wounded ally per pulse) plus a warded and
  // rallied pack member mix. If the scan order or roster ever drifts between
  // runs, the per-ally heal rolls land on different allies and the signatures
  // diverge.
  function runScenario(seed: number): string {
    const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true });
    const p = sim.player;
    p.maxHp = 1000000;
    p.hp = 1000000;
    const base = { x: p.pos.x, z: p.pos.z };
    const pack = [
      plant(sim, 'gravecaller_mender', base.x + 4, base.z),
      plant(sim, 'gravecaller_mender', base.x - 5, base.z + 3),
      plant(sim, 'gravecaller_cultist', base.x + 3, base.z - 6),
      plant(sim, 'gravecaller_cultist', base.x - 2, base.z + 8),
      plant(sim, 'gravecaller_cultist', base.x + 7, base.z + 7),
    ];
    // Wound the whole pack and pull it, so Mend has real targets every pulse
    // and the pack stays in combat next to the (unkillable) player.
    for (const m of pack) {
      m.maxHp = 4000;
      m.hp = 4000;
      (sim as any).dealDamage(p, m, 1500, false, 'physical', null, 'hit', true);
    }
    for (let t = 0; t < 20 * 15; t++) sim.tick();
    return JSON.stringify(
      pack.map((m) => [
        m.id,
        Math.round(m.hp * 1000),
        m.auras.map((a) => [a.id, Math.round(a.remaining * 100)]),
      ]),
    );
  }

  it('same seed + same script twice produces identical outcomes', () => {
    const first = runScenario(77);
    const second = runScenario(77);
    expect(second).toBe(first);
    // The scenario is only meaningful if the menders actually healed: the pack
    // was dropped to 2500hp and mob out-of-combat regen alone cannot explain a
    // full pulse of Mend, so require SOME healing to have happened.
    const hp = (JSON.parse(first) as [number, number, unknown][]).map(([, h]) => h);
    expect(Math.max(...hp)).toBeGreaterThan(2500 * 1000);
  });
});
