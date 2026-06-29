// Pure terrain painter for the world-map / minimap background. Kept
// host-agnostic (no DOM, no canvas) so it can be unit-tested directly and so
// the heavy per-pixel work can be time-sliced across idle callbacks by the HUD
// without forking the pixel math. It writes straight into a flat RGBA buffer
// (the same `Uint8ClampedArray` an `ImageData.data` exposes).
//
// The colours sample the SAME `terrainHeight`/`roadDistance` the renderer and
// sim use, so the map always matches the real world, do not diverge them.
import { ZONES } from '../sim/data';
import { terrainHeight, roadDistance, WATER_LEVEL, zoneBiomeAt } from '../sim/world';

export interface MapRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Pixel height of a W-wide terrain canvas covering `region` (square-pixel).
export function mapCanvasHeight(W: number, region: MapRegion): number {
  return Math.round((W * (region.maxZ - region.minZ)) / (region.maxX - region.minX));
}

// Deterministic per-pixel noise in [-1, 1] — breaks up flat colour bands.
function pixelNoise(ix: number, iy: number): number {
  let h = Math.imul(ix * 1619 ^ iy * 31337, 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) & 0xff) / 127.5 - 1;
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

// Paint rows [y0, y1) of a W×H RGBA buffer for `region`. Splitting by whole
// rows is what lets the prewarm chunk the work; chunked renders are byte-
// identical to a single-pass because the N-S hillshade re-samples terrainHeight
// directly rather than relying on a stored row buffer.
export function paintTerrainRows(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  region: MapRegion,
  seed: number,
  y0: number,
  y1: number,
): void {
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;

  for (let iy = y0; iy < y1; iy++) {
    let prevH = 0;
    for (let ix = 0; ix < W; ix++) {
      // +Z up, +X LEFT: facing 0 is +Z ("north") and turning right decreases
      // facing, so the world's east is -X, and drawing +X to the right mirrored
      // the whole map east-west
      const x = region.maxX - (ix / W) * spanX;
      const z = region.maxZ - (iy / H) * spanZ;
      const h = terrainHeight(x, z, seed);

      // N-S hillshade neighbour: one extra terrainHeight call per pixel, correct
      // across chunk boundaries without a stored row buffer.
      const zAbove = region.maxZ - ((iy - 1) / H) * spanZ;
      const hAbove = iy > 0 ? terrainHeight(x, zAbove, seed) : h;

      const biome = zoneBiomeAt(z);

      // Base biome colour (flat / low terrain)
      let r: number, g: number, b: number;
      if (biome === 'marsh')       { r = 52;  g = 90;  b = 52; }
      else if (biome === 'peaks')  { r = 94;  g = 104; b = 82; }
      else if (biome === 'blight') { r = 72;  g = 64;  b = 50; }
      else                         { r = 66;  g = 118; b = 48; } // forest/plains

      // Height-based overlays with smooth transitions
      if (h < WATER_LEVEL) {
        // Deep → shallow water gradient
        const t = Math.min(1, Math.max(0, WATER_LEVEL - h) / 4);
        r = lerp(58, 30, t); g = lerp(120, 78, t); b = lerp(175, 148, t);
      } else if (h < WATER_LEVEL + 0.9) {
        // Sandy shore fringe
        const t = smoothstep(WATER_LEVEL, WATER_LEVEL + 0.9, h);
        r = lerp(185, r, t); g = lerp(165, g, t); b = lerp(108, b, t);
      } else if (h > 26) {
        // Snow cap
        r = 218; g = 222; b = 225;
      } else if (h > 22) {
        // Rock → snow blend
        const t = smoothstep(22, 26, h);
        r = lerp(130, 218, t); g = lerp(126, 222, t); b = lerp(114, 225, t);
      } else if (h > 14) {
        // High grass → rock blend
        const t = smoothstep(14, 22, h);
        r = lerp(r, 130, t); g = lerp(g, 126, t); b = lerp(b, 114, t);
      } else if (h > 8) {
        // Low → high grass blend
        const t = smoothstep(8, 14, h);
        r = lerp(r, r - 12, t); g = lerp(g, g - 10, t); b = lerp(b, b + 14, t);
      }

      // Hub cobblestone
      let nearHub = false;
      for (const zn of ZONES) {
        if (Math.hypot(x - zn.hub.x, z - zn.hub.z) < 14) { nearHub = true; break; }
      }
      if (nearHub) {
        r = 152; g = 122; b = 80;
      } else if (h >= WATER_LEVEL && roadDistance(x, z) < 2.4) {
        r = 158; g = 130; b = 84;
      }

      // 2-axis hillshade: NW light source (west-east + north-south slopes)
      if (h >= WATER_LEVEL) {
        const left = ix === 0 ? h : prevH;
        const slopeEW = (h - left) * 0.20;
        const slopeNS = (h - hAbove) * 0.13;
        const shade = Math.max(0.68, Math.min(1.40, 1 + slopeEW + slopeNS));
        r = Math.min(255, r * shade);
        g = Math.min(255, g * shade);
        b = Math.min(255, b * shade);
      }
      prevH = h;

      // Per-pixel noise (±8) to break up flat colour bands
      const n = pixelNoise(ix, iy) * 8;
      const k = (iy * W + ix) * 4;
      data[k]     = Math.max(0, Math.min(255, r + n));
      data[k + 1] = Math.max(0, Math.min(255, g + n));
      data[k + 2] = Math.max(0, Math.min(255, b + n));
      data[k + 3] = 255;
    }
  }
}
