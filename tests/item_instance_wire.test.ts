import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; the wire path is under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { GameServer } from '../server/game';
import { ClientWorld } from '../src/net/online';
import type { InvSlot, ItemInstance } from '../src/sim/types';

const INSTANCE: ItemInstance = {
  signer: 'Ambrose',
  signerId: 7,
  craftedRecipeId: 'r_blade',
  enchant: 'ench_sharp',
  rolled: { masterwork: true, stats: { str: 4 } },
};

interface FakeClient {
  sent: any[];
  ws: any;
}

function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) } };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].t === 'snap') return sent[i];
  return null;
}

// A ClientWorld without the WebSocket plumbing, to drive applySnapshot directly.
function bareClient(pid: number): ClientWorld {
  const c: any = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 20061, playerClass: 'warrior' };
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
  return c;
}

function applyTo(client: ClientWorld, snapshot: unknown): void {
  (client as unknown as { applySnapshot(s: unknown): void }).applySnapshot(snapshot);
}

describe('item instances over the wire', () => {
  it('round-trips a per-item instance from the server sim to the client mirror', () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = server.join(fc.ws, 1, 1, 'Ambrose', 'warrior', null);
    if ('error' in session) throw new Error(session.error);
    session.blockListLoaded = true;

    const sim = (server as any).sim;
    sim.addItem('linen_scrap', 2, session.pid);
    sim.addItem('linen_scrap', 1, session.pid, { ...INSTANCE });
    (server as any).broadcastSnapshots();

    const snap = lastSnap(fc.sent);
    expect(snap?.self?.inv).toBeTruthy();
    const wire = JSON.parse(JSON.stringify(snap.self.inv)) as InvSlot[];
    const rows = wire.filter((s) => s.itemId === 'linen_scrap');
    expect(rows.map((s) => s.count)).toEqual([2, 1]);
    expect(rows[1].instance).toEqual(INSTANCE);

    const client = bareClient(session.pid);
    applyTo(client, snap);
    const mirrored = client.inventory.filter((s) => s.itemId === 'linen_scrap');
    expect(mirrored.map((s) => s.count)).toEqual([2, 1]);
    expect(mirrored[1].instance).toEqual(INSTANCE);
    // The mirror is a copy, not an alias of the decoded frame.
    expect(mirrored[1].instance).not.toBe(rows[1].instance);
  });

  it('mirrors a payload field this build has never heard of instead of dropping it', () => {
    const client = bareClient(1);
    applyTo(client, {
      t: 'snap',
      ents: [],
      self: {
        id: 1,
        k: 'player',
        tid: 'warrior',
        nm: 'Ambrose',
        lv: 1,
        x: 0,
        y: 0,
        z: 0,
        f: 0,
        hp: 100,
        mhp: 100,
        res: 0,
        mres: 100,
        rtype: 'rage',
        inv: [{ itemId: 'blade', count: 1, instance: { signer: 'A', futureField: { tier: 3 } } }],
      },
    });
    expect(client.inventory).toEqual([
      { itemId: 'blade', count: 1, instance: { signer: 'A', futureField: { tier: 3 } } },
    ]);
  });

  it('cannot be crashed by a malformed or hostile inventory frame', () => {
    const client = bareClient(1);
    const frame = (inv: unknown) => ({
      t: 'snap',
      ents: [],
      self: {
        id: 1,
        k: 'player',
        tid: 'warrior',
        nm: 'Ambrose',
        lv: 1,
        x: 0,
        y: 0,
        z: 0,
        f: 0,
        hp: 100,
        mhp: 100,
        res: 0,
        mres: 100,
        rtype: 'rage',
        inv,
      },
    });

    expect(() =>
      applyTo(
        client,
        frame([
          { itemId: 'blade', count: 1, instance: 'corrupt' },
          { itemId: 'linen', count: 2, instance: { signer: 5 } },
          null,
          42,
          { count: 9 },
        ]),
      ),
    ).not.toThrow();
    expect(client.inventory).toEqual([
      { itemId: 'blade', count: 1 },
      { itemId: 'linen', count: 2 },
    ]);

    expect(() => applyTo(client, frame('not an array'))).not.toThrow();
    expect(client.inventory).toEqual([]);
  });

  it('leaves a plain (pre-instance) inventory frame byte-identical', () => {
    const client = bareClient(1);
    const inv = [
      { itemId: 'linen', count: 4 },
      { itemId: 'blade', count: 1 },
    ];
    applyTo(client, {
      t: 'snap',
      ents: [],
      self: {
        id: 1,
        k: 'player',
        tid: 'warrior',
        nm: 'Ambrose',
        lv: 1,
        x: 0,
        y: 0,
        z: 0,
        f: 0,
        hp: 100,
        mhp: 100,
        res: 0,
        mres: 100,
        rtype: 'rage',
        inv,
      },
    });
    expect(JSON.stringify(client.inventory)).toBe(JSON.stringify(inv));
  });
});
