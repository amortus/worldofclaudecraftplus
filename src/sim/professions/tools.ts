// Gathering tool tier gating. A base gathering tool has a tier; that tier gates
// which node tiers it can work, through one shared comparator so node gating
// can never drift from any later material gating.
//
// Ported from upstream's `professions/tools.ts` minus the parked tool-effect /
// charge / recharge machinery (dormant upstream, and out of this wave anyway).
//
// Pure leaf: the tool catalogue is a PARAMETER on every function, never an
// import, so this module has no dependency on `data.ts`/`ITEMS` and a Vitest
// can drive it with a two-row table. This repo has no durability field on
// `ItemDef`, so a tool can never become unusable from wear: that is a property
// of the item shape, not something enforced here.

import type { CarriedItem, GatherToolTable, GatheringProfessionId } from './types';

/** Effective tool tier for the surfaces that tolerate improvising: fishing's
 *  catch-band floor and bite/reel synergy both treat "a simple pole" as tier 1. */
export const BARE_HANDS_TOOL_TIER = 1;

/** No matching-profession tool carried at all. Distinct from the bare-hands
 *  floor: NODE gathering always requires a real tool, so its gate has to be
 *  able to see "none" rather than a floored 1. */
export const NO_TOOL_OWNED = 0;

/** The tool's tier for `professionId`, or undefined when the item is not a tool
 *  for that profession. */
export function gatherToolTier(
  itemId: string,
  professionId: GatheringProfessionId,
  tools: GatherToolTable,
): number | undefined {
  const def = tools[itemId];
  if (!def || def.professionId !== professionId) return undefined;
  return def.tier;
}

/** The one shared comparator: a tool of a given tier covers its own tier and
 *  every tier below it, never above. A tool's rarity never enters this check;
 *  gating is tier-only. */
export function canGatherTier(toolTier: number, nodeTier: number): boolean {
  return toolTier >= nodeTier;
}

/** The best (highest) matching-profession tool tier anywhere in the player's
 *  bags, or `NO_TOOL_OWNED` when none is carried. Pure bag scan, no equip slot:
 *  owning the tool is carrying it. */
export function bestOwnedGatherToolTierOrNone(
  inventory: readonly CarriedItem[],
  professionId: GatheringProfessionId,
  tools: GatherToolTable,
): number {
  let best = NO_TOOL_OWNED;
  for (const slot of inventory) {
    const tier = gatherToolTier(slot.itemId, professionId, tools);
    if (tier !== undefined && tier > best) best = tier;
  }
  return best;
}

/** The best matching-profession tool tier, floored at `BARE_HANDS_TOOL_TIER`.
 *  The improvise-tolerant surfaces (fishing's band cap and rod synergy) read
 *  this one; node gathering reads `bestOwnedGatherToolTierOrNone`. */
export function bestOwnedGatherToolTier(
  inventory: readonly CarriedItem[],
  professionId: GatheringProfessionId,
  tools: GatherToolTable,
): number {
  return Math.max(BARE_HANDS_TOOL_TIER, bestOwnedGatherToolTierOrNone(inventory, professionId, tools));
}

/** True when the player carries any fishing implement at all. Gathering always
 *  requires a tool, and this is that rule's fishing arm: casting a line needs
 *  tackle in the bags, even though a plain pole is only tier 1. */
export function hasFishingImplement(
  inventory: readonly CarriedItem[],
  tools: GatherToolTable,
): boolean {
  return bestOwnedGatherToolTierOrNone(inventory, 'fishing', tools) !== NO_TOOL_OWNED;
}

/** Every tool id that serves `professionId`, tier-ascending then id-ascending.
 *  Stable order so a vendor list or a tooltip never reshuffles between runs. */
export function toolsForProfession(
  professionId: GatheringProfessionId,
  tools: GatherToolTable,
): GatherToolTable[string][] {
  return Object.values(tools)
    .filter((t) => t.professionId === professionId)
    .sort((a, b) => a.tier - b.tier || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
}
