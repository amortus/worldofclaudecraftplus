<!-- src/sim/content/deeds/ — the deed catalogue. Repo-wide rules live in the
     root CLAUDE.md and the data-as-code rules in src/sim/content/CLAUDE.md;
     this file is the local contract only. -->

# src/sim/content/deeds — the Book of Deeds catalogue

Data-as-code, one `DeedDef` per deed, one file per category. **No engine logic
here**: the evaluator is `src/sim/deeds/`.

## Files
`progression.ts` (levels, talents, prestige, Dawn of Claude standing) ·
`combat.ts` (kills, bosses, duels, arena) · `exploration.ts` (the four zones,
quests, loot quality) · `dungeons.ts` (the four five-mans, Nythraxis, the
Collapsed Reliquary) · `raids.ts` (Claudeholme, Claudexxaramas, Thunzharr) ·
`index.ts` (the `DEEDS` table, `DEED_ORDER`, and the frozen `DEED_CATALOG`).

## YOU MUST
- **`DEED_ORDER` is append-only.** It is the grant order and the ids are persisted
  in character saves. Append at the END of a category array; never reorder,
  rename, or delete an entry. A deed whose content is retired stays in the table.
- **Pin requirement lists; never derive them from the live tables.** A deed's bar
  must not rise when new content ships, or an already-earned chronicle silently
  un-completes. `CLAUDEHOLME_BOSSES` in `raids.ts` is the pattern: a literal list,
  with a new boss earning a NEW deed rather than growing an old one.
- **Every id must exist.** Boss ids come from `DUNGEON_MOBS`/`TEMPLE_DUNGEON_MOBS`
  (`../dungeons.ts`, `../temple.ts`), zone ids from `ZONES` (`../zone1..zone4.ts`),
  quest ids from the `ZONE{N}_QUESTS` tables, delve ids from `../delves/`, and the
  world boss from `src/sim/world_boss.ts`. Nothing checks these at compile time:
  `tests/deeds_content.test.ts` cross-checks them against the live tables.
- **Build marks with `deedMark(ns, id)`**, never a hand-written `"ns:id"` string.
- **Numbers come from the systems they describe.** Reputation thresholds are the
  `REP_TIERS` floors (`src/sim/reputation.ts`); lifetime-XP tiers mirror
  `MILESTONES` (`src/sim/types.ts`). Do not invent a parallel curve.

## i18n
`name` and `desc` are **player-visible English source text**, the same contract as
mob/quest names in the sibling content files: the sim never emits deed text, only
deed ids, and the client renders `deed.<id>.name` / `deed.<id>.desc`. A title
reward's `titleId` is a stable id in the `deed:` namespace (kept distinct from the
milestone ids on `Entity.title`); its text is a client string too. Adding a deed
means adding its English keys to the UI catalogue in the same change.

## Renown scale
5 (an early step) · 10 (a real milestone) · 25 (a zone or dungeon capstone) ·
50 (an endgame capstone) · 75-100 (a full-clear). Zero is legal and deliberate for
a deed the player cannot avoid earning.
