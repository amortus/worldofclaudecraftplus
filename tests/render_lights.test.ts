import { describe, expect, it } from 'vitest';

import {
  fireFlickerIntensity,
  fireFlickerPhase,
  planPointLightSlots,
  slotContributes,
} from '../src/render/point_light_budget';

// Regression: the forward renderer used to attach
// `Math.min(GFX.maxPointLights, fireLights.length)` point lights, so the count
// FOLLOWED how many fire lights happened to exist. `fireLights` grows at runtime
// (DungeonInteriors mints a torch light per pillar when an interior streams in),
// and on mobile low `GFX.maxPointLights` is 3, so any scene with fewer than 3
// fires (boot before props stream in, sparse zones, a fresh interior) made the
// attached count drift. three.js bakes that count into every lit material's
// shader, so each drift recompiles every lit program in view: a multi-second
// in-world freeze at exactly the zone/instance transitions mobile can least
// afford. The count must be constant; unused slots contribute zero instead.

const MOBILE_LOW_SLOTS = 3;

describe('point-light slot budget', () => {
  it('attaches the same number of lights no matter how many fire lights exist', () => {
    const attached = new Set<number>();
    for (const sourceCount of [0, 1, 2, 3, 4, 7, 12, 64]) {
      attached.add(
        planPointLightSlots({
          slotCount: MOBILE_LOW_SLOTS,
          sourceCount,
          contributingBudget: MOBILE_LOW_SLOTS,
        }).attachedCount,
      );
    }
    // one and only one value, and it is the tier's slot count
    expect([...attached]).toEqual([MOBILE_LOW_SLOTS]);
  });

  it('does not change the attached count when an interior mints torch lights', () => {
    // boot / sparse zone: fewer campfires in range than the tier has slots
    const boot = planPointLightSlots({
      slotCount: MOBILE_LOW_SLOTS,
      sourceCount: 1,
      contributingBudget: MOBILE_LOW_SLOTS,
    });
    // DungeonInteriors.buildInterior pushed a pillar torch light per pillar
    const afterInterior = planPointLightSlots({
      slotCount: MOBILE_LOW_SLOTS,
      sourceCount: 41,
      contributingBudget: MOBILE_LOW_SLOTS,
    });
    expect(afterInterior.attachedCount).toBe(boot.attachedCount);
    expect(boot.attachedCount).toBe(MOBILE_LOW_SLOTS);
  });

  it('keeps the count constant on desktop tiers too, including an empty world', () => {
    const empty = planPointLightSlots({ slotCount: 6, sourceCount: 0, contributingBudget: 6 });
    const busy = planPointLightSlots({ slotCount: 6, sourceCount: 200, contributingBudget: 6 });
    expect(empty.attachedCount).toBe(6);
    expect(busy.attachedCount).toBe(6);
  });

  it('fills only as many slots as there are sources, and sorts only when contended', () => {
    const sparse = planPointLightSlots({ slotCount: 3, sourceCount: 2, contributingBudget: 3 });
    expect(sparse.filledSlots).toBe(2);
    expect(sparse.needsSort).toBe(false);
    const contended = planPointLightSlots({ slotCount: 3, sourceCount: 9, contributingBudget: 3 });
    expect(contended.filledSlots).toBe(3);
    expect(contended.needsSort).toBe(true);
  });

  it('lets the governor throttle contribution without changing the attached count', () => {
    const throttled = planPointLightSlots({ slotCount: 6, sourceCount: 20, contributingBudget: 2 });
    expect(throttled.attachedCount).toBe(6);
    expect(throttled.filledSlots).toBe(6);
    expect(throttled.contributingSlots).toBe(2);
  });

  it('treats a non-finite governor budget as the full slot count', () => {
    const plan = planPointLightSlots({ slotCount: 4, sourceCount: 4, contributingBudget: NaN });
    expect(plan.contributingSlots).toBe(4);
  });

  it('zeroes empty slots, out-of-range sources and slots past the budget', () => {
    const rangeSq = 55 * 55;
    const plan = planPointLightSlots({ slotCount: 3, sourceCount: 2, contributingBudget: 3 });
    expect(slotContributes(0, 10 * 10, plan, rangeSq)).toBe(true);
    // in a filled slot but past the falloff range
    expect(slotContributes(1, 80 * 80, plan, rangeSq)).toBe(false);
    // slot 2 has no source at all: attached, but dark
    expect(slotContributes(2, 0, plan, rangeSq)).toBe(false);

    const throttled = planPointLightSlots({ slotCount: 3, sourceCount: 3, contributingBudget: 1 });
    expect(slotContributes(0, 4, throttled, rangeSq)).toBe(true);
    expect(slotContributes(1, 4, throttled, rangeSq)).toBe(false);
  });

  it('flickers around the base intensity with a source-stable phase', () => {
    const base = 11;
    const phase = fireFlickerPhase(3);
    expect(phase).toBeCloseTo(5.1, 6);
    // amplitude is 2.5 at base 11, and scales with the base
    for (const t of [0, 0.37, 1.9, 12.25]) {
      expect(Math.abs(fireFlickerIntensity(base, phase, t) - base)).toBeLessThanOrEqual(2.5001);
      expect(Math.abs(fireFlickerIntensity(22, phase, t) - 22)).toBeLessThanOrEqual(5.0001);
    }
    // same source index always gets the same phase, so a re-sorted ranking does
    // not make a light jump brightness
    expect(fireFlickerIntensity(11, fireFlickerPhase(3), 2)).toBe(
      fireFlickerIntensity(11, fireFlickerPhase(3), 2),
    );
    expect(fireFlickerIntensity(11, fireFlickerPhase(3), 2)).not.toBe(
      fireFlickerIntensity(11, fireFlickerPhase(4), 2),
    );
  });
});
