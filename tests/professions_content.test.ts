import { describe, expect, it } from 'vitest';
import { DELVE_ITEMS } from '../src/sim/content/delves/items';
import { CLAUDEHOLME_ITEMS, CLAUDEXX_ITEMS } from '../src/sim/content/dungeons';
import { BASE_ITEMS, FISHING_TABLES } from '../src/sim/content/items';
import { TEMPLE_ITEMS } from '../src/sim/content/temple';
import { ZONE2_ITEMS } from '../src/sim/content/zone2';
import { ZONE3_ITEMS } from '../src/sim/content/zone3';
import { ZONE4_ITEMS } from '../src/sim/content/zone4';
import {
  FISHING_TABLES_BY_BAND,
  fishingTablesFor,
  GATHER_MATERIAL_ITEMS,
  GATHER_NODES,
  GATHER_TOOLS,
  GATHERING_MAX_SKILL,
  GATHERING_PROFESSION_IDS,
  GATHERING_PROFESSIONS,
  gatherNodeById,
  gatherNodesInZone,
  groundObjectSpecForNode,
  isFishingJunk,
  nodeMaterialFor,
  PROFESSION_ITEMS,
  SIMPLE_FISHING_POLE_ID,
  ZONE_GATHER_TIER,
  zoneGatherTier,
} from '../src/sim/content/professions';
import { ITEMS, ZONES, zoneAt } from '../src/sim/data';
import {
  beginHarvest,
  bestOwnedGatherToolTierOrNone,
  canGatherTier,
  gatherSkillGain,
} from '../src/sim/professions';

// The four bands that carry the whole progression, one per tier rung. The
// fourth rung is `veiled_hollow`: it holds the z 900..1440 band the retired
// Ashen Wastes used to hold (see the PARKED CONTENT banner in src/sim/data.ts)
// along with that zone's tier-4 nodes, materials and water.
const ZONE_IDS = ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights', 'veiled_hollow'];
// ...plus every other zone on the map, which is side content sitting on the rung
// of the band it borders rather than a fifth rung of its own. DERIVED from the
// live world rather than restated: a zone added to `ZONES` without a gather tier
// must fail the next test, and a hand-kept copy would only mean editing the list
// in two places every time the map grows.
const ALL_ZONE_IDS = ZONES.map((z) => z.id);

describe('professions', () => {
  it('registers exactly the four gathering professions with upstream’s caps', () => {
    expect([...GATHERING_PROFESSION_IDS]).toEqual(['mining', 'logging', 'herbalism', 'fishing']);
    expect(GATHERING_MAX_SKILL).toEqual({
      mining: 100,
      logging: 100,
      herbalism: 100,
      fishing: 200,
    });
  });

  it('keeps the id list and the def table in sync', () => {
    expect(Object.keys(GATHERING_PROFESSIONS).sort()).toEqual([...GATHERING_PROFESSION_IDS].sort());
    for (const id of GATHERING_PROFESSION_IDS) {
      expect(GATHERING_PROFESSIONS[id].id).toBe(id);
      expect(GATHERING_PROFESSIONS[id].category).toBe('gathering');
    }
  });
});

describe('zone tiers', () => {
  it('assigns one tier per real zone, matching the world’s zone ids', () => {
    // Exactly one tier per live zone, no tier for a zone that is not on the map:
    // set equality both ways, against the live roster.
    expect(Object.keys(ZONE_GATHER_TIER).sort()).toEqual([...ALL_ZONE_IDS].sort());
    // ...and the roster really is the full 14-zone map, so the line above is
    // checking something. Three original bands plus the eleven ported zones.
    expect(ALL_ZONE_IDS).toHaveLength(14);
    expect(ZONE_IDS.every((id) => ALL_ZONE_IDS.includes(id))).toBe(true);
    expect(ZONE_IDS.map(zoneGatherTier)).toEqual([1, 2, 3, 4]);
    // Every zone off the four-rung ladder sits ON one of those rungs, picked
    // from its own level band, rather than adding a fifth (the four rungs are
    // what land the mastery curve on the level-20 cap). This used to check the
    // invented column zones `alderfen_shallows` / `grimhold_crags`; those were
    // deleted for the full-map parity pass and the ported ring below is what
    // occupies their columns now.
    expect(
      [
        'farshore_isle', // levels 3-7, beside the Vale
        'willowfen', // 19-20
        'galecrest', // 20
        'palmreach', // 20
        'evergarden', // 20
        'nightbloom', // 20
        'wraithwood', // 20
        'frostveil', // 17-20
        'amberfall', // 18-20
        'drakelands', // 16-20
      ].map(zoneGatherTier),
    ).toEqual([1, 3, 3, 4, 4, 4, 4, 4, 4, 4]);
  });

  it('falls back to the starter tier for an unmapped zone', () => {
    expect(zoneGatherTier('some_dungeon_interior')).toBe(1);
  });
});

describe('gather nodes', () => {
  it('has unique ids and resolves each one back', () => {
    const ids = GATHER_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of GATHER_NODES) expect(gatherNodeById(n.id)).toBe(n);
    expect(gatherNodeById('nope')).toBeUndefined();
  });

  it('places every node inside its own zone’s z band', () => {
    for (const n of GATHER_NODES) {
      expect(zoneAt(n.pos.x, n.pos.z).id, `${n.id} at z=${n.pos.z}`).toBe(n.zoneId);
    }
  });

  it('covers all three node types in all four zones', () => {
    for (const zoneId of ZONE_IDS) {
      const types = new Set(gatherNodesInZone(zoneId).map((n) => n.type));
      expect([...types].sort(), zoneId).toEqual(['herb', 'ore', 'wood']);
    }
  });

  it('never places a node at a tier its zone cannot support', () => {
    for (const n of GATHER_NODES) {
      expect(n.tier, n.id).toBeGreaterThanOrEqual(1);
      expect(n.tier, n.id).toBeLessThanOrEqual(zoneGatherTier(n.zoneId));
    }
  });

  it('puts tier-4 nodes only in the endgame zone, so the top of the curve has somewhere to live', () => {
    const t4 = GATHER_NODES.filter((n) => n.tier === 4);
    expect(t4.length).toBeGreaterThan(0);
    // The endgame zone is the Veiled Hollow now: it holds the z band, and the
    // tier-4 nodes, that the retired Ashen Wastes used to hold.
    for (const n of t4) expect(n.zoneId).toBe('veiled_hollow');
    // and they are the only nodes that still pay full skill at 75+
    for (const n of t4) expect(gatherSkillGain(75, n.tier, 100)).toBe(1);
  });

  it('gives every node a ground-object spawn spec', () => {
    for (const n of GATHER_NODES) {
      const spec = groundObjectSpecForNode(n);
      expect(spec.itemId).toBe(n.id);
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.pos).toEqual(n.pos);
    }
  });

  it('snapshots each node’s level from its zone level range', () => {
    const mid: Record<string, number> = {
      eastbrook_vale: 4,
      mirefen_marsh: 10,
      thornpeak_heights: 17,
      veiled_hollow: 18, // [15,20] midpoint, the same rule as the three above
    };
    for (const n of GATHER_NODES) expect(n.level, n.id).toBe(mid[n.zoneId]);
  });
});

describe('materials', () => {
  it('maps every zone and node type to a real item', () => {
    for (const zoneId of ZONE_IDS) {
      for (const type of ['ore', 'wood', 'herb'] as const) {
        const row = nodeMaterialFor(type, zoneId);
        expect(GATHER_MATERIAL_ITEMS[row.itemId], `${type}/${zoneId}`).toBeDefined();
        expect(row.qtyByRarity.common).toBe(1);
        expect(row.qtyByRarity.legendary).toBe(4);
      }
    }
  });

  it('gives each zone its own distinct material per type', () => {
    for (const type of ['ore', 'wood', 'herb'] as const) {
      const ids = ZONE_IDS.map((z) => nodeMaterialFor(type, z).itemId);
      expect(new Set(ids).size, type).toBe(ZONE_IDS.length);
    }
  });

  it('keeps upstream’s starter materials for the Vale', () => {
    expect(nodeMaterialFor('ore', 'eastbrook_vale').itemId).toBe('copper_ore');
    expect(nodeMaterialFor('wood', 'eastbrook_vale').itemId).toBe('ironbark_log');
    expect(nodeMaterialFor('herb', 'eastbrook_vale').itemId).toBe('silverleaf_herb');
  });

  it('falls back rather than throwing for an unmapped zone', () => {
    expect(nodeMaterialFor('ore', 'nowhere').itemId).toBe('copper_ore');
  });

  it('values materials higher the deeper the zone', () => {
    for (const type of ['ore', 'wood', 'herb'] as const) {
      const vals = ZONE_IDS.map((z) => GATHER_MATERIAL_ITEMS[nodeMaterialFor(type, z).itemId].sellValue);
      for (let i = 1; i < vals.length; i++) expect(vals[i], type).toBeGreaterThan(vals[i - 1]);
    }
  });
});

describe('tools', () => {
  it('gives every profession one tool per tier, 1 to 4', () => {
    for (const id of GATHERING_PROFESSION_IDS) {
      const tiers = Object.values(GATHER_TOOLS)
        .filter((t) => t.professionId === id)
        .map((t) => t.tier)
        .sort();
      expect(tiers, id).toEqual([1, 2, 3, 4]);
    }
  });

  it('reuses the shipped simple pole as the tier-1 rod without redefining it', () => {
    expect(GATHER_TOOLS[SIMPLE_FISHING_POLE_ID]).toEqual({
      itemId: SIMPLE_FISHING_POLE_ID,
      professionId: 'fishing',
      tier: 1,
    });
    expect(ITEMS[SIMPLE_FISHING_POLE_ID]).toBeDefined();
    expect(PROFESSION_ITEMS[SIMPLE_FISHING_POLE_ID]).toBeUndefined();
  });

  it('backs every tool id except that one with a def this wave adds', () => {
    for (const id of Object.keys(GATHER_TOOLS)) {
      if (id === SIMPLE_FISHING_POLE_ID) continue;
      expect(PROFESSION_ITEMS[id], id).toBeDefined();
      expect(PROFESSION_ITEMS[id].kind, id).toBe('tool');
    }
  });

  it('lets every rod actually cast a line through the existing fishing item use', () => {
    for (const t of Object.values(GATHER_TOOLS)) {
      if (t.professionId !== 'fishing') continue;
      const def = PROFESSION_ITEMS[t.itemId] ?? ITEMS[t.itemId];
      expect(def.use, t.itemId).toEqual({ type: 'fishing' });
    }
  });

  it('prices each tier above the last', () => {
    for (const id of GATHERING_PROFESSION_IDS) {
      const byTier = Object.values(GATHER_TOOLS)
        .filter((t) => t.professionId === id)
        .sort((a, b) => a.tier - b.tier)
        .map((t) => (PROFESSION_ITEMS[t.itemId] ?? ITEMS[t.itemId]).buyValue ?? 0);
      for (let i = 1; i < byTier.length; i++) expect(byTier[i], id).toBeGreaterThan(byTier[i - 1]);
    }
  });

  it('adds no item id that already exists in the game', () => {
    // PROFESSION_ITEMS is now merged into ITEMS (data.ts), so a collision would
    // be invisible there — the later spread simply wins. Check the PRE-EXISTING
    // tables instead: no profession id may already be defined by one of them, or
    // this wave would silently overwrite shipped content.
    const preExisting: Record<string, unknown> = Object.assign(
      {},
      BASE_ITEMS,
      ZONE2_ITEMS,
      ZONE3_ITEMS,
      TEMPLE_ITEMS,
      DELVE_ITEMS,
      ZONE4_ITEMS,
      CLAUDEHOLME_ITEMS,
      CLAUDEXX_ITEMS,
    );
    for (const id of Object.keys(PROFESSION_ITEMS)) expect(preExisting[id], id).toBeUndefined();
    // ...and every one of them really did reach the merged table.
    for (const id of Object.keys(PROFESSION_ITEMS)) expect(ITEMS[id], id).toBeTruthy();
  });
});

describe('the tool ladder actually opens every node', () => {
  it('a full set of that profession’s tools reaches every node of its type', () => {
    const bag = Object.keys(GATHER_TOOLS).map((itemId) => ({ itemId, count: 1 }));
    for (const n of GATHER_NODES) {
      const professionId = n.type === 'ore' ? 'mining' : n.type === 'wood' ? 'logging' : 'herbalism';
      const tier = bestOwnedGatherToolTierOrNone(bag, professionId, GATHER_TOOLS);
      expect(canGatherTier(tier, n.tier), n.id).toBe(true);
    }
  });

  it('the tier-1 starter tool alone opens every Vale node and no tier-4 node', () => {
    const starter = [{ itemId: 'worn_miners_pick', count: 1 }];
    const vale = gatherNodesInZone('eastbrook_vale').filter((n) => n.type === 'ore');
    for (const n of vale) {
      const r = beginHarvest({
        node: n,
        proficiency: 0,
        maxSkill: 100,
        toolTier: bestOwnedGatherToolTierOrNone(starter, 'mining', GATHER_TOOLS),
        readyAt: undefined,
        now: 0,
      });
      expect(r.ok, n.id).toBe(true);
    }
    const endgame = gatherNodesInZone('veiled_hollow').filter((n) => n.type === 'ore');
    expect(endgame.length).toBeGreaterThan(0); // an empty loop would prove nothing
    for (const n of endgame) {
      const r = beginHarvest({
        node: n,
        proficiency: 0,
        maxSkill: 100,
        toolTier: bestOwnedGatherToolTierOrNone(starter, 'mining', GATHER_TOOLS),
        readyAt: undefined,
        now: 0,
      });
      expect(r.ok, n.id).toBe(false);
      expect(r.reason).toBe('tool_tier');
      expect(r.requiredTier).toBe(4);
    }
  });
});

describe('fishing water', () => {
  it('leaves band 0 for the shipped zones exactly as it is today', () => {
    for (const zoneId of Object.keys(FISHING_TABLES)) {
      expect(FISHING_TABLES_BY_BAND[zoneId]?.[0], zoneId).toEqual(FISHING_TABLES[zoneId]);
    }
  });

  it('gives the endgame band its own water instead of falling back to the Vale', () => {
    // Authored for the Ashen Wastes; the Veiled Hollow holds that band now, and
    // the table is keyed by live zone id or `fishingTablesFor` falls through.
    expect(FISHING_TABLES_BY_BAND.veiled_hollow[0]).not.toEqual(FISHING_TABLES.eastbrook_vale);
    const ids = FISHING_TABLES_BY_BAND.veiled_hollow[0]
      .map((row) => row.itemId)
      .filter((id): id is string => id !== null);
    for (const id of ids) expect(PROFESSION_ITEMS[id] ?? ITEMS[id], id).toBeDefined();
  });

  it('has three bands per zone, every row backed by a real item or the empty hook', () => {
    for (const [zoneId, bands] of Object.entries(FISHING_TABLES_BY_BAND)) {
      expect(bands.length, zoneId).toBe(3);
      for (const table of bands) {
        expect(table.length).toBeGreaterThan(0);
        for (const row of table) {
          expect(row.weight).toBeGreaterThan(0);
          if (row.itemId !== null) expect(PROFESSION_ITEMS[row.itemId] ?? ITEMS[row.itemId]).toBeDefined();
        }
      }
    }
  });

  it('moves weight out of junk and the empty hook as the band rises', () => {
    for (const [zoneId, bands] of Object.entries(FISHING_TABLES_BY_BAND)) {
      const badShare = (band: 0 | 1 | 2) => {
        const table = bands[band];
        const total = table.reduce((s, r) => s + r.weight, 0);
        const bad = table
          .filter((r) => r.itemId === null || isFishingJunk(r.itemId))
          .reduce((s, r) => s + r.weight, 0);
        return bad / total;
      };
      expect(badShare(1), zoneId).toBeLessThan(badShare(0));
      expect(badShare(2), zoneId).toBeLessThan(badShare(1));
    }
  });

  it('falls back to the Vale for water with no table of its own', () => {
    expect(fishingTablesFor('some_dungeon')).toBe(FISHING_TABLES_BY_BAND.eastbrook_vale);
    expect(fishingTablesFor('veiled_hollow')).toBe(FISHING_TABLES_BY_BAND.veiled_hollow);
  });

  it('names the junk catches explicitly rather than reading the item kind', () => {
    expect(isFishingJunk('tangled_weed')).toBe(true);
    expect(isFishingJunk('soggy_boot')).toBe(true);
    // gathered materials are filed under kind 'junk' too; they must not count
    expect(ITEMS.tangled_weed.kind).toBe('junk');
    expect(GATHER_MATERIAL_ITEMS.copper_ore.kind).toBe('junk');
    expect(isFishingJunk('copper_ore')).toBe(false);
  });
});
