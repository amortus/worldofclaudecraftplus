// Endgame deeds: Claudeholme, Claudexxaramas, and the world boss.
// Data only; the evaluator is src/sim/deeds/evaluator.ts.
//
// The eight `ch_` ids are the live Claudeholme boss templates and the `cx_` ids
// the live Claudexxaramas ones (src/sim/content/dungeons.ts); thunzharr_waking_peak
// is the single WORLD_BOSSES template (src/sim/world_boss.ts).
//
// The boss lists here are PINNED, not derived from the content tables: a deed's
// requirement must never grow when new content ships, or an already-earned
// chronicle would silently un-complete. A future boss gets a new deed instead.

import { deedMark, type DeedDef } from '../../deeds/types';

/** Claudeholme's eight bosses, in encounter order. Pinned. */
export const CLAUDEHOLME_BOSSES: readonly string[] = [
  'ch_gatewarden',
  'ch_plaguewright',
  'ch_tollkeeper',
  'ch_maggotlord',
  'ch_cantor',
  'ch_ashmarshal',
  'ch_bonesmith',
  'ch_veholt',
];

export const RAID_DEEDS: readonly DeedDef[] = [
  {
    id: 'raid_claudeholme_breach',
    name: 'Through the Gate',
    desc: 'Defeat the Gatewarden and breach Claudeholme.',
    category: 'raid',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('boss', 'ch_gatewarden') },
  },
  {
    id: 'raid_claudeholme_fall',
    name: 'The Hollow Lord',
    desc: 'Defeat Lord Veholt the Hollow at the heart of Claudeholme.',
    category: 'raid',
    renown: 50,
    trigger: { kind: 'mark', mark: deedMark('boss', 'ch_veholt') },
  },
  {
    id: 'raid_claudeholme_complete',
    name: 'Claudeholme Unmade',
    desc: 'Defeat every boss in Claudeholme.',
    category: 'raid',
    renown: 75,
    trigger: {
      kind: 'allMarks',
      marks: CLAUDEHOLME_BOSSES.map((id) => deedMark('boss', id)),
    },
  },
  {
    id: 'raid_claudexxaramas_entry',
    name: 'Past the Gutpile',
    desc: 'Defeat Gutpile and open Claudexxaramas.',
    category: 'raid',
    renown: 25,
    trigger: { kind: 'mark', mark: deedMark('boss', 'cx_gutpile') },
  },
  {
    id: 'raid_claudexxaramas_plaguelord',
    name: 'The Plaguelord',
    desc: 'Defeat Maggath the Plaguelord.',
    category: 'raid',
    renown: 50,
    trigger: { kind: 'mark', mark: deedMark('boss', 'cx_maggath') },
  },
  {
    id: 'raid_claudexxaramas_fall',
    name: "The Corruptor's Bane",
    desc: 'Defeat Archlich Vorothne and end the corruption of Claudexxaramas.',
    category: 'raid',
    renown: 100,
    trigger: { kind: 'mark', mark: deedMark('boss', 'cx_vorothne') },
    reward: { kind: 'title', titleId: 'deed:corruptors_bane' },
  },
  {
    id: 'raid_thunzharr',
    name: 'The Waking Peak',
    desc: 'Help bring down Thunzharr on Stormcrag.',
    category: 'raid',
    renown: 25,
    trigger: { kind: 'mark', mark: deedMark('boss', 'thunzharr_waking_peak') },
  },
];
