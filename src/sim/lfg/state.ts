// The queue record and the small helpers that keep it ordered. No policy here.
//
// The state record is owned by the HOST (one field on Sim). Functions in this
// directory take it as an explicit argument and mutate it in place, the same
// sanctioned shape src/sim/professions uses for the caller-owned InvSlot array.
// Nothing here reaches into Sim, reads a wall clock, or draws randomness.

import type { LfgProposal, LfgQueueState, LfgQueueUnit } from './types';

export function createLfgQueueState(): LfgQueueState {
  return {
    units: [],
    proposals: [],
    cooldowns: new Map<number, number>(),
    nextUnitId: 1,
    nextProposalId: 1,
  };
}

// Queue order is (joinedAt, unitId). Both are assigned by the host from the sim
// clock and a monotonic counter, so the order is total and reproducible: two
// hosts replaying the same inputs sort the queue identically.
export function sortUnits(state: LfgQueueState): void {
  state.units.sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id);
}

// Idempotent: a unit already in the queue is never added a second time. Units
// are held by reference by an open proposal, so a double insert would put the
// same players in the queue twice and let one group consume two instance slots.
export function insertUnit(state: LfgQueueState, unit: LfgQueueUnit): void {
  if (state.units.some((u) => u.id === unit.id)) return;
  state.units.push(unit);
  sortUnits(state);
}

export function removeUnit(state: LfgQueueState, unitId: number): LfgQueueUnit | null {
  const i = state.units.findIndex((u) => u.id === unitId);
  if (i < 0) return null;
  return state.units.splice(i, 1)[0];
}

export function unitForPid(state: LfgQueueState, pid: number): LfgQueueUnit | null {
  return state.units.find((u) => u.members.some((m) => m.pid === pid)) ?? null;
}

export function proposalForPid(state: LfgQueueState, pid: number): LfgProposal | null {
  return state.proposals.find((p) => p.members.some((m) => m.pid === pid)) ?? null;
}

export function removeProposal(state: LfgQueueState, proposalId: number): LfgProposal | null {
  const i = state.proposals.findIndex((p) => p.id === proposalId);
  if (i < 0) return null;
  return state.proposals.splice(i, 1)[0];
}

export function setCooldown(state: LfgQueueState, pid: number, until: number): void {
  const current = state.cooldowns.get(pid) ?? 0;
  if (until > current) state.cooldowns.set(pid, until);
}

export function cooldownRemaining(state: LfgQueueState, pid: number, now: number): number {
  const until = state.cooldowns.get(pid);
  if (until === undefined) return 0;
  return until > now ? until - now : 0;
}

export function clearExpiredCooldowns(state: LfgQueueState, now: number): void {
  for (const [pid, until] of state.cooldowns) {
    if (until <= now) state.cooldowns.delete(pid);
  }
}

// Units waiting for one dungeon, in queue order.
export function unitsFor(state: LfgQueueState, dungeonId: string): LfgQueueUnit[] {
  return state.units.filter((u) => u.dungeonId === dungeonId);
}

// Open proposals for one dungeon. Each one holds a reservation on an instance
// slot for its whole lifetime, so the matchmaker must subtract these before it
// forms anything new.
export function openProposalsFor(state: LfgQueueState, dungeonId: string): LfgProposal[] {
  return state.proposals.filter((p) => p.dungeonId === dungeonId);
}
