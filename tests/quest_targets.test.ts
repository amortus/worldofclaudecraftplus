import { describe, expect, it } from 'vitest';
import { CAMPS, GROUND_OBJECTS, MOBS, NPCS, QUESTS } from '../src/sim/data';
import { questTurnInNpcIds } from '../src/sim/types';
import { objectiveLocations, pickNearest, questMarkers } from '../src/ui/quest_targets';

describe('quest_targets - objective location resolver', () => {
  it('resolves a kill objective to every spawn camp of the target mob', () => {
    const mobId = CAMPS[0].mobId;
    const expected = CAMPS.filter((c) => c.mobId === mobId);
    const locs = objectiveLocations({ type: 'kill', targetMobId: mobId, count: 1, label: 'x' });
    expect(locs.length).toBe(expected.length);
    for (const c of expected) {
      expect(
        locs.some((l) => l.x === c.center.x && l.z === c.center.z && l.radius === c.radius && l.kind === 'mobCamp'),
      ).toBe(true);
    }
  });

  it('a multi-camp mob yields one region per camp', () => {
    const wolfCamps = CAMPS.filter((c) => c.mobId === 'forest_wolf');
    expect(wolfCamps.length).toBeGreaterThanOrEqual(2);
    const locs = objectiveLocations({ type: 'kill', targetMobId: 'forest_wolf', count: 8, label: 'x' });
    expect(locs.length).toBe(wolfCamps.length);
  });

  it('resolves an interact-object objective to the ground object positions', () => {
    const obj = GROUND_OBJECTS[0];
    const locs = objectiveLocations({ type: 'interact', targetObjectItemId: obj.itemId, count: 1, label: 'x' });
    expect(locs.length).toBe(obj.positions.length);
    expect(locs.every((l) => l.kind === 'object' && l.radius === 0)).toBe(true);
  });

  it('resolves a collect item to its drop-source mob camps', () => {
    // greyjaw_fang is a quest drop from old_greyjaw, which has a spawn camp.
    expect(MOBS.old_greyjaw.loot.some((l) => l.itemId === 'greyjaw_fang')).toBe(true);
    expect(CAMPS.some((c) => c.mobId === 'old_greyjaw')).toBe(true);
    const locs = objectiveLocations({ type: 'collect', itemId: 'greyjaw_fang', count: 1, label: 'x' });
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.some((l) => l.kind === 'mobCamp')).toBe(true);
  });

  it('enriches each location with zone + subzone fields', () => {
    const locs = objectiveLocations({ type: 'kill', targetMobId: 'forest_wolf', count: 1, label: 'x' });
    expect(locs[0].zoneId).toBeTruthy();
    expect(locs[0].zoneName).toBeTruthy();
    expect(locs[0]).toHaveProperty('poiLabel');
  });

  it('unknown / locationless target -> empty list (no crash)', () => {
    expect(objectiveLocations({ type: 'kill', targetMobId: '___nope___', count: 1, label: 'x' })).toEqual([]);
    expect(objectiveLocations({ type: 'kill', count: 1, label: 'x' })).toEqual([]);
  });
});

describe('quest_targets - questMarkers', () => {
  it('emits markers only for incomplete objectives, then the turn-in when done', () => {
    const q = Object.values(QUESTS).find((quest) =>
      quest.objectives.some((o) => o.type === 'kill' && o.targetMobId && CAMPS.some((c) => c.mobId === o.targetMobId)));
    expect(q).toBeTruthy();
    const counts = q!.objectives.map(() => 0);
    const markers = questMarkers(q!.id, counts);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m.questId === q!.id)).toBe(true);
    expect(markers.every((m) => m.objIndex >= 0)).toBe(true);

    const doneCounts = q!.objectives.map((o) => o.count);
    const turnIn = questMarkers(q!.id, doneCounts);
    const npcIds = questTurnInNpcIds(q!).filter((id) => NPCS[id]);
    if (npcIds.length) {
      expect(turnIn.some((m) => m.objType === 'turnin' && m.objIndex === -1)).toBe(true);
    }
  });

  it('unknown quest id -> no markers', () => {
    expect(questMarkers('___nope___', [])).toEqual([]);
  });
});

describe('quest_targets - pickNearest', () => {
  it('picks the closest marker, measured to the area edge', () => {
    const markers = [
      { x: 100, z: 0, radius: 0 },
      { x: 50, z: 0, radius: 10 },
      { x: 0, z: 200, radius: 0 },
    ];
    const r = pickNearest(markers, 0, 0);
    expect(r).not.toBeNull();
    expect(r!.marker).toBe(markers[1]);
    expect(r!.dist).toBeCloseTo(40);
  });

  it('reads distance 0 when the player is inside a camp radius', () => {
    expect(pickNearest([{ x: 5, z: 0, radius: 20 }], 0, 0)!.dist).toBe(0);
  });

  it('empty list -> null', () => {
    expect(pickNearest([], 0, 0)).toBeNull();
  });
});
