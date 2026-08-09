// Mounts: the reins item, the summon cast, and the movement-speed aura.
//
// A pure, host-agnostic leaf. It owns the catalog, the tuning and every RULE
// about when a mount may be summoned and when a ride ends; `sim.ts` owns only
// the state mutation (start the cast, apply the aura, strip it) and the two
// events. Nothing here reads a clock, touches an `Entity`, or draws rng: like
// `src/sim/lfg`, this module takes no `Rng` at all, so wiring it can never
// reorder the world's shared draw stream.
//
// SCOPE, from the parity backlog: upstream retired the mount-collection window
// and the persisted "selected mount", so a mount is just a bag item used from
// the action bar. There is no mount picker, no owned-mount list and no
// `CharacterState` field: what you own is the reins in your bags.

import type { AuraKind, ItemDef } from './types';
import { RUN_SPEED } from './types';

// ---------------------------------------------------------------------------
// Tuning. Every number below is anchored on something this game already ships.
// ---------------------------------------------------------------------------

/**
 * Movement-speed multiplier of a summoned mount, in the same 1+fraction form
 * `moveSpeedMult` already reads off `buff_speed` (1.6 = +60%).
 *
 * ANCHORED ON: the classic-era apprentice ground mount, +60%, and on our own
 * existing speed auras so it sits in the right place on that ladder. The
 * sustained travel auras we ship are Ghost Wolf (`buff_speed` 1.4, 3600 s) and
 * Travel Form (`form_travel` 1.4, 3600 s); the bursts are Sprint (1.7, 15 s on
 * a 300 s cooldown) and Dash (1.5, 15 s). 1.6 makes the mount the best
 * SUSTAINED travel in the game, which is the whole point of owning one, while
 * still leaving a rogue's 15-second cooldown the fastest thing on the field.
 * Effective speed is RUN_SPEED * MOUNT_SPEED_MULT = 7 * 1.6 = 11.2 yd/s.
 */
export const MOUNT_SPEED_MULT = 1.6;

/**
 * Summon cast, seconds.
 *
 * ANCHORED ON: the classic-era mount summon (3.0 s) and on our own longest
 * ordinary player cast, which is also 3.0 (Aimed Shot, and the rank-4 nukes in
 * `content/classes.ts`). Long enough that a player cannot mount to escape a
 * pull they already lost, short enough that it is not a punishment for
 * travelling.
 */
export const MOUNT_CAST_SECONDS = 3;

/**
 * Aura duration, seconds. Matches Ghost Wolf / Travel Form (3600), the two
 * shipped sustained travel auras: a mount is not a timed buff, the duration is
 * only the backstop that stops a forgotten aura living forever.
 */
export const MOUNT_AURA_SECONDS = 3600;

/** Aura kind the mount grants. `buff_speed` is what `moveSpeedMult` already
 *  folds in (`Math.max` across sources), so a mount never stacks with Ghost
 *  Wolf, it simply wins. */
export const MOUNT_AURA_KIND: AuraKind = 'buff_speed';

/** Sentinel cast id for the summon, the same shape as FISHING_CAST_ID and
 *  GATHER_CAST_ID: not an ability, so it never resolves through ABILITIES and
 *  never takes the GCD. The client keys its cast-bar label off this id. */
export const MOUNT_CAST_ID = 'mountSummon';

/** Prefix of the aura id a mount applies. The suffix is the mount id, so the
 *  buff frame can name the exact mount and `isMountAuraId` stays exact. */
export const MOUNT_AURA_ID_PREFIX = 'mount_';

export function mountAuraId(mountId: string): string {
  return `${MOUNT_AURA_ID_PREFIX}${mountId}`;
}

export function isMountAuraId(auraId: string): boolean {
  return auraId.startsWith(MOUNT_AURA_ID_PREFIX);
}

/** The mount id carried by a mount aura id, or null when it is not one. */
export function mountIdFromAuraId(auraId: string): string | null {
  return isMountAuraId(auraId) ? auraId.slice(MOUNT_AURA_ID_PREFIX.length) : null;
}

// ---------------------------------------------------------------------------
// Reasons. Stable ids, never prose: the client owns every word (the sim is
// language-agnostic). `src/ui/mount_ui_model.ts` folds each of these onto its
// own copy rung.
// ---------------------------------------------------------------------------

/** Why a ride ended. Rides the `mountDown` event. */
export type MountDownReason =
  | 'damage'
  | 'combat'
  | 'manual'
  | 'cast'
  | 'dead'
  | 'water'
  | 'indoors';

/** Why a summon was refused. Rides the `mountDown` event too: a refused summon
 *  is a ride that did not start, and the client already has copy for each rung. */
export type MountDenyReason = 'combat' | 'dead' | 'water' | 'indoors' | 'cast';

// ---------------------------------------------------------------------------
// The catalog.
// ---------------------------------------------------------------------------

export interface MountDef {
  /** Mount id. Equals the reins item id, so `mountUp.mountId` names both. */
  id: string;
  /** Item the player carries. */
  itemId: string;
  speedMult: number;
  castSeconds: number;
}

/**
 * The shipped mounts. One for now: the feature is the SYSTEM, and a second
 * model with identical numbers would be a cosmetic, which needs art we do not
 * have (the parity backlog excludes new art from this wave).
 */
export const MOUNTS: Readonly<Record<string, MountDef>> = {
  reins_dawnstrider: {
    id: 'reins_dawnstrider',
    itemId: 'reins_dawnstrider',
    speedMult: MOUNT_SPEED_MULT,
    castSeconds: MOUNT_CAST_SECONDS,
  },
};

export function mountById(mountId: string): MountDef | null {
  return MOUNTS[mountId] ?? null;
}

/**
 * The reins items, merged into `ITEMS` by `data.ts`.
 *
 * `kind: 'tool'` because a reins is a permanent bag object that is used, never
 * consumed, which is exactly what `tool` already means here (the gathering
 * picks and rods); `useItem` routes on `use.type` before it ever looks at
 * `kind`, so the kind only decides vendor/stack behaviour.
 *
 * `buyValue` is anchored on the shipped level-cap convenience purchases in
 * `content/zone4.ts` (the Dawnguard rare set pieces sell at 6000 copper each):
 * one gold above a single set piece, i.e. a real but reachable sink for a
 * character who has started running the endgame zone. `sellValue` follows the
 * usual quarter-of-buy ratio those same items use.
 */
export const MOUNT_ITEMS: Record<string, ItemDef> = {
  reins_dawnstrider: {
    id: 'reins_dawnstrider',
    name: 'Reins of the Dawnstrider',
    kind: 'tool',
    quality: 'rare',
    use: { type: 'mount', mountId: 'reins_dawnstrider' },
    sellValue: 1750,
    buyValue: 7000,
    noMarketList: false,
  },
};

// ---------------------------------------------------------------------------
// The rules. Pure predicates over a described situation, so `tests/mount*.ts`
// drives them with no `Sim` at all.
// ---------------------------------------------------------------------------

/** Everything the summon gate looks at. The host fills it from the entity. */
export interface MountSituation {
  dead: boolean;
  inCombat: boolean;
  swimming: boolean;
  /** Inside ANY instance plane (dungeon, arena, delve, rift). */
  indoors: boolean;
  /** A cast or channel is already running. */
  casting: boolean;
}

/**
 * Why this summon must be refused, or null when it may proceed.
 *
 * The order is the order a player would blame: being dead beats everything,
 * then combat (classic: you cannot mount in combat, and allowing it would make
 * a mount a 3-second escape from every pull), then swimming, then indoors
 * (classic: mounts are an outdoor thing, and an instance is a fight), then a
 * cast already in flight.
 */
export function mountDenyReason(situation: MountSituation): MountDenyReason | null {
  if (situation.dead) return 'dead';
  if (situation.inCombat) return 'combat';
  if (situation.swimming) return 'water';
  if (situation.indoors) return 'indoors';
  if (situation.casting) return 'cast';
  return null;
}

/**
 * Why an ACTIVE ride must end, or null when it may continue.
 *
 * Damage is not here: it is an event, not a state, and the host strips the aura
 * on the damage path (`breaksOnDamage`) rather than by polling. Everything below
 * IS a state, and is re-checked every tick, so a ride cannot survive walking
 * into water or being pulled into a fight.
 */
export function rideEndReason(situation: MountSituation): MountDownReason | null {
  if (situation.dead) return 'dead';
  if (situation.inCombat) return 'combat';
  if (situation.swimming) return 'water';
  if (situation.indoors) return 'indoors';
  return null;
}
