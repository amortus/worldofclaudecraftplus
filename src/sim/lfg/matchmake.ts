// The matchmaker and the once-per-tick entry point.
//
// Zero randomness. Not "a fixed number of draws": this module takes no Rng at
// all and every ordering it relies on is total (joinedAt, then unit id, then
// pid). The host calls it from inside the 20 Hz tick on the shared world rng,
// and a single draw here would reorder every downstream roll in the world.

import { DUNGEON_FINDER_LISTINGS, listingFor } from './catalog';
import { closeProposal, expireProposals, openProposal } from './proposals';
import { assignRoles } from './roles';
import {
  clearExpiredCooldowns,
  openProposalsFor,
  removeProposal,
  unitsFor,
} from './state';
import { LFG_RELAX_AFTER_SECONDS, LFG_SLOT_WAIT_SEC } from './tuning';
import type {
  LfgIntent,
  LfgListing,
  LfgQueueMember,
  LfgQueueState,
  LfgQueueUnit,
  LfgRelax,
  LfgTickInput,
  LfgTickResult,
} from './types';

// Strictness as a function of the longest wait in the pool.
export function relaxFor(waitSeconds: number): LfgRelax {
  if (waitSeconds >= LFG_RELAX_AFTER_SECONDS.short) return 'short';
  if (waitSeconds >= LFG_RELAX_AFTER_SECONDS.any) return 'any';
  if (waitSeconds >= LFG_RELAX_AFTER_SECONDS.anchored) return 'anchored';
  return 'ideal';
}

function membersOf(units: readonly LfgQueueUnit[]): LfgQueueMember[] {
  return units.flatMap((u) => u.members);
}

// How many units past the anchor the search will look at, and how many search
// nodes it may visit. Both are hard bounds so the cost of a tick can never
// depend on how long the queue has grown, and both are fixed constants so the
// RESULT is still a pure function of the queue: the same pool always produces
// the same group.
const LFG_CANDIDATE_WINDOW = 12;
const LFG_SEARCH_NODE_BUDGET = 512;

function rolesSatisfied(units: readonly LfgQueueUnit[], relax: LfgRelax): boolean {
  if (relax === 'any' || relax === 'short') return true;
  const roles = assignRoles(membersOf(units));
  return relax === 'ideal'
    ? roles.tankPid !== null && roles.healerPid !== null
    : roles.tankPid !== null || roles.healerPid !== null;
}

// First exact-size group, in queue order, whose roles satisfy the tier.
//
// This is a search rather than a greedy fill because a greedy one misses real
// groups: an anchor duo plus a trio is a perfect five, but a greedy pass that
// takes the next duo first can never get back to it. Group size is 5, so the
// search is tiny; the window and node budget bound the pathological case.
function searchFullGroup(
  anchor: LfgQueueUnit,
  others: readonly LfgQueueUnit[],
  listing: LfgListing,
  relax: LfgRelax,
): LfgQueueUnit[] | null {
  let nodes = 0;
  let found: LfgQueueUnit[] | null = null;
  const chosen: LfgQueueUnit[] = [anchor];

  const walk = (start: number, size: number): void => {
    if (found || nodes++ > LFG_SEARCH_NODE_BUDGET) return;
    if (size === listing.groupSize) {
      if (rolesSatisfied(chosen, relax)) found = [...chosen];
      return;
    }
    for (let j = start; j < others.length; j++) {
      const u = others[j];
      if (size + u.members.length > listing.groupSize) continue;
      chosen.push(u);
      walk(j + 1, size + u.members.length);
      chosen.pop();
      if (found) return;
    }
  };
  walk(0, anchor.members.length);
  return found;
}

// Assemble the best group the pool allows around one anchor unit. Returns null
// when the pool cannot satisfy that anchor's strictness; the units simply stay
// queued.
//
// There is deliberately no "partial group" state. A set that is not yet valid
// is never held aside waiting for a fifth: it stays in the queue where another
// unit can still match it, and no player is ever locked out of matching while
// an incomplete group hopes for them.
export function buildCandidateGroup(
  pool: readonly LfgQueueUnit[],
  listing: LfgListing,
  relax: LfgRelax,
  anchorIndex = 0,
): LfgQueueUnit[] | null {
  const anchor = pool[anchorIndex];
  if (!anchor || anchor.members.length > listing.groupSize) return null;
  const others = pool.filter((_, i) => i !== anchorIndex).slice(0, LFG_CANDIDATE_WINDOW);

  // Cheap early out for the common case of a nearly empty queue.
  const available = anchor.members.length + membersOf(others).length;
  const floor = relax === 'short' ? listing.minGroupSize : listing.groupSize;
  if (available < floor) return null;

  const full = searchFullGroup(anchor, others, listing, relax);
  if (full) return full;
  if (relax !== 'short') return null;

  // Short tier only: settle for the largest group reachable in queue order.
  const chosen: LfgQueueUnit[] = [anchor];
  let size = anchor.members.length;
  for (const u of others) {
    if (size >= listing.groupSize) break;
    if (size + u.members.length > listing.groupSize) continue;
    chosen.push(u);
    size += u.members.length;
  }
  return size >= listing.minGroupSize ? chosen : null;
}

// Drop queued players the host reports as unavailable (offline, dead, already
// inside an instance). No penalty: they never broke a formed group.
function pruneUnavailable(state: LfgQueueState, input: LfgTickInput): LfgIntent[] {
  const intents: LfgIntent[] = [];
  for (const unit of [...state.units]) {
    const keep = unit.members.filter((m) => input.isAvailable(m.pid));
    if (keep.length === unit.members.length) continue;
    if (keep.length === 0) {
      const i = state.units.indexOf(unit);
      if (i >= 0) state.units.splice(i, 1);
      continue;
    }
    unit.members = keep;
  }
  for (const proposal of [...state.proposals]) {
    const gone = proposal.members.filter((m) => !input.isAvailable(m.pid)).map((m) => m.pid);
    if (gone.length === 0) continue;
    intents.push(
      ...closeProposal(state, proposal, 'memberUnavailable', input.now, { drop: gone }),
    );
  }
  return intents;
}

// Fully accepted proposals become groups, but only against a slot that is
// actually free RIGHT NOW. See OBSTACLE 1 in this directory's CLAUDE.md.
function promoteReady(
  state: LfgQueueState,
  now: number,
  budget: Record<string, number>,
): LfgIntent[] {
  const intents: LfgIntent[] = [];
  for (const proposal of [...state.proposals]) {
    if (proposal.state !== 'ready' || proposal.readyAt === null) continue;
    const free = budget[proposal.dungeonId] ?? 0;
    if (free > 0) {
      budget[proposal.dungeonId] = free - 1;
      removeProposal(state, proposal.id);
      const leaderUnit = [...proposal.units].sort(
        (a, b) => a.joinedAt - b.joinedAt || a.id - b.id,
      )[0];
      const leaderPid = leaderUnit?.members[0]?.pid ?? proposal.members[0].pid;
      const listing = listingFor(proposal.dungeonId);
      intents.push({
        kind: 'dungeonFinderFormGroup',
        proposalId: proposal.id,
        dungeonId: proposal.dungeonId,
        leaderPid,
        members: proposal.members.map((m) => ({ pid: m.pid, role: m.role })),
        undersized: listing ? proposal.members.length < listing.groupSize : false,
        relax: proposal.relax,
      });
      continue;
    }
    if (now >= proposal.readyAt + LFG_SLOT_WAIT_SEC) {
      intents.push(...closeProposal(state, proposal, 'noSlot', now));
    }
  }
  return intents;
}

function formNewProposals(
  state: LfgQueueState,
  input: LfgTickInput,
  budget: Record<string, number>,
): LfgIntent[] {
  const intents: LfgIntent[] = [];
  for (const listing of DUNGEON_FINDER_LISTINGS) {
    // Every open proposal already reserves a slot, so subtract them before
    // promising another group a dungeon that cannot open.
    let allowance =
      (budget[listing.dungeonId] ?? 0) - openProposalsFor(state, listing.dungeonId).length;
    let guard = allowance + 1;
    while (allowance > 0 && guard-- > 0) {
      const pool = unitsFor(state, listing.dungeonId);
      if (pool.length === 0) break;
      // Try every unit as the anchor, oldest first, instead of giving up on the
      // whole dungeon when the oldest one cannot form. Otherwise a single
      // unmatchable unit at the head blocks everyone behind it, which in a
      // realm this size means the queue is dead until that unit relaxes.
      // Strictness is that ANCHOR's own wait, so the longest waiter always gets
      // the loosest rules and nobody starves.
      let opened = false;
      for (let i = 0; i < pool.length; i++) {
        const relax = relaxFor(input.now - pool[i].joinedAt);
        const group = buildCandidateGroup(pool, listing, relax, i);
        if (!group) continue;
        intents.push(openProposal(state, listing.dungeonId, group, relax, input.now).intent);
        allowance--;
        opened = true;
        break;
      }
      if (!opened) break;
    }
  }
  return intents;
}

// The one function the host calls per tick. Order matters: prune the dead,
// expire stale ready checks, promote the accepted ones against the real slot
// count, and only then form anything new out of what is left.
export function tickDungeonFinder(state: LfgQueueState, input: LfgTickInput): LfgTickResult {
  const intents: LfgIntent[] = [];
  clearExpiredCooldowns(state, input.now);
  intents.push(...pruneUnavailable(state, input));
  intents.push(...expireProposals(state, input.now));
  const budget: Record<string, number> = { ...input.freeInstanceSlots };
  intents.push(...promoteReady(state, input.now, budget));
  intents.push(...formNewProposals(state, input, budget));
  return { intents };
}
