import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// terrain.ts kicks its ~15MB of PBR splat JPEGs off at module import and paints
// its Lambert detail texture on a canvas. Neither exists in plain Node, so stub
// both: this suite exercises the residency/eviction/rebuild path, never the GPU.
vi.mock('../src/render/assets/loader', () => ({
  loadTexture: () => new Promise(() => {}),
}));
vi.mock('../src/render/assets/preload', () => ({
  registerPreload: () => {},
}));
vi.mock('../src/render/textures', () => {
  const texture = (): THREE.DataTexture =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  return {
    groundDetailTexture: vi.fn(texture),
    groundSplatMaps: vi.fn(() => ({})),
    macroNoiseTexture: vi.fn(texture),
  };
});

const { buildTerrain } = await import('../src/render/terrain');

const SEED = 20061;
/** Far enough that every chunk in the world clears the release radius. */
const AWAY = { x: 0, z: 100_000 };
const HUB = { x: 0, z: 0 };

type View = ReturnType<typeof buildTerrain>;

/** Drives update() until the residency plan has nothing left to do. */
function converge(view: View, at: { x: number; z: number }): void {
  for (let frame = 0; frame < 600; frame++) {
    view.update(at.x, at.z, 1e9);
    if (view.residency().pending === 0) return;
  }
  throw new Error('terrain residency never converged');
}

const ATTRIBUTES = ['position', 'normal', 'color', 'uv', 'aSplat', 'aExtra'] as const;

interface ChunkBytes {
  attributes: Record<string, { ctor: string; bytes: Buffer }>;
  index: { ctor: string; bytes: Buffer } | null;
  boundingSphere: [number, number, number, number];
}

function bufferOf(
  array: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; byteLength: number },
): Buffer {
  // a real byte-for-byte copy, so a later dispose or GC cannot change it
  return Buffer.from(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
}

function snapshot(view: View): Map<string, ChunkBytes> {
  const out = new Map<string, ChunkBytes>();
  for (const child of view.group.children) {
    const mesh = child as THREE.Mesh;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const attributes: ChunkBytes['attributes'] = {};
    for (const name of ATTRIBUTES) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!attr) continue;
      const array = attr.array as Float32Array;
      attributes[name] = { ctor: array.constructor.name, bytes: bufferOf(array) };
    }
    const index = geo.getIndex();
    const sphere = geo.boundingSphere as THREE.Sphere;
    out.set(mesh.name, {
      attributes,
      index: index
        ? {
            ctor: index.array.constructor.name,
            bytes: bufferOf(index.array as Uint16Array),
          }
        : null,
      boundingSphere: [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius],
    });
  }
  return out;
}

/**
 * Byte-for-byte, both ways: the renderer samples the same terrainHeight the sim
 * collides against, so a rebuilt chunk that differs by one float is a visual
 * desync from movement, not a cosmetic wobble.
 */
function expectSameBytes(before: Map<string, ChunkBytes>, after: Map<string, ChunkBytes>): void {
  expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
  for (const [name, rebuilt] of after) {
    const original = before.get(name) as ChunkBytes;
    expect(Object.keys(rebuilt.attributes).sort()).toEqual(Object.keys(original.attributes).sort());
    for (const [attr, rebuiltAttr] of Object.entries(rebuilt.attributes)) {
      const originalAttr = original.attributes[attr];
      expect(rebuiltAttr.ctor, `${name}.${attr} array type`).toBe(originalAttr.ctor);
      expect(
        rebuiltAttr.bytes.equals(originalAttr.bytes),
        `${name}.${attr} must be byte-identical after a rebuild`,
      ).toBe(true);
    }
    expect(rebuilt.index?.ctor).toBe(original.index?.ctor);
    expect(rebuilt.index?.bytes.equals(original.index?.bytes as Buffer)).toBe(true);
    expect(rebuilt.boundingSphere).toEqual(original.boundingSphere);
  }
}

describe('terrain chunk residency', () => {
  it('boots with only the chunks near the entry point, not the whole world', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB);
    const stats = view.residency();

    expect(stats.total).toBeGreaterThan(100); // the whole world's chunk slots
    expect(stats.resident).toBe(stats.desired);
    expect(stats.resident).toBeLessThan(stats.total);
    // this is the number the change exists to move: the old build meshed all of
    // `total` at boot and never released one
    expect(stats.resident / stats.total).toBeLessThan(0.75);
    expect(view.group.children).toHaveLength(stats.resident);
  });

  it('releases far chunks and disposes their geometry, not just their meshes', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB);

    const disposed = new Set<string>();
    const meshes = view.group.children.map((child) => child as THREE.Mesh);
    for (const mesh of meshes) {
      // the exact event THREE.WebGLRenderer listens to in order to delete the
      // chunk's vertex buffers, i.e. the thing renderer.info.memory.geometries counts
      mesh.geometry.addEventListener('dispose', () => disposed.add(mesh.name));
    }
    expect(meshes.length).toBeGreaterThan(0);

    converge(view, AWAY);

    expect(view.residency().resident).toBe(0);
    expect(view.group.children).toHaveLength(0);
    expect(disposed.size).toBe(meshes.length);
    expect(view.residency().released).toBe(meshes.length);
  });

  it('rebuilds an evicted chunk byte-identically', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB);
    const before = snapshot(view);
    expect(before.size).toBeGreaterThan(20);

    converge(view, AWAY); // evict everything
    expect(view.residency().resident).toBe(0);
    converge(view, HUB); // walk back

    const after = snapshot(view);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    // every chunk really was torn down and remade, not quietly kept
    expect(view.residency().built).toBe(before.size * 2);

    expectSameBytes(before, after);
  });

  it('rebuilds the splat tier byte-identically too, attributes and all', async () => {
    // The PBR tier carries two extra per-vertex attributes (aSplat, aExtra) that
    // sampleVertex writes through module-level scratch THREE.Color objects, so it
    // is the path where hidden state between builds would actually show up.
    vi.resetModules();
    vi.doMock('../src/render/assets/loader', () => ({
      loadTexture: () =>
        Promise.resolve(
          new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat),
        ),
    }));
    const splat = await import('../src/render/terrain');
    // let the module-load texture kicks settle so the splat material is chosen
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(splat.hasTerrainSplatAssets()).toBe(true);

    const view = splat.buildTerrain(SEED, HUB) as unknown as View;
    view.cancelStreaming();
    converge(view, HUB);
    const before = snapshot(view);
    expect(before.size).toBeGreaterThan(20);
    const sample = [...before.values()][0];
    expect(Object.keys(sample.attributes)).toContain('aSplat');
    expect(Object.keys(sample.attributes)).toContain('aExtra');

    converge(view, AWAY);
    expect(view.residency().resident).toBe(0);
    converge(view, HUB);

    expectSameBytes(before, snapshot(view));
  });

  it('leaves no hole inside the keep radius and nothing resident past release', async () => {
    const { GFX } = await import('../src/render/gfx');
    const { chunkEdgeDistance } = await import('../src/render/terrain_residency');
    const radii = GFX.terrainResidency;
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    // stand somewhere that is not a hub, so LOD bands of every density are in play
    const spot = { x: 120, z: 420 };
    converge(view, spot);

    let insideKeep = 0;
    for (const child of view.group.children) {
      const mesh = child as THREE.Mesh;
      const sphere = mesh.geometry.boundingSphere as THREE.Sphere;
      const box = mesh.geometry.boundingBox as THREE.Box3;
      const half = (box.max.x - box.min.x) / 2;
      const d = chunkEdgeDistance(
        { centerX: sphere.center.x, centerZ: sphere.center.z, half },
        spot.x,
        spot.z,
      );
      // half is measured off the geometry's own box, which the 0.3u skirt makes
      // very slightly generous; allow a yard of slack rather than re-deriving it
      expect(d).toBeLessThanOrEqual(radii.release + 1);
      if (d <= radii.keep - 1) insideKeep++;
    }
    // a converged residency set has NO gap inside the keep disc: a missing chunk
    // between two resident ones is a hole showing sky through the ground
    expect(insideKeep).toBeGreaterThan(20);
    expect(view.residency().pending).toBe(0);
  });

  it('ignores the fog far plane, so the loading screen upload pass cannot refill the world', () => {
    const view = buildTerrain(SEED, HUB);
    view.cancelStreaming();
    converge(view, HUB);
    const resident = view.residency().resident;

    // renderer.ts's prewarm forces every chunk visible once with fogFar = 1e9 to
    // flush their buffers to the GPU; residency must not read that as "keep the map"
    for (let frame = 0; frame < 50; frame++) view.update(HUB.x, HUB.z, 1e9);
    expect(view.residency().resident).toBe(resident);
    expect(view.group.children.every((c) => c.visible)).toBe(true);

    // and the fog cull still works on the resident set
    view.update(HUB.x, HUB.z, 120);
    expect(view.group.children.some((c) => !c.visible)).toBe(true);
  });
});
