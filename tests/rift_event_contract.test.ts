import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Second instance of the same trap, so it gets the same guard. The sim and the HUD agree
// on SimEvent names by STRING COMPARISON, which tsc cannot check, so a rename on either
// side silently kills the feedback while every per-side unit test still passes.
//
// Wave 2 shipped that way: the sim emitted craftResult / craftSkill / enchantResult /
// disenchantResult while the UI listened for craftComplete / professionSkill /
// enchantApplied / disenchantYield, and four of seven events were dead. For rifts the
// contract was pinned up front and handed to both sides, and this test is what keeps it
// pinned. See also tests/crafting_event_contract.test.ts.
const RIFT_EVENTS = ['riftPortal', 'riftEnter', 'riftFloor', 'riftClear', 'riftDeny'];

// hud.ts FIRST and on its own for the routing check below: a module can define a
// complete switch over the event union and still never be called, which is exactly how
// this feature nearly shipped (every rift module was written, none was composed into
// the HUD, so all five events were dead on arrival while a laxer grep passed).
const HUD_SOURCE = 'src/ui/hud.ts';
const UI_SOURCES = [
  'src/ui/rift_feedback.ts',
  'src/ui/rift_hud.ts',
  'src/ui/rift_ui_model.ts',
  HUD_SOURCE,
];

function emittedBySim(): Set<string> {
  const sim = readFileSync('src/sim/sim.ts', 'utf8');
  const out = new Set<string>();
  for (const m of sim.matchAll(/type: '(rift[A-Za-z]*)'/g)) out.add(m[1]);
  return out;
}

function handledByUi(): Set<string> {
  const out = new Set<string>();
  for (const path of UI_SOURCES) {
    let src: string;
    try {
      src = readFileSync(path, 'utf8');
    } catch {
      continue; // a module the UI wave chose not to split out is not a failure
    }
    for (const m of src.matchAll(/'(rift[A-Za-z]*)'/g)) {
      if (RIFT_EVENTS.includes(m[1])) out.add(m[1]);
    }
  }
  return out;
}

describe('rift event contract', () => {
  it('emits every event the UI renders', () => {
    const emitted = emittedBySim();
    const handled = handledByUi();
    const silent = [...handled].filter((e) => !emitted.has(e));
    expect(silent, 'the UI renders these but the sim never emits them').toEqual([]);
  });

  it('renders every event the sim emits', () => {
    const emitted = emittedBySim();
    const handled = handledByUi();
    const unheard = [...emitted].filter((e) => !handled.has(e));
    expect(unheard, 'the sim emits these but no UI arm renders them').toEqual([]);
  });

  it('actually routes the events from hud.ts', () => {
    // The check above proves some UI module names each event. This one proves the HUD
    // is wired to them at all: it must both mount the rift furniture and carry a case
    // arm per event, or the feature is unreachable no matter how complete the modules.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'hud.ts never mounts the rift HUD').toContain('mountRiftHud(');
    for (const name of RIFT_EVENTS) {
      expect(hud.includes(`case '${name}'`), `hud.ts has no arm for ${name}`).toBe(true);
    }
  });

  it('still covers the full pinned event set', () => {
    // Catches both sides being renamed together, which would leave the two checks
    // above green while the feature quietly loses an event.
    const emitted = emittedBySim();
    for (const name of RIFT_EVENTS) {
      expect(emitted.has(name), `sim no longer emits ${name}`).toBe(true);
    }
  });
});
