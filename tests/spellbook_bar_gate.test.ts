import { describe, expect, it } from 'vitest';
import type { HotbarAction } from '../src/ui/hotbar';
import { SpellbookBarGate, slotAbilityId } from '../src/ui/spellbook_bar_gate';

const ability = (id: string): HotbarAction => ({ type: 'ability', id });
const item = (id: string): HotbarAction => ({ type: 'item', id });

// The spellbook is the one window Hud.update() drives on the PER-FRAME band: while
// it is open, every frame used to walk every row (a document query, a dataset read
// and four DOM writes per row) to keep the +/- toggles in sync with the action bar.
// This gate is what turns an unchanged frame into a single in-place comparison.
describe('SpellbookBarGate', () => {
  it('reports a change on the first call (nothing has been painted yet)', () => {
    const gate = new SpellbookBarGate();
    expect(gate.takeChange([ability('fireball'), null])).toBe(true);
  });

  it('reports NO change on a repeated identical frame, however many times', () => {
    const gate = new SpellbookBarGate();
    const bar = [ability('fireball'), null, item('potion')];
    expect(gate.takeChange(bar)).toBe(true);
    for (let i = 0; i < 120; i++) expect(gate.takeChange(bar), `frame ${i}`).toBe(false);
  });

  it('does not depend on array identity: an equal but fresh array is still unchanged', () => {
    // hotbarActions is replaced wholesale by the slot helpers, so a reference
    // compare would report a change on every rebuild that changed nothing.
    const gate = new SpellbookBarGate();
    gate.takeChange([ability('fireball'), null]);
    expect(gate.takeChange([ability('fireball'), null])).toBe(false);
  });

  it('reports a change when an ability is added to the bar, then settles', () => {
    const gate = new SpellbookBarGate();
    gate.takeChange([ability('fireball'), null]);
    expect(gate.takeChange([ability('fireball'), ability('frostbolt')])).toBe(true);
    expect(gate.takeChange([ability('fireball'), ability('frostbolt')])).toBe(false);
  });

  it('reports a change when an ability is removed, moved, or swapped', () => {
    const gate = new SpellbookBarGate();
    gate.takeChange([ability('a'), ability('b')]);
    expect(gate.takeChange([ability('a'), null])).toBe(true);
    gate.takeChange([ability('a'), ability('b')]);
    expect(gate.takeChange([ability('b'), ability('a')])).toBe(true);
  });

  it('distinguishes an EMPTY slot from an item slot', () => {
    // Both are "not this ability", but only the empty one is a free slot, which is
    // what disables an off-bar toggle. Collapsing them would strand a stale
    // disabled state on every toggle when the last free slot takes an item.
    const gate = new SpellbookBarGate();
    gate.takeChange([ability('a'), null]);
    expect(gate.takeChange([ability('a'), item('potion')])).toBe(true);
    expect(gate.takeChange([ability('a'), item('potion')])).toBe(false);
    expect(gate.takeChange([ability('a'), null])).toBe(true);
  });

  it('reports a change when the bar length changes (form bar swap)', () => {
    const gate = new SpellbookBarGate();
    gate.takeChange([ability('a'), ability('b')]);
    expect(gate.takeChange([ability('a')])).toBe(true);
    expect(gate.takeChange([ability('a')])).toBe(false);
  });

  it('invalidate() forces exactly one more change report', () => {
    const gate = new SpellbookBarGate();
    const bar = [ability('a')];
    gate.takeChange(bar);
    expect(gate.takeChange(bar)).toBe(false);
    gate.invalidate();
    expect(gate.takeChange(bar)).toBe(true);
    expect(gate.takeChange(bar)).toBe(false);
  });

  it('handles an empty bar without claiming a change every frame', () => {
    const gate = new SpellbookBarGate();
    expect(gate.takeChange([])).toBe(true);
    expect(gate.takeChange([])).toBe(false);
  });
});

describe('slotAbilityId', () => {
  it('names the ability on an ability slot and nothing else', () => {
    expect(slotAbilityId(ability('fireball'))).toBe('fireball');
    expect(slotAbilityId(item('potion'))).toBeNull();
    expect(slotAbilityId(null)).toBeNull();
  });
});
