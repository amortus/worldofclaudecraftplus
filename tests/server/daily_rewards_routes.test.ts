// Unit coverage for the daily-rewards route layer (server/daily_rewards.ts).
//
// The migration lifted the daily-rewards player family off its legacy ladder onto RouteDefs
// the shared dispatcher serves (v0.20.0 grew it by its paginated leaderboard):
// GET /api/daily-rewards, GET /api/daily-rewards/leaderboard, POST /api/daily-rewards/spin
// and GET /api/daily-rewards/history, each gated by the shared legacy-body activeGuard
// (createActiveGuard over the lazy guard db), calling handleDailyRewardApi UNCHANGED.
//
// It is a PARITY-FIRST migration: each thin handler reuses the same sub-dispatcher the
// ladder serves, so every body and the lenient Number(...)|| page decode are
// byte-identical. There is NO withBody anywhere (the four player reads are body-free).
//
// This file pins the ROUTE LAYER. The existing tests/daily_rewards_table.test.ts covers the
// DailyRewardService internals against a hand-written FakeDailyRewardDb; here the service
// is driven through the real route chain (compose + withErrors + the real guard
// middleware) with the db reads mocked so nothing hits Postgres.
//
// server/db builds a pg Pool at module load and throws if DATABASE_URL is unset; a dummy
// URL is set before the module graph evaluates. The pool never connects: the guard reads
// go through setDailyRewardDbForTests and the service db is a mocked PgDailyRewardDb.
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_daily_routes';

import type * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountModerationStatus } from '../../server/db';

// One hoisted bundle: a mutable `state` the fakes read and a mocked PgDailyRewardDb surface
// (vi.fns closing over state, so per-test control is a state write, never a leaky
// once-implementation). Reset in beforeEach.
const h = vi.hoisted(() => {
  const state = {
    spin: null as { outcomeKey: string; points: number; createdAt: string } | null,
    ban: null as { reason: string; expiresAt: string | null } | null,
    ensureDayThrows: false,
  };
  const db = {
    banForAccount: vi.fn(async () => state.ban),
    ensureDay: vi.fn(async () => {
      if (state.ensureDayThrows) throw new Error('db exploded');
    }),
    seedTasks: vi.fn(async () => {}),
    tasksForAccount: vi.fn(async () => [] as unknown[]),
    tasksForType: vi.fn(async () => [] as unknown[]),
    scoreForAccount: vi.fn(async () => 0),
    onlineMinutesForAccount: vi.fn(async () => 0),
    leaderboardTotal: vi.fn(async () => 0),
    leaderboardSnapshot: vi.fn(async () => [] as unknown[]),
    leaderboardPage: vi.fn(async (_day: string, page: number, pageSize: number) => ({
      rows: [] as unknown[],
      page,
      pageSize,
      pageCount: 1,
      total: 0,
    })),
    spinForAccount: vi.fn(async () => state.spin),
    recordSpin: vi.fn(async () => true),
    addPoints: vi.fn(async () => true),
    questTaskCompletionCount: vi.fn(async () => 0),
  };
  return { state, db };
});

// The service singleton constructs new PgDailyRewardDb() at module load; swap it for a
// fake whose methods are the shared vi.fns. importOriginal + spread keeps the interface
// types and any other export intact (partial-safe).
vi.mock('../../server/daily_rewards_db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/daily_rewards_db')>();
  class FakePgDailyRewardDb {
    banForAccount = h.db.banForAccount;
    ensureDay = h.db.ensureDay;
    seedTasks = h.db.seedTasks;
    tasksForAccount = h.db.tasksForAccount;
    tasksForType = h.db.tasksForType;
    scoreForAccount = h.db.scoreForAccount;
    onlineMinutesForAccount = h.db.onlineMinutesForAccount;
    leaderboardTotal = h.db.leaderboardTotal;
    leaderboardSnapshot = h.db.leaderboardSnapshot;
    leaderboardPage = h.db.leaderboardPage;
    spinForAccount = h.db.spinForAccount;
    recordSpin = h.db.recordSpin;
    addPoints = h.db.addPoints;
    questTaskCompletionCount = h.db.questTaskCompletionCount;
  }
  return { ...actual, PgDailyRewardDb: FakePgDailyRewardDb };
});

import {
  bustDailyRewardBoardCache,
  DailyRewardService,
  dailyRewardService,
  resetDailyRewardDbForTests,
  resetDailyRewardPriceCacheForTests,
  routes,
  setDailyRewardDbForTests,
} from '../../server/daily_rewards';
import { resetDailyRewardSeedGateForTests } from '../../server/daily_rewards_seed_gate';
import { compose } from '../../server/http/compose';
import { withErrors } from '../../server/http/middleware/with_errors';
import type { Method, Middleware } from '../../server/http/types';
import { type FakeRes, fakeCtx, makeReq } from './helpers';

// A well-formed bearer header (64 lowercase-hex, matching the guard BEARER_PATTERN).
const BEARER = `Bearer ${'a'.repeat(64)}`;

// The four player routes, in declared order.
const PLAYER_PATHS: ReadonlyArray<readonly [Method, string]> = [
  ['GET', '/api/daily-rewards'],
  ['GET', '/api/daily-rewards/leaderboard'],
  ['POST', '/api/daily-rewards/spin'],
  ['GET', '/api/daily-rewards/history'],
];

/** A not-locked AccountModerationStatus (the guard bundle's real return shape). */
function modStatus(overrides: Partial<AccountModerationStatus> = {}): AccountModerationStatus {
  return {
    locked: false,
    banned: false,
    suspendedUntil: null,
    reason: '',
    message: '',
    chatMutedUntil: null,
    chatStrikes: 0,
    ...overrides,
  };
}

/** Authorize the shared guard db with a full, non-locked account (overridable). */
function authedDb(overrides: Partial<Parameters<typeof setDailyRewardDbForTests>[0]> = {}): void {
  setDailyRewardDbForTests({
    accountAndScopeForToken: async () => ({ accountId: 7, scope: 'full' }),
    moderationStatusForAccount: async () => modStatus(),
    ...overrides,
  });
}

/** Read status/body/content-type/headers off the fakeCtx's FakeRes. */
function readRes(res: http.ServerResponse): {
  status: number;
  body: unknown;
  raw: string;
  contentType: string | undefined;
  headers: Record<string, string | number | string[]>;
} {
  const fake = res as unknown as FakeRes;
  const raw = fake.body;
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  return {
    status: fake.statusCode,
    body,
    raw,
    contentType: fake.headers['content-type'] as string | undefined,
    headers: fake.headers,
  };
}

/** Grab a route by method + path (paths repeat across methods, so both are needed). */
function routeFor(method: Method, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route ${method} ${path}`);
  return route;
}

/** Drive a full route chain (its real gate/guard middleware + handler) under withErrors. */
async function runRoute(
  method: Method,
  path: string,
  opts: {
    url?: string;
    body?: unknown;
    headers?: Record<string, string>;
    req?: http.IncomingMessage;
  } = {},
) {
  const route = routeFor(method, path);
  let reached = false;
  const terminal: Middleware = async (c) => {
    reached = true;
    await route.handler(c);
  };
  const ctx = fakeCtx({
    method,
    url: opts.url ?? path,
    headers: opts.headers,
    body: opts.body,
    req: opts.req,
  });
  const stack: Middleware[] = [
    withErrors({ surface: route.meta?.envelope }),
    ...(route.middleware ?? []),
    terminal,
  ];
  await compose(stack)(ctx);
  return { reached, ...readRes(ctx.res) };
}

const ORIGINAL_SERVICE_URL = process.env.WOC_DAILY_REWARD_SERVICE_URL;

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the mutable fake state to its defaults.
  h.state.spin = null;
  h.state.ban = null;
  h.state.ensureDayThrows = false;
  resetDailyRewardDbForTests();
  resetDailyRewardPriceCacheForTests();
  // Both memos live at module scope, so without a per-test reset an earlier test
  // that seeds a (day, realm, config) key would let a later test skip the gated
  // ensureDay/seedTasks pair (the ensureDayThrows case would never reach its throw).
  resetDailyRewardSeedGateForTests();
  // The routes drive the module-load singleton, whose instance board cache
  // would otherwise leak a board snapshot across tests.
  bustDailyRewardBoardCache();
  // Default: the config URL is unset, so the config falls back (no fetch).
  delete process.env.WOC_DAILY_REWARD_SERVICE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDailyRewardDbForTests();
  resetDailyRewardPriceCacheForTests();
  restoreEnv('WOC_DAILY_REWARD_SERVICE_URL', ORIGINAL_SERVICE_URL);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. The route table shape.
// ---------------------------------------------------------------------------

describe('daily-rewards route table', () => {
  it('registers the player routes in the declared order', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/daily-rewards',
      'GET /api/daily-rewards/leaderboard',
      'POST /api/daily-rewards/spin',
      'GET /api/daily-rewards/history',
    ]);
  });

  it('marks the player family surface api with NO meta.envelope', () => {
    for (const [method, path] of PLAYER_PATHS) {
      const r = routeFor(method, path);
      expect(r.surface, path).toBe('api');
      expect(r.meta?.envelope, path).toBeUndefined();
    }
  });

  it('carries exactly one guard middleware per route and no body schema (no withBody)', () => {
    for (const r of routes) {
      expect(Array.isArray(r.middleware) && r.middleware.length === 1, r.path).toBe(true);
      expect(r.schema, r.path).toBeUndefined();
    }
  });

  it('shares one activeGuard across the player family', () => {
    const playerGuards = new Set(PLAYER_PATHS.map(([m, p]) => routeFor(m, p).middleware?.[0]));
    // All four player routes carry the SAME guard instance.
    expect(playerGuards.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. The player routes authenticate through the REAL shared activeGuard chain.
// ---------------------------------------------------------------------------

describe('player routes: activeGuard chain', () => {
  for (const [method, path] of PLAYER_PATHS) {
    it(`${method} ${path} 401s a missing bearer db-free, handler never called`, async () => {
      authedDb();
      const r = await runRoute(method, path);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ error: 'not authenticated', code: 'auth.required' });
      expect(r.contentType).toBe('application/json');
      expect(r.reached).toBe(false);
      // A missing bearer 401s before any service read.
      expect(h.db.ensureDay).not.toHaveBeenCalled();
    });
  }

  it('403s a read-only token { error: "this token is read-only" }', async () => {
    authedDb({ accountAndScopeForToken: async () => ({ accountId: 7, scope: 'read' }) });
    const r = await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'this token is read-only', code: 'auth.forbidden' });
    expect(r.reached).toBe(false);
  });

  it('403s a moderation-locked account with the status message', async () => {
    authedDb({
      moderationStatusForAccount: async () =>
        modStatus({
          locked: true,
          message: 'this account is suspended.',
        }),
    });
    const r = await runRoute('POST', '/api/daily-rewards/spin', {
      headers: { authorization: BEARER },
    });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'this account is suspended.', code: 'moderation.suspended' });
    expect(r.reached).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. The player thin handlers dispatch to the shared core (parity by construction).
// ---------------------------------------------------------------------------

describe('player routes: thin-handler dispatch', () => {
  beforeEach(() => {
    authedDb();
  });

  it('GET /api/daily-rewards answers 200 with the status payload', async () => {
    const r = await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });
    expect(r.status).toBe(200);
    const body = r.body as Record<string, unknown>;
    // The status payload the shared core builds (no participation ban -> eligible).
    expect(body).toMatchObject({
      enabled: true,
      eligibility: { eligible: true, reason: 'eligible' },
      spin: { claimed: false },
    });
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['day', 'resetAt', 'eligibility', 'score', 'leaderboard']),
    );
    // The handler dispatched into the service (which touched the mocked db).
    expect(h.db.ensureDay).toHaveBeenCalled();
    expect(r.reached).toBe(true);
  });

  it('delivers the exported bust to the live module singleton, not a detached cache', async () => {
    // Behavioral pin on the moderation-bust delivery link: main.ts's
    // bustBoardCaches calls bustDailyRewardBoardCache(), which must reach
    // the INSTANCE cache of the module-load dailyRewardService singleton
    // (the one these routes drive). A regression to a module-level cache in
    // the board-cache module, or a bust aimed at a second service instance,
    // keeps the source-text pin green and fails only here.
    await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });
    await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });
    // Fresh within the TTL: both requests share one snapshot refresh.
    expect(h.db.leaderboardSnapshot).toHaveBeenCalledTimes(1);
    bustDailyRewardBoardCache();
    const r = await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });
    expect(r.status).toBe(200);
    // The exported bust emptied the singleton's cache: the next read refreshed.
    expect(h.db.leaderboardSnapshot).toHaveBeenCalledTimes(2);
  });

  it('GET leaderboard answers 200 with the page payload and decodes page/pageSize leniently', async () => {
    // ?page=abc&pageSize=xyz coerce to NaN then fall back to 0 / 20 (never a 422).
    const bad = await runRoute('GET', '/api/daily-rewards/leaderboard', {
      url: '/api/daily-rewards/leaderboard?page=abc&pageSize=xyz',
      headers: { authorization: BEARER },
    });
    expect(bad.status).toBe(200);
    expect(bad.body).toEqual({
      day: expect.any(String),
      leaders: [],
      page: 0,
      pageSize: 20,
      pageCount: 1,
      total: 0,
    });
    expect(h.db.leaderboardPage).toHaveBeenLastCalledWith(expect.any(String), 0, 20);
    expect(bad.reached).toBe(true);

    // Finite ?page=2&pageSize=50 flow through verbatim.
    await runRoute('GET', '/api/daily-rewards/leaderboard', {
      url: '/api/daily-rewards/leaderboard?page=2&pageSize=50',
      headers: { authorization: BEARER },
    });
    expect(h.db.leaderboardPage).toHaveBeenLastCalledWith(expect.any(String), 2, 50);
  });

  it('POST spin 403s a banned account with the legacy lock prose', async () => {
    // A participation ban is the one thing that locks the spin now.
    h.state.ban = { reason: 'cheating', expiresAt: null };
    const r = await runRoute('POST', '/api/daily-rewards/spin', {
      headers: { authorization: BEARER },
    });
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'daily rewards are locked for this account' });
    expect(r.reached).toBe(true);
    // Ineligible: the spin row is never even read.
    expect(h.db.recordSpin).not.toHaveBeenCalled();
  });

  it('POST spin 409s an already-claimed day', async () => {
    // An existing spin row makes the second spin a 409.
    h.state.spin = { outcomeKey: 's20', points: 20, createdAt: '2026-07-01T00:00:00.000Z' };

    const r = await runRoute('POST', '/api/daily-rewards/spin', {
      headers: { authorization: BEARER },
    });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'daily spin already claimed' });
    expect(r.reached).toBe(true);
    // recordSpin is never reached once an existing spin short-circuits.
    expect(h.db.recordSpin).not.toHaveBeenCalled();
  });

  it('GET history answers 200 { payouts: [] }', async () => {
    const r = await runRoute('GET', '/api/daily-rewards/history', {
      headers: { authorization: BEARER },
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ payouts: [] });
    expect(r.reached).toBe(true);
  });

  it('web POST spin reads NO request body (never attaches a data listener)', async () => {
    // Build a body-less req and spy on its listener registration: a spin that self-read a
    // body would attach a 'data' listener (readBody), inventing 400/413 behavior the
    // legacy arm never had. The 200 proves the chain still resolves.
    const req = makeReq({
      method: 'POST',
      url: '/api/daily-rewards/spin',
      headers: { authorization: BEARER },
    });
    const onSpy = vi.spyOn(req, 'on');
    const r = await runRoute('POST', '/api/daily-rewards/spin', { req });
    expect(r.status).toBe(200);
    expect(onSpy.mock.calls.some(([event]) => event === 'data')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The body-validation remap deviations (an escaping throw serializes per surface).
// ---------------------------------------------------------------------------

describe('body-validation remap deviations', () => {
  it('player: a service throw behind a passing guard 500s problem+json (dailyRewardsBodyValidationRemap)', async () => {
    // The player family carries no envelope override, so an escaping throw defaults to the
    // RFC 9457 problem+json 500. The guard passes; the service read throws.
    authedDb();
    h.state.ensureDayThrows = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await runRoute('GET', '/api/daily-rewards', { headers: { authorization: BEARER } });

    expect(r.status).toBe(500);
    expect(r.contentType).toBe('application/problem+json');
    expect((r.body as Record<string, unknown>).code).toBe('internal.error');
    expect(r.headers['x-request-id']).toBeDefined();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. The dailyRewardService singleton (the game.ts contract) is importable and callable
// independent of the route table.
// ---------------------------------------------------------------------------

describe('dailyRewardService singleton', () => {
  it('exports a live DailyRewardService with the game-loop hooks callable', () => {
    expect(dailyRewardService).toBeInstanceOf(DailyRewardService);
    expect(typeof dailyRewardService.recordOnlineMinute).toBe('function');
    expect(typeof dailyRewardService.recordQuestCompletion).toBe('function');
    expect(typeof dailyRewardService.recordArenaResult).toBe('function');
    expect(typeof dailyRewardService.recordDelveClear).toBe('function');
    expect(typeof dailyRewardService.recordDelveChestOpen).toBe('function');
  });
});
