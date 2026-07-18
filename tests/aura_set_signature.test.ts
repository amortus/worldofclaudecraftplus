import { describe, expect, it, vi } from 'vitest';

// hud.ts transitively imports the character-asset module, whose import-time GLB
// preload sweep cannot run under Node; stub it so the pure helper is testable.
vi.mock('../src/render/characters/assets', () => ({
  preloadMechAssets: () => Promise.resolve(),
}));
// With assets stubbed, portrait readiness would fire synchronously at import
// and touch `document`; stub the portrait module too (nothing here renders).
vi.mock('../src/render/characters/portrait', () => ({
  onPortraitsReady: () => {},
  portraitsReady: () => false,
  playerPortraitDataUrl: () => null,
  visualPortraitDataUrl: () => null,
}));

import { auraSetSignature } from '../src/ui/hud';

// Pins the contract of the mobile HUD aura throttle: on GFX.hudThrottled tiers
// the full aura repaint runs at the 10Hz cadence, and this signature (compared
// every frame) is the ONLY thing that bypasses the gate. It must therefore
// change on any aura-set change a player can see instantly (gain, drop,
// reorder-with-different-set, stack count), and must NOT change on the
// steady-state duration countdown, which is exactly what the gate defers.
describe('auraSetSignature', () => {
  it('is stable for the same set regardless of remaining duration', () => {
    const a = [
      { id: 'rend', stacks: 1, remaining: 9.7 },
      { id: 'sunder_armor', stacks: 3, remaining: 22.1 },
    ];
    const later = [
      { id: 'rend', stacks: 1, remaining: 2.3 },
      { id: 'sunder_armor', stacks: 3, remaining: 14.8 },
    ];
    expect(auraSetSignature(a)).toBe(auraSetSignature(later));
  });

  it('changes when an aura is gained or dropped', () => {
    const base = [{ id: 'rend', stacks: 1 }];
    const gained = [{ id: 'rend', stacks: 1 }, { id: 'battle_shout', stacks: 1 }];
    expect(auraSetSignature(gained)).not.toBe(auraSetSignature(base));
    expect(auraSetSignature([])).not.toBe(auraSetSignature(base));
  });

  it('changes when a stack count changes', () => {
    const three = [{ id: 'sunder_armor', stacks: 3 }];
    const four = [{ id: 'sunder_armor', stacks: 4 }];
    expect(auraSetSignature(three)).not.toBe(auraSetSignature(four));
  });

  it('treats missing stacks as zero, matching renderAuras', () => {
    expect(auraSetSignature([{ id: 'rend' }])).toBe(auraSetSignature([{ id: 'rend', stacks: 0 }]));
  });
});
