// Pure, host-agnostic helper: how many units a single vendor purchase yields.
//
// Classic vendors hand out staple food and drink in stacks (you click once and
// get a stack), while gear, reagents, and potions are bought one at a time. The
// stack costs the per-unit buyValue times the stack size: the per-unit PRICE is
// unchanged, you simply buy more units per click. Keeping this a leaf (no Sim
// state, no DOM) lets BOTH the sim buy path (Sim.buyItem) and the vendor window
// view (ui/vendor_view.ts) share one rule, so the UI's "x5" badge can never
// drift from what the server grants.
//
// DOM-free and deterministic so tests/vendor_stack.test.ts drives it directly.

import type { ItemDef } from './types';

/** Units handed over per purchase for a stacked vendor staple (food / drink). */
export const VENDOR_STACK_SIZE = 5;

/**
 * How many units one click on this vendor good yields. Food and drink come in a
 * stack of VENDOR_STACK_SIZE at per-unit pricing; everything else is one unit
 * per purchase.
 */
export function vendorStackSize(def: ItemDef): number {
  return def.kind === 'food' || def.kind === 'drink' ? VENDOR_STACK_SIZE : 1;
}
