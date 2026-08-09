// The world map draws ONE zone at a time, and every dot it plots (POI labels,
// dungeon portals, quest-giver glyphs, tracked-quest markers, the player arrow,
// party/friend/guild markers) is positioned by projecting a world (x, z) through
// that zone's map rect. Building the rect from the world's bounding box was
// harmless while every zone spanned the strip; on a 3 column grid it made a strip
// zone's map 1080yd wide and a column zone's map the whole grid, silently
// mislocating every marker on it. These tests pin the rect and the projection.
import { describe, expect, it } from 'vitest';
import {
  DUNGEON_X_THRESHOLD, STRIP_MAX_X, STRIP_MIN_X, WORLD_MAX_X, WORLD_MIN_X, WORLD_SIZE, ZONES,
} from '../src/sim/data';
import type { ZoneDef } from '../src/sim/types';
import {
  inMapRegion, mapCanvasHeight, paddedRegion, zoneMapRegion, type MapRegion,
} from '../src/ui/map_terrain';

const zone = (id: string): ZoneDef => {
  const z = ZONES.find((zn) => zn.id === id);
  if (!z) throw new Error(`no zone ${id}`);
  return z;
};

// The map window's own projection (hud.ts `toMap`), at zoom 1 where the drawn
// region IS the zone rect. +X is map-left because facing 0 is +Z.
const S = 280;
const toMap = (region: MapRegion, x: number, z: number) => ({
  mx: ((region.maxX - x) / (region.maxX - region.minX)) * S,
  my: ((region.maxZ - z) / (region.maxZ - region.minZ)) * S,
});

describe('zone map region', () => {
  it('gives a strip zone the strip and a column zone its own column', () => {
    for (const zn of ZONES) {
      const r = zoneMapRegion(zn);
      expect(r.minZ).toBe(zn.zMin);
      expect(r.maxZ).toBe(zn.zMax);
      if (zn.xMin === undefined) {
        expect(r.minX).toBe(STRIP_MIN_X);
        expect(r.maxX).toBe(STRIP_MAX_X);
      } else {
        expect(r.minX).toBe(zn.xMin);
        expect(r.maxX).toBe(zn.xMax);
      }
      // never the whole grid, and never wider than one column
      expect(r.maxX - r.minX).toBe(WORLD_SIZE);
      expect(r.minX).toBeGreaterThanOrEqual(WORLD_MIN_X);
      expect(r.maxX).toBeLessThanOrEqual(WORLD_MAX_X);
    }
  });

  it('keeps a yard square on screen', () => {
    for (const zn of ZONES) {
      const r = zoneMapRegion(zn);
      const W = 480;
      expect(mapCanvasHeight(W, r)).toBe(Math.round((W * (r.maxZ - r.minZ)) / (r.maxX - r.minX)));
      // the strip zones are 360 x 360..1080 rects: a square-pixel canvas is at
      // least as tall as it is wide for every one of them
      expect(mapCanvasHeight(W, r)).toBeGreaterThanOrEqual(W);
    }
  });
});

describe('every marker the zone map plots', () => {
  const vale = zone('eastbrook_vale');
  const alderfen = zone('alderfen_shallows');
  const grimhold = zone('grimhold_crags');
  const valeRegion = zoneMapRegion(vale);
  const alderfenRegion = zoneMapRegion(alderfen);

  it('lands inside the canvas for anything inside the zone', () => {
    for (const zn of [vale, alderfen, grimhold, zone('mirefen_marsh')]) {
      const region = zoneMapRegion(zn);
      const points = [
        { x: zn.hub.x, z: zn.hub.z },
        ...zn.pois.map((p) => ({ x: p.x, z: p.z })),
      ];
      for (const p of points) {
        expect(inMapRegion(region, p.x, p.z), `${zn.id} ${p.x},${p.z}`).toBe(true);
        const { mx, my } = toMap(region, p.x, p.z);
        expect(mx).toBeGreaterThanOrEqual(0);
        expect(mx).toBeLessThanOrEqual(S);
        expect(my).toBeGreaterThanOrEqual(0);
        expect(my).toBeLessThanOrEqual(S);
      }
    }
  });

  it('puts each hub where the eye expects it, not a third of the map off', () => {
    // Reedwatch sits at x 360, dead centre of the east column. With the world
    // box as the rect it landed at 1/6 of the canvas instead of the middle.
    const { mx } = toMap(alderfenRegion, alderfen.hub.x, alderfen.hub.z);
    expect(mx).toBeCloseTo(S / 2, 6);
    const boxRegion = { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: alderfen.zMin, maxZ: alderfen.zMax };
    expect(toMap(boxRegion, alderfen.hub.x, alderfen.hub.z).mx).toBeCloseTo(S / 6, 6);
  });

  it('excludes a neighbouring column that shares the band', () => {
    // The vale, Alderfen and Grimhold share z -180..180: a band test alone puts
    // all three zones' NPCs, portals and quest markers on each other's maps.
    expect(vale.zMin).toBe(alderfen.zMin);
    expect(vale.zMax).toBe(alderfen.zMax);
    expect(inMapRegion(valeRegion, alderfen.hub.x, alderfen.hub.z)).toBe(false);
    expect(inMapRegion(valeRegion, grimhold.hub.x, grimhold.hub.z)).toBe(false);
    expect(inMapRegion(alderfenRegion, vale.hub.x, vale.hub.z)).toBe(false);
    expect(inMapRegion(alderfenRegion, alderfen.hub.x, alderfen.hub.z)).toBe(true);
  });

  it('excludes the instance plane, which the old x <= WORLD_MAX_X bound covered', () => {
    for (const zn of ZONES) {
      const region = zoneMapRegion(zn);
      expect(inMapRegion(region, DUNGEON_X_THRESHOLD + 100, zn.hub.z)).toBe(false);
    }
  });

  it('commits the new zone once past the last zone rect, on either axis', () => {
    // hud.ts's zone-change dead band: the map, the banner and the welcome text
    // all follow the committed zone, and an east-west border is crossed at a
    // constant z, so a z-only dead band could never be satisfied.
    const DEADBAND = 5;
    const past = (from: ZoneDef, x: number, z: number): boolean =>
      !inMapRegion(paddedRegion(zoneMapRegion(from), DEADBAND), x, z);
    // walking east out of the vale into Alderfen
    expect(past(vale, STRIP_MAX_X + 1, 0)).toBe(false); // still inside the dead band
    expect(past(vale, STRIP_MAX_X + DEADBAND + 1, 0)).toBe(true);
    // and back west out of Alderfen into the vale
    expect(past(alderfen, STRIP_MAX_X - DEADBAND - 1, 0)).toBe(true);
    // the north-south behaviour is unchanged
    expect(past(vale, 0, vale.zMax + 1)).toBe(false);
    expect(past(vale, 0, vale.zMax + DEADBAND + 1)).toBe(true);
    expect(past(vale, 0, 0)).toBe(false);
  });

  it('is half-open in both axes, so a border point belongs to exactly one zone', () => {
    const owners = ZONES.filter((zn) => inMapRegion(zoneMapRegion(zn), STRIP_MAX_X, 0));
    expect(owners.map((zn) => zn.id)).toEqual(['alderfen_shallows']);
    const northBorder = ZONES.filter((zn) => inMapRegion(zoneMapRegion(zn), 0, vale.zMax));
    expect(northBorder.map((zn) => zn.id)).toEqual(['mirefen_marsh']);
  });
});
