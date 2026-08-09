import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// vfx.ts registers 16 sprite-texture preloads at import time; in Node there is
// no DOM image loader, so stub the asset layer before importing the module.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));

import { uploadPrefix } from '../src/render/upload_range';
import { VfxPoolLedger } from '../src/render/vfx';

// Regression: `addUpdateRange`/`setDrawRange` appeared nowhere in src/, so every
// pool that flagged `needsUpdate` re-uploaded its FULL backing array each frame
// (three.js uploads everything when an attribute has no update ranges), and the
// VFX points mesh additionally ran the vertex shader over all 512 mobile pool
// slots with the dead ones merely hidden by size = 0. The live data is always a
// leading prefix, so both the upload and the draw can be bounded exactly.

describe('uploadPrefix', () => {
  it('flags exactly the leading prefix, in array ELEMENTS not vertices', () => {
    const attr = new THREE.BufferAttribute(new Float32Array(512 * 3), 3);
    const versionBefore = attr.version;
    uploadPrefix(attr, 4);
    expect(attr.updateRanges).toEqual([{ start: 0, count: 12 }]);
    // needsUpdate is write-only in three; the version bump is the observable
    expect(attr.version).toBe(versionBefore + 1);
  });

  it('scales by itemSize for scalar, vector and instance-matrix attributes', () => {
    const scalar = new THREE.BufferAttribute(new Float32Array(64), 1);
    uploadPrefix(scalar, 7);
    expect(scalar.updateRanges).toEqual([{ start: 0, count: 7 }]);

    const matrices = new THREE.InstancedBufferAttribute(new Float32Array(48 * 16), 16);
    uploadPrefix(matrices, 5);
    expect(matrices.updateRanges).toEqual([{ start: 0, count: 80 }]);
  });

  it('never stacks ranges when frames go by without an upload', () => {
    // WebGLAttributes clears update ranges only on a frame it really uploads, so
    // an un-rendered frame would otherwise leave its range behind and grow the
    // list without bound.
    const attr = new THREE.BufferAttribute(new Float32Array(300), 3);
    for (let frame = 0; frame < 50; frame++) uploadPrefix(attr, frame + 1);
    expect(attr.updateRanges).toEqual([{ start: 0, count: 50 * 3 }]);
  });

  it('uploads nothing for an empty prefix, and does NOT fall back to a full upload', () => {
    const attr = new THREE.BufferAttribute(new Float32Array(300), 3);
    attr.needsUpdate = true; // a caller's pending FULL upload (e.g. after clear())
    const versionBefore = attr.version;
    uploadPrefix(attr, 0);
    // no range added => three still uploads the whole array, which is what the
    // pending flag asked for; and the flag itself is untouched
    expect(attr.updateRanges).toEqual([]);
    expect(attr.version).toBe(versionBefore);
  });
});

describe('vfx draw/upload prefix', () => {
  it('scanBound is a true upper bound on live slots, so the prefix is safe to draw', () => {
    const l = new VfxPoolLedger(8);
    const live = new Set<number>();
    for (let i = 0; i < 5; i++) live.add(l.acquire(false));
    // slot 4 dies, the ring keeps allocating forward
    live.delete(4);
    l.onDeath();
    live.add(l.acquire(false));
    for (const slot of live) expect(slot).toBeLessThan(l.scanBound());
    expect(l.scanBound()).toBeLessThanOrEqual(8);
  });

  it('an idle pool draws and uploads nothing at all', () => {
    const l = new VfxPoolLedger(512);
    expect(l.scanBound()).toBe(0);
    expect(l.endFrame()).toBe('skip'); // renderer collapses the draw range to 0
  });

  it('a single spark bounds the pool to a handful of slots, not the full capacity', () => {
    const l = new VfxPoolLedger(512);
    l.acquire(false);
    expect(l.scanBound()).toBe(1); // 1 point uploaded and drawn, not 512
    expect(l.endFrame()).toBe('active');
    // it dies: the flush frame still covers the slot whose size was just zeroed
    l.onDeath();
    const boundAtDeath = l.scanBound();
    expect(boundAtDeath).toBe(1);
    expect(l.endFrame()).toBe('flush');
    expect(l.endFrame()).toBe('skip');
  });
});
