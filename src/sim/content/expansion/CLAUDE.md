<!-- src/sim/content/expansion/ only. The data-as-code conventions, the i18n
     flow and the vanilla-fidelity rules live in ../CLAUDE.md and the root
     CLAUDE.md; this file covers only what is specific to this pack. -->

# src/sim/content/expansion/ — the expansion content pack

Declarative content added on top of the four shipped zones: one five-player
dungeon at the level cap and four new quest lines, one per zone. Nothing here
is engine logic, and nothing here needs new art.

## Modules
| File | What it holds |
|---|---|
| `cinderforge.ts` | The Cinderforge: `CINDERFORGE_MOBS` (4 trash + 1 summoned add + 3 bosses), the spawn list, `CINDERFORGE_DUNGEON_DEFS`, and the proposed `CINDERFORGE_LAYOUT`. |
| `items.ts` | `EXPANSION_ITEMS`: the Cinderforge loot table plus every quest object. |
| `quests.ts` | `EXPANSION_NPCS` (4 givers), `EXPANSION_QUESTS` (18), `EXPANSION_QUEST_ORDER`, `EXPANSION_OBJECTS`. |
| `index.ts` | The barrel. `data.ts` imports from here only. |

## Rules this pack holds itself to
- **No new camps.** Every kill objective targets a mob a shipped camp already
  spawns. Camps draw world-gen RNG in array order, so adding one shifts every
  later camp's placement and breaks fixed-seed fixtures. Collect and interact
  objectives are served by `EXPANSION_OBJECTS`, which have explicit positions
  and draw no RNG.
- **No new art.** Mob `family` values are limited to ones with a shipped rig in
  `FAMILY_KEYS` (`src/render/characters/manifest.ts`); NPCs fall back to
  `npc_villager`. `MOB_KEYS`/`NPC_KEYS` overrides are optional polish, never a
  requirement.
- **No new interior geometry.** The Cinderforge ships on `interior: 'sanctum'`,
  which already has both a render builder and a collider set. `CINDERFORGE_LAYOUT`
  is a proposal for a later pass and deliberately keeps the sanctum shell
  (`zMin -19`, `zMax 158`, waists at z 67 and z 115, dais at z 146) so no spawn
  coordinate has to move if it is ever adopted.
- **Every number cites its anchor.** Stat blocks, xp, copper, reputation and item
  budgets are all derived from a named shipped record, and the citation is a
  comment at the site. Do not add a number here without one.

## Wiring this pack still needs (not done inside this directory)
1. `src/sim/data.ts`: import from `./content/expansion` and merge
   `CINDERFORGE_MOBS` into `MOBS`, `EXPANSION_ITEMS` into `mergeItems`,
   `EXPANSION_NPCS` into `NPCS`, `EXPANSION_QUESTS` into `QUESTS`,
   `EXPANSION_QUEST_ORDER` into `QUEST_ORDER`, `EXPANSION_OBJECTS` **last** into
   `GROUND_OBJECTS`, and `CINDERFORGE_DUNGEON_DEFS` into `DUNGEONS`.
2. `src/sim/data.ts`: the dungeon takes `index: 8`, which lands at
   x = 900 + 8*600 = 5700. `dungeonAt` rejects anything at or past
   `ARENA_X_MIN` (5400), so the arena and delve bands must move out by 600
   (`ARENA_X` 5400 to 6000, `DELVE_X_MIN` 6000 to 6600) together with the
   `expect(DELVE_X_MIN).toBe(6000)` pin in `tests/delves.test.ts`.
3. `src/ui/world_entity_i18n.ts`: add every new mob, NPC, quest and the dungeon
   id to the matching id list. A missing id ships that entity untranslated in
   all 14 locales.
4. `src/ui/i18n.catalog/index.ts`: add one `id: { name: '...' }` line per new
   item to the English `entities.items` block.
5. `npm run wiki:content`, so the Guide picks the dungeon and its bestiary up.
