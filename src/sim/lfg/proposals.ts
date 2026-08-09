// Proposal lifecycle: opening a ready check, answering it, and closing it.
//
// A proposal is the ONLY thing that ever leaves the queue, and it holds an
// instance-slot reservation for its whole lifetime. Nothing here teleports
// anybody: a completed proposal becomes an LfgFormGroupIntent the host performs
// through its existing party + enterDungeon path.

import {
  cooldownRemaining,
  insertUnit,
  proposalForPid,
  removeProposal,
  setCooldown,
} from './state';
import { LFG_DECLINE_COOLDOWN_SEC, LFG_READY_WINDOW_SEC, LFG_TIMEOUT_COOLDOWN_SEC } from './tuning';
import type {
  LfgCloseReason,
  LfgIntent,
  LfgPenaltyReason,
  LfgProposal,
  LfgQueueState,
  LfgQueueUnit,
  LfgRelax,
} from './types';
import { assignRoles } from './roles';

export interface LfgPenalty {
  pid: number;
  reason: LfgPenaltyReason;
}

export interface LfgCloseOptions {
  // Players removed from the queue entirely instead of being requeued.
  drop?: readonly number[];
  // Players removed AND put on a re-queue cooldown.
  penalize?: readonly LfgPenalty[];
}

export function cooldownSecondsFor(reason: LfgPenaltyReason): number {
  return reason === 'timedOut' ? LFG_TIMEOUT_COOLDOWN_SEC : LFG_DECLINE_COOLDOWN_SEC;
}

// Pull `units` out of the queue and open a ready check over them. The caller
// has already verified the group is valid and that a slot is available.
export function openProposal(
  state: LfgQueueState,
  dungeonId: string,
  units: readonly LfgQueueUnit[],
  relax: LfgRelax,
  now: number,
): { proposal: LfgProposal; intent: LfgIntent } {
  // Only units that were actually IN the queue may be pulled into a proposal,
  // and never the same unit twice: either would put a player in two places at
  // once. Both are silently dropped rather than trusted.
  const seen = new Set<number>();
  const pulled: LfgQueueUnit[] = [];
  for (const u of units) {
    if (seen.has(u.id)) continue;
    const i = state.units.findIndex((q) => q.id === u.id);
    if (i < 0) continue;
    state.units.splice(i, 1);
    seen.add(u.id);
    pulled.push(u);
  }
  const members = pulled.flatMap((u) => u.members.map((m) => ({ unitId: u.id, member: m })));
  const assignment = assignRoles(members.map((x) => x.member));
  const proposal: LfgProposal = {
    id: state.nextProposalId++,
    dungeonId,
    state: 'pending',
    relax,
    createdAt: now,
    expiresAt: now + LFG_READY_WINDOW_SEC,
    readyAt: null,
    members: members.map((x) => ({
      pid: x.member.pid,
      unitId: x.unitId,
      role: assignment.byPid.get(x.member.pid) ?? 'dps',
      responded: false,
      accepted: false,
    })),
    units: pulled,
  };
  state.proposals.push(proposal);
  state.proposals.sort((a, b) => a.id - b.id);
  return {
    proposal,
    intent: {
      kind: 'dungeonFinderProposalOpened',
      proposalId: proposal.id,
      dungeonId,
      expiresAt: proposal.expiresAt,
      members: proposal.members.map((m) => ({ pid: m.pid, role: m.role })),
    },
  };
}

// Close a proposal without forming a group. Everyone who is not dropped or
// penalized goes back into the queue WITH THEIR ORIGINAL joinedAt, so four
// players are never punished for a fifth player's decline.
export function closeProposal(
  state: LfgQueueState,
  proposal: LfgProposal,
  reason: LfgCloseReason,
  now: number,
  opts: LfgCloseOptions = {},
): LfgIntent[] {
  // Idempotent. Closing a proposal twice would requeue every unit a second
  // time, and since units are held by reference the queue would then contain
  // the same players in two entries; the next tick would open two proposals for
  // one group of people and burn two instance slots on them.
  if (!removeProposal(state, proposal.id)) return [];
  const intents: LfgIntent[] = [];
  const removed = new Set<number>(opts.drop ?? []);
  for (const p of opts.penalize ?? []) {
    removed.add(p.pid);
    const readyAt = now + cooldownSecondsFor(p.reason);
    setCooldown(state, p.pid, readyAt);
    intents.push({ kind: 'dungeonFinderPenalty', pid: p.pid, reason: p.reason, readyAt });
  }

  const requeuedPids: number[] = [];
  for (const unit of proposal.units) {
    const keep = unit.members.filter((m) => !removed.has(m.pid));
    if (keep.length === 0) continue;
    unit.members = keep;
    insertUnit(state, unit);
    for (const m of keep) requeuedPids.push(m.pid);
  }

  intents.push({
    kind: 'dungeonFinderProposalClosed',
    proposalId: proposal.id,
    dungeonId: proposal.dungeonId,
    reason,
    pids: proposal.members.map((m) => m.pid),
    requeuedPids,
  });
  return intents;
}

export type LfgRespondDeny = 'noProposal' | 'wrongProposal' | 'alreadyResponded';

export interface LfgRespondResult {
  ok: boolean;
  deny: LfgRespondDeny | null;
  proposalId: number | null;
  ready: boolean; // every member has now accepted
  intents: LfgIntent[];
}

export interface LfgRespondRequest {
  pid: number;
  accept: boolean;
  now: number;
  proposalId?: number; // optional guard against answering a stale popup
}

// Answer a ready check. Accepting never forms the group here: promotion happens
// in tickDungeonFinder, where the instance-slot budget is re-checked.
export function respondToLfgProposal(
  state: LfgQueueState,
  req: LfgRespondRequest,
): LfgRespondResult {
  const deny = (d: LfgRespondDeny, id: number | null = null): LfgRespondResult => ({
    ok: false,
    deny: d,
    proposalId: id,
    ready: false,
    intents: [],
  });
  const proposal = proposalForPid(state, req.pid);
  if (!proposal) return deny('noProposal');
  if (req.proposalId !== undefined && req.proposalId !== proposal.id)
    return deny('wrongProposal', proposal.id);
  const member = proposal.members.find((m) => m.pid === req.pid);
  if (!member) return deny('noProposal');
  if (member.responded) return deny('alreadyResponded', proposal.id);

  member.responded = true;
  member.accepted = req.accept;

  if (!req.accept) {
    const intents = closeProposal(state, proposal, 'declined', req.now, {
      penalize: [{ pid: req.pid, reason: 'declined' }],
    });
    return { ok: true, deny: null, proposalId: proposal.id, ready: false, intents };
  }

  const ready = proposal.members.every((m) => m.accepted);
  if (ready) {
    proposal.state = 'ready';
    proposal.readyAt = req.now;
  }
  return { ok: true, deny: null, proposalId: proposal.id, ready, intents: [] };
}

// Pending proposals whose ready window has run out. Everyone who never answered
// is penalized; everyone who accepted goes back to their place in the queue.
export function expireProposals(state: LfgQueueState, now: number): LfgIntent[] {
  const intents: LfgIntent[] = [];
  for (const proposal of [...state.proposals]) {
    if (proposal.state !== 'pending' || now < proposal.expiresAt) continue;
    const penalize = proposal.members
      .filter((m) => !m.responded)
      .map((m) => ({ pid: m.pid, reason: 'timedOut' as LfgPenaltyReason }));
    intents.push(...closeProposal(state, proposal, 'timedOut', now, { penalize }));
  }
  return intents;
}

// True while the player owes an answer, used by the join guard.
export function isOnCooldown(state: LfgQueueState, pid: number, now: number): boolean {
  return cooldownRemaining(state, pid, now) > 0;
}
