<!-- src/sim/traversal: the traversal core. The one-sim-three-hosts
     architecture and the repo-wide determinism rules live in the root and
     src/sim CLAUDE.md; this file is the local contract. -->

# src/sim/traversal: swept collision and the traversal ladder

The pure geometry behind player movement: continuous collision, multi-pass
sliding, depenetration, step-up, and the ladder that decides whether an obstacle
is strided over, vaulted, climbed, or a wall.

Nothing here is wired into `Sim` yet. This directory is the core; the movement
kernel that calls it is a separate change.

## The determinism contract, read this before editing anything

Movement resolves in the shared sim that runs in THREE hosts (the offline
browser world, the authoritative server, the headless RL env) and feeds the
online client's prediction and extrapolation. If this math resolves even
slightly differently between hosts, players desync and rubber-band. "Close
enough" is not a category here.

1. **Everything is a pure function.** Explicit inputs, returned results. No
   reach into `Sim`, no globals, no module-level mutable behavior state. Module
   scratch objects exist in `sweep.ts` and `solver.ts`, but every field is
   written before it is read within a single call and none of them escapes a
   call, so they never carry state. A value that OUTLIVES the call (a ledge grab
   the caller stores for the duration of a climb) is never module scratch:
   `findLedgeGrab` takes an optional `out` and otherwise allocates.
2. **No randomness at all.** Not `Rng`, not `Math.random`. Traversal is fully
   determined by geometry. If a future rung genuinely needs a draw, it must take
   an `Rng` and pin the draw count, because an unpinned draw shifts the whole
   world's RNG stream.
3. **No wall clock.** No `Date.now`, no `performance.now`. Time is the caller's
   fixed `DT`.
4. **FLOATING-POINT OPERATION ORDER IS PART OF THE CONTRACT.** This is the rule a
   later contributor is most likely to break by accident, because the change
   looks like a readability cleanup.
   - `jumpArcSamples` and `remainingRise` integrate with `vy -= gravity * dt`
     then `y += vy * dt`, in that order, mirroring `sim.ts` expression for
     expression. Replacing them with the closed form `v^2 / (2 g)` is not a
     simplification, it is a behavior change: the discrete arc peaks at 0.98 yd
     where the closed form says 1.125, and the bands derived from it decide
     whether a given obstacle is passable. `tests/traversal_ladder.test.ts` has
     the negative control that proves this exact mistake opens a gap.
   - Do not reassociate arithmetic anywhere else either: `a * b + c` and
     `c + a * b` can differ in the last bit, and every gate in here is a
     comparison against a threshold. A last-bit difference is a different
     boolean, which is a different position, which is a desync.
   - Do not sort, reverse, or dedupe the collider list inside a solve. Ties in
     time of impact go to the earlier entry, so the CALLER's order is part of the
     result. The wiring must hand every host the same order.
5. **No `Math.hypot` substitutions.** `Math.hypot` and `Math.sqrt(a*a+b*b)` do
   not agree bit for bit. Where one is used, keep using it.

`tests/architecture.test.ts` enforces 2 and 3 mechanically. Nothing enforces 4;
that is what this file is for.

### The one determinism risk this module cannot close
`Math.sin`, `Math.cos` and `Math.hypot` are implementation-approximated in
ECMA-262: two engines may return different last bits. The three hosts are not
all the same engine (Node on the server, V8 or JavaScriptCore in the browser),
and every one of those values eventually feeds a threshold comparison. This is a
PRE-EXISTING exposure, not one this module introduces: `colliders.ts` `rotY`,
`resolveMovement` and `pathfind.ts` already run the same functions on the same
hot path, and the sim has shipped on it. Do not "fix" it here in isolation, and
do not assume it away either: if cross-engine desync is ever observed in
movement, this is the first place to look, and the fix is a shared exact
implementation for the whole collision layer, not just for this directory.

## The files
- `sweep.ts`: the math leaf. Time of impact for a moving body circle against a
  circle or an OBB (slab test plus rounded corners via the Minkowski sum), the
  minimum-translation overlap query used for depenetration, and the un-inflated
  footprint test used for standing on a top. No imports but a type.
- `ladder.ts`: the bands, their derivation from our real constants, the
  integrated jump arc, `classifyObstacle`, and `findLadderGap`, the self-check
  that proves the ladder has no gap.
- `solver.ts`: `moveBody`: depenetrate, then up to four sweep-and-slide passes
  with step-up. Also `supportTopAt` / `floorHeightAt` / `isClearAt`, the queries
  a vertical pass and the ledge grab share.
- `ledge.ts`: `findLedgeGrab` (what a body may grab mid-jump) and the climb
  curve (`climbDuration`, `climbPoseAt`).
- `types.ts`: the caller-supplied shapes (`ColliderTopFn`, `GroundFn`,
  `ColliderFilter`).
- `index.ts` is the barrel. Import from it, never from the files behind it.

## What the world's collision geometry actually is
EXTRUDED 2D. Every obstacle is a circle or an oriented box in XZ that rises from
the ground to a known top, and the walkable surface is a heightfield
(`world.ts` `groundHeight`). So a body capsule reduces EXACTLY to a circle sweep
in XZ plus scalar height tests: cheaper than a general 3D solver, and exact
rather than approximate for this content.

`Collider` (in `colliders.ts`) carries `cameraTopY`, which is documented there as
camera-only ("movement ignores it"). This directory does NOT promote it into a
movement rule. The movement top is a caller-supplied `ColliderTopFn`, so the
wiring decides, once and explicitly, what each collider class means vertically.

## Rules that are load-bearing
- **Step-up applies to COLLIDERS, never to the heightfield.** A per-tick step
  allowance on terrain is a cliff-climbing ladder: a running body covers
  `RUN_SPEED * DT` (0.35 yd) per tick, so a 0.925 yd rise every tick would raise
  the effective climb limit to about 2.6 and defeat `PLAYER_MAX_CLIMB_SLOPE`
  (1.5) entirely. `moveBody` takes no heightfield at all, which is how this stays
  true. Terrain keeps the wall rule `sim.ts` already applies.
- **A step must COMMIT, not just raise.** Contact happens at
  `collider.r + bodyRadius`, but a surface only holds a body up when its CENTRE
  is over it, so raising the feet at the contact point alone leaves them
  unsupported: the vertical pass drops them and depenetration pushes them
  straight back out, which locks anyone moving slower than a full run. The
  solver advances onto the surface until the support query agrees, and abandons
  the step if no clear supported spot exists (the body then slides, never
  sticks). **The commit probes along the inward contact NORMAL, not along the
  motion.** Probing along the motion makes the required budget
  `radius / cos(approach)`, which silently turns every curb into a wall for
  anyone approaching more than about twenty degrees off head-on: a bug that is
  invisible to any test that drives motion straight at the obstacle.
- **At most one step per solve.** A commit is free distance (the body gains up
  to one radius along the normal), so letting all four passes take one would let
  a single 20 Hz tick outrun the requested delta and gain `4 * stepHeight` of
  height. One is also physically right: nobody strides two curbs in 50 ms.
- **`MANTLE_REACH === MAX_STEP_HEIGHT === LEDGE_GRAB_MIN`.** One allowance, read
  by the horizontal gate (`blocksAt`) and by the vertical support query
  (`floorHeightAt`'s `maxY`). Never raise one arm alone: a top the horizontal
  pass admits but the landing snap will not seat is a top the body tunnels into.
  The equality is also what keeps the ladder gapless at its bottom seam.
- **`climbMinOverhead === vaultMax`.** The middle seam: a climb begins exactly
  where the vault stops. Raising one without the other opens a band of heights
  that are too high to jump over and refused as "you could have jumped over it".
- **Grounded bodies step; airborne bodies mantle.** `blocksAt` grants the mantle
  allowance only when airborne, so a jump that falls just short of a rim still
  carries over it. Grounded traversal goes through the step-up branch alone.

## Where the numbers come from
Every band is DERIVED, not chosen. `ladder.ts` documents each one at its
declaration; the short version:

| Constant | Value | Derived from |
|---|---|---|
| `MAX_STEP_HEIGHT` | 0.925 | `sim.ts` `maxStepDown = 0.4 + run * MAX_CLIMB_SLOPE` at `run = RUN_SPEED * DT`. Step up equals step down, so traversal is reversible. |
| `MANTLE_REACH` | 0.925 | pinned to `MAX_STEP_HEIGHT` |
| `LEDGE_GRAB_MIN` | 0.925 | pinned to `MAX_STEP_HEIGHT` |
| `jumpApex` | 0.98 | the INTEGRATED arc of `JUMP_VELOCITY = 6` under `GRAVITY = 16` at `DT`, not `v^2 / 2g` |
| `vaultMax` | 1.905 | `jumpApex + MANTLE_REACH` |
| `LEDGE_GRAB_MAX` | 2.2 | 1.1x the renderer's 2.0 yd eye pivot; checked against the shipped prop tops |
| `climbMax` | 3.18 | `jumpApex + LEDGE_GRAB_MAX` |

`tests/traversal_constants.test.ts` reads `sim.ts`, `pathfind.ts`, `types.ts` and
`renderer.ts` and fails if any mirrored value drifts.

## Tests
- `tests/traversal_ladder.test.ts`: **the invariant**: every obstacle height is
  crossable or climbable, with no gap, at every jump strength the game can
  produce. Includes negative controls that break the ladder on purpose and prove
  the check catches it.
- `tests/traversal_solver.test.ts`: sweeps, sliding, no tunnelling,
  depenetration, step-up and its refusals, the floor queries, determinism.
- `tests/traversal_ledge.test.ts`: what may and may not be grabbed, and the
  climb curve.
- `tests/traversal_pathfind_agreement.test.ts`: the traversal core and
  `findPlayerPath` share one notion of passable.
- `tests/traversal_constants.test.ts`: the mirrored-constant drift guard.
