import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The sim and the HUD agree on event names by STRING COMPARISON, so a rename on either
// side is invisible to tsc and simply makes the feedback silent. That is not theoretical:
// wave 2 shipped with the sim emitting craftResult / craftSkill / enchantResult /
// disenchantResult while the UI listened for craftComplete / professionSkill /
// enchantApplied / disenchantYield. Four of the seven events were dead, so a successful
// craft, a skill-up, an applied enchant and a disenchant produced no line at all, and
// every per-side unit test still passed because each side was self-consistent.
//
// This is a source scan on purpose. A typed test cannot catch it: the adapter's input is
// its own union, not the sim's, which is exactly how the two drifted apart.
const CRAFTING_EVENTS = [
  'craftResult',
  'craftDeny',
  'craftSkill',
  'enchantResult',
  'enchantDeny',
  'disenchantResult',
  'disenchantDeny',
];

function emittedBySim(): Set<string> {
  const sim = readFileSync('src/sim/sim.ts', 'utf8');
  const out = new Set<string>();
  for (const m of sim.matchAll(/type: '((?:craft|enchant|disenchant)[A-Za-z]*)'/g)) out.add(m[1]);
  return out;
}

function handledByUi(): Set<string> {
  const feedback = readFileSync('src/ui/crafting_feedback.ts', 'utf8');
  const out = new Set<string>();
  for (const m of feedback.matchAll(/'((?:craft|enchant|disenchant)[A-Za-z]*)'/g)) out.add(m[1]);
  return out;
}

describe('crafting event contract', () => {
  it('emits exactly the events the UI adapter handles', () => {
    const emitted = emittedBySim();
    const handled = handledByUi();
    const silent = [...emitted].filter((e) => !handled.has(e));
    const orphaned = [...handled].filter((e) => !emitted.has(e));

    expect(silent, 'sim emits these but no UI arm renders them').toEqual([]);
    expect(orphaned, 'UI listens for these but the sim never emits them').toEqual([]);
  });

  it('covers the full known event set on both sides', () => {
    // Guards the case where BOTH sides are renamed together and the check above
    // passes while the feature quietly loses an event.
    const emitted = emittedBySim();
    for (const name of CRAFTING_EVENTS) {
      expect(emitted.has(name), `sim no longer emits ${name}`).toBe(true);
    }
  });

  it('routes the silent-grant side effects off the real result events', () => {
    // A craft and a disenchant grant through addItemSilent, so the HUD re-issues the
    // loot sound and the bag repaint. Keyed off the wrong name, an item would appear
    // in the bag with no sound and a stale window.
    const hud = readFileSync('src/ui/hud.ts', 'utf8');
    expect(hud).toContain("ev.type === 'craftResult'");
    expect(hud).toContain("ev.type === 'disenchantResult'");
  });
});
