// Composition guards for the professions / deeds / unstuck wave.
//
// Every part of this wave shipped and was unit-tested on its own: the sim emits
// the events, IWorld exposes the readouts, and src/ui/ holds the panels and the
// line builders. What no suite could see is whether anything IMPORTS them, and
// that was exactly the gap: a player could not open the Skills panel or the Book
// of Deeds, saw no harvest, skill-up, fishing or unstuck lines, and got no deed
// unlock. Each arm below pins one composition point so the same gap reds a test
// instead of shipping silently again.
//
// Source-scanning follows the tests/hud_upstream_port_wiring.test.ts precedent:
// hud.ts is one 15k-line class whose constructor and per-frame methods cannot be
// driven headlessly without a full DOM.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BIND_ACTIONS } from '../src/game/keybinds';

// Normalized to LF: git checks this tree out with CRLF on Windows, and a scan
// keyed on the raw bytes would pass on one machine and fail on the next.
function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
}

const hud = read('src/ui/hud.ts');
const sim = read('src/sim/sim.ts');
const mobileControls = read('src/game/mobile_controls.ts');
const htmlEntries = { 'index.html': read('index.html'), 'play.html': read('play.html') };

/** Every symbol hud.ts imports from a module, from its one import statement. */
function importedFrom(module: string): string[] {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'${module}';`);
  const match = hud.match(re);
  expect(match, `hud.ts does not import from '${module}'`).not.toBeNull();
  return match![1]
    .split(',')
    .map((s) => s.replace(/\btype\b/, '').trim())
    .filter(Boolean);
}

/** hud.ts with every import statement stripped, so "is it used" means used. */
const hudBody = hud.replace(/import\s*(?:\{[^}]*\}|[^;]*?)\s*from\s*'[^']*';/g, '');

/** The body of a hud.ts method, from its signature to the first dedented brace. */
function methodBody(name: string): string {
  const start = hud.indexOf(name);
  expect(start, `${name} not found in hud.ts`).toBeGreaterThan(-1);
  const rest = hud.slice(start);
  const end = rest.indexOf('\n  }\n');
  expect(end, `${name} body not delimited`).toBeGreaterThan(-1);
  return rest.slice(0, end);
}

describe('hud.ts composes the five wave-1 UI modules', () => {
  // The exact modules that were built, tested, and then left unreferenced.
  const modules: Record<string, string[]> = {
    './deeds_panel': ['deedEventLines', 'toggleDeedsPanel'],
    './fishing_bite_cue': ['hideFishingBiteCue', 'showFishingBiteCue'],
    './gathering_feedback': ['gatheringEventLines', 'gatherNodeTooltipHtml'],
    './skills_panel': ['toggleSkillsPanel'],
    './unstuck_feedback': ['localizeUnstuckAuraName', 'unstuckEventLines'],
  };

  for (const [module, expected] of Object.entries(modules)) {
    it(`imports and calls ${module}`, () => {
      const imported = importedFrom(module);
      for (const symbol of expected) {
        expect(imported, `${module} -> ${symbol}`).toContain(symbol);
        // An import nothing calls is the original bug wearing a disguise.
        expect(hudBody, `${symbol} imported but never used`).toContain(`${symbol}(`);
      }
    });
  }
});

describe('hud.ts handles every SimEvent this wave added', () => {
  for (const type of [
    'gatherDeny',
    'gatherHarvest',
    'professionSkill',
    'fishing',
    'unstuck',
    'deedComplete',
  ]) {
    it(`handleEvents has an arm for '${type}'`, () => {
      expect(hudBody).toContain(`case '${type}':`);
    });
  }

  it('the bite cue opens on the bite phase and closes on every other one', () => {
    expect(hudBody).toContain('showFishingBiteCue(');
    expect(hudBody).toContain('hideFishingBiteCue()');
    // The cue's countdown is the rod's reel window, not a constant: showing a
    // 3s bar to a player holding a tier-3 rod would time the minigame wrong.
    expect(hudBody).toMatch(/reelWindowSec\(\s*\n?\s*bestOwnedGatherToolTier\(/);
  });

  it('the completed-unstuck line derives its sickness from the player level', () => {
    expect(hudBody).toContain('unstuckEventLines(ev, sim.player.level)');
  });

  it('a harvest still repaints an open bag and still makes a sound', () => {
    // The sim grants silently now, so the `loot` arm's two side effects (bag
    // repaint, pickup sound) no longer fire for a harvest and are re-issued
    // here. Without this a player watching their bags sees nothing arrive.
    expect(hudBody).toMatch(/gatherHarvest'\) \{\n\s*audio\.lootItem\(\);\n\s*this\.onInventoryChanged\(\);/);
  });
});

describe('the Unstuck Sickness debuff never renders as raw English', () => {
  it('the aura display name chains the unstuck resolver ahead of the sim matcher', () => {
    // Assert the ORDER, not a literal line. The chain is formatted across several
    // lines and has since grown a third resolver (crafted elixirs), so matching the
    // exact one-line form failed on a pure reformat while the behaviour was correct.
    // What actually matters is that the unstuck resolver is consulted before the
    // shared sim matcher, or the debuff renders as raw English in all 14 locales.
    // Scope to the resolver itself: localizeSimAuraName is also called elsewhere in
    // hud.ts, so a whole-file indexOf compares two unrelated call sites.
    const fnAt = hudBody.indexOf('function auraDisplayNameFromSource');
    expect(fnAt, 'auraDisplayNameFromSource is gone').toBeGreaterThan(-1);
    const body = hudBody.slice(fnAt, fnAt + 1200);
    const unstuckAt = body.indexOf('localizeUnstuckAuraName(name)');
    const simAt = body.indexOf('localizeSimAuraName(name)');
    expect(unstuckAt, 'the resolver never calls localizeUnstuckAuraName').toBeGreaterThan(-1);
    expect(simAt, 'the resolver never calls localizeSimAuraName').toBeGreaterThan(-1);
    expect(unstuckAt, 'the unstuck resolver must run before the sim matcher').toBeLessThan(simAt);
  });
});

describe('the gather node tooltip reads the node off the ground object', () => {
  it('resolves through objectItemId, the same field the sim harvests through', () => {
    expect(hudBody).toContain('gatherNodeById(entity.objectItemId)');
    expect(hudBody).toContain('gatherNodeTooltipHtml(');
    expect(sim).toContain('gatherNodeById(obj.objectItemId)');
  });

  it('writes the display flag every pass, not only when the node changes', () => {
    // hideTooltip / closeOtherWindows can hide #tooltip behind this module's
    // back. Caching "already shown" on the hovered node id would then leave a
    // player hovering a vein with a repositioned but invisible tooltip.
    const body = methodBody('private updateGatherNodeTooltip(');
    const guard = body.indexOf('this.gatherTooltipNodeId !== node.id');
    const show = body.indexOf("this.tooltipEl.style.display = 'block'");
    expect(guard).toBeGreaterThan(-1);
    expect(show).toBeGreaterThan(guard);
    expect(body.slice(guard, show)).toContain('}');
  });
});

describe('both panels are reachable', () => {
  it('Hud exposes a public toggle for each', () => {
    expect(hudBody).toContain('toggleSkills(): void {');
    expect(hudBody).toContain('toggleDeeds(): void {');
  });

  it('each has a default desktop keybind that collides with nothing else', () => {
    const skills = BIND_ACTIONS.find((a) => a.id === 'skills');
    const deeds = BIND_ACTIONS.find((a) => a.id === 'deeds');
    expect(skills?.defaults.length).toBeGreaterThan(0);
    expect(deeds?.defaults.length).toBeGreaterThan(0);
    // A default that already belongs to another action is silently evicted on
    // load (Keybinds keeps one code per action, first writer wins), so the panel
    // would sit on a key that never fires. Scoped to these two ids on purpose:
    // the shipped layout already double-books KeyH (targetFriendly / meters),
    // which is a separate, pre-existing question.
    const theirs = new Set([...(skills?.defaults ?? []), ...(deeds?.defaults ?? [])]);
    for (const action of BIND_ACTIONS) {
      if (action.id === 'skills' || action.id === 'deeds') continue;
      for (const code of action.defaults) {
        expect(theirs.has(code), `${code} is claimed by both ${action.id} and a new panel`).toBe(
          false,
        );
      }
    }
  });

  it('the HUD dispatches those two bindings itself, exactly once', () => {
    expect(hudBody).toContain("if (action !== 'skills' && action !== 'deeds') return;");
    expect(hudBody).toContain('this.bindPanelKeys()');
    // A second listener on window would toggle each panel twice per press, which
    // reads as the panel refusing to open. Same guard bindLockpickKeys uses.
    expect(methodBody('private bindPanelKeys(): void {')).toContain(
      'if (this.panelKeyHandler) return;',
    );
  });

  for (const [name, html] of Object.entries(htmlEntries)) {
    it(`${name} carries a desktop micro-button and a phone More-menu entry for each`, () => {
      for (const id of ['mm-skills', 'mm-deeds', 'mobile-skills', 'mobile-deeds']) {
        expect(html, `${name} is missing #${id}`).toContain(`id="${id}"`);
      }
      // The phone entries belong INSIDE the More modal, which is where the
      // tutorial tells a touch player to look ("Tap More, then ...").
      const grid = html.slice(html.indexOf('id="mobile-extra-grid"'));
      expect(grid.indexOf('id="mobile-skills"')).toBeGreaterThan(-1);
      expect(grid.indexOf('id="mobile-deeds"')).toBeGreaterThan(-1);
    });
  }

  it('the phone buttons press through the shared mobile binder', () => {
    expect(mobileControls).toContain("this.bindButton('mobile-skills'");
    expect(mobileControls).toContain("this.bindButton('mobile-deeds'");
    expect(hudBody).toContain('hudPanelButtons.skills =');
    expect(hudBody).toContain('hudPanelButtons.deeds =');
  });

  it('the desktop micro-buttons are wired and keep a live keycap', () => {
    expect(hudBody).toContain("document.getElementById('mm-skills')?.addEventListener");
    expect(hudBody).toContain("document.getElementById('mm-deeds')?.addEventListener");
    expect(hudBody).toContain("['#mm-skills', 'skills'");
    expect(hudBody).toContain("['#mm-deeds', 'deeds'");
  });
});

describe('a harvest prints exactly one chat line', () => {
  it('completeHarvest grants silently and keeps quest credit', () => {
    const start = sim.indexOf('private completeHarvest(');
    expect(start).toBeGreaterThan(-1);
    const body = sim.slice(start, start + sim.slice(start).indexOf('\n  }\n'));
    // addItem emits its own "You receive: X" loot line, which duplicated the
    // gatherHarvest line the HUD already prints (and drops its rarity colour).
    expect(body).not.toMatch(/this\.addItem\(/);
    expect(body).toContain('this.addItemSilent(res.itemId, res.qty, meta)');
    // addItemSilent skips the quest hook too, so it has to be called by hand or
    // a "gather 5 copper ore" objective silently stops counting.
    expect(body).toContain('this.onInventoryChangedForQuests(meta)');
  });
});
