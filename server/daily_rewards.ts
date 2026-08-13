import type * as http from 'node:http';
import { DELVES } from '../src/sim/data';
import type { LootTier } from '../src/sim/lockpick';
import type {
  DailyRewardHistory,
  DailyRewardLeaderboardEntry,
  DailyRewardLeaderboardPage,
  DailyRewardSpinResult,
  DailyRewardStatus,
} from '../src/world_api';
import { type CachedRead, createCachedRead } from './cached_read';
import { DailyRewardScheduleCache } from './daily_reward_schedule';
import { DAILY_REWARD_BOARD_TTL_MS, DailyRewardBoardCache } from './daily_rewards_board_cache';
import {
  type DailyRewardDb,
  type DailyRewardScoreRow,
  type DailyRewardTaskSeed,
  PgDailyRewardDb,
  REWARD_DAY_SHAPE,
} from './daily_rewards_db';
import { buildSeedKey, runSeedOnce } from './daily_rewards_seed_gate';
import { accountAndScopeForToken, moderationStatusForAccount } from './db';
import { ctxAccountId } from './http/context';
import { createActiveGuard } from './http/middleware/bearer_active_guard';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';
import { REALM } from './realm';

const DEFAULT_ACTIVE_SECONDS = 120;
const DEFAULT_DAY_START_UTC_MINUTES = 22 * 60;
const MAX_DAILY_REWARD_TASKS = 100;
const DEFAULT_CONFIG_TTL_MS = 5 * 60_000;
const DAILY_REWARD_CONFIG_TTL_MS = Number(
  process.env.WOC_DAILY_REWARD_CONFIG_TTL_MS ?? DEFAULT_CONFIG_TTL_MS,
);

// Lenient coerce-and-clamp decode defaults for the daily-rewards paginated reads
// (Number(param) || DEFAULT). These are the fallback page/limit when a query param
// is absent or non-numeric; the coercion shape is UNCHANGED, only the literal is
// named. Exported so their values are pinned by tests/server/tunables.test.ts.
export const DAILY_DEFAULT_PAGE = 0; // page index (count, zero-based)
export const DAILY_PLAYER_LEADERBOARD_PAGE_SIZE = 20; // rows per player leaderboard page (count)

const SPIN_OUTCOMES = [
  { key: 's20', points: 20, weight: 25 },
  { key: 's30', points: 30, weight: 22 },
  { key: 's40', points: 40, weight: 18 },
  { key: 's50', points: 50, weight: 14 },
  { key: 's75', points: 75, weight: 9 },
  { key: 's100', points: 100, weight: 6 },
  { key: 's150', points: 150, weight: 4 },
  { key: 's250', points: 250, weight: 2 },
] as const;

const DEFAULT_TASKS: DailyRewardTaskSeed[] = [
  {
    id: 'quest_completion',
    type: 'quest_completion',
    title: 'Complete quests',
    description: 'Complete quests today. Points increase with time spent online.',
    points: 10,
    basePoints: 10,
    sortOrder: 1,
    config: {
      minMultiplier: 1,
      maxMultiplier: 3,
      minutesPerMultiplier: 30,
    },
  },
];

interface RuntimeConfigCacheEntry {
  config: DailyRewardRuntimeConfig;
  at: number;
}

// How many distinct reward days the runtime-config cache holds at once. The
// live working set is up to four: the reward-clock day the player-facing
// status/spin paths ask for, the plain utcRewardDay() default the eligibility
// and price reads use (a DIFFERENT day inside the dayStartUtcMinutes window,
// between 00:00Z and the offset), and the winners-cache refresh's pending day
// plus its successor (often one of the former). Four covers that set; the
// bound exists so the map can never grow with arbitrary requested days. The
// map REPLACED a single-slot cache (#2791): with one slot, each winners
// refresh evicted the live day's config underneath the player-facing status
// and spin paths, forcing a re-fetch per TTL for no reason. Exported so its
// value and eviction are pinned by tests (tunables + daily_rewards_table).
export const RUNTIME_CONFIG_CACHE_DAYS = 4;

interface Eligibility {
  eligible: boolean;
  reason: 'eligible' | 'banned';
  banReason: string | null;
  banExpiresAt: string | null;
}

export interface DailyRewardRuntimeConfig {
  enabled: boolean;
  activeSeconds: number;
  dayStartUtcMinutes: number;
  tasks: DailyRewardTaskSeed[];
}

const runtimeConfigCache = new Map<string, RuntimeConfigCacheEntry>();

// Store a day's config, refreshing its insertion-order position so the bound
// always evicts the LEAST RECENTLY WRITTEN day, and cap the map.
function storeRuntimeConfig(day: string, config: DailyRewardRuntimeConfig, at: number): void {
  runtimeConfigCache.delete(day);
  runtimeConfigCache.set(day, { config, at });
  while (runtimeConfigCache.size > RUNTIME_CONFIG_CACHE_DAYS) {
    const oldest = runtimeConfigCache.keys().next().value;
    if (oldest === undefined) break;
    runtimeConfigCache.delete(oldest);
  }
}
let runtimeConfigFailureLog: { key: string; at: number } | null = null;
const dailyRewardScheduleCache = new DailyRewardScheduleCache(fetchDailyRewardSchedule, {
  ttlMs: DAILY_REWARD_CONFIG_TTL_MS,
});

export function utcRewardDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function rewardDayForDate(
  now = new Date(),
  dayStartUtcMinutes = DEFAULT_DAY_START_UTC_MINUTES,
): string {
  return new Date(now.getTime() - dayStartUtcMinutes * 60_000).toISOString().slice(0, 10);
}

export function addRewardDays(day: string, offset: number): string {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return utcRewardDay();
  return new Date(start + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRewardDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function nextUtcResetIso(
  day: string,
  dayStartUtcMinutes = DEFAULT_DAY_START_UTC_MINUTES,
): string {
  const start = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(start)
    ? new Date(start + (dayStartUtcMinutes + 24 * 60) * 60_000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

export function resetDailyRewardPriceCacheForTests(): void {
  runtimeConfigCache.clear();
  dailyRewardScheduleCache.reset();
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function finiteDayStartUtcMinutes(value: unknown): number | null {
  const minutes = finiteNonNegativeInteger(value);
  return minutes !== null && minutes < 24 * 60 ? minutes : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function objectField(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sanitizeTaskDefinition(value: unknown, index: number): DailyRewardTaskSeed | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = stringField(record, 'id');
  const type = stringField(record, 'type');
  const title = stringField(record, 'title');
  if (!id || !type || !title || !/^[a-z0-9_:-]{1,64}$/.test(id)) return null;
  const points =
    finiteNonNegativeInteger(record.points) ??
    finiteNonNegativeInteger(record.basePoints) ??
    finiteNonNegativeInteger(record.base_points) ??
    0;
  return {
    id,
    type,
    title,
    description: stringField(record, 'description') ?? '',
    points,
    basePoints:
      finiteNonNegativeInteger(record.basePoints) ??
      finiteNonNegativeInteger(record.base_points) ??
      points,
    sortOrder:
      finiteNonNegativeInteger(record.sortOrder) ??
      finiteNonNegativeInteger(record.sort_order) ??
      index + 1,
    active: record.active !== false,
    config: objectField(record, 'config'),
  };
}

function parseTaskPayload(payload: unknown): DailyRewardTaskSeed[] {
  const rawTasks = Array.isArray(payload)
    ? payload
    : payload &&
        typeof payload === 'object' &&
        Array.isArray((payload as { tasks?: unknown }).tasks)
      ? (payload as { tasks: unknown[] }).tasks
      : [];
  const tasks = rawTasks
    .slice(0, MAX_DAILY_REWARD_TASKS)
    .map((task, index) => sanitizeTaskDefinition(task, index))
    .filter((task): task is DailyRewardTaskSeed => task !== null);
  return tasks.length > 0 ? tasks : DEFAULT_TASKS;
}

function fallbackRuntimeConfig(): DailyRewardRuntimeConfig {
  return {
    enabled: true,
    activeSeconds: DEFAULT_ACTIVE_SECONDS,
    dayStartUtcMinutes: DEFAULT_DAY_START_UTC_MINUTES,
    tasks: DEFAULT_TASKS,
  };
}

function featuredDailyRewardTaskName(config: DailyRewardRuntimeConfig): string {
  const [task] = config.tasks
    .filter((candidate) => candidate.active !== false)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  return task?.title ?? DEFAULT_TASKS[0].title;
}

function parseRuntimeConfigPayload(payload: unknown): DailyRewardRuntimeConfig {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const fallback = fallbackRuntimeConfig();
  return {
    // A configured authority must affirmatively enable rewards. Older/malformed
    // service responses fail closed; the no-service local path uses fallbackRuntimeConfig.
    enabled: record.enabled === true,
    activeSeconds:
      finitePositive(record.activeSeconds) ??
      finitePositive(record.active_seconds) ??
      fallback.activeSeconds,
    dayStartUtcMinutes:
      finiteDayStartUtcMinutes(record.dayStartUtcMinutes) ??
      finiteDayStartUtcMinutes(record.day_start_utc_minutes) ??
      fallback.dayStartUtcMinutes,
    tasks: parseTaskPayload(record.tasks),
  };
}

function parseStrictRuntimeConfigPayload(
  payload: unknown,
  expectedDay: string,
): DailyRewardRuntimeConfig {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('config response must be an object');
  }
  const record = payload as Record<string, unknown>;
  if (record.day !== expectedDay) throw new Error('config response day did not match request');

  const activeSeconds = finitePositive(record.activeSeconds);
  const dayStartUtcMinutes = finiteDayStartUtcMinutes(record.dayStartUtcMinutes);
  if (
    typeof record.enabled !== 'boolean' ||
    activeSeconds === null ||
    dayStartUtcMinutes === null
  ) {
    throw new Error('config response contained invalid required fields');
  }
  if (!Array.isArray(record.tasks) || record.tasks.length === 0) {
    throw new Error('config response contained no task definitions');
  }
  if (record.tasks.length > MAX_DAILY_REWARD_TASKS) {
    throw new Error('config response contained too many task definitions');
  }
  const tasks = record.tasks.map((task, index) => sanitizeTaskDefinition(task, index));
  if (tasks.some((task) => task === null)) {
    throw new Error('config response contained an invalid task definition');
  }

  return {
    enabled: record.enabled,
    activeSeconds,
    dayStartUtcMinutes,
    tasks: tasks as DailyRewardTaskSeed[],
  };
}

function dailyRewardServiceSecret(): string {
  // Dedicated secret only: never fall back to RESTART_COUNTDOWN_SECRET. That is an
  // unrelated ops secret, and this one authenticates the game server to the daily
  // reward task-config service.
  return process.env.WOC_DAILY_REWARD_SERVICE_SECRET ?? '';
}

function dailyRewardServiceUrl(): string {
  return (process.env.WOC_DAILY_REWARD_SERVICE_URL ?? '').trim();
}

function dailyRewardServiceHeaders(): Record<string, string> {
  const secret = dailyRewardServiceSecret();
  return secret ? { 'x-woc-daily-reward-secret': secret } : {};
}

function runtimeConfigFailureMessage(err: unknown): string {
  if (err instanceof Error && 'cause' in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'code' in cause) {
      const code = String((cause as { code?: unknown }).code ?? '');
      if (code === 'ECONNREFUSED') {
        return 'daily reward config service is not reachable, start or restart it';
      }
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('401')) {
    return 'daily reward config service rejected the shared secret, check WOC_DAILY_REWARD_SERVICE_SECRET';
  }
  if (message.includes('405')) {
    return 'daily reward config service does not expose GET /daily-config, restart it with the latest service code';
  }
  return message;
}

function logRuntimeConfigFailure(err: unknown): void {
  const message = runtimeConfigFailureMessage(err);
  const now = Date.now();
  if (
    runtimeConfigFailureLog &&
    runtimeConfigFailureLog.key === message &&
    now - runtimeConfigFailureLog.at < 60_000
  ) {
    return;
  }
  runtimeConfigFailureLog = { key: message, at: now };
  console.warn(`[daily-rewards] using fallback config: ${message}`);
}

async function fetchDailyRewardSchedule(): Promise<number> {
  const serviceUrl = dailyRewardServiceUrl();
  if (!serviceUrl) return DEFAULT_DAY_START_UTC_MINUTES;
  const url = new URL('/daily-schedule', serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`);
  const res = await fetch(url, {
    headers: dailyRewardServiceHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`schedule request failed: ${res.status}`);
  const payload = (await res.json()) as Record<string, unknown>;
  const minutes = finiteDayStartUtcMinutes(payload.dayStartUtcMinutes);
  if (minutes === null) throw new Error('schedule response contained an invalid day start');
  return minutes;
}

async function fetchDailyRewardRuntimeConfig(
  day: string,
  strict = false,
): Promise<DailyRewardRuntimeConfig> {
  const serviceUrl = dailyRewardServiceUrl();
  if (!serviceUrl) return fallbackRuntimeConfig();
  const url = new URL('/daily-config', serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`);
  url.searchParams.set('day', day);
  const res = await fetch(url, {
    headers: dailyRewardServiceHeaders(),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`config request failed: ${res.status}`);
  const payload = await res.json();
  return strict
    ? parseStrictRuntimeConfigPayload(payload, day)
    : parseRuntimeConfigPayload(payload);
}

export async function dailyRewardRuntimeConfig(
  day = utcRewardDay(),
  requireFresh = false,
): Promise<DailyRewardRuntimeConfig> {
  const now = Date.now();
  const cached = runtimeConfigCache.get(day);
  if (!requireFresh && cached && now - cached.at < DAILY_REWARD_CONFIG_TTL_MS) {
    return cached.config;
  }
  try {
    const config = await fetchDailyRewardRuntimeConfig(day, requireFresh);
    storeRuntimeConfig(day, config, now);
    return config;
  } catch (err) {
    if (requireFresh) throw err;
    logRuntimeConfigFailure(err);
    if (dailyRewardServiceUrl()) {
      const config = { ...fallbackRuntimeConfig(), enabled: false };
      storeRuntimeConfig(day, config, now);
      return config;
    }
    return fallbackRuntimeConfig();
  }
}

async function dailyRewardClock(now = new Date()): Promise<{
  day: string;
  config: DailyRewardRuntimeConfig;
}> {
  let dayStartUtcMinutes: number;
  try {
    dayStartUtcMinutes = await dailyRewardScheduleCache.read();
  } catch (error) {
    if (!dailyRewardServiceUrl()) throw error;
    logRuntimeConfigFailure(error);
    dayStartUtcMinutes = DEFAULT_DAY_START_UTC_MINUTES;
  }
  const day = rewardDayForDate(now, dayStartUtcMinutes);
  const config = await dailyRewardRuntimeConfig(day);
  return { day, config: { ...config, dayStartUtcMinutes } };
}

export async function currentDailyRewardDay(now = new Date()): Promise<string> {
  return (await dailyRewardClock(now)).day;
}

// Single-slot memo for dailyRewardEventsCutoffDay, keyed on (UTC day, clamped
// retention). Resolving the current reward day can require schedule and config
// requests, so a catch-up sweep must not repeat that work for every batch. The
// key uses the plain UTC day, never the reward day: resolving the reward day is
// exactly the work being avoided.
let cutoffMemo: { utcDay: string; days: number; cutoff: string } | null = null;

export function resetDailyRewardEventsCutoffMemoForTests(): void {
  cutoffMemo = null;
}

// The pure cutoff derivation, split out so the fail-closed arm is directly
// testable. FAIL CLOSED on a malformed anchor day: addRewardDays' fallback for
// an unparseable day string is TODAY, which passes the prune's own
// REWARD_DAY_SHAPE guard and would turn a parse failure into a cutoff that
// deletes the entire ledger before today. currentDailyRewardDay cannot emit
// such a value today (its days are toISOString-derived), so this is
// defense-in-depth on an irreversible delete path, not a live-bug fix.
export function dailyRewardEventsCutoffFromAnchor(anchorDay: string, days: number): string | null {
  if (!REWARD_DAY_SHAPE.test(anchorDay)) return null;
  return addRewardDays(anchorDay, -days);
}

// The retention cutoff for the daily_reward_events ledger, as a reward-clock day
// string, or null when retention is off (0 or negative = keep forever). Fractional
// values clamp to at least one day: 0.5 must never floor to a cutoff of "today",
// which would delete the entire ledger before today. The cutoff must come from the
// reward clock (the day boundary sits at a configured UTC offset, not midnight),
// which is why this lives here and not in the sweep wiring.
export async function dailyRewardEventsCutoffDay(
  retentionDays: number,
  now = new Date(),
): Promise<string | null> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  const days = Math.max(1, Math.floor(retentionDays));
  const utcDay = utcRewardDay(now);
  if (cutoffMemo && cutoffMemo.utcDay === utcDay && cutoffMemo.days === days) {
    return cutoffMemo.cutoff;
  }
  const cutoff = dailyRewardEventsCutoffFromAnchor(await currentDailyRewardDay(now), days);
  if (cutoff === null) return null; // malformed anchor: keep the ledger, cache nothing
  cutoffMemo = { utcDay, days, cutoff };
  return cutoff;
}

// The daily reward is a plain daily login reward: the only thing that can lock a
// player out of it is a participation ban (server/moderation_db.ts writes those;
// this reads them). Everyone else is eligible.
export async function dailyRewardEligibility(accountId: number): Promise<Eligibility> {
  const ban = await new PgDailyRewardDb().banForAccount(accountId);
  return ban
    ? {
        eligible: false,
        reason: 'banned',
        banReason: ban.reason,
        banExpiresAt: ban.expiresAt,
      }
    : { eligible: true, reason: 'eligible', banReason: null, banExpiresAt: null };
}

function pickSpinOutcome(seed = Math.random()): (typeof SPIN_OUTCOMES)[number] {
  const total = SPIN_OUTCOMES.reduce((sum, outcome) => sum + outcome.weight, 0);
  let roll = Math.max(0, Math.min(0.999999, seed)) * total;
  for (const outcome of SPIN_OUTCOMES) {
    roll -= outcome.weight;
    if (roll <= 0) return outcome;
  }
  return SPIN_OUTCOMES[SPIN_OUTCOMES.length - 1];
}

function leaderboardView(
  rows: DailyRewardScoreRow[],
  accountId: number | null,
): DailyRewardLeaderboardEntry[] {
  return rows.map((row) => ({
    rank: row.rank,
    name: row.username,
    points: row.points,
    me: accountId !== null && row.accountId === accountId,
  }));
}

function numberConfig(config: Record<string, unknown>, key: string, fallback: number): number {
  const value = finitePositive(config[key]);
  return value ?? fallback;
}

function questCompletionPoints(
  task:
    | DailyRewardTaskSeed
    | { points: number; basePoints: number; config: Record<string, unknown> },
  onlineMinutes: number,
): {
  points: number;
  multiplier: number;
} {
  const basePoints = task.basePoints ?? task.points;
  const minMultiplier = numberConfig(task.config ?? {}, 'minMultiplier', 1);
  const maxMultiplier = Math.max(
    minMultiplier,
    numberConfig(task.config ?? {}, 'maxMultiplier', 3),
  );
  const minutesPerMultiplier = numberConfig(task.config ?? {}, 'minutesPerMultiplier', 30);
  const multiplier = Math.min(
    maxMultiplier,
    minMultiplier + Math.floor(Math.max(0, onlineMinutes) / minutesPerMultiplier),
  );
  return { points: Math.max(0, Math.floor(basePoints * multiplier)), multiplier };
}

function repeatQuestPoints(points: number, priorCompletions: number): number {
  if (points <= 0) return 0;
  return Math.max(1, Math.floor(points / 2 ** Math.max(0, priorCompletions)));
}

function onlineMultiplierPoints(
  basePoints: number,
  config: Record<string, unknown>,
  onlineMinutes: number,
): {
  points: number;
  multiplier: number;
} {
  const minMultiplier = numberConfig(config, 'minMultiplier', 1);
  const maxMultiplier = Math.max(minMultiplier, numberConfig(config, 'maxMultiplier', 3));
  const minutesPerMultiplier = numberConfig(config, 'minutesPerMultiplier', 30);
  const multiplier = Math.min(
    maxMultiplier,
    minMultiplier + Math.floor(Math.max(0, onlineMinutes) / minutesPerMultiplier),
  );
  return { points: Math.max(0, Math.floor(basePoints * multiplier)), multiplier };
}

function delveClearPoints(
  task: { points: number; basePoints: number; config: Record<string, unknown> },
  delveId: string,
  tierId: string,
  onlineMinutes: number,
): {
  points: number;
  multiplier: number;
  baseClearPoints: number;
  levelBonus: number;
  tierMultiplier: number;
  preOnlinePoints: number;
} | null {
  const delve = DELVES[delveId];
  if (!delve?.tiers.some((tier) => tier.id === tierId)) return null;
  const taskConfig = task.config ?? {};
  const baseClearPoints = numberConfig(
    taskConfig,
    'baseClearPoints',
    task.basePoints ?? task.points,
  );
  const levelBaseline = numberConfig(taskConfig, 'levelBaseline', 7);
  const pointsPerLevel = numberConfig(taskConfig, 'pointsPerLevel', 1);
  const normalTierMultiplier = numberConfig(taskConfig, 'normalTierMultiplier', 1);
  const heroicTierMultiplier = numberConfig(taskConfig, 'heroicTierMultiplier', 1.5);
  const tierMultiplier = tierId === 'heroic' ? heroicTierMultiplier : normalTierMultiplier;
  const levelBonus = Math.max(0, delve.minLevel - levelBaseline) * pointsPerLevel;
  const preOnlinePoints = Math.max(0, Math.floor((baseClearPoints + levelBonus) * tierMultiplier));
  const { points, multiplier } = onlineMultiplierPoints(preOnlinePoints, taskConfig, onlineMinutes);
  return {
    points,
    multiplier,
    baseClearPoints,
    levelBonus,
    tierMultiplier,
    preOnlinePoints,
  };
}

function delveChestOpenPoints(
  task: { config: Record<string, unknown> },
  chestTier: LootTier,
  bountiful: boolean,
  onlineMinutes: number,
): {
  points: number;
  multiplier: number;
  chestBasePoints: number;
  chestTier: LootTier;
  bountifulMultiplier: number;
  preOnlinePoints: number;
} | null {
  const taskConfig = task.config ?? {};
  const chestBasePoints =
    chestTier === 'premium'
      ? numberConfig(taskConfig, 'premiumChestPoints', 20)
      : chestTier === 'medium'
        ? numberConfig(taskConfig, 'mediumChestPoints', 10)
        : chestTier === 'low'
          ? numberConfig(taskConfig, 'lowChestPoints', 5)
          : null;
  if (chestBasePoints === null) return null;
  const bountifulMultiplier = bountiful
    ? numberConfig(taskConfig, 'bountifulChestMultiplier', 1.5)
    : 1;
  const preOnlinePoints = Math.max(0, Math.floor(chestBasePoints * bountifulMultiplier));
  const { points, multiplier } = onlineMultiplierPoints(preOnlinePoints, taskConfig, onlineMinutes);
  return {
    points,
    multiplier,
    chestBasePoints,
    chestTier,
    bountifulMultiplier,
    preOnlinePoints,
  };
}

function currentTaskMultiplier(
  task: { type: string; points: number; basePoints: number; config: Record<string, unknown> },
  onlineMinutes: number,
): number | null {
  if (task.type === 'quest_completion')
    return questCompletionPoints(task, onlineMinutes).multiplier;
  if (task.type === 'arena_result' || task.type === 'vale_cup_result')
    return onlineMultiplierPoints(task.basePoints ?? task.points, task.config ?? {}, onlineMinutes)
      .multiplier;
  if (task.type === 'delve_clear')
    return onlineMultiplierPoints(task.basePoints ?? task.points, task.config ?? {}, onlineMinutes)
      .multiplier;
  return null;
}

export class DailyRewardService {
  constructor(private readonly db: DailyRewardDb = new PgDailyRewardDb()) {}

  // One ranked snapshot per TTL window serves the four board reads status()
  // assembles; every board-changing write below busts it (see recordPoints
  // and spin), and main.ts busts it from the moderation hook.
  private readonly boardCache = new DailyRewardBoardCache(
    (day) => this.db.leaderboardSnapshot(day),
    { ttlMs: DAILY_REWARD_BOARD_TTL_MS },
  );

  private async eligibility(accountId: number): Promise<Eligibility> {
    const ban = await this.db.banForAccount(accountId);
    return ban
      ? {
          eligible: false,
          reason: 'banned',
          banReason: ban.reason,
          banExpiresAt: ban.expiresAt,
        }
      : { eligible: true, reason: 'eligible', banReason: null, banExpiresAt: null };
  }

  async activeSeconds(day?: string): Promise<number> {
    if (day) return (await dailyRewardRuntimeConfig(day)).activeSeconds;
    return (await dailyRewardClock()).config.activeSeconds;
  }

  // The single seed path every method funnels through. The seed gate runs the
  // ensureDay + seedTasks write pair at most once per (day, realm, config) key,
  // so status, spin, recordOnlineMinute and the five gameplay recorders all
  // share one gate per day instead of each re-issuing the pair on every call.
  private async ensureSeeded(day: string, config: DailyRewardRuntimeConfig): Promise<void> {
    await runSeedOnce(buildSeedKey(day, REALM, config), async () => {
      await this.db.ensureDay(day);
      await this.db.seedTasks(day, config.tasks);
    });
  }

  async ensureActiveDay(day = utcRewardDay()): Promise<DailyRewardRuntimeConfig> {
    const config = await dailyRewardRuntimeConfig(day);
    if (config.enabled) await this.ensureSeeded(day, config);
    return config;
  }

  async status(accountId: number): Promise<DailyRewardStatus> {
    const { day, config } = await dailyRewardClock();
    if (!config.enabled) {
      return {
        enabled: false,
        day,
        resetAt: nextUtcResetIso(day, config.dayStartUtcMinutes),
        // The DAY is off, not the player: nothing is locked to them personally,
        // and `enabled: false` above is what the window reads to say so.
        eligibility: {
          eligible: false,
          reason: 'eligible',
          banReason: null,
          banExpiresAt: null,
        },
        score: 0,
        rank: null,
        spin: { claimed: false, points: null, outcomeKey: null, claimedAt: null },
        tasks: [],
        leaderboard: [],
        leaderboardTotal: 0,
      };
    }
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    // The four ranked reads come from the board cache (one snapshot per TTL
    // window); the per-account reads stay live on the db.
    const [score, rank, spin, tasks, leaders, leaderboardTotal, onlineMinutes] = await Promise.all([
      this.db.scoreForAccount(day, accountId),
      this.boardCache.rankForAccount(day, accountId),
      this.db.spinForAccount(day, accountId),
      this.db.tasksForAccount(day, accountId),
      this.boardCache.leaderboard(day, 10),
      this.boardCache.leaderboardTotal(day),
      this.db.onlineMinutesForAccount(day, accountId),
    ]);
    const leaderboardRows = [...leaders];
    if (rank !== null && rank > 10) {
      const viewerRow = await this.boardCache.leaderboardRowForAccount(day, accountId);
      if (viewerRow) leaderboardRows.push(viewerRow);
    }
    return {
      enabled: true,
      day,
      resetAt: nextUtcResetIso(day, config.dayStartUtcMinutes),
      eligibility,
      score,
      rank,
      spin: spin
        ? {
            claimed: true,
            points: spin.points,
            outcomeKey: spin.outcomeKey,
            claimedAt: spin.createdAt,
          }
        : { claimed: false, points: null, outcomeKey: null, claimedAt: null },
      tasks: tasks.map((task) => ({
        ...task,
        id: task.taskId,
        multiplier: currentTaskMultiplier(task, onlineMinutes),
        locked: !eligibility.eligible,
      })),
      leaderboard: leaderboardView(leaderboardRows, accountId),
      leaderboardTotal,
    };
  }

  // Deliberately a live db read, never the board cache: both the player and
  // ops arms page beyond the cached top slice and tolerate no cache-page drift.
  async leaderboardPage(
    day: string,
    page: number,
    pageSize: number,
    accountId: number | null = null,
  ): Promise<DailyRewardLeaderboardPage> {
    const pageData = await this.db.leaderboardPage(day, page, pageSize);
    return {
      day,
      leaders: leaderboardView(pageData.rows, accountId),
      page: pageData.page,
      pageSize: pageData.pageSize,
      pageCount: pageData.pageCount,
      total: pageData.total,
    };
  }

  async spin(
    accountId: number,
  ): Promise<DailyRewardSpinResult | { error: string; status: number }> {
    const { day, config } = await dailyRewardClock();
    if (!config.enabled) return { error: 'daily rewards are disabled', status: 409 };
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible)
      return { error: 'daily rewards are locked for this account', status: 403 };
    const existing = await this.db.spinForAccount(day, accountId);
    if (existing) return { error: 'daily spin already claimed', status: 409 };
    const outcome = pickSpinOutcome();
    const recorded = await this.db.recordSpin(day, accountId, outcome.key, outcome.points);
    if (!recorded) return { error: 'daily spin already claimed', status: 409 };
    // recordSpin atomically records both the claim and its score while holding
    // the open-day lock, so finalization can never land between those writes.
    this.boardCache.bust();
    const status = await this.status(accountId);
    return { ...status, awardedPoints: outcome.points, outcomeKey: outcome.key };
  }

  // The one point-event write path: every recorder funnels through here so
  // the board cache is busted exactly when the ranked board could have
  // changed. The two guards: a duplicate event (recorded false) wrote
  // nothing, and a non-positive event (recordOnlineMinute's zero-point
  // per-minute marker) never changes the ranked board (every ranked read
  // filters points > 0). If a negative-point clawback is ever added it could
  // lower a still-ranked row, so widen the guard to points !== 0 with it.
  private async recordPoints(
    day: string,
    accountId: number,
    kind: string,
    points: number,
    idempotencyKey: string,
    meta?: Record<string, unknown>,
  ): Promise<boolean> {
    const recorded = await this.db.addPoints(day, accountId, kind, points, idempotencyKey, meta);
    if (recorded && points > 0) this.boardCache.bust();
    return recorded;
  }

  /** Drop the in-process board snapshot so the next ranked read refreshes. */
  bustBoardCache(): void {
    this.boardCache.bust();
  }

  /** Board-cache refresh telemetry for the metrics surface (unwired for now). */
  boardCacheStats(): { refreshes: number; lastRefreshMs: number | null } {
    return this.boardCache.stats();
  }

  async recordOnlineMinute(accountId: number, activeAt: Date = new Date()): Promise<void> {
    const { day, config } = await dailyRewardClock(activeAt);
    if (!config.enabled) return;
    await this.ensureSeeded(day, config);
    const minute = activeAt.toISOString().slice(0, 16);
    await this.recordPoints(day, accountId, 'online', 0, `online:${minute}`, {
      minute,
    });
  }

  async recordQuestCompletion(
    accountId: number,
    characterId: number | null,
    questId: string,
    completedAt: Date = new Date(),
  ): Promise<number> {
    if (!questId) return 0;
    const { day, config } = await dailyRewardClock(completedAt);
    if (!config.enabled) return 0;
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible) return 0;
    const tasks = await this.db.tasksForType(day, 'quest_completion');
    if (tasks.length === 0) return 0;
    const onlineMinutes = await this.db.onlineMinutesForAccount(day, accountId);
    let awardedPoints = 0;
    for (const task of tasks) {
      const { points, multiplier } = questCompletionPoints(task, onlineMinutes);
      if (points <= 0) continue;
      const priorCompletions = await this.db.questTaskCompletionCount(
        day,
        accountId,
        task.taskId,
        questId,
      );
      const awarded = repeatQuestPoints(points, priorCompletions);
      const recorded = await this.recordPoints(
        day,
        accountId,
        'task',
        awarded,
        `task:${task.taskId}:quest:${questId}:character:${characterId ?? 'account'}`,
        {
          taskId: task.taskId,
          taskType: task.type,
          questId,
          characterId,
          onlineMinutes,
          multiplier,
          basePoints: task.basePoints,
          undiscountedPoints: points,
          repeatIndex: priorCompletions,
        },
      );
      if (recorded) awardedPoints += awarded;
    }
    return awardedPoints;
  }

  async recordArenaResult(
    accountId: number,
    result: {
      won: boolean;
      format: string;
      ratingBefore: number;
      ratingAfter: number;
      completedAt?: Date;
    },
  ): Promise<number> {
    // One-player teams are too easy to coordinate for daily-reward scoring.
    // Protect Yumi (yumi3/yumi5) is also an unranked objective mode. Fiesta
    // keeps its historical counting behavior.
    if (result.format === '1v1' || result.format === 'yumi3' || result.format === 'yumi5') return 0;
    const completedAt = result.completedAt ?? new Date();
    const { day, config } = await dailyRewardClock(completedAt);
    if (!config.enabled) return 0;
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible) return 0;
    const tasks = await this.db.tasksForType(day, 'arena_result');
    if (tasks.length === 0) return 0;
    const onlineMinutes = await this.db.onlineMinutesForAccount(day, accountId);
    let awardedPoints = 0;
    for (const task of tasks) {
      const taskConfig = task.config ?? {};
      const basePoints = result.won
        ? numberConfig(taskConfig, 'winBasePoints', task.basePoints ?? task.points)
        : numberConfig(taskConfig, 'lossBasePoints', 10);
      const { points, multiplier } = onlineMultiplierPoints(basePoints, taskConfig, onlineMinutes);
      if (points <= 0) continue;
      const recorded = await this.recordPoints(
        day,
        accountId,
        'task',
        points,
        `task:${task.taskId}:arena:${result.format}:${result.won ? 'win' : 'loss'}:${completedAt.toISOString()}:${result.ratingBefore}:${result.ratingAfter}`,
        {
          taskId: task.taskId,
          taskType: task.type,
          format: result.format,
          won: result.won,
          onlineMinutes,
          multiplier,
          basePoints,
          ratingBefore: result.ratingBefore,
          ratingAfter: result.ratingAfter,
        },
      );
      if (recorded) awardedPoints += points;
    }
    return awardedPoints;
  }

  async recordDelveClear(
    accountId: number,
    characterId: number | null,
    delveId: string,
    tierId: string,
    completedAt: Date = new Date(),
  ): Promise<number> {
    if (!DELVES[delveId]) return 0;
    const { day, config } = await dailyRewardClock(completedAt);
    if (!config.enabled) return 0;
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible) return 0;
    const tasks = await this.db.tasksForType(day, 'delve_clear');
    if (tasks.length === 0) return 0;
    const onlineMinutes = await this.db.onlineMinutesForAccount(day, accountId);
    let awardedPoints = 0;
    for (const task of tasks) {
      const clearPoints = delveClearPoints(task, delveId, tierId, onlineMinutes);
      if (!clearPoints || clearPoints.points <= 0) continue;
      const recorded = await this.recordPoints(
        day,
        accountId,
        'task',
        clearPoints.points,
        `task:${task.taskId}:delve:${delveId}:${tierId}:character:${characterId ?? 'account'}:${completedAt.toISOString()}`,
        {
          taskId: task.taskId,
          taskType: task.type,
          delveId,
          tierId,
          characterId,
          onlineMinutes,
          multiplier: clearPoints.multiplier,
          baseClearPoints: clearPoints.baseClearPoints,
          levelBonus: clearPoints.levelBonus,
          tierMultiplier: clearPoints.tierMultiplier,
          preOnlinePoints: clearPoints.preOnlinePoints,
        },
      );
      if (recorded) awardedPoints += clearPoints.points;
    }
    return awardedPoints;
  }

  async recordDelveChestOpen(
    accountId: number,
    characterId: number | null,
    delveId: string,
    tierId: string,
    chestTier: LootTier,
    bountiful: boolean,
    openedAt: Date = new Date(),
  ): Promise<number> {
    if (!DELVES[delveId]) return 0;
    const { day, config } = await dailyRewardClock(openedAt);
    if (!config.enabled) return 0;
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible) return 0;
    const tasks = await this.db.tasksForType(day, 'delve_clear');
    if (tasks.length === 0) return 0;
    const onlineMinutes = await this.db.onlineMinutesForAccount(day, accountId);
    let awardedPoints = 0;
    for (const task of tasks) {
      const chestPoints = delveChestOpenPoints(task, chestTier, bountiful, onlineMinutes);
      if (!chestPoints || chestPoints.points <= 0) continue;
      const recorded = await this.recordPoints(
        day,
        accountId,
        'task',
        chestPoints.points,
        `task:${task.taskId}:delve_chest:${delveId}:${tierId}:${chestTier}:${bountiful ? 'bountiful' : 'standard'}:character:${characterId ?? 'account'}:${openedAt.toISOString()}`,
        {
          taskId: task.taskId,
          taskType: task.type,
          bonusType: 'delve_chest',
          delveId,
          tierId,
          characterId,
          chestTier: chestPoints.chestTier,
          bountiful,
          onlineMinutes,
          multiplier: chestPoints.multiplier,
          chestBasePoints: chestPoints.chestBasePoints,
          bountifulMultiplier: chestPoints.bountifulMultiplier,
          preOnlinePoints: chestPoints.preOnlinePoints,
        },
      );
      if (recorded) awardedPoints += chestPoints.points;
    }
    return awardedPoints;
  }

  // Vale Cup daily task: wins only. Rated wins use the full task value; bot-filled
  // and practice wins use a much smaller base so they can contribute without competing
  // with real ranked match rewards. The GameServer supplies one UUID and completion time
  // per live match object, so every winner and retry shares an identity while a restarted
  // server gets a fresh identity even when the sim reuses its in-memory numeric match id.
  async recordValeCupResult(
    accountId: number,
    result: {
      won: boolean;
      bracket: number;
      matchId: number;
      rated?: boolean;
      hasBots?: boolean;
      practice?: boolean;
      completionId?: string;
      completedAt: Date;
    },
  ): Promise<number> {
    if (result.bracket === 1) return 0;
    if (!result.won) return 0;
    if (result.rated === false && result.hasBots !== true && result.practice !== true) return 0;
    const completedAt = result.completedAt;
    const completedAtIso = completedAt.toISOString();
    const completionId = result.completionId?.trim() || null;
    const { day, config } = await dailyRewardClock(completedAt);
    if (!config.enabled) return 0;
    await this.ensureSeeded(day, config);
    const eligibility = await this.eligibility(accountId);
    if (!eligibility.eligible) return 0;
    const tasks = await this.db.tasksForType(day, 'vale_cup_result');
    if (tasks.length === 0) return 0;
    const onlineMinutes = await this.db.onlineMinutesForAccount(day, accountId);
    let awardedPoints = 0;
    for (const task of tasks) {
      const taskConfig = task.config ?? {};
      const rankedBasePoints = numberConfig(
        taskConfig,
        'winBasePoints',
        task.basePoints ?? task.points,
      );
      const botFallbackPoints = Math.max(1, Math.floor(rankedBasePoints * 0.2));
      const reducedMatch = result.hasBots === true || result.practice === true;
      const basePoints = reducedMatch
        ? numberConfig(taskConfig, 'botWinBasePoints', botFallbackPoints)
        : rankedBasePoints;
      const { points, multiplier } = onlineMultiplierPoints(basePoints, taskConfig, onlineMinutes);
      if (points <= 0) continue;
      const outcomeKey =
        result.practice === true ? 'practice_win' : reducedMatch ? 'bot_win' : 'win';
      const recorded = await this.recordPoints(
        day,
        accountId,
        'task',
        points,
        `task:${task.taskId}:vale_cup:${result.matchId}:${outcomeKey}:${completionId ?? completedAtIso}`,
        {
          taskId: task.taskId,
          taskType: task.type,
          bracket: result.bracket,
          matchId: result.matchId,
          completionId,
          completedAt: completedAtIso,
          won: true,
          matchType: result.practice === true ? 'practice' : reducedMatch ? 'bot' : 'ranked',
          rated: result.rated !== false,
          hasBots: result.hasBots === true,
          practice: result.practice === true,
          onlineMinutes,
          multiplier,
          basePoints,
        },
      );
      if (recorded) awardedPoints += points;
    }
    return awardedPoints;
  }

  // Past winners. The reward has no prize ledger any more (it is a plain daily
  // login reward), so there is nothing behind this yet and it answers empty.
  // The route and the shape stay so the window keeps its section and a future
  // past-day board has somewhere to land.
  async history(): Promise<DailyRewardHistory> {
    return { payouts: [] };
  }
}

export const dailyRewardService = new DailyRewardService();

// main.ts wires this into bustBoardCaches: the board cache is instance-scoped
// on the module singleton above, so a bust exported from the cache module
// itself would hold no handle to the live instance.
export function bustDailyRewardBoardCache(): void {
  dailyRewardService.bustBoardCache();
}

export async function handleDailyRewardApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  accountId: number,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/daily-rewards') {
    return json(res, 200, await dailyRewardService.status(accountId));
  }
  if (req.method === 'GET' && url.pathname === '/api/daily-rewards/leaderboard') {
    const { day } = await dailyRewardClock();
    return json(
      res,
      200,
      await dailyRewardService.leaderboardPage(
        day,
        Number(url.searchParams.get('page')) || DAILY_DEFAULT_PAGE,
        Number(url.searchParams.get('pageSize')) || DAILY_PLAYER_LEADERBOARD_PAGE_SIZE,
        accountId,
      ),
    );
  }
  if (req.method === 'POST' && url.pathname === '/api/daily-rewards/spin') {
    const result = await dailyRewardService.spin(accountId);
    if ('error' in result) return json(res, result.status, { error: result.error });
    return json(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/daily-rewards/history') {
    return json(res, 200, await dailyRewardService.history());
  }
  return json(res, 404, { error: 'unknown endpoint' });
}

// ── Route layer ────────────────────────────
// The daily-rewards player family as RouteDefs for the shared dispatcher:
//   GET  /api/daily-rewards                        player status (JSON)
//   GET  /api/daily-rewards/leaderboard            paginated daily leaderboard (JSON)
//   POST /api/daily-rewards/spin                   player spin (JSON)
//   GET  /api/daily-rewards/history                past winners (JSON)
// The legacy dispatch stays as the flag-off rollback path until the ladder-deletion PR:
// the main.ts prefix arm (startsWith('/api/daily-rewards'), bearerActiveAccount
// BEFORE delegating).
//
// PARITY-FIRST BY CONSTRUCTION: each thin handler calls the SAME sub-dispatcher
// the ladder serves (handleDailyRewardApi) UNCHANGED, so every body, the
// in-family 404 'unknown endpoint', and the lenient Number(...)|| page decodes
// are byte-identical with zero dual-edit drift. No withBody anywhere: these
// four reads are body-free. Off-table shapes (wrong method, unknown subpath,
// the no-slash '/api/daily-rewardsX' sibling, HEAD) resolve unmatched and
// delegate to the ladder unchanged.
//
// The player guard is the shared legacy-body createActiveGuard (mirrors the
// prefix arm's bearerActiveAccount byte-for-byte).
// dailyRewardService stays module-owned and importable by game.ts regardless of
// route-table state; no boot injection is needed.

// The bearer + moderation reads the player guard needs. Built LAZILY (a
// function, not a module-scope object literal): game.ts imports this module, so
// an eager literal would break every test that partial-mocks server/db and
// loads the game (the lazy-db-bundle rule).
function makeRealDailyRewardDb() {
  return { accountAndScopeForToken, moderationStatusForAccount };
}
type DailyRewardGuardDb = ReturnType<typeof makeRealDailyRewardDb>;
let realDailyRewardDb: DailyRewardGuardDb | undefined;
let dailyRewardDbOverride: DailyRewardGuardDb | undefined;
function dailyRewardGuardDb(): DailyRewardGuardDb {
  if (dailyRewardDbOverride) return dailyRewardDbOverride;
  realDailyRewardDb ??= makeRealDailyRewardDb();
  return realDailyRewardDb;
}

/** Override the guard db with a fake (test-only; merges over the real reads). */
export function setDailyRewardDbForTests(overrides: Partial<DailyRewardGuardDb>): void {
  realDailyRewardDb ??= makeRealDailyRewardDb();
  dailyRewardDbOverride = { ...realDailyRewardDb, ...overrides };
}

/** Restore the real guard db after a setDailyRewardDbForTests override (test-only). */
export function resetDailyRewardDbForTests(): void {
  dailyRewardDbOverride = undefined;
}

/** Full active session gate (mirrors the prefix arm's bearerActiveAccount). */
const activeGuard = createActiveGuard(() => dailyRewardGuardDb());
/** A player route: the guard resolved the account; the shared core dispatches. */
async function dailyRewardPlayerHandler(ctx: Ctx): Promise<void> {
  return handleDailyRewardApi(ctx.req, ctx.res, ctxAccountId(ctx));
}

// The route table. registry.ts spreads this into apiRoutes.
export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/daily-rewards',
    surface: 'api',
    middleware: [activeGuard],
    handler: dailyRewardPlayerHandler,
  },
  {
    method: 'GET',
    path: '/api/daily-rewards/leaderboard',
    surface: 'api',
    middleware: [activeGuard],
    handler: dailyRewardPlayerHandler,
  },
  {
    method: 'POST',
    path: '/api/daily-rewards/spin',
    surface: 'api',
    middleware: [activeGuard],
    handler: dailyRewardPlayerHandler,
  },
  {
    method: 'GET',
    path: '/api/daily-rewards/history',
    surface: 'api',
    middleware: [activeGuard],
    handler: dailyRewardPlayerHandler,
  },
];
