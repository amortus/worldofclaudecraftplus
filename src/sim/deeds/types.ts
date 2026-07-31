// Deed types — the shape of the chronicle system. A pure leaf: it imports only
// types, so both the evaluator and the content catalogue can depend on it
// without a cycle.
//
// A deed is five things: an ID, a TRIGGER condition, PROGRESS tracking, a
// COMPLETION that fires exactly once, and a REWARD (renown, and optionally a
// title). Nothing here is player-visible text beyond the English `name`/`desc`
// authored in `src/sim/content/deeds/`, which the client re-localizes.

import type { ItemDef } from '../types';

/** Item qualities a loot deed can key on (the sim's own quality union). */
export type DeedItemQuality = NonNullable<ItemDef['quality']>;

export type DeedCategory = 'progression' | 'combat' | 'exploration' | 'dungeon' | 'raid';

/**
 * The tracked lifetime numbers. Each has a fixed accumulation MODE
 * (`DEED_COUNTER_MODE` in the evaluator): `sum` counters add every event,
 * `max` counters are high-water marks that can never regress. The mode is what
 * makes a deed's score monotonic, which is what makes "completes exactly once"
 * hold even if the caller replays an event.
 */
export type DeedCounterId =
  | 'level'
  | 'lifetimeXp'
  | 'prestigeRank'
  | 'talentPointsSpent'
  | 'kills'
  | 'bossKills'
  | 'deaths'
  | 'questsCompleted'
  | 'duelWins'
  | 'arenaWins'
  | 'delveClears'
  | 'dungeonClears'
  | 'reputationDawn'
  | 'copperLooted';

/**
 * Namespaces for the distinct-thing marks (a Set of `"<namespace>:<id>"`).
 * Bounded by construction: a mark outside these namespaces is dropped on load,
 * so a hand-edited save can never grow the set without limit.
 */
export const DEED_MARK_NAMESPACES = [
  'zone',
  'boss',
  'quest',
  'dungeon',
  'delve',
  'quality',
] as const;
export type DeedMarkNamespace = (typeof DEED_MARK_NAMESPACES)[number];

/** Build a mark. The ONE place the `"ns:id"` encoding lives. */
export function deedMark(ns: DeedMarkNamespace, id: string): string {
  return `${ns}:${id}`;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type DeedTrigger =
  /** A counter reaching `count`. */
  | { kind: 'counter'; counter: DeedCounterId; count: number }
  /** One specific mark being held (a named boss, a named quest, a named zone). */
  | { kind: 'mark'; mark: string }
  /** `count` DISTINCT marks in one namespace (breadth deeds: "see all four zones"). */
  | { kind: 'markCount'; namespace: DeedMarkNamespace; count: number }
  /** Every mark in a PINNED list (completionist deeds: "all eight Claudeholme bosses"). */
  | { kind: 'allMarks'; marks: readonly string[] }
  /** Every listed deed already earned (chapter/capstone deeds). */
  | { kind: 'meta'; requires: readonly string[] };

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * Beyond renown (which every deed carries) a deed may grant a title. `titleId`
 * is a stable id in the `deed:` namespace so it can never collide with the
 * existing milestone-id titles on `Entity.title`; the client renders its text.
 */
export type DeedReward = { kind: 'title'; titleId: string };

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------

export interface DeedDef {
  id: string;
  /** English source text. Player-visible; re-localized at the client boundary. */
  name: string;
  desc: string;
  category: DeedCategory;
  /** Score contributed when earned. Zero is legal (collection/luck deeds). */
  renown: number;
  trigger: DeedTrigger;
  reward?: DeedReward;
  /** Hidden deeds are masked out of the completion pair until earned. */
  hidden?: boolean;
}

export interface DeedCatalog {
  deeds: Readonly<Record<string, DeedDef>>;
  /** APPEND-ONLY. Grant order is this order, which is what keeps grants deterministic. */
  order: readonly string[];
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * One character's chronicle state. Treated as IMMUTABLE: every evaluator
 * function returns either a new object or the exact same reference when nothing
 * changed, so a caller can cheaply test `next !== prev` to decide whether to
 * persist or re-broadcast.
 */
export interface DeedProgress {
  readonly counters: Readonly<Partial<Record<DeedCounterId, number>>>;
  readonly marks: ReadonlySet<string>;
  /** deedId -> the caller's completion stamp (sim day / tick). Insertion order = grant order. */
  readonly earned: ReadonlyMap<string, number>;
}

/** Result of one evaluation pass. */
export interface DeedEvaluation {
  /** The same reference as the input when nothing changed. */
  progress: DeedProgress;
  /** Ids completed by THIS call, in catalogue order. Never contains a duplicate. */
  completed: readonly string[];
  renownGained: number;
  /** Title ids granted by this call, parallel to the completions that carry one. */
  titlesGranted: readonly string[];
}

/** A single deed's bar, for the UI. */
export interface DeedProgressView {
  current: number;
  required: number;
  complete: boolean;
}

/** JSON-safe persisted form. Sorted + sparse so equal states serialize byte-equal. */
export interface SavedDeedProgress {
  counters?: Partial<Record<DeedCounterId, number>>;
  marks?: string[];
  earned?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * What the sim reports to the chronicle. Deliberately its OWN union rather than
 * `SimEvent`: several deeds key on facts `SimEvent` does not carry (whether a
 * kill was a boss, which dungeon a clear belongs to), and keeping the seam
 * explicit means the evaluator never has to re-derive world state.
 */
export type DeedEvent =
  | { kind: 'level'; level: number }
  | { kind: 'xp'; lifetimeXp: number }
  | { kind: 'prestige'; rank: number }
  | { kind: 'talents'; pointsSpent: number }
  | { kind: 'kill'; mobId: string; boss?: boolean }
  | { kind: 'death' }
  | { kind: 'questDone'; questId: string }
  | { kind: 'duelWin' }
  | { kind: 'arenaWin' }
  | { kind: 'delveClear'; delveId: string; tierId: string }
  | { kind: 'dungeonClear'; dungeonId: string }
  | { kind: 'reputation'; factionId: string; points: number }
  | { kind: 'loot'; itemId: string; quality: DeedItemQuality; copper?: number }
  | { kind: 'zoneEnter'; zoneId: string };
