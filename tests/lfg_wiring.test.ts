// The Dungeon Finder as WIRED into the world: the per-tick call, the commands,
// the intents the host performs, and the IWorld surface.
//
// tests/lfg_queue.test.ts, lfg_roles.test.ts, lfg_catalog.test.ts and
// lfg_determinism.test.ts cover the pure matchmaker in src/sim/lfg. This file
// covers only what `sim.ts` does with it.
import { describe, expect, it } from 'vitest';

import { DUNGEON_FINDER_LISTINGS, LFG_READY_WINDOW_SEC } from '../src/sim/lfg';
import { Sim } from '../src/sim/sim';
import { DUNGEON_X_THRESHOLD, INSTANCE_SLOT_COUNT } from '../src/sim/data';
import type { SimEvent } from '../src/sim/types';

const DUNGEON = 'hollow_crypt';
// One tank, one healer, three damage: the `ideal` composition, so a group forms
// on the first tick instead of waiting out the relax ladder.
const PARTY_CLASSES = ['warrior', 'priest', 'mage', 'rogue', 'hunter'] as const;

const makeSim = () => new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });

function addQueuers(sim: Sim, count = 5, level = 12): number[] {
  const pids: number[] = [];
  for (let i = 0; i < count; i++) {
    const pid = sim.addPlayer(PARTY_CLASSES[i % PARTY_CLASSES.length], `P${i}`);
    sim.setPlayerLevel(level, pid);
    pids.push(pid);
  }
  return pids;
}

/** Drain one tick and return only the events the Dungeon Finder produced. */
function lfgEvents(sim: Sim): SimEvent[] {
  return sim.tick().filter((e) => e.type.startsWith('lfg'));
}

function drain(sim: Sim): SimEvent[] {
  return sim.tick();
}

describe('dungeon finder wiring: joining and the readout', () => {
  it('queues a solo player and answers with a status', () => {
    const sim = makeSim();
    const [pid] = addQueuers(sim, 1);
    sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    const status = sim.dungeonFinderStatusWire(pid)!;
    expect(status.state).toBe('queued');
    expect(status.dungeonId).toBe(DUNGEON);
    // Every class can fill damage, so an omitted role request is never empty.
    expect(status.roles).toContain('dps');
    expect(status.queuedPlayers).toBe(1);
    const ev = drain(sim).find((e) => e.type === 'lfgStatus');
    expect(ev).toBeTruthy();
  });

  it('narrows a role request to what the class can actually fill', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('mage', 'Mage');
    sim.setPlayerLevel(12, pid);
    sim.dungeonFinderJoin(DUNGEON, ['tank', 'dps'], pid);
    expect(sim.dungeonFinderStatusWire(pid)!.roles).toEqual(['dps']);
  });

  it('denies an unknown dungeon and a level that is too low, without prose', () => {
    const sim = makeSim();
    const [pid] = addQueuers(sim, 1, 1);
    sim.dungeonFinderJoin('not_a_dungeon', undefined, pid);
    sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    const denies = drain(sim).filter((e) => e.type === 'lfgDeny');
    expect(denies.map((e) => (e as { reason: string }).reason)).toEqual([
      'unknownDungeon',
      'levelTooLow',
    ]);
  });

  it('queues a party as one premade, and refuses a non-leader', () => {
    const sim = makeSim();
    const pids = addQueuers(sim, 3);
    for (const pid of pids.slice(1)) {
      sim.partyInvite(pid, pids[0]);
      sim.partyAccept(pid);
    }
    sim.dungeonFinderJoin(DUNGEON, undefined, pids[1]);
    expect(
      drain(sim)
        .filter((e) => e.type === 'lfgDeny')
        .map((e) => (e as { reason: string }).reason),
    ).toEqual(['notLeader']);

    sim.dungeonFinderJoin(DUNGEON, undefined, pids[0]);
    for (const pid of pids) {
      expect(sim.dungeonFinderStatusWire(pid)!.state, String(pid)).toBe('queued');
    }
    expect(sim.dungeonFinderStatusWire(pids[0])!.queuedPlayers).toBe(3);
  });

  it('leaves the queue silently and for free', () => {
    const sim = makeSim();
    const [pid] = addQueuers(sim, 1);
    sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    sim.dungeonFinderLeave(pid);
    const status = sim.dungeonFinderStatusWire(pid)!;
    expect(status.state).toBe('idle');
    expect(status.cooldownUntil).toBe(0);
  });

  it('offers exactly the catalog, through IWorld', () => {
    const sim = makeSim();
    expect(sim.dungeonFinderOffers().map((o) => o.dungeonId)).toEqual(
      DUNGEON_FINDER_LISTINGS.map((l) => l.dungeonId),
    );
    expect(sim.dungeonFinderOffers()[0]).not.toBe(sim.dungeonFinderOffers()[0]);
  });
});

describe('dungeon finder wiring: the ready check', () => {
  it('opens a proposal on the tick after a full group is queued', () => {
    const sim = makeSim();
    const pids = addQueuers(sim);
    for (const pid of pids) sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    const proposals = lfgEvents(sim).filter((e) => e.type === 'lfgProposal');
    expect(proposals).toHaveLength(pids.length);
    for (const pid of pids) {
      const view = sim.dungeonFinderProposalWire(pid)!;
      expect(view.dungeonId).toBe(DUNGEON);
      expect(view.responded).toBe(false);
      expect(view.size).toBe(5);
      expect(sim.dungeonFinderStatusWire(pid)!.state).toBe('proposed');
    }
  });

  it('stamps the ready deadline on the HOST clock, once, and holds it still', () => {
    let now = 1_700_000_000_000;
    const sim = new Sim({
      seed: 42,
      playerClass: 'warrior',
      noPlayer: true,
      lockoutNowMs: () => now,
    });
    const pids = addQueuers(sim);
    for (const pid of pids) sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    const opened = lfgEvents(sim).find((e) => e.type === 'lfgProposal') as {
      expiresAt: number;
    };
    expect(opened.expiresAt).toBe(now + LFG_READY_WINDOW_SEC * 1000);
    // Re-projecting the deadline every tick would make it jitter with Date.now
    // and re-send the whole readout on every snapshot.
    const first = sim.dungeonFinderProposalWire(pids[0])!.expiresAt;
    now += 50;
    sim.tick();
    expect(sim.dungeonFinderProposalWire(pids[0])!.expiresAt).toBe(first);
  });

  it('forms the party, moves everyone inside, and says so AFTER the teleport', () => {
    const sim = makeSim();
    const pids = addQueuers(sim);
    for (const pid of pids) sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    sim.tick();
    for (const pid of pids) sim.dungeonFinderRespond(true, undefined, pid);
    const events = lfgEvents(sim);
    expect(events.filter((e) => e.type === 'lfgFormed')).toHaveLength(pids.length);

    const party = sim.partyOf(pids[0]);
    expect(party).toBeTruthy();
    expect(party!.members.sort()).toEqual([...pids].sort());
    expect(party!.raid).toBe(false);
    // One instance for the whole party, and everyone standing in it.
    const claimed = sim.instances.filter(
      (i) => i.dungeonId === DUNGEON && i.partyKey === `party:${party!.id}`,
    );
    expect(claimed).toHaveLength(1);
    for (const pid of pids) {
      expect(sim.entities.get(pid)!.pos.x, String(pid)).toBeGreaterThan(DUNGEON_X_THRESHOLD);
    }
    // Nobody is left holding a queue entry.
    for (const pid of pids) expect(sim.dungeonFinderStatusWire(pid)!.state).toBe('idle');
  });

  it('breaks the group on a decline, penalizes only the decliner, requeues the rest', () => {
    const sim = makeSim();
    const pids = addQueuers(sim);
    for (const pid of pids) sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    sim.tick();
    for (const pid of pids.slice(1)) sim.dungeonFinderRespond(true, undefined, pid);
    sim.dungeonFinderRespond(false, undefined, pids[0]);
    const denies = drain(sim).filter((e) => e.type === 'lfgDeny');
    expect(denies.map((e) => (e as { reason: string }).reason)).toContain('declined');

    expect(sim.dungeonFinderStatusWire(pids[0])!.state).toBe('cooldown');
    expect(sim.dungeonFinderStatusWire(pids[0])!.cooldownUntil).toBeGreaterThan(0);
    for (const pid of pids.slice(1)) {
      expect(sim.dungeonFinderStatusWire(pid)!.state, String(pid)).toBe('queued');
    }
  });

  it('refuses a stale answer by proposal id', () => {
    const sim = makeSim();
    const pids = addQueuers(sim);
    for (const pid of pids) sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    sim.tick();
    sim.dungeonFinderRespond(true, '999', pids[0]);
    expect(
      drain(sim)
        .filter((e) => e.type === 'lfgDeny')
        .map((e) => (e as { reason: string }).reason),
    ).toContain('wrongProposal');
  });
});

describe('dungeon finder wiring: the host contract', () => {
  it('hands the matchmaker an entry for EVERY offered dungeon', () => {
    const sim = makeSim();
    const slots = (sim as unknown as { lfgFreeInstanceSlots(): Record<string, number> })
      .lfgFreeInstanceSlots as () => Record<string, number>;
    const counted = slots.call(sim);
    for (const listing of DUNGEON_FINDER_LISTINGS) {
      // A missing key reads as zero and that dungeon would silently never pop.
      expect(counted[listing.dungeonId], listing.dungeonId).toBe(INSTANCE_SLOT_COUNT);
    }
  });

  it('drops a player who dies or walks into an instance, with no penalty', () => {
    const sim = makeSim();
    const [pid] = addQueuers(sim, 1);
    sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    sim.enterDungeon(DUNGEON, pid);
    sim.tick();
    const status = sim.dungeonFinderStatusWire(pid)!;
    expect(status.state).toBe('idle');
    expect(status.cooldownUntil).toBe(0);
  });

  it('draws ZERO rng: a full queue cycle leaves the shared stream untouched', () => {
    // Not "a fixed number of draws": the module takes no Rng at all, so wiring
    // it must not advance the world stream either. A single draw here would
    // reorder every downstream roll for everyone.
    const control = makeSim();
    const queued = makeSim();
    for (const sim of [control, queued]) addQueuers(sim);
    const pids = [...queued.players.keys()];
    for (const pid of pids) queued.dungeonFinderJoin(DUNGEON, undefined, pid);
    (queued as unknown as { updateDungeonFinder(): void }).updateDungeonFinder();
    // Decline rather than accept: a pop goes on to claim an instance, and
    // claiming one rolls mob levels, which is `enterDungeon`'s existing draw.
    queued.dungeonFinderRespond(false, undefined, pids[0]);
    (queued as unknown as { updateDungeonFinder(): void }).updateDungeonFinder();
    queued.dungeonFinderLeave(pids[1]);

    const rngOf = (sim: Sim) => (sim as unknown as { rng: { next(): number } }).rng.next();
    expect(rngOf(queued)).toBe(rngOf(control));
  });
});

describe('dungeon finder wiring: the event contract', () => {
  // TRAP 1 (docs/design/parity-backlog.md): sim-to-UI event names are compared
  // as STRINGS, which tsc cannot check. Wave 2 shipped with four of seven
  // crafting events dead for exactly that reason. This pins the sim side.
  const PINNED = ['lfgStatus', 'lfgProposal', 'lfgFormed', 'lfgDeny'];

  it('emits exactly the four pinned names and no others', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/sim/sim.ts', 'utf8');
    const emitted = new Set<string>();
    for (const m of src.matchAll(/type: '(lfg[A-Za-z]*)'/g)) emitted.add(m[1]);
    expect([...emitted].sort()).toEqual([...PINNED].sort());
  });

  it('never produces the token `lfg` as an id, only as an event name', () => {
    // `lfg` is already a joinable chat channel; the runtime identifier is
    // `dungeonFinder` everywhere else.
    const sim = makeSim();
    for (const offer of sim.dungeonFinderOffers()) expect(offer.dungeonId).not.toBe('lfg');
    const [pid] = addQueuers(sim, 1);
    sim.dungeonFinderJoin(DUNGEON, undefined, pid);
    const status = sim.dungeonFinderStatusWire(pid)!;
    expect(status.state).not.toBe('lfg');
    expect(status.dungeonId).not.toBe('lfg');
  });
});
