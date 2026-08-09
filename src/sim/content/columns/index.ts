// Public surface of the column-zone content pack. `src/sim/data.ts` and the
// tests import from here, never from the individual modules, so the pack can be
// reorganised without touching the merge layer.
//
// See ./CLAUDE.md for what is in the pack.

// World layout: the two zone rects, their roads, mob roster and fixed camps.
// Re-exported wholesale because this module used to BE `content/columns.ts` and
// both of its consumers (data.ts, tests/world_phase2_zones.test.ts) already
// import it by this path.
export * from './world';

export { COLUMN_ITEMS } from './items';
export { COLUMN_NPCS, COLUMN_OBJECTS, COLUMN_QUEST_ORDER, COLUMN_QUESTS } from './quests';
