import { describe, expect, it } from 'vitest';
import { NPCS, ITEMS } from '../src/sim/data';
import { GATHER_TOOLS, GATHER_TOOL_ITEMS } from '../src/sim/content/professions';
import { GATHER_NODES } from '../src/sim/content/professions';

// Gathering hard-requires a tool: `beginHarvest` denies with `no_tool` when the player
// carries none. So a tool nobody can obtain does not merely gate a nicety, it turns every
// node of that profession into permanent scenery. That is exactly how this shipped the
// first time: 15 tool defs existed and not one vendor, loot table or quest reward
// referenced any of them. This test is the tripwire.
function vendorStock(): Set<string> {
  const stock = new Set<string>();
  for (const npc of Object.values(NPCS)) {
    for (const itemId of npc.vendorItems ?? []) stock.add(itemId);
  }
  return stock;
}

describe('gathering tools are obtainable', () => {
  it('sells every gathering tool somewhere', () => {
    const stock = vendorStock();
    const unobtainable = Object.keys(GATHER_TOOL_ITEMS).filter((id) => !stock.has(id));
    expect(unobtainable).toEqual([]);
  });

  it('sells a tool for every tier a node actually requires', () => {
    // A node whose required tier has no purchasable tool is unharvestable content.
    const stock = vendorStock();
    const soldTierByProfession = new Map<string, number>();
    for (const row of Object.values(GATHER_TOOLS)) {
      if (!stock.has(row.itemId)) continue;
      const best = soldTierByProfession.get(row.professionId) ?? 0;
      if (row.tier > best) soldTierByProfession.set(row.professionId, row.tier);
    }

    const unreachable: string[] = [];
    for (const node of GATHER_NODES) {
      const sold = soldTierByProfession.get(nodeProfession(node.type)) ?? 0;
      if (node.tier > sold) unreachable.push(`${node.id} needs tier ${node.tier}`);
    }
    expect(unreachable).toEqual([]);
  });

  it('registers every tool in the live ITEMS table', () => {
    // The tools merge into ITEMS through data.ts. If that merge is ever dropped, a
    // vendor row would reference an id the game cannot resolve.
    const missing = Object.keys(GATHER_TOOL_ITEMS).filter((id) => !ITEMS[id]);
    expect(missing).toEqual([]);
  });
});

function nodeProfession(nodeType: string): string {
  if (nodeType === 'ore') return 'mining';
  if (nodeType === 'timber') return 'logging';
  if (nodeType === 'herb') return 'herbalism';
  return 'fishing';
}
