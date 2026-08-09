// Per-item identity across every OWNERSHIP HAND-OFF.
//
// `tests/item_instance.test.ts` covers the bag rules (stacking, cloning,
// parsing, minting). This file covers the boundaries where an item changes
// hands: the World Market (escrow / buy / cancel / expiry+collect), a
// face-to-face trade, and a vendor sale plus buyback. Every one of them used to
// rebuild the item as a bare `{ itemId, count }`, so listing an enchanted or
// maker-signed copy and cancelling the listing returned it PLAIN: a free
// enchant-and-signature stripper any player could run alone.
//
// The root cause was `Sim.removeItem` discarding what `removeFromSlots`
// reported it had taken. It now returns that, and each hand-off re-grants the
// identity on the other side.

import { describe, expect, it } from 'vitest';
import { copiesToSlots } from '../src/sim/item_instance';
import { type MarketSave, Sim } from '../src/sim/sim';
import type { Entity, InvSlot, ItemInstance } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

const makeWorld = () =>
  new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true, autoEquip: false });

// Two ordinary bits of content: a piece of gear (what an enchant lands on) and a
// stackable gray (what proves an instanced copy never folds into a plain stack).
const GEAR = 'apprentice_staff';
const OTHER_GEAR = 'keen_dirk';
const STACKABLE = 'wolf_fang';

const enchanted = (id = 'ench_int_greater'): ItemInstance => ({ enchant: id });
const signed = (signer = 'Ambrose'): ItemInstance => ({ signer, signerId: 7 });

const bagOf = (sim: Sim, pid: number): InvSlot[] =>
  (sim as unknown as { players: Map<number, { inventory: InvSlot[] }> }).players.get(pid)!.inventory;

const rowsOf = (sim: Sim, pid: number, itemId: string): InvSlot[] =>
  bagOf(sim, pid).filter((s) => s.itemId === itemId);

function npcNamed(sim: Sim, templateId: string): Entity {
  for (const e of sim.entities.values()) if (e.templateId === templateId) return e;
  throw new Error(`${templateId} was not spawned`);
}

function placeAt(sim: Sim, pid: number, x: number, z: number) {
  const e = sim.entities.get(pid)!;
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
}

function standAtMerchant(sim: Sim, pid: number) {
  const m = npcNamed(sim, 'the_merchant');
  placeAt(sim, pid, m.pos.x, m.pos.z);
}

function standAtVendor(sim: Sim, pid: number) {
  const v = npcNamed(sim, 'trader_wilkes');
  placeAt(sim, pid, v.pos.x + 2, v.pos.z);
}

// The seller's own (non-house) listing of an item.
function listingOf(sim: Sim, itemId: string) {
  const l = sim.marketListings.find((x) => x.itemId === itemId && !x.house);
  if (!l) throw new Error(`no player listing of ${itemId}`);
  return l;
}

// -----------------------------------------------------------------------------

describe('copiesToSlots (the hand-off shape)', () => {
  it('folds the plain copies into one stack and gives each instance its own slot', () => {
    expect(copiesToSlots(GEAR, 3, [enchanted()])).toEqual([
      { itemId: GEAR, count: 2 },
      { itemId: GEAR, count: 1, instance: enchanted() },
    ]);
  });

  it('is exactly the old plain stack when nothing is instanced', () => {
    expect(copiesToSlots(GEAR, 4)).toEqual([{ itemId: GEAR, count: 4 }]);
    expect(copiesToSlots(GEAR, 0)).toEqual([]);
  });

  it('clones, so the handed-out row never aliases the escrowed payload', () => {
    const held = enchanted();
    const [row] = copiesToSlots(GEAR, 1, [held]);
    expect(row.instance).toEqual(held);
    expect(row.instance).not.toBe(held);
  });

  it('ignores instances beyond the copy count', () => {
    expect(copiesToSlots(GEAR, 1, [enchanted(), signed()])).toEqual([
      { itemId: GEAR, count: 1, instance: enchanted() },
    ]);
  });
});

describe('Sim.removeItem reports what it took (the root cause)', () => {
  it('hands back the instance of every instanced copy it consumed', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    sim.addItem(GEAR, 1, pid, enchanted());

    const taken = sim.removeItem(GEAR, 1, pid);

    expect(taken.removed).toBe(1);
    expect(taken.instances).toEqual([enchanted()]);
  });

  it('reports plain copies with no instances, and an unknown player as nothing taken', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    sim.addItem(STACKABLE, 3, pid);

    expect(sim.removeItem(STACKABLE, 2, pid)).toEqual({ removed: 2, instances: [] });
    expect(sim.removeItem(STACKABLE, 5, 999999)).toEqual({ removed: 0, instances: [] });
  });
});

describe('World Market keeps per-item identity', () => {
  it('an enchanted item survives list then cancel (the cheapest strip exploit)', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    sim.addItem(GEAR, 1, seller, enchanted());

    sim.marketList(GEAR, 1, 500, seller);
    expect(rowsOf(sim, seller, GEAR)).toEqual([]);
    const listing = listingOf(sim, GEAR);
    expect(listing.instances).toEqual([enchanted()]);

    sim.marketCancel(listing.id, seller);

    expect(rowsOf(sim, seller, GEAR)).toEqual([{ itemId: GEAR, count: 1, instance: enchanted() }]);
  });

  it('a maker-signed item survives a completed sale, reaching the BUYER intact', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    const buyer = sim.addPlayer('warrior', 'Buyer');
    standAtMerchant(sim, seller);
    standAtMerchant(sim, buyer);
    sim.players.get(buyer)!.copper = 10_000;
    sim.addItem(GEAR, 1, seller, signed());

    sim.marketList(GEAR, 1, 500, seller);
    sim.marketBuy(listingOf(sim, GEAR).id, buyer);

    expect(rowsOf(sim, buyer, GEAR)).toEqual([{ itemId: GEAR, count: 1, instance: signed() }]);
    expect(rowsOf(sim, seller, GEAR)).toEqual([]);
  });

  it('an expired listing waits at the Merchant with its identity and collects intact', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    sim.addItem(GEAR, 1, seller, enchanted());
    sim.marketList(GEAR, 1, 500, seller);

    listingOf(sim, GEAR).expiresAt = sim.time - 1;
    for (let i = 0; i < 40; i++) sim.tick();
    expect(sim.marketListings.some((l) => l.itemId === GEAR && !l.house)).toBe(false);

    standAtMerchant(sim, seller);
    const info = sim.marketInfoFor(seller)!;
    expect(info.collectionItems.some((s) => s.itemId === GEAR)).toBe(true);
    sim.marketCollect(seller);

    expect(rowsOf(sim, seller, GEAR)).toEqual([{ itemId: GEAR, count: 1, instance: enchanted() }]);
  });

  it('a reclaimed instanced copy opens its own bag slot, never merging into a plain stack', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    // Escrow the instanced copy FIRST (removeFromSlots would take a plain one
    // otherwise), then stock plain copies for it to come home to.
    sim.addItem(STACKABLE, 1, seller, signed());
    sim.marketList(STACKABLE, 1, 500, seller);
    sim.addItem(STACKABLE, 2, seller);

    sim.marketCancel(listingOf(sim, STACKABLE).id, seller);

    expect(rowsOf(sim, seller, STACKABLE)).toEqual([
      { itemId: STACKABLE, count: 2 },
      { itemId: STACKABLE, count: 1, instance: signed() },
    ]);
    expect(sim.countItem(STACKABLE, seller)).toBe(3);
  });

  it('a mixed listing returns the right split of plain and instanced copies', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    sim.addItem(STACKABLE, 2, seller);
    sim.addItem(STACKABLE, 1, seller, enchanted());

    sim.marketList(STACKABLE, 3, 500, seller);
    const listing = listingOf(sim, STACKABLE);
    expect(listing.count).toBe(3);
    expect(listing.instances).toEqual([enchanted()]);

    sim.marketCancel(listing.id, seller);

    expect(rowsOf(sim, seller, STACKABLE)).toEqual([
      { itemId: STACKABLE, count: 2 },
      { itemId: STACKABLE, count: 1, instance: enchanted() },
    ]);
  });

  it('an all-plain listing carries no instances key at all (unchanged shape)', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    sim.addItem(STACKABLE, 2, seller);

    sim.marketList(STACKABLE, 2, 500, seller);

    expect('instances' in listingOf(sim, STACKABLE)).toBe(false);
    expect(sim.serializeMarket().listings.every((l) => !('instances' in l))).toBe(true);
  });

  it('escrowed identity survives a save/load round trip, and an old save still loads', () => {
    const sim = makeWorld();
    const seller = sim.addPlayer('mage', 'Seller');
    standAtMerchant(sim, seller);
    sim.addItem(GEAR, 1, seller, enchanted());
    sim.marketList(GEAR, 1, 500, seller);
    // Through JSON, exactly as the world_state JSONB row round trips it.
    const save = JSON.parse(JSON.stringify(sim.serializeMarket())) as MarketSave;
    expect(save.listings[0].instances).toEqual([enchanted()]);

    const reborn = makeWorld();
    reborn.loadMarket(save);
    const seller2 = reborn.addPlayer('mage', 'Seller');
    standAtMerchant(reborn, seller2);
    // The reloaded listing keeps the same seller key (pid-derived), so re-add the
    // player first and reclaim through the real path.
    const l = listingOf(reborn, GEAR);
    l.sellerKey = String(seller2);
    reborn.marketCancel(l.id, seller2);
    expect(rowsOf(reborn, seller2, GEAR)).toEqual([
      { itemId: GEAR, count: 1, instance: enchanted() },
    ]);

    // A save written before per-item identity existed has no `instances` key.
    const legacy = JSON.parse(JSON.stringify(save)) as MarketSave;
    for (const row of legacy.listings) delete row.instances;
    const old = makeWorld();
    old.loadMarket(legacy);
    expect(listingOf(old, GEAR).instances).toBeUndefined();
  });
});

describe('face-to-face trade keeps per-item identity', () => {
  it('carries the instance in BOTH directions of one trade', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    const b = sim.addPlayer('mage', 'Bet');
    placeAt(sim, a, 0, -40);
    placeAt(sim, b, 3, -40);
    sim.addItem(GEAR, 1, a, enchanted());
    sim.addItem(OTHER_GEAR, 1, b, signed());

    sim.tradeRequest(b, a);
    sim.tradeAccept(b);
    sim.tradeSetOffer([{ itemId: GEAR, count: 1 }], 0, a);
    sim.tradeSetOffer([{ itemId: OTHER_GEAR, count: 1 }], 0, b);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);

    expect(rowsOf(sim, b, GEAR)).toEqual([{ itemId: GEAR, count: 1, instance: enchanted() }]);
    expect(rowsOf(sim, a, OTHER_GEAR)).toEqual([
      { itemId: OTHER_GEAR, count: 1, instance: signed() },
    ]);
    expect(rowsOf(sim, a, GEAR)).toEqual([]);
    expect(rowsOf(sim, b, OTHER_GEAR)).toEqual([]);
  });

  it('hands over the plain copy first when the giver owns both', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    const b = sim.addPlayer('mage', 'Bet');
    placeAt(sim, a, 0, -40);
    placeAt(sim, b, 3, -40);
    sim.addItem(STACKABLE, 1, a, signed());
    sim.addItem(STACKABLE, 1, a);

    sim.tradeRequest(b, a);
    sim.tradeAccept(b);
    sim.tradeSetOffer([{ itemId: STACKABLE, count: 1 }], 0, a);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);

    expect(rowsOf(sim, b, STACKABLE)).toEqual([{ itemId: STACKABLE, count: 1 }]);
    expect(rowsOf(sim, a, STACKABLE)).toEqual([
      { itemId: STACKABLE, count: 1, instance: signed() },
    ]);
  });

  it('the received copy lands in its own slot beside the receiver plain stack', () => {
    const sim = makeWorld();
    const a = sim.addPlayer('warrior', 'Aleph');
    const b = sim.addPlayer('mage', 'Bet');
    placeAt(sim, a, 0, -40);
    placeAt(sim, b, 3, -40);
    sim.addItem(STACKABLE, 1, a, enchanted());
    sim.addItem(STACKABLE, 2, b);

    sim.tradeRequest(b, a);
    sim.tradeAccept(b);
    sim.tradeSetOffer([{ itemId: STACKABLE, count: 1 }], 0, a);
    sim.tradeConfirm(a);
    sim.tradeConfirm(b);

    expect(rowsOf(sim, b, STACKABLE)).toEqual([
      { itemId: STACKABLE, count: 2 },
      { itemId: STACKABLE, count: 1, instance: enchanted() },
    ]);
  });
});

describe('vendor sale and buyback keep per-item identity', () => {
  it('an enchanted item survives sell then buy back', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    standAtVendor(sim, pid);
    sim.addItem(GEAR, 1, pid, enchanted());

    sim.sellItem(GEAR, 1, pid);
    expect(sim.players.get(pid)!.vendorBuyback).toEqual([
      { itemId: GEAR, count: 1, instance: enchanted() },
    ]);

    sim.buyBackItem(GEAR, pid);

    expect(rowsOf(sim, pid, GEAR)).toEqual([{ itemId: GEAR, count: 1, instance: enchanted() }]);
    expect(sim.players.get(pid)!.vendorBuyback).toEqual([]);
  });

  it('an instanced copy never merges into a plain buyback row', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    standAtVendor(sim, pid);
    // Sell the instanced copy first, then a plain one: the plain sale must open
    // its own row rather than folding into the instanced one, and vice versa.
    sim.addItem(STACKABLE, 1, pid, signed());
    sim.sellItem(STACKABLE, 1, pid);
    sim.addItem(STACKABLE, 1, pid);
    sim.sellItem(STACKABLE, 1, pid);

    expect(sim.players.get(pid)!.vendorBuyback).toEqual([
      { itemId: STACKABLE, count: 1 },
      { itemId: STACKABLE, count: 1, instance: signed() },
    ]);
  });

  it('a plain sale still merges with the plain row, and both copies buy back correctly', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    standAtVendor(sim, pid);
    sim.players.get(pid)!.copper = 10_000;
    sim.addItem(STACKABLE, 1, pid, signed());
    sim.sellItem(STACKABLE, 1, pid);
    sim.addItem(STACKABLE, 2, pid);
    sim.sellItem(STACKABLE, 1, pid);
    sim.sellItem(STACKABLE, 1, pid);

    const buyback = sim.players.get(pid)!.vendorBuyback;
    expect(buyback).toEqual([
      { itemId: STACKABLE, count: 2 },
      { itemId: STACKABLE, count: 1, instance: signed() },
    ]);

    sim.buyBackItem(STACKABLE, pid); // the plain row is the most recent
    sim.buyBackItem(STACKABLE, pid);
    sim.buyBackItem(STACKABLE, pid); // now the instanced one

    expect(rowsOf(sim, pid, STACKABLE)).toEqual([
      { itemId: STACKABLE, count: 2 },
      { itemId: STACKABLE, count: 1, instance: signed() },
    ]);
    expect(sim.players.get(pid)!.vendorBuyback).toEqual([]);
  });

  it('bulk junk selling records each instanced copy on its own buyback row', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    standAtVendor(sim, pid);
    sim.addItem(STACKABLE, 2, pid);
    sim.addItem(STACKABLE, 1, pid, enchanted());

    sim.sellAllJunk(pid);

    expect(sim.countItem(STACKABLE, pid)).toBe(0);
    const buyback = sim.players.get(pid)!.vendorBuyback.filter((s) => s.itemId === STACKABLE);
    expect(buyback).toEqual([
      { itemId: STACKABLE, count: 1, instance: enchanted() },
      { itemId: STACKABLE, count: 2 },
    ]);
  });

  it('a repurchased copy does not share its payload with the buyback list', () => {
    const sim = makeWorld();
    const pid = sim.addPlayer('mage', 'Rowan');
    standAtVendor(sim, pid);
    sim.addItem(GEAR, 1, pid, enchanted());
    const held = bagOf(sim, pid).find((s) => s.itemId === GEAR)!.instance!;

    sim.sellItem(GEAR, 1, pid);
    sim.buyBackItem(GEAR, pid);

    const back = rowsOf(sim, pid, GEAR)[0];
    expect(back.instance).toEqual(enchanted());
    expect(back.instance).not.toBe(held);
    expect(back.instance).not.toBe(sim.players.get(pid)!.vendorBuyback[0]?.instance);
  });
});
