// The Book of Deeds catalogue: data-as-code, one DeedDef per deed, merged into
// the flat table the evaluator reads. No engine logic lives here.
//
// DEED_ORDER IS APPEND-ONLY. It is the grant order, and deed ids are persisted
// in character saves, so a reorder changes replay output and a removal orphans
// a save. Append new deeds at the END of the last category array; never reorder
// or delete an existing entry.

import type { DeedCatalog, DeedDef } from '../../deeds/types';
import { COMBAT_DEEDS } from './combat';
import { DUNGEON_DEEDS } from './dungeons';
import { EXPLORATION_DEEDS } from './exploration';
import { PROGRESSION_DEEDS } from './progression';
import { RAID_DEEDS } from './raids';

export { COMBAT_DEEDS } from './combat';
export { DUNGEON_DEEDS } from './dungeons';
export { EXPLORATION_DEEDS } from './exploration';
export { PROGRESSION_DEEDS } from './progression';
export { CLAUDEHOLME_BOSSES, RAID_DEEDS } from './raids';

const ALL: readonly DeedDef[] = [
  ...PROGRESSION_DEEDS,
  ...COMBAT_DEEDS,
  ...EXPLORATION_DEEDS,
  ...DUNGEON_DEEDS,
  ...RAID_DEEDS,
];

/** Flat id -> definition table. */
export const DEEDS: Readonly<Record<string, DeedDef>> = Object.fromEntries(
  ALL.map((def) => [def.id, def]),
);

/** Append-only id list. Grant order, and the only iteration order the evaluator uses. */
export const DEED_ORDER: readonly string[] = ALL.map((def) => def.id);

/** The catalogue the evaluator takes. Frozen so a caller cannot mutate content at runtime. */
export const DEED_CATALOG: DeedCatalog = Object.freeze({ deeds: DEEDS, order: DEED_ORDER });
