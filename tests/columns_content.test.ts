// The two column zones as PLAYABLE content: six NPCs, fourteen quests, eleven
// items and five ground-object sets in `src/sim/content/columns/`.
//
// Everything asserted here is re-derived from the LIVE tables, never pinned:
// the reward bands come out of the shipped quests this content was anchored on,
// and the compass words come out of the real coordinates through the same
// bearing math the HUD compass strip uses. A camp that moves, a reward that is
// retuned, or a line rewritten from screen-space intuition fails here rather
// than shipping as a lie in fourteen locales.

import { describe, expect, it } from 'vitest';

import {
  COLUMN_ITEMS,
  COLUMN_NPCS,
  COLUMN_OBJECTS,
  COLUMN_QUEST_ORDER,
  COLUMN_QUESTS,
  COLUMN_CAMPS,
} from '../src/sim/content/columns';
import { CLAUDEHOLME_ITEMS, CLAUDEXX_ITEMS } from '../src/sim/content/dungeons';
import { DELVE_ITEMS } from '../src/sim/content/delves/items';
import { BROTHER_HALVEN } from '../src/sim/content/delves';
import {
  EXPANSION_ITEMS,
  EXPANSION_NPCS,
  EXPANSION_QUESTS,
} from '../src/sim/content/expansion';
import { BASE_ITEMS } from '../src/sim/content/items';
import { PROFESSION_ITEMS } from '../src/sim/content/professions';
import { RIFT_ITEMS } from '../src/sim/content/rift';
import { TEMPLE_ITEMS, TEMPLE_NPCS, TEMPLE_QUESTS } from '../src/sim/content/temple';
import { ZONE1_NPCS, ZONE1_QUESTS } from '../src/sim/content/zone1';
import { ZONE2_ITEMS, ZONE2_NPCS, ZONE2_QUESTS } from '../src/sim/content/zone2';
import { ZONE3_ITEMS, ZONE3_NPCS, ZONE3_QUESTS } from '../src/sim/content/zone3';
import { ZONE4_ITEMS, ZONE4_NPCS, ZONE4_QUESTS } from '../src/sim/content/zone4';
import { MOUNT_ITEMS } from '../src/sim/mounts';

import {
  CAMPS,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUEST_ORDER,
  QUESTS,
  ZONES,
  zoneContaining,
} from '../src/sim/data';
import { angleTo, type QuestDef, type Vec3 } from '../src/sim/types';
import { resolvePosition } from '../src/sim/colliders';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { bearingDegrees, type CardinalId, headingLabel } from '../src/ui/compass';

const SEED = 1337;
const COLUMN_ZONE_IDS = ['alderfen_shallows', 'grimhold_crags'] as const;
const ALDERFEN_QUEST_IDS = Object.keys(COLUMN_QUESTS).filter((id) => id.startsWith('q_af_'));
const GRIMHOLD_QUEST_IDS = Object.keys(COLUMN_QUESTS).filter((id) => id.startsWith('q_gh_'));

// Every quest in the world that this pack did NOT add. The reward bands below
// are derived from these, so the test never restates a number the content
// already states.
const SHIPPED_QUESTS: Record<string, QuestDef> = {
  ...ZONE1_QUESTS,
  ...ZONE2_QUESTS,
  ...ZONE3_QUESTS,
  ...ZONE4_QUESTS,
  ...TEMPLE_QUESTS,
  ...EXPANSION_QUESTS,
};

describe('column content: ids are new, and every reference resolves', () => {
  it('adds fourteen quests, six npcs and eleven items', () => {
    expect(Object.keys(COLUMN_QUESTS)).toHaveLength(14);
    expect(ALDERFEN_QUEST_IDS).toHaveLength(7);
    expect(GRIMHOLD_QUEST_IDS).toHaveLength(7);
    expect(Object.keys(COLUMN_NPCS)).toHaveLength(6);
    expect(Object.keys(COLUMN_ITEMS)).toHaveLength(11);
  });

  it('collides with no shipped item, npc or quest id', () => {
    const shippedItemIds = new Set(
      [
        BASE_ITEMS,
        ZONE2_ITEMS,
        ZONE3_ITEMS,
        ZONE4_ITEMS,
        TEMPLE_ITEMS,
        DELVE_ITEMS,
        CLAUDEHOLME_ITEMS,
        CLAUDEXX_ITEMS,
        PROFESSION_ITEMS,
        RIFT_ITEMS,
        EXPANSION_ITEMS,
        MOUNT_ITEMS,
      ].flatMap((table) => Object.keys(table)),
    );
    for (const id of Object.keys(COLUMN_ITEMS)) {
      expect(shippedItemIds.has(id), `item id ${id} already exists`).toBe(false);
    }

    const shippedNpcIds = new Set([
      ...Object.keys(ZONE1_NPCS),
      ...Object.keys(ZONE2_NPCS),
      ...Object.keys(ZONE3_NPCS),
      ...Object.keys(ZONE4_NPCS),
      ...Object.keys(TEMPLE_NPCS),
      ...Object.keys(EXPANSION_NPCS),
      BROTHER_HALVEN.id,
    ]);
    for (const id of Object.keys(COLUMN_NPCS)) {
      expect(shippedNpcIds.has(id), `npc id ${id} already exists`).toBe(false);
    }

    for (const id of Object.keys(COLUMN_QUESTS)) {
      expect(SHIPPED_QUESTS[id], `quest id ${id} already exists`).toBeUndefined();
    }
  });

  it('survives the merge in data.ts without being shadowed', () => {
    for (const [id, def] of Object.entries(COLUMN_ITEMS)) {
      // mergeItems clones an entry only to attach ground-pickup lines, so an
      // identical name is the honest "same record" check here.
      expect(ITEMS[id]?.name, `item ${id}`).toBe(def.name);
    }
    for (const id of Object.keys(COLUMN_NPCS)) expect(NPCS[id]).toBe(COLUMN_NPCS[id]);
    for (const id of Object.keys(COLUMN_QUESTS)) expect(QUESTS[id]).toBe(COLUMN_QUESTS[id]);
    for (const id of COLUMN_QUEST_ORDER) expect(QUEST_ORDER).toContain(id);
    expect(new Set(COLUMN_QUEST_ORDER).size).toBe(COLUMN_QUEST_ORDER.length);
    expect(new Set(COLUMN_QUEST_ORDER)).toEqual(new Set(Object.keys(COLUMN_QUESTS)));
  });

  it('references only mobs, items, npcs and objects that exist', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      expect(NPCS[quest.giverNpcId], `${quest.id} giver`).toBeTruthy();
      expect(NPCS[quest.turnInNpcId], `${quest.id} turn-in`).toBeTruthy();
      for (const o of quest.objectives) {
        if (o.type === 'kill') {
          expect(MOBS[o.targetMobId!], `${quest.id} mob ${o.targetMobId}`).toBeTruthy();
          expect(
            CAMPS.some((c) => c.mobId === o.targetMobId),
            `${quest.id} targets ${o.targetMobId}, which no camp spawns`,
          ).toBe(true);
        }
        if (o.type === 'collect') {
          expect(ITEMS[o.itemId!], `${quest.id} item ${o.itemId}`).toBeTruthy();
        }
        if (o.type === 'interact') {
          expect(ITEMS[o.targetObjectItemId!], `${quest.id} object`).toBeTruthy();
          expect(
            GROUND_OBJECTS.some((g) => g.itemId === o.targetObjectItemId),
            `${quest.id} interacts with an object nothing places`,
          ).toBe(true);
        }
      }
      for (const itemId of Object.values(quest.itemRewards)) {
        expect(ITEMS[itemId], `${quest.id} reward ${itemId}`).toBeTruthy();
      }
    }
    for (const npc of Object.values(COLUMN_NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        const item = ITEMS[itemId];
        expect(item, `${npc.id} sells unknown item ${itemId}`).toBeTruthy();
        // A vendor row with no buy price cannot be bought, which is how the
        // shipped gathering tools ended up as scenery once already.
        expect(item.buyValue, `${npc.id} sells ${itemId} with no buyValue`).toBeGreaterThan(0);
      }
    }
  });

  it('places every quest on its giver, and every giver in the pack', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      const giver = COLUMN_NPCS[quest.giverNpcId];
      expect(giver, `${quest.id} giver is not a column npc`).toBeTruthy();
      expect(giver.questIds, `${quest.id} missing from ${giver.id}.questIds`).toContain(quest.id);
    }
    for (const npc of Object.values(COLUMN_NPCS)) {
      for (const questId of npc.questIds) {
        expect(COLUMN_QUESTS[questId], `${npc.id} offers unknown quest ${questId}`).toBeTruthy();
      }
    }
  });

  it('adds no camps: every kill target is spawned by a camp already in the pack', () => {
    const columnCampMobs = new Set(COLUMN_CAMPS.map((c) => c.mobId));
    for (const quest of Object.values(COLUMN_QUESTS)) {
      for (const o of quest.objectives) {
        if (o.type !== 'kill') continue;
        expect(columnCampMobs.has(o.targetMobId!), `${quest.id} target ${o.targetMobId}`).toBe(true);
      }
    }
    // and the camp list itself is untouched by this pack
    const columnZoneCamps = CAMPS.filter((c) => {
      const zone = zoneContaining(c.center.x, c.center.z);
      return zone ? (COLUMN_ZONE_IDS as readonly string[]).includes(zone.id) : false;
    });
    expect(columnZoneCamps).toHaveLength(COLUMN_CAMPS.length);
  });
});

describe('column content: chains are reachable, acyclic and monotonic', () => {
  it('every prerequisite exists, is offerable and is not retired', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      if (!quest.requiresQuest) continue;
      const prereq = QUESTS[quest.requiresQuest];
      expect(prereq, `${quest.id} requires missing ${quest.requiresQuest}`).toBeTruthy();
      expect(prereq.retired, `${quest.id} requires a retired quest`).toBeFalsy();
      expect(QUEST_ORDER, `${quest.id} prerequisite is never offered`).toContain(prereq.id);
      const giver = NPCS[prereq.giverNpcId];
      expect(giver?.questIds, `${prereq.id} is on no giver`).toContain(prereq.id);
      expect(
        prereq.minLevel ?? 1,
        `${quest.id} gates below its own prerequisite`,
      ).toBeLessThanOrEqual(quest.minLevel ?? 1);
    }
  });

  it('has no prerequisite cycle', () => {
    for (const start of Object.keys(COLUMN_QUESTS)) {
      const seen = new Set<string>([start]);
      let cursor: string | undefined = QUESTS[start].requiresQuest;
      while (cursor) {
        expect(seen.has(cursor), `prerequisite cycle through ${cursor}`).toBe(false);
        seen.add(cursor);
        cursor = QUESTS[cursor]?.requiresQuest;
      }
    }
  });

  it('offers a chain head before its follow-ups', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      if (!quest.requiresQuest) continue;
      expect(
        QUEST_ORDER.indexOf(quest.requiresQuest),
        `${quest.requiresQuest} is offered after ${quest.id}`,
      ).toBeLessThan(QUEST_ORDER.indexOf(quest.id));
    }
  });

  it('raises level, xp and copper along every chain', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      if (!quest.requiresQuest) continue;
      const prereq = QUESTS[quest.requiresQuest];
      expect(quest.xpReward, `${quest.id} pays no more than ${prereq.id}`).toBeGreaterThan(
        prereq.xpReward,
      );
      expect(quest.copperReward, `${quest.id} pays no more than ${prereq.id}`).toBeGreaterThan(
        prereq.copperReward,
      );
    }
  });

  it('keeps each zone curve non-decreasing when read in level order', () => {
    for (const ids of [ALDERFEN_QUEST_IDS, GRIMHOLD_QUEST_IDS]) {
      const ladder = ids
        .map((id) => COLUMN_QUESTS[id])
        .sort((a, b) => (a.minLevel ?? 1) - (b.minLevel ?? 1) || a.xpReward - b.xpReward);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i].xpReward, `${ladder[i].id} after ${ladder[i - 1].id}`).toBeGreaterThanOrEqual(
          ladder[i - 1].xpReward,
        );
        expect(
          ladder[i].copperReward,
          `${ladder[i].id} after ${ladder[i - 1].id}`,
        ).toBeGreaterThanOrEqual(ladder[i - 1].copperReward);
      }
    }
  });
});

describe('column content: levels and rewards sit inside the shipped bands', () => {
  const zoneOf = (questId: string) =>
    questId.startsWith('q_af_') ? 'alderfen_shallows' : 'grimhold_crags';

  it('gates every quest inside its own zone level range', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      const zone = ZONES.find((z) => z.id === zoneOf(quest.id))!;
      const level = quest.minLevel ?? 1;
      expect(level, `${quest.id} below ${zone.id}`).toBeGreaterThanOrEqual(zone.levelRange[0]);
      expect(level, `${quest.id} above ${zone.id}`).toBeLessThanOrEqual(zone.levelRange[1]);
    }
  });

  // The anchor window: every shipped quest that DECLARES a minLevel within two
  // levels of the quest under test. Only declared gates are used, because an
  // absent minLevel means "level 1" in the engine and would drag chain quests
  // from every band into the window.
  const window = (level: number) =>
    Object.values(SHIPPED_QUESTS).filter(
      (q) => q.minLevel !== undefined && Math.abs(q.minLevel - level) <= 2,
    );

  for (const quest of Object.values(COLUMN_QUESTS)) {
    it(`${quest.id} pays inside the level ${quest.minLevel} shipped band`, () => {
      const peers = window(quest.minLevel ?? 1);
      expect(peers.length, `no shipped peers at level ${quest.minLevel}`).toBeGreaterThan(3);
      const xp = peers.map((q) => q.xpReward);
      const copper = peers.map((q) => q.copperReward);
      expect(quest.xpReward).toBeGreaterThanOrEqual(Math.min(...xp));
      expect(quest.xpReward).toBeLessThanOrEqual(Math.max(...xp));
      expect(quest.copperReward).toBeGreaterThanOrEqual(Math.min(...copper));
      expect(quest.copperReward).toBeLessThanOrEqual(Math.max(...copper));
    });
  }

  it('budgets the two new reward sets between the rungs they were derived from', () => {
    // Chest: the shipped level 5-6 triplet (items.ts) below, the shipped level
    // 11 triplet (zone2.ts) above. Alderfen's capstone must sit strictly inside.
    const chestRungs: [string, string, string][] = [
      ['militia_vest', 'weirguard_hauberk', 'drownedguard_breastplate'],
      ['woven_robe', 'sedgeweave_robe', 'fenmist_robe'],
      ['shadow_jerkin', 'millrace_jerkin', 'eelskin_tunic'],
    ];
    for (const [low, mid, high] of chestRungs) {
      const a = ITEMS[low].stats!.armor!;
      const b = ITEMS[mid].stats!.armor!;
      const c = ITEMS[high].stats!.armor!;
      expect(b, `${mid} armor`).toBeGreaterThan(a);
      expect(b, `${mid} armor`).toBeLessThan(c);
      expect(ITEMS[mid].sellValue).toBeGreaterThan(ITEMS[low].sellValue);
      expect(ITEMS[mid].sellValue).toBeLessThan(ITEMS[high].sellValue);
      expect(ITEMS[mid].quality).toBe(ITEMS[low].quality);
    }

    // Mainhand: same construction, one rung higher.
    const weaponRungs: [string, string, string][] = [
      ['redbrook_blade', 'grimfang_splitter', 'deacons_cleaver'],
      ['apprentice_staff', 'coldhearth_emberstaff', 'staff_of_drowned_prayers'],
      ['keen_dirk', 'cragmaw_fang', 'mistbinder_kris'],
    ];
    for (const [low, mid, high] of weaponRungs) {
      for (const field of ['min', 'max'] as const) {
        const a = ITEMS[low].weapon![field];
        const b = ITEMS[mid].weapon![field];
        const c = ITEMS[high].weapon![field];
        expect(b, `${mid} ${field}`).toBeGreaterThan(a);
        expect(b, `${mid} ${field}`).toBeLessThan(c);
      }
      expect(ITEMS[mid].sellValue).toBeGreaterThan(ITEMS[low].sellValue);
      expect(ITEMS[mid].sellValue).toBeLessThan(ITEMS[high].sellValue);
      expect(ITEMS[mid].quality).toBe(ITEMS[low].quality);
      // The rogue rung is a dagger the whole way up; the other two are not.
      expect(ITEMS[mid].weapon!.dagger).toBe(ITEMS[low].weapon!.dagger);
    }
  });

  it('locks every class-restricted reward to a whole archetype group', () => {
    for (const def of Object.values(COLUMN_ITEMS)) {
      if (!def.requiredClass) continue;
      const set = new Set(def.requiredClass);
      const groups = [
        ['warrior', 'paladin', 'shaman'],
        ['mage', 'priest', 'warlock', 'druid'],
        ['rogue', 'hunter'],
      ];
      const match = groups.find((g) => g.every((c) => set.has(c as never)));
      expect(match, `${def.id} locks a partial archetype`).toBeTruthy();
      expect(set.size).toBe(match!.length);
    }
  });
});

describe('column content: the world can actually hold it', () => {
  it('stands every npc on dry, unblocked ground inside its own hub', () => {
    for (const npc of Object.values(COLUMN_NPCS)) {
      const zone = zoneContaining(npc.pos.x, npc.pos.z);
      expect(zone, `${npc.id} outside every zone rect`).toBeTruthy();
      expect((COLUMN_ZONE_IDS as readonly string[]).includes(zone!.id), `${npc.id} zone`).toBe(true);
      const d = Math.hypot(npc.pos.x - zone!.hub.x, npc.pos.z - zone!.hub.z);
      expect(d, `${npc.id} is ${d.toFixed(1)}yd from its hub`).toBeLessThanOrEqual(zone!.hub.radius);
      expect(terrainHeight(npc.pos.x, npc.pos.z, SEED)).toBeGreaterThan(WATER_LEVEL + 0.6);
      const r = resolvePosition(SEED, npc.pos.x, npc.pos.z, 0.6);
      expect(Math.hypot(r.x - npc.pos.x, r.z - npc.pos.z), `${npc.id} is inside a collider`).toBeLessThan(
        1e-4,
      );
    }
  });

  it('places every ground object on dry, unblocked ground inside its own zone', () => {
    for (const def of COLUMN_OBJECTS) {
      expect(ITEMS[def.itemId], `object ${def.itemId}`).toBeTruthy();
      expect(ITEMS[def.itemId].name, `object ${def.itemId} name`).toBe(def.name);
      for (const p of def.positions) {
        const zone = zoneContaining(p.x, p.z);
        expect(zone && (COLUMN_ZONE_IDS as readonly string[]).includes(zone.id), `${def.itemId} at ${p.x},${p.z}`).toBe(
          true,
        );
        expect(terrainHeight(p.x, p.z, SEED), `${def.itemId} at ${p.x},${p.z}`).toBeGreaterThan(
          WATER_LEVEL + 0.4,
        );
        const r = resolvePosition(SEED, p.x, p.z, 0.6);
        expect(
          Math.hypot(r.x - p.x, r.z - p.z),
          `${def.itemId} at ${p.x},${p.z} is inside a collider`,
        ).toBeLessThan(1e-4);
      }
    }
  });

  it('gives every collect objective more nodes than it asks for', () => {
    for (const quest of Object.values(COLUMN_QUESTS)) {
      for (const o of quest.objectives) {
        if (o.type !== 'collect') continue;
        const nodes = GROUND_OBJECTS.filter((g) => g.itemId === o.itemId);
        if (nodes.length === 0) continue; // mob-drop collect, sourced from loot
        const total = nodes.reduce((n, g) => n + g.positions.length, 0);
        expect(total, `${quest.id} wants ${o.count} ${o.itemId}`).toBeGreaterThan(o.count);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Compass fidelity. Same construction as tests/compass_directions.test.ts: the
// word is re-derived from the live coordinates through the HUD's own bearing
// math, so the copy can never disagree with the compass strip a player reads.
// ---------------------------------------------------------------------------

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

type Anchor =
  | { camp: string }
  | { object: string }
  | { npc: string }
  | { poi: string }
  | { lake: [string, number] };

function mean(points: { x: number; z: number }[], what: string): Vec3 {
  expect(points.length, `no coordinates for ${what}`).toBeGreaterThan(0);
  return {
    x: points.reduce((a, p) => a + p.x, 0) / points.length,
    y: 0,
    z: points.reduce((a, p) => a + p.z, 0) / points.length,
  };
}

function resolve(a: Anchor): Vec3 {
  if ('camp' in a)
    return mean(CAMPS.filter((c) => c.mobId === a.camp).map((c) => c.center), `camp ${a.camp}`);
  if ('object' in a)
    return mean(
      GROUND_OBJECTS.filter((o) => o.itemId === a.object).flatMap((o) => o.positions),
      `object ${a.object}`,
    );
  if ('npc' in a) {
    const npc = NPCS[a.npc];
    expect(npc, `no npc ${a.npc}`).toBeTruthy();
    return { x: npc.pos.x, y: 0, z: npc.pos.z };
  }
  if ('lake' in a) {
    const [zoneId, index] = a.lake;
    const zone = ZONES.find((z) => z.id === zoneId);
    expect(zone?.lakes[index], `no lake ${index} in ${zoneId}`).toBeTruthy();
    const lake = zone!.lakes[index];
    return { x: lake.x, y: 0, z: lake.z };
  }
  const pois = ZONES.flatMap((z) => z.pois).filter((p) => p.label === a.poi);
  return mean(pois, `poi ${a.poi}`);
}

const roseBetween = (from: Anchor, to: Anchor): CardinalId =>
  headingLabel(bearingDegrees(angleTo(resolve(from), resolve(to))));
const bearingBetween = (from: Anchor, to: Anchor): number =>
  bearingDegrees(angleTo(resolve(from), resolve(to)));

interface Case {
  quest: string;
  from: Anchor;
  to: Anchor;
  template: string;
}

// The nearest rose point must be exactly the word in the copy. Every phrase in
// these two zones qualifies; none of them names a weak axis.
const CASES: Case[] = [
  // --- Alderfen Shallows ---
  {
    quest: 'q_af_boards',
    from: { npc: 'weirwarden_ondrey' },
    to: { camp: 'sedge_skitterer' },
    template: 'Otter Hollow, {dir} of here',
  },
  {
    quest: 'q_af_snappers',
    from: { lake: ['alderfen_shallows', 0] },
    to: { camp: 'mudfin_snapper' },
    template: 'shallow water {dir} of Alderfen Water',
  },
  {
    quest: 'q_af_withies',
    from: { poi: 'Reedwatch' },
    to: { object: 'cut_withy' },
    template: 'the beds {dir} of Reedwatch',
  },
  {
    quest: 'q_af_poachers',
    from: { poi: 'Reedwatch' },
    to: { camp: 'reedwatch_poacher' },
    template: 'the Rotting Weir, {dir} of Reedwatch',
  },
  {
    quest: 'q_af_char',
    from: { poi: 'Reedwatch' },
    to: { object: 'alder_char' },
    template: 'stands are {dir} of Reedwatch',
  },
  {
    quest: 'q_af_sedgewatch',
    from: { npc: 'weirwarden_ondrey' },
    to: { camp: 'weir_husk' },
    template: 'there was Sedgewatch, {dir} of here',
  },
  {
    quest: 'q_af_miller',
    from: { npc: 'weirwarden_ondrey' },
    to: { camp: 'the_drowned_miller' },
    template: 'a miller {dir} of here',
  },

  // --- Grimhold Crags ---
  {
    quest: 'q_gh_lurkers',
    from: { npc: 'hearthwarden_ottil' },
    to: { camp: 'crag_lurker' },
    template: 'under Scree Fall, {dir} of here',
  },
  {
    quest: 'q_gh_ironvein',
    from: { poi: 'Coldhearth' },
    to: { camp: 'grimhold_scavenger' },
    template: 'the Ironvein Cut, {dir} of the hold',
  },
  {
    quest: 'q_gh_coal',
    from: { poi: 'Coldhearth' },
    to: { object: 'cragcoal' },
    template: 'on the scree {dir} of Coldhearth',
  },
  {
    quest: 'q_gh_binders',
    from: { lake: ['grimhold_crags', 0] },
    to: { camp: 'scree_binder' },
    template: 'out of the scree {dir} of Coldhearth Tarn',
  },
  {
    quest: 'q_gh_sled',
    from: { poi: 'Coldhearth' },
    to: { object: 'plundered_sledload' },
    template: 'up the {dir} road',
  },
  {
    quest: 'q_gh_watchtower',
    from: { poi: 'Coldhearth' },
    to: { camp: 'coldhearth_marauder' },
    template: 'The tower {dir} of Coldhearth',
  },
  {
    quest: 'q_gh_grimfang',
    from: { npc: 'hearthwarden_ottil' },
    to: { camp: 'old_grimfang' },
    template: 'the Cragmaw Dens {dir} of here',
  },
];

describe('column quest copy names the direction the coordinates actually give', () => {
  it('agrees with the HUD compass on the convention itself', () => {
    const origin: Vec3 = { x: 0, y: 0, z: 0 };
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: 0, y: 0, z: 10 })))).toBe('N');
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: 10, y: 0, z: 0 })))).toBe('W');
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: -10, y: 0, z: 0 })))).toBe('E');
  });

  it('covers every column quest whose copy names a direction', () => {
    const covered = new Set(CASES.map((c) => c.quest));
    const words = Object.values(WORD);
    for (const quest of Object.values(COLUMN_QUESTS)) {
      const names = words.some((w) => quest.text.toLowerCase().includes(w));
      expect(names, `${quest.id} names no direction; give the player a bearing`).toBe(true);
      expect(covered.has(quest.id), `${quest.id} names a direction with no case here`).toBe(true);
    }
  });

  for (const c of CASES) {
    it(`${c.quest}: "${c.template}"`, () => {
      const quest = COLUMN_QUESTS[c.quest];
      expect(quest, `no quest ${c.quest}`).toBeTruthy();
      const id = roseBetween(c.from, c.to);
      const phrase = c.template.replace('{dir}', WORD[id]);
      expect(
        quest.text.toLowerCase(),
        `derived bearing is ${bearingBetween(c.from, c.to).toFixed(1)} deg (${WORD[id]}), so the copy must read "${phrase}"`,
      ).toContain(phrase.toLowerCase());
    });
  }

  it('points each zone welcome line at the vale it actually flanks', () => {
    for (const zoneId of COLUMN_ZONE_IDS) {
      const zone = ZONES.find((z) => z.id === zoneId)!;
      const id = headingLabel(
        bearingDegrees(angleTo(resolve({ poi: 'Eastbrook' }), { x: zone.hub.x, y: 0, z: zone.hub.z })),
      );
      expect(
        zone.welcome.toLowerCase(),
        `${zoneId} sits ${WORD[id]} of Eastbrook, so its welcome must open with that word`,
      ).toContain(`${WORD[id]} of the vale`);
    }
  });
});
