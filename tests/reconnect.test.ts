import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClientWorld, RECONNECT_MAX_ATTEMPTS, reconnectDelayMs } from '../src/net/online';

// ---------------------------------------------------------------------------
// Harness: a ClientWorld without real WebSocket/window plumbing (same
// Object.create pattern as tests/snapshots.test.ts), plus a fake socket
// factory so the reconnect loop's socket churn is observable.
// ---------------------------------------------------------------------------

interface FakeSocket {
  readyState: number;
  sent: any[];
  send(payload: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

function fakeSocket(): FakeSocket {
  const sent: any[] = [];
  return {
    readyState: 1,
    sent,
    send: (payload: string) => sent.push(JSON.parse(payload)),
    close: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
  };
}

function bareClient(pid = 1): { c: any; sockets: FakeSocket[] } {
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
  c.onDisconnect = null;
  // reconnect state the real constructor initializes
  c.token = 'tok';
  c.characterId = 7;
  c.base = '';
  c.clientSeed = '';
  c.wsUrl = 'ws://test/ws';
  c.sessionEnded = false;
  c.reconnecting = false;
  c.reconnectAttempt = 0;
  c.alreadyInWorldRejections = 0;
  c.lastRejectReason = null;
  c.retryTimer = undefined;
  c.nextRetryAtMs = 0;
  c.visibilityHandler = null;
  c.onConnectionLost = null;
  c.onReconnected = null;
  c.sendTimer = undefined;

  const sockets: FakeSocket[] = [];
  c.createSocket = () => {
    const s = fakeSocket();
    sockets.push(s);
    return s;
  };
  // wire the initial socket exactly like the constructor does
  c.ws = c.createSocket();
  c.attachSocket(c.ws);
  return { c, sockets };
}

const oldWebSocket = (globalThis as any).WebSocket;
const oldFetch = (globalThis as any).fetch;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as any).WebSocket = { OPEN: 1 };
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).WebSocket = oldWebSocket;
  (globalThis as any).fetch = oldFetch;
});

describe('reconnectDelayMs backoff ladder', () => {
  it('starts near 1s, doubles, jitters within 75-125%, and caps at 30s', () => {
    expect(reconnectDelayMs(1, 0)).toBe(750);
    expect(reconnectDelayMs(1, 0.999999)).toBeLessThanOrEqual(1250);
    expect(reconnectDelayMs(2, 0.5)).toBe(2000);
    expect(reconnectDelayMs(3, 0.5)).toBe(4000);
    // deep rungs never exceed the cap regardless of jitter roll
    expect(reconnectDelayMs(10, 0.999999)).toBeLessThanOrEqual(30_000);
    expect(reconnectDelayMs(10, 0)).toBe(22_500);
  });
});

describe('ClientWorld auto-reconnect', () => {
  it('schedules a backoff retry on a bare close and fires onConnectionLost after arming', async () => {
    const { c, sockets } = bareClient();
    const calls: Array<[number, number, number]> = [];
    let armedWhenFired = false;
    c.onConnectionLost = (attempt: number, max: number, nextAt: number) => {
      // the callback must fire AFTER the timer is armed, so a throwing UI
      // handler can never kill the retry loop
      armedWhenFired = c.retryTimer !== undefined;
      calls.push([attempt, max, nextAt]);
    };

    sockets[0].onclose!();

    expect(c.connected).toBe(false);
    expect(c.reconnecting).toBe(true);
    expect(calls).toHaveLength(1);
    expect(armedWhenFired).toBe(true);
    const [attempt, max, nextAt] = calls[0];
    expect(attempt).toBe(1);
    expect(max).toBe(RECONNECT_MAX_ATTEMPTS);
    // attempt 1 backoff: ~1s base with 75-125% jitter
    const delay = nextAt - Date.now();
    expect(delay).toBeGreaterThanOrEqual(750);
    expect(delay).toBeLessThanOrEqual(1250);

    // the timer firing opens a fresh socket that re-runs the auth handshake
    await vi.advanceTimersByTimeAsync(1300);
    expect(sockets).toHaveLength(2);
    sockets[1].onopen!();
    expect(sockets[1].sent[0]).toEqual({ t: 'auth', token: 'tok', character: 7, clientSeed: '' });
  });

  it('never retries after a fatal error frame on the live session', async () => {
    const { c, sockets } = bareClient();
    const lost: number[] = [];
    const reasons: string[] = [];
    c.onConnectionLost = (attempt: number) => lost.push(attempt);
    c.onDisconnect = (reason: string) => reasons.push(reason);

    (c as any).onMessage(JSON.stringify({ t: 'error', error: 'you have been kicked' }));
    expect(reasons).toEqual(['you have been kicked']);
    expect(c.sessionEnded).toBe(true);

    // the server closes the socket after the error frame; that close is inert
    sockets[0].onclose!();
    expect(c.retryTimer).toBeUndefined();
    expect(lost).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets).toHaveLength(1);
    // onDisconnect fired exactly once (the error frame), not again on close
    expect(reasons).toHaveLength(1);
  });

  it('forces a takeover after two consecutive already-in-world rejections, then retries', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    (globalThis as any).fetch = fetchMock;
    const { c, sockets } = bareClient();

    sockets[0].onclose!(); // blip: attempt 1 armed
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(2);

    // rejection 1: old session still holds the slot (save-on-leave window)
    sockets[1].onmessage!({
      data: JSON.stringify({ t: 'error', error: 'character already in world' }),
    });
    sockets[1].onclose!(); // attempt 2 armed
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled(); // one rejection could be a race
    expect(sockets).toHaveLength(3);

    // rejection 2: now the stale session is presumed stuck
    sockets[2].onmessage!({
      data: JSON.stringify({ t: 'error', error: 'character already in world' }),
    });
    sockets[2].onclose!(); // attempt 3 armed
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/api/characters/7/takeover');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    // and the retry itself still happened after the takeover
    expect(sockets).toHaveLength(4);
    expect(c.alreadyInWorldRejections).toBe(0); // streak consumed by the takeover
  });

  it('resets input sequencing and per-session state on a successful rejoin', async () => {
    const { c, sockets } = bareClient();
    let reconnected = 0;
    c.onReconnected = () => {
      reconnected += 1;
    };
    c.inputSeq = 57;
    c.ackedInputSeq = 41;
    c.lastInputSig = '1,0,0,0,0,0,0,';
    c.pendingInputSeqSentAt.set(56, 100);
    c.pendingInputSeqSentAt.set(57, 150);
    c.pendingQuestCommands.set('q_wolves', 'accept');
    c.missingSince.set(9, 123);

    sockets[0].onclose!();
    expect(c.reconnecting).toBe(true);
    expect(c.sendTimer).toBeUndefined(); // input stream stops while offline
    await vi.advanceTimersByTimeAsync(60_000);

    sockets[1].onmessage!({ data: JSON.stringify({ t: 'hello', pid: 33, seed: 42 }) });

    expect(reconnected).toBe(1);
    expect(c.connected).toBe(true);
    expect(c.reconnecting).toBe(false);
    expect(c.playerId).toBe(33);
    // the new server session counts input seqs from 0 again
    expect(c.inputSeq).toBe(0);
    expect(c.ackedInputSeq).toBe(0);
    expect(c.pendingInputSeqSentAt.size).toBe(0);
    expect(c.lastInputSig).toBe('');
    // stale optimistic intents and despawn-grace timers were dropped
    expect(c.pendingQuestCommands.size).toBe(0);
    expect(c.missingSince.size).toBe(0);
    // the input stream is re-armed and sends on the NEW socket with seq 1
    expect(c.sendTimer).not.toBeUndefined();
    await vi.advanceTimersByTimeAsync(50);
    const input = sockets[1].sent.find((m: any) => m.t === 'input');
    expect(input?.seq).toBe(1);
  });

  it('gives up after the attempt ladder is exhausted and fires the fatal onDisconnect', async () => {
    const { c, sockets } = bareClient();
    const lost: number[] = [];
    const reasons: string[] = [];
    c.onConnectionLost = (attempt: number) => lost.push(attempt);
    c.onDisconnect = (reason: string) => reasons.push(reason);

    sockets[0].onclose!(); // arms attempt 1
    for (let i = 0; i < RECONNECT_MAX_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(60_000); // attempt opens a socket...
      sockets[sockets.length - 1].onclose!(); // ...which immediately fails
    }

    expect(lost).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(reasons).toEqual(['Connection to the server was lost.']);
    expect(c.sessionEnded).toBe(true);
    // one initial socket + one per attempt, and none after giving up
    expect(sockets).toHaveLength(1 + RECONNECT_MAX_ATTEMPTS);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets).toHaveLength(1 + RECONNECT_MAX_ATTEMPTS);
  });

  it('surfaces the last auth rejection as the fatal reason when retries run out', async () => {
    const { c, sockets } = bareClient();
    const reasons: string[] = [];
    c.onDisconnect = (reason: string) => reasons.push(reason);

    sockets[0].onclose!();
    for (let i = 0; i < RECONNECT_MAX_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(60_000);
      const s = sockets[sockets.length - 1];
      // every attempt is rejected with a non-transient auth error
      s.onmessage!({ data: JSON.stringify({ t: 'error', error: 'not authenticated' }) });
      s.onclose!();
    }

    // main.ts localizes the raw server text, so the truthful reason must
    // survive instead of a generic "connection lost"
    expect(reasons).toEqual(['not authenticated']);
  });

  it('fast-forwards a long backoff to ~1s when the tab becomes visible', async () => {
    const oldDocument = (globalThis as any).document;
    (globalThis as any).document = { visibilityState: 'visible' };
    try {
      const { c, sockets } = bareClient();
      const calls: Array<[number, number, number]> = [];
      c.onConnectionLost = (attempt: number, max: number, nextAt: number) =>
        calls.push([attempt, max, nextAt]);

      sockets[0].onclose!(); // attempt 1 armed
      await vi.advanceTimersByTimeAsync(60_000);
      sockets[1].onclose!(); // attempt 2 armed: 1.5-2.5s out, always > 1s
      const armedAt = calls[calls.length - 1][2];
      expect(armedAt - Date.now()).toBeGreaterThan(1000);

      (c as any).onVisibilityChange();

      // rearmed for ~1s, same attempt number (visibility does not consume one),
      // and the UI callback re-fired so a countdown can update
      const [attempt, , nextAt] = calls[calls.length - 1];
      expect(attempt).toBe(2);
      expect(nextAt - Date.now()).toBe(1000);
      const socketsBefore = sockets.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets.length).toBe(socketsBefore + 1);
    } finally {
      (globalThis as any).document = oldDocument;
    }
  });
});
