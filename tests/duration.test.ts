import { describe, expect, it } from 'vitest';
import { formatDuration } from '../server/duration';

// The client re-localizes formatDuration's exact English output via
// localizeServerDuration (src/ui/server_i18n.ts), so the singular/plural wording and
// the unit thresholds here are load-bearing and pinned by this test.
describe('formatDuration', () => {
  it('renders seconds with singular/plural and a 1s floor', () => {
    expect(formatDuration(0)).toBe('1 second');
    expect(formatDuration(-5)).toBe('1 second');
    expect(formatDuration(1)).toBe('1 second');
    expect(formatDuration(45)).toBe('45 seconds');
    expect(formatDuration(59)).toBe('59 seconds');
  });

  it('rolls up into minutes, hours, and days at the right thresholds', () => {
    expect(formatDuration(60)).toBe('1 minute');
    expect(formatDuration(90)).toBe('2 minutes'); // rounds to nearest minute
    expect(formatDuration(300)).toBe('5 minutes');
    expect(formatDuration(3600)).toBe('1 hour');
    expect(formatDuration(7200)).toBe('2 hours');
    expect(formatDuration(86_400)).toBe('1 day');
    expect(formatDuration(3 * 86_400)).toBe('3 days');
  });

  it('rounds fractional seconds to the nearest whole unit', () => {
    expect(formatDuration(59.4)).toBe('59 seconds');
    expect(formatDuration(59.6)).toBe('1 minute');
  });
});
