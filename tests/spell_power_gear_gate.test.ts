import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { createPlayer, recalcPlayerStats, type PlayerEquipment } from '../src/sim/entity';
import type { PlayerClass } from '../src/sim/types';
import { MAX_LEVEL } from '../src/sim/types';

// Our fork gates over-level gear: an item whose requiredLevel exceeds the wearer's
// level stays equipped but is inert (grants no stats/armor) until the character is
// high enough (see src/sim/entity.ts recalcPlayerStats + item_level_req.ts). The
// Spell Power affix must respect the SAME gate: an under-level caster item adds 0
// Spell Power, matching how its stats are withheld (upstream's v0.18.0 fix).
//
// No shipped item carries the `spellPower` affix yet, so register a synthetic rare
// caster piece with an explicit requiredLevel to isolate the gate. It has NO stats
// block, so it also proves a pure Spell-Power affix still contributes at level.
const SP_ITEM = 'test_sp_gate_ring';
const SP_AFFIX = 50;
const REQ = MAX_LEVEL; // requires the level cap

ITEMS[SP_ITEM] = {
  id: SP_ITEM,
  name: 'Test Spellpower Ring',
  kind: 'armor',
  slot: 'legs',
  quality: 'rare',
  requiredLevel: REQ,
  spellPower: SP_AFFIX,
  sellValue: 1,
};

function spellPowerAt(level: number, equipment: PlayerEquipment): number {
  const cls: PlayerClass = 'mage';
  const e = createPlayer(1, cls, { x: 0, y: 0, z: 0 }, 'Tester');
  e.level = level;
  recalcPlayerStats(e, cls, equipment);
  return e.spellPower;
}

describe('Spell Power gear affix respects the gear level gate', () => {
  it('under-level gear grants no Spell Power (inert like its stats)', () => {
    const bare = spellPowerAt(REQ - 1, {});
    const withUnderLevel = spellPowerAt(REQ - 1, { legs: SP_ITEM });
    // The over-level item is inert: it contributes +0 Spell Power.
    expect(withUnderLevel).toBe(bare);
  });

  it('at the required level the Spell Power affix is applied in full', () => {
    const bare = spellPowerAt(REQ, {});
    const withAtLevel = spellPowerAt(REQ, { legs: SP_ITEM });
    expect(withAtLevel).toBe(bare + SP_AFFIX);
  });
});
