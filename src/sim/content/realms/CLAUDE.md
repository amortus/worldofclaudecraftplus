<!-- src/sim/content/realms/ only. The data-as-code conventions, the i18n flow
     and the vanilla-fidelity rules live in ../CLAUDE.md and the root CLAUDE.md;
     this file covers only what is specific to this pack. -->

# src/sim/content/realms/ - the ported upstream map

**Eleven of upstream's fourteen zones** (`github.com/levy-street/world-of-claudecraft`,
same MIT licence, same copyright holder, we are a declared fork). The other three
(`eastbrook_vale`, `mirefen_marsh`, `thornpeak_heights`) we already shared with
them by id AND by z band, and they stay in `content/zone1..3.ts`.

| id | biome | z | x | hub | levels |
|---|---|---|---|---|---|
| `farshore_isle` | vale | -180..180 | 180..540 | Gullhaven | 3-7 |
| `willowfen` | fen | 180..700 | -540..-180 | Bridgemere | 19-20 |
| `galecrest` | gale | 180..700 | 180..540 | Wickharbor | 20 |
| `palmreach` | jungle | 700..1260 | -540..-180 | Drifthaven | 20 |
| `evergarden` | garden | 700..1260 | 180..540 | Hedgewick | 20 |
| `veiled_hollow` | dusk | 900..1440 | strip | Eldergleam | 15-20 |
| `nightbloom` | night | 1260..1820 | -540..-180 | Moonrest | 20 |
| `wraithwood` | haunt | 1260..1820 | 180..540 | Gallowmere | 20 |
| `frostveil` | frost | 1440..1960 | strip | Icemantle | 17-20 |
| `amberfall` | amber | 1820..2380 | -540..-180 | Lanternmere | 18-20 |
| `drakelands` | ember | 1820..2420 | 180..540 | Wyrmwatch | 16-20 |

Their ids, their rects, their level bands, their mob/npc/quest/item ids and
their prose. **This is a PORT, so the default is verbatim**: a diff against
upstream should stay readable, because parity is meant to become a periodic
sync rather than a campaign (`docs/design/parity-backlog.md`).

## Modules
| File | What it holds |
|---|---|
| one file per zone (`willowfen.ts`, `veiled_hollow.ts`, `drakelands.ts`, ...) | `*_ZONE`, `*_ROADS`, `*_MOBS`, `*_NPCS`, `*_QUESTS`, `*_QUEST_ORDER`, `*_ITEMS`, `*_CAMPS`, `*_OBJECTS`, `*_PROPS`. The Veiled Hollow's prefix is `HOLLOW_` (upstream calls the module `realm.ts` and exports `REALM_*`, which would collide with this barrel). |
| `index.ts` | The barrel plus the merged `REALM_*` tables. `data.ts` and the tests import from here only. |

**`REALM_ZONE_DEFS` lists the two STRIP zones first, in ascending z** (the
Veiled Hollow 900..1440, then the Frostveil Reach 1440..1960). `data.ts` spreads
this list after the three original bands and `STRIP_ZONES` is an order-preserving
filter, which `world.ts` walks as a south-to-north stack and `zoneAt`'s fallback
walks as a contiguous z tiling. Break that order and the terrain band cascade
and the zone lookup both go wrong. The nine column zones follow; among columns
the order is free.

## What the port DROPS from upstream, and why
Upstream's records carry fields our `types.ts` does not have. They are dropped,
never faked, and never worked around by inventing a substitute system:

| Upstream | Why it is not here |
|---|---|
| `ZoneDef.riftPortalEligible` / `riftTierWeights` | our rift rotation is DERIVED (`riftEligibleZones` in data.ts: any zone whose band reaches the cap). |
| POI `id` | our `ZoneDef.pois` is `{x, z, label}`. |
| `PortalDef` | no equivalent. Every ported zone except the Veiled Hollow is walked into and upstream's list is empty anyway; see the Hollow's own header for the one place this cost something. |
| `MobTemplate.componentTags` | an upstream corpse-harvest surface we do not have. |
| `ZonePropsDef.decorProps` / `greatTrees` / `fences[].kind` / flower meadows | render-side records keyed to upstream asset packs. `src/render/` is out of scope for this port. |
| `CampDef.offStream` | our camps have no stream flag, and every camp here is frozen to exact positions instead (see below). |
| `EscortDef` + `objectives[].type: 'escort'` | there is no escort system here. Four escort quests are NOT ported (`q_pr_the_lost_navigator`, `q_ww_walking_mosley_home`, `q_fv_seeing_wren_home`, `q_fs_bram_come_home`), nor are their escortee mobs. Only the first carried a reward, `saltwalker_sandals`, which moved to `q_pr_canopy_silk`, same id, same stats, same point in the chain. |
| The Evergarden's Great Maze grid | upstream models the labyrinth in their `world.ts` and reads it from the sim, the renderer AND the map. The Maze and Fountain Court survive as POIs and the Bull still holds the Court. |
| The Drakelands' dragonkin brood puzzle, the Last Keep interior, and `reins_drakemaw_raptor` | a sim module, an instance and a mount catalog respectively, none of them content rows. The broodguards, broodlords and the matriarch they guarded are all here; the Keep is a POI. |
| Upstream's coast/bay shapers | their `world.ts` fills the map's ragged edges with ocean; we have no coast shaper, so `data.ts` bounds those edges with the containment rim instead (`worldHalfWidthAt` per side, `worldNorthEdgeAt` per column). |

`MobFamily` is remapped onto our 11 members (upstream `mudfin` -> `murloc`,
`burrower` -> `kobold` for the fey/gnomes and `humanoid` for the bandits,
`reptile` -> `beast`). Every value used here already has a rig in
`src/render/characters/`, so the pack adds no new art.

## Rules this pack holds itself to
- **Camp positions are FROZEN, and that is load-bearing.** Upstream authored
  them as scatter camps (no `positions`), which draw world-gen rng and therefore
  move the post-worldgen rng cursor. That cursor is where every seeded fixture
  in the suite starts, and letting it move broke seven of them (a masterwork
  proc, a lockpick board, a disarm refresh, a skin roll, a druid form opener, a
  world-boss loot cap and a delve Bountiful roll) without a single one of them
  being about the map. The `positions` here ARE upstream's own scatter, captured
  once at the live world seed (20061) and frozen, so world generation draws
  nothing. **Measured A/B at seeds 20061, 1337 and 42: the post-worldgen cursor
  with all 117 camps merged is bit-identical to a world where `REALM_CAMPS` is
  not merged at all.** Ground objects are tail-appended in `data.ts` for the
  related entity-id reason.
  - A frozen camp skips `findSafePos` and spawns at `template.maxLevel`, so a
    new position must be checked against the waterline by hand.
- **Every direction word is derived, not translated.** Upstream writes +x as
  EAST; this world is +z NORTH and +x WEST, so east is -x. Every compass word in
  player copy was recomputed from the live coordinates through the HUD's own
  bearing math, and `tests/realms_compass.test.ts` re-derives all of them.
  Upstream is regularly wrong on its own axes too, so always derive from
  coordinates and never from their word.
- **No new biome.** All eleven biomes already exist with a full row in every
  exhaustive `Record<BiomeId, ...>` table; `BiomeId` grew to 14 members before
  this pack landed, which is the only reason a verbatim port was possible.
- **Reuse before you mint.** Loot rows reference shipped item ids
  (`linen_scrap`, `spider_leg`, `bone_fragments`, `tangled_weed`,
  `bandit_bandana`, `mudfin_scale`, `chipped_tusk`); only the quest items and
  quest rewards are new.

## Wiring outside this directory
1. `src/sim/data.ts` merges `REALM_ZONE_DEFS`, `REALM_ITEMS`, `REALM_MOBS`,
   `REALM_NPCS`, `REALM_QUESTS`, `REALM_QUEST_ORDER`, `REALM_CAMPS`,
   `REALM_OBJECTS`, `REALM_ROADS` and `REALM_PROP_SETS`. Done.
2. `src/sim/content/ground_pickup_lines.ts` needs one deny/enough pair per new
   ground-object item id (`tests/sim.test.ts` asserts the two sets match). Done.
3. `src/ui/world_entity_i18n.ts` needs every new zone, mob, npc and quest id in
   its lists, and `src/ui/i18n.catalog/index.ts` one English name per new item
   id. Done. A missing id ships that entity untranslated in all 14 locales.
4. `src/sim/content/professions/professions.ts` needs a `ZONE_GATHER_TIER` rung
   per new zone id. Done.
5. `npm run wiki:content` regenerates the Guide, and `npm run i18n:gen` the
   resolved i18n tables.
