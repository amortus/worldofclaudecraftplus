// Dungeon and delve deeds: the four launch five-mans, the Nythraxis crypt, and
// the Collapsed Reliquary. Data only; the evaluator is src/sim/deeds/evaluator.ts.
//
// Every boss id below is a live DUNGEON_MOBS / TEMPLE_DUNGEON_MOBS template id
// (src/sim/content/dungeons.ts, temple.ts) and every delve id is the live
// COLLAPSED_RELIQUARY_DELVE id plus one of its two tier ids.

import { deedMark, type DeedDef } from '../../deeds/types';

export const DUNGEON_DEEDS: readonly DeedDef[] = [
  {
    id: 'dgn_hollow_crypt',
    name: 'The Hollow Crypt',
    desc: 'Defeat Morthen the Gravecaller in the Hollow Crypt.',
    category: 'dungeon',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('boss', 'morthen') },
  },
  {
    id: 'dgn_sunken_bastion',
    name: 'The Sunken Bastion',
    desc: 'Defeat Vael the Mistcaller in the Sunken Bastion.',
    category: 'dungeon',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('boss', 'vael_the_mistcaller') },
  },
  {
    id: 'dgn_gravewyrm_sanctum',
    name: 'Gravewyrm Sanctum',
    desc: 'Defeat Korzul the Gravewyrm in the Gravewyrm Sanctum.',
    category: 'dungeon',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('boss', 'korzul_the_gravewyrm') },
  },
  {
    id: 'dgn_drowned_temple',
    name: 'The Drowned Temple',
    desc: 'Defeat Ysolei, Avatar of the Drowned Moon, in the Drowned Temple.',
    category: 'dungeon',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('boss', 'ysolei') },
  },
  {
    id: 'dgn_four_doors',
    name: 'Four Doors Opened',
    desc: 'Clear all four of the great dungeons.',
    category: 'dungeon',
    renown: 25,
    trigger: {
      kind: 'meta',
      requires: [
        'dgn_hollow_crypt',
        'dgn_sunken_bastion',
        'dgn_gravewyrm_sanctum',
        'dgn_drowned_temple',
      ],
    },
  },
  {
    id: 'dgn_nythraxis',
    name: "Thornpeak's Scourge",
    desc: 'Defeat Nythraxis, Scourge of Thornpeak.',
    category: 'dungeon',
    renown: 25,
    trigger: { kind: 'mark', mark: deedMark('boss', 'nythraxis_scourge_of_thornpeak') },
  },
  {
    id: 'dgn_regular',
    name: 'Knows the Way',
    desc: 'Clear 25 dungeons.',
    category: 'dungeon',
    renown: 25,
    trigger: { kind: 'counter', counter: 'dungeonClears', count: 25 },
  },
  {
    id: 'dlv_reliquary',
    name: 'The Collapsed Reliquary',
    desc: 'Complete the Collapsed Reliquary on Normal.',
    category: 'dungeon',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('delve', 'collapsed_reliquary:normal') },
  },
  {
    id: 'dlv_reliquary_heroic',
    name: 'Deeper Still',
    desc: 'Complete the Collapsed Reliquary on Heroic.',
    category: 'dungeon',
    renown: 25,
    trigger: { kind: 'mark', mark: deedMark('delve', 'collapsed_reliquary:heroic') },
  },
  {
    id: 'dlv_delver',
    name: 'Delver',
    desc: 'Complete 25 delve runs.',
    category: 'dungeon',
    renown: 25,
    trigger: { kind: 'counter', counter: 'delveClears', count: 25 },
  },
];
