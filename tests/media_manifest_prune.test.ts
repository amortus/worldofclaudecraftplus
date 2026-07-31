import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { readFileSync } from 'node:fs';

// The production build ships ONE copy of each media file, the content-hashed one under
// /media. Vite also copies public/ verbatim into dist/, which for a long time meant every
// model, texture, HDRI and vfx sheet was bundled twice (72.7 MiB of exact duplication,
// found by matching md5s between dist/models/x.glb and dist/media/models/x.<hash>.glb).
// The build now prunes the unhashed copies.
//
// Pruning is only safe while the pruned set is exactly the manifest's key set, because
// `assetUrl` in src/render/assets/media.ts resolves a logical path through the manifest
// in production and falls back to the raw path when the key is MISSING. A file under a
// media root that never reaches the manifest would therefore be pruned and then 404.
// These tests pin the two properties that make the prune sound.
const MEDIA_ROOTS = ['models/', 'textures/', 'env/', 'vfx/'];

describe('media manifest prune', () => {
  it('maps every logical media path to a hashed url under /media', () => {
    const wrong: string[] = [];
    for (const [logical, url] of Object.entries(MEDIA_ASSETS)) {
      if (!url.startsWith('/media/')) wrong.push(`${logical} -> ${url}`);
    }
    expect(wrong).toEqual([]);
  });

  it('covers every media root the prune step deletes', () => {
    // If the build ever adds a fifth media root to MEDIA_ROOTS in the emit step without
    // the manifest covering it, this catches the mismatch before a release ships a
    // bundle missing those files entirely.
    const script = readFileSync('scripts/build_media_manifest.mjs', 'utf8');
    const declared = /const MEDIA_ROOTS = \[([^\]]+)\]/.exec(script);
    expect(declared, 'MEDIA_ROOTS is still declared in the build script').toBeTruthy();
    const roots = [...declared![1].matchAll(/'([^']+)'/g)].map((m) => `${m[1]}/`);
    expect(roots.sort()).toEqual([...MEDIA_ROOTS].sort());

    // And every manifest key must sit under one of them, so the prune never reaches a
    // file the manifest did not account for.
    const stray = Object.keys(MEDIA_ASSETS).filter((k) => !roots.some((r) => k.startsWith(r)));
    expect(stray).toEqual([]);
  });

  it('gives every asset a distinct hashed url', () => {
    // Two logical paths colliding on one hashed url would mean the prune deletes two
    // originals while only one survives.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const [logical, url] of Object.entries(MEDIA_ASSETS)) {
      const owner = seen.get(url);
      if (owner) collisions.push(`${logical} collides with ${owner}`);
      else seen.set(url, logical);
    }
    expect(collisions).toEqual([]);
  });
});
