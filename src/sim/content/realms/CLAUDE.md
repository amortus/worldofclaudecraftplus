<!-- src/sim/content/realms/ only. The data-as-code conventions, the i18n flow
     and the vanilla-fidelity rules live in ../CLAUDE.md and the root CLAUDE.md;
     this file covers only what is specific to this pack. -->

# src/sim/content/realms/ - the ported upstream realm ring

Four zones taken from upstream (`github.com/levy-street/world-of-claudecraft`,
same MIT licence, same copyright holder, we are a declared fork), filling the
two grid columns around the world we already had:

| id | biome | z | x | hub | levels |
|---|---|---|---|---|---|
| `willowfen` | fen | 180..700 | -540..-180 | Bridgemere | 19-20 |
| `galecrest` | gale | 180..700 | 180..540 | Wickharbor | 20 |
| `palmreach` | jungle | 700..1260 | -540..-180 | Drifthaven | 20 |
| `evergarden` | garden | 700..1260 | 180..540 | Hedgewick | 20 |

Their ids, their rects, their level bands, their mob/npc/quest/item ids and
their prose. **This is a PORT, so the default is verbatim**: a diff against
upstream should stay readable, because parity is meant to become a periodic
sync rather than a campaign (`docs/design/parity-backlog.md`).

## Modules
| File | What it holds |
|---|---|
| `willowfen.ts` / `galecrest.ts` / `palmreach.ts` / `evergarden.ts` | one zone each: `*_ZONE`, `*_ROADS`, `*_MOBS`, `*_NPCS`, `*_QUESTS`, `*_QUEST_ORDER`, `*_ITEMS`, `*_CAMPS`, `*_OBJECTS`, `*_PROPS`. |
| `index.ts` | The barrel plus the merged `REALM_*` tables. `data.ts` and the tests import from here only. |

## What the port DROPS from upstream, and why
Upstream's records carry fields our `types.ts` does not have. They are dropped,
never faked, and never worked around by inventing a substitute system:

| Upstream | Why it is not here |
|---|---|
| `ZoneDef.riftPortalEligible` / `riftTierWeights` | our rift rotation is DERIVED (`riftEligibleZones` in data.ts: any zone whose band reaches the cap). All four qualify anyway. |
| POI `id` | our `ZoneDef.pois` is `{x, z, label}`. |
| `PortalDef` | no equivalent, and all four lists are empty upstream: every one of these zones is walked into. |
| `MobTemplate.componentTags` | an upstream corpse-harvest surface we do not have. |
| `ZonePropsDef.decorProps` / `greatTrees` / `fences[].kind` / flower meadows | render-side records keyed to upstream asset packs. `src/render/` is out of scope for this port. |
| `CampDef.offStream` | our camps have no stream flag, and every camp here is frozen to exact positions instead (see below), so nothing draws from any stream. |
| `EscortDef` + `objectives[].type: 'escort'` | there is no escort system here, so `q_pr_the_lost_navigator` and its escortee `castaway_navigator` are NOT ported. Its reward `saltwalker_sandals` moved to `q_pr_canopy_silk`, same id, same stats, same point in the chain. |
| The Evergarden's Great Maze grid | upstream models the labyrinth in their `world.ts` and reads it from the sim, the renderer AND the map. The Maze and Fountain Court survive as POIs and the Bull still holds the Court. |

`MobFamily` is remapped onto our 11 members (upstream `mudfin` -> `murloc`,
`burrower` -> `kobold` for the fey/gnomes and `humanoid` for the bandits). Every
value used here already has a rig in `src/render/characters/`, so the pack adds
no new art.

## Rules this pack holds itself to
- **Camp positions are FROZEN, and that is load-bearing.** Upstream authored
  them as scatter camps (no `positions`), which draw world-gen rng and therefore
  move the post-worldgen rng cursor. That cursor is where every seeded fixture
  in the suite starts, and letting it move broke seven of them (a masterwork
  proc, a lockpick board, a disarm refresh, a skin roll, a druid form opener, a
  world-boss loot cap and a delve Bountiful roll) without a single one of them
  being about the map. The `positions` here ARE upstream's own scatter, captured
  once at the live world seed (20061) and frozen, so world generation draws
  nothing: every shipped spawn and the cursor itself stay bit-identical. This is
  the same rule `content/columns/` follows, for the same reason. Ground objects
  are tail-appended in `data.ts` for the related entity-id reason.
  - A frozen camp skips `findSafePos` and spawns at `template.maxLevel`, so a
    new position must be checked against the waterline by hand. All 43 were
    verified dry at seeds 20061, 1337 and 42.
- **Every direction word is derived, not translated.** Upstream writes +x as
  EAST; this world is +z NORTH and +x WEST, so east is -x. Every compass word in
  player copy was recomputed from the live coordinates through the HUD's own
  bearing math, and `tests/realms_compass.test.ts` re-derives all of them. Three
  of upstream's own lines were also wrong on their own axes (the Galecrest
  beacon, the Evergarden Lily Basin and the fourth Quiet Sister); those are
  corrected here, with the coordinates cited at the site.
- **No new biome.** All four biomes (`fen`, `gale`, `jungle`, `garden`) already
  exist with a full row in every exhaustive `Record<BiomeId, ...>` table.
- **Reuse before you mint.** Loot rows reference shipped item ids
  (`linen_scrap`, `spider_leg`, `bone_fragments`, `tangled_weed`,
  `bandit_bandana`); only the quest items and quest rewards are new.

## Wiring outside this directory
1. `src/sim/data.ts` merges `REALM_ZONE_DEFS`, `REALM_ITEMS`, `REALM_MOBS`,
   `REALM_NPCS`, `REALM_QUESTS`, `REALM_QUEST_ORDER`, `REALM_CAMPS`,
   `REALM_OBJECTS`, `REALM_ROADS` and `REALM_PROP_SETS`. Done.
2. `src/sim/content/ground_pickup_lines.ts` needs one deny/enough pair per new
   ground-object item id (`tests/sim.test.ts` asserts the two sets match). Done.
3. `src/ui/world_entity_i18n.ts` needs every new zone, mob, npc and quest id in
   its lists, and `src/ui/i18n.catalog/` one English name per new item id. NOT
   done here: that tree is outside this port's ownership. A missing id ships
   that entity untranslated in all 14 locales.
4. `npm run wiki:content` regenerates the Guide, and `npm run i18n:gen` the
   resolved i18n tables.
