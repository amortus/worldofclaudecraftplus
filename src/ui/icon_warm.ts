// Idle-time icon cache warmer.
//
// `iconDataUrl` (icons.ts) caches its result, but the FIRST time an icon is
// requested it composes a canvas and runs a synchronous `toDataURL()` (PNG
// encode, ~5-20ms each). Opening a heavy panel for the first time (spellbook,
// talents, action bar) therefore toDataURL-encodes dozens of icons in one
// synchronous burst on the main thread - a >1s INP stall on a single keypress.
//
// This pre-generates a given set of icons in small batches during browser idle
// time after the game loads, so by the time the player opens a panel the icons
// are already cached and the open is instant. Cached icons are skipped cheaply,
// so re-queuing is harmless.

import { iconDataUrl, type IconKind } from './icons';

export interface IconWarmSpec {
  kind: IconKind;
  id: string;
}

const queue: IconWarmSpec[] = [];
let running = false;

type IdleDeadline = { timeRemaining(): number };
type RIC = (cb: (deadline?: IdleDeadline) => void, opts?: { timeout: number }) => number;

export function warmIconsIdle(specs: IconWarmSpec[]): void {
  if (specs.length === 0) return;
  for (const s of specs) queue.push(s);
  if (!running) {
    running = true;
    pump();
  }
}

function pump(): void {
  const ric = (globalThis as unknown as { requestIdleCallback?: RIC }).requestIdleCallback;
  const run = (deadline?: IdleDeadline): void => {
    let n = 0;
    // A few per slice unconditionally, then as many as the idle budget allows,
    // capped so one slice never blocks for long.
    while (queue.length > 0 && n < 24 && (n < 4 || !deadline || deadline.timeRemaining() > 4)) {
      const s = queue.shift();
      if (!s) break;
      try {
        iconDataUrl(s.kind, s.id);
      } catch {
        // unknown ids fall back to a procedural icon inside iconDataUrl; never fatal
      }
      n++;
    }
    if (queue.length > 0) pump();
    else running = false;
  };
  if (ric) ric(run, { timeout: 3000 });
  else setTimeout(() => run(), 16);
}
