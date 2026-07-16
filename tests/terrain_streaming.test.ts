import { describe, expect, it, vi } from 'vitest';
import { runIdleQueue } from '../src/render/idle_queue';

// terrain.ts kicks its ~15MB of PBR splat JPEGs off at module import and hands
// them to the preload gate. There is no network (or browser TextureLoader) in
// the plain-Node test env, so stub both asset modules: this suite exercises the
// pure streaming/ordering logic, never the GPU-bound texture path.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));

const { orderFarChunkJobs } = await import('../src/render/terrain');
type Job = Parameters<typeof orderFarChunkJobs>[0][number];

const job = (x0: number, z0: number, size = 64): Job => ({
  x0,
  z0,
  size,
  spacing: 4,
  near: false,
});

describe('orderFarChunkJobs', () => {
  it('keeps the original order when no priority point is given', () => {
    const jobs = [job(0, 0), job(500, 0), job(0, 500)];
    expect(orderFarChunkJobs(jobs)).toEqual(jobs);
  });

  it('never mutates the caller array', () => {
    const jobs = [job(500, 500), job(0, 0)];
    const snapshot = jobs.slice();
    orderFarChunkJobs(jobs, { x: 0, z: 0 });
    expect(jobs).toEqual(snapshot);
  });

  it('streams the chunk under the entry point first', () => {
    const jobs = [job(1000, 1000), job(400, 400), job(0, 0)];
    // an entry point sitting inside the (400,400) chunk, not at world origin
    const ordered = orderFarChunkJobs(jobs, { x: 432, z: 432 });
    expect(ordered[0].x0).toBe(400);
    expect(ordered[0].z0).toBe(400);
  });

  it('orders strictly by distance from the entry point to each chunk centre', () => {
    const jobs = [job(0, 0), job(0, 200), job(0, 100), job(0, 300)];
    const ordered = orderFarChunkJobs(jobs, { x: 32, z: 32 });
    expect(ordered.map((j) => j.z0)).toEqual([0, 100, 200, 300]);
  });

  it('is a permutation: every chunk is streamed exactly once', () => {
    const jobs = Array.from({ length: 25 }, (_, i) => job((i % 5) * 100, Math.floor(i / 5) * 100));
    const ordered = orderFarChunkJobs(jobs, { x: 250, z: 250 });
    expect(ordered).toHaveLength(jobs.length);
    expect(new Set(ordered)).toEqual(new Set(jobs));
  });
});

// The streaming contract buildTerrain relies on, exercised over the same
// runIdleQueue call shape (priority order in, cancellable queue out) without
// needing a WebGL context to mesh real chunks.
describe('far-chunk streaming contract', () => {
  it('builds every far chunk in priority order across idle slots', async () => {
    const pending: (() => void)[] = [];
    const jobs = [job(1000, 1000), job(0, 0), job(400, 400)];
    const built: Job[] = [];
    const done = runIdleQueue(
      orderFarChunkJobs(jobs, { x: 432, z: 432 }),
      (j) => built.push(j),
      { batchSize: 4, timeoutMs: 3000, scheduler: (cb) => pending.push(cb) },
    );
    while (pending.length > 0) pending.shift()?.();
    await done;
    expect(built.map((j) => j.x0)).toEqual([400, 0, 1000]);
  });

  it('cancelStreaming stops further chunks from being built', async () => {
    const pending: (() => void)[] = [];
    const jobs = Array.from({ length: 12 }, (_, i) => job(i * 100, 0));
    const built: Job[] = [];
    let cancelled = false;
    const done = runIdleQueue(jobs, (j) => built.push(j), {
      batchSize: 4,
      timeoutMs: 3000,
      scheduler: (cb) => pending.push(cb),
      cancelled: () => cancelled,
    });
    pending.shift()?.(); // one idle slot lands: first batch of 4 builds
    expect(built).toHaveLength(4);
    cancelled = true; // the view is discarded (e.g. the editor scene disposes)
    while (pending.length > 0) pending.shift()?.();
    await done;
    expect(built).toHaveLength(4); // no chunk built into a discarded group
  });
});
