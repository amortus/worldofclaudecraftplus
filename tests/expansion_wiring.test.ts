// The expansion pack as WIRED: merged into the flat tables, the instance band
// shift that made dungeon index 8 reachable, and the one-time save migration
// that shift forced.
//
// tests/expansion_content.test.ts covers the CONTENT (balance bands, id
// resolution, layout expressibility). This file covers only the wiring.
import { describe, expect, it } from 'vitest';

import {
  CINDERFORGE_MOBS,
  EXPANSION_ITEMS,
  EXPANSION_NPCS,
  EXPANSION_OBJECTS,
  EXPANSION_QUESTS,
  EXPANSION_QUEST_ORDER,
} from '../src/sim/content/expansion';
import {
  ARENA_X,
  ARENA_X_MIN,
  DELVE_BAND_X_MIN,
  DELVE_X_MIN,
  DUNGEONS,
  DUNGEON_X_THRESHOLD,
  GROUND_OBJECTS,
  ITEMS,
  MOBS,
  NPCS,
  QUESTS,
  QUEST_ORDER,
  RIFT_BAND_X_MIN,
  RIFT_X,
  ZONES,
  arenaOrigin,
  delveOrigin,
  dungeonAt,
  instanceOrigin,
  isArenaPos,
  isDelvePos,
  isLegacyInstancePos,
  isRiftPos,
  zoneForLevel,
} from '../src/sim/data';
import { DUNGEON_END_WALL_HW, DUNGEON_WALL_HW } from '../src/sim/dungeon_layout';
import { Sim } from '../src/sim/sim';

const CINDERFORGE_INDEX = 8;
// Widest primitive a dungeon layout places, plus its half thickness: the whole
// interior lives inside |localX| <= this.
const DUNGEON_HALF_X = DUNGEON_END_WALL_HW + DUNGEON_WALL_HW;
// Mirror of DELVE_WALL_X in data.ts (delve rooms are wider than the crypt kit).
const DELVE_HALF_X = 25 + DUNGEON_WALL_HW;

const makeSim = () => new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });

describe('expansion wiring: the pack reaches the flat tables', () => {
  it('merges every table data.ts owns', () => {
    for (const id of Object.keys(EXPANSION_ITEMS)) expect(ITEMS[id], id).toBeTruthy();
    for (const id of Object.keys(CINDERFORGE_MOBS)) expect(MOBS[id], id).toBeTruthy();
    for (const id of Object.keys(EXPANSION_NPCS)) expect(NPCS[id], id).toBeTruthy();
    for (const id of Object.keys(EXPANSION_QUESTS)) expect(QUESTS[id], id).toBeTruthy();
    for (const id of EXPANSION_QUEST_ORDER) expect(QUEST_ORDER, id).toContain(id);
    expect(DUNGEONS.cinderforge).toBeTruthy();
  });

  it('appends the pack objects LAST, so no shipped object shifts its entity id', () => {
    const tail = GROUND_OBJECTS.slice(-EXPANSION_OBJECTS.length);
    expect(tail).toEqual(EXPANSION_OBJECTS);
  });

  it('spawns the Cinderforge door and its instance slots in a live world', () => {
    const sim = makeSim();
    const door = [...sim.entities.values()].find(
      (e) => e.templateId === 'dungeon_door' && e.dungeonId === 'cinderforge',
    );
    expect(door).toBeTruthy();
    expect(sim.instances.filter((i) => i.dungeonId === 'cinderforge')).toHaveLength(6);
  });
});

describe('expansion wiring: the instance band shift', () => {
  it('puts the Cinderforge at x 5700 and keeps dungeonAt resolving it', () => {
    const x = instanceOrigin(CINDERFORGE_INDEX, 0).x;
    expect(x).toBe(900 + CINDERFORGE_INDEX * 600);
    expect(x).toBe(5700);
    // The WHOLE footprint has to round to index 8, not just the centre line.
    for (const probe of [x - DUNGEON_HALF_X, x, x + DUNGEON_HALF_X]) {
      expect(dungeonAt(probe)?.id, String(probe)).toBe('cinderforge');
      expect(probe).toBeGreaterThan(DUNGEON_X_THRESHOLD);
      expect(probe).toBeLessThan(ARENA_X_MIN);
    }
  });

  it('moves the arena and the delve band out by exactly one dungeon stride', () => {
    expect(ARENA_X).toBe(6000);
    expect(ARENA_X_MIN).toBe(ARENA_X);
    expect(DELVE_X_MIN).toBe(6600);
    expect(ARENA_X - 5400).toBe(600);
    expect(DELVE_X_MIN - 6000).toBe(600);
  });

  it('leaves a real gap between the Cinderforge, the arena and the delve band', () => {
    const dungeonEast = instanceOrigin(CINDERFORGE_INDEX, 0).x + DUNGEON_HALF_X;
    const arenaWest = arenaOrigin(0).x - DUNGEON_HALF_X;
    expect(arenaWest - dungeonEast).toBeGreaterThan(200);
    // The delve band edge still covers the entire west wall face of delve 0.
    expect(DELVE_BAND_X_MIN).toBeLessThanOrEqual(delveOrigin(0, 0).x - DELVE_HALF_X);
    expect(DELVE_BAND_X_MIN - ARENA_X).toBeGreaterThanOrEqual(500);
  });

  it('keeps every instance plane owning a disjoint half-open x range', () => {
    const arenaX = arenaOrigin(0).x;
    expect(isArenaPos(arenaX)).toBe(true);
    expect(isDelvePos(arenaX)).toBe(false);
    expect(dungeonAt(arenaX)).toBeNull();

    const delveX = delveOrigin(0, 0).x;
    expect(isDelvePos(delveX)).toBe(true);
    expect(isArenaPos(delveX)).toBe(false);
    expect(isRiftPos(delveX)).toBe(false);
  });

  it('keeps the rift band at 12000 clear, with room for nine delve indices', () => {
    expect(RIFT_X).toBe(12000);
    // Delve index 8 is the last that still fits below the rift band edge.
    expect(delveOrigin(8, 0).x + DELVE_HALF_X).toBeLessThan(RIFT_BAND_X_MIN);
    expect(delveOrigin(9, 0).x).toBeGreaterThanOrEqual(RIFT_BAND_X_MIN);
    expect(RIFT_BAND_X_MIN - (delveOrigin(8, 0).x + DELVE_HALF_X)).toBeGreaterThan(500);
    expect(isRiftPos(RIFT_X)).toBe(true);
  });
});

describe('expansion wiring: the one-time save migration', () => {
  const savedAt = (x: number, level: number) => {
    const donor = makeSim();
    const pid = donor.addPlayer('warrior', 'Ayla');
    donor.setPlayerLevel(level, pid);
    const state = donor.serializeCharacter(pid)!;
    return { ...state, pos: { x, y: 0, z: -1250 } };
  };

  const reload = (x: number, level: number) => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ayla', { state: savedAt(x, level) as never });
    return sim.entities.get(pid)!;
  };

  it('classifies both stale bands, and only the dead space between the columns', () => {
    // Old arena centre and old delve centre: both are stale.
    expect(isLegacyInstancePos(5400)).toBe(true);
    expect(isLegacyInstancePos(6000)).toBe(true);
    // The Cinderforge column is NOT stale: nothing was ever saved at x 5700, so
    // a position there is a genuine new-band dungeon position.
    expect(isLegacyInstancePos(5700)).toBe(false);
    // Neither is anything outside the window.
    expect(isLegacyInstancePos(5100)).toBe(false); // Claudexxaramas column
    expect(isLegacyInstancePos(DELVE_BAND_X_MIN)).toBe(false); // live delve band
  });

  it('ejects a save from the OLD arena band to the character own zone hub', () => {
    // A level-8 arena logout must NOT wake up at the Cinderforge door, which
    // sits in the level-20 endgame zone.
    const e = reload(5400, 8);
    const hub = zoneForLevel(8).hub;
    expect(e.pos.x).toBeCloseTo(hub.x, 3);
    expect(e.pos.z).toBeCloseTo(hub.z, 3);
    expect(e.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    expect(DUNGEONS.cinderforge.doorPos.z).not.toBeCloseTo(e.pos.z, 0);
  });

  it('ejects a save from the OLD delve band to the character own zone hub', () => {
    const e = reload(6000, 20);
    const hub = zoneForLevel(20).hub;
    expect(e.pos.x).toBeCloseTo(hub.x, 3);
    expect(e.pos.z).toBeCloseTo(hub.z, 3);
    expect(e.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
  });

  it('sends each level to the hub it actually belongs to', () => {
    expect(zoneForLevel(1)).toBe(ZONES[0]);
    expect(zoneForLevel(20)).toBe(ZONES[ZONES.length - 1]);
    expect(reload(5400, 1).pos.z).toBeCloseTo(ZONES[0].hub.z, 3);
    expect(reload(5400, 20).pos.z).toBeCloseTo(ZONES[ZONES.length - 1].hub.z, 3);
  });

  it('still ejects a genuine Cinderforge save to the Cinderforge door', () => {
    const e = reload(instanceOrigin(CINDERFORGE_INDEX, 0).x, 20);
    expect(e.pos.x).toBeCloseTo(DUNGEONS.cinderforge.doorPos.x, 3);
    expect(e.pos.z).toBeCloseTo(DUNGEONS.cinderforge.doorPos.z - 4, 3);
  });

  it('leaves a live delve save on the delve door, unchanged', () => {
    const e = reload(delveOrigin(0, 0).x, 20);
    expect(e.pos.x).toBeGreaterThan(-200);
    expect(e.pos.x).toBeLessThan(DUNGEON_X_THRESHOLD);
    // Not the zone hub: the delve branch still owns this position.
    expect(e.pos.z).not.toBeCloseTo(zoneForLevel(20).hub.z, 0);
  });
});
