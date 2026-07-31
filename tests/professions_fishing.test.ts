import { describe, expect, it } from 'vitest';
import {
  biteDelayMaxSec,
  biteScheduleTicks,
  effectiveFishingBand,
  FISH_BITE_DELAY_MAX_SEC,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_REEL_WINDOW_SEC,
  FISHING_GAIN_TIER_STEP,
  type FishingCatchAttempt,
  fishingBandFor,
  fishingCapabilityTier,
  fishingCatchGain,
  fishingWaterGainMultiplier,
  reelWindowSec,
  resolveFishingCatch,
  resolveReel,
  resolveReelTick,
  rollBiteSchedule,
  rollCatch,
} from '../src/sim/professions';
import type { BiteSchedule, FishingBandTables } from '../src/sim/professions';
import { Rng } from '../src/sim/rng';

const MAX = 200;
const DT = 1 / 20;

const TABLES: FishingBandTables = [
  [
    { itemId: 'fish_a', weight: 40 },
    { itemId: 'junk_a', weight: 40 },
    { itemId: null, weight: 20 },
  ],
  [
    { itemId: 'fish_a', weight: 70 },
    { itemId: 'junk_a', weight: 20 },
    { itemId: null, weight: 10 },
  ],
  [
    { itemId: 'fish_a', weight: 90 },
    { itemId: 'junk_a', weight: 8 },
    { itemId: null, weight: 2 },
  ],
];

const attempt = (over: Partial<FishingCatchAttempt> = {}): FishingCatchAttempt => ({
  tables: TABLES,
  waterTier: 1,
  proficiency: 0,
  maxSkill: MAX,
  rodTier: 1,
  isJunk: (id) => id === 'junk_a',
  ...over,
});

describe('bite delay', () => {
  it('spans 3 to 8 seconds on a tier-1 rod', () => {
    expect(biteDelayMaxSec(1)).toBe(FISH_BITE_DELAY_MAX_SEC);
    const rng = new Rng(2);
    for (let i = 0; i < 500; i++) {
      const s = rollBiteSchedule(1, rng);
      expect(s.biteAtSec).toBeGreaterThanOrEqual(FISH_BITE_DELAY_MIN_SEC);
      expect(s.biteAtSec).toBeLessThanOrEqual(FISH_BITE_DELAY_MAX_SEC);
    }
  });

  it('a better rod pulls the max down and never moves the min', () => {
    expect(biteDelayMaxSec(2)).toBe(6.5);
    expect(biteDelayMaxSec(3)).toBe(5);
    expect(biteDelayMaxSec(4)).toBe(3.5);
    expect(biteDelayMaxSec(99)).toBe(FISH_BITE_DELAY_MIN_SEC); // never inverts
  });

  it('uses exactly one draw', () => {
    const a = new Rng(13);
    const b = new Rng(13);
    rollBiteSchedule(3, a);
    b.next();
    expect(a.next()).toBe(b.next());
  });
});

describe('reel window', () => {
  it('is 3 s on a plain pole and widens 0.75 s per rod tier', () => {
    expect(reelWindowSec(1)).toBe(FISH_REEL_WINDOW_SEC);
    expect(reelWindowSec(2)).toBe(3.75);
    expect(reelWindowSec(3)).toBe(4.5);
    expect(reelWindowSec(4)).toBe(5.25);
  });

  it('is monotone in rod tier: a better rod is never a worse rod', () => {
    for (let t = 1; t < 6; t++) {
      expect(reelWindowSec(t + 1)).toBeGreaterThan(reelWindowSec(t));
    }
  });
});

describe('reeling', () => {
  const s: BiteSchedule = { biteAtSec: 5, reelDeadlineSec: 8 };

  it('is too early before the bite', () => {
    expect(resolveReel(s, 0)).toBe('too_early');
    expect(resolveReel(s, 4.99)).toBe('too_early');
  });

  it('lands inside the window, both boundaries inclusive', () => {
    expect(resolveReel(s, 5)).toBe('landed');
    expect(resolveReel(s, 6.5)).toBe('landed');
    expect(resolveReel(s, 8)).toBe('landed');
  });

  it('is too late past the deadline: the fish gets away', () => {
    expect(resolveReel(s, 8.01)).toBe('too_late');
    expect(resolveReel(s, 30)).toBe('too_late');
  });

  it('a wider rod window rescues a reel that a plain pole would have missed', () => {
    const bite = 5;
    const plain: BiteSchedule = { biteAtSec: bite, reelDeadlineSec: bite + reelWindowSec(1) };
    const good: BiteSchedule = { biteAtSec: bite, reelDeadlineSec: bite + reelWindowSec(4) };
    expect(resolveReel(plain, 9.5)).toBe('too_late');
    expect(resolveReel(good, 9.5)).toBe('landed');
  });

  it('resolves identically on the tick clock', () => {
    const t = biteScheduleTicks(s, 100, DT);
    expect(t.biteAtTick).toBe(200);
    expect(t.reelDeadlineTick).toBe(260);
    expect(resolveReelTick(t.biteAtTick, t.reelDeadlineTick, 199)).toBe('too_early');
    expect(resolveReelTick(t.biteAtTick, t.reelDeadlineTick, 200)).toBe('landed');
    expect(resolveReelTick(t.biteAtTick, t.reelDeadlineTick, 260)).toBe('landed');
    expect(resolveReelTick(t.biteAtTick, t.reelDeadlineTick, 261)).toBe('too_late');
  });
});

describe('catch bands', () => {
  it('splits fishing’s 200 ceiling into thirds', () => {
    expect(fishingBandFor(0, MAX)).toBe(0);
    expect(fishingBandFor(65, MAX)).toBe(0);
    expect(fishingBandFor(66, MAX)).toBe(1);
    expect(fishingBandFor(132, MAX)).toBe(1);
    expect(fishingBandFor(133, MAX)).toBe(2);
    expect(fishingBandFor(200, MAX)).toBe(2);
  });

  it('gives the node professions a real ladder too, at their own 100 ceiling', () => {
    expect(fishingBandFor(32, 100)).toBe(0);
    expect(fishingBandFor(33, 100)).toBe(1);
    expect(fishingBandFor(66, 100)).toBe(2);
  });

  it('caps the band at what the rod covers, silently', () => {
    expect(effectiveFishingBand(200, 1, MAX)).toBe(0); // maxed angler, plain pole
    expect(effectiveFishingBand(200, 2, MAX)).toBe(1);
    expect(effectiveFishingBand(200, 3, MAX)).toBe(2);
    expect(effectiveFishingBand(200, 4, MAX)).toBe(2); // never past band 2
    expect(effectiveFishingBand(0, 4, MAX)).toBe(0); // great rod, no skill
  });
});

describe('catch roll', () => {
  it('uses exactly one draw', () => {
    const a = new Rng(31);
    const b = new Rng(31);
    rollCatch(TABLES[0], a);
    b.next();
    expect(a.next()).toBe(b.next());
  });

  it('returns null for the empty-hook row', () => {
    const rng = new Rng(6);
    const seen = new Set<string | null>();
    for (let i = 0; i < 400; i++) seen.add(rollCatch(TABLES[0], rng));
    expect(seen.has(null)).toBe(true);
    expect(seen.has('fish_a')).toBe(true);
  });

  it('a higher band shifts weight out of junk and into fish', () => {
    const fishShare = (band: 0 | 1 | 2) => {
      const rng = new Rng(77);
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (rollCatch(TABLES[band], rng) === 'fish_a') hits++;
      return hits / 20000;
    };
    expect(fishShare(1)).toBeGreaterThan(fishShare(0));
    expect(fishShare(2)).toBeGreaterThan(fishShare(1));
  });
});

describe('fishing proficiency gain', () => {
  it('rides the same four-state curve, one rung per zone', () => {
    expect(FISHING_GAIN_TIER_STEP).toBe(50);
    expect(fishingCapabilityTier(49)).toBe(0);
    expect(fishingCapabilityTier(50)).toBe(1);
    expect(fishingCapabilityTier(200)).toBe(4);
  });

  it.each([
    [0, 1],
    [49, 1],
    [50, 0.5],
    [99, 0.5],
    [100, 0.25],
    [149, 0.25],
    [150, 0],
    [199, 0],
  ])('proficiency %i in tier-1 water gains %d', (prof, mult) => {
    expect(fishingWaterGainMultiplier(prof, 1)).toBe(mult);
  });

  it('endgame water still pays full at a proficiency that grays the starter lake', () => {
    expect(fishingWaterGainMultiplier(150, 1)).toBe(0);
    expect(fishingWaterGainMultiplier(150, 4)).toBe(1);
  });

  it('junk teaches nothing once band 0 is outgrown', () => {
    expect(fishingCatchGain(10, 1, true, MAX)).toBe(1);
    expect(fishingCatchGain(66, 4, true, MAX)).toBe(0);
    expect(fishingCatchGain(66, 4, false, MAX)).toBe(1);
  });

  it('clamps at the 200 ceiling', () => {
    expect(fishingCatchGain(200, 4, false, MAX)).toBe(0);
    expect(fishingCatchGain(199.5, 4, false, MAX)).toBeCloseTo(0.5, 10);
  });
});

describe('resolveFishingCatch', () => {
  it('lands a catch, the band it used, and the proficiency delta', () => {
    const r = resolveFishingCatch(attempt(), new Rng(9));
    expect(r.band).toBe(0);
    expect(r.nextProficiency).toBe(r.itemId === null ? 0 : r.skillGain);
  });

  it('grants nothing on an empty hook', () => {
    const emptyOnly: FishingBandTables = [
      [{ itemId: null, weight: 1 }],
      [{ itemId: null, weight: 1 }],
      [{ itemId: null, weight: 1 }],
    ];
    const r = resolveFishingCatch(attempt({ tables: emptyOnly }), new Rng(1));
    expect(r.itemId).toBeNull();
    expect(r.skillGain).toBe(0);
  });

  it('uses exactly one draw whatever the band', () => {
    const a = new Rng(41);
    const b = new Rng(41);
    resolveFishingCatch(attempt({ proficiency: 0, rodTier: 1 }), a);
    resolveFishingCatch(attempt({ proficiency: 199, rodTier: 4 }), b);
    expect(a.next()).toBe(b.next());
  });

  it('is deterministic: the same seed gives the same catches', () => {
    const run = () => {
      const rng = new Rng(4242);
      const out: string[] = [];
      let prof = 0;
      for (let i = 0; i < 300; i++) {
        const r = resolveFishingCatch(attempt({ proficiency: prof, rodTier: 3, waterTier: 3 }), rng);
        prof = r.nextProficiency;
        out.push(`${r.itemId}:${r.band}:${prof}`);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('two different seeds do diverge', () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from({ length: 100 }, () => resolveFishingCatch(attempt(), rng).itemId).join(',');
    };
    expect(run(1)).not.toEqual(run(2));
  });
});
