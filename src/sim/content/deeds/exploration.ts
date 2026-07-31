// Exploration deeds: the four zones, the quest log, and loot quality.
// Data only; the evaluator is src/sim/deeds/evaluator.ts.
//
// Zone ids are the live ZONES ids (src/sim/content/zone1..zone4.ts):
// eastbrook_vale, mirefen_marsh, thornpeak_heights, ashen_wastes.

import { deedMark, type DeedDef } from '../../deeds/types';

export const EXPLORATION_DEEDS: readonly DeedDef[] = [
  {
    id: 'exp_vale_wayfarer',
    name: 'Wayfarer of the Vale',
    desc: 'Set foot in Eastbrook Vale.',
    category: 'exploration',
    renown: 5,
    trigger: { kind: 'mark', mark: deedMark('zone', 'eastbrook_vale') },
  },
  {
    id: 'exp_marsh_wayfarer',
    name: 'Wayfarer of the Marsh',
    desc: 'Set foot in Mirefen Marsh.',
    category: 'exploration',
    renown: 5,
    trigger: { kind: 'mark', mark: deedMark('zone', 'mirefen_marsh') },
  },
  {
    id: 'exp_peaks_wayfarer',
    name: 'Wayfarer of the Heights',
    desc: 'Set foot in Thornpeak Heights.',
    category: 'exploration',
    renown: 5,
    trigger: { kind: 'mark', mark: deedMark('zone', 'thornpeak_heights') },
  },
  {
    id: 'exp_ashen_wayfarer',
    name: 'Into the Ash',
    desc: 'Set foot in the Ashen Wastes.',
    category: 'exploration',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('zone', 'ashen_wastes') },
  },
  {
    id: 'exp_world_traveler',
    name: 'The Long Road North',
    desc: 'Walk every zone from Eastbrook Vale to the Ashen Wastes.',
    category: 'exploration',
    renown: 25,
    // A meta deed: it completes off the four wayfarers rather than re-reading
    // the marks, which is what exercises the evaluator's same-pass fixpoint.
    trigger: {
      kind: 'meta',
      requires: [
        'exp_vale_wayfarer',
        'exp_marsh_wayfarer',
        'exp_peaks_wayfarer',
        'exp_ashen_wayfarer',
      ],
    },
  },
  {
    id: 'exp_errand_runner',
    name: 'Errand Runner',
    desc: 'Complete 10 quests.',
    category: 'exploration',
    renown: 5,
    trigger: { kind: 'counter', counter: 'questsCompleted', count: 10 },
  },
  {
    id: 'exp_dependable',
    name: 'Dependable',
    desc: 'Complete 50 quests.',
    category: 'exploration',
    renown: 10,
    trigger: { kind: 'counter', counter: 'questsCompleted', count: 50 },
  },
  {
    id: 'exp_chronicler',
    name: 'Chronicler',
    desc: 'Complete 100 quests.',
    category: 'exploration',
    renown: 25,
    trigger: { kind: 'counter', counter: 'questsCompleted', count: 100 },
  },
  {
    id: 'exp_ashen_arrival',
    name: 'Reporting to Gravewatch',
    desc: 'Answer the muster and complete "Arrival" in the Ashen Wastes.',
    category: 'exploration',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('quest', 'q_aw_arrival') },
  },
  {
    id: 'exp_ashen_attuned',
    name: 'Attuned',
    desc: 'Complete the Ashen Wastes attunement.',
    category: 'exploration',
    renown: 25,
    trigger: { kind: 'mark', mark: deedMark('quest', 'q_aw_attunement') },
  },
  {
    id: 'exp_first_rare',
    name: 'Something Blue',
    desc: 'Loot your first rare item.',
    category: 'exploration',
    renown: 5,
    trigger: { kind: 'mark', mark: deedMark('quality', 'rare') },
  },
  {
    id: 'exp_first_epic',
    name: 'Something Purple',
    desc: 'Loot your first epic item.',
    category: 'exploration',
    renown: 10,
    trigger: { kind: 'mark', mark: deedMark('quality', 'epic') },
  },
  {
    id: 'exp_first_legendary',
    name: 'Once in a Lifetime',
    desc: 'Loot a legendary item.',
    category: 'exploration',
    renown: 50,
    // Hidden: only two legendaries exist, and the Book should not advertise the
    // odds by putting an unreachable-looking row in everyone's completion total.
    hidden: true,
    trigger: { kind: 'mark', mark: deedMark('quality', 'legendary') },
  },
  {
    id: 'exp_heavy_purse',
    name: 'Heavy Purse',
    // 1,000,000 copper = 100 gold. Stored in copper; the client formats it.
    desc: 'Loot 100 gold over a lifetime.',
    category: 'exploration',
    renown: 10,
    trigger: { kind: 'counter', counter: 'copperLooted', count: 1000000 },
  },
];
