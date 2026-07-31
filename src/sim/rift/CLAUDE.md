<!-- Area-scoped: src/sim/rift/ only. Root + src/ + src/sim/ CLAUDE.md are already
     loaded (determinism, the Rng rule, dependency direction, the sim-emit i18n
     flow). This file covers only what is specific to the rift generator. -->

# src/sim/rift, the procedural Rift generator

Rifts are seed-driven, infinitely varied instanced dungeons: the answer to a
fork whose authored content is four zones, a handful of five-mans and one raid.
Everything about a rift (room geometry, theme, spawns, the floor's one headline
mechanic, the boss) is regenerated from a compact `RiftDescriptor`, so nothing
but that descriptor ever crosses the wire.

This directory is the PURE GENERATOR and nothing else. There is no run
lifecycle, no portal scheduler, no loot, no HUD here, by design (see
"Deliberately not here").

## YOU MUST: the generator uses a LOCAL Rng, never the world's

Every generation entry point constructs its own `Rng` from the descriptor
(`mixSeed(seed, salt)` in `rift_gen.ts`). It must NEVER take, read, or borrow
`Sim`'s `this.rng`, and must never accept one as a parameter.

This is not style. The sim's shared `Rng` is a single ordered stream; every draw
advances it for everything downstream. A rift generated mid-session from that
stream would shift the outcome of every later roll in the world (loot, AI, spawn
jitter), so a player who generated a rift and a player who did not would diverge
from that tick onward and never re-converge. A rift is CONTENT ADDRESSED BY ITS
SEED, not an event in the world's timeline.

Threading `sim.rng` through here looks like a harmless simplification and is the
most expensive mistake available in this directory. `tests/rift_gen.test.ts`
pins the observable half of it (two independent builds are identical, and
generating floors in reverse order gives the same result as forwards), but the
rule itself is the thing to keep.

Corollaries that follow from the same rule:
- No `Math.random`, `Date.now`, `performance.now` (repo-wide, enforced by
  `tests/architecture.test.ts`, which scans every file under `src/sim/`).
- Each derived quantity gets its own salt, so adding a draw to one never shifts
  another. Salts avoid the constants the delve generator already uses in
  `sim.ts` (`0x5a11c0de`, `0x600dc0ff`, `7919`).
- **Draw order inside `buildRiftFloor` is a frozen contract.** All the planners
  share one floor `Rng`. Reordering, adding, or removing a call regenerates
  every existing seed into a different dungeon. If you must add a draw, add it
  at the END of the sequence.

## The room shape, and why it is what it is

The single hardest integration constraint in this subsystem: our interiors are
plain-number `DungeonLayout` records (`sim/dungeon_layout.ts`), and that record
is the ONE source for both the render modules and the collider set
(`layoutColliders`). A generated floor that cannot be expressed as a
`DungeonLayout` is a room that is either invisible or unwalkable.

So a generated floor IS a `DungeonLayout`, using only fields the record already
carries:

| Concept | Field | Becomes |
|---|---|---|
| Room box | `zMin`/`zMax`/`wallX`/`endWallHw`/`floorHalfX` | side + end wall OBBs |
| Silhouette (rotunda, taper, apse, hourglass, chambers, cavern, corridor) | `stubs` | wall-hugging OBB bands reaching in to the profile half-width at that depth |
| Serpentine weave | `stubs` (baffle fins) | short one-sided OBBs |
| Obstacles | `pillars` / `tombs` / `clutter` | circles + wall-side OBBs + small circles |
| Boss platform | `dais` | walkable, deliberately NO collider |
| Entrance | `doorZ` | archway prop |

Upstream carves curved rooms with a star-shaped `shellPolygon` field they added
to their `DungeonLayout`. We deliberately do NOT: a stepped band approximation
in `stubs` reads the same in play, needs no new geometry primitive, and requires
zero change to `dungeon_layout.ts`, `layoutColliders`, `colliders.ts`, or the
renderer. Room dimensions are anchored on our own interiors (every one starts at
`zMin -19`; they run 110 to 177 deep at `|x| = 23`), so the existing KayKit wall
modules and the entrance-porch chase-cam behaviour work unchanged, and a floor
still fits one instance slot (`data.ts instanceOrigin` stacks slots 500 apart in
z inside a 600-wide x band).

**The playability invariant.** The central spine `|x| <= AISLE_HALF` is free of
every emitted obstacle at every depth, by construction, so the entry-to-boss path
always exists. `tests/rift_gen.test.ts` does not trust that: it flood fills the
room on a one-yard grid using the same clearance test the runtime resolver uses
and asserts the dais, every spawn and every object are reachable from the entry.
It also carries a NEGATIVE CONTROL (a sealed room must fail the fill), because a
reachability test that cannot fail proves nothing.

## Exactly one headline mechanic per floor

A floor carries a single `RiftMechanicKind` enum value; there is no second field
to put a second mechanic in. Mutual exclusion is therefore structural rather than
a rule the roll order happens to respect. `mechanics.ts` owns the roll and the
placement; `iceZone` is non-null exactly when the kind is `ice_slide`, `gate`
exactly when it is `switch_gate`. Boss floors are always `none`: the boss IS the
floor's mechanic.

Kinds: `rune_pylons`, `ice_slide`, `boulder_push`, `sequence`, `switch_gate`,
`none`. Each falls back to `none` if the room is too short to place it fairly,
so a mechanic never ships with nothing to solve.

## Files

| File | What it is |
|---|---|
| `types.ts` | `RiftDescriptor`, `RiftFloorPlan`, `RiftPlan`, spawn/object/mechanic shapes. Types only. |
| `layout_gen.ts` | Room geometry: profiles, silhouette bands, obstacles, the `isClear`/`toClear` clearance primitives. |
| `mechanics.ts` | The one headline mechanic and its interactables. |
| `spawn_gen.ts` | Trash packs + the boss, with the arrival-clearance guarantee. |
| `ranks.ts` | The C/B/A/S ladder: level ramp, stat transform, mechanic budget. Pure leaf, no `data.ts` import. |
| `rift_gen.ts` | Public generator: `generateRiftPlan`, `buildRiftFloor`, `generateRiftFloor`, `riftFloorColliders`. |
| `index.ts` | The barrel. Import from here, not from the modules. |

Content lives in `src/sim/content/rift/` (eight themes, 16 trash elites, 8
bosses, 2 summoned adds), authored on the C-rank line so every C multiplier is
exactly 1.0.

`buildRiftFloor` is the uncached build; `generateRiftFloor` memoises it. Tests
that assert determinism MUST use `buildRiftFloor`, or they compare a cached
object with itself and pass whether the generator is deterministic or not.

## Adapted for OUR level-20 world

- Mob levels cap at **22**, the highest level any hand-authored mob in this fork
  spawns at (The Ash-Marshal). Upstream nudges S to 23; we do not, because
  inventing a level nothing else uses would change level-difference math for one
  content type only. C ramps 20 -> 22; B/A/S sit at 22 and take their difficulty
  from the stat transform.
- Rank targets are solved against OUR content, not upstream's multipliers: C is
  Korzul's own line (~3,100 boss hp), S is ~28,600, roughly 56% of the
  ten-player Nythraxis. An S rift is the hardest FIVE-player content in the fork
  and must stay clearly below the raid. `tests/rift_content.test.ts` pins both
  ends against the real templates.
- Damage climbs far more slowly than health at every rank on purpose: C to S
  should be a healer-mana and execution race over a long fight, not a swing that
  deletes a tank.

## i18n

`src/sim/` is language-agnostic, so nothing here emits prose. Floor names, object
labels, theme labels and rift proper nouns are **stable ids** (`rift.floor.*`,
`rift.object.*`, `rift.theme.*`, `rift.noun.*`, `rift.suffix.*`) the client
resolves through `t()`. The one exception is `MobTemplate.name` in
`content/rift/mobs.ts`, which follows the existing content convention: English
here, localized at the client via `src/ui/world_entity_i18n.ts` id lists.

## Deliberately not here (later waves)

The generator is the foundation; these need files outside this directory and are
NOT stubbed here:
- **Instance wiring.** `DungeonDef.interior` is a closed string union in
  `sim/types.ts` and `INTERIOR_COLLIDERS` in `sim/colliders.ts` is a STATIC
  record, so a generated floor cannot be looked up through it. Wiring rifts to
  the instance plane needs a dynamic interior resolver in `colliders.ts` plus a
  new x band in `data.ts` (dungeon indices 0-7 are taken and index 8 would
  collide with `ARENA_X = 5400`).
- Overworld portals, the run lifecycle (descend/clear/seal), loot, first-clear
  racing, the HUD, and the renderer's rift dressing.
