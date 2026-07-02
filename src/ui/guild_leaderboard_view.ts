// Pure, host-agnostic view model for the GUILD tab of the high-score board.
//
// The pure-core half of a pure-core + thin-painter split: it maps an
// already-resolved GuildLeaderboardPage (or an explicit loading / error
// discriminator) to a render model the painter (the inline leaderboard renderer
// in hud.ts) localizes. It is ASYNC-FREE and DOM/i18n-free: the painter owns the
// Promise, the await, and the t() copy. The async/paged shape is the
// online-only-shape trap, so the core is fed BOTH a Sim-shaped (empty) and a
// ClientWorld-mirror-shaped page in the tests.
//
// Guilds are server-only, so there is no "your standing" sticky row here (unlike
// the player board): the offline Sim ranks no guilds and resolves the empty state.

import type { GuildLeaderboardPage } from '../world_api';

/** Prev/Next pager state for a ranked board. Null when the whole board fits on
 *  one page. Defined here (rather than imported from a shared leaderboard_view.ts)
 *  because this fork's player leaderboard UI is inline in hud.ts. */
export interface LeaderboardPager {
  /** Zero-based current page (already clamped by the server). */
  page: number;
  pageCount: number;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

/** One ranked guild row: rank + the guild's summed-XP standing. */
export interface GuildLeaderboardRow {
  rank: number;
  name: string;
  memberCount: number;
  totalLifetimeXp: number;
  topLevel: number;
}

/** The guild-tab view-model: the async-state discriminators or a page. */
export type GuildLeaderboardView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | {
      kind: 'ranked';
      rows: GuildLeaderboardRow[];
      pager: LeaderboardPager | null;
      /** The server clamps the requested page; the painter mirrors this back. */
      page: number;
    };

/** The painter feeds the builder the in-flight loading discriminator, the
 *  rejection/offline error discriminator, or an already-resolved page. */
export type GuildLeaderboardInput =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'page'; page: GuildLeaderboardPage };

/**
 * Build the guild-tab view-model. `loading` / `error` map straight through. A
 * resolved page with no guilds is `empty` (the offline Sim always lands here, as
 * does an online realm with no guilds yet); otherwise it is `ranked`. Reads only
 * IWorld-mirrored data (the resolved page), so the offline Sim and the online
 * ClientWorld mirror produce identical output.
 */
export function buildGuildLeaderboardView(input: GuildLeaderboardInput): GuildLeaderboardView {
  if (input.kind === 'loading') return { kind: 'loading' };
  if (input.kind === 'error') return { kind: 'error' };
  const { page } = input;
  const entries = page.leaders;
  if (entries.length === 0) return { kind: 'empty' };
  const rows: GuildLeaderboardRow[] = entries.map((e) => ({
    rank: e.rank,
    name: e.name,
    memberCount: e.memberCount,
    totalLifetimeXp: e.totalLifetimeXp,
    topLevel: e.topLevel,
  }));
  const pager: LeaderboardPager | null =
    page.pageCount <= 1
      ? null
      : {
          page: page.page,
          pageCount: page.pageCount,
          prevDisabled: page.page <= 0,
          nextDisabled: page.page >= page.pageCount - 1,
        };
  return { kind: 'ranked', rows, pager, page: page.page };
}
