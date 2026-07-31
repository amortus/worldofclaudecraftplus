// The deed evaluator — the deterministic core of the chronicle system.
//
// One function does the work: `applyDeedEvent(progress, event, catalog, stamp)`
// folds a single world event into the progress state and returns the new state
// plus whatever completed. It is a PURE state transition:
//  - no world, no `Sim`, no mutable capture: everything arrives as arguments;
//  - no randomness and no wall clock (the `stamp` is the caller's SIM clock),
//    so replaying the same event sequence always yields the same chronicle;
//  - the input `progress` is never mutated; an unchanged pass returns the SAME
//    reference, so `next !== prev` is a cheap "should I persist this?" test.
//
// COMPLETES EXACTLY ONCE. Two independent guards make this hold:
//  1. `earned` is a map keyed by deed id, and a grant is skipped when the key is
//     already present. A deed cannot be granted twice even by a forced re-scan.
//  2. Every counter is monotonic by construction (`DEED_COUNTER_MODE`: `sum`
//     accumulates, `max` is a high-water mark), so a re-delivered event can
//     never push a score back below a threshold and re-arm a trigger.
//
// GRANT ORDER is `catalog.order`, the append-only id list, NOT the iteration
// order of any Set or Map. That is what keeps two runs of the same inputs
// byte-identical.

import {
  type DeedCatalog,
  type DeedCounterId,
  type DeedDef,
  type DeedEvaluation,
  type DeedEvent,
  DEED_MARK_NAMESPACES,
  type DeedMarkNamespace,
  deedMark,
  type DeedProgress,
  type DeedProgressView,
  type DeedTrigger,
  type SavedDeedProgress,
} from './types';

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * How each counter accumulates. `sum` counters add each event's contribution;
 * `max` counters are high-water marks fed an ABSOLUTE value (a level, a rep
 * total) and can never regress, so losing reputation or a level rollback never
 * un-earns a deed. This table is the whole reason completion is idempotent.
 */
export const DEED_COUNTER_MODE: Readonly<Record<DeedCounterId, 'sum' | 'max'>> = {
  level: 'max',
  lifetimeXp: 'max',
  prestigeRank: 'max',
  talentPointsSpent: 'max',
  reputationDawn: 'max',
  kills: 'sum',
  bossKills: 'sum',
  deaths: 'sum',
  questsCompleted: 'sum',
  duelWins: 'sum',
  arenaWins: 'sum',
  delveClears: 'sum',
  dungeonClears: 'sum',
  copperLooted: 'sum',
};

const COUNTER_IDS = Object.keys(DEED_COUNTER_MODE) as readonly DeedCounterId[];

/** Reputation factions that feed a counter. Unlisted factions are ignored. */
const REPUTATION_COUNTERS: Readonly<Record<string, DeedCounterId>> = {
  dawn_of_claude: 'reputationDawn',
};

/** Item qualities worth a `quality:<q>` mark (the "first epic" style deeds). */
const MARKED_QUALITIES = new Set(['rare', 'epic', 'legendary']);

export function deedCounter(progress: DeedProgress, counter: DeedCounterId): number {
  return progress.counters[counter] ?? 0;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function freshDeedProgress(): DeedProgress {
  return { counters: {}, marks: new Set(), earned: new Map() };
}

/** Accumulator the fold builds into. Copy-on-write: null until something changes. */
interface Draft {
  counters: Partial<Record<DeedCounterId, number>> | null;
  marks: Set<string> | null;
}

function bumpCounter(
  base: DeedProgress,
  draft: Draft,
  counter: DeedCounterId,
  value: number,
): void {
  if (!Number.isFinite(value)) return;
  const current = draft.counters?.[counter] ?? base.counters[counter] ?? 0;
  const next =
    DEED_COUNTER_MODE[counter] === 'max' ? Math.max(current, Math.floor(value)) : current + Math.floor(value);
  if (next === current) return;
  if (!draft.counters) draft.counters = { ...base.counters };
  draft.counters[counter] = next;
}

function addMark(base: DeedProgress, draft: Draft, ns: DeedMarkNamespace, id: string): void {
  if (!id) return;
  const mark = deedMark(ns, id);
  if (draft.marks ? draft.marks.has(mark) : base.marks.has(mark)) return;
  if (!draft.marks) draft.marks = new Set(base.marks);
  draft.marks.add(mark);
}

// ---------------------------------------------------------------------------
// Event folding
// ---------------------------------------------------------------------------

function foldEvent(base: DeedProgress, event: DeedEvent, draft: Draft): void {
  switch (event.kind) {
    case 'level':
      bumpCounter(base, draft, 'level', event.level);
      break;
    case 'xp':
      bumpCounter(base, draft, 'lifetimeXp', event.lifetimeXp);
      break;
    case 'prestige':
      bumpCounter(base, draft, 'prestigeRank', event.rank);
      break;
    case 'talents':
      bumpCounter(base, draft, 'talentPointsSpent', event.pointsSpent);
      break;
    case 'kill':
      bumpCounter(base, draft, 'kills', 1);
      if (event.boss) {
        bumpCounter(base, draft, 'bossKills', 1);
        addMark(base, draft, 'boss', event.mobId);
      }
      break;
    case 'death':
      bumpCounter(base, draft, 'deaths', 1);
      break;
    case 'questDone':
      bumpCounter(base, draft, 'questsCompleted', 1);
      addMark(base, draft, 'quest', event.questId);
      break;
    case 'duelWin':
      bumpCounter(base, draft, 'duelWins', 1);
      break;
    case 'arenaWin':
      bumpCounter(base, draft, 'arenaWins', 1);
      break;
    case 'delveClear':
      bumpCounter(base, draft, 'delveClears', 1);
      addMark(base, draft, 'delve', `${event.delveId}:${event.tierId}`);
      break;
    case 'dungeonClear':
      bumpCounter(base, draft, 'dungeonClears', 1);
      addMark(base, draft, 'dungeon', event.dungeonId);
      break;
    case 'reputation': {
      const counter = REPUTATION_COUNTERS[event.factionId];
      if (counter) bumpCounter(base, draft, counter, event.points);
      break;
    }
    case 'loot':
      if (event.copper && event.copper > 0) bumpCounter(base, draft, 'copperLooted', event.copper);
      if (MARKED_QUALITIES.has(event.quality)) addMark(base, draft, 'quality', event.quality);
      break;
    case 'zoneEnter':
      addMark(base, draft, 'zone', event.zoneId);
      break;
  }
}

// ---------------------------------------------------------------------------
// Trigger evaluation
// ---------------------------------------------------------------------------

interface Snapshot {
  counters: Readonly<Partial<Record<DeedCounterId, number>>>;
  marks: ReadonlySet<string>;
  earned: ReadonlySet<string> | ReadonlyMap<string, number>;
}

function countMarksIn(marks: ReadonlySet<string>, namespace: DeedMarkNamespace): number {
  const prefix = `${namespace}:`;
  let n = 0;
  for (const mark of marks) if (mark.startsWith(prefix)) n++;
  return n;
}

function triggerSatisfied(trigger: DeedTrigger, snap: Snapshot): boolean {
  switch (trigger.kind) {
    case 'counter':
      return (snap.counters[trigger.counter] ?? 0) >= trigger.count;
    case 'mark':
      return snap.marks.has(trigger.mark);
    case 'markCount':
      return countMarksIn(snap.marks, trigger.namespace) >= trigger.count;
    case 'allMarks':
      return trigger.marks.every((mark) => snap.marks.has(mark));
    case 'meta':
      return trigger.requires.every((id) => snap.earned.has(id));
  }
}

/**
 * The player-facing bar for one deed: how far along, and out of what. Counter
 * and breadth triggers report real numbers; the boolean triggers report 0/1.
 */
export function deedProgressView(
  progress: DeedProgress,
  def: DeedDef,
): DeedProgressView {
  const complete = progress.earned.has(def.id);
  const t = def.trigger;
  switch (t.kind) {
    case 'counter':
      return {
        current: Math.min(deedCounter(progress, t.counter), t.count),
        required: t.count,
        complete,
      };
    case 'markCount':
      return {
        current: Math.min(countMarksIn(progress.marks, t.namespace), t.count),
        required: t.count,
        complete,
      };
    case 'allMarks':
      return {
        current: t.marks.filter((m) => progress.marks.has(m)).length,
        required: t.marks.length,
        complete,
      };
    case 'meta':
      return {
        current: t.requires.filter((id) => progress.earned.has(id)).length,
        required: t.requires.length,
        complete,
      };
    case 'mark':
      return { current: progress.marks.has(t.mark) ? 1 : 0, required: 1, complete };
  }
}

// ---------------------------------------------------------------------------
// The grant pass
// ---------------------------------------------------------------------------

const UNCHANGED: readonly string[] = [];

function evaluate(
  base: DeedProgress,
  draft: Draft,
  catalog: DeedCatalog,
  stamp: number,
): DeedEvaluation {
  const counters = draft.counters ?? base.counters;
  const marks = draft.marks ?? base.marks;
  let earned: Map<string, number> | null = null;
  const completed: string[] = [];
  const titlesGranted: string[] = [];
  let renownGained = 0;

  // Bounded fixpoint: a `meta` deed can be satisfied by a grant made earlier in
  // the SAME pass, and the catalogue does not force requirements to be listed
  // first. Each sweep either grants something or stops, so this runs at most
  // `order.length + 1` times and always in the same order for the same inputs.
  for (let sweep = 0; sweep <= catalog.order.length; sweep++) {
    let granted = false;
    const snapshotEarned: ReadonlyMap<string, number> = earned ?? base.earned;
    const snap: Snapshot = { counters, marks, earned: snapshotEarned };
    for (const id of catalog.order) {
      const def = catalog.deeds[id];
      // An id in the order with no live definition is skipped, never thrown on:
      // a removed deed must not break a save that still holds it.
      if (!def) continue;
      if (snapshotEarned.has(id)) continue;
      if (!triggerSatisfied(def.trigger, snap)) continue;
      if (!earned) earned = new Map(base.earned);
      earned.set(id, stamp);
      completed.push(id);
      renownGained += def.renown;
      if (def.reward?.kind === 'title') titlesGranted.push(def.reward.titleId);
      granted = true;
    }
    if (!granted) break;
  }

  if (!draft.counters && !draft.marks && !earned) {
    return { progress: base, completed: UNCHANGED, renownGained: 0, titlesGranted: UNCHANGED };
  }
  return {
    progress: { counters, marks, earned: earned ?? base.earned },
    completed,
    renownGained,
    titlesGranted,
  };
}

/**
 * Fold one world event into the chronicle.
 *
 * `stamp` is the caller's sim-clock completion stamp (`Sim.tickCount`, or a UTC
 * day supplied by the host); it is stored, never compared, so its units are the
 * caller's business. Returns the SAME `progress` reference when the event
 * changed nothing.
 */
export function applyDeedEvent(
  progress: DeedProgress,
  event: DeedEvent,
  catalog: DeedCatalog,
  stamp: number,
): DeedEvaluation {
  const draft: Draft = { counters: null, marks: null };
  foldEvent(progress, event, draft);
  return evaluate(progress, draft, catalog, stamp);
}

/** Fold a batch in order. Equivalent to folding each event in sequence. */
export function applyDeedEvents(
  progress: DeedProgress,
  events: readonly DeedEvent[],
  catalog: DeedCatalog,
  stamp: number,
): DeedEvaluation {
  let current = progress;
  const completed: string[] = [];
  const titlesGranted: string[] = [];
  let renownGained = 0;
  for (const event of events) {
    const result = applyDeedEvent(current, event, catalog, stamp);
    current = result.progress;
    completed.push(...result.completed);
    titlesGranted.push(...result.titlesGranted);
    renownGained += result.renownGained;
  }
  if (current === progress) {
    return { progress, completed: UNCHANGED, renownGained: 0, titlesGranted: UNCHANGED };
  }
  return { progress: current, completed, renownGained, titlesGranted };
}

/**
 * Re-check every deed against the CURRENT progress without folding an event.
 * The retro pass: run it once when a character loads so a veteran gets credit
 * for state they already verifiably hold, and after a catalogue change.
 */
export function evaluateDeeds(
  progress: DeedProgress,
  catalog: DeedCatalog,
  stamp: number,
): DeedEvaluation {
  return evaluate(progress, { counters: null, marks: null }, catalog, stamp);
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/** Total renown: the sum over EARNED deeds that still exist in the catalogue. */
export function deedRenown(progress: DeedProgress, catalog: DeedCatalog): number {
  let total = 0;
  for (const id of catalog.order) {
    if (progress.earned.has(id)) total += catalog.deeds[id]?.renown ?? 0;
  }
  return total;
}

/**
 * The "{earned}/{total}" pair. A hidden deed is masked until earned, so the
 * visible total never reveals how many secrets remain.
 */
export function deedCompletion(
  progress: DeedProgress,
  catalog: DeedCatalog,
): { earned: number; total: number } {
  let earned = 0;
  let total = 0;
  for (const id of catalog.order) {
    const def = catalog.deeds[id];
    if (!def) continue;
    const has = progress.earned.has(id);
    if (def.hidden && !has) continue;
    total++;
    if (has) earned++;
  }
  return { earned, total };
}

/** Every title id the character has unlocked, in catalogue order. */
export function deedTitles(progress: DeedProgress, catalog: DeedCatalog): string[] {
  const out: string[] = [];
  for (const id of catalog.order) {
    if (!progress.earned.has(id)) continue;
    const reward = catalog.deeds[id]?.reward;
    if (reward?.kind === 'title') out.push(reward.titleId);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Sparse + sorted: zero counters, empty sets, and an empty earned map are
 * omitted, and members are sorted, so an untouched chronicle never churns a
 * save and two equal states serialize byte-equal.
 */
export function serializeDeedProgress(progress: DeedProgress): SavedDeedProgress {
  const out: SavedDeedProgress = {};
  const counters: Partial<Record<DeedCounterId, number>> = {};
  let anyCounter = false;
  for (const id of COUNTER_IDS) {
    const v = progress.counters[id] ?? 0;
    if (v > 0) {
      counters[id] = v;
      anyCounter = true;
    }
  }
  if (anyCounter) out.counters = counters;
  if (progress.marks.size > 0) out.marks = [...progress.marks].sort();
  if (progress.earned.size > 0) {
    const earned: Record<string, number> = {};
    for (const id of [...progress.earned.keys()].sort()) earned[id] = progress.earned.get(id) ?? 0;
    out.earned = earned;
  }
  return out;
}

/**
 * Restore, BOUNDED exactly like the write sites: only known counters, only
 * marks in an authored namespace, only finite non-negative numbers. A
 * hand-edited save can add junk but cannot grow the state unboundedly or feed
 * the evaluator a shape it does not expect.
 */
export function restoreDeedProgress(saved: SavedDeedProgress | undefined | null): DeedProgress {
  if (!saved) return freshDeedProgress();
  const counters: Partial<Record<DeedCounterId, number>> = {};
  for (const id of COUNTER_IDS) {
    const v = saved.counters?.[id];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) counters[id] = Math.floor(v);
  }
  const marks = new Set<string>();
  for (const mark of saved.marks ?? []) {
    if (typeof mark !== 'string') continue;
    const ns = mark.slice(0, mark.indexOf(':'));
    if ((DEED_MARK_NAMESPACES as readonly string[]).includes(ns)) marks.add(mark);
  }
  const earned = new Map<string, number>();
  for (const id of Object.keys(saved.earned ?? {}).sort()) {
    const stamp = saved.earned?.[id];
    if (typeof stamp === 'number' && Number.isFinite(stamp)) earned.set(id, stamp);
  }
  return { counters, marks, earned };
}
