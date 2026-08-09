// Integrity + balance-band gates for the expansion content pack
// (src/sim/content/expansion). The pack is NOT merged into data.ts yet, so
// these tests import both the pack and the shipped tables directly and check
// the pack against them.
import { describe, expect, it } from 'vitest';

import {
  CINDERFORGE_DUNGEON_DEFS,
  CINDERFORGE_MOBS,
  EXPANSION_ITEMS,
  EXPANSION_NPCS,
  EXPANSION_OBJECTS,
  EXPANSION_QUEST_ORDER,
  EXPANSION_QUESTS,
} from '../src/sim/content/expansion';
import { DUNGEONS, ITEMS, MOBS, NPCS, QUEST_ORDER, QUESTS } from '../src/sim/data';
import { MAX_LEVEL } from '../src/sim/types';

const packMobs = { ...CINDERFORGE_MOBS };
const allMobs = { ...MOBS, ...packMobs };
const allItems = { ...ITEMS, ...EXPANSION_ITEMS };
const allNpcs = { ...NPCS, ...EXPANSION_NPCS };
const allQuests = { ...QUESTS, ...EXPANSION_QUESTS };

const objectItemIds = new Set(EXPANSION_OBJECTS.map((o) => o.itemId));

describe('expansion: id uniqueness against the shipped tables', () => {
  it('adds no colliding item id', () => {
    const clashes = Object.keys(EXPANSION_ITEMS).filter((id) => id in ITEMS);
    expect(clashes).toEqual([]);
  });

  it('adds no colliding mob id', () => {
    const clashes = Object.keys(packMobs).filter((id) => id in MOBS);
    expect(clashes).toEqual([]);
  });

  it('adds no colliding npc id', () => {
    const clashes = Object.keys(EXPANSION_NPCS).filter((id) => id in NPCS);
    expect(clashes).toEqual([]);
  });

  it('adds no colliding quest id', () => {
    const clashes = Object.keys(EXPANSION_QUESTS).filter((id) => id in QUESTS);
    expect(clashes).toEqual([]);
    expect(EXPANSION_QUEST_ORDER.filter((id) => QUEST_ORDER.includes(id))).toEqual([]);
  });

  it('adds no colliding dungeon id or index', () => {
    const usedIndices = new Set(Object.values(DUNGEONS).map((d) => d.index));
    for (const def of Object.values(CINDERFORGE_DUNGEON_DEFS)) {
      expect(def.id in DUNGEONS).toBe(false);
      expect(usedIndices.has(def.index)).toBe(false);
    }
  });

  it('adds no colliding ground-object item id', () => {
    // Ground objects are keyed by itemId at pickup, so two definitions sharing
    // one id would cross-credit each other's quests.
    const ids = EXPANSION_OBJECTS.map((o) => o.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every record key equals its own id field', () => {
    for (const [key, item] of Object.entries(EXPANSION_ITEMS)) expect(item.id).toBe(key);
    for (const [key, mob] of Object.entries(packMobs)) expect(mob.id).toBe(key);
    for (const [key, npc] of Object.entries(EXPANSION_NPCS)) expect(npc.id).toBe(key);
    for (const [key, quest] of Object.entries(EXPANSION_QUESTS)) expect(quest.id).toBe(key);
    for (const [key, def] of Object.entries(CINDERFORGE_DUNGEON_DEFS)) expect(def.id).toBe(key);
  });
});

describe('expansion: every referenced id resolves', () => {
  it('quest givers and turn-ins exist', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      expect(allNpcs[quest.giverNpcId], `${quest.id} giver`).toBeTruthy();
      expect(allNpcs[quest.turnInNpcId], `${quest.id} turn-in`).toBeTruthy();
    }
  });

  it('quest objectives point at real mobs, items and ground objects', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      for (const obj of quest.objectives) {
        if (obj.type === 'kill') {
          expect(allMobs[obj.targetMobId ?? ''], `${quest.id} kill target`).toBeTruthy();
        } else if (obj.type === 'collect') {
          expect(allItems[obj.itemId ?? ''], `${quest.id} collect item`).toBeTruthy();
        } else {
          expect(objectItemIds.has(obj.targetObjectItemId ?? ''), `${quest.id} interact object`).toBe(
            true,
          );
        }
      }
    }
  });

  it('quest reward items exist', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      for (const itemId of Object.values(quest.itemRewards)) {
        expect(allItems[itemId as string], `${quest.id} reward ${itemId}`).toBeTruthy();
      }
    }
  });

  it('ground objects reference defined items, and every collect objective has enough nodes', () => {
    for (const def of EXPANSION_OBJECTS) {
      expect(allItems[def.itemId], `object ${def.itemId}`).toBeTruthy();
      expect(def.positions.length).toBeGreaterThan(0);
    }
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      for (const obj of quest.objectives) {
        if (obj.type !== 'collect') continue;
        const nodes = EXPANSION_OBJECTS.find((o) => o.itemId === obj.itemId);
        if (!nodes) {
          // Not a ground object: it must then drop from a mob tagged with this quest.
          const dropped = Object.values(allMobs).some((m) =>
            m.loot.some((l) => l.itemId === obj.itemId && l.questId === quest.id),
          );
          expect(dropped, `${quest.id} collect ${obj.itemId} has no source`).toBe(true);
          continue;
        }
        expect(nodes.positions.length, `${quest.id} node count`).toBeGreaterThanOrEqual(obj.count);
      }
    }
  });

  it('mob loot and summons resolve', () => {
    for (const mob of Object.values(packMobs)) {
      for (const entry of mob.loot) {
        if (entry.itemId) expect(allItems[entry.itemId], `${mob.id} loot ${entry.itemId}`).toBeTruthy();
        if (entry.questId) expect(allQuests[entry.questId], `${mob.id} questId`).toBeTruthy();
      }
      if (mob.summonAdds) expect(allMobs[mob.summonAdds.mobId], `${mob.id} add`).toBeTruthy();
    }
  });

  it('quest-flagged items name a quest that actually asks for them', () => {
    for (const item of Object.values(EXPANSION_ITEMS)) {
      if (!item.questId) continue;
      const quest = allQuests[item.questId];
      expect(quest, `${item.id} questId`).toBeTruthy();
      const wanted = quest.objectives.some(
        (o) => o.itemId === item.id || o.targetObjectItemId === item.id,
      );
      expect(wanted, `${item.id} is not an objective of ${item.questId}`).toBe(true);
    }
  });
});

describe('expansion: quests are offerable and reachable', () => {
  it('quest order lists exactly the pack quests, once each', () => {
    expect([...EXPANSION_QUEST_ORDER].sort()).toEqual(Object.keys(EXPANSION_QUESTS).sort());
    expect(new Set(EXPANSION_QUEST_ORDER).size).toBe(EXPANSION_QUEST_ORDER.length);
  });

  it("every quest is listed on its giver's questIds, and every listed id exists", () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      const giver = allNpcs[quest.giverNpcId];
      expect(giver.questIds, `${quest.id} not offered by ${quest.giverNpcId}`).toContain(quest.id);
    }
    for (const npc of Object.values(EXPANSION_NPCS)) {
      for (const id of npc.questIds) expect(allQuests[id], `${npc.id} lists ${id}`).toBeTruthy();
    }
  });

  it('no quest depends on an unobtainable prerequisite, and no chain cycles', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      const seen = new Set<string>([quest.id]);
      let cur = quest;
      while (cur.requiresQuest) {
        const prereq = allQuests[cur.requiresQuest];
        expect(prereq, `${cur.id} requires missing ${cur.requiresQuest}`).toBeTruthy();
        expect(seen.has(prereq.id), `${quest.id} chain cycles at ${prereq.id}`).toBe(false);
        seen.add(prereq.id);
        // A prerequisite must itself be offered by some NPC, or the chain dead-ends.
        const offered = Object.values(allNpcs).some((n) => n.questIds.includes(prereq.id));
        expect(offered, `${prereq.id} is offered by nobody`).toBe(true);
        cur = prereq;
      }
    }
  });

  it('a prerequisite never demands a higher level than the quest it gates', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      if (!quest.requiresQuest) continue;
      const prereq = allQuests[quest.requiresQuest];
      expect(prereq.minLevel ?? 1).toBeLessThanOrEqual(quest.minLevel ?? MAX_LEVEL);
    }
  });
});

describe('expansion: reward curves stay in band', () => {
  // One entry per authored quest line, with the shipped quests the line was
  // anchored on. New rewards must not leave the anchor set's envelope.
  const LINES: { name: string; quests: string[]; anchors: string[] }[] = [
    {
      name: 'Eastbrook Vale (Houndmaster Teel)',
      quests: ['q_ev_kennels', 'q_ev_houndsbane', 'q_ev_boars', 'q_ev_last_hound'],
      anchors: ['q_murlocs', 'q_supplies', 'q_bandits', 'q_mine', 'q_bones'],
    },
    {
      name: 'Mirefen Marsh (Ferrywoman Odalie)',
      quests: ['q_mf_polings', 'q_mf_lanterns', 'q_mf_drowned_toll', 'q_mf_trollbridge'],
      anchors: [
        'q_prowlers',
        'q_deepfen',
        'q_widows',
        'q_broodmother',
        'q_drowned',
        'q_trolls',
        'q_troll_fetishes',
      ],
    },
    {
      name: 'Thornpeak Heights (Stonewright Hulda)',
      quests: ['q_tp_quarry', 'q_tp_keystones', 'q_tp_ogre_wall', 'q_tp_stormcut'],
      anchors: ['q_kobold_tunnels', 'q_glowing_wax', 'q_ogre_edges', 'q_ogre_bounty', 'q_elementals'],
    },
    {
      name: 'The Cinderforge (Forgewright Calla)',
      quests: [
        'q_cf_approach',
        'q_cf_slagfall',
        'q_cf_covenant',
        'q_cf_forgewarden',
        'q_cf_bellows',
        'q_cf_unquenched',
      ],
      anchors: ['q_aw_acolytes', 'q_aw_corrupt_sample', 'q_ch_breach', 'q_ch_pit', 'q_ch_forge', 'q_ch_deathlord'],
    },
  ];

  it('the anchor quests all still exist (the bands are derived, not hardcoded)', () => {
    for (const line of LINES) {
      for (const id of line.anchors) expect(QUESTS[id], `anchor ${id}`).toBeTruthy();
    }
  });

  it('xp rises monotonically along each authored line', () => {
    for (const line of LINES) {
      const xp = line.quests.map((id) => EXPANSION_QUESTS[id].xpReward);
      for (let i = 1; i < xp.length; i++) {
        expect(xp[i], `${line.name} step ${i}`).toBeGreaterThanOrEqual(xp[i - 1]);
      }
    }
  });

  it('xp and copper stay inside the shipped anchor envelope', () => {
    for (const line of LINES) {
      const anchorXp = line.anchors.map((id) => QUESTS[id].xpReward);
      const anchorCopper = line.anchors.map((id) => QUESTS[id].copperReward);
      const [xpLo, xpHi] = [Math.min(...anchorXp), Math.max(...anchorXp)];
      const [cLo, cHi] = [Math.min(...anchorCopper), Math.max(...anchorCopper)];
      for (const id of line.quests) {
        const q = EXPANSION_QUESTS[id];
        expect(q.xpReward, `${id} xp`).toBeGreaterThanOrEqual(xpLo);
        expect(q.xpReward, `${id} xp`).toBeLessThanOrEqual(xpHi);
        expect(q.copperReward, `${id} copper`).toBeGreaterThanOrEqual(cLo);
        expect(q.copperReward, `${id} copper`).toBeLessThanOrEqual(cHi);
      }
    }
  });

  it('the copper-to-xp ratio matches the shipped 0.3 to 0.8 band', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      const ratio = quest.copperReward / quest.xpReward;
      expect(ratio, `${quest.id} ratio ${ratio}`).toBeGreaterThanOrEqual(0.3);
      expect(ratio, `${quest.id} ratio ${ratio}`).toBeLessThanOrEqual(0.8);
    }
  });

  it('group content is flagged, solo content is not', () => {
    for (const quest of Object.values(EXPANSION_QUESTS)) {
      const hitsDungeonMob = quest.objectives.some(
        (o) => o.targetMobId !== undefined && o.targetMobId in CINDERFORGE_MOBS,
      );
      const wantsDungeonItem = quest.objectives.some(
        (o) => o.itemId !== undefined && o.itemId.startsWith('cf_'),
      );
      if (hitsDungeonMob || wantsDungeonItem) {
        expect(quest.suggestedPlayers, `${quest.id}`).toBe(5);
      } else {
        expect(quest.suggestedPlayers, `${quest.id}`).toBeUndefined();
      }
    }
  });

  it('every Ashen Wastes quest grants Dawn of Claude reputation, like the shipped zone', () => {
    for (const id of ['q_cf_approach', 'q_cf_slagfall', 'q_cf_covenant', 'q_cf_forgewarden', 'q_cf_bellows', 'q_cf_unquenched']) {
      expect(EXPANSION_QUESTS[id].repReward?.faction).toBe('dawn_of_claude');
    }
  });
});

describe('expansion: item power stays on the shipped ladder', () => {
  // Each Cinderforge armour piece is anchored on the Dawn of Claude tier 0.5
  // piece of the same slot and armour class (zone4.ts). Armour must land within
  // 5 percent of the anchor and the primary-point total must not exceed it.
  const ARMOUR_ANCHORS: Record<string, string> = {
    cf_ef_gloves: 'dawnguard_gauntlets',
    cf_cs_gloves: 'dawn_handwraps',
    cf_ss_gloves: 'dawnstalker_grips',
    cf_ef_waist: 'dawnguard_girdle',
    cf_cs_waist: 'dawn_cord',
    cf_ss_waist: 'dawnstalker_belt',
    cf_ef_feet: 'dawnguard_sabatons',
    cf_cs_feet: 'dawn_slippers',
    cf_ss_feet: 'dawnstalker_treads',
    cf_ef_helmet: 'dawnguard_greathelm',
    cf_cs_helmet: 'dawn_cowl',
    cf_ss_helmet: 'dawnstalker_mask',
    cf_ef_chest: 'dawnguard_breastplate',
    cf_cs_chest: 'dawn_robe',
    cf_ss_chest: 'dawnstalker_tunic',
  };

  const primaryPoints = (stats: Record<string, number | undefined> | undefined): number =>
    Object.entries(stats ?? {})
      .filter(([k]) => k !== 'armor')
      .reduce((sum, [, v]) => sum + (v ?? 0), 0);

  it('every armour anchor still exists', () => {
    for (const anchorId of Object.values(ARMOUR_ANCHORS)) expect(ITEMS[anchorId], anchorId).toBeTruthy();
  });

  it('armour and stat budgets match their anchor', () => {
    for (const [id, anchorId] of Object.entries(ARMOUR_ANCHORS)) {
      const item = EXPANSION_ITEMS[id];
      const anchor = ITEMS[anchorId];
      expect(item, id).toBeTruthy();
      expect(item.slot).toBe(anchor.slot);
      expect(item.quality).toBe(anchor.quality);
      expect(item.sellValue).toBe(anchor.sellValue);
      const armor = item.stats?.armor ?? 0;
      const anchorArmor = anchor.stats?.armor ?? 0;
      expect(Math.abs(armor - anchorArmor) / anchorArmor, `${id} armor`).toBeLessThanOrEqual(0.05);
      expect(primaryPoints(item.stats), `${id} points`).toBeLessThanOrEqual(primaryPoints(anchor.stats));
      expect(item.requiredClass, `${id} class lock`).toEqual(anchor.requiredClass);
    }
  });

  it('the chase weapons sit strictly between the tier 0.55 and Veholt bands', () => {
    // Anchors, both from dungeons.ts: the Claudeholme set mainhand (floor) and
    // the deathlord's chase epic (ceiling), per archetype.
    const BANDS: [string, string, string][] = [
      ['cf_quenchless_cleaver', 'pw_mh', 'veholt_war'],
      ['cf_quenchless_brand', 'hm_mh', 'veholt_mag'],
      ['cf_quenchless_fang', 'as_mh', 'veholt_rog'],
    ];
    const dps = (id: string, table: Record<string, (typeof ITEMS)[string]>): number => {
      const w = table[id].weapon;
      expect(w, `${id} has no weapon block`).toBeTruthy();
      return (w!.min + w!.max) / 2 / w!.speed;
    };
    for (const [id, floorId, ceilId] of BANDS) {
      expect(EXPANSION_ITEMS[id].quality).toBe('epic');
      const mine = dps(id, EXPANSION_ITEMS);
      expect(mine, `${id} vs ${floorId}`).toBeGreaterThan(dps(floorId, ITEMS));
      expect(mine, `${id} vs ${ceilId}`).toBeLessThan(dps(ceilId, ITEMS));
      expect(EXPANSION_ITEMS[id].sellValue).toBeGreaterThan(ITEMS[floorId].sellValue);
      expect(EXPANSION_ITEMS[id].sellValue).toBeLessThan(ITEMS[ceilId].sellValue);
    }
  });

  it('quest objects are valueless and gear is not', () => {
    for (const item of Object.values(EXPANSION_ITEMS)) {
      if (item.kind === 'quest') expect(item.sellValue, item.id).toBe(0);
      else expect(item.sellValue, item.id).toBeGreaterThan(0);
    }
  });
});
