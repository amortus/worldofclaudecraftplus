// The Dawn of Claude loop, end to end: earn standing -> the quartermaster's rack
// unlocks tier by tier -> the piece you buy is one your class can wear.
//
// WHY THIS FILE EXISTS. The faction's tier-0.5 reward set was authored inside the
// Ashen Wastes (`content/zone4.ts`), which the full-map parity pass RETIRED (see
// the PARKED CONTENT banner in `src/sim/data.ts`). The faction survived the
// retirement, the shelf did not, and a faction you can grind with nothing to
// spend it on reads as a bug. Worse, the retirement took the repeatable half of
// the EARNING side with it too: the six Cinderforge quests pay 2850 reputation
// in total and Friendly begins at 3000, so for a while the faction could not
// reach its own first standing.
//
// So this is deliberately not a unit test of `reputationFor`. It drives a real
// Sim: it clears the Cinderforge over and over through the live kill path, reads
// the standing that the live content actually produces, and buys through
// `Sim.buyItem` (the authoritative vendor path, gates included). It fails if a
// future content pass strands either half of the loop again.

import { describe, expect, it } from 'vitest';

import { DAWN_TIER05_ITEMS, DAWN_TIER05_VENDOR_REQS } from '../src/sim/content/dawn_of_claude';
import { ZONE4_ITEMS } from '../src/sim/content/zone4';
import { createMob } from '../src/sim/entity';
import { canEquipItem } from '../src/sim/equipment_rules';
import { DAWN_QUARTERMASTER_NPC_ID, DUNGEONS, ITEMS, MOBS, NPCS, QUESTS } from '../src/sim/data';
import { requiredLevelFor } from '../src/sim/item_level_req';
import { REP_TIERS, type ReputationStanding, reputationFor } from '../src/sim/reputation';
import { Sim } from '../src/sim/sim';
import { type Entity, MAX_LEVEL, type PlayerClass } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const FACTION = 'dawn_of_claude';
const SET_IDS = Object.keys(DAWN_TIER05_ITEMS);

/** Cumulative points at which each gated standing begins (src/sim/reputation.ts). */
function floorOf(standing: ReputationStanding): number {
  const tier = REP_TIERS.find((t) => t.standing === standing);
  if (!tier) throw new Error(`unknown standing ${standing}`);
  return tier.floor;
}

/** Ids on this vendor's rack gated at exactly `standing`. */
function rowsGatedAt(standing: ReputationStanding): string[] {
  return SET_IDS.filter((id) => DAWN_TIER05_VENDOR_REQS[id]?.standing === standing);
}

const GATED_STANDINGS: ReputationStanding[] = ['friendly', 'honored', 'revered', 'exalted'];

// ---------------------------------------------------------------------------
// The shelf: the set survived the retirement intact and is on a real vendor.
// ---------------------------------------------------------------------------

describe('Dawn of Claude: the tier-0.5 set is in the world', () => {
  it('extracts the 24 pieces byte-for-byte from the parked zone (no silent rebalance)', () => {
    // The ids are defined twice on purpose: zone4.ts keeps its copies so the
    // retirement stays reversible in one line. This is the drift guard.
    expect(SET_IDS).toHaveLength(24);
    for (const id of SET_IDS) {
      expect(ZONE4_ITEMS[id], `${id} is missing from the parked table`).toBeDefined();
      expect(DAWN_TIER05_ITEMS[id], id).toEqual(ZONE4_ITEMS[id]);
    }
  });

  it('every piece reaches ITEMS with a price', () => {
    for (const id of SET_IDS) {
      expect(ITEMS[id], id).toBeDefined();
      expect(ITEMS[id].name, id).toBe(DAWN_TIER05_ITEMS[id].name);
      expect(ITEMS[id].buyValue, `${id} has no buyValue, so no vendor can sell it`).toBeGreaterThan(0);
    }
  });

  it('a single vendor stocks all 24, each behind its own standing gate', () => {
    const sellers = Object.values(NPCS).filter((npc) =>
      SET_IDS.some((id) => npc.vendorItems?.includes(id)),
    );
    expect(sellers.map((n) => n.id)).toEqual([DAWN_QUARTERMASTER_NPC_ID]);

    const vendor = NPCS[DAWN_QUARTERMASTER_NPC_ID];
    for (const id of SET_IDS) {
      expect(vendor.vendorItems, `${id} is not on the rack`).toContain(id);
      const req = vendor.vendorReqs?.[id];
      expect(req, `${id} is sold with no reputation gate`).toBeDefined();
      expect(req!.faction, id).toBe(FACTION);
      expect(req!.standing, id).toBe(DAWN_TIER05_VENDOR_REQS[id].standing);
    }
    // The wardsmith's own shipped stock is untouched by the re-homing.
    for (const id of ['wardplate_cuirass', 'nightweave_tunic', 'veilcloth_robe']) {
      expect(vendor.vendorItems, id).toContain(id);
    }
  });

  it('the gate ladder is the parked one: 9 Friendly, 6 Honored, 6 Revered, 3 Exalted', () => {
    expect(rowsGatedAt('friendly')).toHaveLength(9);
    expect(rowsGatedAt('honored')).toHaveLength(6);
    expect(rowsGatedAt('revered')).toHaveLength(6);
    // The three mainhands are the last unlock, one per archetype set.
    expect(rowsGatedAt('exalted').sort()).toEqual(
      ['dawn_scepter', 'dawnguard_blade', 'dawnstalker_dagger'].sort(),
    );
  });

  it('every piece is wearable at the cap by each class it targets', () => {
    for (const id of SET_IDS) {
      const def = ITEMS[id];
      expect(def.requiredClass?.length, `${id} targets no class`).toBeGreaterThan(0);
      for (const cls of def.requiredClass!) {
        expect(canEquipItem(cls, def), `${cls} cannot equip ${id}`).toBe(true);
      }
      expect(requiredLevelFor(def), id).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });
});

// ---------------------------------------------------------------------------
// The earning side: the faction must still be able to reach every gate.
// ---------------------------------------------------------------------------

describe('Dawn of Claude: the faction can still be earned to Exalted', () => {
  const questRep = Object.values(QUESTS)
    .filter((q) => q.repReward?.faction === FACTION)
    .reduce((sum, q) => sum + (q.repReward?.amount ?? 0), 0);
  const repeatable = Object.values(MOBS).filter((m) => m.repOnKill?.faction === FACTION);

  it('one-time quest reputation alone cannot even reach the cheapest gate', () => {
    // Not an aspiration, a statement of fact that makes the next test load
    // bearing: every quest in the world that pays this faction, summed, is under
    // Friendly. Without a repeatable source the whole rack is permanently greyed.
    expect(questRep).toBeGreaterThan(0);
    expect(questRep).toBeLessThan(floorOf('friendly'));
  });

  it('a repeatable source exists, so Exalted is reachable', () => {
    expect(repeatable.length, 'no mob in the world grants Dawn of Claude reputation').toBeGreaterThan(0);
    const perClear = DUNGEONS.cinderforge.spawns.reduce(
      (sum, s) => sum + (MOBS[s.mobId]?.repOnKill?.amount ?? 0),
      0,
    );
    expect(perClear, 'the Cinderforge pays no reputation for a full clear').toBeGreaterThan(0);
    // Reachable, and reachable by grinding rather than by accident: a long
    // Argent-Dawn-shaped climb, not a handful of runs.
    const clears = Math.ceil((floorOf('exalted') - questRep) / perClear);
    expect(clears).toBeGreaterThan(10);
    expect(clears).toBeLessThan(200);
  });

  it('no summoned add pays reputation (a mechanic is not a reward)', () => {
    const summoned = new Set(
      Object.values(MOBS)
        .map((m) => m.summonAdds?.mobId)
        .filter((id): id is string => !!id),
    );
    for (const mob of repeatable) {
      expect(summoned.has(mob.id), `${mob.id} is a summoned add and pays reputation`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The loop itself, driven through a live Sim.
// ---------------------------------------------------------------------------

function teleportTo(sim: Sim, e: Entity, x: number, z: number) {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  e.vx = 0;
  e.vz = 0;
  e.vy = 0;
  e.onGround = true;
}

function vendorEntity(sim: Sim): Entity {
  const npc = [...sim.entities.values()].find(
    (e) => e.kind === 'npc' && e.templateId === DAWN_QUARTERMASTER_NPC_ID,
  );
  if (!npc) throw new Error('the Dawn quartermaster is not in the world');
  return npc;
}

/** Kill one mob of `templateId` next to the player, through the live damage path. */
function killOne(sim: Sim, templateId: string, nextId: number): void {
  const tpl = MOBS[templateId];
  const p = sim.player;
  const mob = createMob(nextId, tpl, tpl.maxLevel, sim.groundPos(p.pos.x + 2, p.pos.z + 2));
  sim.entities.set(nextId, mob);
  // noRage so a warrior's rage bar is not part of what this test measures.
  (sim as unknown as { dealDamage: Sim['dealDamage'] }).dealDamage(
    p,
    mob,
    mob.maxHp * 10,
    false,
    'physical',
    null,
    'hit',
    true,
  );
  sim.entities.delete(nextId);
}

/** One full Cinderforge clear: every authored spawn, once. */
function clearCinderforge(sim: Sim, cursor: { id: number }): void {
  for (const spawn of DUNGEONS.cinderforge.spawns) {
    killOne(sim, spawn.mobId, cursor.id++);
  }
}

function repOf(sim: Sim): number {
  return sim.reputation[FACTION] ?? 0;
}

function standingOf(sim: Sim): ReputationStanding {
  return reputationFor(repOf(sim)).standing;
}

/** Try to buy `itemId` from the quartermaster; true when it lands in the bags. */
function tryBuy(sim: Sim, itemId: string): boolean {
  const before = sim.countItem(itemId);
  sim.buyItem(vendorEntity(sim).id, itemId);
  return sim.countItem(itemId) > before;
}

function setUpBuyer(cls: PlayerClass): { sim: Sim; cursor: { id: number } } {
  const sim = new Sim({ seed: 42, playerClass: cls, autoEquip: false });
  sim.setPlayerLevel(MAX_LEVEL);
  const npc = vendorEntity(sim);
  teleportTo(sim, sim.player, npc.pos.x + 2, npc.pos.z);
  sim.player.maxHp = sim.player.hp = 1_000_000;
  sim.copper = 5_000_000; // the full 24-piece rack costs 234000
  return { sim, cursor: { id: 500_000 } };
}

describe('Dawn of Claude: grinding the faction unlocks the rack, tier by tier', () => {
  it('refuses every row at Neutral, then opens each tier exactly at its standing', () => {
    const { sim, cursor } = setUpBuyer('warrior');

    // Neutral: the whole rack is visible and none of it is for sale.
    expect(standingOf(sim)).toBe('neutral');
    for (const id of SET_IDS) expect(tryBuy(sim, id), `${id} sold at Neutral`).toBe(false);
    expect(sim.copper).toBe(5_000_000); // refusals cost nothing

    const opened: ReputationStanding[] = [];
    for (let clear = 0; clear < 400 && opened.length < GATED_STANDINGS.length; clear++) {
      const before = standingOf(sim);
      clearCinderforge(sim, cursor);
      const after = standingOf(sim);
      expect(repOf(sim), 'a clear paid no reputation').toBeGreaterThan(0);
      if (after === before) continue;

      // Every row of a tier the player has NOT reached is still refused, and
      // every row of the tiers they have is buyable. This is the assertion that
      // catches a gate quietly moving.
      for (const standing of GATED_STANDINGS) {
        const reached = repOf(sim) >= floorOf(standing);
        for (const id of rowsGatedAt(standing)) {
          const plate = ITEMS[id].requiredClass?.includes('warrior');
          if (!plate) continue; // one archetype is enough to prove the gate
          expect(tryBuy(sim, id), `${id} (${standing}) at ${repOf(sim)} rep`).toBe(reached);
        }
      }
      if (GATED_STANDINGS.includes(after) && !opened.includes(after)) opened.push(after);
    }

    expect(opened).toEqual(GATED_STANDINGS);
    expect(standingOf(sim)).toBe('exalted');
  });

  it('the piece a capped player buys is one they can wear', () => {
    // One buyer per archetype set, so all three sets are proven wearable through
    // the live equip path, not just through `canEquipItem`.
    const cases: { cls: PlayerClass; itemId: string }[] = [
      { cls: 'warrior', itemId: 'dawnguard_blade' },
      { cls: 'mage', itemId: 'dawn_robe' },
      { cls: 'rogue', itemId: 'dawnstalker_legguards' },
    ];
    for (const { cls, itemId } of cases) {
      const { sim, cursor } = setUpBuyer(cls);
      while (repOf(sim) < floorOf('exalted')) clearCinderforge(sim, cursor);

      expect(tryBuy(sim, itemId), `${cls} could not buy ${itemId} at Exalted`).toBe(true);
      sim.equipItem(itemId);
      expect(sim.equipment[ITEMS[itemId].slot!], `${cls} could not equip ${itemId}`).toBe(itemId);
    }
  });
});
