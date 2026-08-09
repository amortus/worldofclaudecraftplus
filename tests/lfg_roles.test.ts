import { describe, expect, it } from 'vitest';
import { TALENTS, talentsFor } from '../src/sim/content/talents';
import type { PlayerClass } from '../src/sim/types';
import {
  LFG_CLASS_ROLES,
  assignRoles,
  canFill,
  eligibleRoles,
  resolveRoles,
  type LfgQueueMember,
  type LfgRole,
} from '../src/sim/lfg';

const member = (pid: number, cls: PlayerClass, roles?: LfgRole[]): LfgQueueMember => ({
  pid,
  cls,
  level: 20,
  roles: resolveRoles(cls, roles ?? []),
});

describe('dungeon finder roles', () => {
  // The transcribed map must equal what the shipped spec table actually says.
  it('matches the roles the spec table gives each class', () => {
    const classes = Object.keys(LFG_CLASS_ROLES) as PlayerClass[];
    expect(classes.sort()).toEqual((Object.keys(TALENTS) as PlayerClass[]).sort());
    for (const cls of classes) {
      const fromSpecs = [...new Set(talentsFor(cls)!.specs.map((s) => s.role))].sort();
      expect([...LFG_CLASS_ROLES[cls]].sort()).toEqual(fromSpecs);
    }
  });

  it('has the thin tank and healer supply the relax ladder exists for', () => {
    const classes = Object.keys(LFG_CLASS_ROLES) as PlayerClass[];
    expect(classes.filter((c) => canFill(c, 'tank')).sort()).toEqual([
      'druid',
      'paladin',
      'warrior',
    ]);
    expect(classes.filter((c) => canFill(c, 'healer')).sort()).toEqual([
      'druid',
      'paladin',
      'priest',
      'shaman',
    ]);
    expect(classes.every((c) => canFill(c, 'dps'))).toBe(true);
  });

  it('intersects a request with what the class can do', () => {
    expect(resolveRoles('mage', ['tank', 'healer'])).toEqual(['dps']);
    expect(resolveRoles('paladin', ['healer'])).toEqual(['healer']);
    expect(resolveRoles('warrior', ['dps', 'tank'])).toEqual(['tank', 'dps']);
  });

  it('treats an empty request as every role the class can fill', () => {
    expect(resolveRoles('druid', [])).toEqual(['tank', 'healer', 'dps']);
    expect(resolveRoles('rogue', [])).toEqual(['dps']);
    expect(eligibleRoles('hunter')).toEqual(['dps']);
  });

  it('fills both anchors from a standard five', () => {
    const a = assignRoles([
      member(1, 'warrior'),
      member(2, 'priest'),
      member(3, 'mage'),
      member(4, 'rogue'),
      member(5, 'hunter'),
    ]);
    expect(a.tankPid).toBe(1);
    expect(a.healerPid).toBe(2);
    expect(a.byPid.get(3)).toBe('dps');
  });

  // Greedy assignment fails this set: the paladin is the first tank candidate
  // AND the only healer candidate. The exhaustive pair search does not.
  it('does not burn the only healer as the tank', () => {
    const a = assignRoles([
      member(1, 'paladin'),
      member(2, 'warrior'),
      member(3, 'mage'),
      member(4, 'mage'),
      member(5, 'mage'),
    ]);
    expect(a.tankPid).toBe(2);
    expect(a.healerPid).toBe(1);
  });

  it('reports a missing anchor instead of inventing one', () => {
    const a = assignRoles([member(1, 'mage'), member(2, 'rogue'), member(3, 'hunter')]);
    expect(a.tankPid).toBeNull();
    expect(a.healerPid).toBeNull();
    expect(a.byPid.get(1)).toBe('dps');
  });

  it('honours a declared role over class flexibility', () => {
    // A druid who only signed up to heal is not drafted as the tank.
    const a = assignRoles([
      member(1, 'druid', ['healer']),
      member(2, 'warrior'),
      member(3, 'mage'),
    ]);
    expect(a.tankPid).toBe(2);
    expect(a.healerPid).toBe(1);
  });

  it('assigns the same roles for the same input order every time', () => {
    const build = () =>
      assignRoles([
        member(7, 'druid'),
        member(3, 'paladin'),
        member(9, 'shaman'),
        member(1, 'mage'),
        member(5, 'warrior'),
      ]);
    expect([...build().byPid.entries()]).toEqual([...build().byPid.entries()]);
  });
});
