import { describe, expect, it } from 'vitest';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { MAX_LEVEL } from '../src/sim/types';
import {
  DUNGEON_FINDER_GROUP_SIZE,
  DUNGEON_FINDER_LEVEL_CAP,
  DUNGEON_FINDER_LISTINGS,
  DUNGEON_FINDER_MIN_GROUP_BY_TIER,
  DUNGEON_FINDER_QUEUE_ID,
  deriveListing,
  listingFor,
  meetsLevel,
} from '../src/sim/lfg';

const levels = (mobId: string) => MOBS[mobId];

describe('dungeon finder catalog', () => {
  it('never uses the taken "lfg" identifier', () => {
    // OBSTACLE 3: `lfg` is already a joinable chat channel.
    expect(DUNGEON_FINDER_QUEUE_ID).toBe('dungeonFinder');
    expect(DUNGEON_FINDER_QUEUE_ID).not.toBe('lfg');
  });

  it('restates the real level cap', () => {
    expect(DUNGEON_FINDER_LEVEL_CAP).toBe(MAX_LEVEL);
  });

  // OBSTACLE 4: DungeonDef carries no difficulty or level field, so the listing
  // is DERIVED from the spawn table. The authored table must match the
  // derivation over the real content, or a boss retune silently mis-matches
  // players.
  it('matches deriveListing over the real DUNGEON_DEFS and MOBS', () => {
    for (const def of Object.values(DUNGEONS)) {
      expect(deriveListing(def, levels)).toEqual(listingFor(def.id));
    }
  });

  it('offers exactly the five-man dungeons with an overworld door', () => {
    const derived = Object.values(DUNGEONS)
      .map((d) => deriveListing(d, levels))
      .filter((l) => l !== null)
      .map((l) => l!.dungeonId)
      .sort();
    expect(derived).toEqual([...DUNGEON_FINDER_LISTINGS].map((l) => l.dungeonId).sort());
    for (const id of derived) {
      expect(DUNGEONS[id].suggestedPlayers).toBe(DUNGEON_FINDER_GROUP_SIZE);
      expect(DUNGEONS[id].overworldDoor).not.toBe(false);
    }
  });

  it('excludes raids and the one-player quest room', () => {
    expect(listingFor('nythraxis_boss_arena')).toBeNull();
    expect(listingFor('claudexxaramas')).toBeNull();
    expect(listingFor('nythraxis_crypt')).toBeNull();
  });

  it('derives a tier ladder off the content level, not an authored number', () => {
    for (const l of DUNGEON_FINDER_LISTINGS) {
      const expected =
        l.contentMaxLevel > MAX_LEVEL
          ? 'heroic'
          : l.contentMaxLevel === MAX_LEVEL
            ? 'endgame'
            : 'leveling';
      expect(l.tier).toBe(expected);
      expect(l.minGroupSize).toBe(DUNGEON_FINDER_MIN_GROUP_BY_TIER[l.tier]);
      expect(l.minQueueLevel).toBe(l.contentMinLevel);
      expect(l.recommendedLevel).toBe(l.contentMaxLevel);
    }
    // Never shorts the hardest five-man.
    expect(listingFor('claudeholme')!.minGroupSize).toBe(DUNGEON_FINDER_GROUP_SIZE);
  });

  it('gates the level floor hard and the ceiling not at all', () => {
    const crypt = listingFor('hollow_crypt')!;
    expect(meetsLevel(crypt, crypt.minQueueLevel - 1)).toBe(false);
    expect(meetsLevel(crypt, crypt.minQueueLevel)).toBe(true);
    // A capped player is welcome in the low dungeon: in a realm this size they
    // are the tank that makes it pop.
    expect(meetsLevel(crypt, MAX_LEVEL)).toBe(true);
  });

  it('returns null rather than throwing on unknown mobs', () => {
    expect(deriveListing(DUNGEONS.hollow_crypt, () => undefined)).toBeNull();
  });
});
