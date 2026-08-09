// Fiesta augments must deliver what their own description promises.
//
// `aug_avatar` ("Avatar of War") read "+25% all damage" but granted only
// meleeDmgPct, so a hybrid's spell damage got nothing. `aug_overdrive`, two
// lines above it, already granted both, which is the internal proof that "all
// damage" means both axes here.
//
// Written as a rule over the whole table rather than a pin on one augment, so a
// new "+N% all damage" augment cannot ship half-wired.

import { describe, expect, it } from 'vitest';

import { AUGMENTS, AUGMENTS_BY_ID } from '../src/sim/content/augments';

const ALL_DAMAGE = /\+(\d+)% all damage/i;
const SPELL_DAMAGE = /\+(\d+)% spell damage/i;
const PHYSICAL_DAMAGE = /\+(\d+)% physical damage/i;

describe('augment descriptions match their effects', () => {
  it('aug_avatar grants both damage axes for its "all damage" line', () => {
    const a = AUGMENTS_BY_ID.aug_avatar;
    expect(a.description).toMatch(ALL_DAMAGE);
    expect(a.effect.global?.meleeDmgPct).toBe(0.25);
    expect(a.effect.global?.spellDmgPct).toBe(0.25);
  });

  it('aug_overdrive is the shape the rule is derived from', () => {
    const a = AUGMENTS_BY_ID.aug_overdrive;
    expect(a.effect.global?.meleeDmgPct).toBe(a.effect.global?.spellDmgPct);
  });

  for (const a of AUGMENTS) {
    const all = ALL_DAMAGE.exec(a.description);
    if (!all) continue;
    it(`${a.id}: "${all[0]}" grants melee AND spell`, () => {
      const pct = Number(all[1]) / 100;
      expect(a.effect.global?.meleeDmgPct, `${a.id} melee`).toBe(pct);
      expect(a.effect.global?.spellDmgPct, `${a.id} spell`).toBe(pct);
    });
  }

  // The single-axis lines must stay single-axis, or the fix above would have
  // been a blanket buff rather than a correction.
  for (const a of AUGMENTS) {
    if (ALL_DAMAGE.test(a.description)) continue;
    const spell = SPELL_DAMAGE.exec(a.description);
    if (spell) {
      it(`${a.id}: "${spell[0]}" is spell only`, () => {
        expect(a.effect.global?.spellDmgPct).toBe(Number(spell[1]) / 100);
        expect(a.effect.global?.meleeDmgPct).toBeUndefined();
      });
    }
    const phys = PHYSICAL_DAMAGE.exec(a.description);
    if (phys) {
      it(`${a.id}: "${phys[0]}" is physical only`, () => {
        expect(a.effect.global?.meleeDmgPct).toBe(Number(phys[1]) / 100);
        expect(a.effect.global?.spellDmgPct).toBeUndefined();
      });
    }
  }
});
