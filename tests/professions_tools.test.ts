import { describe, expect, it } from 'vitest';
import {
  BARE_HANDS_TOOL_TIER,
  bestOwnedGatherToolTier,
  bestOwnedGatherToolTierOrNone,
  canGatherTier,
  gatherToolTier,
  hasFishingImplement,
  NO_TOOL_OWNED,
  toolsForProfession,
} from '../src/sim/professions';
import type { GatherToolTable } from '../src/sim/professions';

const TOOLS: GatherToolTable = {
  pick1: { itemId: 'pick1', professionId: 'mining', tier: 1 },
  pick3: { itemId: 'pick3', professionId: 'mining', tier: 3 },
  axe2: { itemId: 'axe2', professionId: 'logging', tier: 2 },
  pole1: { itemId: 'pole1', professionId: 'fishing', tier: 1 },
  rod4: { itemId: 'rod4', professionId: 'fishing', tier: 4 },
};

const bag = (...ids: string[]) => ids.map((itemId) => ({ itemId, count: 1 }));

describe('tool tier lookup', () => {
  it('reads the tier for the matching profession only', () => {
    expect(gatherToolTier('pick3', 'mining', TOOLS)).toBe(3);
    expect(gatherToolTier('pick3', 'logging', TOOLS)).toBeUndefined();
    expect(gatherToolTier('nothing', 'mining', TOOLS)).toBeUndefined();
  });
});

describe('the shared tier comparator', () => {
  it('covers its own tier and every tier below, never above', () => {
    expect(canGatherTier(1, 1)).toBe(true);
    expect(canGatherTier(2, 1)).toBe(true);
    expect(canGatherTier(4, 1)).toBe(true);
    expect(canGatherTier(1, 2)).toBe(false);
    expect(canGatherTier(3, 4)).toBe(false);
  });

  it('bare hands (0) cover no node at all', () => {
    expect(canGatherTier(NO_TOOL_OWNED, 1)).toBe(false);
  });
});

describe('best owned tool', () => {
  it('picks the highest matching-profession tier in the bags', () => {
    expect(bestOwnedGatherToolTierOrNone(bag('pick1', 'pick3', 'axe2'), 'mining', TOOLS)).toBe(3);
    expect(bestOwnedGatherToolTierOrNone(bag('pick1', 'pick3', 'axe2'), 'logging', TOOLS)).toBe(2);
  });

  it('reports NO_TOOL_OWNED when nothing matches, so node gating can see it', () => {
    expect(bestOwnedGatherToolTierOrNone(bag('axe2'), 'mining', TOOLS)).toBe(NO_TOOL_OWNED);
    expect(bestOwnedGatherToolTierOrNone([], 'mining', TOOLS)).toBe(NO_TOOL_OWNED);
  });

  it('floors at bare hands only for the improvise-tolerant reader', () => {
    expect(bestOwnedGatherToolTier(bag('axe2'), 'mining', TOOLS)).toBe(BARE_HANDS_TOOL_TIER);
    expect(bestOwnedGatherToolTier(bag('rod4'), 'fishing', TOOLS)).toBe(4);
  });

  it('is unaffected by stack counts (owning the tool is carrying it)', () => {
    expect(bestOwnedGatherToolTierOrNone([{ itemId: 'pick3', count: 9 }], 'mining', TOOLS)).toBe(3);
  });
});

describe('fishing implement', () => {
  it('requires tackle in the bags', () => {
    expect(hasFishingImplement(bag('pole1'), TOOLS)).toBe(true);
    expect(hasFishingImplement(bag('rod4'), TOOLS)).toBe(true);
    expect(hasFishingImplement(bag('pick3'), TOOLS)).toBe(false);
    expect(hasFishingImplement([], TOOLS)).toBe(false);
  });
});

describe('vendor/tooltip listing', () => {
  it('lists a profession’s tools tier-ascending', () => {
    expect(toolsForProfession('fishing', TOOLS).map((t) => t.itemId)).toEqual(['pole1', 'rod4']);
    expect(toolsForProfession('mining', TOOLS).map((t) => t.tier)).toEqual([1, 3]);
    expect(toolsForProfession('herbalism', TOOLS)).toEqual([]);
  });
});
