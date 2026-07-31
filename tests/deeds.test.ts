import { describe, expect, it } from 'vitest';
import { DEED_CATALOG, DEED_ORDER, DEEDS } from '../src/sim/content/deeds';
import {
  applyDeedEvent,
  applyDeedEvents,
  DEED_COUNTER_MODE,
  deedCompletion,
  deedCounter,
  deedMark,
  deedProgressView,
  deedRenown,
  deedTitles,
  type DeedCatalog,
  type DeedEvent,
  type DeedProgress,
  evaluateDeeds,
  freshDeedProgress,
  restoreDeedProgress,
  serializeDeedProgress,
} from '../src/sim/deeds';

const STAMP = 1234;

const fold = (events: readonly DeedEvent[], catalog: DeedCatalog = DEED_CATALOG) =>
  applyDeedEvents(freshDeedProgress(), events, catalog, STAMP);

// A tiny purpose-built catalogue, so the mechanism tests do not depend on the
// shipped content staying exactly as authored.
const TEST_CATALOG: DeedCatalog = {
  deeds: {
    t_kill_1: {
      id: 't_kill_1',
      name: 'One',
      desc: '',
      category: 'combat',
      renown: 5,
      trigger: { kind: 'counter', counter: 'kills', count: 1 },
    },
    t_kill_3: {
      id: 't_kill_3',
      name: 'Three',
      desc: '',
      category: 'combat',
      renown: 10,
      trigger: { kind: 'counter', counter: 'kills', count: 3 },
      reward: { kind: 'title', titleId: 'deed:tester' },
    },
    t_zones: {
      id: 't_zones',
      name: 'Zones',
      desc: '',
      category: 'exploration',
      renown: 15,
      trigger: { kind: 'markCount', namespace: 'zone', count: 2 },
    },
    t_all: {
      id: 't_all',
      name: 'All',
      desc: '',
      category: 'raid',
      renown: 20,
      trigger: { kind: 'allMarks', marks: [deedMark('boss', 'a'), deedMark('boss', 'b')] },
    },
    t_meta: {
      id: 't_meta',
      name: 'Meta',
      desc: '',
      category: 'raid',
      renown: 50,
      trigger: { kind: 'meta', requires: ['t_kill_3', 't_all'] },
    },
    t_hidden: {
      id: 't_hidden',
      name: 'Hidden',
      desc: '',
      category: 'combat',
      renown: 0,
      hidden: true,
      trigger: { kind: 'counter', counter: 'deaths', count: 1 },
    },
  },
  // t_meta sits BEFORE its requirements on purpose: the evaluator's fixpoint
  // must still grant it in the same pass.
  order: ['t_meta', 't_kill_1', 't_kill_3', 't_zones', 't_all', 't_hidden'],
};

describe('deeds: progress accumulation', () => {
  it('sums the summing counters and high-waters the max ones', () => {
    const { progress } = fold(
      [
        { kind: 'kill', mobId: 'wolf' },
        { kind: 'kill', mobId: 'wolf' },
        { kind: 'kill', mobId: 'boar' },
        { kind: 'level', level: 12 },
        { kind: 'level', level: 7 }, // a regression must not lower the mark
      ],
      TEST_CATALOG,
    );
    expect(deedCounter(progress, 'kills')).toBe(3);
    expect(deedCounter(progress, 'level')).toBe(12);
  });

  it('never lets a max counter regress, even for reputation loss', () => {
    const { progress } = fold([
      { kind: 'reputation', factionId: 'dawn_of_claude', points: 9000 },
      { kind: 'reputation', factionId: 'dawn_of_claude', points: 100 },
    ]);
    expect(deedCounter(progress, 'reputationDawn')).toBe(9000);
  });

  it('ignores reputation for factions with no counter', () => {
    const { progress } = fold([{ kind: 'reputation', factionId: 'nobody', points: 50000 }]);
    expect(deedCounter(progress, 'reputationDawn')).toBe(0);
  });

  it('records marks for bosses, quests, zones, dungeons, delves, and quality', () => {
    const { progress } = fold(
      [
        { kind: 'kill', mobId: 'morthen', boss: true },
        { kind: 'kill', mobId: 'trash', boss: false },
        { kind: 'questDone', questId: 'q_aw_arrival' },
        { kind: 'zoneEnter', zoneId: 'ashen_wastes' },
        { kind: 'dungeonClear', dungeonId: 'hollow_crypt' },
        { kind: 'delveClear', delveId: 'collapsed_reliquary', tierId: 'heroic' },
        { kind: 'loot', itemId: 'x', quality: 'epic', copper: 500 },
        { kind: 'loot', itemId: 'y', quality: 'common', copper: 500 },
      ],
      TEST_CATALOG,
    );
    expect([...progress.marks].sort()).toEqual([
      'boss:morthen',
      'delve:collapsed_reliquary:heroic',
      'dungeon:hollow_crypt',
      'quality:epic',
      'quest:q_aw_arrival',
      'zone:ashen_wastes',
    ]);
    // Non-boss kills and common loot leave no mark, but still feed counters.
    expect(deedCounter(progress, 'kills')).toBe(2);
    expect(deedCounter(progress, 'bossKills')).toBe(1);
    expect(deedCounter(progress, 'copperLooted')).toBe(1000);
  });

  it('reports a progress bar for every trigger kind', () => {
    const { progress } = fold(
      [
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
        { kind: 'zoneEnter', zoneId: 'eastbrook_vale' },
        { kind: 'kill', mobId: 'a', boss: true },
      ],
      TEST_CATALOG,
    );
    expect(deedProgressView(progress, TEST_CATALOG.deeds.t_kill_3)).toMatchObject({
      current: 3,
      required: 3,
    });
    expect(deedProgressView(progress, TEST_CATALOG.deeds.t_zones)).toMatchObject({
      current: 1,
      required: 2,
    });
    expect(deedProgressView(progress, TEST_CATALOG.deeds.t_all)).toMatchObject({
      current: 1,
      required: 2,
    });
    expect(deedProgressView(progress, TEST_CATALOG.deeds.t_meta)).toMatchObject({
      current: 1,
      required: 2,
    });
  });

  it('returns the SAME progress reference when nothing changed', () => {
    const base = freshDeedProgress();
    const noop = applyDeedEvent(
      base,
      { kind: 'reputation', factionId: 'nobody', points: 1 },
      TEST_CATALOG,
      STAMP,
    );
    expect(noop.progress).toBe(base);
    expect(noop.completed).toEqual([]);
  });
});

describe('deeds: completion', () => {
  it('completes a deed exactly once, never twice', () => {
    const first = fold([{ kind: 'kill', mobId: 'a' }], TEST_CATALOG);
    expect(first.completed).toEqual(['t_kill_1']);
    expect(first.renownGained).toBe(5);

    // The very same event again: the counter still climbs, the deed does not
    // re-complete, and no renown is re-awarded.
    const second = applyDeedEvent(
      first.progress,
      { kind: 'kill', mobId: 'a' },
      TEST_CATALOG,
      STAMP,
    );
    expect(second.completed).toEqual([]);
    expect(second.renownGained).toBe(0);
    expect(deedCounter(second.progress, 'kills')).toBe(2);
    expect(second.progress.earned.get('t_kill_1')).toBe(STAMP);

    // A forced full re-scan cannot re-grant it either.
    const rescan = evaluateDeeds(second.progress, TEST_CATALOG, 9999);
    expect(rescan.completed).toEqual([]);
    expect(rescan.progress).toBe(second.progress);
    expect(rescan.progress.earned.get('t_kill_1')).toBe(STAMP);
  });

  it('grants in catalogue order, not Set/Map order', () => {
    const { completed } = fold(
      [
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
      ],
      TEST_CATALOG,
    );
    expect(completed).toEqual(['t_kill_1', 't_kill_3']);
  });

  it('resolves a meta deed in the SAME pass as its requirements', () => {
    const { completed, renownGained } = fold(
      [
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'b', boss: true },
        // This one event completes t_kill_3 and t_all, which completes t_meta.
        { kind: 'kill', mobId: 'a', boss: true },
      ],
      TEST_CATALOG,
    );
    // t_kill_1 landed on the first event; the last event grants t_kill_3 and
    // t_all in sweep one and then t_meta in sweep two, even though t_meta is
    // listed FIRST in the order.
    expect(completed).toEqual(['t_kill_1', 't_kill_3', 't_all', 't_meta']);
    expect(renownGained).toBe(5 + 50 + 10 + 20);
  });

  it('awards titles only for the deeds that carry them', () => {
    const { progress, titlesGranted } = fold(
      [
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
        { kind: 'kill', mobId: 'a' },
      ],
      TEST_CATALOG,
    );
    expect(titlesGranted).toEqual(['deed:tester']);
    expect(deedTitles(progress, TEST_CATALOG)).toEqual(['deed:tester']);
  });

  it('totals renown over earned deeds only', () => {
    const { progress } = fold([{ kind: 'kill', mobId: 'a' }], TEST_CATALOG);
    expect(deedRenown(progress, TEST_CATALOG)).toBe(5);
  });

  it('masks a hidden deed out of the completion pair until earned', () => {
    const visible = deedCompletion(freshDeedProgress(), TEST_CATALOG);
    expect(visible).toEqual({ earned: 0, total: 5 }); // 6 deeds, t_hidden masked

    const { progress } = fold([{ kind: 'death' }], TEST_CATALOG);
    expect(deedCompletion(progress, TEST_CATALOG)).toEqual({ earned: 1, total: 6 });
  });

  it('ignores an earned id whose definition no longer exists', () => {
    const orphan: DeedProgress = {
      counters: {},
      marks: new Set(),
      earned: new Map([['t_retired', 1]]),
    };
    expect(deedCompletion(orphan, TEST_CATALOG).earned).toBe(0);
    expect(deedRenown(orphan, TEST_CATALOG)).toBe(0);
  });
});

describe('deeds: determinism', () => {
  const SCRIPT: readonly DeedEvent[] = [
    { kind: 'level', level: 2 },
    { kind: 'kill', mobId: 'forest_wolf' },
    { kind: 'zoneEnter', zoneId: 'eastbrook_vale' },
    { kind: 'zoneEnter', zoneId: 'mirefen_marsh' },
    { kind: 'questDone', questId: 'q_aw_arrival' },
    { kind: 'level', level: 20 },
    { kind: 'kill', mobId: 'morthen', boss: true },
    { kind: 'loot', itemId: 'x', quality: 'epic', copper: 1200 },
    { kind: 'reputation', factionId: 'dawn_of_claude', points: 9000 },
  ];

  it('replays byte-identically over the shipped catalogue', () => {
    const once = () => {
      const r = fold(SCRIPT);
      return JSON.stringify({
        state: serializeDeedProgress(r.progress),
        completed: r.completed,
        renown: r.renownGained,
        titles: r.titlesGranted,
      });
    };
    expect(once()).toEqual(once());
  });

  it('reaches the same state whether folded one at a time or in a batch', () => {
    const batch = fold(SCRIPT);
    let stepwise = freshDeedProgress();
    for (const e of SCRIPT) stepwise = applyDeedEvent(stepwise, e, DEED_CATALOG, STAMP).progress;
    expect(serializeDeedProgress(stepwise)).toEqual(serializeDeedProgress(batch.progress));
  });
});

describe('deeds: persistence', () => {
  it('round-trips through the saved form', () => {
    const { progress } = fold([
      { kind: 'kill', mobId: 'morthen', boss: true },
      { kind: 'level', level: 20 },
      { kind: 'zoneEnter', zoneId: 'ashen_wastes' },
    ]);
    const restored = restoreDeedProgress(serializeDeedProgress(progress));
    expect(serializeDeedProgress(restored)).toEqual(serializeDeedProgress(progress));
    expect([...restored.earned.keys()].sort()).toEqual([...progress.earned.keys()].sort());
  });

  it('stays sparse and sorted so an untouched chronicle never churns a save', () => {
    expect(serializeDeedProgress(freshDeedProgress())).toEqual({});
    const { progress } = fold([
      { kind: 'zoneEnter', zoneId: 'thornpeak_heights' },
      { kind: 'zoneEnter', zoneId: 'eastbrook_vale' },
    ]);
    const saved = serializeDeedProgress(progress);
    expect(saved.marks).toEqual(['zone:eastbrook_vale', 'zone:thornpeak_heights']);
  });

  it('bounds what a hand-edited save can inject', () => {
    const restored = restoreDeedProgress({
      counters: { kills: 5, bogus: 9 } as never,
      marks: ['zone:eastbrook_vale', 'evil:not_a_namespace', 'boss:morthen'],
      earned: { cmb_first_blood: 3, '': Number.NaN as never },
    });
    expect(deedCounter(restored, 'kills')).toBe(5);
    expect([...restored.marks].sort()).toEqual(['boss:morthen', 'zone:eastbrook_vale']);
    expect(restored.earned.has('cmb_first_blood')).toBe(true);
    expect(restored.earned.size).toBe(1);
  });

  it('re-checks earned deeds on load (the retro pass)', () => {
    // A save carrying counters but no earned ids: the join-time pass backfills.
    const loaded = restoreDeedProgress({ counters: { kills: 1500, level: 20 } });
    const { completed } = evaluateDeeds(loaded, DEED_CATALOG, STAMP);
    expect(completed).toContain('cmb_first_blood');
    expect(completed).toContain('cmb_slayer');
    expect(completed).toContain('prog_level_cap');
  });
});

describe('deeds: catalogue integrity', () => {
  it('has a unique, append-only order that matches the table', () => {
    expect(new Set(DEED_ORDER).size).toBe(DEED_ORDER.length);
    expect(DEED_ORDER.length).toBe(Object.keys(DEEDS).length);
    for (const id of DEED_ORDER) expect(DEEDS[id]?.id).toBe(id);
  });

  it('declares an accumulation mode for every counter it uses', () => {
    for (const id of DEED_ORDER) {
      const t = DEEDS[id].trigger;
      if (t.kind === 'counter') expect(DEED_COUNTER_MODE[t.counter]).toBeDefined();
    }
  });

  it('only references deeds that exist from its meta triggers', () => {
    for (const id of DEED_ORDER) {
      const t = DEEDS[id].trigger;
      if (t.kind !== 'meta') continue;
      for (const req of t.requires) expect(DEEDS[req], `${id} requires ${req}`).toBeDefined();
    }
  });

  it('gives every deed non-negative renown and a distinct title id', () => {
    const titles = new Set<string>();
    for (const id of DEED_ORDER) {
      const def = DEEDS[id];
      expect(def.renown).toBeGreaterThanOrEqual(0);
      if (def.reward?.kind !== 'title') continue;
      // The deed: prefix keeps these clear of the milestone ids on Entity.title.
      expect(def.reward.titleId.startsWith('deed:')).toBe(true);
      expect(titles.has(def.reward.titleId)).toBe(false);
      titles.add(def.reward.titleId);
    }
  });

  it('names no em dash, en dash, or emoji in its English copy', () => {
    for (const id of DEED_ORDER) {
      const def = DEEDS[id];
      expect(`${def.name} ${def.desc}`).not.toMatch(/[–—\u{1F300}-\u{1FAFF}]/u);
    }
  });
});

describe('deeds: content cross-check (every id must be live content)', () => {
  it('references only real zones, bosses, quests, delves, and dungeons', async () => {
    const { DELVES, DUNGEONS, MOBS, QUESTS, ZONES } = await import('../src/sim/data');
    const { WORLD_BOSSES } = await import('../src/sim/world_boss');

    const zoneIds = new Set(ZONES.map((z) => z.id));
    const questIds = new Set(Object.keys(QUESTS));
    const dungeonIds = new Set(Object.keys(DUNGEONS));
    const mobIds = new Set([...Object.keys(MOBS), ...WORLD_BOSSES.map((b) => b.templateId)]);
    const delveIds = new Set(Object.keys(DELVES));

    const checkMark = (owner: string, mark: string) => {
      const ns = mark.slice(0, mark.indexOf(':'));
      const rest = mark.slice(mark.indexOf(':') + 1);
      if (ns === 'zone') expect(zoneIds.has(rest), `${owner}: zone ${rest}`).toBe(true);
      else if (ns === 'quest') expect(questIds.has(rest), `${owner}: quest ${rest}`).toBe(true);
      else if (ns === 'boss') expect(mobIds.has(rest), `${owner}: mob ${rest}`).toBe(true);
      else if (ns === 'dungeon') expect(dungeonIds.has(rest), `${owner}: dungeon ${rest}`).toBe(true);
      else if (ns === 'delve')
        expect(delveIds.has(rest.slice(0, rest.indexOf(':'))), `${owner}: delve ${rest}`).toBe(true);
    };

    for (const id of DEED_ORDER) {
      const t = DEEDS[id].trigger;
      if (t.kind === 'mark') checkMark(id, t.mark);
      else if (t.kind === 'allMarks') for (const m of t.marks) checkMark(id, m);
    }
  });
});
