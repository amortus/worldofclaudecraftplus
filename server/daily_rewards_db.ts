import { ELIGIBLE_ACCOUNT_SQL, pool } from './db';
import { REALM } from './realm';

// Every ranked read below embeds ELIGIBLE_ACCOUNT_SQL: banned and suspended
// accounts are delisted from the daily board (and stop inflating other
// players' ranks) the same way as every other public board. All the ranked
// reads share the predicate so the page, the total, and the self rank always
// agree on one population. PgDailyRewardDb itself stays uncached; the caching
// seam is daily_rewards_board_cache.ts, which derives all four board reads a
// player status assembles (the leaderboard top slice, the board total, the
// viewer's rank, and the beyond-top-10 viewer row) from one TTL-cached
// ranked snapshot (leaderboardSnapshot below), busted in-process on every
// board-changing write and by the moderation hook, so in-process delisting
// stays immediate while cross-process staleness is bounded by the cache TTL
// (the same tradeoff the other public boards made in main.ts). The per-read
// ranked SQL those derivations replaced is deliberately DELETED, not
// retained: a revert to direct per-status db reads must reintroduce the
// queries consciously instead of quietly rebinding to leftovers.
// leaderboardPage stays always-live SQL: the paged read tolerates no staleness.

export interface DailyRewardTaskRow {
  taskId: string;
  type: string;
  title: string;
  description: string;
  points: number;
  basePoints: number;
  config: Record<string, unknown>;
  completed: boolean;
}

export interface DailyRewardScoreRow {
  accountId: number;
  username: string;
  points: number;
  rank: number;
}

export interface DailyRewardLeaderboardPageRow {
  rows: DailyRewardScoreRow[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

export interface DailyRewardSpinRow {
  outcomeKey: string;
  points: number;
  createdAt: string;
}

export interface DailyRewardDb {
  banForAccount(accountId: number): Promise<{ reason: string; expiresAt: string | null } | null>;
  ensureDay(day: string): Promise<void>;
  seedTasks(day: string, tasks: DailyRewardTaskSeed[]): Promise<void>;
  tasksForAccount(day: string, accountId: number): Promise<DailyRewardTaskRow[]>;
  tasksForType(day: string, type: string): Promise<DailyRewardTaskRow[]>;
  scoreForAccount(day: string, accountId: number): Promise<number>;
  onlineMinutesForAccount(day: string, accountId: number): Promise<number>;
  questTaskCompletionCount(
    day: string,
    accountId: number,
    taskId: string,
    questId: string,
  ): Promise<number>;
  leaderboardPage(
    day: string,
    page: number,
    pageSize: number,
  ): Promise<DailyRewardLeaderboardPageRow>;
  leaderboardTotal(day: string): Promise<number>;
  leaderboardSnapshot(day: string): Promise<DailyRewardScoreRow[]>;
  spinForAccount(day: string, accountId: number): Promise<DailyRewardSpinRow | null>;
  recordSpin(day: string, accountId: number, outcomeKey: string, points: number): Promise<boolean>;
  addPoints(
    day: string,
    accountId: number,
    kind: string,
    points: number,
    idempotencyKey: string,
    meta?: Record<string, unknown>,
  ): Promise<boolean>;
}

export interface DailyRewardTaskSeed {
  id: string;
  type: string;
  title: string;
  description: string;
  points: number;
  basePoints?: number;
  sortOrder: number;
  active?: boolean;
  config?: Record<string, unknown>;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function recordConfig(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return optionalString(value);
}

function scoreRow(row: Record<string, unknown>): DailyRewardScoreRow {
  return {
    accountId: Number(row.account_id),
    username: String(row.username),
    points: Number(row.points),
    rank: Number(row.rank),
  };
}

// banForAccount's query text, exported so an integration suite can execute the
// real text against a scoped schema.
export const DAILY_REWARD_BAN_FOR_ACCOUNT_SQL = `SELECT reason, expires_at
         FROM (
           SELECT reason, expires_at, 0 AS priority
             FROM daily_reward_bans
            WHERE account_id = $1
              AND (expires_at IS NULL OR expires_at > now())
           UNION ALL
           SELECT ib.reason, NULL::timestamptz AS expires_at, 1 AS priority
             FROM accounts a
             JOIN daily_reward_ip_bans ib
               ON ib.ip_address = a.last_login_ip
            WHERE a.id = $1
           UNION ALL
           SELECT ib.reason, NULL::timestamptz AS expires_at, 1 AS priority
             FROM play_sessions ps
             JOIN daily_reward_ip_bans ib
               ON ib.ip_address = ps.ip_address
            WHERE ps.account_id = $1
           UNION ALL
           SELECT ib.reason, NULL::timestamptz AS expires_at, 1 AS priority
             FROM account_ip_associations assoc
             JOIN daily_reward_ip_bans ib
               ON ib.ip_address = assoc.ip_address
            WHERE assoc.account_id = $1
         ) restrictions
        ORDER BY priority
        LIMIT 1`;

export const DAILY_REWARD_OPEN_DAY_LOCK_SQL = `SELECT finalized_at
   FROM daily_reward_days
  WHERE day = $1 AND realm = $2
  FOR SHARE`;

export class PgDailyRewardDb implements DailyRewardDb {
  async banForAccount(
    accountId: number,
  ): Promise<{ reason: string; expiresAt: string | null } | null> {
    // OR-free arms, mirroring the daily_reward_excluded_accounts view: the
    // last-login and play-session IP probes are separate UNION ALL arms so each
    // rides its own index path (an OR in the join forces a nested loop with a
    // re-probed subquery on every eligibility check). LIMIT 1 makes the read
    // dedup-insensitive, so UNION ALL skips the dedup sort, and ORDER BY
    // priority keeps the account ban (with its real expiry) ahead of IP bans.
    // The association arm keeps an ip-banned account excluded after its raw
    // sessions age out of retention; the probe is PK-served
    // (account_ip_associations leads on account_id).
    const res = await pool.query(DAILY_REWARD_BAN_FOR_ACCOUNT_SQL, [accountId]);
    return res.rows[0]
      ? {
          reason: String(res.rows[0].reason),
          expiresAt: dateString(res.rows[0].expires_at),
        }
      : null;
  }

  async ensureDay(day: string): Promise<void> {
    // The day row is what the ledger and spin writes share-lock before every
    // point write (DAILY_REWARD_OPEN_DAY_LOCK_SQL), so seeding it is the whole
    // job; there is nothing on the row left to update once it exists.
    await pool.query(
      `INSERT INTO daily_reward_days (day, realm)
       VALUES ($1, $2)
       ON CONFLICT (day, realm) DO NOTHING`,
      [day, REALM],
    );
  }

  async seedTasks(day: string, tasks: DailyRewardTaskSeed[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE daily_reward_tasks
            SET active = false
          WHERE day = $1 AND realm = $2`,
        [day, REALM],
      );
      for (const task of tasks) {
        await client.query(
          `INSERT INTO daily_reward_tasks
            (day, realm, task_id, task_type, title, description, points, base_points,
             sort_order, active, config)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
           ON CONFLICT (day, realm, task_id) DO UPDATE
              SET task_type = EXCLUDED.task_type,
                  title = EXCLUDED.title,
                  description = EXCLUDED.description,
                  points = EXCLUDED.points,
                  base_points = EXCLUDED.base_points,
                  sort_order = EXCLUDED.sort_order,
                  active = EXCLUDED.active,
                  config = EXCLUDED.config`,
          [
            day,
            REALM,
            task.id,
            task.type,
            task.title,
            task.description,
            task.points,
            task.basePoints ?? task.points,
            task.sortOrder,
            task.active ?? true,
            JSON.stringify(task.config ?? {}),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async tasksForAccount(day: string, accountId: number): Promise<DailyRewardTaskRow[]> {
    const res = await pool.query(
      `SELECT t.task_id, t.task_type, t.title, t.description, t.points, t.base_points, t.config,
              (
                c.account_id IS NOT NULL
                OR EXISTS (
                  SELECT 1
                    FROM daily_reward_events e
                   WHERE e.day = t.day AND e.realm = t.realm
                     AND e.account_id = $3
                     AND e.kind = 'task'
                     AND e.meta->>'taskId' = t.task_id
                )
              ) AS completed
         FROM daily_reward_tasks t
         LEFT JOIN daily_reward_task_completions c
           ON c.day = t.day AND c.realm = t.realm
          AND c.task_id = t.task_id AND c.account_id = $3
        WHERE t.day = $1 AND t.realm = $2 AND t.active = true
        ORDER BY t.sort_order ASC, t.task_id ASC`,
      [day, REALM, accountId],
    );
    return res.rows.map((r) => ({
      taskId: String(r.task_id),
      type: String(r.task_type),
      title: String(r.title),
      description: String(r.description),
      points: Number(r.points),
      basePoints: Number(r.base_points ?? r.points),
      config: recordConfig(r.config),
      completed: r.completed === true,
    }));
  }

  async tasksForType(day: string, type: string): Promise<DailyRewardTaskRow[]> {
    const res = await pool.query(
      `SELECT task_id, task_type, title, description, points, base_points, config
         FROM daily_reward_tasks
        WHERE day = $1 AND realm = $2 AND task_type = $3 AND active = true
        ORDER BY sort_order ASC, task_id ASC`,
      [day, REALM, type],
    );
    return res.rows.map((r) => ({
      taskId: String(r.task_id),
      type: String(r.task_type),
      title: String(r.title),
      description: String(r.description),
      points: Number(r.points),
      basePoints: Number(r.base_points ?? r.points),
      config: recordConfig(r.config),
      completed: false,
    }));
  }

  async scoreForAccount(day: string, accountId: number): Promise<number> {
    const res = await pool.query(
      `SELECT points FROM daily_reward_scores
        WHERE day = $1 AND realm = $2 AND account_id = $3`,
      [day, REALM, accountId],
    );
    return Number(res.rows[0]?.points ?? 0);
  }

  async onlineMinutesForAccount(day: string, accountId: number): Promise<number> {
    const res = await pool.query(
      `SELECT COUNT(*) AS minutes
         FROM daily_reward_events
        WHERE day = $1 AND realm = $2 AND account_id = $3 AND kind = 'online'`,
      [day, REALM, accountId],
    );
    return Number(res.rows[0]?.minutes ?? 0);
  }

  async questTaskCompletionCount(
    day: string,
    accountId: number,
    taskId: string,
    questId: string,
  ): Promise<number> {
    const res = await pool.query(
      `SELECT COUNT(*) AS completions
         FROM daily_reward_events
        WHERE day = $1
          AND realm = $2
          AND account_id = $3
          AND kind = 'task'
          AND meta->>'taskId' = $4
          AND meta->>'questId' = $5`,
      [day, REALM, accountId, taskId, questId],
    );
    return Number(res.rows[0]?.completions ?? 0);
  }

  async leaderboardTotal(day: string): Promise<number> {
    const res = await pool.query(
      `SELECT COUNT(*) AS total
         FROM daily_reward_scores s
        WHERE day = $1 AND realm = $2 AND points > 0
          AND EXISTS (SELECT 1 FROM accounts a
                       WHERE a.id = s.account_id AND ${ELIGIBLE_ACCOUNT_SQL})
          AND NOT EXISTS (
            SELECT 1 FROM daily_reward_excluded_accounts b WHERE b.account_id = s.account_id
          )`,
      [day, REALM],
    );
    return Number(res.rows[0]?.total ?? 0);
  }

  // The one query a board-cache refresh runs: the FULL ranked list for the
  // day, exactly the leaderboardPage() population and ordering with no LIMIT.
  // Bounded by the day's positive scorers, so there is no artificial cap to
  // desync the cached total from the cached rows. It runs on the plain pool
  // (the default statement-timeout tier) DELIBERATELY, not the 60s
  // runWithStatementTimeout heavy allowance the whole-realm JSONB board
  // aggregates use: this read is day-scoped and index-served, and a runaway
  // refresh should fail fast into stale-serve rather than pin a pooled
  // client for a minute per retry.
  async leaderboardSnapshot(day: string): Promise<DailyRewardScoreRow[]> {
    const res = await pool.query(
      `SELECT s.account_id, a.username, s.points,
              row_number() OVER (ORDER BY s.points DESC, s.updated_at ASC, s.account_id ASC) AS rank
         FROM daily_reward_scores s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.day = $1 AND s.realm = $2 AND s.points > 0
          AND ${ELIGIBLE_ACCOUNT_SQL}
          AND NOT EXISTS (SELECT 1 FROM daily_reward_excluded_accounts b WHERE b.account_id = s.account_id)
        ORDER BY s.points DESC, s.updated_at ASC, s.account_id ASC`,
      [day, REALM],
    );
    return res.rows.map(scoreRow);
  }

  async leaderboardPage(
    day: string,
    page: number,
    pageSize: number,
  ): Promise<DailyRewardLeaderboardPageRow> {
    const requestedPageSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 50;
    const safePageSize = Math.max(1, Math.min(100, requestedPageSize));
    const total = await this.leaderboardTotal(day);
    const pageCount = Math.max(1, Math.ceil(total / safePageSize));
    const requestedPage = Number.isFinite(page) ? Math.floor(page) : 0;
    const safePage = Math.max(0, Math.min(pageCount - 1, requestedPage));
    const res = await pool.query(
      `SELECT s.account_id, a.username, s.points,
              row_number() OVER (ORDER BY s.points DESC, s.updated_at ASC, s.account_id ASC) AS rank
         FROM daily_reward_scores s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.day = $1 AND s.realm = $2 AND s.points > 0
          AND ${ELIGIBLE_ACCOUNT_SQL}
          AND NOT EXISTS (SELECT 1 FROM daily_reward_excluded_accounts b WHERE b.account_id = s.account_id)
        ORDER BY s.points DESC, s.updated_at ASC, s.account_id ASC
        OFFSET $3
        LIMIT $4`,
      [day, REALM, safePage * safePageSize, safePageSize],
    );
    return {
      rows: res.rows.map(scoreRow),
      page: safePage,
      pageSize: safePageSize,
      pageCount,
      total,
    };
  }

  async spinForAccount(day: string, accountId: number): Promise<DailyRewardSpinRow | null> {
    const res = await pool.query(
      `SELECT outcome_key, points, created_at FROM daily_reward_spins
        WHERE day = $1 AND realm = $2 AND account_id = $3`,
      [day, REALM, accountId],
    );
    const row = res.rows[0];
    return row
      ? {
          outcomeKey: String(row.outcome_key),
          points: Number(row.points),
          createdAt: row.created_at,
        }
      : null;
  }

  async recordSpin(
    day: string,
    accountId: number,
    outcomeKey: string,
    points: number,
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const openDay = await client.query(DAILY_REWARD_OPEN_DAY_LOCK_SQL, [day, REALM]);
      if (!openDay.rows[0] || openDay.rows[0].finalized_at !== null) {
        await client.query('ROLLBACK');
        return false;
      }
      const spin = await client.query(
        `INSERT INTO daily_reward_spins (day, realm, account_id, outcome_key, points)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (SELECT 1 FROM daily_reward_excluded_accounts WHERE account_id = $3)
         ON CONFLICT (day, realm, account_id) DO NOTHING`,
        [day, REALM, accountId, outcomeKey, points],
      );
      if ((spin.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const event = await client.query(
        `INSERT INTO daily_reward_events
          (day, realm, account_id, kind, points, idempotency_key, meta)
         SELECT $1, $2, $3, 'spin', $4, 'spin', $5::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM daily_reward_excluded_accounts WHERE account_id = $3)`,
        [day, REALM, accountId, points, JSON.stringify({ outcome: outcomeKey })],
      );
      if ((event.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO daily_reward_scores (day, realm, account_id, points)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (day, realm, account_id) DO UPDATE
            SET points = daily_reward_scores.points + EXCLUDED.points,
                updated_at = now()`,
        [day, REALM, accountId, Math.max(0, Math.floor(points))],
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async addPoints(
    day: string,
    accountId: number,
    kind: string,
    points: number,
    idempotencyKey: string,
    meta: Record<string, unknown> = {},
  ): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Share-lock the day row before every ledger/score write. A day whose row
      // is absent or already closed (finalized_at set) takes no further points,
      // one database-authoritative cutoff across all game processes.
      const openDay = await client.query(DAILY_REWARD_OPEN_DAY_LOCK_SQL, [day, REALM]);
      if (!openDay.rows[0] || openDay.rows[0].finalized_at !== null) {
        await client.query('ROLLBACK');
        return false;
      }
      const event = await client.query(
        `INSERT INTO daily_reward_events
          (day, realm, account_id, kind, points, idempotency_key, meta)
         SELECT $1, $2, $3, $4, $5, $6, $7::jsonb
         WHERE NOT EXISTS (SELECT 1 FROM daily_reward_excluded_accounts WHERE account_id = $3)
         ON CONFLICT (day, realm, account_id, idempotency_key) DO NOTHING`,
        [day, REALM, accountId, kind, points, idempotencyKey, JSON.stringify(meta)],
      );
      if ((event.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const clamped = Math.max(0, Math.floor(points));
      // Zero-point events (recordOnlineMinute's per-minute markers) keep their
      // event-ledger row above (it is the online-minutes counter and the
      // idempotency gate) but skip the score UPSERT entirely: nothing reads a
      // zero score row (every ranked read filters points > 0 and scoreForAccount
      // defaults to 0), and the skip removes one heap-tuple rewrite per online
      // player per minute. The CASE below stays as a second lock on the same
      // fairness invariant (a zero-point write, should one ever reach the
      // UPSERT again, must not churn the ASC tie-break).
      if (clamped > 0) {
        await client.query(
          `INSERT INTO daily_reward_scores (day, realm, account_id, points)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (day, realm, account_id) DO UPDATE
              SET points = daily_reward_scores.points + EXCLUDED.points,
                  updated_at = CASE
                    WHEN EXCLUDED.points > 0 THEN now()
                    ELSE daily_reward_scores.updated_at
                  END`,
          [day, REALM, accountId, clamped],
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

export const REWARD_DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

// One bounded prune batch against the daily_reward_events audit ledger.
// daily_reward_events.day is the REWARD-CLOCK day (its boundary sits at a
// configured UTC offset, 21:00 UTC by default), NOT a plain UTC calendar
// date, so this module never computes cutoffs: a naive now()-minus-N-days
// here would cut at the wrong boundary, and calling the reward clock from
// this file would invert the import direction (daily_rewards.ts imports from
// this module; the reverse would cycle). The caller computes the cutoff via
// currentDailyRewardDay + addRewardDays and passes a plain day string in.
// Prunes ONLY the raw event ledger: daily_reward_scores and
// daily_reward_spins are never touched, so a day's ranked board stays
// reconstructible after events age out. One bounded batch per call; the
// retention sweep drives iteration. day leads the UNIQUE
// (day, realm, account_id, idempotency_key) index, so the day < $1 subquery
// is index-served with no new DDL, and ORDER BY day keeps each batch on the
// oldest days. A DELETE writes no index entries; the dead tuples' entries in
// this table's three indexes (including the partial
// daily_reward_events_account_day_created_id) are reclaimed later by
// scan-time LP_DEAD hinting and autovacuum, a deferred cost the modest batch
// size keeps small. Deliberately a standalone export, not a DailyRewardDb
// method: the interface would force every test fake to stub it, and the
// sweep is not a service-seam consumer.
export async function pruneDailyRewardEventsBatch(
  cutoffDay: string,
  batchSize: number,
): Promise<number> {
  // A malformed cutoff must not delete anything: day is TEXT and compares
  // lexicographically, so a stray non-day string could match every row.
  if (!REWARD_DAY_SHAPE.test(cutoffDay)) return 0;
  const res = await pool.query(
    `DELETE FROM daily_reward_events
      WHERE id IN (
        SELECT id FROM daily_reward_events
         WHERE day < $1
         ORDER BY day
         LIMIT $2)`,
    [cutoffDay, Math.max(1, Math.floor(batchSize))],
  );
  return res.rowCount ?? 0;
}
