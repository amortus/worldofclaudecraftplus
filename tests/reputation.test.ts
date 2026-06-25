import { describe, expect, it } from 'vitest';
import { atLeastStanding, FACTIONS, REP_MAX, REP_MIN, reputationFor } from '../src/sim/reputation';

describe('reputation tiers (WoW-classic thresholds)', () => {
  it('maps points to the right standing at every boundary', () => {
    expect(reputationFor(0).standing).toBe('neutral');
    expect(reputationFor(2999).standing).toBe('neutral');
    expect(reputationFor(3000).standing).toBe('friendly');
    expect(reputationFor(8999).standing).toBe('friendly');
    expect(reputationFor(9000).standing).toBe('honored');
    expect(reputationFor(20999).standing).toBe('honored');
    expect(reputationFor(21000).standing).toBe('revered');
    expect(reputationFor(41999).standing).toBe('revered');
    expect(reputationFor(42000).standing).toBe('exalted');
    // below neutral
    expect(reputationFor(-1).standing).toBe('unfriendly');
    expect(reputationFor(-3000).standing).toBe('unfriendly');
    expect(reputationFor(-3001).standing).toBe('hostile');
    expect(reputationFor(-6000).standing).toBe('hostile');
    expect(reputationFor(-6001).standing).toBe('hated');
  });

  it('reports in-tier progress (current/max) for the rep bar', () => {
    expect(reputationFor(0)).toMatchObject({ standing: 'neutral', current: 0, max: 3000 });
    expect(reputationFor(4500)).toMatchObject({ standing: 'friendly', current: 1500, max: 6000 });
    expect(reputationFor(9000)).toMatchObject({ standing: 'honored', current: 0, max: 12000 });
    expect(reputationFor(42000)).toMatchObject({ standing: 'exalted', current: 0, max: 0 });
  });

  it('clamps to [REP_MIN, REP_MAX] and rounds', () => {
    expect(reputationFor(99999).points).toBe(REP_MAX);
    expect(reputationFor(-99999).points).toBe(REP_MIN);
    expect(reputationFor(2999.6).points).toBe(3000);
  });

  it('atLeastStanding gates vendor pieces / attunement correctly', () => {
    expect(atLeastStanding(9000, 'honored')).toBe(true);
    expect(atLeastStanding(8999, 'honored')).toBe(false);
    expect(atLeastStanding(42000, 'exalted')).toBe(true);
    expect(atLeastStanding(41999, 'exalted')).toBe(false);
    expect(atLeastStanding(0, 'neutral')).toBe(true);
    expect(atLeastStanding(-1, 'neutral')).toBe(false);
  });

  it('registers Dawn of Claude starting at Neutral', () => {
    expect(FACTIONS.dawn_of_claude.start).toBe(0);
    expect(reputationFor(FACTIONS.dawn_of_claude.start).standing).toBe('neutral');
  });
});
