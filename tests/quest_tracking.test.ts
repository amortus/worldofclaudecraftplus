import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuestTracking } from '../src/ui/quest_tracking';

function stubStorage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  return m;
}

describe('QuestTracking', () => {
  beforeEach(() => stubStorage());
  afterEach(() => { delete (globalThis as unknown as { localStorage?: Storage }).localStorage; });

  it('toggles tracking and reports state', () => {
    const qt = new QuestTracking();
    expect(qt.isTracked('q1')).toBe(false);
    expect(qt.toggle('q1')).toBe(true);
    expect(qt.isTracked('q1')).toBe(true);
    expect(qt.size).toBe(1);
    expect(qt.toggle('q1')).toBe(false);
    expect(qt.isTracked('q1')).toBe(false);
  });

  it('persists across instances (survives a reload)', () => {
    const a = new QuestTracking();
    a.toggle('q1');
    a.toggle('q2');
    const b = new QuestTracking();
    expect(b.isTracked('q1')).toBe(true);
    expect(b.isTracked('q2')).toBe(true);
    expect(new Set(b.trackedIds())).toEqual(new Set(['q1', 'q2']));
  });

  it('set() is idempotent and only fires onChange on a real change', () => {
    const qt = new QuestTracking();
    let fires = 0;
    qt.onChange(() => { fires++; });
    qt.set('q1', true);
    expect(fires).toBe(1);
    qt.set('q1', true);
    expect(fires).toBe(1);
    qt.set('q1', false);
    expect(fires).toBe(2);
  });

  it('retain() drops ids that are no longer active', () => {
    const qt = new QuestTracking();
    qt.toggle('q1');
    qt.toggle('q2');
    qt.toggle('q3');
    qt.retain(['q1', 'q3']);
    expect(qt.isTracked('q2')).toBe(false);
    expect(new Set(qt.trackedIds())).toEqual(new Set(['q1', 'q3']));
  });

  it('survives malformed storage', () => {
    localStorage.setItem('woc_tracked_quests', '{not json');
    expect(new QuestTracking().trackedIds()).toEqual([]);
  });

  it('onChange unsubscribe stops further notifications', () => {
    const qt = new QuestTracking();
    let fires = 0;
    const off = qt.onChange(() => { fires++; });
    qt.toggle('q1');
    expect(fires).toBe(1);
    off();
    qt.toggle('q1');
    expect(fires).toBe(1);
  });
});
