// Joining, leaving, and the read model the HUD renders.

import type { PlayerClass } from '../types';
import { listingFor, meetsLevel } from './catalog';
import { relaxFor } from './matchmake';
import { closeProposal } from './proposals';
import { resolveRoles } from './roles';
import {
  cooldownRemaining,
  insertUnit,
  proposalForPid,
  unitForPid,
  unitsFor,
} from './state';
import type {
  LfgIntent,
  LfgJoinDeny,
  LfgJoinResult,
  LfgQueueMember,
  LfgQueueState,
  LfgRole,
  LfgRoleCounts,
  LfgStatusView,
} from './types';

export interface LfgJoinMember {
  pid: number;
  cls: PlayerClass;
  level: number;
  // What the player is willing to be. Omitted or empty means "anything my
  // class can do", which is the pop-friendly default for a small realm.
  roles?: readonly LfgRole[];
}

export interface LfgJoinRequest {
  dungeonId: string;
  members: readonly LfgJoinMember[];
  premade: boolean; // the members came in as an existing party
  now: number; // sim-clock seconds
}

function denied(
  deny: LfgJoinDeny,
  extra: Partial<Pick<LfgJoinResult, 'denyPid' | 'requiredLevel' | 'cooldownRemaining'>> = {},
): LfgJoinResult {
  return {
    ok: false,
    unitId: null,
    deny,
    denyPid: extra.denyPid ?? null,
    requiredLevel: extra.requiredLevel ?? null,
    cooldownRemaining: extra.cooldownRemaining ?? null,
  };
}

// Queue a solo player or a whole premade party for one dungeon. Every gate is
// checked before anything is mutated, so a denied join leaves the queue exactly
// as it was.
export function joinDungeonFinder(state: LfgQueueState, req: LfgJoinRequest): LfgJoinResult {
  const listing = listingFor(req.dungeonId);
  if (!listing) return denied('unknownDungeon');
  if (req.members.length === 0) return denied('emptyGroup');
  if (req.members.length > listing.groupSize) return denied('groupTooLarge');

  const resolved: LfgQueueMember[] = [];
  const seen = new Set<number>();
  for (const m of req.members) {
    // The state checks below only see units that already exist, so a pid
    // repeated INSIDE one request would sail through and produce a "five" that
    // is really four people holding a five-slot instance.
    if (seen.has(m.pid)) return denied('duplicateMember', { denyPid: m.pid });
    seen.add(m.pid);
    if (unitForPid(state, m.pid)) return denied('alreadyQueued', { denyPid: m.pid });
    if (proposalForPid(state, m.pid)) return denied('inProposal', { denyPid: m.pid });
    const cd = cooldownRemaining(state, m.pid, req.now);
    if (cd > 0) return denied('onCooldown', { denyPid: m.pid, cooldownRemaining: cd });
    if (!meetsLevel(listing, m.level))
      return denied('levelTooLow', { denyPid: m.pid, requiredLevel: listing.minQueueLevel });
    // resolveRoles always yields at least 'dps', so there is no "you cannot
    // fill any role" arm: every class in this game can deal damage.
    resolved.push({ pid: m.pid, cls: m.cls, level: m.level, roles: resolveRoles(m.cls, m.roles ?? []) });
  }

  const unit = {
    id: state.nextUnitId++,
    dungeonId: req.dungeonId,
    members: resolved,
    joinedAt: req.now,
    premade: req.premade,
  };
  insertUnit(state, unit);
  return { ok: true, unitId: unit.id, deny: null, denyPid: null, requiredLevel: null, cooldownRemaining: null };
}

export interface LfgLeaveResult {
  ok: boolean;
  deny: 'notQueued' | null;
  // True when the player walked out of a ready check rather than the queue,
  // which is the only leave that costs anything.
  fromProposal: boolean;
  intents: LfgIntent[];
}

// Leave the queue.
//
// From the queue itself this is free and silent: a player sitting in a queue has
// promised nobody anything, and charging for it would only teach people to stay
// queued while they do something else, which is worse for everyone.
//
// From an open ready check it is a decline, penalty included, because four other
// people were already told they had a group.
export function leaveDungeonFinder(
  state: LfgQueueState,
  pid: number,
  now: number,
): LfgLeaveResult {
  const proposal = proposalForPid(state, pid);
  if (proposal) {
    const intents = closeProposal(state, proposal, 'memberLeft', now, {
      penalize: [{ pid, reason: 'declined' }],
    });
    return { ok: true, deny: null, fromProposal: true, intents };
  }
  const unit = unitForPid(state, pid);
  if (!unit) return { ok: false, deny: 'notQueued', fromProposal: false, intents: [] };
  // A premade that loses a member keeps its place in line: the people who
  // stayed should not be sent to the back for someone else's decision.
  unit.members = unit.members.filter((m) => m.pid !== pid);
  if (unit.members.length === 0) {
    const i = state.units.indexOf(unit);
    if (i >= 0) state.units.splice(i, 1);
  }
  return { ok: true, deny: null, fromProposal: false, intents: [] };
}

function roleCounts(members: readonly LfgQueueMember[]): LfgRoleCounts {
  const counts: LfgRoleCounts = { tank: 0, healer: 0, dps: 0 };
  for (const m of members) {
    for (const r of m.roles) counts[r] += 1;
  }
  return counts;
}

// Everything one player's HUD panel needs, as ids and numbers.
export function lfgStatusFor(state: LfgQueueState, pid: number, now: number): LfgStatusView {
  const empty: LfgStatusView = {
    state: 'idle',
    dungeonId: null,
    roles: [],
    queuedAt: null,
    waitSeconds: 0,
    relax: 'ideal',
    queuedUnits: 0,
    queuedPlayers: 0,
    queuedByRole: { tank: 0, healer: 0, dps: 0 },
    proposalId: null,
    proposalExpiresAt: null,
    cooldownUntil: null,
  };
  const cd = cooldownRemaining(state, pid, now);
  const cooldownUntil = cd > 0 ? now + cd : null;

  const proposal = proposalForPid(state, pid);
  if (proposal) {
    const member = proposal.members.find((m) => m.pid === pid);
    // The proposal still holds the unit, so the wait the player has been
    // watching keeps counting instead of blanking the moment the popup opens.
    const unit = proposal.units.find((u) => u.members.some((x) => x.pid === pid));
    return {
      ...empty,
      state: 'proposed',
      dungeonId: proposal.dungeonId,
      roles: member ? [member.role] : [],
      queuedAt: unit ? unit.joinedAt : null,
      waitSeconds: unit ? Math.max(0, now - unit.joinedAt) : 0,
      relax: proposal.relax,
      queuedUnits: proposal.units.length,
      queuedPlayers: proposal.members.length,
      queuedByRole: roleCounts(proposal.units.flatMap((u) => u.members)),
      proposalId: proposal.id,
      proposalExpiresAt: proposal.expiresAt,
      cooldownUntil,
    };
  }

  const unit = unitForPid(state, pid);
  if (!unit) return { ...empty, state: cooldownUntil !== null ? 'cooldown' : 'idle', cooldownUntil };

  const pool = unitsFor(state, unit.dungeonId);
  const members = pool.flatMap((u) => u.members);
  const me = unit.members.find((m) => m.pid === pid);
  return {
    state: 'queued',
    dungeonId: unit.dungeonId,
    roles: me ? [...me.roles] : [],
    queuedAt: unit.joinedAt,
    waitSeconds: Math.max(0, now - unit.joinedAt),
    // The player's OWN strictness, which is what the matchmaker uses when it
    // anchors on their unit.
    relax: relaxFor(now - unit.joinedAt),
    queuedUnits: pool.length,
    queuedPlayers: members.length,
    queuedByRole: roleCounts(members),
    proposalId: null,
    proposalExpiresAt: null,
    cooldownUntil,
  };
}
