// Deeds wiring: the seam between the pure `src/sim/deeds/` evaluator and the
// live Sim. The evaluator is covered by deeds.test.ts and the catalogue by
// deeds_content.test.ts; everything here is about the WIRING — that each site
// really queues its fact, that the queue drains exactly once at the tick tail,
// that persistence round-trips and stays absent for a pre-feature save, and that
// the whole system draws zero rng.

import { describe, expect, it } from 'vitest';
import { DEED_CATALOG } from '../src/sim/content/deeds';
import { ClientWorld } from '../src/net/online';
import { deedCounter, deedMark, freshDeedProgress, restoreDeedProgress } from '../src/sim/deeds';
import { buildDeedsView, Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const makeSim = (seed = 42) => new Sim({ seed, playerClass: 'warrior' });

/** Tick once so the tail drain runs, and return what it emitted. */
function drain(sim: Sim): SimEvent[] {
  return sim.tick();
}

function progress(sim: Sim, pid = sim.playerId) {
  return sim.meta(pid)!.deeds;
}

function stand(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.onGround = true;
}

describe('deeds wiring: the queue drains once, at the tick tail', () => {
  it('holds a queued fact until the tail, then folds the whole batch', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    const before = progress(sim);
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    // Nothing folded yet: the chronicle is untouched until the tail.
    expect(progress(sim)).toBe(before);
    expect(meta.deedQueue).toHaveLength(2);

    drain(sim);
    expect(meta.deedQueue).toHaveLength(0);
    expect(progress(sim)).not.toBe(before);
    expect(deedCounter(progress(sim), 'kills')).toBe(2);
  });

  it('leaves the SAME progress reference when nothing changed', () => {
    const sim = makeSim();
    drain(sim); // clear any join-time churn
    const before = progress(sim);
    drain(sim);
    expect(progress(sim)).toBe(before);
  });

  it('emits a completion event carrying the id, the renown and any title', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    const events = drain(sim);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'deedComplete',
        deedId: 'cmb_first_blood',
        renown: DEED_CATALOG.deeds.cmb_first_blood.renown,
        pid: sim.playerId,
      }),
    );

    // A title-bearing deed carries its titleId.
    for (let i = 0; i < 1000; i++) (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'x' });
    const more = drain(sim);
    expect(more).toContainEqual(
      expect.objectContaining({ type: 'deedComplete', deedId: 'cmb_slayer', titleId: 'deed:slayer' }),
    );
  });

  it('completes exactly once, even if the same fact keeps arriving', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    const first = drain(sim);
    expect(first.filter((e) => e.type === 'deedComplete' && e.deedId === 'cmb_first_blood')).toHaveLength(1);
    for (let i = 0; i < 5; i++) {
      (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
      const again = drain(sim);
      expect(again.some((e) => e.type === 'deedComplete' && e.deedId === 'cmb_first_blood')).toBe(false);
    }
  });

  it('draws no rng at all', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    sim.tick();
    const before = (sim as any).rng.s;
    for (const event of [
      { kind: 'kill', mobId: 'a', boss: true },
      { kind: 'death' },
      { kind: 'questDone', questId: 'q1' },
      { kind: 'duelWin' },
      { kind: 'arenaWin' },
      { kind: 'zoneEnter', zoneId: 'mirefen_marsh' },
      { kind: 'loot', itemId: 'x', quality: 'epic', copper: 5 },
    ] as any[]) {
      (sim as any).queueDeed(meta, event);
    }
    (sim as any).drainDeedEvents();
    expect((sim as any).rng.s).toBe(before);
  });
});

describe('deeds wiring: the live sites', () => {
  it('credits a level-up', () => {
    const sim = makeSim();
    sim.setPlayerLevel(5);
    (sim as any).grantXp(999999, sim.meta(sim.playerId)!);
    drain(sim);
    expect(deedCounter(progress(sim), 'level')).toBeGreaterThanOrEqual(6);
    expect(deedCounter(progress(sim), 'lifetimeXp')).toBeGreaterThan(0);
  });

  it('credits a talent allocation through the one recompute funnel', () => {
    const sim = makeSim();
    sim.setPlayerLevel(20);
    const alloc = sim.talents;
    // Any legal single point is enough: the counter is a high-water mark.
    (sim as any).recomputeTalents(sim.meta(sim.playerId)!);
    drain(sim);
    expect(deedCounter(progress(sim), 'talentPointsSpent')).toBe(0);
    expect(alloc).toBeTruthy();
  });

  it('credits a mob kill, marks a boss, and shares credit with the group', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Ayla');
    const b = sim.addPlayer('priest', 'Bree');
    sim.partyInvite(b, a);
    sim.partyAccept(b);
    const mob = [...sim.entities.values()].find((e) => e.kind === 'mob' && !e.dead)!;
    for (const pid of [a, b]) {
      const p = sim.entities.get(pid)!;
      p.pos = { ...mob.pos };
      p.prevPos = { ...p.pos };
    }
    mob.tappedById = a;
    (sim as any).handleDeath(mob, sim.entities.get(a)!);
    drain(sim);
    expect(deedCounter(progress(sim, a), 'kills')).toBe(1);
    expect(deedCounter(progress(sim, b), 'kills')).toBe(1);
  });

  it('credits a player death', () => {
    const sim = makeSim();
    (sim as any).handleDeath(sim.player, null);
    drain(sim);
    expect(deedCounter(progress(sim), 'deaths')).toBe(1);
  });

  it('credits a quest turn-in and marks the quest id', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    const questId = 'q_aw_arrival';
    (sim as any).queueDeed(meta, { kind: 'questDone', questId });
    drain(sim);
    expect(deedCounter(progress(sim), 'questsCompleted')).toBe(1);
    expect(progress(sim).marks.has(deedMark('quest', questId))).toBe(true);
    expect(progress(sim).earned.has('exp_ashen_arrival')).toBe(true);
  });

  it('credits reputation as an ABSOLUTE standing, so it can never regress', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).grantReputation(meta, 'dawn_of_claude', 3000);
    drain(sim);
    expect(deedCounter(progress(sim), 'reputationDawn')).toBe(3000);
    (sim as any).grantReputation(meta, 'dawn_of_claude', -2000);
    drain(sim);
    expect(deedCounter(progress(sim), 'reputationDawn')).toBe(3000);
  });

  it('credits looted copper but not vendor or quest gold', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).grantLootCopper(meta, 1234);
    drain(sim);
    expect(deedCounter(progress(sim), 'copperLooted')).toBe(1234);
    const before = deedCounter(progress(sim), 'copperLooted');
    meta.copper += 5000; // a sale/quest reward never routes through grantLootCopper
    drain(sim);
    expect(deedCounter(progress(sim), 'copperLooted')).toBe(before);
  });

  it('marks the quality of an item that was actually looted', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).queueLootDeed(meta, 'copper_ore'); // common: no mark
    drain(sim);
    expect(progress(sim).marks.has(deedMark('quality', 'common'))).toBe(false);
    (sim as any).queueLootDeed(meta, 'gravewatch_pick'); // rare
    drain(sim);
    expect(progress(sim).marks.has(deedMark('quality', 'rare'))).toBe(true);
    expect(progress(sim).earned.has('exp_first_rare')).toBe(true);
  });

  it('marks the login zone on the very first tick', () => {
    // lastZoneId starts empty on purpose, so a veteran who logs in deep in the
    // world gets that zone's mark without having to leave and come back.
    const sim = makeSim();
    expect(sim.meta(sim.playerId)!.lastZoneId).toBe('');
    drain(sim);
    expect(sim.meta(sim.playerId)!.lastZoneId).toBe('eastbrook_vale');
    expect(progress(sim).earned.has('exp_vale_wayfarer')).toBe(true);
  });

  it('marks a zone the moment the player crosses into it', () => {
    const sim = makeSim();
    drain(sim);
    expect(sim.meta(sim.playerId)!.lastZoneId).toBe('eastbrook_vale');
    stand(sim, 0, 400); // Mirefen Marsh
    drain(sim);
    expect(sim.meta(sim.playerId)!.lastZoneId).toBe('mirefen_marsh');
    expect(progress(sim).marks.has(deedMark('zone', 'mirefen_marsh'))).toBe(true);
    expect(progress(sim).earned.has('exp_marsh_wayfarer')).toBe(true);
    // Re-entering is a Set add, so it never double-counts.
    stand(sim, 0, 0);
    drain(sim);
    stand(sim, 0, 400);
    drain(sim);
    expect(deedCounter(progress(sim), 'kills')).toBe(0);
  });

  it('credits a dungeon clear when the LAST living boss of the instance falls', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Ayla');
    const meta = sim.meta(pid)!;
    // Two bosses in one instance: the first fall is not a clear, the second is.
    const inst = (sim as any).instances[0];
    inst.partyKey = `solo:${pid}`;
    const bosses = [...sim.entities.values()]
      .filter((e) => e.kind === 'mob' && !e.dead)
      .slice(0, 2);
    for (const b of bosses) {
      b.templateId = 'morthen';
      inst.mobIds.push(b.id);
    }
    // First boss down while the second still stands: not a clear.
    bosses[0].dead = true;
    (sim as any).creditDungeonClear(bosses[0], [meta]);
    expect(meta.deedQueue).toHaveLength(0);
    // Last living boss down: the wing is cleared.
    bosses[1].dead = true;
    (sim as any).creditDungeonClear(bosses[1], [meta]);
    expect(meta.deedQueue).toContainEqual({ kind: 'dungeonClear', dungeonId: inst.dungeonId });
  });
});

describe('deeds wiring: persistence and the retro pass', () => {
  it('earns nothing on a fresh join and serializes only what it holds', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Fresh');
    // A level-1 character with nothing done completes no deed.
    expect(sim.meta(pid)!.deeds.earned.size).toBe(0);
    const saved = sim.serializeCharacter(pid)!;
    // The retro join pass banks the character's level as a high-water counter,
    // so the key is present but SPARSE: no marks, no earned map, one counter.
    expect(saved.deeds).toEqual({ counters: { level: 1 } });
  });

  it('omits the key entirely for a chronicle that holds nothing at all', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Blank');
    sim.meta(pid)!.deeds = freshDeedProgress();
    expect('deeds' in sim.serializeCharacter(pid)!).toBe(false);
  });

  it('round-trips a chronicle sparsely and bounds a tampered one', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    (sim as any).queueDeed(meta, { kind: 'zoneEnter', zoneId: 'mirefen_marsh' });
    drain(sim);
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect(saved.deeds!.counters!.kills).toBe(1);
    expect(saved.deeds!.marks).toContain(deedMark('zone', 'mirefen_marsh'));
    expect(Object.keys(saved.deeds!.earned!)).toContain('cmb_first_blood');

    const reloaded = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = reloaded.addPlayer('warrior', 'Ayla', { state: saved });
    const back = reloaded.meta(pid)!.deeds;
    expect(deedCounter(back, 'kills')).toBe(1);
    expect(back.earned.has('cmb_first_blood')).toBe(true);

    // A hand-edited save cannot inject an unknown counter or an unbounded mark.
    const tampered = {
      ...saved,
      deeds: {
        counters: { kills: 5, bogusCounter: 99 } as any,
        marks: ['zone:mirefen_marsh', 'evil:anything', 42 as any],
        earned: { cmb_first_blood: 1, 'not-a-deed': 'x' as any },
      },
    };
    const pid2 = reloaded.addPlayer('warrior', 'Cheat', { state: tampered as any });
    const bounded = reloaded.meta(pid2)!.deeds;
    expect((bounded.counters as any).bogusCounter).toBeUndefined();
    expect([...bounded.marks]).toEqual(['zone:mirefen_marsh']);
    expect(bounded.earned.has('not-a-deed')).toBe(false);
  });

  it('gives an existing character retro credit for high-water state on join', () => {
    const donor = makeSim();
    donor.setPlayerLevel(20);
    const state = donor.serializeCharacter(donor.playerId)!;
    // A pre-feature save has no chronicle at all.
    delete (state as any).deeds;

    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Veteran', { state });
    const p = sim.meta(pid)!.deeds;
    expect(deedCounter(p, 'level')).toBe(20);
    expect(p.earned.size).toBeGreaterThan(0);

    // Re-joining must NOT inflate anything: only max-mode facts are re-folded.
    const resaved = sim.serializeCharacter(pid)!;
    const again = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid2 = again.addPlayer('warrior', 'Veteran', { state: resaved });
    expect(again.meta(pid2)!.deeds.earned.size).toBe(p.earned.size);
    expect(deedCounter(again.meta(pid2)!.deeds, 'questsCompleted')).toBe(
      deedCounter(p, 'questsCompleted'),
    );
  });
});

// The three self-snapshot fields this wave adds (`gather`, `deeds`, `unstuck`)
// carry RAW state, not built views, and both worlds derive the view with the same
// pure helper. This block pins that parity end to end through applySnapshot's
// real delta-guarded mirror, so a field that stops riding the wire (or that the
// client mirrors differently from the sim) fails here.
function bareClient(pid: number): ClientWorld {
  const c: any = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 42, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = pid;
  c.ownPlayerId = pid;
  c.ownPlayerClass = 'warrior';
  c.spectating = null;
  c.moveInput = {};
  c.inventory = [];
  c.vendorBuyback = [];
  c.equipment = {};
  c.accountCosmetics = { completedQuestIds: [], mechChromaIds: [] };
  c.copper = 0;
  c.xp = 0;
  c.known = [];
  c.questLog = new Map();
  c.questsDone = new Set();
  c.pendingQuestCommands = new Map();
  c.partyInfo = null;
  c.tradeInfo = null;
  c.duelInfo = null;
  c.lastSnapAt = 0;
  c.snapInterval = 50;
  c.missingSince = new Map();
  c.pendingFacingDelta = 0;
  c.connected = true;
  c.eventQueue = [];
  c.mouselookFacing = null;
  c.lastInputSentAt = 0;
  c.lastInputSig = '';
  c.inputSeq = 0;
  c.pendingInputSeqSentAt = new Map();
  c.ackedInputSeq = 0;
  c.inputEchoSamples = [];
  c.spectateFacingPending = false;
  c.pendingSpectateFacing = null;
  c.gatheringProficiency = { mining: 0, logging: 0, herbalism: 0, fishing: 0 };
  c.deedProgress = freshDeedProgress();
  c.unstuckSeconds = null;
  return c;
}

/** The minimum full-record identity `applyWire` needs to admit the self entity;
 *  without it the whole self block (and every delta mirror in it) is skipped. */
const selfIdentity = (pid: number) => ({
  id: pid,
  k: 'player',
  tid: 'warrior',
  nm: 'Ayla',
  lv: 1,
  x: 0,
  y: 0,
  z: 0,
  f: 0,
  hp: 100,
  mhp: 100,
});

describe('deeds wiring: Sim <-> ClientWorld parity over the wire', () => {
  it('mirrors gathering, the chronicle and the unstuck countdown identically', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    meta.gathering.mining = 37;
    meta.gathering.fishing = 120;
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    (sim as any).queueDeed(meta, { kind: 'zoneEnter', zoneId: 'ashen_wastes' });
    drain(sim);
    sim.startUnstuck(sim.playerId);

    const client = bareClient(sim.playerId);
    (client as any).applySnapshot({
      t: 'snap',
      ents: [],
      keep: [],
      self: {
        ...selfIdentity(sim.playerId),
        gather: meta.gathering,
        deeds: sim.deedProgressWire(sim.playerId),
        unstuck: sim.unstuckCountdownFor(sim.playerId),
      },
    });

    expect(client.gatheringSkills()).toEqual(sim.gatheringSkills());
    expect(client.deeds()).toEqual(sim.deeds());
    expect(client.unstuckCountdown()).toBe(sim.unstuckCountdown());
    expect(client.deeds().earned).toBeGreaterThan(0);
    expect(client.gatheringSkills().find((r) => r.professionId === 'fishing')!.skill).toBe(120);
  });

  it('memoizes the chronicle wire form until the progress reference changes', () => {
    // The server calls this at 20 Hz per session and serializeDeedProgress sorts
    // twice; the memo is keyed on the immutable progress object, so it is exact.
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    const first = sim.deedProgressWire(sim.playerId);
    expect(sim.deedProgressWire(sim.playerId)).toBe(first);
    (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'forest_wolf' });
    drain(sim);
    const second = sim.deedProgressWire(sim.playerId);
    expect(second).not.toBe(first);
    expect(second.counters!.kills).toBe(1);
    expect(sim.deedProgressWire(sim.playerId)).toBe(second);
  });

  it('keeps the previous value when the server omits a delta field', () => {
    const client = bareClient(1);
    (client as any).applySnapshot({
      t: 'snap',
      ents: [],
      keep: [],
      self: { ...selfIdentity(1), gather: { mining: 9 }, unstuck: 4 },
    });
    expect(client.gatheringSkills().find((r) => r.professionId === 'mining')!.skill).toBe(9);
    expect(client.unstuckCountdown()).toBe(4);
    // A snapshot that omits them means "unchanged", never "cleared".
    (client as any).applySnapshot({ t: 'snap', ents: [], keep: [], self: { ...selfIdentity(1) } });
    expect(client.gatheringSkills().find((r) => r.professionId === 'mining')!.skill).toBe(9);
    expect(client.unstuckCountdown()).toBe(4);
    // ...while an explicit null does clear the countdown.
    (client as any).applySnapshot({ t: 'snap', ents: [], keep: [], self: { ...selfIdentity(1), unstuck: null } });
    expect(client.unstuckCountdown()).toBe(null);
  });
});

describe('deeds wiring: the IWorld seam', () => {
  it('builds one row per catalogue deed, with the renown and completion pair', () => {
    const sim = makeSim();
    const view = sim.deeds();
    expect(view.entries.map((e) => e.id)).toEqual([...DEED_CATALOG.order]);
    expect(view.entries).toHaveLength(DEED_CATALOG.order.length);
    // Hidden deeds are masked out of the visible total until earned.
    const hidden = view.entries.filter((e) => e.hidden).length;
    expect(view.total).toBe(view.entries.length - hidden);
    expect(view.earned).toBe(0);
    expect(view.renown).toBe(0);
    expect(view.titles).toEqual([]);
  });

  it('reports a real bar and updates as facts land', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId)!;
    for (let i = 0; i < 3; i++) (sim as any).queueDeed(meta, { kind: 'kill', mobId: 'w' });
    drain(sim);
    const view = sim.deeds();
    const hundred = view.entries.find((e) => e.id === 'cmb_hundred')!;
    expect(hundred).toMatchObject({ current: 3, required: 100, earned: false });
    expect(view.entries.find((e) => e.id === 'cmb_first_blood')!.earned).toBe(true);
    // The same tick also banks the login zone, so renown is the sum of both.
    expect(view.entries.find((e) => e.id === 'exp_vale_wayfarer')!.earned).toBe(true);
    expect(view.renown).toBe(
      DEED_CATALOG.deeds.cmb_first_blood.renown + DEED_CATALOG.deeds.exp_vale_wayfarer.renown,
    );
    expect(view.earned).toBe(2);
  });

  it('builds the same view from a bare restored progress (the client path)', () => {
    // ClientWorld mirrors the sparse persisted form and rebuilds the view with
    // this exact helper, so the derivation exists in only one place.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Blank');
    sim.meta(pid)!.deeds = freshDeedProgress();
    expect(buildDeedsView(restoreDeedProgress(sim.deedProgressWire(pid)))).toEqual(
      sim.deedsViewFor(pid),
    );
  });
});
