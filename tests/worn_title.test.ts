// The worn milestone title: which of the unlocked milestones a player shows above
// their name, and that it survives a reload rather than waiting for the next unlock.

import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { MILESTONES, wornTitleMilestone } from '../src/sim/types';

describe('wornTitleMilestone', () => {
  it('wears nothing when nothing is unlocked', () => {
    expect(wornTitleMilestone([])).toBe('');
  });

  it('wears the highest-threshold title unlocked', () => {
    expect(wornTitleMilestone(['veteran'])).toBe('veteran');
    expect(wornTitleMilestone(['veteran', 'champion'])).toBe('champion');
    expect(wornTitleMilestone(['champion', 'veteran'])).toBe('champion'); // order-free
    expect(wornTitleMilestone(['veteran', 'champion', 'eternal'])).toBe('eternal');
  });

  it('ignores border milestones: they are not worn as text', () => {
    const borders = MILESTONES.filter((m) => m.kind === 'border').map((m) => m.id);
    expect(borders.length).toBeGreaterThan(0);
    expect(wornTitleMilestone(borders)).toBe('');
    // a border outranking every unlocked title must not suppress the title either
    expect(wornTitleMilestone([...borders, 'veteran'])).toBe('veteran');
  });

  it('ignores unknown ids', () => {
    expect(wornTitleMilestone(['not_a_milestone'])).toBe('');
  });
});

describe('the sim keeps the entity title in sync', () => {
  it('starts empty and appears when the milestone unlocks', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    const p = sim.player;
    expect(p.title).toBe('');

    const veteran = MILESTONES.find((m) => m.id === 'veteran')!;
    (sim as any).grantXp(veteran.lifetimeXp + 1);

    expect(sim.unlockedMilestones).toContain('veteran');
    expect(p.title).toBe('veteran'); // rides the entity, so every client sees it
  });

  it('is worn on load, not only on the next unlock', () => {
    const src = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    const state = src.serializeCharacter(src.playerId)!;
    state.unlockedMilestones = ['veteran', 'champion'];

    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true, noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Titled', { state });

    // eternal may never come: a character who earned a title before this shipped has
    // to wear it from the moment they log in, not at the next unlock.
    expect(sim.entities.get(pid)!.title).toBe('champion');
  });
});
