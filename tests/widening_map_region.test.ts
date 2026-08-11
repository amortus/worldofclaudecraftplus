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
  // Retargeted by the full map parity pass. This file used to drive the two
  // INVENTED column zones (`alderfen_shallows` / `grimhold_crags`), which were
  // deleted whole; upstream's own grid occupies those cells now. The subject is
  // `farshore_isle`, the +x column in the vale's row, because the projection
  // this file pins is exactly "a column zone must get its own column, not the
  // world box". NOTE the vale's row is RAGGED: Farshore has no mirror on the -x
  // side, so the three-zones-in-one-band case below moves to the marsh's row
  // (Willowfen -x, Mirefen strip, Galecrest +x), which still has all three.
  const vale = zone('eastbrook_vale');
  const farshore = zone('farshore_isle');
  const marsh = zone('mirefen_marsh');
  const willowfen = zone('willowfen');
  const galecrest = zone('galecrest');
  const valeRegion = zoneMapRegion(vale);
  const farshoreRegion = zoneMapRegion(farshore);
  const marshRegion = zoneMapRegion(marsh);

  it('lands inside the canvas for anything inside the zone', () => {
    for (const zn of [vale, farshore, galecrest, willowfen, marsh]) {
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
    // Gullhaven sits at x 305 inside the 180..540 column, a little east of the
    // column's middle (east is -x), so the rect draws it just right of the
    // canvas centre. The world box is three columns wide, so the SAME hub drawn
    // against it lands at a third of that offset: the one-third compression is
    // the bug this rect exists to prevent. Derived from the rect rather than
    // pinned so a hub that moves keeps the test.
    const { mx } = toMap(farshoreRegion, farshore.hub.x, farshore.hub.z);
    expect(mx).toBeCloseTo(((farshoreRegion.maxX - farshore.hub.x) / WORLD_SIZE) * S, 6);
    expect(mx).toBeGreaterThan(S / 2); // right of centre, where Gullhaven really is
    const boxRegion = { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, minZ: farshore.zMin, maxZ: farshore.zMax };
    expect(toMap(boxRegion, farshore.hub.x, farshore.hub.z).mx).toBeCloseTo(mx / 3, 6);
  });

  it('excludes a neighbouring column that shares the band', () => {
    // Willowfen, the Mirefen and Galecrest all cover z 180..540: a band test
    // alone puts all three zones' NPCs, portals and quest markers on each
    // other's maps. (The vale's own row is the one row with a single column,
    // so the three-way case lives here.)
    expect(willowfen.zMin).toBeLessThanOrEqual(marsh.zMin);
    expect(willowfen.zMax).toBeGreaterThanOrEqual(marsh.zMax);
    expect(galecrest.zMin).toBeLessThanOrEqual(marsh.zMin);
    expect(inMapRegion(marshRegion, willowfen.hub.x, marsh.hub.z)).toBe(false);
    expect(inMapRegion(marshRegion, galecrest.hub.x, marsh.hub.z)).toBe(false);
    expect(inMapRegion(zoneMapRegion(galecrest), marsh.hub.x, marsh.hub.z)).toBe(false);
    expect(inMapRegion(zoneMapRegion(galecrest), galecrest.hub.x, galecrest.hub.z)).toBe(true);
    // ...and the same across the vale's row, which has only the +x column.
    expect(vale.zMin).toBe(farshore.zMin);
    expect(vale.zMax).toBe(farshore.zMax);
    expect(inMapRegion(valeRegion, farshore.hub.x, farshore.hub.z)).toBe(false);
    expect(inMapRegion(farshoreRegion, vale.hub.x, vale.hub.z)).toBe(false);
    expect(inMapRegion(farshoreRegion, farshore.hub.x, farshore.hub.z)).toBe(true);
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
    // walking out of the vale across the +x border into the Farshore
    expect(past(vale, STRIP_MAX_X + 1, 0)).toBe(false); // still inside the dead band
    expect(past(vale, STRIP_MAX_X + DEADBAND + 1, 0)).toBe(true);
    // and back out of the Farshore into the vale
    expect(past(farshore, STRIP_MAX_X - DEADBAND - 1, 0)).toBe(true);
    // the north-south behaviour is unchanged
    expect(past(vale, 0, vale.zMax + 1)).toBe(false);
    expect(past(vale, 0, vale.zMax + DEADBAND + 1)).toBe(true);
    expect(past(vale, 0, 0)).toBe(false);
  });

  it('is half-open in both axes, so a border point belongs to exactly one zone', () => {
    const owners = ZONES.filter((zn) => inMapRegion(zoneMapRegion(zn), STRIP_MAX_X, 0));
    expect(owners.map((zn) => zn.id)).toEqual(['farshore_isle']);
    const northBorder = ZONES.filter((zn) => inMapRegion(zoneMapRegion(zn), 0, vale.zMax));
    expect(northBorder.map((zn) => zn.id)).toEqual(['mirefen_marsh']);
  });
});
