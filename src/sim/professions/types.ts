// Shared record shapes for the gathering professions (Professions 2.0, wave 1:
// mining / logging / herbalism / fishing). Declarative shapes only: no logic, no
// randomness, no host state. The content tables that populate them live in
// `src/sim/content/professions/`; the mechanics that read them are the sibling
// modules here.
//
// These types are LOCAL to this subsystem on purpose. `src/sim/types.ts` stays
// untouched, so nothing here widens the global `Entity`/`ItemUse` surface and a
// later crafting wave can extend this file without a merge conflict against the
// engine's core types.
//
// Zero DOM/browser/Three imports (src/sim purity, tests/architecture.test.ts).

import type { ItemDef } from '../types';

// ---------------------------------------------------------------------------
// Professions
// ---------------------------------------------------------------------------

export type ProfessionCategory = 'gathering' | 'crafting' | 'secondary';

/** The four gathering professions. Fishing is listed last so the three
 *  node-harvest professions keep a contiguous prefix in every iteration. */
export type GatheringProfessionId = 'mining' | 'logging' | 'herbalism' | 'fishing';

/** Stable iteration order over the union above, used to default and normalize a
 *  per-player proficiency record. Lives beside the union (not in content)
 *  because it IS the union, restated at runtime: the two must never disagree,
 *  and `professionIdsMatchUnion` in the content tests pins that they do not. */
export const GATHERING_PROFESSION_IDS: readonly GatheringProfessionId[] = [
  'mining',
  'logging',
  'herbalism',
  'fishing',
];

/** True when `id` names a gathering profession. Narrows an untrusted string
 *  (a wire command, a persisted save row) onto the union. */
export function isGatheringProfessionId(id: string): id is GatheringProfessionId {
  return (GATHERING_PROFESSION_IDS as readonly string[]).includes(id);
}

export interface ProfessionRecord {
  id: string;
  category: ProfessionCategory;
  /** ENFORCED per-profession proficiency ceiling. */
  maxSkill: number;
}

export interface GatheringProfessionDef extends ProfessionRecord {
  id: GatheringProfessionId;
  category: 'gathering';
  /** English source name; the client re-localizes by id (see CLAUDE.md). */
  name: string;
  /** Stable icon key the HUD/minimap paints from; never a file path. */
  icon: string;
  /** English source blurb; re-localized by id at the client boundary. */
  description: string;
}

/** A player's proficiency in every gathering profession. Independent, additive
 *  counters: granting one never touches another (no conserved pool). */
export type GatheringProficiency = Record<GatheringProfessionId, number>;

/** One row of the read-only "your skills" view the UI renders. */
export interface PlayerProfessionSkill {
  professionId: GatheringProfessionId;
  skill: number;
  maxSkill: number;
}

// ---------------------------------------------------------------------------
// World nodes
// ---------------------------------------------------------------------------

/** The three harvestable world-node types. Fishing has no node: it is cast at
 *  open water, so it is deliberately absent here. */
export type GatherNodeType = 'ore' | 'wood' | 'herb';

/** A permanent, unowned world fixture a gathering profession can harvest.
 *  Placement is a flat (x, z); the host lifts it onto the heightfield when it
 *  spawns the backing ground-object entity. */
export interface GatherNodeDef {
  id: string;
  zoneId: string;
  type: GatherNodeType;
  pos: { x: number; z: number };
  /** Required tool tier (1..4). A tool of tier >= this can work the node; a
   *  lower tier, or no tool at all, is denied. Also the node's rung on the
   *  four-state mastery curve (see `gathering.ts`). */
  tier: number;
  /** The node's zone level-range midpoint. Snapshot, not a live lookup: used
   *  for the minimap/tooltip difficulty band and by a later profession-XP
   *  curve. */
  level: number;
  /** English world name for the spawned ground object ("Copper Vein"). Source
   *  English; the client re-localizes by node type + tier. */
  objectName: string;
}

/** Which material a node type yields in a given zone, and how many units per
 *  rolled rarity. */
export interface GatherMaterialRow {
  itemId: string;
  qtyByRarity: Record<MaterialRarity, number>;
}

/** The rarity ladder a harvested material rolls on: the standard item quality
 *  ladder minus `poor` (a harvested material is never junk-grade). Derived from
 *  `ItemDef` so the two can never drift. */
export type MaterialRarity = Exclude<NonNullable<ItemDef['quality']>, 'poor'>;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** A base gathering tool: which profession it serves and at which tier.
 *
 *  Declared as its OWN table keyed by item id rather than as an `ItemUse`
 *  variant, because `src/sim/types.ts` is out of this wave's file ownership.
 *  It also keeps the mechanics modules free of any `ITEMS` import: every tool
 *  lookup takes the table as a parameter, so the whole subsystem stays a pure
 *  leaf a Vitest can drive directly. */
export interface GatherToolDef {
  itemId: string;
  professionId: GatheringProfessionId;
  /** 1..4. Covers its own tier and every tier below it, never above. */
  tier: number;
}

/** The tool catalogue, keyed by item id. */
export type GatherToolTable = Readonly<Record<string, GatherToolDef>>;

/** The minimum bag shape every tool scan needs. `InvSlot` satisfies it.
 *  `count` is declared (optional, and unread here) purely so a real inventory
 *  slot literal type-checks: owning a tool is carrying it, at any stack size. */
export interface CarriedItem {
  readonly itemId: string;
  readonly count?: number;
}

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

/** One weighted row of a fishing catch table. A `null` item id is the empty
 *  hook (nothing caught), matching the existing `FISHING_TABLES` shape in
 *  `src/sim/content/items.ts`. */
export interface FishingEntry {
  itemId: string | null;
  weight: number;
}

/** The three catch tables for one zone's water, indexed by proficiency band. */
export type FishingBandTables = readonly [
  readonly FishingEntry[],
  readonly FishingEntry[],
  readonly FishingEntry[],
];
