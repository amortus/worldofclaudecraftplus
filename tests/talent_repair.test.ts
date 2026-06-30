import { describe, expect, it } from 'vitest';
import {
  repairAllocation,
  type TalentAllocation,
  talentPointsAtLevel,
  talentsFor,
  validateAllocation,
} from '../src/sim/content/talents';
import type { PlayerClass } from '../src/sim/types';

// #4: a persisted talent build replays verbatim on load and is fed straight to
// computeTalentModifiers, so without load-time revalidation a stale / level-downed /
// tampered save could grant over-budget or gated talents. repairAllocation rebuilds the
// allocation top-down and clamps to the level budget; an honest in-budget build is the
// identity.
const cls: PlayerClass = 'warrior';
const ct = talentsFor(cls)!;
// A row-0 class-tree rank node has no prereqs and no points-gate, so 1 rank is always
// valid at >= 1 budget. (Gates/prereqs only reference rows above, of which row 0 has none.)
const rootNode = ct.nodes.find(
  (n) => n.tree === 'class' && n.row === 0 && n.kind !== 'choice' && !n.requires?.length,
)!;

describe('repairAllocation (talent load revalidation)', () => {
  it('found a usable root node to drive the fixtures', () => {
    expect(rootNode).toBeTruthy();
    expect(rootNode.maxRank).toBeGreaterThanOrEqual(1);
  });

  it('is the identity on an honest, in-budget build', () => {
    const points = talentPointsAtLevel(20);
    const build: TalentAllocation = { spec: null, ranks: { [rootNode.id]: 1 }, choices: {} };
    expect(validateAllocation(cls, build, points).ok).toBe(true);
    expect(repairAllocation(cls, build, points)).toEqual(build);
  });

  it('clamps an over-budget (tampered) build to ZERO budget down to empty', () => {
    const tampered: TalentAllocation = {
      spec: null,
      ranks: { [rootNode.id]: rootNode.maxRank },
      choices: {},
    };
    const repaired = repairAllocation(cls, tampered, 0);
    expect(validateAllocation(cls, repaired, 0).ok).toBe(true);
    expect(Object.keys(repaired.ranks).length).toBe(0);
  });

  it('partially clamps ranks that exceed the budget to the budget', () => {
    if (rootNode.maxRank >= 2) {
      const over: TalentAllocation = {
        spec: null,
        ranks: { [rootNode.id]: rootNode.maxRank },
        choices: {},
      };
      const repaired = repairAllocation(cls, over, 2);
      expect(validateAllocation(cls, repaired, 2).ok).toBe(true);
      expect(repaired.ranks[rootNode.id]).toBe(Math.min(2, rootNode.maxRank));
    }
  });

  it('drops the spec (and its illegal grants) when no points are available', () => {
    const spec = ct.specs[0]?.id ?? null;
    const build: TalentAllocation = { spec, ranks: { [rootNode.id]: 1 }, choices: {} };
    const repaired = repairAllocation(cls, build, 0);
    expect(repaired.spec).toBeNull();
    expect(Object.keys(repaired.ranks).length).toBe(0);
  });
});
