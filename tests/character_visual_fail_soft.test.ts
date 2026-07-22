import { describe, expect, it, vi } from 'vitest';
import type { Entity } from '../src/sim/types';

// A character asset that was never registered as preloaded used to throw
// synchronously from resolvedGltf inside the per-frame render path
// (Renderer.sync -> createView -> new CharacterVisual), which permanently
// stalled rendering and spammed the console once per frame. The factory now
// fails soft: it returns null so the caller skips that entity's view for the
// frame (the entity stays a future view candidate), and the miss logs once per
// asset, not once per frame.
function mockGltfLoad(): void {
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => new Promise(() => undefined)),
    loadHdr: vi.fn(() => new Promise(() => undefined)),
    loadTexture: vi.fn(() => new Promise(() => undefined)),
    releaseGltf: vi.fn(),
  }));
}

// A player wearing the mech skin catalog resolves to the lazyPreload
// player_mech visual, whose GLB the eager boot sweep never fetches, so the
// factory hits the real "character asset not preloaded" path with no asset
// work needed.
const mechEntity = {
  kind: 'player',
  id: 1,
  templateId: 'warrior',
  skinCatalog: 'mech',
  color: 0xffffff,
  skin: 0,
  mainhandItemId: null,
} as unknown as Entity;

describe('createCharacterVisual fails soft on a missing preload', () => {
  it('returns null instead of throwing, and logs the miss once per asset', async () => {
    vi.resetModules();
    mockGltfLoad();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { createCharacterVisual } = await import('../src/render/characters/index');

    const first = createCharacterVisual(mechEntity);
    const second = createCharacterVisual(mechEntity);
    expect(first).toBeNull();
    expect(second).toBeNull();

    // One log for the first miss, none for the repeat; the log names the asset
    // so a real incident is diagnosable from a single line.
    const missLogs = errSpy.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('player_mech')),
    );
    expect(missLogs).toHaveLength(1);
    errSpy.mockRestore();
  });
});

describe('logAssetMissOnce', () => {
  it('logs a key the first time only, independently per key', async () => {
    vi.resetModules();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { logAssetMissOnce } = await import('../src/render/characters/asset_miss_log');

    expect(logAssetMissOnce('k1', 'first k1 failure:')).toBe(true);
    expect(logAssetMissOnce('k1', 'repeat k1 failure:')).toBe(false);
    expect(logAssetMissOnce('k2', 'first k2 failure:')).toBe(true);
    expect(errSpy).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });
});
