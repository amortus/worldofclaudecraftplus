import { describe, expect, it, vi } from 'vitest';
import { pickRollGroupWinner, Sim } from '../src/sim/sim';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { LootEntry } from '../src/sim/types';

// Drives the authoritative loot roller (Sim.rollLoot) directly against the
// dungeon mob templates, the same way combat death does, to verify the
// Inventory 2.0 drops fire at roughly their configured rates — and do so
// deterministically (same seed ⇒ identical empirical rate).
function dropRate(mobId: string, itemId: string, seed = 1234, n = 20000): number {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Looter');
  const meta = (sim as unknown as { players: Map<number, unknown> }).players.get(pid);
  const template = MOBS[mobId];
  let hits = 0;
  for (let i = 0; i < n; i++) {
    const mob = createMob(-1, template, template.minLevel, { x: 0, y: 0, z: 0 });
    (sim as unknown as { rollLoot: (m: unknown, meta: unknown) => void }).rollLoot(mob, meta);
    if (mob.loot?.items.some((s) => s.itemId === itemId)) hits++;
  }
  return hits / n;
}

describe('Inventory 2.0 dungeon drops', () => {
  // [mob, item, configured chance] — the per-kill marginal drop probability.
  const CASES: [string, string, number][] = [
    // Drowned dungeon (Sunken Bastion) trash/elite — single-item bonus groups.
    ['bastion_revenant', 'mistveil_cord', 0.06],
    ['tidebound_acolyte', 'mistveil_grips', 0.06],
    // Wyrm dungeon (Gravewyrm Sanctum) trash/elite — two-item partitioned groups.
    ['sanctum_drakonid', 'gravewyrm_mantle', 0.05],
    ['sanctum_drakonid', 'gravewyrm_gauntlets', 0.05],
    ['sanctum_boneguard', 'boundstone_helm', 0.04],
    ['sanctum_boneguard', 'boundstone_girdle', 0.04],
    // Korzul (final boss) — the three archetype epics share the korzul_bonus partition.
    ['korzul_the_gravewyrm', 'deathlords_dread_visage', 0.04],
    ['korzul_the_gravewyrm', 'necromancers_soulspire_mantle', 0.04],
    ['korzul_the_gravewyrm', 'wyrmshadow_talongrips', 0.04],
  ];

  for (const [mob, item, chance] of CASES) {
    it(`${mob} drops ${item} near ${(chance * 100).toFixed(0)}%`, () => {
      const rate = dropRate(mob, item);
      // Wide enough to never flake (~10σ at these n), tight enough to prove the
      // item drops at the intended rate — not 0, not 100%, not an adjacent slice.
      expect(rate).toBeGreaterThan(chance - 0.02);
      expect(rate).toBeLessThan(chance + 0.02);
    });
  }

  it('is deterministic — identical seed reproduces the exact empirical rate', () => {
    expect(dropRate('bastion_revenant', 'mistveil_cord', 7, 5000))
      .toBe(dropRate('bastion_revenant', 'mistveil_cord', 7, 5000));
  });

  it('does not leak items across dungeons (mistveil is drowned-only)', () => {
    expect(dropRate('sanctum_drakonid', 'mistveil_cord')).toBe(0);
    expect(dropRate('bastion_revenant', 'gravewyrm_mantle')).toBe(0);
  });
});

// Roll one full Nythraxis loot event and return the awarded item ids.
function rollNythraxis(seed: number): string[] {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Looter');
  const meta = (sim as unknown as { players: Map<number, unknown> }).players.get(pid);
  const template = MOBS.nythraxis_scourge_of_thornpeak;
  const mob = createMob(-1, template, template.minLevel, { x: 0, y: 0, z: 0 });
  (sim as unknown as { rollLoot: (m: unknown, meta: unknown) => void }).rollLoot(mob, meta);
  return (mob.loot?.items ?? []).map((s) => s.itemId);
}

describe('raid loot cross-group dedup', () => {
  // Reproduces the raid-loot duplicate bug: Nythraxis has 4 independent rollGroups
  // (2 helm slots, 2 shoulder slots) and several items (e.g. soulflame_mantle,
  // crownforged_dreadhelm, nighttalon_crown/shoulderguards) appear in every one of
  // them. With no cross-group duplicate guard, a single kill can hand out the same
  // piece twice (or more), so a 9-person raid's 4 drops can collapse to 2-3 distinct
  // items instead of a spread. This must never happen: every item awarded by one
  // rollLoot call is unique.
  it('never awards the same item id twice from one kill (cross-group dedup)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const ids = rollNythraxis(seed);
      // Every one of the 4 groups sums to 100% chance, so a kill must never come
      // up empty; asserting this keeps the uniqueness check below from passing
      // vacuously against a 0-item corpse.
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // 60s, not the 5s default: every seed here builds a whole `Sim`, and the
    // full map parity pass took the world from 5 zones to 14, so world
    // generation per Sim (and therefore this 200-seed sweep) got several times
    // more expensive. The sweep width is the point of the case - a duplicate
    // only shows on the seeds where two groups actually collide - so the
    // budget moves rather than the seed count.
  }, 60_000);

  it('is deterministic: the same seed reproduces the exact same drop set', () => {
    for (const seed of [7, 42, 1234]) {
      expect(rollNythraxis(seed)).toEqual(rollNythraxis(seed));
    }
  });

  it('draws exactly one rng value per rollGroup, even when a collision falls forward', () => {
    const sim = new Sim({ seed: 5, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Looter');
    const meta = (sim as unknown as { players: Map<number, unknown> }).players.get(pid);
    const template = MOBS.bastion_revenant;
    const originalLoot = template.loot;
    // Synthetic two-group table engineered to collide by construction: g1 always
    // awards 'collision_item'; g2's forced roll of 0.1 partitions to its own
    // collision_item entry, which must fall forward to other_item.
    template.loot = [
      { itemId: 'collision_item', chance: 1, rollGroup: 'dedup_test_1' },
      { itemId: 'collision_item', chance: 0.5, rollGroup: 'dedup_test_2' },
      { itemId: 'other_item', chance: 0.5, rollGroup: 'dedup_test_2' },
    ];
    try {
      const next = vi.spyOn(sim.rng, 'next').mockReturnValue(0.1);
      const mob = createMob(-1, template, template.minLevel, { x: 0, y: 0, z: 0 });
      (sim as unknown as { rollLoot: (m: unknown, meta: unknown) => void }).rollLoot(mob, meta);
      const ids = (mob.loot?.items ?? []).map((s) => s.itemId);
      expect(ids).toEqual(['collision_item', 'other_item']);
      // The draw-order/parity contract: exactly one rng.next() per group, so the
      // dedup guard never shifts the draw sequence of anything rolled after it.
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      template.loot = originalLoot;
      vi.restoreAllMocks();
    }
  });
});

describe('pickRollGroupWinner (cross-group fall-forward)', () => {
  it('returns the plain partition winner when nothing in the group was awarded yet', () => {
    const group: LootEntry[] = [
      { itemId: 'a', chance: 0.5 },
      { itemId: 'b', chance: 0.5 },
    ];
    expect(pickRollGroupWinner(0.1, group, new Set())?.itemId).toBe('a');
    expect(pickRollGroupWinner(0.6, group, new Set())?.itemId).toBe('b');
  });

  it('falls forward to the next entry in the SAME group on a collision, preserving the drop', () => {
    const group: LootEntry[] = [
      { itemId: 'a', chance: 0.5 },
      { itemId: 'b', chance: 0.5 },
    ];
    // roll=0.1 partitions to 'a'; 'a' is already awarded elsewhere this kill, so
    // the slot must still produce 'b' rather than dropping nothing.
    expect(pickRollGroupWinner(0.1, group, new Set(['a']))?.itemId).toBe('b');
  });

  it('wraps around the group when the collision is near the end', () => {
    const group: LootEntry[] = [
      { itemId: 'a', chance: 0.34 },
      { itemId: 'b', chance: 0.33 },
      { itemId: 'c', chance: 0.33 },
    ];
    // roll=0.9 partitions to 'c'; both 'c' and 'a' are already awarded, so the
    // wraparound scan must land on 'b'.
    expect(pickRollGroupWinner(0.9, group, new Set(['c', 'a']))?.itemId).toBe('b');
  });

  it('returns null when the roll lands past every entry (group summing under 100%)', () => {
    const group: LootEntry[] = [{ itemId: 'a', chance: 0.25 }];
    expect(pickRollGroupWinner(0.9, group, new Set())).toBeNull();
  });

  it('returns null only when every entry in the group is already awarded', () => {
    const group: LootEntry[] = [
      { itemId: 'a', chance: 0.5 },
      { itemId: 'b', chance: 0.5 },
    ];
    expect(pickRollGroupWinner(0.1, group, new Set(['a', 'b']))).toBeNull();
  });
});
