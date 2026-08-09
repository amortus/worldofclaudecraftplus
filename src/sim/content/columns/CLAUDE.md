<!-- src/sim/content/columns/ only. The data-as-code conventions, the i18n flow
     and the vanilla-fidelity rules live in ../CLAUDE.md and the root CLAUDE.md;
     this file covers only what is specific to this pack. -->

# src/sim/content/columns/ - the east/west column ring

The first two zones that sit BESIDE the world strip instead of north of it:
Alderfen Shallows (levels 4-8, hub Reedwatch) and Grimhold Crags (levels 6-10,
hub Coldhearth), both sharing the Eastbrook Vale's z band. Terrain, roads, mobs
and camps came first; this directory now also carries the NPCs, quests, items
and ground objects that make them playable.

## Modules
| File | What it holds |
|---|---|
| `world.ts` | `ALDERFEN_ZONE` / `GRIMHOLD_ZONE`, the column constants, `COLUMN_ROADS`, `COLUMN_MOBS` (10 templates), `COLUMN_CAMPS` (10 fixed-position camps). Formerly `content/columns.ts`. |
| `items.ts` | `COLUMN_ITEMS`: five quest objects plus the two capstone reward sets. |
| `quests.ts` | `COLUMN_NPCS` (6), `COLUMN_QUESTS` (14), `COLUMN_QUEST_ORDER`, `COLUMN_OBJECTS`. |
| `index.ts` | The barrel. `data.ts` and the tests import from here only. |

## Rules this pack holds itself to
- **No new camps.** Every kill objective targets a mob one of the ten shipped
  column camps already spawns. Those camps declare exact `positions`, which is
  what keeps the post-worldgen rng cursor bit-identical to the strip-only world
  (`tests/world_phase2_zones.test.ts` asserts exactly that). Adding a camp draws
  rng and moves every shipped spawn. Collect and interact objectives are served
  by `COLUMN_OBJECTS`, which have explicit positions and draw no rng either.
- **No new art.** Mob `family` values stay inside `FAMILY_KEYS`
  (`src/render/characters/manifest.ts`) and the six NPCs carry no `NPC_KEYS`
  override, so they render on the shipped `npc_villager` rig tinted by `color`.
- **Reuse before you mint.** Vendor stock is the shipped tier-1 and tier-2
  shelves item for item (Trader Wilkes, Provisioner Hale, Smith Haldren) plus the
  gathering tools of the zone's `ZONE_GATHER_TIER` rung, so no buy price is
  invented. Non-capstone quest rewards are shipped class-neutral greens
  (`oiled_boots`, `roughspun_gloves`). Only the two capstone sets are new.
- **Every number cites its anchor.** xp, copper and item budgets are derived
  from a named shipped quest or item and the arithmetic is a comment at the site.
  Do not add a number here without one.
- **Every direction word is derived, not guessed.** The world is +z NORTH and
  +x WEST, so east is -x. `tests/columns_content.test.ts` re-derives each phrase
  from the live coordinates through the HUD's own bearing math.

## Wiring outside this directory
1. `src/sim/data.ts` merges `COLUMN_ITEMS`, `COLUMN_NPCS`, `COLUMN_QUESTS`,
   `COLUMN_QUEST_ORDER` and `COLUMN_OBJECTS` (objects LAST, so no shipped
   object's entity id moves). Done.
2. `src/ui/world_entity_i18n.ts` needs every new NPC id in `NPC_IDS` and every
   new quest id in `QUEST_IDS`; the ten mob ids and the two zone ids are already
   there. A missing id ships that entity untranslated in all 14 locales.
3. `src/ui/i18n.catalog/items.ts` (or the inline `entities.items` block in
   `src/ui/i18n.catalog/index.ts`) needs one English name per new item id.
4. `npm run i18n:gen` and `npm run wiki:content`, then commit the regenerated
   files.
