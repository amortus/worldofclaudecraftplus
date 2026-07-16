// Tank defensive cooldowns: Ironhold (warrior, flat mitigation wall) and Primal
// Reflexes (druid, dodge, castable in Bear Form).
//
// Deliberately NOT ported: the paladin's Sacred Bulwark. It is a cheat-death that has to
// intercept damage at the lethal point, which in our inline dealDamage means finding and
// guarding every death-adjacent path by hand (a missed one is an immortality bug), and a
// free reset per pull would change how Claudeholme is tuned. See the commit message.

import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import { Sim } from '../src/sim/sim';

const makeSim = (cls: 'warrior' | 'druid') =>
  new Sim({ seed: 42, playerClass: cls, autoEquip: true });

/**
 * Damage a player takes from a fixed hit, with whatever auras they currently have.
 * Heals to full first and uses a hit the player survives: damage is clamped at the
 * health pool, so a lethal hit would report the pool size instead of the mitigation.
 * (Faking maxHp does not work either, recalcPlayerStats restores it on the next tick.)
 */
const TEST_HIT = 100;
function hitFor(sim: Sim, raw = TEST_HIT): number {
  const p = sim.player;
  p.hp = p.maxHp;
  const before = p.hp;
  (sim as any).dealDamage(null, p, raw, 'physical');
  return before - p.hp;
}

describe('Ironhold (warrior)', () => {
  it('is a level-20 off-gcd warrior ability in the class kit', () => {
    const def = ABILITIES.ironhold;
    expect(def).toBeTruthy();
    expect(def.class).toBe('warrior');
    expect(def.learnLevel).toBe(20);
    expect(def.offGcd).toBe(true); // a defensive you can fire while globals are rolling
  });

  it('denies 40% of incoming damage while up', () => {
    const sim = makeSim('warrior');
    sim.setPlayerLevel(20);
    const p = sim.player;
    p.resource = 100; // rage starts at 0 out of combat, and Ironhold costs 10

    const plain = hitFor(sim);
    sim.castAbility('ironhold');
    expect(p.auras.some((a) => a.kind === 'shield_wall')).toBe(true);
    const warded = hitFor(sim);

    expect(plain).toBe(TEST_HIT);
    expect(warded).toBe(60); // 40% denied
  });

  it('expires, and damage returns to full', () => {
    const sim = makeSim('warrior');
    sim.setPlayerLevel(20);
    const p = sim.player;
    p.resource = 100;
    sim.castAbility('ironhold');
    for (let i = 0; i < 20 * 9; i++) sim.tick(); // duration is 8s

    expect(p.auras.some((a) => a.kind === 'shield_wall')).toBe(false);
    expect(hitFor(sim)).toBe(TEST_HIT);
  });

  it('walls do not stack: the strongest one wins', () => {
    const sim = makeSim('warrior');
    sim.setPlayerLevel(20);
    const p = sim.player;
    // Two walls at once would multiply to 0.6*0.7 = 42% taken if they stacked, which is
    // how a pile of defensives trends toward immunity. Only the strongest may apply.
    p.auras.push({ id: 'a', name: 'A', kind: 'shield_wall', remaining: 9, duration: 9, value: 0.4 } as any);
    p.auras.push({ id: 'b', name: 'B', kind: 'shield_wall', remaining: 9, duration: 9, value: 0.3 } as any);

    expect(hitFor(sim)).toBe(60); // 1 - 0.4, not 1 - 0.4 - 0.3 and not 0.6*0.7
  });
});

describe('Primal Reflexes (druid)', () => {
  it('is a level-20 druid ability flagged usable in form', () => {
    const def = ABILITIES.primal_reflexes;
    expect(def).toBeTruthy();
    expect(def.class).toBe('druid');
    expect(def.learnLevel).toBe(20);
    expect(def.usableInForm).toBe(true);
  });

  it('grants dodge and folds it into the entity stat', () => {
    const sim = makeSim('druid');
    sim.setPlayerLevel(20);
    const p = sim.player;
    const before = p.dodgeChance;

    sim.castAbility('primal_reflexes');

    expect(p.auras.some((a) => a.kind === 'buff_dodge')).toBe(true);
    expect(p.dodgeChance).toBeGreaterThan(before); // recalcPlayerStats folded buff_dodge in
  });

  it('can be cast in Bear Form, which is the form it defends', () => {
    const sim = makeSim('druid');
    sim.setPlayerLevel(20);
    const p = sim.player;
    sim.castAbility('bear_form');
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);

    sim.events = [];
    sim.castAbility('primal_reflexes');

    expect(p.auras.some((a) => a.kind === 'buff_dodge')).toBe(true);
    expect(sim.events.some((e) => e.type === 'error')).toBe(false); // not "shapeshifted"
  });

  it('still locks the caster kit out of forms (usableInForm is opt-in)', () => {
    const sim = makeSim('druid');
    sim.setPlayerLevel(20);
    const p = sim.player;
    sim.castAbility('bear_form');
    // bear_form leaves the global rolling, and the gcd check sits BEFORE the form gate
    // and returns silently, so drain it or this asserts the wrong rejection.
    for (let i = 0; i < 20 * 2; i++) sim.tick();
    sim.events = [];

    sim.castAbility('wrath'); // a caster spell, no usableInForm

    expect(p.castingAbility).toBeNull();
    expect(sim.events.some((e) => e.type === 'error')).toBe(true);
  });
});
