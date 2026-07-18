import { describe, expect, it, vi } from 'vitest';

// vfx.ts registers 16 sprite-texture preloads at import time; in Node there is
// no DOM image loader, so stub the asset layer before importing the module.
// The ledger under test is pure (no THREE types), so nothing else is needed.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));

import { VfxPoolLedger } from '../src/render/vfx';

describe('VfxPoolLedger', () => {
  it('starts quiescent: nothing to scan, uploads skipped', () => {
    const l = new VfxPoolLedger(8);
    expect(l.live).toBe(0);
    expect(l.scanBound()).toBe(0);
    expect(l.endFrame()).toBe('skip');
    expect(l.endFrame()).toBe('skip');
  });

  it('allocates ring slots in order and wraps at capacity', () => {
    const l = new VfxPoolLedger(3);
    expect(l.acquire(false)).toBe(0);
    expect(l.acquire(false)).toBe(1);
    expect(l.acquire(false)).toBe(2);
    expect(l.nextSlot).toBe(0);
    expect(l.acquire(true)).toBe(0); // wrapped onto a live slot
  });

  it('counts live particles, not overwrites of still-live slots', () => {
    const l = new VfxPoolLedger(2);
    l.acquire(false);
    l.acquire(false);
    expect(l.live).toBe(2);
    // ring wraps onto slot 0 while its occupant is alive: replaced, not added
    l.acquire(true);
    expect(l.live).toBe(2);
    l.onDeath();
    l.onDeath();
    expect(l.live).toBe(0);
  });

  it('stays active while particles live, flushes once when empty, then skips', () => {
    const l = new VfxPoolLedger(8);
    l.acquire(false);
    expect(l.endFrame()).toBe('active');
    expect(l.endFrame()).toBe('active');
    l.onDeath();
    // the frame the last particle dies must still upload its zeroed size once
    expect(l.endFrame()).toBe('flush');
    expect(l.endFrame()).toBe('skip');
    expect(l.endFrame()).toBe('skip');
  });

  it('bounds the scan by the high-water mark, surviving ring wrap', () => {
    const l = new VfxPoolLedger(4);
    l.acquire(false);
    l.acquire(false);
    l.acquire(false);
    expect(l.scanBound()).toBe(3);
    l.acquire(false); // slot 3
    l.acquire(true); // wraps to slot 0; the mark must NOT drop with the head
    expect(l.scanBound()).toBe(4);
  });

  it('resets the high-water mark only after the quiescent flush', () => {
    const l = new VfxPoolLedger(8);
    l.acquire(false);
    l.acquire(false);
    expect(l.scanBound()).toBe(2);
    l.onDeath();
    expect(l.endFrame()).toBe('active');
    expect(l.scanBound()).toBe(2); // one still alive: keep scanning both slots
    l.onDeath();
    expect(l.endFrame()).toBe('flush');
    expect(l.scanBound()).toBe(0); // quiescent: nothing left to scan
    // reawakening starts a fresh mark from the current head position
    expect(l.acquire(false)).toBe(2);
    expect(l.scanBound()).toBe(3);
    expect(l.endFrame()).toBe('active');
  });

  it('reset() wipes state but still owes one flush upload', () => {
    const l = new VfxPoolLedger(4);
    l.acquire(false);
    l.acquire(false);
    l.reset();
    expect(l.live).toBe(0);
    expect(l.scanBound()).toBe(0);
    expect(l.nextSlot).toBe(0);
    // clear() zeroes the CPU buffers; that zeroed state must reach the GPU once
    expect(l.endFrame()).toBe('flush');
    expect(l.endFrame()).toBe('skip');
  });

  it('never undercounts to negative on spurious deaths', () => {
    const l = new VfxPoolLedger(4);
    l.onDeath();
    expect(l.live).toBe(0);
    l.acquire(false);
    expect(l.live).toBe(1);
  });
});
