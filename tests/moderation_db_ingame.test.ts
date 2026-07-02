import { beforeEach, describe, expect, it, vi } from 'vitest';

// recordInGameAction writes a single audit row (no account-state change). Mock the
// db pool so no Postgres is needed; assert the exact parameterized INSERT.
const { query } = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../server/db', () => ({
  pool: { query },
}));

import { recordInGameAction } from '../server/moderation_db';

beforeEach(() => {
  query.mockClear();
});

describe('recordInGameAction', () => {
  it('inserts a kick audit row with a null expiry and no account update', async () => {
    await recordInGameAction({
      action: 'kick',
      accountId: 22,
      adminAccountId: 11,
      reason: 'griefing in chat',
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO account_moderation_actions');
    expect(sql).not.toMatch(/UPDATE accounts/i); // audit-only: never touches account state
    expect(params).toEqual([22, 11, 'kick', 'griefing in chat']);
  });

  it('records a kill action and trims/bounds the reason', async () => {
    await recordInGameAction({
      action: 'kill',
      accountId: 5,
      adminAccountId: 6,
      reason: '  spawn camping  ',
    });
    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[2]).toBe('kill');
    expect(params[3]).toBe('spawn camping');
  });

  it('refuses an empty reason and writes nothing', async () => {
    await expect(
      recordInGameAction({ action: 'kick', accountId: 1, adminAccountId: 2, reason: '   ' }),
    ).rejects.toThrow(/reason is required/);
    expect(query).not.toHaveBeenCalled();
  });
});
