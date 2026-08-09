// Every time and penalty constant for the Dungeon Finder, in one block.
// All values are SIM-CLOCK SECONDS. Nothing here reads a wall clock.

import type { LfgRelax } from './types';

// How long the LONGEST-waiting unit for a dungeon must have waited before the
// matchmaker drops to that strictness. Anchoring the decay on the oldest unit
// (rather than per-unit) is what makes the queue starvation-free: the player
// who has waited most is always in the group that forms.
//
// TUNED FOR OUR POPULATION. Upstream can afford to hold out for 1 tank +
// 1 healer + 3 damage indefinitely; we cannot. Only 3 of our 9 classes have a
// tank spec and 4 have a healer spec, so a strict queue in a realm with a
// handful of concurrent players is a queue that never pops. 90 seconds of ideal
// matching is long enough for a real tank to arrive at peak hours and short
// enough that an off-peak player is not staring at an empty window.
export const LFG_RELAX_AFTER_SECONDS: Readonly<Record<LfgRelax, number>> = {
  ideal: 0, // 1 tank + 1 healer + 3 damage
  anchored: 90, // a full five with at least one of tank/healer
  any: 240, // any five
  short: 420, // an undersized group, down to the listing's minGroupSize
};

// The ready check. 40 seconds is long enough to notice a popup mid-pull and
// short enough that one absent player does not cost the other four a minute.
export const LFG_READY_WINDOW_SEC = 40;

// How long a fully accepted proposal will wait for an instance slot to free up
// before giving up and putting everyone back in the queue at their original
// position, with no penalty. See OBSTACLE 1 in CLAUDE.md.
export const LFG_SLOT_WAIT_SEC = 30;

// Re-queue penalties. Only ever applied to a player who broke a group that had
// ALREADY formed; leaving the queue itself is free, because a player sitting in
// a queue has promised nobody anything.
export const LFG_DECLINE_COOLDOWN_SEC = 120;
// A timeout is worse than a decline: it burns the full ready window for four
// other people before they learn the group is dead.
export const LFG_TIMEOUT_COOLDOWN_SEC = 300;
