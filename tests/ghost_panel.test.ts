// The corpse-run panel's pure half: which buttons light up, what the readout
// says, and the repaint signature that keeps a walking ghost off the DOM. The
// DOM consumer (mountGhostPanel) is a thin writer over exactly this.

import { describe, expect, it } from 'vitest';
import { ghostPanelSignature, ghostPanelView } from '../src/ui/ghost_panel';
import { ghostEventLines } from '../src/ui/ghost_feedback';
import type { GhostView } from '../src/world_api';

const ghost = (over: Partial<GhostView> = {}): GhostView => ({
  corpse: { x: 10, y: 0, z: 10 },
  corpseDistance: 100,
  corpseInRange: false,
  spiritHealerInRange: true,
  ...over,
});

describe('ghost panel view', () => {
  it('offers the corpse button only in range, and always names both roads', () => {
    const far = ghostPanelView(ghost());
    expect(far.corpseVisible).toBe(true);
    expect(far.corpseEnabled).toBe(false);
    expect(far.healerEnabled).toBe(true);
    expect(far.corpseLine).toContain('100');

    const near = ghostPanelView(ghost({ corpseDistance: 4, corpseInRange: true }));
    expect(near.corpseEnabled).toBe(true);
    expect(near.corpseLine).not.toContain('4'); // the in-range line, not a distance
  });

  it('hides the corpse button outright when the death left no body', () => {
    const v = ghostPanelView(ghost({ corpse: null, corpseDistance: null }));
    expect(v.corpseVisible).toBe(false);
    expect(v.corpseEnabled).toBe(false);
    // ...and says so, so a rift death is never a mystery.
    expect(v.corpseLine.length).toBeGreaterThan(0);
  });

  it('states the price inside the healer line, not glued on after it', () => {
    // One key per case: the cost is part of the sentence, so a locale can lead
    // with it and no untranslatable punctuation joins two `t()` results.
    for (const inRange of [true, false]) {
      const line = ghostPanelView(ghost({ spiritHealerInRange: inRange })).healerLine;
      expect(line).toContain('Resurrection Sickness');
    }
  });

  it('renders every string through the catalog (no empty or raw-key output)', () => {
    for (const v of [ghostPanelView(ghost()), ghostPanelView(ghost({ corpse: null, corpseDistance: null }))]) {
      for (const [key, value] of Object.entries(v)) {
        if (typeof value !== 'string') continue;
        expect(value.length, key).toBeGreaterThan(0);
        expect(value, key).not.toContain('hudChrome.');
      }
    }
  });
});

describe('repaint signature', () => {
  it('is empty for a living player, so the panel simply hides', () => {
    expect(ghostPanelSignature(null)).toBe('');
  });

  it('is stable while the ghost stays inside the same whole yard', () => {
    // The readout shows whole yards, so a running spirit must not rewrite the
    // DOM twenty times a second on the reference phone.
    const a = ghostPanelSignature(ghost({ corpseDistance: 42.1 }));
    const b = ghostPanelSignature(ghost({ corpseDistance: 42.4 }));
    expect(a).toBe(b);
    expect(ghostPanelSignature(ghost({ corpseDistance: 43.6 }))).not.toBe(a);
  });

  it('changes the moment a button would change state', () => {
    const base = ghostPanelSignature(ghost());
    expect(ghostPanelSignature(ghost({ corpseInRange: true }))).not.toBe(base);
    expect(ghostPanelSignature(ghost({ spiritHealerInRange: false }))).not.toBe(base);
    expect(ghostPanelSignature(ghost({ corpse: null }))).not.toBe(base);
  });
});

describe('event lines', () => {
  it('renders each of the three sim events, and ignores an unknown id', () => {
    expect(ghostEventLines({ type: 'ghostRelease', corpse: { x: 0, y: 0, z: 0 } })).toHaveLength(1);
    expect(ghostEventLines({ type: 'ghostRelease', corpse: null })).toHaveLength(1);
    // The release line differs by whether a corpse run is even possible.
    expect(ghostEventLines({ type: 'ghostRelease', corpse: { x: 0, y: 0, z: 0 } })[0].text).not.toBe(
      ghostEventLines({ type: 'ghostRelease', corpse: null })[0].text,
    );
    // A sickened resurrection gets a second line naming the cost.
    expect(ghostEventLines({ type: 'ghostResurrect', via: 'healer', sickness: 600 })).toHaveLength(2);
    expect(ghostEventLines({ type: 'ghostResurrect', via: 'corpse', sickness: 0 })).toHaveLength(1);
    expect(ghostEventLines({ type: 'ghostDeny', reason: 'corpse_too_far' })).toHaveLength(1);
    // A newer server's id produces no line rather than a throw.
    expect(ghostEventLines({ type: 'ghostDeny', reason: 'from_the_future' })).toHaveLength(0);
    expect(ghostEventLines({ type: 'ghostResurrect', via: 'from_the_future' })).toHaveLength(0);
  });
});
