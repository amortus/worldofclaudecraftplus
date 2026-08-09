// Quest objective labels must name a thing that exists.
//
// The tracker renders the label verbatim ("Fen Troll slain: 0/12"), so a label
// that names a mob no mob in the world carries sends the player looking for
// something that is not there. Two of our own wave-5 quests shipped that way
// while their shipped siblings, targeting the SAME mob, got the name right.
//
// Rederived from the live tables rather than pinned, so a rename pass cannot
// strand a label again.

import { describe, expect, it } from 'vitest';

import { ITEMS, MOBS, QUESTS } from '../src/sim/data';

// Labels that deliberately do NOT lead with the full name. Each needs a reason;
// this list is not a place to bury a real miss.
const SHORT_FORM_ALLOWED: Record<string, string> = {
  // The whole quest chain calls him Nythraxis; the full template name would read
  // as a different creature.
  'q_nythraxis_scourges_end:0': 'deliberate short form for the chain boss',
};

function label(questId: string, index: number): string {
  return QUESTS[questId].objectives[index].label;
}

describe('quest objective labels name real content', () => {
  const killCases: [string, number, string][] = [];
  const collectCases: [string, number, string][] = [];
  for (const q of Object.values(QUESTS)) {
    q.objectives.forEach((o, i) => {
      if (o.type === 'kill' && o.targetMobId) killCases.push([q.id, i, o.targetMobId]);
      if (o.type === 'collect' && o.itemId) collectCases.push([q.id, i, o.itemId]);
    });
  }

  it('finds objectives to check', () => {
    expect(killCases.length).toBeGreaterThan(50);
    expect(collectCases.length).toBeGreaterThan(20);
  });

  for (const [questId, i, mobId] of killCases) {
    it(`${questId}[${i}] kill label matches ${mobId}`, () => {
      const mob = MOBS[mobId];
      expect(mob, `${questId} targets unknown mob ${mobId}`).toBeTruthy();
      const text = label(questId, i);
      if (SHORT_FORM_ALLOWED[`${questId}:${i}`]) {
        expect(mob.name.includes(text.split(' ')[0])).toBe(true);
        return;
      }
      expect(
        text.startsWith(mob.name),
        `label "${text}" must lead with the mob's real name "${mob.name}"`,
      ).toBe(true);
    });
  }

  for (const [questId, i, itemId] of collectCases) {
    it(`${questId}[${i}] collect label matches ${itemId}`, () => {
      const item = ITEMS[itemId];
      expect(item, `${questId} collects unknown item ${itemId}`).toBeTruthy();
      const text = label(questId, i);
      if (SHORT_FORM_ALLOWED[`${questId}:${i}`]) return;
      expect(
        text.startsWith(item.name),
        `label "${text}" must lead with the item's real name "${item.name}"`,
      ).toBe(true);
    });
  }
});
