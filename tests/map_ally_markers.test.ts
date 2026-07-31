import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../src/sim/types';
import {
  ALLY_DEAD_COLOR,
  ALLY_FRIEND_COLOR,
  ALLY_GUILD_COLOR,
  type AllyPartyMember,
  type AllySocialMember,
  buildMapAllyMarkers,
} from '../src/ui/map_ally_markers';

const CLASS_COLORS: Record<string, string> = { warrior: '#c79c6e', mage: '#69ccf0' };
const classColor = (cls: PlayerClass) => CLASS_COLORS[cls] ?? '#fff';
// The zone panel currently drawn: everything with z in [0, 100).
const inView = (_x: number, z: number) => z >= 0 && z < 100;

const party = (
  pid: number,
  name: string,
  over: Partial<AllyPartyMember> = {},
): AllyPartyMember => ({
  pid,
  name,
  cls: 'warrior' as PlayerClass,
  x: 10,
  z: 10,
  dead: 0,
  ...over,
});

const social = (
  id: number,
  name: string,
  over: Partial<AllySocialMember> = {},
): AllySocialMember => ({ id, name, online: true, x: 20, z: 20, ...over });

const build = (over: Partial<Parameters<typeof buildMapAllyMarkers>[0]> = {}) =>
  buildMapAllyMarkers({
    selfPid: 1,
    selfName: 'Me',
    party: [],
    friends: [],
    guild: [],
    inView,
    classColor,
    ...over,
  });

describe('buildMapAllyMarkers', () => {
  it('plots party members in their class color', () => {
    // The gap this closes: the zone map drew friends and guildmates but not the
    // party, so a grouped stranger did not appear on the map at all.
    expect(build({ party: [party(2, 'Aki', { cls: 'mage' as PlayerClass })] })).toEqual([
      { x: 10, z: 10, name: 'Aki', color: '#69ccf0' },
    ]);
  });

  it('greys out a dead party member instead of using the class color', () => {
    const out = build({ party: [party(2, 'Aki', { dead: 1 })] });
    expect(out[0].color).toBe(ALLY_DEAD_COLOR);
  });

  it('never plots the viewing player', () => {
    expect(build({ party: [party(1, 'Me')] })).toEqual([]);
    expect(build({ friends: [social(9, 'Me')] })).toEqual([]);
  });

  it('plots friends green and guildmates blue', () => {
    const out = build({ friends: [social(2, 'Fen')], guild: [social(3, 'Gil')] });
    expect(out).toEqual([
      { x: 20, z: 20, name: 'Fen', color: ALLY_FRIEND_COLOR },
      { x: 20, z: 20, name: 'Gil', color: ALLY_GUILD_COLOR },
    ]);
  });

  it('draws a grouped guildmate ONCE, in the party class color, not twice', () => {
    // Same rule the minimap already follows: the party pass owns the marker, so
    // the friend/guild pass must skip anyone it already drew.
    const out = build({
      party: [party(2, 'Gil', { cls: 'mage' as PlayerClass })],
      guild: [social(3, 'Gil')],
      friends: [social(4, 'Gil')],
    });
    expect(out).toHaveLength(1);
    expect(out[0].color).toBe('#69ccf0');
  });

  it('lets a friend win a tie with the guild list, and dedupes by social id', () => {
    const out = build({ friends: [social(7, 'Dup')], guild: [social(7, 'Dup')] });
    expect(out).toEqual([{ x: 20, z: 20, name: 'Dup', color: ALLY_FRIEND_COLOR }]);
  });

  it('keeps paint order: party, then friends, then guild', () => {
    const out = build({
      party: [party(2, 'P')],
      friends: [social(3, 'F')],
      guild: [social(4, 'G')],
    });
    expect(out.map((m) => m.name)).toEqual(['P', 'F', 'G']);
  });

  it('drops allies outside the drawn zone panel, from every source', () => {
    const out = build({
      party: [party(2, 'FarP', { z: 500 }), party(3, 'NearP')],
      friends: [social(4, 'FarF', { z: 500 })],
      guild: [social(5, 'FarG', { z: -1 })],
    });
    expect(out.map((m) => m.name)).toEqual(['NearP']);
  });

  it('still suppresses an out-of-zone party member from the friend/guild pass', () => {
    // The dedupe must key on membership, not on whether the party dot got drawn:
    // otherwise a grouped guildmate one zone over would reappear as a blue dot
    // only when the panel scrolled past them.
    const out = build({
      party: [party(2, 'Gil', { z: 500 })],
      guild: [social(3, 'Gil', { z: 20 })],
    });
    expect(out).toEqual([]);
  });

  it('skips offline or position-less social rows', () => {
    const out = build({
      friends: [
        social(2, 'Off', { online: false }),
        social(3, 'NoX', { x: undefined }),
        social(4, 'NoZ', { z: undefined }),
        social(5, 'Ok'),
      ],
    });
    expect(out.map((m) => m.name)).toEqual(['Ok']);
  });

  it('returns nothing when solo and offline (no party, no social)', () => {
    expect(build()).toEqual([]);
  });
});
