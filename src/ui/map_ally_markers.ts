// Which allies the zone map plots, in what order and in what color. Pure and
// DOM-free (a Vitest imports it directly); the map painter in hud.ts is the thin
// consumer that turns each marker into a disc plus a name label.
//
// Three ally sources overlap: your PARTY (streamed live in partyInfo, offline and
// online), your FRIENDS and your GUILD (streamed in socialInfo, online only). The
// same person can be in all three, so the marker list is deduped with party winning
// (its class color carries more information than "is a friend") and friends winning
// over guild. That mirrors the minimap, which already skips party members in its
// friend/guild coloring pass so a grouped guildmate is one dot, not two.

import type { PlayerClass } from '../sim/types';

/** One ally to draw: a world position, a label and a resolved marker color. */
export interface MapAllyMarker {
  readonly x: number;
  readonly z: number;
  readonly name: string;
  readonly color: string;
}

/** The party rows the painter needs (a structural subset of PartyMemberInfo). */
export interface AllyPartyMember {
  readonly pid: number;
  readonly name: string;
  readonly cls: PlayerClass;
  readonly x: number;
  readonly z: number;
  readonly dead: number;
}

/** The social rows the painter needs (a structural subset of FriendInfo). */
export interface AllySocialMember {
  readonly id: number;
  readonly name: string;
  readonly online: boolean;
  readonly x?: number;
  readonly z?: number;
}

export interface MapAllyMarkerInput {
  /** The viewing player's own id and name, both excluded from the list. */
  readonly selfPid: number;
  readonly selfName: string;
  readonly party: readonly AllyPartyMember[];
  readonly friends: readonly AllySocialMember[];
  readonly guild: readonly AllySocialMember[];
  /** True when a world position falls inside the zone panel currently drawn. */
  readonly inView: (x: number, z: number) => boolean;
  /** Class color for a live party member (the HUD's shared classCss). */
  readonly classColor: (cls: PlayerClass) => string;
}

/** Dead party members grey out rather than taking their class color. */
export const ALLY_DEAD_COLOR = '#9a9a9a';
export const ALLY_FRIEND_COLOR = '#4ade80';
export const ALLY_GUILD_COLOR = '#60a5fa';

/**
 * The markers to draw, in paint order: party first (class-colored), then friends,
 * then guild. Off-view allies are dropped here rather than in the painter so the
 * ordering and dedupe rules are testable without a canvas.
 */
export function buildMapAllyMarkers(input: MapAllyMarkerInput): MapAllyMarker[] {
  const out: MapAllyMarker[] = [];
  // Party membership is matched by NAME downstream because socialInfo rows carry a
  // social id, not a live entity pid, so the pid is not comparable across the two.
  const partyNames = new Set<string>();
  for (const m of input.party) {
    if (m.pid === input.selfPid) continue;
    partyNames.add(m.name);
    if (!input.inView(m.x, m.z)) continue;
    out.push({
      x: m.x,
      z: m.z,
      name: m.name,
      color: m.dead ? ALLY_DEAD_COLOR : input.classColor(m.cls),
    });
  }
  const drawn = new Set<number>();
  const pushSocial = (rows: readonly AllySocialMember[], color: string) => {
    for (const m of rows) {
      if (!m.online || m.x === undefined || m.z === undefined) continue;
      if (m.name === input.selfName || partyNames.has(m.name) || drawn.has(m.id)) continue;
      if (!input.inView(m.x, m.z)) continue;
      drawn.add(m.id);
      out.push({ x: m.x, z: m.z, name: m.name, color });
    }
  };
  pushSocial(input.friends, ALLY_FRIEND_COLOR); // friends win ties with guild
  pushSocial(input.guild, ALLY_GUILD_COLOR);
  return out;
}
