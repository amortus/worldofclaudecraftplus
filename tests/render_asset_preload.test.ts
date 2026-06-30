import { describe, expect, it } from 'vitest';
import { characterPreloadUrls, manifestUrlsForGraphics } from '../src/render/characters/manifest';

// Guard against the "Could not start the renderer" entry crash. characters/assets.ts
// freezes its GLB PRELOAD set at module-import time from a graphics-tier GUESS
// (GFX.standardMaterials), but PLACEMENT runs later against the LIVE tier resolved inside
// the Renderer constructor (initGfxTier reassigns the GFX global after import). When the
// import-time guess came in LOWER than the live render tier (weak/hybrid-GPU probe guesses
// low, the high-performance renderer resolves medium+), a character body was placed that
// the lower import tier never preloaded, and the synchronous accessor threw "character
// asset not preloaded", crashing world entry.
//
// The fix makes the preload set tier-INDEPENDENT (a superset of every tier's placement
// set). These tests assert that invariant at EVERY import-time tier, in particular the
// lowest (the only one that could shrink the set and crash).
describe('character preload set covers placement at every graphics tier', () => {
  const low = new Set(manifestUrlsForGraphics(false));
  const high = new Set(manifestUrlsForGraphics(true));
  const union = new Set([...low, ...high]);

  it('a real tier divergence exists (low aliases a body GLB the high tier still places)', () => {
    // If this ever goes empty, the LOW_URL_ALIAS divergence is gone and this guard no
    // longer guards anything: revisit. Today the mob_bandit body (rogue_hooded.glb), the
    // humanoid default and global mob fallback, is the diverging key.
    const onlyHigh = [...high].filter((u) => !low.has(u));
    expect(onlyHigh.length).toBeGreaterThan(0);
    expect(onlyHigh.some((u) => u.includes('rogue_hooded'))).toBe(true);
  });

  it('preloads the union of both tiers regardless of the import-time tier guess', () => {
    for (const importTierStandardMaterials of [false, true]) {
      const preload = new Set(characterPreloadUrls(importTierStandardMaterials));
      for (const url of union) {
        expect(
          preload.has(url),
          `import tier sm=${importTierStandardMaterials} must preload ${url}`,
        ).toBe(true);
      }
    }
  });
});
