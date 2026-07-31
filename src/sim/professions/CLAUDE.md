<!-- Area-scoped: src/sim/professions/ only. Root, src/ and src/sim/ CLAUDE.md
     are already loaded (determinism, host-agnostic purity, module-first, the
     sim-emit -> client-matcher i18n flow). This file covers only this
     subsystem's own contracts. -->

# src/sim/professions/ — gathering and crafting mechanics

The pure core for the four gathering professions (**mining, logging, herbalism,
fishing**, wave 1) and the four crafting ones (**smithing, woodcraft, alchemy,
enchanting**, wave 2).

Every module in this directory is a **pure leaf**. No `Sim` import, no
`PlayerMeta`, no `ITEMS`, no content import, no host state of any kind: every
function takes its inputs explicitly and returns a plain result, and randomness
arrives as an `Rng` parameter. That is what lets a Vitest drive the whole
subsystem directly, and it is why `sim.ts` can own all the wiring without any of
the mechanics leaking into it.

The one sanctioned exception is that `resolveCraft`, `resolveEnchant` and
`resolveDisenchant` MUTATE the `InvSlot[]` handed to them, always through
`addToSlots` / `removeFromSlots` (`../item_instance`) and never by hand. That
array is an explicit argument the caller owns, and routing the mutation through
the sanctioned paths is the point: the "a reagent cost can never eat a signed
copy while a plain one exists" rule lives inside `removeFromSlots`, so anything
that consumed slots itself would quietly lose it.

## Module map
| Module | Owns |
|---|---|
| `mastery.ts` | The **four-state mastery curve** (`tierProgressMultiplier`, 1 / 0.5 / 0.25 / 0), `capabilityTierFor`, and `applyProficiencyGain` (the ONE place a cap is enforced). Shared by gathering, fishing, crafting and enchanting. |
| `proficiency_bands.ts` | The 0/1/2 band ladder over a profession's own `maxSkill` (thirds). Read by the gather-cast duration and the fishing catch table. |
| `tools.ts` | Tool tier lookups and the one shared `canGatherTier` comparator. Bare hands never work a node. |
| `gathering.ts` | Node harvest: `beginHarvest` (rng-free gates + cast duration), `resolveHarvest` (one draw), the rarity roll, the gain curve, the proficiency record helpers. |
| `fishing.ts` | The bite minigame (`rollBiteSchedule`, `resolveReel`) and the catch ladder (`effectiveFishingBand`, `resolveFishingCatch`). |
| `crafting.ts` | Recipes: `beginCraft` (rng-free gates + reagent rows + proc odds), `resolveCraft` (one draw), the 125-cap gain curve, the craft-skill record helpers. |
| `masterwork.ts` | The proc chance model and the deterministic bonus-stat bake. Draws nothing: `crafting.ts` owns the draw. |
| `enchanting.ts` | Apply / destructive replace (zero draws) and disenchant (one draw), plus the payload transforms and the yield tables. |
| `types.ts` | Every record shape, plus `GATHERING_PROFESSION_IDS` and `CRAFTING_PROFESSION_IDS`. |
| `index.ts` | The public surface. Host code imports from here, never from a module directly. |

Data tables live in **`src/sim/content/professions/`**, never here.

## Contracts that must not drift
- **Draw contract.** A completed node harvest draws exactly **one** `rng.next()`
  (the material rarity). A fishing session draws **one** at cast start (the bite
  delay) and **one** more on a landed reel (the catch table); a missed reel stays
  at one. A successful craft draws exactly **one** (the masterwork proc),
  unconditionally, even when the output could never masterwork. A successful
  disenchant draws exactly **one** (the material bonus unit). Applying or
  replacing an enchant draws **zero** (`resolveEnchant` does not even take an
  `Rng`). Every deny arm, every band selection, and the entire mastery curve are
  **draw-free**, so a denial, a full bag, or a player's skill can never shift the
  world's rng stream.
- **The cap is enforced in one place.** All gain routes through
  `applyProficiencyGain(current, gain, maxSkill)`. Caps: 100 for mining, logging
  and herbalism; 200 for fishing; **125 for all four crafts**.
- **A destructive action is never silent.** Replacing an enchant requires
  `confirmReplace === true` (strict boolean), refuses an identical re-apply even
  WITH consent, and `beginEnchant` reports the enchant that would be destroyed
  plus the full reagent cost on the deny itself, so the confirmation dialog can
  name both. Disenchant has `previewDisenchant`, which is exact on the typed
  secondary and a one-unit range on the ladder material.
- **Enchant magnitudes are frozen once shipped.** An apply bakes the bonus into
  the item instance, so a later nerf would not retro-apply and early enchanters
  would keep grandfathered copies. Correct economy drift by re-pricing REAGENTS.
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

### Wave 2 (crafting and enchanting)
Ported unchanged: the 125 craft cap, the 25-point tier step, every masterwork
tuning constant (0.03 base, +0.01 per tier above, +0.02 signed reagent, +0.01
per material tier, 0.15 cap), the disenchant material ladder and its
`qualityIndex + floor(level / 10) + 1` sub-rare yield, the typed-secondary
material set, the whole enchant magnitude table (upstream's cap is 20 like
ours, and their doc states these were tuned against level-20 BiS budgets), and
the replace/same-enchant deny semantics.

**Adapted, with the reasoning in a comment at each site:**
- **Four crafts, not ten** (`content/professions/crafts.ts`). Upstream's ring,
  archetypes, combo recipes and specialization perks all exist to force a choice
  among ten crafts; we have three node families and eight equip slots, so six of
  the ten would have no faucet and no slot. `MASTERWORK_SPECIALIZATION_CHANCE`
  goes with them, which lowers our reachable proc ceiling from 0.15 to 0.10.
- **The masterwork bake is a FRACTION of the item's own profile**
  (`masterwork.ts` `MASTERWORK_BONUS_FRACTION`), not upstream's item-budget
  delta: this repo has no budget model, and one third is where our real ladder
  puts a quality rung (uncommon 9 to rare 11, rare 13 to epic 18 at level 20).
- **The maker's bond keys on output KIND, not rarity** (`crafting.ts`
  `isSignableCraftOutput`). Upstream's rare-or-better rule would put the
  signature on three of our twenty-four crafted items.
- **A commission binds at craft time** (`CraftAttempt.commissionFor`), because
  our `ItemInstance` has `boundTo` but no `bindOnTrade` and `types.ts` was out
  of the wave's file ownership.
- **The enchant target names the copy directly** (`EnchantTarget`: a worn
  `EquipSlot` or a bag index) instead of upstream's item-id command plus
  highest-index victim pin. Our eight slots are eight distinct kinds with no
  ring, neck, offhand or dual wield, so a worn copy IS its slot, and naming the
  copy removes the race upstream documents.
- **The armor class is inferred from the stat signature** when `armorType` is
  absent (`enchanting.ts` `armorClassFor`), and the caster/melee weapon split
  reads the `int` axis. Our content sets `armorType` on eight items out of 271
  and has no weapon-family table, so upstream's pure field reads would leave the
  typed secondary essentially dead.
- **Disenchant draws exactly once at every quality.** Upstream draws for the
  secondary count on an epic and not at all on a rare, making their draw count
  quality-dependent; ours keeps the contract one sentence and the preview exact.
- **Base-tier stamina enchants are one point lighter than upstream's.** With
  three fewer slots the other axes land inside the 13-to-21-percent band but
  stamina reached 24 percent; the trim lands it at 20 and preserves the
  Greater-beats-base-by-3 step exactly.

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
