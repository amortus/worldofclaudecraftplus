// Public surface of the expansion content pack. `src/sim/data.ts` should import
// from here, never from the individual modules, so the pack can be reorganised
// without touching the merge layer.
//
// See ./CLAUDE.md for what is in the pack and the exact wiring it still needs.
export { CINDERFORGE_DUNGEON_DEFS, CINDERFORGE_LAYOUT, CINDERFORGE_MOBS } from './cinderforge';
export { EXPANSION_ITEMS } from './items';
export {
  EXPANSION_NPCS,
  EXPANSION_OBJECTS,
  EXPANSION_QUEST_ORDER,
  EXPANSION_QUESTS,
} from './quests';
