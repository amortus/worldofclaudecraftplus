import { describe, expect, it } from 'vitest';
import {
  aurasSurvivingDeath,
  CORPSE_REZ_RANGE,
  corpseIsRecoverable,
  corpseRezDenyReason,
  GHOST_RUN_MULT,
  ghostOptions,
  graveyardFor,
  healerRezDenyReason,
  RES_HEALER_HP_FRACTION,
  RES_HP_FRACTION,
  RES_SICKNESS_MAX_SECONDS,
  RES_SICKNESS_MIN_LEVEL,
  RESURRECTION_SICKNESS_ID,
  resurrectionSickness,
  resurrectionSicknessAura,
  SPIRIT_HEALER_RANGE,
} from '../src/sim/spirit';
import { UNSTUCK_SICKNESS_ID } from '../src/sim/unstuck';
import { unstuckGraveyardFor } from '../src/sim/unstuck';
import { RIFT_X, ZONES } from '../src/sim/data';
import type { Aura, Stats } from '../src/sim/types';

const base: Stats = { str: 40, agi: 30, sta: 50, int: 20, spi: 20, armor: 100 };

const aura = (id: string): Aura => ({
  id,
  name: id,
  kind: 'buff_allstats',
  remaining: 10,
  duration: 10,
  value: -1,
  sourceId: 1,
  school: 'shadow',
});

const snapshot = (over: Partial<Parameters<typeof ghostOptions>[0]> = {}) => ({
  dead: true,
  ghost: true,
  pos: { x: 0, y: 0, z: 0 },
  corpsePos: { x: 0, y: 0, z: 0 },
  graveyard: { x: 0, z: 0 },
  ...over,
});

describe('resurrection sickness scaling', () => {
  it('is waived under the minimum level, exactly like Unstuck Sickness', () => {
    expect(resurrectionSickness(RES_SICKNESS_MIN_LEVEL - 1).durationSeconds).toBe(0);
    expect(resurrectionSicknessAura(RES_SICKNESS_MIN_LEVEL - 1, base, 1)).toBeNull();
  });

  it('scales with level and caps at ten minutes', () => {
    const min = resurrectionSickness(RES_SICKNESS_MIN_LEVEL).durationSeconds;
    expect(min).toBeGreaterThan(0);
    expect(resurrectionSickness(RES_SICKNESS_MIN_LEVEL + 1).durationSeconds).toBeGreaterThan(min);
    expect(resurrectionSickness(20).durationSeconds).toBe(RES_SICKNESS_MAX_SECONDS);
    expect(resurrectionSickness(99).durationSeconds).toBe(RES_SICKNESS_MAX_SECONDS);
  });

  it('is strictly harsher than Unstuck Sickness at the cap, so the angel is the worse deal', () => {
    // 10 minutes vs 5: the corpse run must stay the rewarded road back.
    expect(RES_SICKNESS_MAX_SECONDS).toBe(600);
  });

  it('never floors an attribute below 1', () => {
    const thin: Stats = { str: 2, agi: 2, sta: 2, int: 2, spi: 2, armor: 10 };
    const a = resurrectionSicknessAura(20, thin, 7);
    expect(a).not.toBeNull();
    // smallest base attribute is 2, so the drain may only ever be 1.
    expect(a?.value).toBe(-1);
  });

  it('resumes a saved remaining rather than resetting the penalty', () => {
    const a = resurrectionSicknessAura(20, base, 7, 42);
    expect(a?.remaining).toBe(42);
    expect(a?.duration).toBe(RES_SICKNESS_MAX_SECONDS);
    // A saved remaining above the ceiling is clamped, not trusted.
    expect(resurrectionSicknessAura(20, base, 7, 99999)?.remaining).toBe(RES_SICKNESS_MAX_SECONDS);
    // A spent countdown produces no aura at all.
    expect(resurrectionSicknessAura(20, base, 7, 0)).toBeNull();
  });
});

describe('auras that survive death', () => {
  it('keeps both sicknesses and drops everything else', () => {
    const kept = aurasSurvivingDeath([
      aura(RESURRECTION_SICKNESS_ID),
      aura(UNSTUCK_SICKNESS_ID),
      aura('blessing_of_might'),
      aura('poison'),
    ]);
    expect(kept.map((a) => a.id)).toEqual([RESURRECTION_SICKNESS_ID, UNSTUCK_SICKNESS_ID]);
  });
});

describe('graveyard selection', () => {
  it('matches the rule /unstuck already follows, so neither is a shortcut', () => {
    for (const zone of ZONES) {
      const p = { x: (zone.xMin ?? -170) + 5, z: zone.zMin + 5 };
      expect(graveyardFor(p)).toEqual(unstuckGraveyardFor(p));
    }
  });
});

describe('corpse recoverability', () => {
  it('leaves no corpse for a rift death (the instance is torn down behind you)', () => {
    expect(corpseIsRecoverable({ x: RIFT_X, z: 0 })).toBe(false);
  });

  it('leaves a corpse in the open world', () => {
    expect(corpseIsRecoverable({ x: 0, z: 0 })).toBe(true);
  });
});

describe('ghost options', () => {
  it('reports the distance to the body and gates the button on the range', () => {
    const near = ghostOptions(snapshot({ corpsePos: { x: CORPSE_REZ_RANGE - 1, y: 0, z: 0 } }));
    expect(near.corpseDistance).toBeCloseTo(CORPSE_REZ_RANGE - 1);
    expect(near.corpseInRange).toBe(true);
    const far = ghostOptions(snapshot({ corpsePos: { x: CORPSE_REZ_RANGE + 1, y: 0, z: 0 } }));
    expect(far.corpseInRange).toBe(false);
  });

  it('reports no distance at all when the death left no body', () => {
    const o = ghostOptions(snapshot({ corpsePos: null }));
    expect(o.corpseDistance).toBeNull();
    expect(o.corpseInRange).toBe(false);
  });

  it('gates the Spirit Healer on standing at the graveyard', () => {
    expect(ghostOptions(snapshot()).spiritHealerInRange).toBe(true);
    const away = ghostOptions(
      snapshot({ pos: { x: SPIRIT_HEALER_RANGE + 1, y: 0, z: 0 } }),
    );
    expect(away.spiritHealerInRange).toBe(false);
  });
});

describe('server-side resurrection gates', () => {
  it('refuses a corpse rez that is not a ghost, has no corpse, or is out of range', () => {
    expect(corpseRezDenyReason(snapshot({ ghost: false }))).toBe('not_ghost');
    expect(corpseRezDenyReason(snapshot({ dead: false }))).toBe('not_ghost');
    expect(corpseRezDenyReason(snapshot({ corpsePos: null }))).toBe('no_corpse');
    expect(corpseRezDenyReason(snapshot({ pos: { x: 999, y: 0, z: 0 } }))).toBe('corpse_too_far');
    expect(corpseRezDenyReason(snapshot())).toBeNull();
  });

  it('refuses a healer rez away from the graveyard', () => {
    expect(healerRezDenyReason(snapshot({ ghost: false }))).toBe('not_ghost');
    expect(healerRezDenyReason(snapshot({ pos: { x: 999, y: 0, z: 0 } }))).toBe('no_healer');
    expect(healerRezDenyReason(snapshot())).toBeNull();
  });
});

describe('the two roads back are priced differently', () => {
  it('rewards the corpse run and taxes the angel', () => {
    expect(RES_HP_FRACTION).toBeGreaterThan(RES_HEALER_HP_FRACTION);
    expect(GHOST_RUN_MULT).toBeGreaterThan(1);
  });
});
