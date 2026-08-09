# src/sim/lfg, the Dungeon Finder queue

The matchmaking core for our five-mans: who is waiting, when a group forms, who
fills which role, and what it costs to walk out of one. Wave 4 of the upstream
parity program.

This directory is the PURE MATCHMAKER and nothing else. There is no teleport, no
party creation, no instance claim, no chat, no HUD here, by design (see
"Deliberately not here").

## The name is `dungeonFinder`, never `lfg`

The directory is `lfg/` for continuity with the upstream feature name, but the
runtime identifier is **`DUNGEON_FINDER_QUEUE_ID = 'dungeonFinder'`** and every
intent kind is prefixed `dungeonFinder`. The token `lfg` is ALREADY taken: it is
a joinable chat channel (`JOINABLE_CHANNELS` in `sim.ts`, `ChatTabChannel` in
`src/ui/chat_channels.ts`, `/join lfg`, the `[LFG]` chat template, and the
`hud.core.chatChannels.names.lfg` key). Emitting `lfg` from here would collide in
the slash-command parser, the channel tab bar, and every persisted channel set.
**No string this subsystem produces may ever be `lfg`.**

## YOU MUST: zero rng draws

`tickDungeonFinder` takes no `Rng` and no module in this directory imports one.
This is stronger than a fixed draw count on purpose.

The host calls this from inside the 20 Hz tick, on the world's single shared
`Rng` stream. Every draw advances that stream for everything downstream, so a
matchmaker that drew even once would make loot, mob AI and spawn jitter depend on
how many people happened to be queued. Two clients would diverge from that tick
onward and never re-converge.

Every ordering here is total and reproducible instead:
- Queue order is `(joinedAt, unitId)`, both assigned by the host from the sim
  clock and a monotonic counter.
- Role assignment (`assignRoles`) is an exhaustive ordered pair search, not a
  sample.
- Ties inside `assignRoles` break on role-count, then queue position, then pid.

`tests/lfg_determinism.test.ts` pins both halves: a source scan asserting no file
here mentions `Rng`, `Math.random`, `Date.now`, `performance.now`, or an rng
method, and a live assertion that a shared `Rng` handed to the host produces the
identical next value whether or not a full matchmaking tick ran.

All timing is **sim-clock seconds passed in as `now`**. Nothing here reads a
clock of its own.

## The four obstacles, and how each is resolved

1. **`INSTANCE_SLOT_COUNT` caps concurrent instances at 6** (per dungeon:
   `sim.ts` pushes `INSTANCE_SLOT_COUNT` slots for every `DUNGEON_LIST` entry).
   A queue that pops more groups than there are slots promises a dungeon it
   cannot open. Resolution: the host passes `freeInstanceSlots[dungeonId]` into
   every tick, **an open proposal holds a reservation for its whole lifetime**
   (`openProposalsFor` is subtracted before anything new forms), and a fully
   accepted proposal is re-checked against the live count at promotion time. If
   the slot is gone, the proposal waits up to `LFG_SLOT_WAIT_SEC` and then closes
   with reason `noSlot`, requeueing everyone at their original position with no
   penalty. The queue never over-promises and never silently drops a group.
2. **Group teleport already has an authority path.** Resolution: this directory
   returns coordinates for nobody. A completed proposal becomes one
   `dungeonFinderFormGroup` intent carrying `leaderPid` and `members`, and the
   host satisfies it with its EXISTING party path plus its EXISTING
   `enterDungeon(dungeonId, pid)` per member. `enterDungeon` already resolves
   `instanceKeyFor(pid)` to the party key, so all five land in the same instance
   and the first call claims the slot. There is no second teleport route.
3. **`lfg` is taken.** See the section above.
4. **`DungeonDef` carries no difficulty or level fields.** Resolution: DERIVE,
   do not add. `deriveListing(def, mobLevels)` reads the dungeon's own spawn
   table for `contentMinLevel` / `contentMaxLevel` and folds that into a
   `LfgTier` (`leveling` below the cap, `endgame` at 20, `heroic` above). Two
   reasons: `src/sim/types.ts` is not this wave's file to edit, and an authored
   level band would be a SECOND source of truth that goes stale the moment a boss
   is retuned. The spawn table is the difficulty.
   `DUNGEON_FINDER_LISTINGS` is authored so this stays a pure leaf with no
   `data.ts` import, and `tests/lfg_catalog.test.ts` re-derives it from the real
   `DUNGEON_DEFS` + `MOBS` and fails on any drift.

## Design decisions, and what was tuned for OUR population

Upstream can hold out for a strict composition. We cannot: only **3 of our 9
classes have a tank spec** (warrior, paladin, druid) and **4 have a healer spec**
(paladin, priest, shaman, druid), and our realm runs a handful of concurrent
players. A role-strict queue here is a queue that never pops.

- **Composition-preferred, not composition-strict.** Strictness decays with a
  unit's own wait: `ideal` (1 tank + 1 healer + 3 damage) for 90 s, then
  `anchored` (a full five with at least one of tank/healer), then `any` (any
  five) at 240 s, then `short` at 420 s. The matchmaker tries every unit as the
  anchor, **oldest first**, and uses that anchor's own wait: the longest waiter
  always gets the loosest rules, so nobody starves, and one unmatchable unit at
  the head cannot freeze everyone behind it (in a realm this size, head-of-line
  blocking is a dead queue).
- **Group assembly is a bounded search, not a greedy fill.** An anchor duo plus
  a trio is a perfect five that a greedy pass can never reach once it has taken
  the wrong duo. `searchFullGroup` enumerates exact-size combinations in queue
  order and returns the first one whose roles satisfy the tier, inside a fixed
  candidate window and node budget so the cost of a tick cannot grow with the
  queue and the result stays a pure function of the pool.
- **When only one anchor can be filled, it is the tank** (`assignRoles`
  fallback). A tank plus four damage dealers can pull; a healer plus four damage
  dealers loses whoever the first pull looks at. The `anchored` tier accepts this
  branch, so the choice is load-bearing.
- **Undersized pops, gated by derived tier.** `short` will pop a group down to
  `minGroupSize`: 3 for `leveling`, 4 for `endgame`, 5 for `heroic` (never
  shorted). Capped players three-man the low dungeons comfortably; Claudeholme
  they do not. The intent carries `undersized: true` so the client can warn.
- **No upper level gate.** A capped player queueing for the Hollow Crypt is the
  tank that makes it pop. In a realm this size, locking them out to prevent
  boosting costs far more groups than it saves. The lower gate is hard: below the
  weakest level inside, level difference alone makes a player miss every swing.
- **Roles default to everything the class can do.** An omitted or empty role
  request means "anything", instead of the modern convention of forcing the
  player to tick boxes. `resolveRoles` intersects the request with
  `LFG_CLASS_ROLES`, so a mage can never queue as a tank.
- **A partial group is never held aside.** There is no waiting-room state. A set
  that is not yet valid stays in the queue where another unit can still match it.
  Holding four players in limbo hoping for a fifth is the classic small-realm
  failure and it is structurally impossible here: the only thing that ever leaves
  the queue is a complete, valid proposal.
- **Leaving the queue is free; breaking a formed group is not.** A queue leave,
  a disconnect, a death and an instance entry all just remove the player, with no
  penalty (`isAvailable` prunes the last three). Declining a ready check costs
  `LFG_DECLINE_COOLDOWN_SEC` (120 s); never answering costs
  `LFG_TIMEOUT_COOLDOWN_SEC` (300 s), because a timeout burns the full 40 s ready
  window for four other people before they learn the group is dead. Everyone else
  in a broken proposal is requeued **with their original `joinedAt`**, so four
  players are never sent to the back of the line for a fifth player's decision.
- **A shrinking premade keeps its place.** Same reason.

## Files

| File | What it is |
|---|---|
| `types.ts` | Every record shape, the intent union, and `LFG_INTENT_KINDS`. Types only. |
| `tuning.ts` | All time and penalty constants, in one block. Sim-clock seconds. |
| `catalog.ts` | What is offered, `deriveListing`, the level gate. Pure leaf, no `data.ts` import. |
| `roles.ts` | `LFG_CLASS_ROLES`, `resolveRoles`, and the exhaustive `assignRoles` pair search. |
| `state.ts` | The queue record and the ordering helpers. No policy. |
| `proposals.ts` | Ready-check lifecycle: open, respond, expire, close, requeue, penalties. |
| `matchmake.ts` | `relaxFor`, `buildCandidateGroup`, and `tickDungeonFinder`, the per-tick entry point. |
| `index.ts` | The barrel. Import from here, not from the modules. |

The state record is owned by the HOST (one field on `Sim`); functions here take
it as an explicit argument and mutate it in place, the same sanctioned shape
`src/sim/professions` uses for the caller-owned `InvSlot[]`. Nothing here reaches
into `Sim`.

## The host contract, YOU MUST honour these

The queue is only as correct as the numbers it is handed. Four obligations, none
of which `tsc` can check:

1. **Claim the instance slot in the same tick you perform a
   `dungeonFinderFormGroup` intent.** The slot reservation is tick-local: once a
   proposal is promoted it is gone from `state.proposals` and nothing here holds
   the slot any more. `enterDungeon` claims synchronously, so performing the
   intent immediately is enough; deferring it by even one tick lets the next tick
   see the slot as free and promise it to a second group.
2. **Process player commands (join / leave / ready-check answers) BEFORE
   `tickDungeonFinder` in the same tick.** `expireProposals` runs before
   promotion, so an accept that arrives in the same sim second as `expiresAt`
   saves the group only in that order; the other order costs four innocent
   players a 300 s `timedOut` cooldown.
3. **`freeInstanceSlots` must carry an entry for every offered dungeon.** A
   missing key reads as zero and that dungeon silently never pops.
4. **`isAvailable` is the ONLY liveness signal.** A player pruned out of the
   queue by it gets no intent, deliberately: the host flipped the predicate, so
   the host already knows and can say so in its own voice.

Two limits worth naming in the client copy: a player may hold **one** queue entry
at a time (a second join denies with `alreadyQueued`, whichever dungeon they are
in; use the exported `unitForPid` to name it), and a premade with **any** member
on cooldown is denied as a whole, naming that member in `denyPid`.

## i18n

`src/sim/` is language-agnostic, so nothing here emits prose. Every result is a
stable id or a number: `LfgRole`, `LfgTier`, `LfgRelax`, `LfgJoinDeny`,
`LfgRespondDeny`, `LfgCloseReason`, `LfgPenaltyReason`, `LfgPlayerState`, and
`dungeonId`. The client composes and localizes every line under
`dungeonFinder.*`. **Never add an English literal here.**

**TRAP 1** (`docs/design/parity-backlog.md`): sim-to-UI event names are compared
as STRINGS and a rename is invisible to `tsc`. `LFG_INTENT_KINDS` is the frozen
contract; `tests/lfg_determinism.test.ts` pins the union against it, and the
wiring change MUST add a source-scanning guard in the shape of
`tests/crafting_event_contract.test.ts` before any parallel UI work starts.

Ids the client must have copy for: `LfgRole` (3), `LfgTier` (3), `LfgRelax` (4),
`LfgJoinDeny` (7), `LfgRespondDeny` (3), `LfgCloseReason` (5), `LfgPenaltyReason`
(2), `LfgPlayerState` (4), the 4 intent kinds, and the offered `dungeonId`s.

## Deliberately not here (the wiring wave)

- The `Sim` field holding `LfgQueueState`, the per-tick call, and the commands.
- Party formation and `enterDungeon` per member (obstacle 2).
- Counting free instance slots (`instances.filter(...)`) into `freeInstanceSlots`.
- The `isAvailable` predicate (offline / dead / already inside an instance).
- `IWorld` surface, `ClientWorld` mirror, snapshot fields, the HUD panel and its
  ready-check popup, and the `dungeonFinder.*` translation keys.
