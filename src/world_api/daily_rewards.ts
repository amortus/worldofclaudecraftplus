export interface DailyRewardTaskView {
  id: string;
  type: string;
  title: string;
  description: string;
  points: number;
  multiplier?: number | null;
  completed: boolean;
  locked: boolean;
}

export interface DailyRewardSpinView {
  claimed: boolean;
  points: number | null;
  outcomeKey: string | null;
  claimedAt: string | null;
}

export interface DailyRewardLeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  me: boolean;
}

export interface DailyRewardLeaderboardPage {
  day: string;
  leaders: DailyRewardLeaderboardEntry[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

/** One past-day winner row. The reward carries no prize ledger, so the server
 *  answers an empty list today; the shape is what a past-day board would fill. */
export interface DailyRewardPayoutLogEntry {
  day: string;
  rank: number;
  name: string;
  points: number;
}

export interface DailyRewardEligibilityView {
  eligible: boolean;
  reason: 'eligible' | 'banned';
  banReason?: string | null;
  banExpiresAt?: string | null;
}

export interface DailyRewardStatus {
  /** Defaults to enabled for older/offline implementations; the server always supplies it. */
  enabled?: boolean;
  day: string;
  resetAt: string;
  eligibility: DailyRewardEligibilityView;
  score: number;
  rank: number | null;
  spin: DailyRewardSpinView;
  tasks: DailyRewardTaskView[];
  leaderboard: DailyRewardLeaderboardEntry[];
  leaderboardTotal: number;
}

export interface DailyRewardSpinResult extends DailyRewardStatus {
  awardedPoints: number;
  outcomeKey: string;
}

export interface DailyRewardHistory {
  payouts: DailyRewardPayoutLogEntry[];
}

export interface IWorldDailyRewards {
  dailyRewards(): Promise<DailyRewardStatus>;
  dailyRewardLeaderboard(page?: number, pageSize?: number): Promise<DailyRewardLeaderboardPage>;
  spinDailyReward(): Promise<DailyRewardSpinResult>;
  dailyRewardHistory(): Promise<DailyRewardHistory>;
}
