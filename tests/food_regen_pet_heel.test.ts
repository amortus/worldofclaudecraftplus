// Two regressions in the out-of-combat/companion loop.
//
// 1. Eating SUPPRESSED natural health regen instead of stacking with it. Our
//    food tick is foodHp / CONSUME_TICKS (a few HP per 2s) while natural regen
//    is sta * 0.3 + 2, so sitting down to a meal was several times SLOWER than
//    standing still doing nothing. The mana arm of the same method never had a
//    `!p.drinking` guard, which is the internal proof of the intended shape.
//
// 2. A pet heeled at a FIXED multiple of RUN_SPEED. That was fine until mounts
//    shipped at MOUNT_SPEED_MULT, which puts a mounted owner well past it: the
//    pet fell behind until the last-resort teleport snapped it forward, which
//    reads as the pet rubber-banding. It now heels against the OWNER's
//    effective speed.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ITEMS } from '../src/sim/data';
import { MOUNT_CAST_SECONDS, MOUNT_SPEED_MULT } from '../src/sim/mounts';
import { Sim } from '../src/sim/sim';
import { DT, RUN_SPEED } from '../src/sim/types';

const REGEN_TICK = 40; // updateRegen runs every 40 ticks (the classic 2s tick)

function fed(foodId = 'baked_bread') {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
  const p = sim.player;
  p.inCombat = false;
  p.combatTimer = 999;
  p.hp = 1;
  sim.addItem(foodId, 5, sim.playerId);
  return { sim, foodId };
}

/** HP gained across exactly one regen tick, from a fixed starting point. */
function hpGainOverOneRegenTick(sim: Sim): number {
  // align to the next regen boundary so the window contains exactly one
  while (sim.tickCount % REGEN_TICK !== REGEN_TICK - 1) sim.tick();
  const before = sim.player.hp;
  sim.tick();
  return sim.player.hp - before;
}

describe('food stacks with natural health regen', () => {
  it('the food item under test actually heals', () => {
    expect(ITEMS.baked_bread.foodHp).toBeGreaterThan(0);
  });

  it('eating is never slower than standing still', () => {
    const idle = fed().sim;
    const idleGain = hpGainOverOneRegenTick(idle);

    const { sim, foodId } = fed();
    sim.useItem(foodId, sim.playerId);
    expect(sim.player.eating, 'the player is actually eating').toBeTruthy();
    const eatingGain = hpGainOverOneRegenTick(sim);

    expect(idleGain, 'natural regen must be doing something to compare against').toBeGreaterThan(0);
    expect(
      eatingGain,
      `eating gave ${eatingGain} HP per tick but standing still gave ${idleGain}`,
    ).toBeGreaterThanOrEqual(idleGain);
  });

  it('eating adds the food tick ON TOP of natural regen', () => {
    const idle = fed().sim;
    const idleGain = hpGainOverOneRegenTick(idle);

    const { sim, foodId } = fed();
    sim.useItem(foodId, sim.playerId);
    const eatingGain = hpGainOverOneRegenTick(sim);
    expect(eatingGain).toBeGreaterThan(idleGain);
  });
});

describe('a pet heels against its owner, not against a constant', () => {
  it('the mount multiplier is exactly what the old fixed floor could not cover', () => {
    // Documents why the constant had to go: a mounted owner is faster than the
    // old 1.1 * RUN_SPEED heel floor, so the pet could never close the gap.
    expect(RUN_SPEED * MOUNT_SPEED_MULT).toBeGreaterThan(RUN_SPEED * 1.1);
  });

  it('heels at the owner speed, so a mount cannot outrun the pet', () => {
    // Direct on the rule, because the surrounding chase/leash AI has many other
    // inputs: the heel leg's speed must scale with the OWNER's effective speed.
    // The old form was `max(pet.moveSpeed, RUN_SPEED * 1.1)`, which is constant
    // in the owner and therefore strictly slower than a mounted owner.
    const sim = new Sim({ seed: 42, playerClass: 'warlock', autoEquip: true });
    const owner = sim.player;
    const petSpeed = 5; // a typical pet moveSpeed, well under a mount

    const mult = (sim as any).moveSpeedMult.bind(sim) as (e: unknown) => number;
    const onFoot = mult(owner);
    // Use the REAL mount item and cast, so the speed comes from the shipped
    // aura rather than a hand-rolled one that moveSpeedMult might not read.
    sim.addItem('reins_dawnstrider', 1, sim.playerId);
    sim.useItem('reins_dawnstrider', sim.playerId);
    for (let i = 0; i < Math.ceil(MOUNT_CAST_SECONDS / DT) + 2; i++) sim.tick();
    const mounted = mult(owner);
    expect(mounted, 'the mount aura must actually speed the owner up').toBeGreaterThan(onFoot);

    // The margin is a sim-internal tunable; read it out of the source rather
    // than duplicating the literal, the way tests/traversal_constants.test.ts
    // reads sim.ts. This also pins that the heel leg scales off the OWNER.
    const src = readFileSync(new URL('../src/sim/sim.ts', import.meta.url), 'utf8');
    const margin = /const PET_HEEL_SPEED_MARGIN = ([\d.]+);/.exec(src);
    expect(margin, 'PET_HEEL_SPEED_MARGIN must be a named const, not an inline number').toBeTruthy();
    expect(
      src,
      'the heel leg must scale off the owner, not a fixed multiple of RUN_SPEED',
    ).toContain('RUN_SPEED * this.moveSpeedMult(owner) * PET_HEEL_SPEED_MARGIN');

    const heel = (m: number) => Math.max(petSpeed, RUN_SPEED * m * Number(margin![1]));
    expect(heel(mounted)).toBeGreaterThan(RUN_SPEED * mounted);
    expect(heel(mounted)).toBeGreaterThan(heel(onFoot));
    // the old constant floor, for contrast: it could not keep up
    expect(Math.max(petSpeed, RUN_SPEED * 1.1)).toBeLessThan(RUN_SPEED * mounted);
  });
});
