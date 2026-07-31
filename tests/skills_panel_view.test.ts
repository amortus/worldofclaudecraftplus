import { describe, expect, it } from 'vitest';
import {
  buildSkillsPanelView,
  capabilityTierForProfession,
  GATHER_CONTENT_TIERS,
  gatherRequirementView,
  MASTERY_STATE_COLOR,
  masteryStateForContent,
  PROFESSION_TIER_STEP,
} from '../src/ui/skills_panel_view';
import type { GatheringProficiency, GatheringProfessionId } from '../src/sim/professions';
import { GATHERING_MAX_SKILL } from '../src/sim/content/professions';

const CAPS = GATHERING_MAX_SKILL;

function prof(partial: Partial<GatheringProficiency> = {}): GatheringProficiency {
  return { mining: 0, logging: 0, herbalism: 0, fishing: 0, ...partial };
}

function row(view: ReturnType<typeof buildSkillsPanelView>, id: GatheringProfessionId) {
  return view.rows.find((r) => r.professionId === id)!;
}

describe('caps and progress maths', () => {
  it('carries the shipped ceilings: 100 for the node professions, 200 for fishing', () => {
    const view = buildSkillsPanelView(prof(), CAPS);
    expect(view.rows.map((r) => [r.professionId, r.maxSkill])).toEqual([
      ['mining', 100],
      ['logging', 100],
      ['herbalism', 100],
      ['fishing', 200],
    ]);
    expect(view.totalMaxSkill).toBe(500);
  });

  it('turns proficiency into a fraction and a whole percent of the profession OWN cap', () => {
    const view = buildSkillsPanelView(prof({ mining: 25, fishing: 25 }), CAPS);
    // The same 25 points is a quarter of mining and an eighth of fishing.
    expect(row(view, 'mining').fraction).toBeCloseTo(0.25, 10);
    expect(row(view, 'mining').percent).toBe(25);
    expect(row(view, 'fishing').fraction).toBeCloseTo(0.125, 10);
    expect(row(view, 'fishing').percent).toBe(13); // rounded, so a bar never reads 12.5
  });

  it('clamps a negative or over-cap proficiency instead of overfilling the bar', () => {
    const view = buildSkillsPanelView(prof({ mining: -40, herbalism: 9999 }), CAPS);
    expect(row(view, 'mining').skill).toBe(0);
    expect(row(view, 'mining').percent).toBe(0);
    expect(row(view, 'herbalism').skill).toBe(100);
    expect(row(view, 'herbalism').percent).toBe(100);
    expect(row(view, 'herbalism').capped).toBe(true);
  });

  it('flags capped only at the ceiling', () => {
    expect(row(buildSkillsPanelView(prof({ mining: 99 }), CAPS), 'mining').capped).toBe(false);
    expect(row(buildSkillsPanelView(prof({ mining: 100 }), CAPS), 'mining').capped).toBe(true);
    expect(row(buildSkillsPanelView(prof({ fishing: 199 }), CAPS), 'fishing').capped).toBe(false);
    expect(row(buildSkillsPanelView(prof({ fishing: 200 }), CAPS), 'fishing').capped).toBe(true);
  });

  it('totals proficiency across all four professions', () => {
    const view = buildSkillsPanelView(prof({ mining: 10, logging: 20, fishing: 30 }), CAPS);
    expect(view.totalSkill).toBe(60);
  });
});

describe('capability tiers and the next-tier countdown', () => {
  it('steps the node professions every 25 points and fishing every 50', () => {
    expect(PROFESSION_TIER_STEP.mining).toBe(25);
    expect(PROFESSION_TIER_STEP.fishing).toBe(50);
    expect(capabilityTierForProfession('mining', 74)).toBe(2);
    expect(capabilityTierForProfession('mining', 75)).toBe(3);
    expect(capabilityTierForProfession('fishing', 99)).toBe(1);
    expect(capabilityTierForProfession('fishing', 100)).toBe(2);
  });

  it('reports the points left to the next capability tier, and null once it is past the cap', () => {
    expect(row(buildSkillsPanelView(prof({ mining: 10 }), CAPS), 'mining').pointsToNextTier).toBe(15);
    // Tier 4 lands exactly on mining's ceiling, so it is still a reachable rung.
    expect(row(buildSkillsPanelView(prof({ mining: 90 }), CAPS), 'mining').pointsToNextTier).toBe(10);
    // At the cap the next rung would be 125, past the ceiling: nothing left to count down.
    expect(row(buildSkillsPanelView(prof({ mining: 100 }), CAPS), 'mining').pointsToNextTier).toBe(null);
    expect(row(buildSkillsPanelView(prof({ fishing: 200 }), CAPS), 'fishing').pointsToNextTier).toBe(null);
  });

  it('selects the 0/1/2 proficiency band on thirds of the profession own ceiling', () => {
    expect(row(buildSkillsPanelView(prof({ mining: 32 }), CAPS), 'mining').band).toBe(0);
    expect(row(buildSkillsPanelView(prof({ mining: 33 }), CAPS), 'mining').band).toBe(1);
    expect(row(buildSkillsPanelView(prof({ mining: 66 }), CAPS), 'mining').band).toBe(2);
    // Fishing bands at 0 / 66 / 133, not at mining's boundaries.
    expect(row(buildSkillsPanelView(prof({ fishing: 65 }), CAPS), 'fishing').band).toBe(0);
    expect(row(buildSkillsPanelView(prof({ fishing: 66 }), CAPS), 'fishing').band).toBe(1);
    expect(row(buildSkillsPanelView(prof({ fishing: 133 }), CAPS), 'fishing').band).toBe(2);
  });
});

describe('mastery state colouring', () => {
  it('is the classic orange / yellow / green / grey ladder, one colour per state', () => {
    expect(Object.keys(MASTERY_STATE_COLOR)).toEqual(['full', 'reduced', 'minimal', 'none']);
    const colors = Object.values(MASTERY_STATE_COLOR);
    expect(new Set(colors).size).toBe(4);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    // Orange is the hottest, grey is neutral: red channel falls, and only grey is
    // achromatic (equal channels).
    expect(MASTERY_STATE_COLOR.full).toBe('#ff8040');
    const grey = MASTERY_STATE_COLOR.none;
    expect(grey.slice(1, 3)).toBe(grey.slice(3, 5));
    expect(grey.slice(3, 5)).toBe(grey.slice(5, 7));
  });

  it('walks a node profession down the four states as proficiency outgrows tier-1 content', () => {
    // A tier-T node sits on curve rung T - 1, so tier 1 is the first to gray out.
    expect(masteryStateForContent('mining', 0, 1)).toBe('full');
    expect(masteryStateForContent('mining', 24, 1)).toBe('full');
    expect(masteryStateForContent('mining', 25, 1)).toBe('reduced');
    expect(masteryStateForContent('mining', 50, 1)).toBe('minimal');
    // 75 is the documented breakpoint where a tier-1 node stops teaching anything.
    expect(masteryStateForContent('mining', 75, 1)).toBe('none');
    expect(masteryStateForContent('mining', 100, 1)).toBe('none');
  });

  it('keeps the endgame tier at full progress for a maxed node gatherer', () => {
    // Tier 4 (rung 3) against capability tier 4 is one tier below: still half pay.
    expect(masteryStateForContent('mining', 100, 4)).toBe('reduced');
    expect(masteryStateForContent('mining', 74, 4)).toBe('full');
  });

  it('scores fishing on its own 50-point step against the water tier', () => {
    expect(masteryStateForContent('fishing', 0, 1)).toBe('full');
    expect(masteryStateForContent('fishing', 50, 1)).toBe('reduced');
    expect(masteryStateForContent('fishing', 100, 1)).toBe('minimal');
    expect(masteryStateForContent('fishing', 150, 1)).toBe('none');
    // Zone-4 water is where a 150-plus angler still gains at full rate.
    expect(masteryStateForContent('fishing', 150, 4)).toBe('full');
  });

  it('publishes one tier state per content tier, index-aligned with GATHER_CONTENT_TIERS', () => {
    expect(GATHER_CONTENT_TIERS).toEqual([1, 2, 3, 4]);
    const mining = row(buildSkillsPanelView(prof({ mining: 75 }), CAPS), 'mining');
    expect(mining.tierStates).toEqual(['none', 'minimal', 'reduced', 'full']);
    expect(mining.exhausted).toBe(false);
  });

  it('never reports every tier exhausted at the cap: the endgame tier always still pays', () => {
    const view = buildSkillsPanelView(prof({ mining: 100, logging: 100, herbalism: 100, fishing: 200 }), CAPS);
    for (const r of view.rows) {
      expect(r.exhausted).toBe(false);
      expect(r.tierStates[3]).not.toBe('none');
    }
  });
});

describe('the effective (rod-capped) fishing band', () => {
  it('caps a high-standing angler to the band their rod covers, and says so', () => {
    // Fishing 200 earns band 2, but a tier-1 pole only covers band 0. The sim
    // applies that cap SILENTLY, so the row is the only place it can surface.
    const view = buildSkillsPanelView(prof({ fishing: 200 }), CAPS, { fishing: 1 });
    const fishing = row(view, 'fishing');
    expect(fishing.band).toBe(2);
    expect(fishing.effectiveBand).toBe(0);
    expect(fishing.bandCappedByTool).toBe(true);
  });

  it('lifts the cap as the rod improves, and clears the flag once the rod keeps up', () => {
    expect(row(buildSkillsPanelView(prof({ fishing: 200 }), CAPS, { fishing: 2 }), 'fishing').effectiveBand).toBe(1);
    const good = row(buildSkillsPanelView(prof({ fishing: 200 }), CAPS, { fishing: 3 }), 'fishing');
    expect(good.effectiveBand).toBe(2);
    expect(good.bandCappedByTool).toBe(false);
  });

  it('never flags a cap when the rod already exceeds the earned band', () => {
    const low = row(buildSkillsPanelView(prof({ fishing: 10 }), CAPS, { fishing: 4 }), 'fishing');
    expect(low.band).toBe(0);
    expect(low.effectiveBand).toBe(0);
    expect(low.bandCappedByTool).toBe(false);
  });

  it('leaves the node professions uncapped: their tools gate by tier, not by band', () => {
    const view = buildSkillsPanelView(prof({ mining: 100 }), CAPS, { mining: 1 });
    const mining = row(view, 'mining');
    expect(mining.effectiveBand).toBe(mining.band);
    expect(mining.bandCappedByTool).toBe(false);
  });

  it('reports no workable node tier for fishing, which has no node tiers', () => {
    expect(row(buildSkillsPanelView(prof(), CAPS, { fishing: 4 }), 'fishing').workableTier).toBe(0);
  });
});

describe('tool tier requirement', () => {
  it('reports no tool distinctly from a tool that is merely too crude', () => {
    expect(gatherRequirementView('mining', 2, 0)).toEqual({
      professionId: 'mining',
      requiredTier: 2,
      toolTier: 0,
      hasTool: false,
      meets: false,
    });
    expect(gatherRequirementView('mining', 2, 1).hasTool).toBe(true);
    expect(gatherRequirementView('mining', 2, 1).meets).toBe(false);
  });

  it('lets a tool cover its own tier and every tier below, never above', () => {
    expect(gatherRequirementView('logging', 2, 2).meets).toBe(true);
    expect(gatherRequirementView('logging', 1, 3).meets).toBe(true);
    expect(gatherRequirementView('logging', 4, 3).meets).toBe(false);
  });

  it('derives the highest workable tier from the carried tool', () => {
    const none = buildSkillsPanelView(prof(), CAPS, {});
    expect(row(none, 'mining').workableTier).toBe(0);
    const mid = buildSkillsPanelView(prof(), CAPS, { mining: 2, logging: 4 });
    expect(row(mid, 'mining').workableTier).toBe(2);
    expect(row(mid, 'logging').workableTier).toBe(4);
  });
});

describe('buildSkillsPanelView is a pure projection', () => {
  it('returns identical structure for identical input (no hidden state)', () => {
    const p = prof({ mining: 42, fishing: 133 });
    const tools = { mining: 2, fishing: 3 };
    expect(buildSkillsPanelView(p, CAPS, tools)).toEqual(buildSkillsPanelView(p, CAPS, tools));
  });

  it('defaults a missing tool entry to "none carried" rather than throwing', () => {
    const view = buildSkillsPanelView(prof(), CAPS);
    for (const r of view.rows) expect(r.toolTier).toBe(0);
  });
});
