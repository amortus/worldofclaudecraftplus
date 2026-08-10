import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Third instance of the same trap, so it gets the same guard (see
// tests/rift_event_contract.test.ts and tests/crafting_event_contract.test.ts).
// The sim and the HUD agree on SimEvent names by STRING COMPARISON, which tsc
// cannot check, so a rename on either side silently kills the feedback while
// every per-side unit test still passes. Wave 2 shipped exactly that way with
// four of seven crafting events dead on arrival.
//
// For the death loop the whole player-facing surface is these three names: if
// one goes silent, a player who dies gets no line telling them their spirit
// rose, no line telling them why the Resurrect button refused, and no line
// telling them they just took ten minutes of Resurrection Sickness.
const GHOST_EVENTS = ['ghostRelease', 'ghostResurrect', 'ghostDeny'];

// hud.ts FIRST and on its own for the routing check below: a module can define a
// complete switch over the event union and still never be called, which is how
// the rift feature nearly shipped (every module written, none composed).
const HUD_SOURCE = 'src/ui/hud.ts';
const UI_SOURCES = ['src/ui/ghost_feedback.ts', 'src/ui/ghost_panel.ts', HUD_SOURCE];

function emittedBySim(): Set<string> {
  const sim = readFileSync('src/sim/sim.ts', 'utf8');
  const out = new Set<string>();
  for (const m of sim.matchAll(/type: '(ghost[A-Za-z]*)'/g)) out.add(m[1]);
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
    for (const m of src.matchAll(/'(ghost[A-Za-z]*)'/g)) {
      if (GHOST_EVENTS.includes(m[1])) out.add(m[1]);
    }
  }
  return out;
}

describe('ghost event contract', () => {
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
    // The checks above prove some UI module names each event. This one proves the
    // HUD is wired at all: it must mount the ghost panel AND carry a case arm per
    // event, or the death loop is unreachable no matter how complete the modules.
    const hud = readFileSync(HUD_SOURCE, 'utf8');
    expect(hud, 'hud.ts never mounts the ghost panel').toContain('mountGhostPanel(');
    for (const name of GHOST_EVENTS) {
      expect(hud.includes(`case '${name}'`), `hud.ts has no arm for ${name}`).toBe(true);
    }
  });

  it('still covers the full pinned event set', () => {
    // Catches both sides being renamed together, which would leave the two checks
    // above green while the feature quietly loses an event.
    const emitted = emittedBySim();
    for (const name of GHOST_EVENTS) {
      expect(emitted.has(name), `sim no longer emits ${name}`).toBe(true);
    }
  });

  it('keeps the two resurrection commands wired end to end', () => {
    // The other string-compared seam: IWorld method -> ClientWorld cmd id ->
    // server dispatch case. tsc checks the method names but not the wire ids, so
    // a rename of `rez_corpse` on either side would leave the button inert online
    // while every offline test stayed green.
    const online = readFileSync('src/net/online.ts', 'utf8');
    const server = readFileSync('server/game.ts', 'utf8');
    for (const cmd of ['rez_corpse', 'rez_healer']) {
      expect(online.includes(`cmd: '${cmd}'`), `ClientWorld never sends ${cmd}`).toBe(true);
      expect(server.includes(`case '${cmd}'`), `the server has no arm for ${cmd}`).toBe(true);
    }
    // And the ghost flag itself: the renderer and the HUD both key off it, so the
    // wire field has to survive a rename too.
    expect(server, 'the server no longer sends the ghost flag').toContain('out.gh = 1');
    expect(online, 'ClientWorld no longer decodes the ghost flag').toContain('e.ghost = !!w.gh');
  });
});
