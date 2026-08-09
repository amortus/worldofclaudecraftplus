import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DUNGEON_FINDER_EVENTS } from '../src/ui/lfg_ui_model';

// Third instance of the same trap, so it gets the same guard (see
// tests/crafting_event_contract.test.ts and tests/rift_event_contract.test.ts).
// The sim and the HUD agree on SimEvent names by STRING COMPARISON, which tsc
// cannot check, so a rename on either side silently kills the feature while
// every per-side unit test still passes.
//
// Wave 2 shipped exactly that way: the sim emitted craftResult / craftSkill /
// enchantResult / disenchantResult while the UI listened for craftComplete /
// professionSkill / enchantApplied / disenchantYield, and four of seven events
// were dead. Wave 3 shipped the OTHER half of the same failure: every rift
// module was written and none was composed into the HUD, so a complete switch
// over the event union was never reached. This file guards both halves for the
// Dungeon Finder's four events.
const LFG_EVENTS: string[] = [...DUNGEON_FINDER_EVENTS];

// hud.ts FIRST and on its own for the routing checks below: a module can define
// a complete switch over the event union and still never be called.
const HUD_SOURCE = 'src/ui/hud.ts';
const UI_SOURCES = [
  'src/ui/lfg_ui_model.ts',
  'src/ui/lfg_ui_labels.ts',
  'src/ui/dungeon_finder_window.ts',
  HUD_SOURCE,
];

function emittedBySim(): Set<string> {
  const sim = readFileSync('src/sim/sim.ts', 'utf8');
  const out = new Set<string>();
  for (const m of sim.matchAll(/type: '(lfg[A-Za-z]*)'/g)) out.add(m[1]);
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
    for (const m of src.matchAll(/'(lfg[A-Za-z]*)'/g)) {
      if (LFG_EVENTS.includes(m[1])) out.add(m[1]);
    }
  }
  return out;
}

describe('dungeon finder event contract', () => {
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
    // The checks above prove some UI module names each event. This one proves
    // the HUD is wired to them at all: it must mount the surfaces, reach the
    // router, and carry a case arm per event, or the feature is unreachable no
    // matter how complete the modules.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'hud.ts never mounts the Dungeon Finder').toContain('mountDungeonFinder(');
    expect(hud, 'hud.ts never repaints the Dungeon Finder').toContain('renderDungeonFinder()');
    expect(hud, 'hud.ts never routes Dungeon Finder events').toContain(
      'isDungeonFinderEventType(',
    );
    expect(hud, 'hud.ts never raises the ready check').toContain(
      'openDungeonFinderReadyCheck(',
    );
    for (const name of LFG_EVENTS) {
      expect(hud.includes(`case '${name}'`), `hud.ts has no arm for ${name}`).toBe(true);
    }
  });

  it('reaches the window from BOTH a desktop control and the phone drawer', () => {
    // Most players are on phones through the packaged Android app, so a window
    // that only a desktop keybind can open is half-shipped.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'no desktop micro-button').toContain('mm-dungeon-finder');
    expect(hud, 'no More-drawer button').toContain('mobile-dungeon-finder');
    expect(hud, 'the phone button does not live in the More drawer').toContain(
      'mobile-extra-grid',
    );
    expect(hud, 'no toggle for the window').toContain('toggleDungeonFinder()');
  });

  it('never spends the `lfg` token on an id, a key or a label', () => {
    // `lfg` is ALREADY a joinable chat channel (`/join lfg`, the channel tab
    // bar, every persisted channel set). The four event NAMES above keep the
    // historical spelling because they are the frozen wire contract; nothing
    // else this feature produces may collide with the channel.
    for (const path of ['src/ui/dungeon_finder_window.ts', 'src/ui/lfg_ui_labels.ts']) {
      const src = readFileSync(path, 'utf8');
      // Every catalog key these two modules reach for, single-quoted or spliced
      // into a template literal.
      const keys = [...src.matchAll(/hudChrome\.[A-Za-z0-9_.$]*/g)].map((m) => m[0]);
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(key.startsWith('hudChrome.dungeonFinder.'), `${key} is not a dungeonFinder key`).toBe(
          true,
        );
      }
    }
    const window = readFileSync('src/ui/dungeon_finder_window.ts', 'utf8');
    for (const id of [...window.matchAll(/id="([^"]+)"|getElementById\('([^']+)'\)/g)]) {
      const value = id[1] ?? id[2] ?? '';
      expect(value.includes('lfg'), `element id ${value} collides with the lfg chat channel`).toBe(
        false,
      );
    }
  });

  it('keeps a desktop key that the bindings profile has not claimed', () => {
    // The window's desktop key is resolved in hud.ts rather than through a
    // BIND_ACTIONS row (src/game/ is not this change's file), and it YIELDS to
    // any action that later claims the code. Pin that nothing does yet, so a new
    // binding silently stealing the only keyboard entry point fails here instead
    // of in a player's hands.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    const code = /DUNGEON_FINDER_KEY_CODE = '([A-Za-z0-9]+)'/.exec(hud)?.[1];
    expect(code, 'hud.ts no longer declares a Dungeon Finder key').toBeTruthy();
    const keybinds = readFileSync('src/game/keybinds.ts', 'utf8');
    expect(
      keybinds.includes(`'${code}'`),
      `${code} is now claimed by a keybind default; give the Dungeon Finder its own BIND_ACTIONS row`,
    ).toBe(false);
    // and it must actually yield rather than fire unconditionally
    expect(hud).toContain('this.keybinds.actionForCode(combo) === null');
  });

  it('closes the ready check only for the reasons that end a proposal', () => {
    // A refusal of something ELSE (a redundant second answer, a second join)
    // arrives while the check is still counting. Closing on every deny would
    // charge the player the 300 second timeout for a keypress that did nothing.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    const arm = hud.slice(hud.indexOf("case 'lfgDeny'"));
    const body = arm.slice(0, arm.indexOf('break;'));
    expect(body, 'the lfgDeny arm closes the ready check unconditionally').toContain(
      'denyEndsReadyCheck(',
    );
  });

  it('still covers the full pinned event set', () => {
    // Catches both sides being renamed together, which would leave the checks
    // above green while the feature quietly loses an event.
    const emitted = emittedBySim();
    for (const name of LFG_EVENTS) {
      expect(emitted.has(name), `sim no longer emits ${name}`).toBe(true);
    }
  });
});
