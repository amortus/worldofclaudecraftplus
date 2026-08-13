// The card + referral REST surface.
//
// This module used to also host the non-custodial Solana wallet linking family
// (POST /api/wallet/link/challenge, POST/DELETE /api/wallet/link, GET /api/wallet)
// and the public GET /api/woc/balance proxy. That whole crypto surface is gone.
// What is left is the two routes that were never crypto and still ship: the
// binary player-card upload and the referral count read. The guard, the runtime
// injection, and the db seam below are the ones those two routes always used.

import type http from 'node:http';
import {
  accountAndScopeForToken,
  moderationStatusForAccount,
  primarySlugForAccount,
  referralCountForAccount,
  scopeAllowsMutation,
} from './db';
import { ctxAccountId } from './http/context';
import { CARD_UPLOAD_POLICY, rateLimit } from './http/middleware/rate_limit';
import type { Ctx, Middleware, RouteDef } from './http/types';
import { json, moderationErrorBody } from './http_util';
import { cardUploadContentLengthTooLarge, handleCardUpload } from './player_card';
import { recordUsageMetric } from './provider_usage';

// ===========================================================================
// The card / referral surface sits on the shared server/http/ pipeline the
// registry dispatcher serves under API_DISPATCH 'new'. It follows the
// server/account.ts template:
//  - the bearer + moderation gate is a per-route guard middleware (activeGuard)
//    that mirrors the legacy bearerActiveAccount resolver and writes the legacy
//    { error } bodies, NOT the generic requireAccount middleware (which throws a
//    problem+json HttpError and would break the goldens and the prose-matcher).
//  - the card handler self-reads its body (readBinaryBody), so NO withBody /
//    withRawBody middleware is composed (either would double-consume the stream).
//    The card pre-auth Content-Length over-cap short-circuit (413 + Connection:
//    close, BEFORE auth and before the body is read) is preserved as a dedicated
//    cardContentLengthGuard mirroring the legacy pre-auth check byte-for-byte;
//    it reuses the existing MAX_CARD_BYTES cap via cardUploadContentLengthTooLarge.
//  - the previously-raw { error: 'rate limited' } 429 on card becomes a coded 429
//    on the new path: the limiter is a rateLimit(policy) middleware that throws
//    HttpError(429, 'rate_limit.exceeded', { retryAfterSeconds }), serialized as
//    RFC 9457 problem+json by the withErrors error boundary. The legacy arm keeps
//    the prose body for the flag-off rollback (the rateLimitedBodyToCode known
//    deviation). The ip+account limiter (CARD_UPLOAD_POLICY) is a single fused
//    call recording both the IP and account buckets, so it mounts AFTER
//    activeGuard (ctxAccountId is set) and runs exactly once per request.
//  - the card level lookup (game.liveLevelForCharacter) is the one main.ts-local
//    singleton the handlers need; it is INJECTED once at boot via
//    configureWalletRuntime, so `export const routes` stays a static array
//    registry.ts can spread. The db.ts reads the guard uses are bundled behind
//    setWalletDbForTests for unit tests. The legacy handleApi arms stay in
//    main.ts as the flag-off rollback path until the ladder-deletion PR (next release).
// ===========================================================================

// The exact legacy { error } identities the guard + card pre-auth check emit.
// Named constants so they cannot drift from the bearerActiveAccount / card arms
// they mirror. No em dash appears in any (the legacy strings never used one).
const NOT_AUTHENTICATED = { error: 'not authenticated', code: 'auth.required' } as const;
const READ_ONLY_TOKEN = { error: 'this token is read-only', code: 'auth.forbidden' } as const;
const IMAGE_TOO_LARGE = { error: 'image too large' } as const;

// The bearer token shape: a 64-hex secret behind the "Bearer " scheme. Mirrors
// the regex the legacy bearer* resolvers in server/main.ts use.
const BEARER_PATTERN = /^Bearer ([a-f0-9]{64})$/;

// ---------------------------------------------------------------------------
// Runtime injection. registry.ts spreads the static `routes` array at module
// load, before main.ts has booted the GameServer, so the card handler cannot
// close over `game` directly (that would be a cycle: main -> registry -> wallet
// -> main). Instead main.ts injects the live level lookup once at boot via
// configureWalletRuntime; a request never arrives before that runs. It is the
// exact (characterId) => game.liveLevelForCharacter(characterId) the legacy
// /api/card arm passed to handleCardUpload.
// ---------------------------------------------------------------------------

/** The main.ts game-session hook the card handler needs (the live authoritative level). */
export interface WalletGameHooks {
  /** The live Sim level for an online character, or null when it is offline. */
  liveLevelForCharacter(characterId: number): number | null;
}

let runtime: WalletGameHooks | null = null;

/** Inject the main.ts game-session hook the card handler needs (boot). */
export function configureWalletRuntime(rt: WalletGameHooks): void {
  runtime = rt;
}

/** Clear the injected runtime so a unit test can install its own fake. */
export function resetWalletRuntimeForTests(): void {
  runtime = null;
}

/** The injected runtime, or a loud failure if a request somehow beat boot wiring. */
function useRuntime(): WalletGameHooks {
  if (runtime === null) {
    throw new Error('wallet runtime is not configured; call configureWalletRuntime');
  }
  return runtime;
}

// ---------------------------------------------------------------------------
// Db seam. The bearer-resolution reads the guard uses, bundled once behind a
// test-only setter so the guard can be driven with a fake and no Postgres.
// Production never calls the setter, so REAL_WALLET_DB is the only runtime
// binding and it references the exact functions the legacy bearerActiveAccount
// arm calls. scopeAllowsMutation is pure (no DB), so it stays a direct import.
// The card / referral domain functions keep their own direct db.ts imports
// (driven by the existing pg-mock test harnesses); this seam covers only the
// guard code.
// ---------------------------------------------------------------------------

const REAL_WALLET_DB = { accountAndScopeForToken, moderationStatusForAccount };
let walletDb = REAL_WALLET_DB;

/** Override the wallet db bundle with a fake (test-only; merges over the real reads). */
export function setWalletDbForTests(overrides: Partial<typeof REAL_WALLET_DB>): void {
  walletDb = { ...REAL_WALLET_DB, ...overrides };
}

/** Restore the real wallet db bundle after a setWalletDbForTests override (test-only). */
export function resetWalletDbForTests(): void {
  walletDb = REAL_WALLET_DB;
}

// ---------------------------------------------------------------------------
// Bearer guard. activeGuard mirrors bearerActiveAccount (full-session, read-only
// 403, moderation 403). It writes the legacy { error } bodies and short-circuits
// (no next()) on rejection; a missing/malformed bearer 401s WITHOUT a DB call (so
// the no-auth goldens replay DB-free through both dispatch paths).
// ---------------------------------------------------------------------------

/** The raw 64-hex bearer token, or null (no header or bad shape). */
function bearerToken(req: http.IncomingMessage): string | null {
  const m = BEARER_PATTERN.exec(req.headers.authorization ?? '');
  return m ? m[1] : null;
}

// FOLLOW-UP (rule-of-three, filed in docs/api-pipeline/progress.md): this activeGuard
// (with bearerToken + BEARER_PATTERN + NOT_AUTHENTICATED + READ_ONLY_TOKEN) is now the
// THIRD byte-identical copy of the bearerActiveAccount mirror, alongside
// server/characters.ts and server/account.ts. The clean resolution is a shared
// db-seam-parameterized bearer-guard middleware, but extracting it here would touch two
// already-shipped, byte-parity-pinned surfaces that also carry sibling guards (readGuard,
// logoutGuard), so it belongs in a dedicated packet step (a natural fit alongside the
// ladder-deletion follow-up PR), NOT this small migration. Do NOT add a 4th copy
// on any future surface.
/** Mutating + account-scoped gate (mirrors server/main.ts bearerActiveAccount). */
const activeGuard: Middleware = async (ctx, next) => {
  const token = bearerToken(ctx.req);
  const info = token === null ? null : await walletDb.accountAndScopeForToken(token);
  if (info === null) {
    json(ctx.res, 401, NOT_AUTHENTICATED);
    return;
  }
  if (!scopeAllowsMutation(info.scope)) {
    json(ctx.res, 403, READ_ONLY_TOKEN);
    return;
  }
  const status = await walletDb.moderationStatusForAccount(info.accountId);
  if (status.locked) {
    json(ctx.res, 403, moderationErrorBody(status));
    return;
  }
  ctx.account = { accountId: info.accountId, scope: info.scope };
  await next();
};

/**
 * Card pre-auth Content-Length gate. Mirrors the legacy /api/card arm exactly: it
 * records the publish request, and when the declared Content-Length exceeds the
 * existing MAX_CARD_BYTES cap it short-circuits 413 { error: 'image too large' }
 * with Connection: close (and shouldKeepAlive = false) BEFORE the auth guard and
 * before any body is read, so a huge upload is rejected without a DB lookup and
 * the socket is told to close rather than keep streaming. Uses the existing named
 * cap via cardUploadContentLengthTooLarge (no new literal).
 */
const cardContentLengthGuard: Middleware = async (ctx, next) => {
  recordUsageMetric('card.publish.request');
  if (cardUploadContentLengthTooLarge(ctx.req)) {
    recordUsageMetric('card.publish.rejected');
    ctx.res.shouldKeepAlive = false;
    ctx.res.setHeader('Connection', 'close');
    json(ctx.res, 413, IMAGE_TOO_LARGE);
    return;
  }
  await next();
};

// ---------------------------------------------------------------------------
// Thin Ctx handlers. Each starts after its guard chain has run, resolves the
// account from the Ctx, and delegates to the matching domain function UNCHANGED,
// so the response bytes are identical to the legacy arm.
// ---------------------------------------------------------------------------

/** POST /api/card: publish a shareable player-card PNG (binary body; self-read). */
async function cardHandler(ctx: Ctx): Promise<void> {
  return handleCardUpload(ctx.req, ctx.res, ctxAccountId(ctx), (characterId) =>
    useRuntime().liveLevelForCharacter(characterId),
  );
}

/** GET /api/referrals: the account's referral count + primary card slug. */
async function referralsHandler(ctx: Ctx): Promise<void> {
  const accountId = ctxAccountId(ctx);
  const [count, slug] = await Promise.all([
    referralCountForAccount(accountId),
    primarySlugForAccount(accountId),
  ]);
  return json(ctx.res, 200, { count, slug });
}

// ---------------------------------------------------------------------------
// The route table. registry.ts spreads this into apiRoutes. Under API_DISPATCH
// 'new' the registry dispatcher serves these via the onion; the legacy handleApi
// arms stay in main.ts for the flag-off rollback until the ladder-deletion PR.
// Both routes carry [activeGuard]. The rate-limit middleware sits AFTER
// activeGuard on card (the fused ip+account limiter needs ctx.account); the card
// route additionally runs cardContentLengthGuard FIRST (the pre-auth 413
// short-circuit).
// ---------------------------------------------------------------------------

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/card',
    surface: 'api',
    middleware: [cardContentLengthGuard, activeGuard, rateLimit(CARD_UPLOAD_POLICY)],
    handler: cardHandler,
    // The card upload is the one registered /api route whose request body is raw
    // bytes (image/png), not JSON: the Content-Type 415 gate exempts it via
    // this classification (the response error envelope stays the surface default).
    meta: { requestBody: 'binary' },
  },
  {
    method: 'GET',
    path: '/api/referrals',
    surface: 'api',
    middleware: [activeGuard],
    handler: referralsHandler,
  },
];
