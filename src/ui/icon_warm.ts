// Idle-time icon cache warmer.
//
// `iconDataUrl` (icons.ts) caches its result, but the FIRST request for an icon
// composes a canvas and runs a synchronous `toDataURL()` (PNG encode, ~5-20ms
// each). Opening a heavy panel for the first time (spellbook, talents, bags,
// character) therefore toDataURL-encodes dozens of icons in one synchronous
// main-thread burst - a >1s INP stall on a single keypress.
//
// This pre-generates the icons those panels will show, in small batches during
// browser idle time after the game loads, so by the time the player opens a panel
// the icons are already cached and the open is instant. Cached icons are skipped
// cheaply, so re-queuing is harmless.

import { CLASSES } from '../sim/content/classes';
import { TALENTS } from '../sim/content/talents';
import type { IWorld } from '../world_api';
import { iconDataUrl } from './icons';
import { talentChoiceIconDataUrl, talentNodeIconDataUrl } from './talent_icons';

const queue: Array<() => void> = [];
let running = false;

type IdleDeadline = { timeRemaining(): number };
type RIC = (cb: (deadline?: IdleDeadline) => void, opts?: { timeout: number }) => number;

/** Queue the icons the player's panels will show (ability / item / talent) for
 *  idle-time pre-generation, so the first open of the spellbook / talents / bags /
 *  character window doesn't synchronously toDataURL dozens of icons on a keypress. */
export function warmPlayerIcons(world: IWorld): void {
  const cls = world.player.templateId as keyof typeof CLASSES;
  const tasks: Array<() => void> = [];
  // action bar + spellbook: the class kit
  for (const id of CLASSES[cls]?.abilities ?? []) tasks.push(() => iconDataUrl('ability', id));
  // bags + character window: carried + equipped items
  for (const slot of world.inventory) {
    const id = slot?.itemId;
    if (id) tasks.push(() => iconDataUrl('item', id));
  }
  for (const id of Object.values(world.equipment)) {
    if (id) tasks.push(() => iconDataUrl('item', id));
  }
  // talents tree: every node (+ choice options). These use a separate generator
  // that still resolves to the cached iconDataUrl under the hood, so warming the
  // node URLs populates the same cache the panel reads.
  const tal = TALENTS[cls];
  if (tal) {
    for (const node of tal.nodes) {
      tasks.push(() => talentNodeIconDataUrl(node));
      if (node.kind === 'choice' && node.choices) {
        for (const choice of node.choices) tasks.push(() => talentChoiceIconDataUrl(choice));
      }
    }
  }
  if (tasks.length === 0) return;
  for (const task of tasks) queue.push(task);
  if (!running) {
    running = true;
    pump();
  }
}

function pump(): void {
  const ric = (globalThis as unknown as { requestIdleCallback?: RIC }).requestIdleCallback;
  const run = (deadline?: IdleDeadline): void => {
    let n = 0;
    const start = performance.now();
    // At least one per slice for guaranteed progress, then as many as the idle budget
    // allows, but never past a hard ~6ms wall-clock cap: a cold slice PNG-encodes ~5-20ms
    // each, so without the cap 4 unconditional encodes were an ~80ms input-blocking long
    // task. Same cap the map / minimap idle pumps use. Warm (cached) tasks are ~0ms, so a
    // warm slice still batches up to 24.
    while (
      queue.length > 0 &&
      n < 24 &&
      (n < 1 || ((!deadline || deadline.timeRemaining() > 4) && performance.now() - start < 6))
    ) {
      const task = queue.shift();
      if (!task) break;
      try {
        task();
      } catch {
        // unknown ids fall back to a procedural icon inside the generator; never fatal
      }
      n++;
    }
    if (queue.length > 0) pump();
    else running = false;
  };
  if (ric) ric(run, { timeout: 3000 });
  else setTimeout(() => run(), 16);
}
