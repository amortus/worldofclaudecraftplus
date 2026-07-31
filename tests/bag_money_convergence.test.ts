import { describe, expect, it } from 'vitest';
import { ClientWorld } from '../src/net/online';

// A MONEY-ONLY snapshot delta carries no inventory echo at all: a proceeds-only
// market collect, a quest gold reward and a coin-only mob loot all move the purse
// and nothing else. The bag money row (and vendor affordability) repaint off
// consumeInventoryChanged, so without a copper diff they sat stale until the window
// was closed and reopened.
//
// It has to be a DIFF against the prior mirror, never a presence test: copper rides
// EVERY self-frame, so `s.copper !== undefined` would raise the flag at 20 Hz and
// rebuild the bags under the player's cursor continuously.

const SELF = {
  id: 1,
  k: 'player',
  tid: 'warrior',
  nm: 'Aki',
  lv: 10,
  x: 0,
  y: 0,
  z: 0,
  f: 0,
  hp: 100,
  mhp: 100,
  res: 0,
  mres: 100,
  rtype: 'rage',
};

interface Internals {
  applySnapshot(snapshot: unknown): void;
  consumeInventoryChanged(): boolean;
  copper: number;
}

function bareClient(): Internals {
  const c: Record<string, unknown> = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 1, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = 1;
  c.ownPlayerId = 1;
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
  return c as unknown as Internals;
}

const snapWithCopper = (copper: number) => ({
  t: 'snap',
  ents: [],
  self: { ...SELF, copper },
});

describe('bag money row convergence on a money-only snapshot', () => {
  it('flags an inventory change when copper MOVES with no inv echo', () => {
    const client = bareClient();
    client.applySnapshot(snapWithCopper(0));
    client.consumeInventoryChanged(); // drain whatever the first frame raised

    client.applySnapshot(snapWithCopper(4200));
    expect(client.copper).toBe(4200);
    expect(client.consumeInventoryChanged()).toBe(true);
  });

  it('does NOT flag on an unchanged purse, however many frames arrive', () => {
    // The 20 Hz regression this guards: copper rides every self-frame, so a
    // presence test here would rebuild the bags continuously.
    const client = bareClient();
    client.applySnapshot(snapWithCopper(4200));
    client.consumeInventoryChanged();
    for (let i = 0; i < 40; i++) {
      client.applySnapshot(snapWithCopper(4200));
      expect(client.consumeInventoryChanged(), `frame ${i}`).toBe(false);
    }
  });

  it('flags a purse that goes DOWN too (a trainer fee, a bank slot buy)', () => {
    const client = bareClient();
    client.applySnapshot(snapWithCopper(4200));
    client.consumeInventoryChanged();
    client.applySnapshot(snapWithCopper(200));
    expect(client.copper).toBe(200);
    expect(client.consumeInventoryChanged()).toBe(true);
  });

  it('treats an OMITTED copper field as zero, matching the prior mirror contract', () => {
    const client = bareClient();
    client.applySnapshot(snapWithCopper(0));
    client.consumeInventoryChanged();
    client.applySnapshot({ t: 'snap', ents: [], self: { ...SELF } });
    expect(client.copper).toBe(0);
    expect(client.consumeInventoryChanged()).toBe(false);
  });

  it('still flags on an inventory delta, with or without a purse move', () => {
    // Polarity: the copper diff must be an ADDITION to the existing arms, not a
    // replacement that could swallow an inv-only change.
    const client = bareClient();
    client.applySnapshot(snapWithCopper(100));
    client.consumeInventoryChanged();
    client.applySnapshot({
      t: 'snap',
      ents: [],
      self: { ...SELF, copper: 100, inv: [{ itemId: 'amber_hide', count: 1 }] },
    });
    expect(client.consumeInventoryChanged()).toBe(true);
  });
});
