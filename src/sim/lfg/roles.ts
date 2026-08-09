// Which role a class may queue for, and how a formed set is split into roles.
// Pure leaf: no content import, no data.ts import, no rng.

import type { PlayerClass } from '../types';
import type { LfgQueueMember, LfgRole } from './types';
import { LFG_ROLES } from './types';

// Mirrors the shipped spec table (src/sim/content/talents_classic.ts and
// talents_warrior.ts): a class may queue for a role it has a spec for.
// Deliberately transcribed rather than imported so this stays a pure leaf;
// tests/lfg_roles.test.ts derives the same map from TALENTS and fails on drift.
//
// Tanks: warrior, paladin, druid (3 of 9). Healers: paladin, priest, shaman,
// druid (4 of 9). Everything can deal damage. That 3/9 tank supply is the whole
// reason the matchmaker relaxes over time instead of holding out for 1/1/3.
export const LFG_CLASS_ROLES: Readonly<Record<PlayerClass, readonly LfgRole[]>> = {
  warrior: ['tank', 'dps'],
  paladin: ['tank', 'healer', 'dps'],
  hunter: ['dps'],
  rogue: ['dps'],
  priest: ['healer', 'dps'],
  shaman: ['healer', 'dps'],
  mage: ['dps'],
  warlock: ['dps'],
  druid: ['tank', 'healer', 'dps'],
};

export function eligibleRoles(cls: PlayerClass): readonly LfgRole[] {
  return LFG_CLASS_ROLES[cls] ?? ['dps'];
}

export function canFill(cls: PlayerClass, role: LfgRole): boolean {
  return eligibleRoles(cls).includes(role);
}

// Declared roles intersected with what the class can actually do, in the
// canonical tank/healer/dps order so two players who declared the same set
// always produce the same array. An empty or all-invalid request means "any
// role I can fill": a small population cannot afford a queue that punishes a
// player for not ticking boxes.
export function resolveRoles(cls: PlayerClass, requested: readonly LfgRole[]): LfgRole[] {
  const able = eligibleRoles(cls);
  const wanted = requested.filter((r) => able.includes(r));
  const src = wanted.length > 0 ? wanted : able;
  return LFG_ROLES.filter((r) => src.includes(r));
}

export interface LfgAssignment {
  byPid: Map<number, LfgRole>;
  tankPid: number | null;
  healerPid: number | null;
}

// Split a candidate set into 1 tank + 1 healer + rest damage.
//
// Every listing uses the 1/1/3 composition, so an exhaustive pass over ordered
// (tank, healer) pairs is both complete and trivially cheap at group size 5: it
// cannot fail the way a greedy fill can when the only tank is also the only
// healer candidate. Members arrive in queue order and the search walks them in
// that order, so the assignment is a pure function of the input order.
export function assignRoles(members: readonly LfgQueueMember[]): LfgAssignment {
  const byPid = new Map<number, LfgRole>();
  let tankPid: number | null = null;
  let healerPid: number | null = null;

  // Prefer the least flexible candidate for each anchor slot so a druid is not
  // burned as the tank while a warrior sits in the damage seats. Ties break on
  // queue order, then pid.
  const ordered = members
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.roles.length - b.m.roles.length || a.i - b.i || a.m.pid - b.m.pid)
    .map((x) => x.m);

  outer: for (const t of ordered) {
    if (!t.roles.includes('tank')) continue;
    for (const h of ordered) {
      if (h.pid === t.pid || !h.roles.includes('healer')) continue;
      tankPid = t.pid;
      healerPid = h.pid;
      break outer;
    }
  }
  // No valid pair exists, so at most one anchor can be filled. TANK WINS: with
  // only one anchor-capable player in the group, a tank plus four damage
  // dealers is a group that can pull, and a healer plus four damage dealers is
  // a group where the first pull kills whoever it looks at. This is the branch
  // the 'anchored' tier accepts, so the choice is load-bearing.
  if (tankPid === null) {
    const t = ordered.find((m) => m.roles.includes('tank')) ?? null;
    const h = ordered.find((m) => m.roles.includes('healer') && m.pid !== t?.pid) ?? null;
    tankPid = t ? t.pid : null;
    healerPid = h ? h.pid : null;
  }

  for (const m of members) {
    if (m.pid === tankPid) byPid.set(m.pid, 'tank');
    else if (m.pid === healerPid) byPid.set(m.pid, 'healer');
    else byPid.set(m.pid, 'dps');
  }
  return { byPid, tankPid, healerPid };
}
