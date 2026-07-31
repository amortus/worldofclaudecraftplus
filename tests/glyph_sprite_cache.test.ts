import { describe, expect, it } from 'vitest';
import {
  GlyphSpriteCache,
  type GlyphSpriteGeometry,
  type GlyphSpriteSurface,
  glyphBlitX,
  glyphBlitY,
} from '../src/ui/glyph_sprite_cache';

// The minimap's NPC quest glyphs used to be a per-marker `ctx.font = ...` +
// `fillText` on a 10Hz redraw. Every canvas text entry point re-resolves font state
// against the document, so that got expensive exactly when the frame was already
// busy. Rasterizing each (glyph, color) once and blitting it is flat.

const GEOM: GlyphSpriteGeometry = { size: 16, originX: 2, baselineY: 12 };

interface FakeCall {
  glyph: string;
  x: number;
  y: number;
  font: string;
  fillStyle: string;
}

class FakeSurface implements GlyphSpriteSurface {
  width = 0;
  height = 0;
  constructor(
    private readonly calls: FakeCall[],
    private readonly contextAvailable: () => boolean,
  ) {}
  getContext(_id: '2d'): CanvasRenderingContext2D | null {
    if (!this.contextAvailable()) return null;
    const calls = this.calls;
    const ctx = {
      font: '',
      fillStyle: '',
      fillText(glyph: string, x: number, y: number) {
        calls.push({ glyph, x, y, font: ctx.font, fillStyle: String(ctx.fillStyle) });
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  }
}

function harness(contextAvailable = () => true) {
  const calls: FakeCall[] = [];
  let created = 0;
  const cache = new GlyphSpriteCache<FakeSurface>('bold 11px Georgia', GEOM, () => {
    created++;
    return new FakeSurface(calls, contextAvailable);
  });
  return { cache, calls, createdCount: () => created };
}

describe('GlyphSpriteCache', () => {
  it('rasterizes a glyph once at the configured font, origin and color', () => {
    const { cache, calls } = harness();
    const sprite = cache.sprite('?', '#ffd100');
    expect(sprite.width).toBe(16);
    expect(sprite.height).toBe(16);
    expect(calls).toEqual([
      { glyph: '?', x: 2, y: 12, font: 'bold 11px Georgia', fillStyle: '#ffd100' },
    ]);
  });

  it('serves repeat lookups from the cache: no second rasterization, same surface', () => {
    const { cache, calls, createdCount } = harness();
    const first = cache.sprite('?', '#ffd100');
    for (let i = 0; i < 50; i++) expect(cache.sprite('?', '#ffd100')).toBe(first);
    expect(calls).toHaveLength(1);
    expect(createdCount()).toBe(1);
  });

  it('keys on BOTH glyph and color, so a theme change re-rasterizes', () => {
    const { cache, calls } = harness();
    cache.sprite('?', '#ffd100');
    cache.sprite('!', '#ffd100');
    cache.sprite('?', '#ff0000');
    expect(calls.map((c) => `${c.glyph}${c.fillStyle}`)).toEqual([
      '?#ffd100',
      '!#ffd100',
      '?#ff0000',
    ]);
    expect(cache.size).toBe(3);
  });

  it('stays bounded by the (glyph, color) product, not by the draw count', () => {
    // The real caller blits one of three glyphs in one theme color, 10 times a
    // second, forever. The cache must not grow with the redraws.
    const { cache } = harness();
    for (let i = 0; i < 500; i++) for (const g of ['?', '!', '•']) cache.sprite(g, '#ffd100');
    expect(cache.size).toBe(3);
  });

  it('draws but never CACHES a sprite when the color resolves empty', () => {
    // A redraw before the stylesheet applies resolves '' for a theme token, and ''
    // is an invalid fillStyle the canvas ignores, so the glyph would rasterize
    // black. Freezing that would keep it black for the rest of the session.
    const { cache, calls } = harness();
    cache.sprite('?', '');
    cache.sprite('?', '');
    expect(calls).toHaveLength(2);
    expect(cache.size).toBe(0);
  });

  it('does not cache a blank sprite when the 2D context is unavailable', () => {
    // A transient context failure must self-heal on the next redraw rather than
    // hiding every glyph for the session.
    let available = false;
    const { cache, calls } = harness(() => available);
    const blank = cache.sprite('?', '#ffd100');
    expect(calls).toHaveLength(0);
    expect(cache.size).toBe(0);
    available = true;
    const real = cache.sprite('?', '#ffd100');
    expect(real).not.toBe(blank);
    expect(calls).toHaveLength(1);
    expect(cache.size).toBe(1);
  });
});

describe('glyph blit geometry', () => {
  it('lands the sprite so its internal origin sits on the inline fillText anchor', () => {
    // The inline site drew fillText(glyph, mx - 2, my + 3); the sprite draws it at
    // (originX, baselineY) internally, so the blit subtracts that.
    expect(glyphBlitX(50 - 2, GEOM)).toBe(46);
    expect(glyphBlitY(50 + 3, GEOM)).toBe(41);
  });

  it('ROUNDS the destination to whole pixels at every sub-pixel phase', () => {
    // Load-bearing, not cosmetic: mx/my are continuous floats, and a fractional
    // drawImage destination is resampled. Unrounded, legibility silently depended
    // on whoever last set imageSmoothingEnabled.
    for (const phase of [0.1, 0.2, 0.5, 0.8, 0.9]) {
      expect(Number.isInteger(glyphBlitX(80 + phase, GEOM))).toBe(true);
      expect(Number.isInteger(glyphBlitY(80 + phase, GEOM))).toBe(true);
    }
    expect(glyphBlitX(10.4, GEOM)).toBe(8);
    expect(glyphBlitX(10.6, GEOM)).toBe(9);
  });

  it('shifts with the anchor rather than pinning to a constant', () => {
    // Polarity: an always-0 implementation would satisfy the rounding checks.
    expect(glyphBlitX(100, GEOM) - glyphBlitX(60, GEOM)).toBe(40);
    expect(glyphBlitY(100, GEOM) - glyphBlitY(60, GEOM)).toBe(40);
  });
});
