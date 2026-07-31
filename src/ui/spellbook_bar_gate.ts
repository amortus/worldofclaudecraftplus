// Per-frame change gate for the spellbook's +/- action-bar toggles.
//
// The spellbook is the one window Hud.update() drives on the PER-FRAME band: while
// it is open, every frame re-derived each row's on-bar state so the toggles track a
// drag-and-drop onto the action bar without a full rebuild. That walk did a document
// query, a dataset read per row and four DOM writes per row, 60 times a second, for
// a bar that changes maybe once a minute. Everything those toggles paint (on-bar
// state, and whether an off-bar ability can still fit) is a function of the bar's
// ability slots alone, so one comparison of that slot layout decides the whole frame.
//
// Host-agnostic (no DOM), unit-tested directly. The comparison walks the live slot
// array against a retained copy IN PLACE and allocates nothing on an unchanged frame:
// a gate that allocates to decide it has nothing to do keeps most of the cost it was
// meant to save.

import type { HotbarAction } from './hotbar';

/** The ability on a bar slot, or null for an empty slot or an item shortcut. */
export function slotAbilityId(action: HotbarAction): string | null {
  return action !== null && action.type === 'ability' ? action.id : null;
}

/**
 * Retains the bar's ability-slot layout and answers "did it move since the last
 * accepted frame". Each slot reduces to the ability id for an ability, `''` for an
 * item shortcut and `null` for an empty slot: the empty/item distinction has to
 * survive because the toggles' disabled state reads "is there a free slot", which an
 * item shortcut occupies just as an ability does.
 */
export class SpellbookBarGate {
  // Retained slot state, mutated in place. `null` = empty slot, `''` = item
  // shortcut, otherwise the ability id.
  private last: (string | null)[] = [];
  private primed = false;

  /**
   * True when the bar's slots differ from the last accepted frame (always true on
   * the first call). Accepting the frame is the same call: the retained copy is
   * updated whenever a difference is found, so a caller that repaints on `true`
   * gets exactly one repaint per real change.
   */
  takeChange(actions: readonly HotbarAction[]): boolean {
    let changed = !this.primed || this.last.length !== actions.length;
    if (changed) this.last.length = actions.length;
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const next = action === null ? null : action.type === 'ability' ? action.id : '';
      if (this.last[i] !== next) {
        this.last[i] = next;
        changed = true;
      }
    }
    this.primed = true;
    return changed;
  }

  /** Force the next `takeChange` to report a change (e.g. after a rebuild that
   *  repainted the toggles from scratch, or when the window is reopened). */
  invalidate(): void {
    this.primed = false;
  }
}
