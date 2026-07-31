// Progression deeds: levels, talents, prestige, and Dawn of Claude standing.
// Data only; the evaluator is src/sim/deeds/evaluator.ts.

import type { DeedDef } from '../../deeds/types';

export const PROGRESSION_DEEDS: readonly DeedDef[] = [
  {
    id: 'prog_first_steps',
    name: 'First Steps',
    desc: 'Reach level 2 and take your first step on a long road.',
    category: 'progression',
    renown: 5,
    trigger: { kind: 'counter', counter: 'level', count: 2 },
  },
  {
    id: 'prog_finding_your_feet',
    name: 'Finding Your Feet',
    desc: 'Reach level 5. The Vale already looks a little smaller.',
    category: 'progression',
    renown: 5,
    trigger: { kind: 'counter', counter: 'level', count: 5 },
  },
  {
    id: 'prog_double_digits',
    name: 'Double Digits',
    desc: 'Reach level 10 and unlock your talents.',
    category: 'progression',
    renown: 10,
    trigger: { kind: 'counter', counter: 'level', count: 10 },
  },
  {
    id: 'prog_the_long_climb',
    name: 'The Long Climb',
    desc: 'Reach level 15, high enough that Thornpeak will have you.',
    category: 'progression',
    renown: 10,
    trigger: { kind: 'counter', counter: 'level', count: 15 },
  },
  {
    id: 'prog_level_cap',
    name: 'The View From Twenty',
    desc: 'Reach level 20, the level cap.',
    category: 'progression',
    renown: 25,
    trigger: { kind: 'counter', counter: 'level', count: 20 },
    reward: { kind: 'title', titleId: 'deed:elder' },
  },
  {
    id: 'prog_talented',
    name: 'A Point Well Spent',
    desc: 'Spend your first talent point.',
    category: 'progression',
    renown: 5,
    trigger: { kind: 'counter', counter: 'talentPointsSpent', count: 1 },
  },
  {
    id: 'prog_committed',
    name: 'Committed',
    desc: 'Spend five talent points on a single build.',
    category: 'progression',
    renown: 10,
    trigger: { kind: 'counter', counter: 'talentPointsSpent', count: 5 },
  },
  {
    id: 'prog_veteran',
    name: 'Veteran',
    // Mirrors the existing lifetime-XP milestone thresholds (types.ts MILESTONES)
    // so the two systems never disagree about what 250k experience is worth.
    desc: 'Earn 250,000 lifetime experience.',
    category: 'progression',
    renown: 10,
    trigger: { kind: 'counter', counter: 'lifetimeXp', count: 250000 },
  },
  {
    id: 'prog_champion',
    name: 'Champion',
    desc: 'Earn 500,000 lifetime experience.',
    category: 'progression',
    renown: 25,
    trigger: { kind: 'counter', counter: 'lifetimeXp', count: 500000 },
  },
  {
    id: 'prog_begin_again',
    name: 'Begin Again',
    desc: 'Fill the bar once more past the cap and claim prestige rank 1.',
    category: 'progression',
    renown: 25,
    trigger: { kind: 'counter', counter: 'prestigeRank', count: 1 },
  },
  {
    id: 'prog_old_habits',
    name: 'Old Habits',
    desc: 'Reach prestige rank 5.',
    category: 'progression',
    renown: 50,
    trigger: { kind: 'counter', counter: 'prestigeRank', count: 5 },
  },
  {
    id: 'prog_dawn_friendly',
    name: 'A Friend at Gravewatch',
    desc: 'Reach Friendly with the Dawn of Claude.',
    category: 'progression',
    renown: 5,
    // The Friendly floor from src/sim/reputation.ts REP_TIERS.
    trigger: { kind: 'counter', counter: 'reputationDawn', count: 3000 },
  },
  {
    id: 'prog_dawn_honored',
    name: 'Honored by the Dawn',
    desc: 'Reach Honored with the Dawn of Claude.',
    category: 'progression',
    renown: 10,
    trigger: { kind: 'counter', counter: 'reputationDawn', count: 9000 },
  },
  {
    id: 'prog_dawn_exalted',
    name: 'Light Against the Ash',
    desc: 'Reach Exalted with the Dawn of Claude.',
    category: 'progression',
    renown: 50,
    trigger: { kind: 'counter', counter: 'reputationDawn', count: 42000 },
    reward: { kind: 'title', titleId: 'deed:of_the_dawn' },
  },
];
