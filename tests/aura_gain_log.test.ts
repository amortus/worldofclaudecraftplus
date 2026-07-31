import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Aura, AuraKind } from '../src/sim/types';
import { auraGainLogKeyFor, findAuraForGainEvent, isDebuffAura } from '../src/ui/aura_gain_log';
import { t } from '../src/ui/i18n';

const aura = (kind: AuraKind, value = 0): Pick<Aura, 'kind' | 'value'> => ({ kind, value });

describe('isDebuffAura', () => {
  it('calls the named harmful kinds debuffs regardless of value', () => {
    for (const kind of ['dot', 'stun', 'silence', 'mortal_wound', 'critvuln'] as AuraKind[])
      expect(isDebuffAura(kind, 0), kind).toBe(true);
  });

  it('calls stat buffs, HoTs, shields, imbues, forms and stealth beneficial', () => {
    for (const kind of [
      'buff_ap',
      'buff_armor',
      'buff_allstats',
      'hot',
      'absorb',
      'imbue',
      'thorns',
      'form_bear',
      'form_cat',
      'stealth',
      'defensive_stance',
      'righteous_fury',
    ] as AuraKind[])
      expect(isDebuffAura(kind, 10), kind).toBe(false);
  });

  it('treats a NEGATIVE-value buff_* aura as a debuff (a drain reusing a buff kind)', () => {
    // A mob's Withering Wail sapping attack power, or an Intellect-draining curse.
    expect(isDebuffAura('buff_ap', -12)).toBe(true);
    expect(isDebuffAura('buff_int', -8)).toBe(true);
    expect(isDebuffAura('buff_ap', 12)).toBe(false);
    // Zero is not negative: an inert stat aura is not silently reclassified.
    expect(isDebuffAura('buff_ap', 0)).toBe(false);
  });
});

// The sim keeps its OWN harmful set for /targetbuffs tagging (src/sim must not import
// src/ui). It is narrower on purpose, but it must never claim a kind is harmful that
// this module calls beneficial, or the same aura would read two ways in one client.
describe('the client classifier is a superset of the sim harmful set', () => {
  it('every kind in sim.ts HARMFUL_AURA_KINDS is a debuff here too', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/sim/sim.ts', import.meta.url)), 'utf8');
    const block = /const HARMFUL_AURA_KINDS[^[]*\[([\s\S]*?)\]\);/.exec(src);
    expect(block, 'HARMFUL_AURA_KINDS block not found in sim.ts').not.toBeNull();
    const kinds = [...(block?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as AuraKind);
    expect(kinds.length).toBeGreaterThan(5);
    for (const kind of kinds) expect(isDebuffAura(kind, 0), kind).toBe(true);
  });
});

describe('auraGainLogKeyFor', () => {
  it('says "is afflicted by" for a harmful aura', () => {
    expect(auraGainLogKeyFor(aura('dot', 12))).toBe('hud.combat.auraAfflicted');
    expect(auraGainLogKeyFor(aura('polymorph'))).toBe('hud.combat.auraAfflicted');
    expect(auraGainLogKeyFor(aura('buff_ap', -12))).toBe('hud.combat.auraAfflicted');
  });

  it('says "gains" for a beneficial aura instead of calling it an affliction', () => {
    // The bug this closes: every non-player aura GAIN was logged as an affliction,
    // so an ally picking up a shield or a mob buffing itself read as a debuff.
    expect(auraGainLogKeyFor(aura('buff_ap', 30))).toBe('hudChrome.combat.auraGainOther');
    expect(auraGainLogKeyFor(aura('hot', 8))).toBe('hudChrome.combat.auraGainOther');
    expect(auraGainLogKeyFor(aura('absorb', 200))).toBe('hudChrome.combat.auraGainOther');
    expect(auraGainLogKeyFor(aura('form_bear'))).toBe('hudChrome.combat.auraGainOther');
  });

  it('returns keys the i18n catalog actually tracks', () => {
    // t() throws on an untracked key in dev/test, so this proves both arms render.
    for (const matched of [aura('dot', 5), aura('hot', 5), undefined])
      expect(t(auraGainLogKeyFor(matched), { target: 'Aki', name: 'Rend' })).toContain('Aki');
  });

  it('reads a gain it cannot resolve as neutral rather than assuming harm', () => {
    // The aura expired before the event drained, or the online mirror has not
    // echoed it yet: "gains" is the safe sentence, "is afflicted by" is a claim.
    expect(auraGainLogKeyFor(undefined)).toBe('hudChrome.combat.auraGainOther');
  });
});

describe('findAuraForGainEvent', () => {
  const auras = [
    { name: 'Rend', kind: 'dot' as AuraKind, value: 5 },
    { name: 'Battle Shout', kind: 'buff_ap' as AuraKind, value: 30 },
  ];

  it('finds the live aura the event names', () => {
    expect(findAuraForGainEvent(auras, 'Battle Shout')?.kind).toBe('buff_ap');
  });

  it('returns undefined for a name no live aura carries', () => {
    expect(findAuraForGainEvent(auras, 'Corruption')).toBeUndefined();
    expect(findAuraForGainEvent([], 'Rend')).toBeUndefined();
  });

  it('feeds auraGainLogKeyFor end to end: a buff gain is not an affliction', () => {
    expect(auraGainLogKeyFor(findAuraForGainEvent(auras, 'Battle Shout'))).toBe(
      'hudChrome.combat.auraGainOther',
    );
    expect(auraGainLogKeyFor(findAuraForGainEvent(auras, 'Rend'))).toBe('hud.combat.auraAfflicted');
  });
});
