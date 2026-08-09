import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// terrain.ts kicks its PBR splat JPEGs off at module import and hands them to
// the preload gate; there is no browser TextureLoader in plain Node.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
  loadGltf: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));

import { freezeStaticMatrices } from '../src/render/static_matrices';
import { selectionRingNeedsRedrape } from '../src/render/selection_ring';

const { terrainIndexArray } = await import('../src/render/terrain');

describe('terrain chunk index width', () => {
  it('uses 16-bit indices for the chunk sizes this terrain actually builds', () => {
    // a full-detail 60u chunk is roughly 530 vertices including the skirt ring
    const idx = terrainIndexArray(530, 512 * 6);
    expect(idx).toBeInstanceOf(Uint16Array);
    expect(idx.length).toBe(512 * 6);
    // half the bytes of the Uint32Array this used to allocate unconditionally
    expect(idx.byteLength).toBe(512 * 6 * 2);
  });

  it('still addresses the whole grid at the 16-bit boundary', () => {
    // the largest index written is vertexCount - 1
    expect(terrainIndexArray(65535, 6)).toBeInstanceOf(Uint16Array);
    expect(65535 - 1).toBeLessThanOrEqual(0xffff);
  });

  it('falls back to 32-bit indices for a grid that cannot fit', () => {
    expect(terrainIndexArray(65536, 6)).toBeInstanceOf(Uint32Array);
    expect(terrainIndexArray(300_000, 6)).toBeInstanceOf(Uint32Array);
  });
});

describe('selection ring settle', () => {
  const THRESH_SQ = 0.08 * 0.08;
  const state = () => ({ targetId: 7, x: 10, z: 20, scale: 1 });

  it('skips the re-drape while the target holds still', () => {
    expect(selectionRingNeedsRedrape(state(), 7, 10, 20, 1, THRESH_SQ)).toBe(false);
    // sub-threshold jitter (interpolation wobble) is not worth 48 samples
    expect(selectionRingNeedsRedrape(state(), 7, 10.02, 20.01, 1, THRESH_SQ)).toBe(false);
  });

  it('re-drapes once the target really moves', () => {
    expect(selectionRingNeedsRedrape(state(), 7, 10.5, 20, 1, THRESH_SQ)).toBe(true);
    expect(selectionRingNeedsRedrape(state(), 7, 10, 21, 1, THRESH_SQ)).toBe(true);
  });

  it('always re-drapes for a new target or a resize, however close', () => {
    // switching targets must never inherit the previous ring's geometry
    expect(selectionRingNeedsRedrape(state(), 8, 10, 20, 1, THRESH_SQ)).toBe(true);
    expect(selectionRingNeedsRedrape(state(), 7, 10, 20, 1.4, THRESH_SQ)).toBe(true);
  });
});

describe('freezeStaticMatrices', () => {
  const scene = () => {
    const root = new THREE.Group();
    const building = new THREE.Group();
    building.position.set(12, 0, -4);
    const wall = new THREE.Mesh(new THREE.BufferGeometry());
    const flame = new THREE.Mesh(new THREE.BufferGeometry());
    flame.position.set(0, 1.2, 0);
    building.add(wall, flame);
    root.add(building);
    return { root, building, wall, flame };
  };

  it('stops static objects recomposing their matrix every frame', () => {
    const { root, building, wall } = scene();
    freezeStaticMatrices(root);
    expect(root.matrixAutoUpdate).toBe(false);
    expect(building.matrixAutoUpdate).toBe(false);
    expect(wall.matrixAutoUpdate).toBe(false);
  });

  it('leaves world matrices correct after the freeze', () => {
    const { root, building, wall } = scene();
    freezeStaticMatrices(root);
    root.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixPosition(building.matrixWorld).x).toBe(12);
    expect(new THREE.Vector3().setFromMatrixPosition(wall.matrixWorld).z).toBe(-4);
  });

  it('spares the objects that still animate their own transform', () => {
    const { root, flame } = scene();
    freezeStaticMatrices(root, new Set([flame]));
    expect(flame.matrixAutoUpdate).toBe(true);
    // the flicker rescale the renderer applies every frame still reaches the GPU
    flame.scale.setScalar(1.3);
    root.updateMatrixWorld(true);
    const s = new THREE.Vector3().setFromMatrixScale(flame.matrixWorld);
    expect(s.x).toBeCloseTo(1.3, 6);
  });

  it('does not touch objects added after the freeze (streamed grass, interiors)', () => {
    const { root } = scene();
    freezeStaticMatrices(root);
    const chunk = new THREE.Mesh(new THREE.BufferGeometry());
    chunk.position.set(3, 0, 3);
    root.add(chunk);
    expect(chunk.matrixAutoUpdate).toBe(true);
    root.updateMatrixWorld(true);
    expect(new THREE.Vector3().setFromMatrixPosition(chunk.matrixWorld).x).toBe(3);
  });
});
