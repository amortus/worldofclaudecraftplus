// The Eastbrook townsfolk's errands: the ten quests that refilled the Vale after
// the Warden's Ledger and the Brightwood chains were retired (see the banner in
// src/sim/content/zone1.ts for why this is a replacement and not a revert).
//
// Everything asserted here is re-derived from the LIVE tables rather than pinned,
// so a camp that moves, a quest that is rebalanced, or a rewrite from screen-space
// intuition fails here instead of shipping.

import { describe, expect, it } from 'vitest';

import { resolvePosition } from '../src/sim/colliders';
import {
  CAMPS,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  QUEST_ORDER,
  REWARD_ARCHETYPE,
} from '../src/sim/data';
import { ZONE1_VALE_OBJECTS } from '../src/sim/content/zone1';
import { GROUND_PICKUP_LINES } from '../src/sim/content/ground_pickup_lines';
import { canEquipItem } from '../src/sim/equipment_rules';
import { ALL_CLASSES, XP_TABLE, angleTo, type Vec3 } from '../src/sim/types';
import { WATER_LEVEL, terrainHeight } from '../src/sim/world';
import { type CardinalId, bearingDegrees, headingLabel } from '../src/ui/compass';

const PACK = [
  'q_haldren_fangs',
  'q_redbrook_mileposts',
  'q_haldren_scale',
  'q_lin_glade',
  'q_haldren_tallow',
  'q_lin_boneash',
  'q_wilkes_colors',
  'q_aldric_reliquary',
  'q_moggers_trail',
  'q_redbrook_verlan',
] as const;

const NEW_ITEM_IDS = [
  'splintered_road_marker',
  'sunleaf_frond',
  'reliquary_seal',
  'splintered_axle',
] as const;

// The Vale's shipped camp roster before this pack. Pinned as a LIST rather than a
// count: the pack's whole determinism argument is that it adds no camp, because a
// camp without explicit `positions` draws world-gen rng in array order and moves
// every later spawn (tests/world_phase2_zones.test.ts asserts the cursor).
const SHIPPED_VALE_CAMPS = [
  'forest_wolf',
  'forest_wolf',
  'old_greyjaw',
  'wild_boar',
  'wild_boar',
  'mogger',
  'webwood_spider',
  'mudfin_murloc',
  'tunnel_rat',
  'vale_bandit',
  'vale_bandit',
  'gorrak',
  'restless_bones',
  'captain_verlan',
  'restless_bones',
  'wraithbinder_maldrec',
  'grix_the_tunnelking',
];

const SEEDS = [20061, 1337, 42, 1]; // production seed first, then the seeds the suite uses

function inVale(x: number, z: number): boolean {
  return Math.abs(x) < 180 && z > -180 && z < 180;
}

// --- anchors, resolved from the live tables --------------------------------

function mean(points: { x: number; z: number }[]): Vec3 {
  expect(points.length).toBeGreaterThan(0);
  return {
    x: points.reduce((a, p) => a + p.x, 0) / points.length,
    y: 0,
    z: points.reduce((a, p) => a + p.z, 0) / points.length,
  };
}
const campMean = (mobId: string): Vec3 => mean(CAMPS.filter((c) => c.mobId === mobId).map((c) => c.center));
const objectMean = (itemId: string): Vec3 =>
  mean(GROUND_OBJECTS.filter((o) => o.itemId === itemId).flatMap((o) => o.positions));
const npcPos = (id: string): Vec3 => {
  expect(NPCS[id], `no npc ${id}`).toBeTruthy();
  return { x: NPCS[id].pos.x, y: 0, z: NPCS[id].pos.z };
};
const townPos = (): Vec3 => ({ x: 0, y: 0, z: -3 }); // the Eastbrook POI

/** The rose point a player standing at `from` reads off the HUD compass while
 *  looking at `to`. Uses the sim's angleTo and the HUD's own bearing math, so the
 *  copy can never disagree with the compass strip. */
function rose(from: Vec3, to: Vec3): CardinalId {
  return headingLabel(bearingDegrees(angleTo(from, to)));
}

const WORD: Record<CardinalId, string> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};

describe('Eastbrook errands: every quest resolves and belongs to its giver', () => {
  for (const id of PACK) {
    it(`${id} is registered, offered and ordered`, () => {
      const q = QUESTS[id];
      expect(q, `${id} missing from QUESTS`).toBeTruthy();
      expect(NPCS[q.giverNpcId].questIds).toContain(id);
      expect(NPCS[q.turnInNpcId].questIds).toContain(id);
      expect(QUEST_ORDER).toContain(id);
      expect(q.minLevel ?? 1).toBeGreaterThanOrEqual(1);
      expect(q.minLevel ?? 1).toBeLessThanOrEqual(7); // the Vale is levels 1-7
    });
  }

  it('a prerequisite is always offered before the quest that needs it', () => {
    for (const id of PACK) {
      const req = QUESTS[id].requiresQuest;
      if (!req) continue;
      expect(QUESTS[req], `${id} requires missing ${req}`).toBeTruthy();
      expect(
        QUEST_ORDER.indexOf(req),
        `${id} is offered before its prerequisite ${req}`,
      ).toBeLessThan(QUEST_ORDER.indexOf(id));
    }
  });
});

describe('Eastbrook errands: no quest repeats another (the defect that retired the Ledger)', () => {
  // Five Warden's Ledger bounties reused the SAME giver and the SAME kill target
  // as a main-story quest, so a finished bounty looked identical to a new one.
  // The global guard (tests/quest_repeat_repro.test.ts) only catches an identical
  // signature INCLUDING the count; this is the stricter rule THIS pack holds to,
  // scoped to the pack because the shipped chapel line deliberately asks Brother
  // Aldric's restless_bones twice (q_bones, then q_silence_the_call) as a story
  // escalation, which is the case the loose global rule exists to allow.
  it('no pack quest reuses a giver + target pair that already exists', () => {
    const shipped = new Map<string, string>();
    for (const q of Object.values(QUESTS)) {
      if ((PACK as readonly string[]).includes(q.id)) continue;
      for (const o of q.objectives) {
        const target =
          o.type === 'kill' ? o.targetMobId : o.type === 'collect' ? o.itemId : o.targetObjectItemId;
        if (target) shipped.set(`${q.giverNpcId} :: ${o.type} ${target}`, q.id);
      }
    }
    const collisions: string[] = [];
    const own = new Map<string, string>();
    for (const id of PACK) {
      const q = QUESTS[id];
      for (const o of q.objectives) {
        const target =
          o.type === 'kill' ? o.targetMobId : o.type === 'collect' ? o.itemId : o.targetObjectItemId;
        if (!target) continue;
        const key = `${q.giverNpcId} :: ${o.type} ${target}`;
        const prev = shipped.get(key) ?? own.get(key);
        if (prev) collisions.push(`${id} repeats ${prev} (${key})`);
        else own.set(key, id);
      }
    }
    expect(collisions).toEqual([]);
  });
});

describe('Eastbrook errands: the pack adds no camp, so the rng cursor cannot move', () => {
  it('the Vale still spawns exactly its shipped camp roster', () => {
    const live = CAMPS.filter((c) => inVale(c.center.x, c.center.z)).map((c) => c.mobId);
    expect(live).toEqual(SHIPPED_VALE_CAMPS);
  });

  it('every kill objective targets a mob a shipped camp already spawns', () => {
    for (const id of PACK) {
      for (const o of QUESTS[id].objectives) {
        if (o.type !== 'kill' || !o.targetMobId) continue;
        expect(MOBS[o.targetMobId], `${id}: unknown mob ${o.targetMobId}`).toBeTruthy();
        expect(
          CAMPS.some((c) => c.mobId === o.targetMobId),
          `${id}: ${o.targetMobId} has no spawn camp`,
        ).toBe(true);
      }
    }
  });

  it('a required kill target respawns fast enough to be a quest objective', () => {
    // Wraithbinder Maldrec and Grix the Tunnelking carry respawnMult 432 (three
    // hours at the 25 s base) and are deliberately NOT quest targets. Captain
    // Verlan carries 7.2 (three minutes), set for quest flow, which is what makes
    // q_redbrook_verlan a fair objective.
    for (const id of PACK) {
      for (const o of QUESTS[id].objectives) {
        if (o.type !== 'kill' || !o.targetMobId) continue;
        const mult = MOBS[o.targetMobId].respawnMult ?? (MOBS[o.targetMobId].rare ? 4 : 1);
        expect(mult, `${id}: ${o.targetMobId} respawnMult ${mult} is too slow to require`).toBeLessThanOrEqual(8);
      }
    }
    expect(MOBS.wraithbinder_maldrec.respawnMult).toBe(432);
    expect(MOBS.grix_the_tunnelking.respawnMult).toBe(432);
    expect(MOBS.captain_verlan.respawnMult).toBe(7.2);
  });
});

describe('Eastbrook errands: ground objects are placeable, slack, and flavored', () => {
  it('the pack is merged LAST into GROUND_OBJECTS so no shipped object id moves', () => {
    const tail = GROUND_OBJECTS.slice(-ZONE1_VALE_OBJECTS.length).map((o) => o.itemId);
    expect(tail).toEqual(ZONE1_VALE_OBJECTS.map((o) => o.itemId));
  });

  for (const set of ZONE1_VALE_OBJECTS) {
    it(`${set.itemId} sits on dry, walkable ground inside the Vale`, () => {
      for (const p of set.positions) {
        expect(inVale(p.x, p.z), `${set.itemId} at (${p.x},${p.z}) is outside the Vale`).toBe(true);
        for (const seed of SEEDS) {
          expect(
            terrainHeight(p.x, p.z, seed),
            `${set.itemId} at (${p.x},${p.z}) is underwater on seed ${seed}`,
          ).toBeGreaterThan(WATER_LEVEL + 0.3);
          const r = resolvePosition(seed, p.x, p.z, 0.6);
          expect(
            Math.hypot(r.x - p.x, r.z - p.z),
            `${set.itemId} at (${p.x},${p.z}) is inside a collider on seed ${seed}`,
          ).toBeLessThan(0.01);
        }
      }
    });

    it(`${set.itemId} carries at least one node more than its quest needs`, () => {
      const quest = Object.values(QUESTS).find((q) =>
        q.objectives.some((o) => o.type === 'collect' && o.itemId === set.itemId),
      );
      expect(quest, `no quest collects ${set.itemId}`).toBeTruthy();
      const need = quest!.objectives.find((o) => o.itemId === set.itemId)!.count;
      expect(set.positions.length).toBeGreaterThan(need);
    });

    it(`${set.itemId} has an item def and pickup flavor`, () => {
      expect(ITEMS[set.itemId], `${set.itemId} missing from ITEMS`).toBeTruthy();
      expect(ITEMS[set.itemId].questId, `${set.itemId} must gate on its quest`).toBeTruthy();
      expect(GROUND_PICKUP_LINES[set.itemId], `${set.itemId} has no pickup lines`).toBeTruthy();
    });
  }

  it('Mogger\'s trail stops outside his aggro radius', () => {
    // The last axle leads a level-6 player into sight of the lair without pulling
    // the rare elite for them.
    const camp = CAMPS.find((c) => c.mobId === 'mogger')!;
    const axles = ZONE1_VALE_OBJECTS.find((o) => o.itemId === 'splintered_axle')!;
    const nearest = Math.min(
      ...axles.positions.map((p) => Math.hypot(p.x - camp.center.x, p.z - camp.center.z)),
    );
    expect(nearest).toBeGreaterThan(MOBS.mogger.aggroRadius + camp.radius);
  });

  it('introduces exactly the four new item ids and nothing else', () => {
    expect(ZONE1_VALE_OBJECTS.map((o) => o.itemId).sort()).toEqual([...NEW_ITEM_IDS].sort());
  });
});

describe('Eastbrook errands: every direction word matches the live coordinates', () => {
  const cases: { quest: string; from: Vec3; to: Vec3; phrase: string }[] = [
    // Haldren stands in town; his three material errands each name a different corner.
    {
      quest: 'q_haldren_fangs',
      from: npcPos('smith_haldren'),
      to: campMean('forest_wolf'),
      phrase: 'walked the {dir} road',
    },
    {
      quest: 'q_haldren_scale',
      from: npcPos('smith_haldren'),
      to: campMean('mudfin_murloc'),
      phrase: 'off the shore {dir} of town',
    },
    {
      quest: 'q_haldren_tallow',
      from: npcPos('smith_haldren'),
      to: campMean('tunnel_rat'),
      phrase: 'the Copper Dig, {dir} of town',
    },
    {
      quest: 'q_redbrook_mileposts',
      from: townPos(),
      to: objectMean('splintered_road_marker'),
      phrase: 'Walk the {dir} road',
    },
    {
      quest: 'q_lin_glade',
      from: npcPos('apothecary_lin'),
      to: objectMean('sunleaf_frond'),
      phrase: 'a grove far {dir} of here',
    },
    {
      quest: 'q_lin_boneash',
      from: npcPos('apothecary_lin'),
      to: campMean('restless_bones'),
      phrase: 'The chapel yard {dir} of town',
    },
    {
      quest: 'q_wilkes_colors',
      from: npcPos('trader_wilkes'),
      to: campMean('vale_bandit'),
      phrase: 'a wagon down the {dir} road',
    },
    {
      quest: 'q_aldric_reliquary',
      from: npcPos('brother_aldric'),
      to: objectMean('reliquary_seal'),
      phrase: 'a reliquary on the hill {dir} of town',
    },
    {
      quest: 'q_moggers_trail',
      from: townPos(),
      to: objectMean('splintered_axle'),
      phrase: 'out {dir} past the meadow',
    },
    {
      quest: 'q_redbrook_verlan',
      from: npcPos('marshal_redbrook'),
      to: campMean('captain_verlan'),
      phrase: 'the Fallen Chapel {dir} of town',
    },
  ];

  it('agrees with the HUD compass on the convention itself', () => {
    const origin: Vec3 = { x: 0, y: 0, z: 0 };
    expect(rose(origin, { x: 0, y: 0, z: 10 })).toBe('N');
    expect(rose(origin, { x: 0, y: 0, z: -10 })).toBe('S');
    expect(rose(origin, { x: 10, y: 0, z: 0 })).toBe('W');
    expect(rose(origin, { x: -10, y: 0, z: 0 })).toBe('E');
  });

  for (const c of cases) {
    it(`${c.quest}: "${c.phrase}"`, () => {
      const id = rose(c.from, c.to);
      const expected = c.phrase.replace('{dir}', WORD[id]);
      expect(
        QUESTS[c.quest].text.toLowerCase(),
        `derived bearing is ${bearingDegrees(angleTo(c.from, c.to)).toFixed(1)} deg (${WORD[id]}), so the copy must read "${expected}"`,
      ).toContain(expected.toLowerCase());
    });
  }

  it("Mogger's trail runs the same way the copy says it does", () => {
    expect(rose(objectMean('splintered_axle'), campMean('mogger'))).toBe('W');
    expect(QUESTS.q_moggers_trail.completionText.toLowerCase()).toContain('the line runs west');
  });
});

describe('Eastbrook errands: rewards are shipped and every class can use them', () => {
  it('no reward mints a new item, and each resolves for all nine classes', () => {
    for (const id of PACK) {
      const q = QUESTS[id];
      for (const cls of ALL_CLASSES) {
        const itemId = q.itemRewards[cls] ?? q.itemRewards[REWARD_ARCHETYPE[cls]];
        if (!itemId) continue;
        const item = ITEMS[itemId];
        expect(item, `${id}: reward ${itemId} missing`).toBeTruthy();
        expect(canEquipItem(cls, item), `${id}: ${cls} cannot equip ${itemId}`).toBe(true);
      }
    }
  });

  it('brings the retired Bramblehide Jerkin back into reach', () => {
    // Kept in the tables when the Brightwood chains went, then unobtainable for
    // every patch since. The Monarch's Crown stays retired on purpose: its name
    // belongs to a stag that no longer exists.
    expect(QUESTS.q_wilkes_colors.itemRewards.warrior).toBe('bramblehide_jerkin');
    const obtainable = new Set<string>();
    for (const q of Object.values(QUESTS)) for (const i of Object.values(q.itemRewards)) if (i) obtainable.add(i);
    for (const m of Object.values(MOBS)) for (const l of m.loot) if (l.itemId) obtainable.add(l.itemId);
    expect(obtainable.has('bramblehide_jerkin')).toBe(true);
    expect(obtainable.has('monarch_crown_helm')).toBe(false);
  });
});

describe('Eastbrook errands: level pacing', () => {
  function xpNeeded(from: number, to: number): number {
    let sum = 0;
    for (let l = from; l < to; l++) sum += XP_TABLE[l - 1];
    return sum;
  }

  /** Vale quests reachable without a five-player crypt run: excludes anything
   *  suggesting 3+ players and anything that transitively requires one. */
  function soloReachable() {
    const vale = Object.values(QUESTS).filter((q) => {
      const g = NPCS[q.giverNpcId];
      return g && inVale(g.pos.x, g.pos.z);
    });
    const locked = new Set(vale.filter((q) => (q.suggestedPlayers ?? 1) >= 3).map((q) => q.id));
    for (let grew = true; grew; ) {
      grew = false;
      for (const q of vale) {
        if (!locked.has(q.id) && q.requiresQuest && locked.has(q.requiresQuest)) {
          locked.add(q.id);
          grew = true;
        }
      }
    }
    return vale.filter((q) => !locked.has(q.id));
  }

  it('a solo player can reach the zone cap on quests, without running two levels past it', () => {
    // Before this pack the solo line paid 10250, short of the 11200 needed for
    // level 7, so the only way out of a levels 1-7 zone was to grind or to find
    // four other players. The band below is the fix and its ceiling.
    const xp = soloReachable().reduce((a, q) => a + q.xpReward, 0);
    expect(xp, `solo-reachable Vale quest xp is ${xp}`).toBeGreaterThanOrEqual(xpNeeded(1, 7));
    expect(xp, `solo-reachable Vale quest xp is ${xp}`).toBeLessThan(xpNeeded(1, 9));
  });

  it('every new quest pays inside the band of the shipped rung it cites', () => {
    // Each row's anchor is named in a comment at the quest site; this is the same
    // claim, re-derived: no quest may out-pay the shipped quest one level above it.
    const ceilingFor: Record<number, number> = {
      1: QUESTS.q_boars.xpReward, // 350
      2: QUESTS.q_spiders.xpReward, // 420
      3: QUESTS.q_murlocs.xpReward, // 520
      4: QUESTS.q_mine.xpReward, // 620
      5: QUESTS.q_bones.xpReward, // 700
      6: QUESTS.q_ringleader.xpReward, // 800
      7: QUESTS.q_mogger.xpReward, // 1200
    };
    for (const id of PACK) {
      const q = QUESTS[id];
      const lvl = q.minLevel ?? 1;
      // 5% of slack: a collect off a thinner drop chance is allowed to pay a
      // little over the kill rung it sits beside, never a rung above it.
      expect(q.xpReward, `${id} out-pays the level-${lvl} ceiling`).toBeLessThanOrEqual(
        ceilingFor[lvl] * 1.05,
      );
      expect(q.copperReward / q.xpReward, `${id} copper ratio`).toBeGreaterThan(0.25);
      expect(q.copperReward / q.xpReward, `${id} copper ratio`).toBeLessThanOrEqual(0.75);
    }
  });
});
