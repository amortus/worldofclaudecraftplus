import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { meleeMissChance, MOB_VS_PLAYER_MAX_MISS, swingMissChance } from '../src/sim/types';

// #1: a hostile WILD mob always connects at least ~80% of the time against a player (or a
// player-owned pet), regardless of level difference. The above-level miss penalty in
// meleeMissChance is an anti-power-level deterrent for PLAYERS hitting higher-level mobs;
// keyed on (target - attacker) level it would otherwise fire in reverse and make a
// low-level mob whiff on a higher-level player. swingMissChance caps only that direction.
function ent(kind: Entity['kind'], level: number, hostile: boolean, ownerId: number | null): Entity {
  return { kind, level, hostile, ownerId } as unknown as Entity;
}

describe('swingMissChance (mob->player miss cap)', () => {
  it('caps a hostile wild mob swinging at a higher-level player at MOB_VS_PLAYER_MAX_MISS', () => {
    const mob = ent('mob', 1, true, null);
    const player = ent('player', 20, false, null);
    // The raw penalty really is steep (well past the cap), proving the cap does work.
    expect(meleeMissChance(1, 20)).toBeGreaterThan(MOB_VS_PLAYER_MAX_MISS);
    expect(swingMissChance(mob, player)).toBe(MOB_VS_PLAYER_MAX_MISS);
  });

  it('also caps a hostile wild mob swinging at a player-owned pet (ownerId set)', () => {
    const mob = ent('mob', 1, true, null);
    const pet = ent('mob', 20, false, 5); // owned pet: kind 'mob' but ownerId !== null
    expect(swingMissChance(mob, pet)).toBe(MOB_VS_PLAYER_MAX_MISS);
  });

  it('does NOT cap a player swinging at a higher-level mob (full scaling kept)', () => {
    const player = ent('player', 1, false, null);
    const mob = ent('mob', 20, true, null);
    expect(swingMissChance(player, mob)).toBe(meleeMissChance(1, 20));
  });

  it('does NOT cap a player-owned pet swinging at a higher-level mob', () => {
    const pet = ent('mob', 1, false, 5); // owned pet, not a hostile wild mob
    const mob = ent('mob', 20, true, null);
    expect(swingMissChance(pet, mob)).toBe(meleeMissChance(1, 20));
  });

  it('is a no-op when the mob is the same/higher level (miss already under the cap)', () => {
    const mob = ent('mob', 20, true, null);
    const player = ent('player', 1, false, null);
    expect(swingMissChance(mob, player)).toBe(meleeMissChance(20, 1));
    expect(meleeMissChance(20, 1)).toBeLessThan(MOB_VS_PLAYER_MAX_MISS);
  });
});
