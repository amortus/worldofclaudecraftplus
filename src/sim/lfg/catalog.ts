// What the Dungeon Finder offers, and how a listing is derived from content.
// Pure leaf: no data.ts import, no content import, no rng.

import type { DungeonDef } from '../types';
import type { LfgListing, LfgTier } from './types';

// The queue's runtime identifier. NOT 'lfg': that token is already a joinable
// chat channel (JOINABLE_CHANNELS in sim.ts, ChatTabChannel in
// src/ui/chat_channels.ts) and reusing it would collide in the command parser,
// the channel tab bar, and every saved channel set.
export const DUNGEON_FINDER_QUEUE_ID = 'dungeonFinder';

export const DUNGEON_FINDER_GROUP_SIZE = 5;

// Our level cap. Restated here (rather than imported from types.ts) so this
// stays a pure leaf; tests/lfg_catalog.test.ts asserts it equals MAX_LEVEL.
export const DUNGEON_FINDER_LEVEL_CAP = 20;

// The smallest group the queue will pop, per derived tier. This is the single
// biggest concession to OUR population size: a five-strict queue in a realm
// with a handful of concurrent players never pops at all. Leveling content is
// comfortably three-mannable by capped players, endgame content is not, and
// level-cap-plus content is never shorted.
export const DUNGEON_FINDER_MIN_GROUP_BY_TIER: Readonly<Record<LfgTier, number>> = {
  leveling: 3,
  endgame: 4,
  heroic: 5,
};

// Derive a listing from a DungeonDef.
//
// OBSTACLE 4: DungeonDef carries no difficulty and no level field. We DERIVE
// both from the dungeon's own spawn table instead of adding fields, for two
// reasons. First, src/sim/types.ts is a shared file this wave does not own.
// Second, and more importantly, an authored level band would be a second source
// of truth: retune a boss from 20 to 22 and the queue would keep matching on
// the stale number with nothing to catch it. The spawn table IS the difficulty.
//
// `mobLevels` is a lookup the caller supplies (MOBS[id] in the host) so this
// function never reaches into data.ts.
export function deriveListing(
  def: DungeonDef,
  mobLevels: (mobId: string) => { minLevel: number; maxLevel: number } | undefined,
): LfgListing | null {
  // Five-mans only. Raids (suggestedPlayers 10) run on their own attunement and
  // lockout rules, and the one-player rooms are quest space, not queue content.
  if (def.suggestedPlayers !== DUNGEON_FINDER_GROUP_SIZE) return null;
  // A room reached only through an internal door has no overworld entrance to
  // send a queued group to.
  if (def.overworldDoor === false) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const spawn of def.spawns) {
    const t = mobLevels(spawn.mobId);
    // Strict: one unresolvable spawn would silently narrow the band and let the
    // queue match players against a boss it never looked at. No listing is
    // better than a wrong one.
    if (!t) return null;
    if (t.minLevel < min) min = t.minLevel;
    if (t.maxLevel > max) max = t.maxLevel;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  const tier: LfgTier =
    max > DUNGEON_FINDER_LEVEL_CAP ? 'heroic' : max === DUNGEON_FINDER_LEVEL_CAP ? 'endgame' : 'leveling';

  return {
    dungeonId: def.id,
    tier,
    groupSize: DUNGEON_FINDER_GROUP_SIZE,
    minGroupSize: DUNGEON_FINDER_MIN_GROUP_BY_TIER[tier],
    // The hard floor is the weakest level inside: below it a player is a
    // liability to four other people, and level difference alone would make
    // them miss every swing.
    minQueueLevel: min,
    recommendedLevel: max,
    contentMinLevel: min,
    contentMaxLevel: max,
  };
}

// The shipped offer list. Authored (this directory imports no content) and
// pinned against deriveListing over the real DUNGEON_DEFS + MOBS by
// tests/lfg_catalog.test.ts, so a content retune fails a test instead of
// silently mis-matching players.
export const DUNGEON_FINDER_LISTINGS: readonly LfgListing[] = [
  {
    dungeonId: 'hollow_crypt',
    tier: 'leveling',
    groupSize: 5,
    minGroupSize: 3,
    minQueueLevel: 7,
    recommendedLevel: 10,
    contentMinLevel: 7,
    contentMaxLevel: 10,
  },
  {
    dungeonId: 'sunken_bastion',
    tier: 'leveling',
    groupSize: 5,
    minGroupSize: 3,
    minQueueLevel: 12,
    recommendedLevel: 13,
    contentMinLevel: 12,
    contentMaxLevel: 13,
  },
  {
    dungeonId: 'drowned_temple',
    tier: 'leveling',
    groupSize: 5,
    minGroupSize: 3,
    minQueueLevel: 16,
    recommendedLevel: 18,
    contentMinLevel: 16,
    contentMaxLevel: 18,
  },
  {
    dungeonId: 'gravewyrm_sanctum',
    tier: 'endgame',
    groupSize: 5,
    minGroupSize: 4,
    minQueueLevel: 19,
    recommendedLevel: 20,
    contentMinLevel: 19,
    contentMaxLevel: 20,
  },
  {
    dungeonId: 'claudeholme',
    tier: 'heroic',
    groupSize: 5,
    minGroupSize: 5,
    minQueueLevel: 20,
    recommendedLevel: 22,
    contentMinLevel: 20,
    contentMaxLevel: 22,
  },
];

export function listingFor(dungeonId: string): LfgListing | null {
  return DUNGEON_FINDER_LISTINGS.find((l) => l.dungeonId === dungeonId) ?? null;
}

// There is deliberately no upper level gate. A capped player queueing for
// Hollow Crypt is the tank that makes it pop; in a realm this size, locking
// them out to prevent boosting would cost far more groups than it saves.
export function meetsLevel(listing: LfgListing, level: number): boolean {
  return level >= listing.minQueueLevel;
}
