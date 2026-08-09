# Upstream parity backlog

What is left to port from `github.com/levy-street/world-of-claudecraft`, why each item is
shaped the way it is, and the traps already mapped. Written so the next session can start
work without re-doing the investigation.

Sizes are measured source bytes in upstream's tree (excluding their tests), not estimates.

## Done

| Wave | What | Shipped as |
|---|---|---|
| 1 | Per-item instance identity; gathering (mining, logging, herbalism, fishing + bite minigame); `/unstuck`; 54 deeds; Skills and Deeds panels | AAB 1.8.0 |
| 2 | Crafting (4 crafts, 32 recipes) and enchanting (35 enchants, replace, disenchant); crafting and enchanting windows | AAB 1.9.0 |
| 3 | Procedural rifts: generator, content, instance wiring, portals, loot, floor tracker | AAB 1.10.0 |
| 4 | Dungeon finder (queue, ready check); mounts built from scratch; traversal physics core | AAB 1.11.0 |
| 5 | The Cinderforge five-man, 18 quests, 4 questgivers | AAB 1.11.0 |

Also landed outside the waves: the build no longer ships every media asset twice
(72.7 MiB of exact duplication), which took the signed AAB from 199.78 to 144.80 MiB.

## Wave 4 (SHIPPED)

### Dungeon finder / LFG (SHIPPED)
Built as a pure matchmaking core in `src/sim/lfg/`. All four obstacles were resolved
rather than worked around: instance slots are reserved per open proposal, group formation
returns no coordinates so the host reuses its one teleport path, the runtime id is
`dungeonFinder` because `lfg` is a chat channel, and the level band is DERIVED from each
dungeon's spawn table rather than authored on `DungeonDef`. Composition-preferred, not
strict: only 3 of 9 classes tank and 4 heal, so a strict queue never pops here.

### Mounts (SHIPPED, built from scratch)
**Corrected 2026-08-09: this is a BUILD FROM SCRATCH, not a refactor.** An earlier note
claimed "we already have mounts, 55 files reference them"; that was a false positive from
grepping the bare word `mount`. Every hit is DOM mounting (`mountRiftHud`, `unmount`, the
editor's `mount` element) or the English verb ("torches mount on these pillars"). There is
no mount entity, no speed buff, no `reins` item, and no summon or dismiss path anywhere in
`src/sim/`. Verify with:
`grep -rIn "\bmount\b" src/ --include=*.ts | grep -viE "mountRift|unmount|mountCrafting"`

So the work is the whole system, not upstream's later refactor of it: a summon with a cast,
a movement speed aura, dismount on damage and on entering combat, and the item that grants
it. Upstream's shape is still the right target (reins as a bag item usable from the action
bar, no separate mount picker and no persisted "selected mount"), because it means the
feature needs no new UI surface of its own.

### Traversal physics (CORE BUILT, DELIBERATELY NOT WIRED)
`src/sim/traversal/` is complete and tested; nothing calls it yet. Wiring it into live
movement is the single riskiest change in the program, because movement resolves in all
three hosts and feeds the online client's prediction: a mismatch shows up as rubber-banding
for every player, not as a bug in an opt-in feature. Every other wave was additive, so a
defect only reached players who used the new thing.

The most valuable finding is already banked: our jump apex is **0.98, not the analytic
1.125**, because semi-implicit Euler at 20 Hz undershoots by 13 percent. Deriving the bands
from the closed form would have shipped a real 0.145 yard band of obstacles too high to
jump and refused on the grounds that you could have jumped them. The invariant test sweeps
every height at 0.001 yard with three negative controls, including that exact bug.

What the wiring step must decide, from the module's own report:
- `Collider` has no movement top today (`cameraTopY` is camera-only). The core takes a
  caller-supplied `ColliderTopFn`, so the wiring must decide once what each collider class
  means vertically. **Adding `moveTopY` to `Collider` is the one unavoidable edit to
  `colliders.ts`**; everything else is additive.
- Prop tops are climbable to the core but impassable to `isBlocked`/`findPlayerPath`, so
  mobs would path around ground players can stand on. Intended asymmetry or not, bound it.
- Collider ORDER is part of the result (TOI ties go to the earlier entry), so the broadphase
  must hand all three hosts the same order. Never sort inside a solve.
- `MAX_STEP_HEIGHT` should replace the bare `0.4` in sim.ts's `maxStepDown` so the two
  cannot drift; `tests/traversal_constants.test.ts` currently parses sim.ts to catch it.
- Step-up must never apply to the heightfield: it would raise the effective climb limit to
  2.64 against a 1.5 slope cap. A source-scan guard fails if a ground sampler is added.

## Wave 5 (SHIPPED, and not what the heading used to say)

**Upstream's eleven realms do not port, and this is the evidence.** Their level cap is 20,
same as ours, so the cap was never the blocker; the TOPOLOGY is. Their world is a 2D grid
(`ZoneDef` carries `xMin/xMax`, `eastPassZ/westPassZ`, `southPassX`, `portals`; `data.ts`
splits `STRIP_ZONES` from `COLUMN_ZONES`), and the Willowfen alone spans `x -540..-180`
while our entire world is `x -180..180`. Their `BiomeId` has 17 members to our 4, each with
its own terrain tables and dedicated render modules driving commissioned art we cannot
take (`render/realm_flora.ts` alone is 46 KB). Wildheart Basin is an open-field dungeon on
its own interior key with a `bossExitPortal` field we do not have. A literal port means
rewriting `types.ts`, `world.ts`, `data.ts`, `colliders.ts` and most of `src/render/` to
become their world. That is trap 3.

What shipped instead is new content shaped for our world: **the Cinderforge**, a five-man
at the cap with three bosses, plus 18 quests and 4 questgivers across the existing zones.
Every number is anchored on a named piece of shipped content, cited at the row, and the
tests re-derive those bands from the live tables rather than hardcoding them. It adds no
camps, so world generation draws no new rng and every existing spawn keeps its position.

**The instance band moved to fit it.** Dungeon index 8 lands at x 5700 and `dungeonAt`
returned null past the arena at 5400, so the arena moved to 6000 and the delves to 6600.
A stale saved position from the old bands now ejects to the character's own zone hub
rather than to a door in the level-20 zone.

## The map question: moving toward their 2D world

Asked 2026-08-09: make our map and gameplay resemble theirs, on our base, focused on mobile.
Measured rather than estimated, so the decision starts from numbers.

**Their world, current and exact** (unchanged since our previous look; `ZoneDef`'s field
list at `main` is byte-identical to `v0.32.4`): **14 zones in 3 columns** of 360 yd each
(west -540..-180, the original strip -180..180, east 180..540). Bounding box 1080 x 2600 =
2.81M sq yd against our 360 x 1440 = 518k. **5.4x our footprint.** Zone rects are
non-rectangular overall, with holes. Ours and theirs share the first three zones by id AND
by z band exactly (`eastbrook_vale` -180..180, `mirefen_marsh` 180..540, `thornpeak_heights`
540..900); we diverge at z 900, where they put `veiled_hollow` (dusk) and we put
`ashen_wastes` (blight).

**The number that actually decides it, and it is a mobile number.** `src/render/terrain.ts`
is already 2D-chunked (`CHUNK_SIZE = 60`, LOD banded by distance, 2x2 far super-chunks),
which is the good news. But it **builds the entire world at boot with no residency
eviction**. Today that is 6 x 24 = **144 chunks**. Their footprint would be 18 x 44 =
**792 chunks: 5.5x resident geometry and 5.5x boot cost on a Samsung A14.**

That is a residency problem we already have; our world is merely small enough to hide it.
**Fix terrain residency BEFORE any map expansion**, or the new zones kill the A14 before a
player ever sees them.

**What the change actually costs, split by tractability:**
- **Topology: CHEAP and additive.** Their `zoneAt(x, z)` / `zoneBiomeAt(x, z)` versus our
  `zoneAt(z)` / `zoneBiomeAt(z)` is the entire 1D-vs-2D story in one signature. Omitting
  `xMin/xMax` on an existing zone keeps behaviour byte-identical, which is exactly how
  upstream shipped it. Cost here: **48 `zoneAt(` call sites across 21 files and 20
  `zoneBiomeAt(`**, plus `eastPassZ`/`westPassZ`/`southPassX`/`sealedSouthBorder` and a
  `PortalDef`. Wide but shallow.
- **Biomes: EXPENSIVE, and it is art, not code.** Theirs has **17** members to our 4. We
  carry **22 exhaustive `Record<BiomeId, ...>` maps across 6 files** (`render/foliage.ts`,
  `motes.ts`, `renderer.ts`, `sky.ts`, `terrain.ts`, `sim/world.ts`) plus 17 literal
  biome-string sites in 10 more, so 4 -> 17 means roughly **286 new palette and parameter
  rows before a single asset exists**. And their `src/sim/world.ts` is **252 KB with 56
  exported shaper functions** against our **9.9 KB with 6**. That gap, not the zone count,
  is the honest measure.
- **Instance plane collision.** A 3-column world reaches x +-540 but our instance threshold
  is `x > 600`, so widening the overworld forces moving the whole instance band again, with
  the saved-position migration that implies (see what the arena move to 6000 already cost).
- Their instance plane starts at `INSTANCE_X_BASE = 99_400`; ours starts at 600.

**Recommended order if this is pursued:** (1) terrain residency and eviction, measured on a
real A14; (2) `xMin/xMax` + `zoneAt(x, z)` as a pure no-op refactor with existing zones
unchanged; (3) ONE new column zone reusing an existing biome, to prove the pipeline;
(4) only then consider new biomes, and only as many as there is art for.

## Deliberately excluded, do not "fix"

- **Claudium storefront and $WOC crypto.** Removed on purpose.
- **The Electron desktop client.** We are web plus Android.
- **KTX2 texture compression.** Measured against upstream's real files, it would ADD
  about 24 MiB, because our art is flat-colour 512px atlases that webp already stores at
  roughly 0.14 bits per pixel while ETC1S has a hard floor near 0.5 bytes per texel. Our
  character GLBs are already smaller than upstream's post-KTX2 results.
- **Their chunk streaming rework.** Its entire purpose is fixing a fog wall caused by a
  residency clamp we never had, and taking it would silently revert our own calibrated
  idle timeout and widen the drawn area about 1.7x on phones.
- **Talents 2.0, Hit Rating, Honor/Warfare, ilvl 28-31 itemization.** Their progression;
  our cap is 20 with our own Ashen Wastes and Claudexxaramas endgame.

## Traps that have already cost time

1. **Sim-to-UI event names are compared as STRINGS.** A rename on either side is invisible
   to `tsc` and silently kills the feedback. Wave 2 shipped with four of seven crafting
   events dead because two parallel agents each picked their own names and each side's
   tests passed by being self-consistent. `tests/crafting_event_contract.test.ts` is the
   source-scanning guard; copy that pattern for every new sim-to-UI event set, and pin the
   contract before parallel work starts.
2. **Content can be unreachable and still pass every test.** Wave 1 defined 15 gathering
   tools that no vendor sold, and gathering hard-requires a tool, so all 42 nodes would
   have been permanent scenery. `tests/gather_tools_obtainable.test.ts` guards it now.
3. **Upstream's premise is often false in our tree.** Their sim is modularized behind a
   `SimContext`; ours is inline in `sim.ts`, so their file layout never maps. Always verify
   a bug exists here before porting its fix, and never port over our own divergences (the
   client perf work, the quest tracker, reputation, Claudeholme, the Android wrapper).
4. **A corrected player-visible string is a two-file change.** If upstream fixes English
   only, check `src/ui/i18n.locales/*.ts`: a stale translation of the old wrong text is a
   live bug for us, because pt_BR is our default locale.
5. **Parity is a moving target.** Upstream shipped v0.29 through v0.32.4 in about nine
   days. The goal is a gap small enough that syncing is a short periodic task rather than
   a campaign.
