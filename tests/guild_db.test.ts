import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test/test';
  return { query: vi.fn() };
});

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return { query: dbMock.query };
  }),
}));

import { topGuilds } from '../server/db';
import { REALM } from '../server/realm';

beforeEach(() => {
  dbMock.query.mockReset();
});

describe('guild high-score board (topGuilds)', () => {
  it('ranks guilds by summed member lifetime XP, then member count, then name', () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    void topGuilds();

    const [sql] = dbMock.query.mock.calls[0];
    // The ranking is decided entirely in SQL (the cache serves the sorted window),
    // so the ORDER BY is the guarantee: summed XP first, member count as the
    // tie-break, then guild name for a stable order.
    expect(sql).toContain(
      'ORDER BY total_lifetime_xp DESC, member_count DESC, g.name ASC',
    );
  });

  it('aggregates over the guilds -> guild_members -> characters join', () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    void topGuilds();

    const [sql] = dbMock.query.mock.calls[0];
    expect(sql).toContain('FROM guilds g');
    expect(sql).toContain('JOIN guild_members gm ON gm.guild_id = g.id');
    expect(sql).toContain('JOIN characters c ON c.id = gm.character_id');
    // The score is the SUM of every member's lifetimeXp (from the state JSONB);
    // member count and the top member level come from the same aggregate.
    expect(sql).toContain("SUM(COALESCE((c.state->>'lifetimeXp')::bigint, 0))");
    expect(sql).toContain('COUNT(gm.character_id)');
    // This fork stores level in the characters.level column, so the top level is
    // MAX(c.level), not a state->>'level' JSONB extract.
    expect(sql).toContain('MAX(c.level)');
    expect(sql).not.toContain("state->>'level'");
    expect(sql).toContain('GROUP BY g.id, g.name, g.realm');
  });

  it('scopes to the current realm by default and binds the limit after it', () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    void topGuilds(9999);

    const [sql, params] = dbMock.query.mock.calls[0];
    // Without a realm predicate the board would leak guild rankings from every
    // other realm's process. The limit is clamped to LEADERBOARD_MAX (1000).
    expect(sql).toContain('WHERE g.realm = $1');
    expect(sql).toContain('LIMIT $2');
    expect(params).toEqual([REALM, 1000]);
  });

  it('drops the realm predicate for the cross-realm global board', () => {
    dbMock.query.mockResolvedValueOnce({ rows: [] });

    void topGuilds(50, { global: true });

    const [sql, params] = dbMock.query.mock.calls[0];
    expect(sql).not.toContain('g.realm = $1');
    expect(sql).toContain('WHERE c.state IS NOT NULL');
    expect(sql).toContain('LIMIT $1');
    expect(params).toEqual([50]);
  });

  it('coerces the aggregate counts from string/bigint columns to numbers', async () => {
    dbMock.query.mockResolvedValueOnce({
      rows: [
        {
          name: 'Ironforge Guard',
          realm: REALM,
          member_count: '20',
          total_lifetime_xp: '1000000',
          top_level: '20',
        },
      ],
    });

    await expect(topGuilds(5)).resolves.toEqual([
      {
        name: 'Ironforge Guard',
        realm: REALM,
        memberCount: 20,
        totalLifetimeXp: 1_000_000,
        topLevel: 20,
      },
    ]);
  });
});
