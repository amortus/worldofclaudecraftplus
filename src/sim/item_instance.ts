// Per-item instance identity (the Professions 2.0 keystone).
//
// Our inventory is a flat `InvSlot { itemId, count }`: two copies of an item are
// indistinguishable stack counters. Professions need per-copy IDENTITY (a crafted
// piece signed by its maker, a copy carrying an applied enchant, a copy carrying a
// masterwork bonus roll), so `InvSlot` grows ONE optional field, `instance`
// (`ItemInstance`, types.ts). A slot with no `instance` is a plain stack and behaves
// exactly as it did before this module existed.
//
// This file owns every rule about that field: which slots may share a stack, how a
// stack is added/removed, how an instance is cloned, how a persisted or wire-borne
// payload is parsed back (defensively), and how a new instance is minted. `sim.ts`
// only calls in here, so bags / persistence / the wire can never drift apart.
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, and the ONLY randomness
// is the `Rng` handed in by the caller (`this.rng` in `sim.ts`) — never
// `Math.random`/`Date.now`/`performance.now`. Guarded by tests/architecture.test.ts.

import type { Rng } from './rng';
import type { InvSlot, ItemInstance } from './types';

// -----------------------------------------------------------------------------
// Stacking
// -----------------------------------------------------------------------------

/** True when this slot carries per-copy identity. */
export function isInstanced(slot: InvSlot): boolean {
  return slot.instance !== undefined;
}

/**
 * The ONE stacking predicate. An item WITH an instance never stacks with
 * anything, not even a byte-identical instance: stacking is exactly what
 * destroys identity, and a shared `count` would force one payload to describe
 * N copies (whose charges, bond, and enchant then move together).
 *
 * Upstream later relaxed this to "identical payloads may merge"
 * (`item_instance_merge.ts` `canStackInstancePayloads`). If that lands here,
 * this function is the single place it goes; every add/remove path below and in
 * `sim.ts` already routes through it.
 */
export function canStack(slot: InvSlot, itemId: string, instance?: ItemInstance): boolean {
  return slot.itemId === itemId && slot.instance === undefined && instance === undefined;
}

/** Index of the slot a `(itemId, instance)` add may merge into, or -1. */
export function findStackTarget(
  slots: readonly InvSlot[],
  itemId: string,
  instance?: ItemInstance,
): number {
  return slots.findIndex((s) => canStack(s, itemId, instance));
}

/**
 * Add `count` copies to `slots`, merging into an existing plain stack when the
 * add is plain, and always opening a NEW slot when an instance is supplied.
 * Returns the slot that received them. The instance is stored by reference: the
 * caller owns the object it mints (clone first when re-using one, see
 * `cloneItemInstance`).
 */
export function addToSlots(
  slots: InvSlot[],
  itemId: string,
  count: number,
  instance?: ItemInstance,
): InvSlot {
  const idx = findStackTarget(slots, itemId, instance);
  if (idx >= 0) {
    slots[idx].count += count;
    return slots[idx];
  }
  const slot: InvSlot = instance ? { itemId, count, instance } : { itemId, count };
  slots.push(slot);
  return slot;
}

/** What a removal actually consumed: how many copies, and the instances that went with them. */
export interface RemovedCopies {
  removed: number;
  instances: ItemInstance[];
}

/**
 * Remove up to `count` copies of `itemId`, PLAIN STACKS FIRST. Identity is the
 * scarce thing: a reagent cost, a vendor sale, or an equip must never eat the
 * signed copy while an ordinary one is sitting in the same bag. Instanced slots
 * are consumed (newest first, mirroring the old backwards scan) only once the
 * plain copies are gone, and each consumed instance is returned so the caller can
 * carry it somewhere else (equipping) instead of dropping it on the floor.
 */
export function removeFromSlots(slots: InvSlot[], itemId: string, count: number): RemovedCopies {
  const out: RemovedCopies = { removed: 0, instances: [] };
  let left = count;
  // Pass 1: plain stacks. Pass 2: instanced slots.
  for (const instancedPass of [false, true]) {
    for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
      const s = slots[i];
      if (s.itemId !== itemId) continue;
      if (isInstanced(s) !== instancedPass) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      out.removed += take;
      if (s.instance) for (let n = 0; n < take; n++) out.instances.push(s.instance);
      if (s.count <= 0) slots.splice(i, 1);
    }
  }
  return out;
}

/**
 * Express a batch of copies (what a removal took, or what a listing holds in
 * escrow) as slots you can hand to someone else. The plain copies ride ONE
 * ordinary stack; every instanced copy gets its own single-copy slot, because a
 * shared `count` is exactly what would destroy the identity (`canStack`).
 *
 * This is the hand-off shape: a boundary that moves items between owners (the
 * market, a trade, vendor buyback) removes copies on one side and re-grants
 * these rows on the other, so nothing arrives as a plain stack that did not
 * leave as one. Instances are cloned, so the rows never alias the source
 * payload; `instances` beyond `count` are ignored.
 */
export function copiesToSlots(
  itemId: string,
  count: number,
  instances: readonly ItemInstance[] = [],
): InvSlot[] {
  const total = Math.max(0, Math.floor(count));
  const instanced = Math.min(instances.length, total);
  const plain = total - instanced;
  const rows: InvSlot[] = [];
  if (plain > 0) rows.push({ itemId, count: plain });
  for (let i = 0; i < instanced; i++) {
    rows.push({ itemId, count: 1, instance: cloneItemInstance(instances[i]) });
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Cloning
// -----------------------------------------------------------------------------

/**
 * A shallow `{ ...instance }` would alias the mutable `rolled.stats` / `charges`
 * maps between a live payload and its serialized or loaded copy: decrementing a
 * charge on one would silently mutate the other. Deep-clone at every save/load
 * boundary instead. Unknown persisted fields (a payload written by a newer build)
 * are carried through structurally, so a round trip never loses them.
 */
export function cloneItemInstance(src: ItemInstance): ItemInstance {
  return cloneJsonValue(src, 0) as ItemInstance;
}

/** Clone a slot, deep-cloning its instance. Shape-preserving for a plain stack. */
export function cloneInvSlot<T extends InvSlot>(slot: T): T {
  if (!slot.instance) return { ...slot };
  return { ...slot, instance: cloneItemInstance(slot.instance) };
}

/** Clone a whole bag. */
export function cloneInvSlots<T extends InvSlot>(slots: readonly T[]): T[] {
  return slots.map(cloneInvSlot);
}

// -----------------------------------------------------------------------------
// Back-compat parsing (persistence + wire)
// -----------------------------------------------------------------------------

// A character that cannot load is a player who lost their account, so NOTHING
// below throws. Every unknown or malformed shape degrades to the nearest thing
// that still loads: a bad instance becomes a plain stack, a bad slot is skipped,
// a bad bag becomes an empty bag.

// Depth cap for the structural copy. Persisted JSONB and wire JSON cannot be
// cyclic, but a hand-built object handed to `addItem` could be; the cap makes the
// copy total rather than merely usually-terminating.
const MAX_INSTANCE_DEPTH = 8;

// Prototype-polluting keys are dropped outright: this data comes from a JSONB
// column and from the network.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Structural copy restricted to JSON-safe values; returns undefined for anything else. */
function cloneJsonValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') return Number.isFinite(value as number) ? value : undefined;
  if (t !== 'object') return undefined; // function, symbol, bigint, undefined
  if (depth >= MAX_INSTANCE_DEPTH) return undefined;
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    for (const item of value) {
      const copy = cloneJsonValue(item, depth + 1);
      arr.push(copy === undefined ? null : copy);
    }
    return arr;
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const copy = cloneJsonValue(raw, depth + 1);
    if (copy !== undefined) out[key] = copy;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The typed fields of ItemInstance, checked field by field. A field of the wrong
// type is DROPPED (the rest of the payload still loads) rather than rejected.
function keepTypedFields(out: Record<string, unknown>): void {
  if (typeof out.signer !== 'string') delete out.signer;
  if (typeof out.signerId !== 'number') delete out.signerId;
  if (typeof out.enchant !== 'string') delete out.enchant;
  if (typeof out.craftedRecipeId !== 'string') delete out.craftedRecipeId;
  if (typeof out.boundTo !== 'number') delete out.boundTo;
  if (!isPlainObject(out.charges)) delete out.charges;
  else keepNumberValues(out.charges);
  if (!isPlainObject(out.rolled)) delete out.rolled;
  else {
    const rolled = out.rolled;
    if (typeof rolled.quality !== 'string') delete rolled.quality;
    if (typeof rolled.masterwork !== 'boolean') delete rolled.masterwork;
    if (!isPlainObject(rolled.stats)) delete rolled.stats;
    else keepNumberValues(rolled.stats);
    if (Object.keys(rolled).length === 0) delete out.rolled;
  }
}

/** Drop every non-numeric entry from a `string -> number` payload map. */
function keepNumberValues(map: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'number') delete map[key];
  }
}

/**
 * Parse a persisted / wire-borne instance payload. Returns `undefined` (a plain
 * stack) for anything that is not a non-empty object of usable fields, so an old
 * save, a save written by a build that never had this field, and a corrupt or
 * hostile payload all load as ordinary items instead of throwing.
 *
 * Fields this build does not know are PRESERVED verbatim (JSON-safe values only):
 * a payload written by a newer build survives a load/save round trip through an
 * older one rather than being silently stripped.
 */
export function parseItemInstance(raw: unknown): ItemInstance | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out = cloneJsonValue(raw, 0) as Record<string, unknown> | undefined;
  if (!out) return undefined;
  keepTypedFields(out);
  if (Object.keys(out).length === 0) return undefined;
  return out as ItemInstance;
}

/**
 * Parse one persisted / wire-borne inventory slot. Returns `null` only when the
 * slot carries no usable item id at all (nothing can be restored from it).
 * A missing or non-finite `count` degrades to 1 rather than dropping the item;
 * an otherwise valid `count` (including a legacy 0 or fractional value) is
 * preserved byte-for-byte, so an old save re-saves identically. Extra slot-level
 * fields written by a newer build are preserved for the same reason.
 */
export function parseInvSlot(raw: unknown): InvSlot | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.itemId !== 'string' || raw.itemId.length === 0) return null;
  const copy = cloneJsonValue(raw, 0) as Record<string, unknown>;
  if (typeof copy.count !== 'number') copy.count = 1;
  const instance = parseItemInstance(raw.instance);
  if (instance) copy.instance = instance;
  else delete copy.instance;
  return copy as unknown as InvSlot;
}

/** Parse a whole persisted / wire-borne bag; a non-array degrades to an empty bag. */
export function parseInvSlots(raw: unknown): InvSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: InvSlot[] = [];
  for (const entry of raw) {
    const slot = parseInvSlot(entry);
    if (slot) out.push(slot);
  }
  return out;
}

/**
 * Parse a persisted / wire-borne LIST of instances (market escrow: one entry per
 * instanced copy held in a listing). A non-array degrades to an empty list and an
 * unusable entry is dropped, so those copies simply come back plain instead of
 * failing the load.
 */
export function parseItemInstances(raw: unknown): ItemInstance[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemInstance[] = [];
  for (const entry of raw) {
    const parsed = parseItemInstance(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Parse a persisted `slot -> instance` map (equipped pieces). Never throws. */
export function parseInstanceMap(raw: unknown): Record<string, ItemInstance> {
  const out: Record<string, ItemInstance> = {};
  if (!isPlainObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const instance = parseItemInstance(value);
    if (instance) out[key] = instance;
  }
  return out;
}

/** Deep-clone a `slot -> instance` map, or `undefined` when it is empty (so a
 *  character with no instanced gear serializes exactly as it did before). */
export function cloneInstanceMap(
  map: Record<string, ItemInstance>,
): Record<string, ItemInstance> | undefined {
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;
  const out: Record<string, ItemInstance> = {};
  for (const key of keys) out[key] = cloneItemInstance(map[key]);
  return out;
}

// -----------------------------------------------------------------------------
// Minting
// -----------------------------------------------------------------------------

/** What a caller wants baked into one new copy. Every field is optional; a mint
 *  that would bake nothing at all returns `undefined` (a plain stack). */
export interface MintInstanceOptions {
  /** The Maker's Bond: display name of the player who crafted/signed this copy. */
  signer?: string;
  /** The signer's entity id, so the bond survives a rename and can be resolved. */
  signerId?: number;
  /** Recipe that produced this copy. */
  craftedRecipeId?: string;
  /** Enchant applied to this copy (content id). */
  enchant?: string;
  /** Player entity id this copy is soulbound to. */
  boundTo?: number;
  /** Per-effect remaining charges. */
  charges?: Record<string, number>;
  /** Baked-in quality label for this copy. */
  quality?: string;
  /**
   * Probability in [0, 1] that this mint procs a masterwork. When present (even
   * as 0) the mint draws EXACTLY ONE number from `rng`, always at the same point,
   * so adding or tuning a proc never shifts the rest of the world's draw order.
   */
  masterworkChance?: number;
  /** Bonus stats baked in when the masterwork proc lands. */
  masterworkStats?: Record<string, number>;
}

/**
 * Mint one item instance. Deterministic: the same `Rng` state plus the same
 * options always yields the same instance, which is what makes a crafted item
 * replayable from a seed (see tests/item_instance.test.ts).
 */
export function mintItemInstance(
  rng: Rng,
  opts: MintInstanceOptions = {},
): ItemInstance | undefined {
  const instance: ItemInstance = {};
  if (opts.signer !== undefined) instance.signer = opts.signer;
  if (opts.signerId !== undefined) instance.signerId = opts.signerId;
  if (opts.craftedRecipeId !== undefined) instance.craftedRecipeId = opts.craftedRecipeId;
  if (opts.enchant !== undefined) instance.enchant = opts.enchant;
  if (opts.boundTo !== undefined) instance.boundTo = opts.boundTo;
  if (opts.charges !== undefined) instance.charges = { ...opts.charges };

  const rolled: NonNullable<ItemInstance['rolled']> = {};
  if (opts.quality !== undefined) rolled.quality = opts.quality;
  if (opts.masterworkChance !== undefined) {
    // One draw, unconditionally, whenever a proc is on the table.
    const proc = rng.next() < opts.masterworkChance;
    if (proc) {
      rolled.masterwork = true;
      if (opts.masterworkStats) rolled.stats = { ...opts.masterworkStats };
    }
  }
  if (Object.keys(rolled).length > 0) instance.rolled = rolled;

  return Object.keys(instance).length > 0 ? instance : undefined;
}
