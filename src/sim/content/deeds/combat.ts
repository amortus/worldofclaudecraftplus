// Combat deeds: kills, boss kills, duels, and the Ashen Coliseum.
// Data only; the evaluator is src/sim/deeds/evaluator.ts.

import type { DeedDef } from '../../deeds/types';

export const COMBAT_DEEDS: readonly DeedDef[] = [
  {
    id: 'cmb_first_blood',
    name: 'First Blood',
    desc: 'Defeat your first enemy.',
    category: 'combat',
    renown: 5,
    trigger: { kind: 'counter', counter: 'kills', count: 1 },
  },
  {
    id: 'cmb_hundred',
    name: 'A Hundred Down',
    desc: 'Defeat 100 enemies.',
    category: 'combat',
    renown: 10,
    trigger: { kind: 'counter', counter: 'kills', count: 100 },
  },
  {
    id: 'cmb_slayer',
    name: 'Slayer',
    desc: 'Defeat 1,000 enemies.',
    category: 'combat',
    renown: 25,
    trigger: { kind: 'counter', counter: 'kills', count: 1000 },
    reward: { kind: 'title', titleId: 'deed:slayer' },
  },
  {
    id: 'cmb_first_boss',
    name: 'Something Bigger',
    desc: 'Land the killing blow on your first boss.',
    category: 'combat',
    renown: 10,
    trigger: { kind: 'counter', counter: 'bossKills', count: 1 },
  },
  {
    id: 'cmb_boss_fifty',
    name: 'Practiced Hand',
    desc: 'Defeat 50 bosses.',
    category: 'combat',
    renown: 25,
    trigger: { kind: 'counter', counter: 'bossKills', count: 50 },
  },
  {
    id: 'cmb_duel_ten',
    name: 'Best of Ten',
    desc: 'Win 10 duels.',
    category: 'combat',
    renown: 10,
    trigger: { kind: 'counter', counter: 'duelWins', count: 10 },
  },
  {
    id: 'cmb_arena_first_win',
    name: 'Blooded in the Coliseum',
    desc: 'Win your first ranked arena match.',
    category: 'combat',
    renown: 10,
    trigger: { kind: 'counter', counter: 'arenaWins', count: 1 },
  },
  {
    id: 'cmb_arena_fifty',
    name: 'Coliseum Regular',
    desc: 'Win 50 ranked arena matches.',
    category: 'combat',
    renown: 25,
    trigger: { kind: 'counter', counter: 'arenaWins', count: 50 },
  },
  {
    id: 'cmb_first_fall',
    name: 'It Happens',
    desc: 'Fall in battle for the first time. Everyone does.',
    category: 'combat',
    // Zero renown on purpose: a deed you cannot avoid should not be worth score.
    renown: 0,
    hidden: true,
    trigger: { kind: 'counter', counter: 'deaths', count: 1 },
  },
];
