// A tiny (glyph, color) sprite cache for canvas text drawn in a hot loop.
//
// WHY, and it is not the usual "ctx.font re-parses the font string" story: EVERY
// canvas text entry point (the `font` setter, `fillText`, `measureText`) re-resolves
// font state against the document, so the cost tracks how dirty the style tree is,
// not the font string. Hoisting `ctx.font` above a draw loop is ordinary hygiene but
// measures no better. The only fix for a per-item text loop is to leave the text API:
// rasterize each distinct (glyph, color) ONCE into an offscreen canvas and blit it.
// A blit is roughly 6x cheaper than a fillText even on a quiet page, and it does not
// degrade when the frame is also writing nameplate transforms.
//
// Host-light on purpose: the canvas factory is injected, so the geometry and the
// caching are unit-testable without a real 2D context (tests/glyph_sprite_cache.test.ts).
// The blit destination MUST be rounded to whole pixels: a fractional drawImage
// destination is resampled, and with imageSmoothingEnabled on that turns a 11px glyph
// to mush. Rounded, it is crisp regardless of who last set that flag.

/** The offscreen surface a rasterized glyph lives on. */
export interface GlyphSpriteSurface {
  width: number;
  height: number;
  getContext(id: '2d'): CanvasRenderingContext2D | null;
}

export interface GlyphSpriteGeometry {
  /** Square sprite edge in px. Must contain the font's full ascent with margin. */
  readonly size: number;
  /** X of the fillText origin inside the sprite. */
  readonly originX: number;
  /** Y of the alphabetic baseline inside the sprite. */
  readonly baselineY: number;
}

/**
 * Where to blit a sprite so its internal fillText origin lands on the anchor an
 * inline `fillText(glyph, anchorX, anchorY)` would have used. Rounded (see header).
 */
export function glyphBlitX(anchorX: number, geom: GlyphSpriteGeometry): number {
  return Math.round(anchorX - geom.originX);
}

export function glyphBlitY(anchorY: number, geom: GlyphSpriteGeometry): number {
  return Math.round(anchorY - geom.baselineY);
}

/**
 * Rasterizes each distinct (color, glyph) pair once and hands back the sprite.
 *
 * Bounded without eviction by construction at every current call site: the glyph set
 * is a closed handful and the color set is a frozen theme palette, so the live map
 * holds a few sprites of `size x size` each. A caller that would feed it unbounded
 * text should not use this.
 */
export class GlyphSpriteCache<TSurface extends GlyphSpriteSurface = HTMLCanvasElement> {
  // Nested color -> glyph rather than one map on a `${glyph}|${color}` composite so
  // the per-marker lookup in a draw loop allocates NO key string.
  private readonly byColor = new Map<string, Map<string, TSurface>>();

  constructor(
    private readonly font: string,
    private readonly geom: GlyphSpriteGeometry,
    private readonly createSurface: () => TSurface,
  ) {}

  /** The sprite for `glyph` in `color`, rasterizing it on first use. */
  sprite(glyph: string, color: string): TSurface {
    let byGlyph = this.byColor.get(color);
    const cached = byGlyph?.get(glyph);
    if (cached) return cached;
    const surface = this.createSurface();
    surface.width = this.geom.size;
    surface.height = this.geom.size;
    const ctx = surface.getContext('2d');
    // A transient context failure must not be frozen: caching a blank sprite would
    // hide the glyph for the rest of the session. Returning it uncached makes this
    // redraw's blit a no-op and self-heals on the next one.
    if (!ctx) return surface;
    ctx.fillStyle = color;
    ctx.font = this.font;
    ctx.fillText(glyph, this.geom.originX, this.geom.baselineY);
    // A redraw before the stylesheet applies can resolve '' for a color token, and
    // '' is an invalid fillStyle the canvas ignores, so the glyph would rasterize in
    // the default black. Draw it this frame (exactly what an inline fillText did)
    // but never freeze it.
    if (color) {
      if (!byGlyph) {
        byGlyph = new Map();
        this.byColor.set(color, byGlyph);
      }
      byGlyph.set(glyph, surface);
    }
    return surface;
  }

  /** Live sprite count, for tests and for reasoning about the bound. */
  get size(): number {
    let n = 0;
    for (const byGlyph of this.byColor.values()) n += byGlyph.size;
    return n;
  }
}
