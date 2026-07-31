<!-- Area-scoped: src/sim/professions/ only. Root, src/ and src/sim/ CLAUDE.md
     are already loaded (determinism, host-agnostic purity, module-first, the
     sim-emit -> client-matcher i18n flow). This file covers only this
     subsystem's own contracts. -->

# src/sim/professions/ — gathering mechanics

The pure core for the four gathering professions: **mining, logging, herbalism,
fishing**. Crafting and enchanting are a later wave and are not here yet.

Every module in this directory is a **pure leaf**. No `Sim` import, no
`PlayerMeta`, no `ITEMS`, no content import, no host state of any kind: every
function takes its inputs explicitly and returns a plain result, and randomness
arrives as an `Rng` parameter. That is what lets a Vitest drive the whole
subsystem directly, and it is why `sim.ts` can own all the wiring without any of
the mechanics leaking into it.

## Module map
| Module | Owns |
|---|---|
| `mastery.ts` | The **four-state mastery curve** (`tierProgressMultiplier`, 1 / 0.5 / 0.25 / 0), `capabilityTierFor`, and `applyProficiencyGain` (the ONE place a cap is enforced). |
| `proficiency_bands.ts` | The 0/1/2 band ladder over a profession's own `maxSkill` (thirds). Read by the gather-cast duration and the fishing catch table. |
| `tools.ts` | Tool tier lookups and the one shared `canGatherTier` comparator. Bare hands never work a node. |
| `gathering.ts` | Node harvest: `beginHarvest` (rng-free gates + cast duration), `resolveHarvest` (one draw), the rarity roll, the gain curve, the proficiency record helpers. |
| `fishing.ts` | The bite minigame (`rollBiteSchedule`, `resolveReel`) and the catch ladder (`effectiveFishingBand`, `resolveFishingCatch`). |
| `types.ts` | Every record shape, plus `GATHERING_PROFESSION_IDS`. |
| `index.ts` | The public surface. Host code imports from here, never from a module directly. |

Data tables live in **`src/sim/content/professions/`**, never here.

## Contracts that must not drift
- **Draw contract.** A completed node harvest draws exactly **one** `rng.next()`
  (the material rarity). A fishing session draws **one** at cast start (the bite
  delay) and **one** more on a landed reel (the catch table); a missed reel stays
  at one. Every deny arm, every band selection, and the entire mastery curve are
  **draw-free**, so a denial, a full bag, or a player's skill can never shift the
  world's rng stream.
- **The cap is enforced in one place.** All gain routes through
  `applyProficiencyGain(current, gain, maxSkill)`. Caps: 100 for mining, logging
  and herbalism; 200 for fishing.
- **`beginHarvest` never mutates and never consumes the respawn timer.** Only
  `resolveHarvest` produces `nextReadyAt`, and only on a completed cast, so an
  interrupted harvest costs the player nothing.
- **Respawn is per viewer.** The host holds `Record<nodeId, readyAtSeconds>` per
  player. One player working a node never touches another's timer: no gather
  rush, no node camping.
- **This directory is text-free.** Every result is ids and numbers
  (`GatherDenyReason`, `ReelOutcome`, `MasteryState`, `requiredTier`). The client
  composes and localizes every line. Never add an English literal here.

## Balance provenance
Ported unchanged from upstream: the four-state curve and its 1 / 0.5 / 0.25 / 0
multipliers, the 25-point tier step, the profession caps, the material rarity
weights (`MATERIAL_RARITY_SHARE`) and per-rarity unit counts, the 120 s respawn,
the gather cast constants (2.5 base / 1.5 floor / 0.4 per tool tier / 0.15 per
band), and every bite-minigame constant (3 to 8 s delay, 1.5 s per rod tier off
the max, a 3 s window widening 0.75 s per rod tier).

**Adapted, with the reasoning in a comment at each site:**
- **Node tiers run 1..4, one per zone** (`gathering.ts` `GATHER_GAIN_TIER_STEP`).
  Upstream spreads tiers 1..3 over eleven realms; we have four zones and a level
  cap of 20, so four rungs at the unchanged 25-point step lands the curve exactly
  on the 100 ceiling.
- **Band thresholds are thirds of `maxSkill`**, not upstream's literal
  `[0, 100, 200]` (`proficiency_bands.ts`). Upstream documents those literals as
  "the thirds of the gathering maxSkill (300)" and never re-derived them when the
  caps dropped to 100/200, which strands miners in band 0 forever. Thirds
  reproduce their original boundaries and restore the ladder for all four
  professions.
- **Fishing rides the same four-state curve** against a water tier, at a 50-point
  step (`fishing.ts` `FISHING_GAIN_TIER_STEP`), instead of upstream's bespoke
  1 / 0.5 / 0.1 / 0.02 taper, which they themselves describe as a
  thousands-of-catches long tail tuned for a much higher cap.
- **The junk cutoff** is derived off the band ladder rather than upstream's stale
  literal 100, so it tracks fishing's own ceiling.

## Adding a mechanic here
1. Its own small module in this directory, taking explicit inputs. Never import
   `Sim`, `PlayerMeta`, `ITEMS`, or anything from `content/`.
2. Data tables go in `src/sim/content/professions/`.
3. Export it from `index.ts`; that barrel is the whole public surface.
4. A test in `tests/professions_<thing>.test.ts` that imports the module
   directly. Bug fixes are test-first: reproduce, then the smallest green change.
5. If render/UI must see it, extend `IWorld` (`src/world_api.ts`) and implement
   in BOTH `Sim` and `ClientWorld`. Presentation never reaches into a concrete
   world.
