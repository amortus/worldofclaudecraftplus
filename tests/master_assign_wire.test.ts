// The `masterAssign` wire case is the boundary for a client-supplied pid list
// (upstream levy-street/world-of-claudecraft bbacc2229). It used to check only
// "non-empty array of numbers", so one 16 KiB frame could hand the Sim a list of
// thousands of pids to scan and de-duplicate. A curate-phase roll's candidates are
// the tapping group's loot-eligible members, so a full raid roster (RAID_MAX) is
// the most an honest client can ever check: over that, the frame is rejected
// outright rather than truncated to a selection the master looter never made.

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { type ClientSession, GameServer } from '../server/game';
import { RAID_MAX } from '../src/sim/sim';

function fakeWs() {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) } as any };
}

function join(server: GameServer, id: number, name: string): ClientSession {
  const fc = fakeWs();
  const session = server.join(fc.ws, id, id, name, 'warrior', null);
  if ('error' in session) throw new Error(session.error);
  session.blockListLoaded = true;
  return session;
}

describe('masterAssign wire bound', () => {
  let server: GameServer;
  let session: ClientSession;
  let calls: { rollId: number; pids: number[]; pid: number }[];

  beforeEach(() => {
    server = new GameServer();
    session = join(server, 501, 'Looter');
    calls = [];
    (server as any).sim.assignMasterLoot = (rollId: number, pids: number[], pid: number) => {
      calls.push({ rollId, pids, pid });
    };
  });

  const send = (pids: unknown) =>
    server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'masterAssign', rollId: 7, pids }));

  it('passes an honest selection through, up to a full raid roster', () => {
    send([session.pid]);
    expect(calls).toHaveLength(1);
    expect(calls[0].pids).toEqual([session.pid]);

    const fullRaid = Array.from({ length: RAID_MAX }, (_, i) => 1000 + i);
    send(fullRaid);
    expect(calls).toHaveLength(2);
    expect(calls[1].pids).toEqual(fullRaid);
  });

  it('rejects a pid list longer than a full raid roster instead of truncating it', () => {
    send(Array.from({ length: RAID_MAX + 1 }, (_, i) => 1000 + i));
    expect(calls).toHaveLength(0);

    send(Array.from({ length: 5000 }, (_, i) => i));
    expect(calls).toHaveLength(0);
  });

  it('still rejects an empty list and a non-numeric element', () => {
    send([]);
    send([session.pid, 'nope']);
    send('not-an-array');
    expect(calls).toHaveLength(0);
  });
});
