<!-- src/sim/deeds/ — the chronicle evaluator. The one-sim-three-hosts
     architecture, determinism, and test commands live in the root and
     src/sim CLAUDE.md; this file is the local contract only. -->

# src/sim/deeds — the Book of Deeds evaluator

The engine half of the chronicle (achievement) system. The **catalogue** lives in
`src/sim/content/deeds/`; nothing here knows a single deed id.

## Files
- `types.ts` — `DeedDef` / `DeedTrigger` / `DeedReward` / `DeedProgress` / `DeedEvent`,
  the mark namespaces, and `deedMark()`. A pure leaf (types-only import), so the
  catalogue and the evaluator can both depend on it without a cycle.
- `evaluator.ts` — the whole mechanism: `applyDeedEvent`, `evaluateDeeds`, the
  readouts, and persistence.
- `index.ts` — the barrel. **Import from here**, not from the modules.

## The contract
- **Pure.** Every function takes its inputs as arguments and returns a value. No
  `Sim`, no world, no module-level mutable state, no `Rng`, no clock. The catalogue
  arrives as a `DeedCatalog` parameter, which is why the evaluator has no import
  edge to `content/deeds/`.
- **Immutable progress.** `DeedProgress` is never mutated. An evaluation that
  changed nothing returns the **same reference**, so `next !== prev` is the cheap
  "should I persist / re-broadcast?" test.
- **Completes exactly once**, guarded twice over: `earned` is keyed by deed id and
  a present key short-circuits the grant, and every counter is monotonic
  (`DEED_COUNTER_MODE`: `sum` accumulates, `max` is a high-water mark), so a
  re-delivered event can never drop a score back under a threshold and re-arm it.
- **Grant order is `catalog.order`**, never the iteration order of a `Set` or
  `Map`. Two runs over the same inputs must produce byte-identical output.
- **The `meta` fixpoint** lets a deed complete off grants made in the same pass.
  It is bounded by `order.length`, so it always terminates.

## Adding a trigger kind
1. Add the variant to `DeedTrigger` in `types.ts`.
2. Handle it in **both** `triggerSatisfied` and `deedProgressView` in
   `evaluator.ts` — the switch is exhaustive on purpose; `tsc` will point at the
   second one if you forget.
3. If it needs new state, add the counter to `DeedCounterId` **and** its mode to
   `DEED_COUNTER_MODE` (the table is typed `Record<DeedCounterId, ...>`, so a
   missing entry is a compile error), or add a namespace to
   `DEED_MARK_NAMESPACES` (unlisted namespaces are dropped on load, by design).
4. Extend `serializeDeedProgress`/`restoreDeedProgress` only if you added state;
   both stay sparse and sorted so an untouched chronicle never churns a save.

## Never here
- **No player-visible text.** The evaluator returns ids and numbers; the English
  `name`/`desc` live in the catalogue and are re-localized at the client boundary.
- **No `Rng`, no `Date.now`.** The system is intentionally random-free; the
  `stamp` argument is the caller's SIM clock, is only stored, and is never compared.
- **No content ids.** A boss/zone/quest id in this directory is a layering bug.
