import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MOUNT_EVENTS } from '../src/ui/mount_ui_model';

// Same trap, same guard (see tests/crafting_event_contract.test.ts,
// tests/rift_event_contract.test.ts and tests/lfg_ui_event_contract.test.ts).
// The sim and the HUD agree on SimEvent names by STRING COMPARISON, which tsc
// cannot check: a rename on either side kills the feedback while every per-side
// unit test stays green, and a complete switch that nothing calls fails exactly
// the same way.
const MOUNT_EVENT_NAMES: string[] = [...MOUNT_EVENTS];

const HUD_SOURCE = 'src/ui/hud.ts';
const UI_SOURCES = ['src/ui/mount_ui_model.ts', 'src/ui/mount_ui_labels.ts', HUD_SOURCE];

function emittedBySim(): Set<string> {
  const sim = readFileSync('src/sim/sim.ts', 'utf8');
  const out = new Set<string>();
  for (const m of sim.matchAll(/type: '(mount[A-Za-z]*)'/g)) out.add(m[1]);
  return out;
}

function handledByUi(): Set<string> {
  const out = new Set<string>();
  for (const path of UI_SOURCES) {
    let src: string;
    try {
      src = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const m of src.matchAll(/'(mount[A-Za-z]*)'/g)) {
      if (MOUNT_EVENT_NAMES.includes(m[1])) out.add(m[1]);
    }
  }
  return out;
}

describe('mount event contract', () => {
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
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'hud.ts never routes mount events').toContain('isMountUiEventType(');
    for (const name of MOUNT_EVENT_NAMES) {
      expect(hud.includes(`case '${name}'`), `hud.ts has no arm for ${name}`).toBe(true);
    }
  });

  it('lets the action bar carry a set of reins', () => {
    // Mounts ship with NO collection window by design, so the action bar is the
    // only place a player can bind one. If `isHotbarItemId` does not admit the
    // item, the whole feature is unreachable from the bar no matter how correct
    // the events are.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'hud.ts never asks whether an item is a mount').toContain('isMountItem(');
    const gate = hud.slice(hud.indexOf('private isHotbarItemId('));
    expect(
      gate.slice(0, gate.indexOf('}')).includes('isMountItem('),
      'the action-bar item gate does not admit a mount',
    ).toBe(true);
  });

  it('still covers the full pinned event set', () => {
    const emitted = emittedBySim();
    for (const name of MOUNT_EVENT_NAMES) {
      expect(emitted.has(name), `sim no longer emits ${name}`).toBe(true);
    }
  });
});
