// Client-local "which quests are tracked" state. Tracking a quest (so it shows
// map/minimap markers and feeds the on-screen waypoint arrow) is a PERSONAL UI
// preference, not gameplay, so it lives in localStorage like keybinds/settings,
// never on the server / in IWorld. It survives a reload and is per browser/device.
// Pure logic + a thin localStorage layer -> unit-tested with a stubbed
// localStorage (tests/quest_tracking.test.ts), mirroring keybinds.

const STORAGE_KEY = 'woc_tracked_quests';

function loadTracked(): Set<string> {
  try {
    if (typeof localStorage === 'undefined') return new Set();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

/** The set of quest ids the player has chosen to track, persisted client-side. */
export class QuestTracking {
  private tracked: Set<string>;
  private listeners = new Set<() => void>();

  constructor() {
    this.tracked = loadTracked();
  }

  isTracked(id: string): boolean {
    return this.tracked.has(id);
  }

  trackedIds(): string[] {
    return [...this.tracked];
  }

  get size(): number {
    return this.tracked.size;
  }

  /** Toggle tracking for a quest; returns the new tracked state. */
  toggle(id: string): boolean {
    if (this.tracked.has(id)) this.tracked.delete(id);
    else this.tracked.add(id);
    this.persist();
    this.notify();
    return this.tracked.has(id);
  }

  set(id: string, on: boolean): void {
    const had = this.tracked.has(id);
    if (on === had) return;
    if (on) this.tracked.add(id);
    else this.tracked.delete(id);
    this.persist();
    this.notify();
  }

  /** Drop any tracked ids no longer in the active quest log (turned in /
   *  abandoned), so stale ids don't linger. Call when the quest log changes. */
  retain(activeIds: Iterable<string>): void {
    const keep = new Set(activeIds);
    let changed = false;
    for (const id of [...this.tracked]) {
      if (!keep.has(id)) {
        this.tracked.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify();
    }
  }

  /** Subscribe to changes; returns an unsubscribe fn. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist(): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.tracked]));
    } catch {
      // storage full / unavailable: keep the in-memory set, just don't persist.
    }
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
