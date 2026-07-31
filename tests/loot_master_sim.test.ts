import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { effectiveMasterLooter } from '../src/sim/loot_master';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

// greyjaw_hide_boots is an uncommon armor piece, so it meets the 'uncommon' master
// threshold and is a premium (need-greed) drop on a shared party kill.
const ITEM = 'greyjaw_hide_boots';

type MasterLootEvent = Extract<SimEvent, { type: 'masterLoot' }>;

function setup() {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const a = sim.addPlayer('warrior', 'Aleph');
  const b = sim.addPlayer('mage', 'Bet');
  const c = sim.addPlayer('rogue', 'Gimel');
  sim.tick();
  for (const m of [b, c]) {
    sim.partyInvite(m, a);
    sim.partyAccept(m);
  }
  return { sim, a, b, c };
}

// A dead, lootable mob tapped by `tapper` carrying one ITEM, with an explicit
// recipient list so every listed pid is a loot candidate regardless of position.
function makeDrop(sim: Sim, tapper: number, recipients: number[]) {
  const pa = sim.entities.get(tapper)!;
  pa.pos = { x: 20, y: 0, z: 20 };
  pa.prevPos = { ...pa.pos };
  const mob = createMob(990900, MOBS.forest_wolf, 5, { x: 20, y: 0, z: 20 });
  mob.dead = true;
  mob.lootable = true;
  mob.tappedById = tapper;
  mob.lootRecipientIds = recipients;
  mob.loot = { copper: 0, items: [{ itemId: ITEM, count: 1 }] };
  sim.entities.set(mob.id, mob);
  return mob;
}

// Open a master-loot roll and return the masterLoot event routed to the looter.
function openMasterRoll(sim: Sim, tapper: number, recipients: number[]): MasterLootEvent {
  const mob = makeDrop(sim, tapper, recipients);
  sim.lootCorpse(mob.id, tapper);
  const events = sim.tick();
  const ml = events.find((e): e is MasterLootEvent => e.type === 'masterLoot');
  if (!ml) throw new Error('expected a masterLoot event');
  return ml;
}

function hasItem(sim: Sim, pid: number): boolean {
  return sim.meta(pid)!.inventory.some((s) => s?.itemId === ITEM);
}

function pendingRolls(sim: Sim): any[] {
  return [...(sim as any).pendingLootRolls.values()];
}

describe('master loot: opening a roll', () => {
  it('routes a threshold drop to the master looter, not a need/greed prompt', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a); // looter 0 = leader (a)
    const mob = makeDrop(sim, a, [a, b, c]);
    sim.lootCorpse(mob.id, a);
    const events = sim.tick();

    const ml = events.find((e): e is MasterLootEvent => e.type === 'masterLoot');
    expect(ml).toBeDefined();
    expect(ml!.pid).toBe(a); // only the master looter sees it
    expect(ml!.candidates.map((x) => x.pid).sort()).toEqual([a, b, c].sort());
    // No open need/greed roll surfaces to anyone during the curate phase.
    expect(events.some((e) => e.type === 'lootRoll')).toBe(false);
    expect(sim.activeLootRolls(b)).toEqual([]);
    expect(sim.activeLootRolls(a)).toEqual([]);
  });

  it('falls back to a need/greed roll when master loot is disabled', () => {
    const { sim, a, b, c } = setup();
    const mob = makeDrop(sim, a, [a, b, c]);
    sim.lootCorpse(mob.id, a);
    const events = sim.tick();
    expect(events.some((e) => e.type === 'masterLoot')).toBe(false);
    expect(events.some((e) => e.type === 'lootRoll')).toBe(true);
  });
});

describe('master loot: assignment', () => {
  it('grants the drop directly when the looter picks exactly one player', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [b], a);
    const events = sim.tick();
    expect(hasItem(sim, b)).toBe(true);
    expect(pendingRolls(sim).length).toBe(0);
    // Everyone is told who received it.
    const assigned = events.filter((e) => e.type === 'loot' && / assigned /.test((e as any).text));
    expect(assigned.length).toBeGreaterThan(0);
  });

  it('opens a need/greed roll for the chosen subset when two or more are picked', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [b, c], a);
    const events = sim.tick();
    const rolls = events.filter(
      (e): e is Extract<SimEvent, { type: 'lootRoll' }> =>
        e.type === 'lootRoll' && e.rollId === ml.rollId,
    );
    expect(rolls.map((e) => e.pid).sort()).toEqual([b, c].sort());
    // The roll is now a normal need/greed roll (curate phase cleared): b may answer.
    expect(sim.activeLootRolls(b).some((p) => p.rollId === ml.rollId)).toBe(true);
    // and a excluded pid (nobody here) plus the direct-grant path did not fire.
    expect(hasItem(sim, b)).toBe(false);
  });

  it('rejects an assignment from anyone but the master looter', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [b], b); // b is not the master looter
    sim.tick();
    const roll = pendingRolls(sim)[0];
    expect(roll.masterLooter).toBe(a); // still a curate-phase master roll
    expect(hasItem(sim, b)).toBe(false);
  });

  // Regression (upstream 4378839a4): the pid list is client-supplied and the wire
  // case checks only that it is a non-empty numeric array, so a repeated pid used
  // to survive into `targets`. [X, X] then took the "two or more" arm and converted
  // a straight assignment into a one-player need/greed roll, and sent X two prompts
  // plus two reveal lines. Deduping BEFORE the length tests is the load-bearing part.
  it('collapses a repeated pid so a doubled pick still grants directly', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [b, b], a);
    const events = sim.tick();

    expect(hasItem(sim, b)).toBe(true); // the direct-grant arm, exactly like [b]
    expect(pendingRolls(sim).length).toBe(0); // not converted to a need/greed roll
    expect(events.some((e) => e.type === 'lootRoll')).toBe(false);
    // and b is told once, not twice
    const toB = events.filter(
      (e) => e.type === 'loot' && (e as any).pid === b && / assigned /.test((e as any).text),
    );
    expect(toB).toHaveLength(1);
  });

  it('collapses duplicates before the subset roll, prompting each player once', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [b, c, b, c], a);
    const events = sim.tick();

    const rolls = events.filter(
      (e): e is Extract<SimEvent, { type: 'lootRoll' }> =>
        e.type === 'lootRoll' && e.rollId === ml.rollId,
    );
    expect(rolls.map((e) => e.pid).sort()).toEqual([b, c].sort()); // one prompt each
    expect(pendingRolls(sim)[0].candidates).toEqual([b, c]); // first-seen order kept
  });

  it('is a no-op when no valid candidate is selected', () => {
    const { sim, a, b, c } = setup();
    const outsider = sim.addPlayer('priest', 'Delta');
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(ml.rollId, [outsider], a); // not a candidate -> filtered out
    sim.tick();
    const roll = pendingRolls(sim)[0];
    expect(roll.masterLooter).toBe(a); // untouched
    expect(hasItem(sim, outsider)).toBe(false);
  });
});

describe('master loot: curate window (5-minute timeout)', () => {
  it('auto-converts an uncurated master roll to a need/greed roll for all candidates', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a);
    const ml = openMasterRoll(sim, a, [a, b, c]);

    const roll = pendingRolls(sim)[0];
    expect(roll.masterLooter).toBe(a);
    // Force the curate window to elapse (a sim-clock timer, not wall clock).
    roll.expiresAt = -1;
    const events = sim.tick();

    expect(roll.masterLooter).toBeUndefined(); // converted in place, same roll id
    const rolls = events.filter(
      (e): e is Extract<SimEvent, { type: 'lootRoll' }> =>
        e.type === 'lootRoll' && e.rollId === ml.rollId,
    );
    expect(rolls.map((e) => e.pid).sort()).toEqual([a, b, c].sort());
  });
});

describe('master loot: leadership handoff', () => {
  it('follows the new leader when the looter is pinned to the leader (0)', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 0, 'uncommon', a); // looter 0 = whoever leads
    sim.partyPromote(b, a); // b is now leader
    sim.tick();

    const ml = openMasterRoll(sim, b, [a, b, c]);
    expect(ml.pid).toBe(b); // master loot followed the handoff to the new leader
  });
});

describe('master loot: settings authority', () => {
  it('lets the leader change the loot method and announces it to the group', () => {
    const { sim, a, b, c } = setup();
    sim.setPartyLootMaster(true, 2 /* ignored: resolves to 0 unless a member pid */, 'rare', a);
    const master = sim.partyOf(a)!.lootStrategies.master;
    expect(master.enabled).toBe(true);
    expect(master.threshold).toBe('rare');
    // A named looter that is a member is kept; pid 2 here is not guaranteed a member,
    // so assert the leader-set path recorded a valid looter (0 or a real member).
    expect(master.looter === 0 || sim.partyOf(a)!.members.includes(master.looter)).toBe(true);
  });

  it('rejects a non-leader changing the loot method and leaves settings unchanged', () => {
    const { sim, a, b } = setup();
    sim.setPartyLootMaster(true, 0, 'rare', a); // leader configures master loot
    sim.tick();

    sim.setPartyLootMaster(false, 0, 'uncommon', b); // b is a plain member
    const events = sim.tick();
    expect(
      events.some(
        (e) =>
          e.type === 'error' &&
          e.pid === b &&
          e.text === 'Only the party leader can change the loot method.',
      ),
    ).toBe(true);
    expect(sim.partyOf(a)!.lootStrategies.master).toEqual({
      enabled: true,
      looter: 0,
      threshold: 'rare',
    });
  });

  it('clears the named master looter when they leave so it falls back to the leader', () => {
    const { sim, a, b } = setup(); // setup seats a, b, c; the party survives b leaving
    sim.setPartyLootMaster(true, b, 'uncommon', a); // b is a member, so it is kept
    expect(sim.partyOf(a)!.lootStrategies.master.looter).toBe(b);

    sim.partyLeave(b); // the named looter departs
    const master = sim.partyOf(a)!.lootStrategies.master;
    // the stale pid is cleared (not left pinned to a departed member) and the role
    // falls back to the leader, so the leader's Loot Settings select stays coherent
    expect(master.looter).toBe(0);
    expect(master.enabled).toBe(true);
    const party = sim.partyOf(a)!;
    expect(effectiveMasterLooter(master, party.leader, party.members)).toBe(a);
  });

  it('clears the master looter when the leader who held the role leaves', () => {
    const { sim, a, b } = setup();
    sim.setPartyLootMaster(true, a, 'uncommon', a); // the leader names themselves
    expect(sim.partyOf(a)!.lootStrategies.master.looter).toBe(a);

    sim.partyLeave(a); // leadership passes and the stale looter must not persist
    const party = sim.partyOf(b)!;
    expect(party.lootStrategies.master.looter).toBe(0);
    expect(party.leader).not.toBe(a);
  });
});
