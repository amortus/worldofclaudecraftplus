// Enchanting reagents: the three-rung universal ladder a disenchant always
// yields, plus the five typed "resonant" weaves a rare-or-better piece gives up
// on top of it.
//
// Ported from upstream's material set unchanged in shape and in id: dust /
// essence / shard on the ladder, and steel / timber / thread / hide / links as
// the type-keyed secondaries. Which piece yields which is decided by
// `professions/enchanting.ts` (`DISENCHANT_MATERIAL_BY_QUALITY`,
// `typedSecondaryFor`), never here: this file is the item defs and the prices.
//
// Every typed weave has EXACTLY ONE consumer, a Runed enchant in `enchants.ts`,
// which is upstream's rule and the reason none of them is a dead-end currency.
// Likewise `arcane_shard` exists only because the Greater enchants spend it: it
// is the epic-disenchant yield, and without a sink an epic would be worth
// breaking down for nothing.
//
// `kind: 'junk'` matches the choice wave 1 made for the gathered materials
// (`gather_materials.ts`): `src/sim/types.ts` has no `material` kind and is out
// of this wave's file ownership. A later wave that adds a real kind retags
// these eight rows alongside those twelve.

import type { ItemDef } from '../../types';

// Vendor value ladder. The three rungs are priced as a rough x5 step
// (5 / 25 / 120), which is what makes the sink readable: a Greater enchant's
// one shard plus two essence is 170 copper of material against a base
// enchant's five dust at 25. The weaves sit beside essence at 40: a rare
// disenchant yields one essence plus one weave, so the two halves of that
// yield should be worth about the same.
//
// ADAPTED, not ported: upstream prices these against an eleven-realm economy
// with ten crafts bidding for them. Ours are priced against OUR ladders, the
// gathered materials at 4 / 8 / 16 / 28 (`gather_materials.ts`) and the
// gathering tools at 20 to 2500 (`gather_tools.ts`), so a stack of dust is
// worth a little more than a stack of copper ore and a shard is worth roughly
// a mid-tier tool.
function material(id: string, name: string, quality: ItemDef['quality'], sellValue: number): ItemDef {
  return { id, name, kind: 'junk', quality, sellValue };
}

export const ENCHANT_MATERIAL_ITEMS: Record<string, ItemDef> = {
  // The universal ladder, by the quality of the piece broken down.
  arcane_dust: material('arcane_dust', 'Arcane Dust', 'common', 5),
  arcane_essence: material('arcane_essence', 'Arcane Essence', 'uncommon', 25),
  arcane_shard: material('arcane_shard', 'Arcane Shard', 'rare', 120),
  // The typed weaves, one per armor class and one per weapon family.
  resonant_steel: material('resonant_steel', 'Resonant Steel', 'uncommon', 40),
  resonant_timber: material('resonant_timber', 'Resonant Timber', 'uncommon', 40),
  resonant_thread: material('resonant_thread', 'Resonant Thread', 'uncommon', 40),
  resonant_hide: material('resonant_hide', 'Resonant Hide', 'uncommon', 40),
  resonant_links: material('resonant_links', 'Resonant Links', 'uncommon', 40),
};

/** The three ladder rungs, low to high. */
export const ARCANE_LADDER_IDS: readonly string[] = [
  'arcane_dust',
  'arcane_essence',
  'arcane_shard',
];

/** The five typed weaves. Every one of these must be consumed by at least one
 *  Runed enchant; `tests/enchanting_content.test.ts` pins that it is. */
export const RESONANT_WEAVE_IDS: readonly string[] = [
  'resonant_steel',
  'resonant_timber',
  'resonant_thread',
  'resonant_hide',
  'resonant_links',
];
