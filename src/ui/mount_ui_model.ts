// Pure, host-agnostic view model for mounts.
//
// Mounts ship as a `reins` bag item used from the bag or the action bar, with NO
// separate mount picker: upstream deliberately retired the collection window, so
// the whole client surface is (a) the summon feedback, (b) the dismount reason,
// and (c) letting the action bar carry a reins item. That is the entire scope of
// this module and its consumer.
//
// DOM-free and i18n-free, so tests/mount_ui_model.test.ts drives it directly.
// Every word about a mount is authored in mount_ui_labels.ts.

// ---------------------------------------------------------------------------
// The event contract (fixed; these two names and no others)
// ---------------------------------------------------------------------------

/** The player is now mounted. `mountId` is a stable item id, never prose. */
export interface MountUpEvent {
  type: 'mountUp';
  mountId: string;
}

/** The player is no longer mounted. `reason` is a stable id, never prose. */
export interface MountDownEvent {
  type: 'mountDown';
  reason: string;
}

export type MountUiEvent = MountUpEvent | MountDownEvent;
export type MountUiEventType = MountUiEvent['type'];

/** The frozen wire contract. Compared as STRINGS across the sim/UI seam, which
 *  `tsc` cannot check, so tests/mount_ui_event_contract.test.ts pins both sides
 *  against this list. */
export const MOUNT_EVENTS = ['mountUp', 'mountDown'] as const;

const MOUNT_EVENT_TYPES = new Set<string>(MOUNT_EVENTS);

/** True when `type` names one of the two mount events. Lets the HUD's event loop
 *  route by NAME rather than as `case` labels on the `SimEvent` union, which is
 *  what keeps the HUD compiling while the sim-side variants land separately. */
export function isMountUiEventType(type: string): boolean {
  return MOUNT_EVENT_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Dismount reasons
// ---------------------------------------------------------------------------

/**
 * Every reason a mount can end. `mountDown` carries a bare id, so this list IS
 * the contract on the client side: each rung has authored copy
 * (tests/mount_ui_model.test.ts pins that none is missing), and `unknown` is the
 * catch-all a newer server's reason lands on rather than a silent dismount.
 *
 * The three the brief names outright (damage, combat, manual) are the first
 * three; the rest are the other ways a ride ends and each still needs a line,
 * because a mount that vanishes with no explanation reads to a player as a bug.
 */
export const MOUNT_DOWN_REASONS = [
  'damage',
  'combat',
  'manual',
  'cast',
  'dead',
  'water',
  'zone',
  'indoors',
  'unknown',
] as const;
export type MountDownReason = (typeof MOUNT_DOWN_REASONS)[number];

/** Wire spellings folded onto the canonical rung. Keys are the reason lowercased
 *  with every non-alphanumeric character stripped, so `took_damage`,
 *  `tookDamage` and `TOOK-DAMAGE` are one entry. */
const REASON_SYNONYMS: Readonly<Record<string, MountDownReason>> = {
  damage: 'damage',
  tookdamage: 'damage',
  hit: 'damage',
  attacked: 'damage',
  combat: 'combat',
  incombat: 'combat',
  entercombat: 'combat',
  aggro: 'combat',
  manual: 'manual',
  dismount: 'manual',
  dismounted: 'manual',
  player: 'manual',
  cancelled: 'manual',
  canceled: 'manual',
  cast: 'cast',
  casting: 'cast',
  ability: 'cast',
  spell: 'cast',
  dead: 'dead',
  death: 'dead',
  died: 'dead',
  water: 'water',
  swimming: 'water',
  deepwater: 'water',
  zone: 'zone',
  nomountzone: 'zone',
  arena: 'zone',
  battleground: 'zone',
  indoors: 'indoors',
  inside: 'indoors',
  instance: 'indoors',
  dungeon: 'indoors',
  unknown: 'unknown',
};

/** The canonical rung a wire reason maps to; `unknown` when nothing matches. */
export function mountDownReason(reason: string): MountDownReason {
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]/g, '');
  return REASON_SYNONYMS[normalized] ?? 'unknown';
}

/**
 * True for the reasons the player did not choose. Those are worth an error
 * toast (the ride ended out from under them and they need to know why);
 * a deliberate dismount is a log line and nothing more, because interrupting
 * someone with a modal to confirm what they just pressed is noise.
 */
export function isInvoluntaryDismount(reason: MountDownReason): boolean {
  return reason !== 'manual';
}

// ---------------------------------------------------------------------------
// The reins item, on the action bar
// ---------------------------------------------------------------------------

/**
 * The slice of `ItemDef` this module needs. Structural and loose on purpose:
 * `ItemDef.kind` is a closed union the sim owns, so a `kind: 'mount'` that has
 * not landed yet would be a compile error at the call site if we typed it
 * exactly. Widening to `string` lets the HUD hand us a real `ItemDef` today and
 * a mount-carrying one tomorrow with no edit here.
 */
export interface MountItemLike {
  id?: string;
  kind?: string;
  use?: { type?: string } | undefined;
}

/**
 * Whether an item is a mount (a set of reins).
 *
 * Three independent tells, because the encoding is the sim's to choose and this
 * predicate is what decides whether the item can sit on the action bar at all:
 * a wrong answer here is a player who cannot put their mount on a key. `kind`
 * and `use.type` are the two shapes the item schema can express it in; the id
 * suffix is the documented naming of the feature ("a `reins` bag item") and is
 * the backstop that keeps the bar working if neither field is used.
 */
export function isMountItem(item: MountItemLike | undefined | null): boolean {
  if (!item) return false;
  if (item.kind === 'mount') return true;
  if (item.use?.type === 'mount') return true;
  const id = item.id ?? '';
  return id === 'reins' || id.startsWith('reins_') || id.endsWith('_reins');
}
