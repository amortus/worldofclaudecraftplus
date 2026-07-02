import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { hotTickBonus } from '../src/sim/spell_scaling';
import type { Entity, PlayerClass } from '../src/sim/types';

// Healing scales with Spell Power the same way damage does: a direct heal takes the
// cast-time coefficient, a HoT takes the DoT (duration/15) coefficient split across
// its ticks. A HoT that RIDES a direct heal (Regrowth) suppresses the tick rider so
// the pair does not double-dip. This drives the real sim (not just the coeff math in
// spell_scaling.test.ts) to pin the runEffects wiring for the heal/hot cases.
//
// Our fork keeps the cast lifecycle inside the monolithic Sim (no combat/ modules),
// so casts are driven through the public Sim.castAbility + fixed-step tick loop.

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

function makeSim(cls: PlayerClass, level: number, spellPower: number) {
  const sim = new Sim({ seed: 99, playerClass: cls, autoEquip: true }) as AnySim;
  sim.setPlayerLevel(level);
  const p = sim.player as AnyEntity;
  p.resource = p.maxResource;
  // A large HP pool with a deep deficit so nothing overheals and caps the delta.
  p.maxHp = 100000;
  p.hp = 1;
  p.spellPower = spellPower;
  return { sim, p };
}

// Cast the ability and advance the fixed-step sim until the cast resolves. An instant
// heal (Renew) resolves synchronously inside castAbility, so the loop never runs; a
// cast-time heal (Lesser Heal / Regrowth) resolves when the cast bar fills.
function castAndDrain(sim: AnySim, p: AnyEntity, id: string): void {
  sim.castAbility(id, p.id);
  let n = 0;
  while (p.castingAbility && n++ < 1000) sim.tick();
}

function hotAura(p: AnyEntity, id: string): { value: number } {
  const a = p.auras.find((au: any) => au.id === id && au.kind === 'hot');
  if (!a) throw new Error(`no hot aura ${id}`);
  return a;
}

describe('heal Spell Power scaling (runEffects heal/hot wiring)', () => {
  it('a direct heal (Lesser Heal) heals for more with Spell Power', () => {
    // Two identical seeded sims that differ ONLY by Spell Power (which draws no rng),
    // so the heal roll and crit outcome match; the whole delta is the SP rider.
    const zero = makeSim('priest', 12, 0);
    castAndDrain(zero.sim, zero.p, 'lesser_heal');
    const healedZero = zero.p.hp - 1;

    const buffed = makeSim('priest', 12, 300);
    castAndDrain(buffed.sim, buffed.p, 'lesser_heal');
    const healedBuffed = buffed.p.hp - 1;

    expect(healedZero).toBeGreaterThan(0);
    expect(healedBuffed).toBeGreaterThan(healedZero);
  });

  it('a pure HoT (Renew) adds the DoT-coefficient rider to each tick', () => {
    const zero = makeSim('priest', 12, 0);
    castAndDrain(zero.sim, zero.p, 'renew');
    const baseTick = hotAura(zero.p, 'renew').value;

    const buffed = makeSim('priest', 12, 300);
    castAndDrain(buffed.sim, buffed.p, 'renew');
    const buffedTick = hotAura(buffed.p, 'renew').value;

    // Renew is duration 15 / interval 3 at every rank.
    expect(buffedTick - baseTick).toBe(hotTickBonus(300, 15, 3));
    expect(hotTickBonus(300, 15, 3)).toBeGreaterThan(0);
  });

  it('a hybrid heal+HoT (Regrowth) does NOT double-dip: its HoT tick takes no rider', () => {
    const zero = makeSim('druid', 14, 0);
    castAndDrain(zero.sim, zero.p, 'regrowth');
    const baseTick = hotAura(zero.p, 'regrowth').value;

    const buffed = makeSim('druid', 14, 300);
    castAndDrain(buffed.sim, buffed.p, 'regrowth');
    const buffedTick = hotAura(buffed.p, 'regrowth').value;

    // The direct component already took the cast-time coefficient, so the HoT tick is
    // identical with or without Spell Power (the anti-double-dip guard).
    expect(buffedTick).toBe(baseTick);
  });
});
