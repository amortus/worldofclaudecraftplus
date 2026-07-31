// Gathering tools: the item defs plus the tier table that gates node access.
//
// Gathering ALWAYS requires a tool (upstream's rule, ported): a bare-handed
// player cannot work any node, and a node of tier T needs a tool of tier T or
// better. Four tiers, one per zone, mirroring ZONE_GATHER_TIER.
//
// The tier lives in its own `GATHER_TOOLS` table keyed by item id rather than
// as an `ItemUse` variant on the def, because `src/sim/types.ts` is out of this
// wave's file ownership. It also keeps the mechanics modules free of any
// `ITEMS` dependency. Tools are found by carrying them: no equip slot, and this
// repo's `ItemDef` has no durability field, so a tool never wears out.
//
// The tier-1 rod is the EXISTING `simple_fishing_pole` from
// `src/sim/content/items.ts`: it is only referenced here by id, never
// redefined, so nothing in that file changes and every rod (including it) keeps
// working through the existing `use: { type: 'fishing' }` path.

import type { GatherToolDef, GatherToolTable } from '../../professions/types';
import type { ItemDef } from '../../types';

/** The existing simple pole, reused as the tier-1 fishing implement. */
export const SIMPLE_FISHING_POLE_ID = 'simple_fishing_pole';

// Vendor ladder. Tier 1 is pinned to the shipped simple pole (buy 20, sell 4);
// tiers 2 to 4 are ADAPTED, priced as a real gold sink against our own
// economy: zone-2/zone-3 vendor gear in `items.ts` runs 85 to 1800 copper, so
// 200 / 800 / 2500 keeps each upgrade a genuine purchase without ever costing
// more than the gear of its own zone. Upstream's tool prices sit on a
// crafting-fed economy we do not have yet, so they were not portable.
const BUY_BY_TIER = [0, 20, 200, 800, 2500];
const SELL_BY_TIER = [0, 4, 40, 160, 500];
const QUALITY_BY_TIER: NonNullable<ItemDef['quality']>[] = [
  'common',
  'common',
  'common',
  'uncommon',
  'rare',
];

function tool(id: string, name: string, tier: number, fishing = false): ItemDef {
  return {
    id,
    name,
    kind: 'tool',
    quality: QUALITY_BY_TIER[tier],
    sellValue: SELL_BY_TIER[tier],
    buyValue: BUY_BY_TIER[tier],
    // Only rods carry a use: casting a line is an item use, while working a
    // node is an interaction with the node's world object.
    ...(fishing ? { use: { type: 'fishing' as const } } : {}),
  };
}

/** Tool item defs this wave ADDS. `simple_fishing_pole` is deliberately absent:
 *  it already exists in `content/items.ts` and is only tiered below. */
export const GATHER_TOOL_ITEMS: Record<string, ItemDef> = {
  // mining
  worn_miners_pick: tool('worn_miners_pick', "Worn Miner's Pick", 1),
  sturdy_miners_pick: tool('sturdy_miners_pick', "Sturdy Miner's Pick", 2),
  reinforced_miners_pick: tool('reinforced_miners_pick', "Reinforced Miner's Pick", 3),
  gravewatch_pick: tool('gravewatch_pick', 'Gravewatch Pick', 4),
  // logging
  worn_logging_axe: tool('worn_logging_axe', 'Worn Logging Axe', 1),
  sturdy_logging_axe: tool('sturdy_logging_axe', 'Sturdy Logging Axe', 2),
  reinforced_logging_axe: tool('reinforced_logging_axe', 'Reinforced Logging Axe', 3),
  gravewatch_felling_axe: tool('gravewatch_felling_axe', 'Gravewatch Felling Axe', 4),
  // herbalism
  worn_herbalists_sickle: tool('worn_herbalists_sickle', "Worn Herbalist's Sickle", 1),
  sturdy_herbalists_sickle: tool('sturdy_herbalists_sickle', "Sturdy Herbalist's Sickle", 2),
  reinforced_herbalists_sickle: tool(
    'reinforced_herbalists_sickle',
    "Reinforced Herbalist's Sickle",
    3,
  ),
  gravewatch_sickle: tool('gravewatch_sickle', 'Gravewatch Sickle', 4),
  // fishing (tier 1 is the shipped simple_fishing_pole)
  braided_fishing_rod: tool('braided_fishing_rod', 'Braided Fishing Rod', 2, true),
  wyrmgut_fishing_rod: tool('wyrmgut_fishing_rod', 'Wyrmgut Fishing Rod', 3, true),
  stillmere_fishing_rod: tool('stillmere_fishing_rod', 'Stillmere Fishing Rod', 4, true),
};

function toolTier(itemId: string, professionId: GatherToolDef['professionId'], tier: number) {
  return [itemId, { itemId, professionId, tier }] as const;
}

/** The tool catalogue every gating function reads. Keyed by item id. */
export const GATHER_TOOLS: GatherToolTable = Object.fromEntries([
  toolTier('worn_miners_pick', 'mining', 1),
  toolTier('sturdy_miners_pick', 'mining', 2),
  toolTier('reinforced_miners_pick', 'mining', 3),
  toolTier('gravewatch_pick', 'mining', 4),
  toolTier('worn_logging_axe', 'logging', 1),
  toolTier('sturdy_logging_axe', 'logging', 2),
  toolTier('reinforced_logging_axe', 'logging', 3),
  toolTier('gravewatch_felling_axe', 'logging', 4),
  toolTier('worn_herbalists_sickle', 'herbalism', 1),
  toolTier('sturdy_herbalists_sickle', 'herbalism', 2),
  toolTier('reinforced_herbalists_sickle', 'herbalism', 3),
  toolTier('gravewatch_sickle', 'herbalism', 4),
  toolTier(SIMPLE_FISHING_POLE_ID, 'fishing', 1),
  toolTier('braided_fishing_rod', 'fishing', 2),
  toolTier('wyrmgut_fishing_rod', 'fishing', 3),
  toolTier('stillmere_fishing_rod', 'fishing', 4),
]);
