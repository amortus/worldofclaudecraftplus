// The pure mount view model (src/ui/mount_ui_model.ts) plus its copy layer
// (src/ui/mount_ui_labels.ts).
//
// Both are DOM-free, so this drives them directly. `t()` THROWS on an untracked
// key in dev/test, so every label assertion doubles as proof that the catalog
// surface exists: the summon line and all nine dismount reasons.
//
// Mounts deliberately ship with NO collection window, so the whole client
// surface is what is covered here plus the action-bar predicate.

import { describe, expect, it } from 'vitest';
import {
  MOUNT_DOWN_REASONS,
  MOUNT_EVENTS,
  isInvoluntaryDismount,
  isMountItem,
  isMountUiEventType,
  mountDownReason,
} from '../src/ui/mount_ui_model';
import {
  mountDisplayName,
  mountDownText,
  mountEventFeedback,
  mountSlotAria,
  mountUpText,
} from '../src/ui/mount_ui_labels';

describe('the pinned event names', () => {
  it('recognizes exactly the two contract names', () => {
    expect([...MOUNT_EVENTS]).toEqual(['mountUp', 'mountDown']);
    for (const name of MOUNT_EVENTS) expect(isMountUiEventType(name)).toBe(true);
    // Near misses must NOT route: a string mismatch here is invisible to tsc and
    // is exactly how wave 2 shipped four dead events.
    for (const near of ['mount', 'mounted', 'dismount', 'mountup', '']) {
      expect(isMountUiEventType(near)).toBe(false);
    }
  });
});

describe('dismount reasons', () => {
  it('covers the three the feature names outright plus every other way a ride ends', () => {
    for (const reason of ['damage', 'combat', 'manual'] as const) {
      expect(MOUNT_DOWN_REASONS).toContain(reason);
    }
    expect(new Set(MOUNT_DOWN_REASONS).size).toBe(MOUNT_DOWN_REASONS.length);
    for (const rung of MOUNT_DOWN_REASONS) expect(mountDownReason(rung)).toBe(rung);
  });

  it('folds wire spellings onto one rung', () => {
    expect(mountDownReason('took_damage')).toBe('damage');
    expect(mountDownReason('TOOK-DAMAGE')).toBe('damage');
    expect(mountDownReason('inCombat')).toBe('combat');
    expect(mountDownReason('deep_water')).toBe('water');
    expect(mountDownReason('dismounted')).toBe('manual');
  });

  it('lands anything it does not know on unknown rather than dismounting in silence', () => {
    expect(mountDownReason('a reason from a newer server')).toBe('unknown');
    expect(mountDownReason('')).toBe('unknown');
  });

  it('separates the ride the player ended from the one taken from them', () => {
    expect(isInvoluntaryDismount('manual')).toBe(false);
    for (const rung of MOUNT_DOWN_REASONS.filter((r) => r !== 'manual')) {
      expect(isInvoluntaryDismount(rung)).toBe(true);
    }
  });

  it('has a line for EVERY reason', () => {
    for (const rung of MOUNT_DOWN_REASONS) {
      const text = mountDownText(rung);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe(rung);
    }
    expect(mountDownText('brand new reason')).toBe(mountDownText('unknown'));
    // The three named reasons each read differently: a player thrown by a blow
    // must not be told the same thing as one who chose to get off.
    const damage = mountDownText('damage');
    const combat = mountDownText('combat');
    const manual = mountDownText('manual');
    expect(new Set([damage, combat, manual]).size).toBe(3);
  });
});

describe('the reins item on the action bar', () => {
  it('accepts every encoding the item schema can express a mount in', () => {
    expect(isMountItem({ id: 'swift_steed', kind: 'mount' })).toBe(true);
    expect(isMountItem({ id: 'swift_steed', use: { type: 'mount' } })).toBe(true);
    // The documented naming of the feature ("a reins bag item") is the backstop
    // that keeps the bar working if neither field is used.
    expect(isMountItem({ id: 'reins' })).toBe(true);
    expect(isMountItem({ id: 'reins_of_the_swift_steed' })).toBe(true);
    expect(isMountItem({ id: 'swift_steed_reins' })).toBe(true);
  });

  it('rejects everything else, so ordinary gear cannot squat on a bar slot', () => {
    expect(isMountItem({ id: 'worn_sword', kind: 'weapon' })).toBe(false);
    expect(isMountItem({ id: 'roast_boar', kind: 'food' })).toBe(false);
    expect(isMountItem({ id: 'braided_fishing_rod', use: { type: 'fishing' } })).toBe(false);
    expect(isMountItem({ id: 'restraints' })).toBe(false);
    expect(isMountItem(undefined)).toBe(false);
    expect(isMountItem(null)).toBe(false);
    expect(isMountItem({})).toBe(false);
  });
});

describe('copy', () => {
  it('names the mount in the summon line and the slot label', () => {
    // No mount item ships yet, so tEntity falls back to the id rather than
    // throwing: an unknown mount prints an ugly name, never a broken frame.
    expect(mountDisplayName('swift_steed')).toBe('swift_steed');
    const up = mountUpText('swift_steed');
    expect(up).toContain('swift_steed');
    const slot = mountSlotAria('swift_steed');
    expect(slot).toContain('swift_steed');
    // The slot says it is a MOUNT, not just an item name: with no collection
    // window anywhere, that is the only cue a screen-reader user gets.
    expect(slot).not.toBe(mountDisplayName('swift_steed'));
  });
});

describe('event feedback', () => {
  it('logs a summon without a banner', () => {
    const fb = mountEventFeedback({ type: 'mountUp', mountId: 'swift_steed' });
    expect(fb.banner).toBeNull();
    expect(fb.error).toBeNull();
    expect(fb.lines.length).toBe(1);
    expect(fb.lines[0]?.text).toBe(mountUpText('swift_steed'));
  });

  it('toasts a dismount the player did not choose, and only logs one they did', () => {
    for (const reason of ['damage', 'combat', 'water', 'zone', 'dead']) {
      const fb = mountEventFeedback({ type: 'mountDown', reason });
      expect(fb.error).toBe(mountDownText(reason));
      expect(fb.lines.length).toBe(1);
    }
    const manual = mountEventFeedback({ type: 'mountDown', reason: 'manual' });
    expect(manual.error).toBeNull();
    expect(manual.lines[0]?.text).toBe(mountDownText('manual'));
    // The tone differs too, so the log itself distinguishes the two.
    expect(manual.lines[0]?.color).not.toBe(
      mountEventFeedback({ type: 'mountDown', reason: 'damage' }).lines[0]?.color,
    );
  });
});
