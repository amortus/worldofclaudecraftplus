// Phase-2 authoring model: editable props, clone/delete, and the structured patch
// (moved/edited/added/deleted + the camp-delete determinism warning). Pure, no DOM.

import { describe, expect, it } from 'vitest';
import {
  buildEntities,
  buildPatch,
  renderPatch,
  snapshotFull,
  type ZoneContent,
} from '../src/editor/model';

const content = (): ZoneContent =>
  ({
    zones: [
      {
        id: 'z1',
        name: 'Zone',
        zMin: -100,
        zMax: 100,
        levelRange: [1, 5],
        biome: 'vale',
        hub: { x: 0, z: 0, radius: 10, name: 'Town' },
        graveyard: { x: 5, z: 5 },
        lakes: [{ x: 20, z: 20, radius: 8 }],
        pois: [{ x: 10, z: 10, label: 'Lookout' }],
        welcome: '',
      },
    ],
    camps: [
      { mobId: 'wolf', center: { x: 30, z: 30 }, radius: 6, count: 3 },
      { mobId: 'bear', center: { x: 40, z: 40 }, radius: 5, count: 2 },
    ],
    npcs: {
      guard: { id: 'guard', name: 'Guard', title: '', pos: { x: 1, z: 1 }, facing: 0, color: 0, questIds: [], greeting: '' },
    },
    objects: [{ itemId: 'herb', name: 'Herb', positions: [{ x: 15, z: 15 }, { x: 16, z: 16 }] }],
  }) as unknown as ZoneContent;

describe('editable props', () => {
  it('exposes camp mobId/count/radius and mutates the source', () => {
    const c = content();
    const ents = buildEntities(c);
    const camp = ents.find((e) => e.kind === 'camp')!;
    const count = camp.props.find((p) => p.key === 'count')!;
    expect(count.get()).toBe('3');
    expect(count.set('5')).toBe(true);
    expect(c.camps[0].count).toBe(5);
  });

  it('rejects a non-numeric value for a number prop', () => {
    const ents = buildEntities(content());
    const camp = ents.find((e) => e.kind === 'camp')!;
    const radius = camp.props.find((p) => p.key === 'radius')!;
    expect(radius.set('abc')).toBe(false);
  });

  it('marks hub/graveyard as not removable', () => {
    const ents = buildEntities(content());
    expect(ents.find((e) => e.kind === 'hub')!.removable).toBe(false);
    expect(ents.find((e) => e.kind === 'graveyard')!.removable).toBe(false);
    expect(ents.find((e) => e.kind === 'camp')!.removable).toBe(true);
  });
});

describe('clone / delete mutate the content arrays', () => {
  it('clones a camp by appending to the tail (determinism-safe)', () => {
    const c = content();
    const camp = buildEntities(c).find((e) => e.kind === 'camp')!;
    camp.clone!();
    expect(c.camps).toHaveLength(3);
    expect(c.camps[2].mobId).toBe('wolf'); // appended, not inserted
    expect(c.camps[2].center).not.toBe(c.camps[0].center); // fresh point object
  });

  it('deletes an object position and removes the parent when empty', () => {
    const c = content();
    let ents = buildEntities(c);
    const objs = ents.filter((e) => e.kind === 'object');
    expect(objs).toHaveLength(2);
    objs[0].remove!();
    expect(c.objects[0].positions).toHaveLength(1);
    ents = buildEntities(c);
    ents.find((e) => e.kind === 'object')!.remove!();
    expect(c.objects).toHaveLength(0); // parent dropped when its last position went
  });

  it('keeps stable keys for untouched markers when an array changes', () => {
    const c = content();
    const before = buildEntities(c);
    const bearKey = before.find((e) => e.label.startsWith('bear'))!.key;
    before.find((e) => e.kind === 'lake')!.clone!(); // unrelated add
    const after = buildEntities(c);
    expect(after.find((e) => e.label.startsWith('bear'))!.key).toBe(bearKey);
  });
});

describe('buildPatch', () => {
  it('reports moved, edited, added, and deleted', () => {
    const c = content();
    const ents = buildEntities(c);
    const base = snapshotFull(ents);

    ents.find((e) => e.kind === 'npc')!.point.x = 99; // move
    const camp = ents.find((e) => e.kind === 'camp')!;
    camp.props.find((p) => p.key === 'count')!.set('9'); // edit
    ents.find((e) => e.kind === 'poi')!.clone!(); // add
    ents.find((e) => e.kind === 'lake')!.remove!(); // delete

    const patch = buildPatch(buildEntities(c), base);
    const kinds = (s: string) => patch.changes.filter((x) => x.status === s);
    expect(kinds('moved')).toHaveLength(1);
    expect(kinds('edited')).toHaveLength(1);
    expect(kinds('added')).toHaveLength(1);
    expect(kinds('deleted')).toHaveLength(1);
  });

  it('warns when a camp is deleted (rng draw order)', () => {
    const c = content();
    const base = snapshotFull(buildEntities(c));
    buildEntities(c).find((e) => e.kind === 'camp')!.remove!();
    const patch = buildPatch(buildEntities(c), base);
    expect(patch.warnings.join(' ')).toMatch(/camp/i);
    expect(renderPatch(patch)).toContain('DEL');
  });

  it('renders "No changes." when nothing changed', () => {
    const c = content();
    const ents = buildEntities(c);
    expect(renderPatch(buildPatch(ents, snapshotFull(ents)))).toBe('No changes.');
  });
});
