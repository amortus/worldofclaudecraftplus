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
| 3 | Procedural rifts: generator, content, instance wiring, portals, loot, floor tracker | in progress |

Also landed outside the waves: the build no longer ships every media asset twice
(72.7 MiB of exact duplication), which took the signed AAB from 199.78 to 144.80 MiB.

## Wave 4, not started

### Dungeon finder / LFG (~114 KB upstream)
A matchmaking queue for our five-mans. Four obstacles were identified in an earlier
session and still stand:
- `INSTANCE_SLOT_COUNT` caps concurrent instances at 6.
- Group teleport goes through an authority path that a queue pop would need to reuse
  rather than duplicate.
- The channel name `lfg` is already taken by a chat channel.
- `DungeonDef` carries no difficulty or level fields, which a queue needs to match on.
The arena's `matchmakeTeamFormat` is roughly 70 percent reusable and is the right
starting point rather than a fresh queue.

### Mounts as items (~85 KB upstream)
This is a REFACTOR, not a new system: we already have mounts (55 files reference them).
Upstream retired the mount picker and the persisted "selected mount" concept, making
reins a bag item usable from the action bar with an instant dismount. Worth doing for the
action-bar integration; check `reins` (2 files here) before assuming our shape matches.

### Traversal physics (~36 KB upstream)
Swept collision, multi-pass sliding, depenetration and step-up, with a traversal ladder
(stride under 0.9, vault through the jump arc, ledge climb above head height, wall above
that). Highest risk item in the backlog: it changes movement in the shared sim, so it
must resolve identically offline, on the server and in the client extrapolator or
prediction desyncs. Upstream pins the bands with an invariant test proving no gap exists
that can be neither crossed nor climbed; port that test with the feature.

## Wave 5, not started

### New realms and content (~252 KB upstream, plus assets)
Eleven realms, 105 quests, 48 NPCs and a five-man dungeon (Wildheart Basin). The only
wave that needs real art. There is now ~55 MiB of AAB headroom; if it is exceeded, the
answer is Play Asset Delivery, which is the official multi-GB mechanism and hosts the
packs on Play's own CDN. Note the Capacitor complication: PAD assets do NOT land in the
normal assets folder, so the WebView needs a custom path handler.

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
