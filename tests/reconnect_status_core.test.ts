import { describe, expect, it } from 'vitest';

import { reconnectStatusView } from '../src/ui/reconnect_status_core';

describe('reconnectStatusView', () => {
  it('counts whole seconds down and only reads 0 when the retry is due', () => {
    const next = 10_000;
    // 4.2s out displays 5 (ceil), so the countdown reads 5, 4, 3, 2, 1, 0.
    expect(reconnectStatusView(1, 10, next, next - 4200).secondsUntilRetry).toBe(5);
    expect(reconnectStatusView(1, 10, next, next - 4000).secondsUntilRetry).toBe(4);
    expect(reconnectStatusView(1, 10, next, next - 1).secondsUntilRetry).toBe(1);
    expect(reconnectStatusView(1, 10, next, next).secondsUntilRetry).toBe(0);
  });

  it('never goes negative once the retry moment has passed', () => {
    const view = reconnectStatusView(3, 10, 1000, 9999);
    expect(view.secondsUntilRetry).toBe(0);
    expect(view.retryingNow).toBe(true);
  });

  it('flags retryingNow exactly when the countdown reaches zero', () => {
    expect(reconnectStatusView(2, 10, 5000, 4999).retryingNow).toBe(false);
    expect(reconnectStatusView(2, 10, 5000, 5000).retryingNow).toBe(true);
  });

  it('clamps the attempt display into [1, maxAttempts]', () => {
    expect(reconnectStatusView(0, 10, 0, 0).attempt).toBe(1);
    expect(reconnectStatusView(-3, 10, 0, 0).attempt).toBe(1);
    expect(reconnectStatusView(11, 10, 0, 0).attempt).toBe(10);
    expect(reconnectStatusView(4, 10, 0, 0)).toMatchObject({ attempt: 4, maxAttempts: 10 });
  });

  it('tolerates degenerate maxAttempts without dividing the display by zero', () => {
    const view = reconnectStatusView(1, 0, 0, 0);
    expect(view.maxAttempts).toBe(1);
    expect(view.attempt).toBe(1);
  });

  it('floors fractional attempt inputs so the display is always an integer', () => {
    expect(reconnectStatusView(2.9, 10, 0, 0).attempt).toBe(2);
    expect(reconnectStatusView(1, 10.7, 0, 0).maxAttempts).toBe(10);
  });
});
