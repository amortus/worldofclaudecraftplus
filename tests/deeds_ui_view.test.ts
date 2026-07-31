import { describe, expect, it } from 'vitest';
import {
  buildDeedsPanelView,
  DEED_CATEGORY_ORDER,
  deedCategoryRows,
} from '../src/ui/deeds_view';
import {
  applyDeedEvents,
  type DeedEvent,
  type DeedProgress,
  deedCompletion,
  deedRenown,
  freshDeedProgress,
} from '../src/sim/deeds';
import { DEED_CATALOG } from '../src/sim/content/deeds';
// The IWorld chronicle readout the panel actually consumes. Driving the tests
// through it (rather than through the evaluator) is what pins the panel to the
// seam both Sim and ClientWorld implement.
import { buildDeedsView } from '../src/sim/sim';
import { en } from '../src/ui/i18n.catalog';

function after(...events: DeedEvent[]): DeedProgress {
  return applyDeedEvents(freshDeedProgress(), events, DEED_CATALOG, 1).progress;
}

/** The panel view for a chronicle state, through the real IWorld readout. */
function panel(progress: DeedProgress) {
  return buildDeedsPanelView(buildDeedsView(progress));
}

const HIDDEN_IDS = Object.values(DEED_CATALOG.deeds)
  .filter((d) => d.hidden)
  .map((d) => d.id);

describe('category grouping', () => {
  it('always emits the five categories in tab order, even when a category is empty', () => {
    const view = panel(freshDeedProgress());
    expect(view.categories.map((c) => c.category)).toEqual([
      'progression',
      'combat',
      'exploration',
      'dungeon',
      'raid',
    ]);
    expect(DEED_CATEGORY_ORDER).toHaveLength(5);
  });

  it('files every row under its own category and nowhere else', () => {
    const view = panel(freshDeedProgress());
    const seen = new Set<string>();
    for (const bucket of view.categories) {
      for (const row of bucket.rows) {
        expect(row.category).toBe(bucket.category);
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
      }
    }
  });

  it('keeps rows in the append-only catalogue order inside a category', () => {
    const view = panel(freshDeedProgress());
    for (const bucket of view.categories) {
      const catalogOrder = DEED_CATALOG.order.filter((id) =>
        bucket.rows.some((row) => row.id === id),
      );
      expect(bucket.rows.map((r) => r.id)).toEqual(catalogOrder);
    }
  });

  it('counts earned and renown per category', () => {
    const progress = after({ kind: 'level', level: 5 });
    const view = panel(progress);
    const prog = view.categories.find((c) => c.category === 'progression')!;
    // Level 5 earns First Steps (5) and Finding Your Feet (5).
    expect(prog.earned).toBe(2);
    expect(prog.renown).toBe(10);
    expect(view.categories.find((c) => c.category === 'raid')!.earned).toBe(0);
  });

  it('deedCategoryRows is a convenience view over the same buckets', () => {
    const view = panel(freshDeedProgress());
    expect(deedCategoryRows(view, 'combat')).toBe(
      view.categories.find((c) => c.category === 'combat')!.rows,
    );
  });
});

describe('the hidden-deed rule', () => {
  it('has hidden deeds in the catalogue to test against', () => {
    expect(HIDDEN_IDS.length).toBeGreaterThan(0);
  });

  it('omits an unearned hidden deed from its category entirely', () => {
    const view = panel(freshDeedProgress());
    const ids = view.categories.flatMap((c) => c.rows.map((r) => r.id));
    for (const id of HIDDEN_IDS) expect(ids).not.toContain(id);
  });

  it('reveals a hidden deed the moment it is earned, flagged as hidden', () => {
    // "It Happens" is the hidden first-death deed.
    const progress = after({ kind: 'death' });
    const view = panel(progress);
    const row = view.categories
      .flatMap((c) => c.rows)
      .find((r) => r.id === 'cmb_first_fall');
    expect(row).toBeDefined();
    expect(row!.hidden).toBe(true);
    expect(row!.complete).toBe(true);
  });

  it('keeps an unearned hidden deed out of the visible totals, so secrets stay secret', () => {
    const empty = panel(freshDeedProgress());
    const withDeath = panel(after({ kind: 'death' }));
    // Earning the hidden deed adds BOTH a row and a slot to the denominator.
    expect(withDeath.completion.total).toBe(empty.completion.total + 1);
    expect(withDeath.completion.earned).toBe(empty.completion.earned + 1);
  });
});

describe('totals reconcile with the evaluator', () => {
  const progress = after(
    { kind: 'level', level: 20 },
    { kind: 'kill', mobId: 'forest_wolf' },
    { kind: 'zoneEnter', zoneId: 'eastbrook_vale' },
    { kind: 'loot', itemId: 'x', quality: 'rare', copper: 10 },
  );

  it('quotes the same {earned}/{total} pair as deedCompletion', () => {
    expect(panel(progress).completion).toEqual(
      deedCompletion(progress, DEED_CATALOG),
    );
  });

  it('quotes the same renown total as deedRenown', () => {
    expect(panel(progress).renown).toBe(deedRenown(progress, DEED_CATALOG));
  });

  it('the visible row count equals the visible total', () => {
    const view = panel(progress);
    const rows = view.categories.reduce((n, c) => n + c.rows.length, 0);
    expect(rows).toBe(view.completion.total);
    const earned = view.categories.reduce((n, c) => n + c.earned, 0);
    expect(earned).toBe(view.completion.earned);
  });

  it('surfaces unlocked titles', () => {
    const view = panel(progress);
    expect(view.titles).toContain('deed:elder');
  });
});

describe('progress bar maths', () => {
  it('reports a counter deed as current out of required, clamped at the requirement', () => {
    const progress = after({ kind: 'level', level: 7 });
    const row = deedCategoryRows(panel(progress), 'progression').find(
      (r) => r.id === 'prog_double_digits',
    )!;
    expect(row.required).toBe(10);
    expect(row.current).toBe(7);
    expect(row.percent).toBe(70);
    expect(row.complete).toBe(false);
    expect(row.binary).toBe(false);
  });

  it('drives a completed bar to a full 100 percent', () => {
    const progress = after({ kind: 'level', level: 10 });
    const row = deedCategoryRows(panel(progress), 'progression').find(
      (r) => r.id === 'prog_double_digits',
    )!;
    expect(row.complete).toBe(true);
    expect(row.current).toBe(row.required);
    expect(row.fraction).toBe(1);
    expect(row.percent).toBe(100);
  });

  it('marks a single-mark deed as binary so the panel draws a check, not a bar', () => {
    const row = deedCategoryRows(panel(freshDeedProgress()), 'exploration').find(
      (r) => r.id === 'exp_vale_wayfarer',
    )!;
    expect(row.binary).toBe(true);
    expect(row.required).toBe(1);
    expect(row.current).toBe(0);
  });

  it('counts a multi-mark completionist deed out of its pinned list length', () => {
    const row = deedCategoryRows(panel(freshDeedProgress()), 'raid').find(
      (r) => r.id === 'raid_claudeholme_complete',
    )!;
    expect(row.required).toBe(8);
    expect(row.binary).toBe(false);
  });

  it('never emits a fraction outside [0, 1] or a percent outside [0, 100]', () => {
    const progress = after(
      { kind: 'level', level: 20 },
      { kind: 'xp', lifetimeXp: 9_999_999 },
      { kind: 'loot', itemId: 'x', quality: 'epic', copper: 50_000_000 },
    );
    for (const row of panel(progress).categories.flatMap((c) => c.rows)) {
      expect(row.fraction).toBeGreaterThanOrEqual(0);
      expect(row.fraction).toBeLessThanOrEqual(1);
      expect(row.percent).toBeGreaterThanOrEqual(0);
      expect(row.percent).toBeLessThanOrEqual(100);
      expect(row.current).toBeLessThanOrEqual(row.required);
    }
  });

  it('carries a title reward through to the row that grants it', () => {
    const row = deedCategoryRows(panel(freshDeedProgress()), 'progression').find(
      (r) => r.id === 'prog_level_cap',
    )!;
    expect(row.titleId).toBe('deed:elder');
  });
});

describe('every catalogue deed has authored English copy', () => {
  const list = en.hudChrome.deeds.list as Record<string, { name: string; desc: string }>;

  it('names and describes every deed in DEED_ORDER', () => {
    const missing = DEED_CATALOG.order.filter((id) => !list[id]?.name || !list[id]?.desc);
    expect(missing).toEqual([]);
  });

  it('carries no orphan copy for a deed that is not in the catalogue', () => {
    const orphans = Object.keys(list).filter((id) => !DEED_CATALOG.deeds[id]);
    expect(orphans).toEqual([]);
  });

  it('names every deed-namespaced title reward', () => {
    const titles = en.hudChrome.deeds.titles as Record<string, string>;
    for (const id of DEED_CATALOG.order) {
      const reward = DEED_CATALOG.deeds[id]?.reward;
      if (reward?.kind !== 'title') continue;
      const slug = reward.titleId.replace(/^deed:/, '');
      expect(titles[slug], `missing title copy for ${reward.titleId}`).toBeTruthy();
    }
  });

  it('labels all five categories', () => {
    const labels = en.hudChrome.deeds.categories as Record<string, string>;
    for (const category of DEED_CATEGORY_ORDER) expect(labels[category]).toBeTruthy();
  });

  it('uses no em dash, en dash or emoji anywhere in the feature copy', () => {
    // Escapes, not literals: the repo bans the dash characters themselves from
    // every file, including the test that hunts for them.
    const banned = /[\u2012-\u2015\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const [id, entry] of Object.entries(list)) {
      expect(banned.test(entry.name), `${id}.name`).toBe(false);
      expect(banned.test(entry.desc), `${id}.desc`).toBe(false);
    }
    // The professions and unstuck blocks are copy too, and were previously
    // unguarded: walk every leaf of all three namespaces.
    const leaves = (node: unknown, path: string): [string, string][] =>
      typeof node === 'string'
        ? [[path, node]]
        : node && typeof node === 'object'
          ? Object.entries(node).flatMap(([k, v]) => leaves(v, `${path}.${k}`))
          : [];
    const copy = [
      ...leaves(en.hudChrome.professions, 'professions'),
      ...leaves(en.hudChrome.deeds, 'deeds'),
      ...leaves(en.hudChrome.unstuck, 'unstuck'),
    ];
    expect(copy.length).toBeGreaterThan(100);
    for (const [path, text] of copy) expect(banned.test(text), path).toBe(false);
  });
});

describe('buildDeedsPanelView is a pure projection', () => {
  it('returns identical structure for identical input (no hidden state)', () => {
    const progress = after({ kind: 'level', level: 12 });
    expect(panel(progress)).toEqual(panel(progress));
  });

  it('skips an entry in a category the client does not know rather than blanking the book', () => {
    const readout = buildDeedsView(freshDeedProgress());
    const withFuture = {
      ...readout,
      entries: [
        ...readout.entries,
        {
          id: 'future_deed',
          category: 'seasonal' as never,
          renown: 5,
          hidden: false,
          earned: false,
          current: 0,
          required: 1,
        },
      ],
    };
    const view = buildDeedsPanelView(withFuture);
    expect(view.categories).toHaveLength(5);
    expect(view.categories.flatMap((c) => c.rows).map((r) => r.id)).not.toContain('future_deed');
  });
});
