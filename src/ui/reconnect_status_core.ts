// Pure countdown/attempt math for the reconnect overlay. No DOM and no i18n:
// the overlay (reconnect_overlay.ts) stays a thin painter over this so a
// Vitest can pin the countdown behavior directly
// (tests/reconnect_status_core.test.ts), per the repo's extract-and-test rule.

export interface ReconnectStatusView {
  // Attempt number to display, clamped into [1, maxAttempts] so a racy or
  // out-of-order callback can never render "attempt 0/10" or "11/10".
  attempt: number;
  maxAttempts: number;
  // Whole seconds until the next retry fires, never negative. Ceiled so the
  // display counts 3, 2, 1 and only reads 0 once the attempt is actually due.
  secondsUntilRetry: number;
  // True once the countdown elapsed: the attempt is in flight right now.
  retryingNow: boolean;
}

export function reconnectStatusView(
  attempt: number,
  maxAttempts: number,
  nextRetryAtMs: number,
  nowMs: number,
): ReconnectStatusView {
  const max = Math.max(1, Math.floor(maxAttempts));
  const att = Math.min(max, Math.max(1, Math.floor(attempt)));
  const msLeft = nextRetryAtMs - nowMs;
  const secondsUntilRetry = msLeft > 0 ? Math.ceil(msLeft / 1000) : 0;
  return { attempt: att, maxAttempts: max, secondsUntilRetry, retryingNow: secondsUntilRetry === 0 };
}
