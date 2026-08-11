import { describe, expect, it } from 'vitest';
import {
  CAMPS,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUEST_ORDER,
  QUESTS,
  STRIP_MAX_X,
  STRIP_MIN_X,
  worldHalfWidthAt,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  ZONES,
  zoneAt,
  zoneContaining,
  dungeonAt,
  DUNGEON_X_THRESHOLD,
  instanceOrigin,
  isArenaPos,
  isDelvePos,
  DUNGEON_LIST,
  zoneForLevel,
} from '../src/sim/data';
import { REALM_ZONE_DEFS } from '../src/sim/content/realms';
import { computeBorderEdges, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../src/sim/world';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { MAX_LEVEL } from '../src/sim/types';

// ---------------------------------------------------------------------------
// The zones ported from upstream. The FIRST ring was four of them: the
// Willowfen and the Galecrest beside the Mirefen Marsh, the Palmreach and the
// Evergarden beside the Thornpeak Heights. Full map parity ported the other
// seven, so upstream's whole 14-zone grid is here now: two more STRIP bands
// (the Veiled Hollow and the Frostveil Reach) and five more column zones.
// Their rects, ids and content are upstream's (see
// src/sim/content/realms/CLAUDE.md for what the port drops and why).
//
// This file asserts the things a PORT can get wrong: a rect that overlaps
// something we already ship, a border with no way through it, a quest that
// points at an id nobody defined, and a level band that does not match the
// zone the player has to cross to reach it.
// ---------------------------------------------------------------------------

const SEED = 1337;

// Every ported zone, in REALM_ZONE_DEFS order. A STRIP band spans the whole
// row and therefore declares no x bounds at all, which is written here as null
// rather than a number so the registration check below stays exact.
const PORTED = {
  veiled_hollow: { biome: 'dusk', zMin: 900, zMax: 1440, xMin: null, xMax: null, levels: [15, 20] },
  frostveil: { biome: 'frost', zMin: 1440, zMax: 1960, xMin: null, xMax: null, levels: [17, 20] },
  farshore_isle: { biome: 'vale', zMin: -180, zMax: 180, xMin: 180, xMax: 540, levels: [3, 7] },
  willowfen: { biome: 'fen', zMin: 180, zMax: 700, xMin: -540, xMax: -180, levels: [19, 20] },
  galecrest: { biome: 'gale', zMin: 180, zMax: 700, xMin: 180, xMax: 540, levels: [20, 20] },
  palmreach: { biome: 'jungle', zMin: 700, zMax: 1260, xMin: -540, xMax: -180, levels: [20, 20] },
  evergarden: { biome: 'garden', zMin: 700, zMax: 1260, xMin: 180, xMax: 540, levels: [20, 20] },
  nightbloom: { biome: 'night', zMin: 1260, zMax: 1820, xMin: -540, xMax: -180, levels: [20, 20] },
  wraithwood: { biome: 'haunt', zMin: 1260, zMax: 1820, xMin: 180, xMax: 540, levels: [20, 20] },
  amberfall: { biome: 'amber', zMin: 1820, zMax: 2380, xMin: -540, xMax: -180, levels: [18, 20] },
  drakelands: { biome: 'ember', zMin: 1820, zMax: 2420, xMin: 180, xMax: 540, levels: [16, 20] },
} as const;

type PortedId = keyof typeof PORTED;
const PORTED_IDS = Object.keys(PORTED) as PortedId[];

// The FIRST ported ring, the four column zones around the Mirefen and the
// Thornpeak. The content-wiring assertions at the bottom of this file are
// scoped to these four (their quest prefixes, their giver count); the seven
// zones of the full-map pass carry their own content and are covered by
// tests/world_phase2_zones.test.ts and tests/realms_compass.test.ts.
const RING_IDS = ['willowfen', 'galecrest', 'palmreach', 'evergarden'] as const;
type RingId = (typeof RING_IDS)[number];

function zone(id: PortedId) {
  const zn = ZONES.find((z) => z.id === id);
  expect(zn, `zone ${id}`).toBeTruthy();
  return zn!;
}

describe('realm ring: upstream rects, ids and bands, unaltered', () => {
  it('registers all eleven with upstream own rect, biome and level band', () => {
    expect(REALM_ZONE_DEFS.map((z) => z.id)).toEqual(PORTED_IDS);
    for (const id of PORTED_IDS) {
      const zn = zone(id);
      const want = PORTED[id];
      expect(zn.zMin, `${id}.zMin`).toBe(want.zMin);
      expect(zn.zMax, `${id}.zMax`).toBe(want.zMax);
      expect(zn.xMin ?? null, `${id}.xMin`).toBe(want.xMin);
      expect(zn.xMax ?? null, `${id}.xMax`).toBe(want.xMax);
      expect(zn.biome, `${id}.biome`).toBe(want.biome);
      expect(zn.levelRange, `${id}.levelRange`).toEqual([...want.levels]);
    }
    // The two ported STRIP bands are strip bands, and the nine others columns.
    expect(PORTED_IDS.filter((id) => PORTED[id].xMin === null)).toEqual([
      'veiled_hollow',
      'frostveil',
    ]);
  });

  it('overlaps no zone that already shipped, and grows the world box only northward', () => {
    for (let i = 0; i < ZONES.length; i++) {
      for (let j = i + 1; j < ZONES.length; j++) {
        const a = ZONES[i];
        const b = ZONES[j];
        const ax0 = a.xMin ?? -STRIP_MAX_X;
        const ax1 = a.xMax ?? STRIP_MAX_X;
        const bx0 = b.xMin ?? -STRIP_MAX_X;
        const bx1 = b.xMax ?? STRIP_MAX_X;
        const overlaps = ax0 < bx1 && bx0 < ax1 && a.zMin < b.zMax && b.zMin < a.zMax;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
    // The box's X did not move one yard: the ported grid is two columns wide,
    // exactly the width the first column ring already established, which is why
    // the instance plane did not have to move (asserted below). Z DID grow, and
    // only northward: upstream stacks five rows of columns, the last of them
    // the Drakelands at z 1820..2420. The south edge is untouched.
    expect(WORLD_MIN_X).toBe(-540);
    expect(WORLD_MAX_X).toBe(540);
    expect(WORLD_MIN_Z).toBe(-180);
    expect(WORLD_MAX_Z).toBe(2420);
    expect(WORLD_MAX_Z).toBe(zone('drakelands').zMax);
    expect(WORLD_MAX_Z).toBe(Math.max(...ZONES.map((z) => z.zMax)));
  });

  it('resolves by rect, and lands its own hub, graveyard, POIs and lakes inside it', () => {
    for (const id of PORTED_IDS) {
      const zn = zone(id);
      const probes = [
        { x: zn.hub.x, z: zn.hub.z, what: 'hub' },
        { x: zn.graveyard.x, z: zn.graveyard.z, what: 'graveyard' },
        ...zn.pois.map((p) => ({ x: p.x, z: p.z, what: `poi ${p.label}` })),
        ...zn.lakes.map((l) => ({ x: l.x, z: l.z, what: 'lake' })),
      ];
      for (const p of probes) {
        expect(zoneContaining(p.x, p.z), `${id} ${p.what} at ${p.x},${p.z}`).toBe(zn);
        expect(zoneAt(p.x, p.z), `${id} ${p.what} zoneAt`).toBe(zn);
        expect(zoneBiomeAt(p.x, p.z), `${id} ${p.what} biome`).toBe(zn.biome);
      }
    }
  });

  it('gives every new POI, zone name and hub name a label nothing else uses', () => {
    const labels = ZONES.flatMap((z) => z.pois.map((p) => p.label));
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(ZONES.map((z) => z.name)).size).toBe(ZONES.length);
    expect(new Set(ZONES.map((z) => z.hub.name)).size).toBe(ZONES.length);
  });
});

describe('realm ring: every border is real ground a player can cross', () => {
  // Each ring zone meets the strip on one vertical edge, at the pass the zone
  // (or its strip neighbour) declares. Walking straight through that pass must
  // never meet a slope the movement gate refuses.
  const PASSES: [RingId, number, number][] = [
    ['willowfen', -180, 440], // the Mirewalk, out of the Mirefen Marsh
    ['galecrest', 180, 440], // the Windway, out of the Mirefen Marsh
    ['palmreach', -180, 820], // the Sunway, off the Thornpeak Heights
    ['evergarden', 180, 800], // the Gardenwalk, off the Thornpeak Heights
  ];

  it('opens each strip-facing border at its declared pass', () => {
    for (const [id, borderX, passZ] of PASSES) {
      const atPass = terrainHeight(borderX, passZ, SEED);
      const atWall = terrainHeight(borderX, passZ + 120, SEED);
      expect(atWall - atPass, `${id} wall vs pass`).toBeGreaterThan(12);
      expect(atPass, `${id} pass is dry land`).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('lets a player walk each pass without meeting a slope the gate refuses', () => {
    for (const [id, borderX, passZ] of PASSES) {
      const inward = borderX > 0 ? 1 : -1;
      let steepest = 0;
      for (let d = -45; d < 45; d += 0.5) {
        const x = borderX + d * inward;
        const a = terrainHeight(x, passZ, SEED);
        const b = terrainHeight(x + 0.5 * inward, passZ, SEED);
        steepest = Math.max(steepest, (b - a) / 0.5);
      }
      expect(steepest, `${id} pass climb`).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    }
  });

  it('still walls each border away from its pass', () => {
    for (const [id, borderX, passZ] of PASSES) {
      let steepest = 0;
      for (let x = borderX - 40; x < borderX + 40; x += 0.5) {
        const a = terrainHeight(x, passZ + 120, SEED);
        const b = terrainHeight(x + 0.5, passZ + 120, SEED);
        steepest = Math.max(steepest, Math.abs(b - a) / 0.5);
      }
      expect(steepest, `${id} border wall`).toBeGreaterThan(0.9);
    }
  });

  it('walls the z 180 column border, which is why the ring is entered from the strip', () => {
    // Neither the Willowfen nor the Galecrest declares a southPassX: upstream
    // authored none, and inventing one here would have been our content, not
    // theirs. Every ring zone's real entrance is its strip-facing pass (the
    // Mirewalk and the Windway above); the Palmreach and the Evergarden add
    // their own authored southPassX (below).
    for (const id of ['willowfen', 'galecrest'] as const) {
      expect(zone(id).southPassX, `${id}.southPassX`).toBeUndefined();
    }
    // What the z 180 line looks like now is NOT what it looked like when the
    // invented ring shipped, and the two halves differ, so re-derive it.
    //
    // +x: `farshore_isle` sits south of the Galecrest, so there IS a shared
    // rect boundary and `computeBorderEdges` raises a wall along it. With no
    // southPassX the pass coordinate falls back to x = 0, which lies OUTSIDE
    // that edge's own span [180, 540), so the wall is at full height along its
    // whole length. That is the right shape for the map: a level 3-7 isle must
    // not open straight onto a level 20 realm.
    const edges = computeBorderEdges(ZONES);
    const east = edges.filter((e) => e.kind === 'h' && e.at === 180 && e.lo >= STRIP_MAX_X);
    expect(east, 'one h180 edge between the Farshore and the Galecrest').toHaveLength(1);
    expect([east[0].lo, east[0].hi]).toEqual([180, 540]);
    expect(east[0].passAt, 'its pass falls outside its own span, so nothing opens').toBe(0);
    expect(east[0].sealed).toBe(false);
    for (const x of [200, 260, 300, 360, 420, 460, 520]) {
      const crest = terrainHeight(x, 180, SEED);
      const south = terrainHeight(x, 120, SEED);
      const north = terrainHeight(x, 240, SEED);
      expect(crest - south, `z=180 wall rises out of the south at x=${x}`).toBeGreaterThan(12);
      expect(crest - north, `z=180 wall rises out of the north at x=${x}`).toBeGreaterThan(12);
    }
    // -x: upstream leaves the vale's row EMPTY on this side, so there is no
    // shared boundary and no wall at all there. The Willowfen's south side is
    // closed by the world rim instead: the per-side half width stands at the
    // strip's own edge through that whole row, which puts the hole outside the
    // containment wall rather than behind a ridge.
    expect(edges.some((e) => e.kind === 'h' && e.at === 180 && e.hi <= STRIP_MIN_X)).toBe(false);
    for (let z = WORLD_MIN_Z; z <= 150; z += 5) {
      expect(worldHalfWidthAt(z, -1), `west half width at z=${z}`).toBe(STRIP_MAX_X);
    }
    expect(zoneContaining(-360, 0), 'and the row really is empty at -x').toBeNull();
  });

  it('opens the Tanglemouth and the Garden Gate, the two authored southPassX', () => {
    for (const [id, passX] of [
      ['palmreach', -400],
      ['evergarden', 400],
    ] as const) {
      const atPass = terrainHeight(passX, 700, SEED);
      const atWall = terrainHeight(passX + (passX < 0 ? -110 : 110), 700, SEED);
      expect(atWall - atPass, `${id} south wall vs pass`).toBeGreaterThan(10);
      let steepest = 0;
      for (let z = 660; z < 740; z += 0.5) {
        const a = terrainHeight(passX, z, SEED);
        const b = terrainHeight(passX, z + 0.5, SEED);
        steepest = Math.max(steepest, Math.abs(b - a) / 0.5);
      }
      expect(steepest, `${id} south pass climb`).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
    }
  });
});

describe('realm ring: the instance plane did not have to move', () => {
  it('keeps the whole overworld west of the instance threshold', () => {
    expect(WORLD_MAX_X).toBeLessThan(DUNGEON_X_THRESHOLD);
    for (const zn of ZONES) expect(zn.xMax ?? STRIP_MAX_X).toBeLessThanOrEqual(WORLD_MAX_X);
  });

  it('leaves every dungeon, arena and delve band exactly where it was', () => {
    // instanceOrigin is x-banded and the ring added no x, so nothing collides.
    for (const d of DUNGEON_LIST) {
      const o = instanceOrigin(d.index, 0);
      expect(o.x).toBeGreaterThan(DUNGEON_X_THRESHOLD);
      expect(dungeonAt(o.x)).toBe(d);
      expect(isArenaPos(o.x)).toBe(false);
      expect(isDelvePos(o.x)).toBe(false);
      expect(zoneContaining(o.x, o.z), `dungeon ${d.id} is not in the overworld`).toBeNull();
    }
  });

  it('reads an instance position as its STRIP band, never as a ring zone', () => {
    // The regression this pins: `zoneAt`'s out-of-rect fallback used to be "the
    // zone with the smallest zMax still north of z", which was only ever the
    // strip band while every column shared a strip band exactly. The Willowfen
    // spans z 180..700, across the Mirefen/Thornpeak line at 540, so that
    // tie-break started answering `willowfen` for a dungeon position at z 541.
    const ringIds = new Set<string>(RING_IDS);
    for (const x of [600, 900, 5700, 6000, 6600, 12_000]) {
      for (let z = WORLD_MIN_Z - 200; z <= WORLD_MAX_Z + 200; z += 7) {
        const zn = zoneAt(x, z);
        expect(zn.xMin, `zoneAt(${x}, ${z}) = ${zn.id}`).toBeUndefined();
        expect(ringIds.has(zn.id), `zoneAt(${x}, ${z}) = ${zn.id}`).toBe(false);
      }
    }
    expect(zoneAt(5700, 541).id).toBe('thornpeak_heights');
  });

  it('never sends an ejected character to a ring hub', () => {
    // zoneForLevel walks STRIP_ZONES only, so a stale saved position ejects to
    // a main-progression hub at every level, not into a level-20 side realm.
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const zn = zoneForLevel(level);
      expect(zn.xMin, `zoneForLevel(${level}) = ${zn.id}`).toBeUndefined();
    }
  });
});

describe('realm ring: the content is wired, not just declared', () => {
  const ringZones = RING_IDS.map(zone);
  const inRing = (x: number, z: number): boolean => {
    const zn = zoneContaining(x, z);
    return zn !== null && ringZones.includes(zn);
  };

  const ringQuests = Object.values(QUESTS).filter((q) => q.id.match(/^q_(wf|gc|pr|eg)_/));
  const ringNpcIds = new Set(
    Object.values(NPCS)
      .filter((n) => inRing(n.pos.x, n.pos.z))
      .map((n) => n.id),
  );

  it('ships all 33 quests across 16 questgivers, every one inside the ring', () => {
    // 8 + 9 + 8 + 8. Upstream's Palmreach has nine; `q_pr_the_lost_navigator`
    // is an escort quest and we have no escort system (see realms/CLAUDE.md).
    expect(ringQuests).toHaveLength(33);
    expect(QUESTS.q_pr_the_lost_navigator, 'the escort quest is not ported').toBeUndefined();
    expect(ringNpcIds.size).toBe(16);
    for (const q of ringQuests) {
      expect(ringNpcIds.has(q.giverNpcId), `${q.id} giver ${q.giverNpcId}`).toBe(true);
      expect(ringNpcIds.has(q.turnInNpcId), `${q.id} turn-in ${q.turnInNpcId}`).toBe(true);
      expect(QUEST_ORDER, `${q.id} in QUEST_ORDER`).toContain(q.id);
    }
  });

  it('resolves every objective, reward and prerequisite id to something defined', () => {
    for (const q of ringQuests) {
      expect(q.objectives.length, `${q.id} objectives`).toBeGreaterThan(0);
      for (const o of q.objectives) {
        if (o.type === 'kill') expect(MOBS[o.targetMobId!], `${q.id} -> ${o.targetMobId}`).toBeDefined();
        if (o.type === 'collect') expect(ITEMS[o.itemId!], `${q.id} -> ${o.itemId}`).toBeDefined();
        if (o.type === 'interact') {
          const target = o.targetObjectItemId ?? o.targetNpcId;
          expect(target, `${q.id} interact target`).toBeTruthy();
          if (o.targetObjectItemId) expect(ITEMS[o.targetObjectItemId]).toBeDefined();
          if (o.targetNpcId) expect(NPCS[o.targetNpcId]).toBeDefined();
        }
      }
      for (const itemId of Object.values(q.itemRewards)) {
        expect(ITEMS[itemId], `${q.id} reward ${itemId}`).toBeDefined();
      }
      if (q.requiresQuest) expect(QUESTS[q.requiresQuest], `${q.id} requires`).toBeDefined();
    }
  });

  it('lists every quest on its giver, so no chain is stranded', () => {
    for (const q of ringQuests) {
      expect(NPCS[q.giverNpcId].questIds, `${q.giverNpcId} offers ${q.id}`).toContain(q.id);
    }
  });

  it('spawns every kill objective and drops every collect objective somewhere', () => {
    const camped = new Set(CAMPS.map((c) => c.mobId));
    const objectItems = new Set(GROUND_OBJECTS.map((o) => o.itemId));
    for (const q of ringQuests) {
      for (const o of q.objectives) {
        if (o.type === 'kill') {
          expect(camped.has(o.targetMobId!), `${q.id}: nothing spawns ${o.targetMobId}`).toBe(true);
        }
        if (o.type === 'collect') {
          const dropped = Object.values(MOBS).some((m) =>
            m.loot.some((l) => l.itemId === o.itemId),
          );
          expect(dropped || objectItems.has(o.itemId!), `${q.id}: ${o.itemId} unobtainable`).toBe(
            true,
          );
        }
        if (o.type === 'interact' && o.targetObjectItemId) {
          expect(
            objectItems.has(o.targetObjectItemId),
            `${q.id}: ${o.targetObjectItemId} has no ground object`,
          ).toBe(true);
        }
      }
    }
  });

  it('places every realm camp, object and NPC inside the ring, on a real template', () => {
    for (const camp of CAMPS) {
      if (!inRing(camp.center.x, camp.center.z)) continue;
      expect(MOBS[camp.mobId], `camp ${camp.mobId}`).toBeDefined();
      expect(camp.count).toBeGreaterThan(0);
    }
    for (const obj of GROUND_OBJECTS) {
      if (!obj.positions.some((p) => inRing(p.x, p.z))) continue;
      expect(ITEMS[obj.itemId], `object ${obj.itemId}`).toBeDefined();
      for (const p of obj.positions) {
        expect(zoneContaining(p.x, p.z), `${obj.itemId} at ${p.x},${p.z}`).not.toBeNull();
      }
    }
  });

  it('bands every ring mob at the level its zone advertises', () => {
    for (const zn of ringZones) {
      for (const camp of CAMPS) {
        if (zoneContaining(camp.center.x, camp.center.z) !== zn) continue;
        const tpl = MOBS[camp.mobId];
        expect(tpl.maxLevel, `${camp.mobId} in ${zn.id}`).toBeLessThanOrEqual(MAX_LEVEL);
        expect(tpl.minLevel, `${camp.mobId} in ${zn.id}`).toBeGreaterThanOrEqual(
          zn.levelRange[0] - 1,
        );
      }
    }
  });

  it('joins the rift rotation, because every ring zone reaches the cap', () => {
    for (const zn of ringZones) expect(zn.levelRange[1]).toBe(MAX_LEVEL);
  });
});
