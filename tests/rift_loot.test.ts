import { describe, expect, it } from 'vitest';
import { RIFT_ITEMS, RIFT_LEGENDARY_IDS } from '../src/sim/content/rift';
import { ITEMS } from '../src/sim/data';
import { Rng } from '../src/sim/rng';
import {
  buildRiftFloor,
  RIFT_LOOT_DRAWS,
  RIFT_LOOT_POOLS,
  RIFT_LOOT_RATES,
  RIFT_MAX_FLOORS,
  RIFT_RANK_BASE_LEVEL,
  riftFloorCount,
  riftFloorRateMultiplier,
  rollRiftLoot,
  type RiftLootDrop,
  type RiftRank,
} from '../src/sim/rift';

const RANKS: RiftRank[] = ['C', 'B', 'A', 'S'];

// data.ts does not yet spread RIFT_ITEMS into ITEMS (that one-line hookup lands
// with the runtime wave). Resolving through the union keeps this suite honest
// both before and after, and the collision test below is what guarantees the
// union is unambiguous.
const ALL_ITEMS = { ...ITEMS, ...RIFT_ITEMS };

/** An Rng that counts how many values were pulled out of it. */
function countingRng(seed: number): { rng: Rng; draws: () => number } {
  const rng = new Rng(seed);
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = () => {
    n++;
    return next();
  };
  return { rng, draws: () => n };
}

const ids = (drops: RiftLootDrop[]) => drops.map((d) => d.itemId).join(',');

// ---------------------------------------------------------------------------
// The draw contract: the load-bearing invariant of this module.
// ---------------------------------------------------------------------------

describe('rift loot draw contract', () => {
  it('consumes exactly RIFT_LOOT_DRAWS values on every call, boss or trash', () => {
    for (const rank of RANKS) {
      for (let floor = 0; floor < RIFT_MAX_FLOORS; floor++) {
        for (const isBoss of [false, true]) {
          // Many seeds per case: a variable-count bug would only show on the
          // seeds where an extra item actually dropped.
          for (let seed = 1; seed <= 200; seed++) {
            const { rng, draws } = countingRng(seed * 7919 + floor);
            rollRiftLoot(rank, floor, isBoss, rng);
            expect(draws()).toBe(RIFT_LOOT_DRAWS);
          }
        }
      }
    }
  });

  it('leaves the shared stream in the same place regardless of what dropped', () => {
    // The real desync scenario: two worlds roll the same kill, one gets a
    // legendary and one does not, and every later draw must still line up. Here
    // that is simulated by rolling the same rank/floor from many different
    // states and checking the stream position afterwards is state-independent.
    const after: number[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new Rng(seed);
      rollRiftLoot('S', 4, true, rng);
      // Pull one more value and record it; then re-derive it from a fresh Rng
      // advanced by exactly RIFT_LOOT_DRAWS. They must agree.
      const nextAfterRoll = rng.next();
      const control = new Rng(seed);
      for (let i = 0; i < RIFT_LOOT_DRAWS; i++) control.next();
      expect(nextAfterRoll).toBe(control.next());
      after.push(nextAfterRoll);
    }
    // Non-vacuous: the follow-on values genuinely differ between seeds.
    expect(new Set(after).size).toBeGreaterThan(40);
  });

  it('is the same count even when a call returns nothing at all', () => {
    let empty = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const { rng, draws } = countingRng(seed);
      const drops = rollRiftLoot('C', 0, false, rng);
      expect(draws()).toBe(RIFT_LOOT_DRAWS);
      if (drops.length === 0) empty++;
    }
    // C trash is mostly empty, so the case above is actually exercised.
    expect(empty).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// Determinism, and a divergence control so the assertion is not vacuous.
// ---------------------------------------------------------------------------

describe('rift loot determinism', () => {
  it('gives identical drops for the same rank, floor and seed', () => {
    for (const rank of RANKS) {
      for (let floor = 0; floor < RIFT_MAX_FLOORS; floor++) {
        for (const isBoss of [false, true]) {
          for (const seed of [1, 42, 1234, 20260731, 0x7fffffff]) {
            const a = rollRiftLoot(rank, floor, isBoss, new Rng(seed));
            const b = rollRiftLoot(rank, floor, isBoss, new Rng(seed));
            expect(a).not.toBe(b);
            expect(a).toEqual(b);
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
          }
        }
      }
    }
  });

  it('DIVERGES on a different seed, so the determinism test above means something', () => {
    // Boss rolls always return at least the guaranteed piece, so comparing the
    // item lists across seeds is a real comparison, not empty vs empty.
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      seen.add(ids(rollRiftLoot('S', 4, true, new Rng(seed))));
    }
    expect(seen.size).toBeGreaterThan(20);

    // And an explicit pair, so a failure names the case.
    const a = rollRiftLoot('S', 4, true, new Rng(1));
    let diverged = false;
    for (let seed = 2; seed <= 20 && !diverged; seed++) {
      diverged = ids(rollRiftLoot('S', 4, true, new Rng(seed))) !== ids(a);
    }
    expect(diverged).toBe(true);
  });

  it('gives different drops for different floors at the same seed (depth matters)', () => {
    const byFloor = new Set<string>();
    for (let floor = 0; floor < RIFT_MAX_FLOORS; floor++) {
      for (let seed = 1; seed <= 400; seed++) {
        byFloor.add(`${floor}:${ids(rollRiftLoot('S', floor, true, new Rng(seed)))}`);
      }
    }
    expect(riftFloorRateMultiplier(0)).toBe(1);
    expect(riftFloorRateMultiplier(RIFT_MAX_FLOORS - 1)).toBeGreaterThan(1);
    // A malformed index can never inflate a rate past the deepest real floor.
    expect(riftFloorRateMultiplier(99)).toBe(riftFloorRateMultiplier(RIFT_MAX_FLOORS - 1));
    expect(riftFloorRateMultiplier(-5)).toBe(1);
    expect(byFloor.size).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// Content integrity.
// ---------------------------------------------------------------------------

describe('rift loot pools', () => {
  it('references only items that actually exist', () => {
    for (const rank of RANKS) {
      const pools = RIFT_LOOT_POOLS[rank];
      for (const key of ['trash', 'boss', 'chase'] as const) {
        expect(pools[key].length, `${rank}.${key} is empty`).toBeGreaterThan(0);
        for (const id of pools[key]) {
          expect(ALL_ITEMS[id], `${rank}.${key} references unknown item ${id}`).toBeDefined();
        }
        // No id twice inside one pool: a uniform pick would silently weight it.
        expect(new Set(pools[key]).size).toBe(pools[key].length);
      }
    }
    for (const id of RIFT_LEGENDARY_IDS) expect(ALL_ITEMS[id]).toBeDefined();
  });

  it('mints exactly the three legendaries and collides with no existing item', () => {
    const riftIds = Object.keys(RIFT_ITEMS);
    expect(riftIds.sort()).toEqual([...RIFT_LEGENDARY_IDS].sort());
    for (const id of riftIds) {
      // data.ts merges item tables by spread, so a duplicate id would silently
      // overwrite an existing piece of gear. RIFT_ITEMS is now part of that merge,
      // so no-collision is proven by every rift id resolving to the RIFT definition:
      // had an earlier table owned the id, the spread would have replaced it.
      expect(ITEMS[id]?.name, `${id} was overwritten in ITEMS`).toBe(RIFT_ITEMS[id].name);
      expect(id.startsWith('rift_')).toBe(true);
      expect(RIFT_ITEMS[id].quality).toBe('legendary');
    }
  });

  it('never drops a Claudexxaramas tier-1 SET piece or Mournlight', () => {
    // The raid must stay the only source of its own set and of the single best
    // weapon in the game; a repeatable procedural dungeon may not undercut it.
    const forbidden = /^(mp_|vw_|ng_|mournlight)/;
    for (const rank of RANKS) {
      const pools = RIFT_LOOT_POOLS[rank];
      for (const id of [...pools.trash, ...pools.boss, ...pools.chase]) {
        expect(forbidden.test(id), `${rank} pool leaks raid set gear: ${id}`).toBe(false);
      }
    }
  });

  it('keeps the legendaries at or under the raid off-set epics', () => {
    const pts = (id: string) => {
      const s = ALL_ITEMS[id].stats ?? {};
      return (s.str ?? 0) + (s.agi ?? 0) + (s.int ?? 0) + (s.spi ?? 0) + (s.sta ?? 0);
    };
    const dps = (id: string) => {
      const w = ALL_ITEMS[id].weapon;
      return w ? (w.min + w.max) / 2 / w.speed : 0;
    };
    // cx_ep_* are the raid's off-set diversity epics; mournlight is the fork's
    // best weapon. A rift legendary is prestige colour, not power creep.
    const cxWeaponPts = Math.min(pts('cx_ep_war'), pts('cx_ep_mag'), pts('cx_ep_rog'));
    for (const id of RIFT_LEGENDARY_IDS) {
      expect(pts(id), `${id} stat budget`).toBeLessThanOrEqual(cxWeaponPts);
      expect(pts(id)).toBeLessThan(pts('mournlight'));
      expect(dps(id)).toBeLessThan(dps('cx_ep_rog') + 1);
    }
    expect(dps('rift_aetherbreach')).toBeLessThan(dps('cx_ep_war'));
    expect(dps('rift_voidhymn')).toBeLessThan(dps('cx_ep_mag'));
    expect(dps('rift_silentfang')).toBeLessThan(dps('cx_ep_rog'));
  });
});

// ---------------------------------------------------------------------------
// Rank monotonicity: a higher rank is never worse.
// ---------------------------------------------------------------------------

const QUALITY_INDEX = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

function poolQuality(pool: readonly string[]): number {
  let sum = 0;
  for (const id of pool) sum += QUALITY_INDEX.indexOf(ALL_ITEMS[id].quality ?? 'common');
  return sum / pool.length;
}

function poolStatPoints(pool: readonly string[]): number {
  let sum = 0;
  for (const id of pool) {
    const s = ALL_ITEMS[id].stats ?? {};
    sum += (s.str ?? 0) + (s.agi ?? 0) + (s.int ?? 0) + (s.spi ?? 0) + (s.sta ?? 0);
  }
  return sum / pool.length;
}

describe('rift loot rank monotonicity', () => {
  it('never lowers a pool quality or stat budget as rank climbs', () => {
    for (const key of ['trash', 'boss', 'chase'] as const) {
      for (let i = 1; i < RANKS.length; i++) {
        const lo = RIFT_LOOT_POOLS[RANKS[i - 1]][key];
        const hi = RIFT_LOOT_POOLS[RANKS[i]][key];
        expect(poolQuality(hi), `${key} quality ${RANKS[i - 1]}->${RANKS[i]}`).toBeGreaterThanOrEqual(
          poolQuality(lo),
        );
        expect(poolStatPoints(hi), `${key} stats ${RANKS[i - 1]}->${RANKS[i]}`).toBeGreaterThan(
          poolStatPoints(lo),
        );
      }
    }
  });

  it('keeps each rank ordered trash < boss < chase', () => {
    for (const rank of RANKS) {
      const p = RIFT_LOOT_POOLS[rank];
      expect(poolStatPoints(p.boss), `${rank} boss vs trash`).toBeGreaterThan(
        poolStatPoints(p.trash),
      );
      expect(poolStatPoints(p.chase), `${rank} chase vs boss`).toBeGreaterThan(
        poolStatPoints(p.boss),
      );
    }
  });

  it('never lowers a drop rate as rank climbs', () => {
    const keys = Object.keys(RIFT_LOOT_RATES.C) as (keyof typeof RIFT_LOOT_RATES.C)[];
    for (const key of keys) {
      for (let i = 1; i < RANKS.length; i++) {
        expect(
          RIFT_LOOT_RATES[RANKS[i]][key],
          `${key} ${RANKS[i - 1]}->${RANKS[i]}`,
        ).toBeGreaterThanOrEqual(RIFT_LOOT_RATES[RANKS[i - 1]][key]);
      }
    }
  });

  it('yields at least as many drops per boss kill at a higher rank, empirically', () => {
    const perKill = RANKS.map((rank) => {
      let n = 0;
      for (let seed = 1; seed <= 20000; seed++) n += rollRiftLoot(rank, 4, true, new Rng(seed)).length;
      return n / 20000;
    });
    for (let i = 1; i < perKill.length; i++) {
      expect(perKill[i], `${RANKS[i - 1]}->${RANKS[i]} boss yield`).toBeGreaterThan(perKill[i - 1]);
    }
    // Every boss kill pays at least the guaranteed piece.
    expect(perKill[0]).toBeGreaterThanOrEqual(1);
  });

  it('yields at least as many drops per trash kill at a higher rank, empirically', () => {
    const perKill = RANKS.map((rank) => {
      let n = 0;
      for (let seed = 1; seed <= 20000; seed++)
        n += rollRiftLoot(rank, 2, false, new Rng(seed)).length;
      return n / 20000;
    });
    for (let i = 1; i < perKill.length; i++) {
      expect(perKill[i], `${RANKS[i - 1]}->${RANKS[i]} trash yield`).toBeGreaterThan(
        perKill[i - 1],
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Boss and trash are different things, and the legendary is rare.
// ---------------------------------------------------------------------------

describe('rift loot boss vs trash', () => {
  it('always pays a boss kill and only sometimes pays a trash kill', () => {
    for (const rank of RANKS) {
      let bossEmpty = 0;
      let trashPaid = 0;
      for (let seed = 1; seed <= 5000; seed++) {
        if (rollRiftLoot(rank, 3, true, new Rng(seed)).length === 0) bossEmpty++;
        if (rollRiftLoot(rank, 3, false, new Rng(seed)).length > 0) trashPaid++;
      }
      expect(bossEmpty, `${rank} boss must always drop`).toBe(0);
      expect(trashPaid, `${rank} trash must sometimes drop`).toBeGreaterThan(0);
      expect(trashPaid / 5000, `${rank} trash must usually drop nothing`).toBeLessThan(0.25);
    }
  });

  it('draws boss and trash from different tables', () => {
    // Trash never reaches the chase pool or the legendaries; the boss never
    // hands out the consumable trickle.
    const chase = new Set(RIFT_LOOT_POOLS.S.chase);
    const legendary = new Set(RIFT_LEGENDARY_IDS);
    const consumables = new Set(['healing_potion', 'mana_potion', 'roasted_boar']);
    let trashSeen = 0;
    let bossSeen = 0;
    for (let seed = 1; seed <= 30000; seed++) {
      for (const d of rollRiftLoot('S', 5, false, new Rng(seed))) {
        trashSeen++;
        expect(chase.has(d.itemId)).toBe(false);
        expect(legendary.has(d.itemId)).toBe(false);
      }
      for (const d of rollRiftLoot('S', 5, true, new Rng(seed))) {
        bossSeen++;
        expect(consumables.has(d.itemId)).toBe(false);
      }
    }
    expect(trashSeen).toBeGreaterThan(1000);
    expect(bossSeen).toBeGreaterThan(30000);
  });

  it('never hands the same boss the same item twice in one kill', () => {
    for (const rank of RANKS) {
      for (let seed = 1; seed <= 20000; seed++) {
        const drops = rollRiftLoot(rank, 4, true, new Rng(seed));
        expect(new Set(drops.map((d) => d.itemId)).size).toBe(drops.length);
      }
    }
  });

  it('stacks the consumable trickle and never stacks gear', () => {
    const consumables = new Set(['healing_potion', 'mana_potion', 'roasted_boar']);
    let stacks = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      for (const d of rollRiftLoot('S', 2, false, new Rng(seed))) {
        if (consumables.has(d.itemId)) {
          expect(d.count).toBe(2);
          stacks++;
        } else {
          expect(d.count).toBe(1);
        }
      }
    }
    expect(stacks).toBeGreaterThan(100);
  });
});

describe('rift legendary chase rate', () => {
  const SAMPLE = 400000;
  const legendary = new Set(RIFT_LEGENDARY_IDS);

  const measure = (rank: RiftRank) => {
    let hits = 0;
    for (let seed = 1; seed <= SAMPLE; seed++) {
      for (const d of rollRiftLoot(rank, 4, true, new Rng(seed))) {
        if (legendary.has(d.itemId)) hits++;
      }
    }
    return hits / SAMPLE;
  };

  it('is in the intended order of magnitude, not the 4% upstream had to walk back', () => {
    // Documented intent: RIFT_LOOT_RATES[rank].legendaryPerItem is the chance of
    // one NAMED legendary, so any-legendary is that times the pool size.
    for (const rank of RANKS) {
      const expected = RIFT_LOOT_RATES[rank].legendaryPerItem * RIFT_LEGENDARY_IDS.length;
      const observed = measure(rank);
      if (expected === 0) {
        expect(observed, `${rank} must never drop a legendary`).toBe(0);
        continue;
      }
      expect(observed, `${rank} legendary rate`).toBeGreaterThan(expected * 0.75);
      expect(observed, `${rank} legendary rate`).toBeLessThan(expected * 1.25);
    }
  });

  it('keeps the per-item rate at the 0.3% order of magnitude at the top rank', () => {
    const perItem = RIFT_LOOT_RATES.S.legendaryPerItem;
    expect(perItem).toBeGreaterThan(0.0005);
    expect(perItem).toBeLessThanOrEqual(0.005);
    // A named legendary should take hundreds of top-rank clears, not tens.
    expect(1 / perItem).toBeGreaterThan(200);
  });

  it('spreads the chase evenly over the three legendaries', () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= SAMPLE; seed++) {
      for (const d of rollRiftLoot('S', 5, true, new Rng(seed))) {
        if (legendary.has(d.itemId)) seen.set(d.itemId, (seen.get(d.itemId) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(RIFT_LEGENDARY_IDS.length);
    const counts = [...seen.values()];
    expect(Math.min(...counts) / Math.max(...counts)).toBeGreaterThan(0.7);
  });
});

// ---------------------------------------------------------------------------
// The economy claim: a rift must not out-farm the authored endgame.
// ---------------------------------------------------------------------------

/** How many trash kills a real S rift actually asks for, taken from the
 * generator rather than a guess in a comment, so the budget check below cannot
 * silently drift if floor sizes change. */
function meanTrashPerRun(seeds: number): number {
  let total = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const floors = riftFloorCount(seed);
    for (let i = 0; i < floors; i++) {
      total += buildRiftFloor(seed, RIFT_RANK_BASE_LEVEL.S, i).spawns.filter(
        (s) => s.role === 'trash',
      ).length;
    }
  }
  return total / seeds;
}

describe('rift loot budget against existing content', () => {
  it('pays an S clear far less epic gear than a Claudeholme clear', () => {
    // Claudeholme: 8 bosses, each a guaranteed tier-0.55 epic, plus Veholt's 0.6
    // chase group. That is the 8.6 below, straight from content/dungeons.ts.
    const CLAUDEHOLME_EPICS_PER_CLEAR = 8 * 1 + 0.6;
    const epic = (id: string) =>
      ['epic', 'legendary'].includes(ALL_ITEMS[id].quality ?? 'common');

    const trashPerRun = meanTrashPerRun(120);
    expect(trashPerRun).toBeGreaterThan(20); // sanity: the generator does spawn packs

    const SAMPLE = 40000;
    let bossEpics = 0;
    for (let seed = 1; seed <= SAMPLE; seed++) {
      for (const d of rollRiftLoot('S', 4, true, new Rng(seed))) if (epic(d.itemId)) bossEpics++;
    }
    let trashEpics = 0;
    for (let seed = 1; seed <= SAMPLE; seed++) {
      for (const d of rollRiftLoot('S', 2, false, new Rng(seed))) if (epic(d.itemId)) trashEpics++;
    }
    // A rift is ONE boss plus that run's trash, against Claudeholme's EIGHT bosses.
    const perClear = bossEpics / SAMPLE + (trashEpics / SAMPLE) * trashPerRun;
    expect(perClear).toBeGreaterThan(1); // still worth running
    expect(perClear).toBeLessThan(CLAUDEHOLME_EPICS_PER_CLEAR / 3);
  });

  it('never drops the reputation-vendor tier-0.5 set', () => {
    // The Dawn of Claude tier 0.5 (dawnguard_/dawn_/dawnstalker_) is bought with
    // standing, not looted. A rift shortcut would gut the reputation grind.
    const vendorOnly = /^(dawnguard_|dawn_|dawnstalker_)/;
    for (const rank of RANKS) {
      const p = RIFT_LOOT_POOLS[rank];
      for (const id of [...p.trash, ...p.boss, ...p.chase]) {
        expect(vendorOnly.test(id), `${rank} pool leaks vendor tier 0.5: ${id}`).toBe(false);
      }
    }
  });
});
