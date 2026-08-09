import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../src/sim/types';
import {
  DUNGEON_FINDER_LISTINGS,
  LFG_DECLINE_COOLDOWN_SEC,
  LFG_READY_WINDOW_SEC,
  LFG_RELAX_AFTER_SECONDS,
  LFG_SLOT_WAIT_SEC,
  LFG_TIMEOUT_COOLDOWN_SEC,
  closeProposal,
  createLfgQueueState,
  joinDungeonFinder,
  leaveDungeonFinder,
  lfgStatusFor,
  listingFor,
  relaxFor,
  respondToLfgProposal,
  tickDungeonFinder,
  unitForPid,
  type LfgIntent,
  type LfgQueueState,
  type LfgRole,
} from '../src/sim/lfg';

const CRYPT = 'hollow_crypt';

const m = (pid: number, cls: PlayerClass, roles?: LfgRole[], level = 20) => ({
  pid,
  cls,
  level,
  roles,
});

const input = (
  now: number,
  slots: Record<string, number>,
  unavailable: readonly number[] = [],
) => ({
  now,
  freeInstanceSlots: slots,
  isAvailable: (pid: number) => !unavailable.includes(pid),
});

const kinds = (intents: readonly LfgIntent[]) => intents.map((i) => i.kind);
const of = <K extends LfgIntent['kind']>(intents: readonly LfgIntent[], kind: K) =>
  intents.filter((i) => i.kind === kind) as Extract<LfgIntent, { kind: K }>[];

// A composition that satisfies the strictest tier immediately.
const idealParty = (base: number) => [
  m(base + 1, 'warrior'),
  m(base + 2, 'priest'),
  m(base + 3, 'mage'),
  m(base + 4, 'rogue'),
  m(base + 5, 'hunter'),
];

const queueSolos = (state: LfgQueueState, members: ReturnType<typeof m>[], now: number) => {
  for (const member of members) {
    joinDungeonFinder(state, { dungeonId: CRYPT, members: [member], premade: false, now });
  }
};

const acceptAll = (state: LfgQueueState, now: number) => {
  const proposal = state.proposals[0];
  for (const member of [...proposal.members]) {
    respondToLfgProposal(state, { pid: member.pid, accept: true, now });
  }
  return proposal;
};

describe('dungeon finder queue: join and leave', () => {
  it('queues a solo player and reports the wait', () => {
    const state = createLfgQueueState();
    const res = joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior')],
      premade: false,
      now: 100,
    });
    expect(res.ok).toBe(true);
    expect(res.unitId).toBe(1);
    const view = lfgStatusFor(state, 1, 130);
    expect(view.state).toBe('queued');
    expect(view.dungeonId).toBe(CRYPT);
    expect(view.waitSeconds).toBe(30);
    expect(view.roles).toEqual(['tank', 'dps']);
    expect(view.queuedByRole).toEqual({ tank: 1, healer: 0, dps: 1 });
  });

  it('refuses a second join, an unknown dungeon, an oversized group and a low level', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior')],
      premade: false,
      now: 0,
    });
    expect(
      joinDungeonFinder(state, {
        dungeonId: CRYPT,
        members: [m(1, 'warrior')],
        premade: false,
        now: 0,
      }).deny,
    ).toBe('alreadyQueued');
    expect(
      joinDungeonFinder(state, {
        dungeonId: 'claudexxaramas',
        members: [m(2, 'mage')],
        premade: false,
        now: 0,
      }).deny,
    ).toBe('unknownDungeon');
    expect(
      joinDungeonFinder(state, {
        dungeonId: CRYPT,
        members: [...idealParty(10), m(16, 'mage')],
        premade: true,
        now: 0,
      }).deny,
    ).toBe('groupTooLarge');
    const low = joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(3, 'mage', undefined, 2)],
      premade: false,
      now: 0,
    });
    expect(low.deny).toBe('levelTooLow');
    expect(low.denyPid).toBe(3);
    expect(low.requiredLevel).toBe(listingFor(CRYPT)!.minQueueLevel);
    expect(joinDungeonFinder(state, { dungeonId: CRYPT, members: [], premade: false, now: 0 }).deny).toBe(
      'emptyGroup',
    );
    // A denied join leaves the queue untouched.
    expect(state.units).toHaveLength(1);
  });

  it('leaves the queue for free and reports notQueued afterwards', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior')],
      premade: false,
      now: 0,
    });
    const left = leaveDungeonFinder(state, 1, 10);
    expect(left.ok).toBe(true);
    expect(left.fromProposal).toBe(false);
    expect(left.intents).toEqual([]);
    expect(state.cooldowns.size).toBe(0);
    expect(lfgStatusFor(state, 1, 10).state).toBe('idle');
    expect(leaveDungeonFinder(state, 1, 10).deny).toBe('notQueued');
  });
});

describe('dungeon finder queue: a pop needs a valid group', () => {
  it('does not pop an incomplete pool', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0).slice(0, 4), 0);
    const res = tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    expect(res.intents).toEqual([]);
    expect(state.proposals).toHaveLength(0);
    expect(state.units).toHaveLength(4);
  });

  it('pops immediately when the ideal composition is present', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    const res = tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    expect(kinds(res.intents)).toEqual(['dungeonFinderProposalOpened']);
    const opened = of(res.intents, 'dungeonFinderProposalOpened')[0];
    expect(opened.members).toHaveLength(5);
    expect(opened.members.filter((x) => x.role === 'tank').map((x) => x.pid)).toEqual([1]);
    expect(opened.members.filter((x) => x.role === 'healer').map((x) => x.pid)).toEqual([2]);
    expect(opened.expiresAt).toBe(1 + LFG_READY_WINDOW_SEC);
    // The units left the queue; they are held by the proposal now.
    expect(state.units).toHaveLength(0);
  });

  // The population tune: five damage dealers never form an ideal group, so the
  // queue relaxes rather than never popping.
  it('holds a role-less five until the strictness decays', () => {
    const state = createLfgQueueState();
    const dpsOnly = [
      m(1, 'mage'),
      m(2, 'rogue'),
      m(3, 'hunter'),
      m(4, 'warlock'),
      m(5, 'mage'),
    ];
    queueSolos(state, dpsOnly, 0);
    expect(tickDungeonFinder(state, input(1, { [CRYPT]: 6 })).intents).toEqual([]);
    expect(
      tickDungeonFinder(state, input(LFG_RELAX_AFTER_SECONDS.anchored, { [CRYPT]: 6 })).intents,
    ).toEqual([]);
    const res = tickDungeonFinder(state, input(LFG_RELAX_AFTER_SECONDS.any, { [CRYPT]: 6 }));
    expect(kinds(res.intents)).toEqual(['dungeonFinderProposalOpened']);
    expect(of(res.intents, 'dungeonFinderProposalOpened')[0].members).toHaveLength(5);
  });

  it('pops an undersized group only at the short tier, and flags it', () => {
    const state = createLfgQueueState();
    queueSolos(state, [m(1, 'warrior'), m(2, 'priest'), m(3, 'mage')], 0);
    expect(
      tickDungeonFinder(state, input(LFG_RELAX_AFTER_SECONDS.any, { [CRYPT]: 6 })).intents,
    ).toEqual([]);
    const res = tickDungeonFinder(state, input(LFG_RELAX_AFTER_SECONDS.short, { [CRYPT]: 6 }));
    expect(kinds(res.intents)).toEqual(['dungeonFinderProposalOpened']);
    const now = LFG_RELAX_AFTER_SECONDS.short;
    acceptAll(state, now);
    const formed = of(tickDungeonFinder(state, input(now, { [CRYPT]: 6 })).intents, 'dungeonFinderFormGroup')[0];
    expect(formed.members).toHaveLength(3);
    expect(formed.undersized).toBe(true);
    expect(formed.relax).toBe('short');
  });

  it('never shorts the heroic listing', () => {
    const state = createLfgQueueState();
    const dungeonId = 'claudeholme';
    for (const member of [m(1, 'warrior'), m(2, 'priest'), m(3, 'mage'), m(4, 'mage')]) {
      joinDungeonFinder(state, { dungeonId, members: [member], premade: false, now: 0 });
    }
    const res = tickDungeonFinder(state, input(9999, { [dungeonId]: 6 }));
    expect(res.intents).toEqual([]);
    expect(relaxFor(9999)).toBe('short');
    expect(listingFor(dungeonId)!.minGroupSize).toBe(5);
  });

  it('hands the group to the host as an intent, never as a teleport', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    acceptAll(state, 2);
    const res = tickDungeonFinder(state, input(3, { [CRYPT]: 6 }));
    const formed = of(res.intents, 'dungeonFinderFormGroup');
    expect(formed).toHaveLength(1);
    expect(formed[0].dungeonId).toBe(CRYPT);
    expect(formed[0].leaderPid).toBe(1); // the longest-waiting member
    expect(formed[0].undersized).toBe(false);
    // OBSTACLE 2: no coordinates, no origin, no position of any kind.
    expect(JSON.stringify(formed[0])).not.toMatch(/"(x|z|pos|origin|slot)"/);
    expect(state.proposals).toHaveLength(0);
  });
});

describe('dungeon finder queue: the instance slot cap', () => {
  it('opens no more proposals than there are free slots', () => {
    const state = createLfgQueueState();
    for (let g = 0; g < 3; g++) {
      joinDungeonFinder(state, {
        dungeonId: CRYPT,
        members: idealParty(g * 10),
        premade: true,
        now: g,
      });
    }
    const res = tickDungeonFinder(state, input(10, { [CRYPT]: 2 }));
    expect(kinds(res.intents)).toEqual([
      'dungeonFinderProposalOpened',
      'dungeonFinderProposalOpened',
    ]);
    expect(state.proposals).toHaveLength(2);
    expect(state.units).toHaveLength(1); // the third party is still waiting
  });

  it('pops nothing at all when every slot is busy', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    expect(tickDungeonFinder(state, input(1, { [CRYPT]: 0 })).intents).toEqual([]);
    expect(state.units).toHaveLength(1);
  });

  it('counts an open proposal as a held reservation', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    tickDungeonFinder(state, input(1, { [CRYPT]: 1 }));
    expect(state.proposals).toHaveLength(1);
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(10), premade: true, now: 2 });
    // The one free slot is spoken for, so the second party may not be promised it.
    expect(tickDungeonFinder(state, input(3, { [CRYPT]: 1 })).intents).toEqual([]);
    expect(state.proposals).toHaveLength(1);
  });

  it('holds a fully accepted group when the slot vanished, then requeues it free of charge', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    tickDungeonFinder(state, input(1, { [CRYPT]: 1 }));
    acceptAll(state, 2);
    // A walk-in party took the last slot between the pop and the accept.
    expect(tickDungeonFinder(state, input(3, { [CRYPT]: 0 })).intents).toEqual([]);
    expect(state.proposals[0].state).toBe('ready');
    // It frees up in time.
    const ok = tickDungeonFinder(state, input(4, { [CRYPT]: 1 }));
    expect(kinds(ok.intents)).toEqual(['dungeonFinderFormGroup']);
  });

  it('gives up on a starved reservation without penalising anyone', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    tickDungeonFinder(state, input(1, { [CRYPT]: 1 }));
    acceptAll(state, 2);
    const res = tickDungeonFinder(state, input(2 + LFG_SLOT_WAIT_SEC, { [CRYPT]: 0 }));
    const closed = of(res.intents, 'dungeonFinderProposalClosed')[0];
    expect(closed.reason).toBe('noSlot');
    expect(closed.requeuedPids).toHaveLength(5);
    expect(state.cooldowns.size).toBe(0);
    // Original queue position preserved.
    expect(state.units[0].joinedAt).toBe(0);
  });
});

describe('dungeon finder queue: leaving mid-queue', () => {
  it('shrinks a premade without losing its place in line', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior'), m(2, 'priest'), m(3, 'mage')],
      premade: true,
      now: 5,
    });
    leaveDungeonFinder(state, 2, 20);
    const unit = unitForPid(state, 1)!;
    expect(unit.members.map((x) => x.pid)).toEqual([1, 3]);
    expect(unit.joinedAt).toBe(5);
    expect(state.cooldowns.size).toBe(0);
  });

  it('drops a player the host reports as unavailable, with no penalty', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    const res = tickDungeonFinder(state, input(1, { [CRYPT]: 6 }, [3]));
    expect(res.intents).toEqual([]); // 4 left: no valid group
    expect(state.units.map((u) => u.members[0].pid)).toEqual([1, 2, 4, 5]);
    expect(state.cooldowns.size).toBe(0);
  });

  it('breaks an open proposal when a member goes away, and requeues the rest', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    const res = tickDungeonFinder(state, input(2, { [CRYPT]: 6 }, [4]));
    const closed = of(res.intents, 'dungeonFinderProposalClosed')[0];
    expect(closed.reason).toBe('memberUnavailable');
    expect(closed.requeuedPids.sort()).toEqual([1, 2, 3, 5]);
    expect(state.cooldowns.size).toBe(0);
    expect(state.units.every((u) => u.joinedAt === 0)).toBe(true);
  });

  it('charges a player who walks out of a ready check, and nobody else', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    const left = leaveDungeonFinder(state, 3, 5);
    expect(left.fromProposal).toBe(true);
    const penalty = of(left.intents, 'dungeonFinderPenalty')[0];
    expect(penalty.pid).toBe(3);
    expect(penalty.readyAt).toBe(5 + LFG_DECLINE_COOLDOWN_SEC);
    expect(of(left.intents, 'dungeonFinderProposalClosed')[0].reason).toBe('memberLeft');
    expect([...state.cooldowns.keys()]).toEqual([3]);
    expect(state.units.map((u) => u.members[0].pid)).toEqual([1, 2, 4, 5]);
    expect(lfgStatusFor(state, 3, 5).state).toBe('cooldown');
    // And the cooldown blocks a re-queue until it lifts.
    expect(
      joinDungeonFinder(state, { dungeonId: CRYPT, members: [m(3, 'mage')], premade: false, now: 5 })
        .deny,
    ).toBe('onCooldown');
    expect(
      joinDungeonFinder(state, {
        dungeonId: CRYPT,
        members: [m(3, 'mage')],
        premade: false,
        now: 5 + LFG_DECLINE_COOLDOWN_SEC,
      }).ok,
    ).toBe(true);
  });
});

describe('dungeon finder queue: invariants that guard the queue itself', () => {
  // Every player must be in exactly one of: a queue unit, a proposal, or
  // nothing. This one assertion catches the whole family of duplication bugs.
  const partition = (state: LfgQueueState) => {
    const queued = state.units.flatMap((u) => u.members.map((x) => x.pid));
    const proposed = state.proposals.flatMap((p) => p.members.map((x) => x.pid));
    const all = [...queued, ...proposed];
    expect(new Set(all).size, 'a player is in two places at once').toBe(all.length);
    expect(new Set(state.units.map((u) => u.id)).size).toBe(state.units.length);
    return { queued, proposed };
  };

  it('keeps players in exactly one place across a full lifecycle', () => {
    const state = createLfgQueueState();
    for (let g = 0; g < 3; g++) {
      joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(g * 10), premade: true, now: g });
    }
    partition(state);
    tickDungeonFinder(state, input(5, { [CRYPT]: 2 }));
    partition(state);
    respondToLfgProposal(state, { pid: 3, accept: false, now: 6 });
    partition(state);
    acceptAll(state, 7);
    tickDungeonFinder(state, input(8, { [CRYPT]: 2 }));
    const { queued, proposed } = partition(state);
    expect(queued.length + proposed.length).toBeLessThanOrEqual(15);
  });

  it('closing a proposal twice does not duplicate its units', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    const proposal = state.proposals[0];
    expect(closeProposal(state, proposal, 'noSlot', 2)).not.toEqual([]);
    expect(closeProposal(state, proposal, 'noSlot', 3)).toEqual([]);
    expect(state.units).toHaveLength(1);
    partition(state);
  });

  it('refuses the same player twice in one join request', () => {
    const state = createLfgQueueState();
    const res = joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior'), m(2, 'priest'), m(1, 'warrior'), m(4, 'mage'), m(5, 'mage')],
      premade: true,
      now: 0,
    });
    expect(res.deny).toBe('duplicateMember');
    expect(res.denyPid).toBe(1);
    expect(state.units).toHaveLength(0);
  });

  it('refuses a join while sitting in a ready check', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    expect(
      joinDungeonFinder(state, {
        dungeonId: 'drowned_temple',
        members: [m(1, 'warrior')],
        premade: false,
        now: 2,
      }).deny,
    ).toBe('inProposal');
  });
});

describe('dungeon finder queue: matching quality', () => {
  // A greedy fill takes the duo and is then stuck one short forever. The exact
  // search finds duo + trio.
  it('finds a full group out of mixed premade sizes', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'warrior'), m(2, 'priest')],
      premade: true,
      now: 0,
    });
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(3, 'mage'), m(4, 'mage')],
      premade: true,
      now: 1,
    });
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(5, 'mage'), m(6, 'rogue'), m(7, 'hunter')],
      premade: true,
      now: 2,
    });
    const res = tickDungeonFinder(state, input(3, { [CRYPT]: 6 }));
    const opened = of(res.intents, 'dungeonFinderProposalOpened')[0];
    expect(opened.members.map((x) => x.pid).sort((a, b) => a - b)).toEqual([1, 2, 5, 6, 7]);
    expect(state.units).toHaveLength(1); // the duo that did not fit is still queued
  });

  // One unmatchable unit at the head of the queue must not freeze everyone
  // behind it: in a realm this size that is a dead queue.
  it('does not let the head of the queue block the units behind it', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, {
      dungeonId: CRYPT,
      members: [m(1, 'mage'), m(2, 'mage'), m(3, 'mage'), m(4, 'mage'), m(5, 'mage')],
      premade: true,
      now: 0,
    });
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(10), premade: true, now: 1 });
    const res = tickDungeonFinder(state, input(2, { [CRYPT]: 6 }));
    const opened = of(res.intents, 'dungeonFinderProposalOpened')[0];
    expect(opened.members.map((x) => x.pid)).toEqual([11, 12, 13, 14, 15]);
    // The all-damage premade keeps its place and its earlier joinedAt.
    expect(state.units[0].joinedAt).toBe(0);
  });

  it('matches two different dungeons in the same tick', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    joinDungeonFinder(state, {
      dungeonId: 'drowned_temple',
      members: idealParty(10),
      premade: true,
      now: 0,
    });
    const res = tickDungeonFinder(state, input(1, { [CRYPT]: 6, drowned_temple: 6 }));
    expect(of(res.intents, 'dungeonFinderProposalOpened').map((i) => i.dungeonId).sort()).toEqual([
      'drowned_temple',
      'hollow_crypt',
    ]);
  });

  it('pops nothing for a dungeon the host did not report slots for', () => {
    const state = createLfgQueueState();
    joinDungeonFinder(state, { dungeonId: CRYPT, members: idealParty(0), premade: true, now: 0 });
    expect(tickDungeonFinder(state, input(1, {})).intents).toEqual([]);
  });

  it('offers each dungeon exactly once, so a slot cannot be double spent', () => {
    const ids = DUNGEON_FINDER_LISTINGS.map((l) => l.dungeonId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('dungeon finder queue: the ready check', () => {
  it('declining closes the proposal and costs only the decliner', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    respondToLfgProposal(state, { pid: 1, accept: true, now: 2 });
    const res = respondToLfgProposal(state, { pid: 2, accept: false, now: 3 });
    expect(res.ok).toBe(true);
    expect(of(res.intents, 'dungeonFinderPenalty')[0].readyAt).toBe(3 + LFG_DECLINE_COOLDOWN_SEC);
    expect(of(res.intents, 'dungeonFinderProposalClosed')[0].reason).toBe('declined');
    expect([...state.cooldowns.keys()]).toEqual([2]);
    expect(state.units).toHaveLength(4);
  });

  it('times out the silent members and requeues the ones who answered', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    respondToLfgProposal(state, { pid: 1, accept: true, now: 2 });
    const res = tickDungeonFinder(state, input(1 + LFG_READY_WINDOW_SEC, { [CRYPT]: 6 }));
    const penalties = of(res.intents, 'dungeonFinderPenalty');
    expect(penalties.map((p) => p.pid).sort()).toEqual([2, 3, 4, 5]);
    expect(penalties.every((p) => p.reason === 'timedOut')).toBe(true);
    expect(penalties[0].readyAt).toBe(1 + LFG_READY_WINDOW_SEC + LFG_TIMEOUT_COOLDOWN_SEC);
    expect(of(res.intents, 'dungeonFinderProposalClosed')[0].requeuedPids).toEqual([1]);
  });

  it('never times out a group that already accepted', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    // Accept late enough that the slot-wait deadline outlives the ready window,
    // so this test isolates the timeout arm from the noSlot arm.
    acceptAll(state, 20);
    const res = tickDungeonFinder(state, input(1 + LFG_READY_WINDOW_SEC, { [CRYPT]: 0 }));
    expect(of(res.intents, 'dungeonFinderPenalty')).toEqual([]);
    expect(state.proposals[0].state).toBe('ready');
  });

  it('rejects a stale or duplicated answer', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    expect(respondToLfgProposal(state, { pid: 99, accept: true, now: 2 }).deny).toBe('noProposal');
    expect(
      respondToLfgProposal(state, { pid: 1, accept: true, now: 2, proposalId: 404 }).deny,
    ).toBe('wrongProposal');
    respondToLfgProposal(state, { pid: 1, accept: true, now: 2 });
    expect(respondToLfgProposal(state, { pid: 1, accept: true, now: 3 }).deny).toBe(
      'alreadyResponded',
    );
  });

  it('shows the ready check in the status view', () => {
    const state = createLfgQueueState();
    queueSolos(state, idealParty(0), 0);
    tickDungeonFinder(state, input(1, { [CRYPT]: 6 }));
    const view = lfgStatusFor(state, 2, 2);
    expect(view.state).toBe('proposed');
    expect(view.roles).toEqual(['healer']);
    expect(view.proposalExpiresAt).toBe(1 + LFG_READY_WINDOW_SEC);
  });
});
