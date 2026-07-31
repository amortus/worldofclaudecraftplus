// Enchanting wiring: the seam between the pure `src/sim/professions/enchanting`
// mechanics and the live Sim, plus the Sim <-> ClientWorld parity of everything
// the crafting UI reads. The mechanics are covered by enchanting.test.ts; this
// file is about the WIRING (the commands, the worn-slot write-back and its stat
// re-bake, the destructive replace, the disenchant yield, persistence, the
// IWorld surface, the wire).
//
// The load-bearing rules pinned here:
//   - applying OR replacing an enchant draws ZERO rng numbers, always
//   - a successful disenchant draws EXACTLY ONE, a denied one draws NONE

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the db layer so no Postgres is needed; the parity block drives a real
// GameServer to produce a real snapshot.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { type ClientSession, GameServer } from '../server/game';
import { ClientWorld } from '../src/net/online';
import { ENCHANTS, enchantById } from '../src/sim/content/professions';
import { ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { EnchantTarget } from '../src/sim/professions';
import type { SimEvent } from '../src/sim/types';

const STEP = 0x6d2b79f5;
const rngState = (sim: Sim) => (sim as any).rng.s >>> 0;
const drawsBetween = (before: number, after: number) => {
  for (let n = 0; n <= 4; n++) if (((before + STEP * n) >>> 0) === after) return n;
  return -1;
};

const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.find((e) => e.type === type) as Extract<SimEvent, { type: T }> | undefined;

const CHEST_STA = 'enchant_chest_stamina'; // base, chest, 3 dust + 2 essence, sta +3
const CHEST_SPI = 'enchant_chest_spirit'; // base, chest, 3 dust + 2 essence, spi +4
const LEGS_STA = 'enchant_legs_stamina'; // base, legs, 3 dust + 2 essence, sta +3
const WEAPON_MIGHT = 'enchant_weapon_might'; // base, mainhand, 5 dust, str +2

/** A level-10 warrior wearing a crafted mail chest, with materials in the bag. */
function wornSim(seed = 42, dust = 12, essence = 8) {
  const sim = new Sim({ seed, playerClass: 'warrior' });
  sim.setPlayerLevel(10);
  sim.addItem('copperguard_hauberk', 1);
  sim.equipItem('copperguard_hauberk');
  sim.addItem('arcane_dust', dust);
  sim.addItem('arcane_essence', essence);
  sim.events = [];
  return sim;
}

const worn = (slot: 'chest' | 'legs' | 'mainhand'): EnchantTarget => ({ where: 'worn', slot });
const bagIndexOf = (sim: Sim, itemId: string) =>
  sim.inventory.findIndex((s) => s.itemId === itemId);

describe('enchanting wiring: applying to a WORN slot', () => {
  it('bakes the bonus into the worn copy and re-bakes the character stats', () => {
    const sim = wornSim();
    const before = sim.player.stats.sta;
    const beforeHp = sim.player.maxHp;

    sim.applyEnchant(CHEST_STA, worn('chest'));

    const instance = sim.meta(sim.playerId)!.equipmentInstances.chest;
    expect(instance?.enchant).toBe(CHEST_STA);
    expect(instance?.rolled?.stats).toEqual({ sta: 3 });
    // The whole point of the worn arm: derived stats move, exactly like an equip.
    expect(sim.player.stats.sta).toBe(before + 3);
    expect(sim.player.maxHp).toBeGreaterThan(beforeHp);
    // Reagents consumed from the bag on the worn arm too.
    expect(sim.countItem('arcane_dust')).toBe(9);
    expect(sim.countItem('arcane_essence')).toBe(6);

    const applied = of(sim.events, 'enchantResult');
    expect(applied).toMatchObject({
      enchantId: CHEST_STA,
      itemId: 'copperguard_hauberk',
      where: 'worn',
      slot: 'chest',
      pid: sim.playerId,
    });
    expect(applied?.consumed).toEqual([
      { itemId: 'arcane_dust', count: 3 },
      { itemId: 'arcane_essence', count: 2 },
    ]);
    expect(applied?.replacedEnchantId).toBeUndefined();
    // Enchanting teaches the enchanting craft.
    expect(of(sim.events, 'craftSkill')).toMatchObject({
      professionId: 'enchanting',
      skill: 1,
      maxSkill: 125,
    });
  });

  it('survives an unequip / re-equip round trip and keeps the stats in step', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    const enchanted = sim.player.stats.sta;

    sim.unequipItem('chest');
    // Taking the piece off drops BOTH its def stats and the enchant baked into
    // that copy, which is what proves the bonus rides the copy and not the slot.
    expect(sim.player.stats.sta).toBe(enchanted - 3 - (ITEMS.copperguard_hauberk.stats?.sta ?? 0));
    const bagged = sim.inventory.find((s) => s.itemId === 'copperguard_hauberk');
    expect(bagged?.instance?.enchant).toBe(CHEST_STA);

    sim.equipItem('copperguard_hauberk');
    expect(sim.player.stats.sta).toBe(enchanted);
  });

  it("preserves the maker's signature under the enchant layer", () => {
    const sim = wornSim();
    // Re-mint the worn copy as a signed, crafted one.
    sim.meta(sim.playerId)!.equipmentInstances.chest = {
      signer: 'Gorm',
      signerId: 77,
      craftedRecipeId: 'recipe_copperguard_hauberk',
    };
    sim.applyEnchant(CHEST_STA, worn('chest'));
    const instance = sim.meta(sim.playerId)!.equipmentInstances.chest;
    expect(instance).toMatchObject({
      signer: 'Gorm',
      signerId: 77,
      craftedRecipeId: 'recipe_copperguard_hauberk',
      enchant: CHEST_STA,
    });
  });
});

describe('enchanting wiring: the destructive replace', () => {
  it('refuses an unconfirmed replace and names what would be destroyed', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    sim.events = [];

    sim.applyEnchant(CHEST_SPI, worn('chest'));
    const deny = of(sim.events, 'enchantDeny');
    expect(deny).toMatchObject({
      enchantId: CHEST_SPI,
      reason: 'already_enchanted',
      itemId: 'copperguard_hauberk',
      replacedEnchantId: CHEST_STA,
    });
    // The confirmation dialog needs the cost too, so it rides the deny.
    expect(deny?.reagents).toEqual([
      { itemId: 'arcane_dust', required: 3, held: 9, met: true },
      { itemId: 'arcane_essence', required: 2, held: 6, met: true },
    ]);
    // Nothing consumed, nothing changed.
    expect(sim.countItem('arcane_dust')).toBe(9);
    expect(sim.meta(sim.playerId)!.equipmentInstances.chest?.enchant).toBe(CHEST_STA);
  });

  it('refuses an identical re-apply even WITH consent, and burns nothing', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    sim.events = [];

    sim.applyEnchant(CHEST_STA, worn('chest'), true);
    expect(of(sim.events, 'enchantDeny')).toMatchObject({ reason: 'same_enchant' });
    expect(sim.countItem('arcane_dust')).toBe(9);
    expect(sim.countItem('arcane_essence')).toBe(6);
  });

  it('replaces with consent: ONLY the enchant layer changes', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    const staWithOld = sim.player.stats.sta;
    const spiBefore = sim.player.stats.spi;
    sim.events = [];

    sim.applyEnchant(CHEST_SPI, worn('chest'), true);
    const instance = sim.meta(sim.playerId)!.equipmentInstances.chest;
    expect(instance?.enchant).toBe(CHEST_SPI);
    // The old bonus is SUBTRACTED, and a stat that reaches zero is deleted
    // rather than left as residue.
    expect(instance?.rolled?.stats).toEqual({ spi: 4 });
    expect(sim.player.stats.sta).toBe(staWithOld - 3);
    expect(sim.player.stats.spi).toBe(spiBefore + 4);

    expect(of(sim.events, 'enchantResult')).toMatchObject({
      enchantId: CHEST_SPI,
      replaced: true,
      replacedEnchantId: CHEST_STA,
    });
    // The old materials are never refunded: enchanting is the sink.
    expect(sim.countItem('arcane_dust')).toBe(6);
    expect(sim.countItem('arcane_essence')).toBe(4);
  });

  it('treats only a strict boolean true as consent', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    sim.events = [];
    // A truthy non-boolean from an untrusted caller must not read as consent.
    sim.applyEnchant(CHEST_SPI, worn('chest'), 1 as unknown as boolean);
    expect(of(sim.events, 'enchantDeny')).toMatchObject({ reason: 'already_enchanted' });
    expect(sim.meta(sim.playerId)!.equipmentInstances.chest?.enchant).toBe(CHEST_STA);
  });
});

describe('enchanting wiring: applying to a BAGGED copy', () => {
  it('enchants exactly the targeted slot and leaves the rest of the stack plain', () => {
    const sim = wornSim();
    sim.addItem('copperguard_greaves', 2);
    const index = bagIndexOf(sim, 'copperguard_greaves');
    sim.events = [];

    sim.applyEnchant(LEGS_STA, { where: 'bag', index });
    expect(of(sim.events, 'enchantResult')).toMatchObject({
      enchantId: LEGS_STA,
      itemId: 'copperguard_greaves',
      where: 'bag',
    });
    const greaves = sim.inventory.filter((s) => s.itemId === 'copperguard_greaves');
    // One plain copy left behind, one enchanted copy in its own slot: an
    // instanced copy never stacks.
    expect(greaves.map((s) => s.count).sort()).toEqual([1, 1]);
    expect(greaves.filter((s) => s.instance?.enchant === LEGS_STA)).toHaveLength(1);
    expect(greaves.filter((s) => s.instance === undefined)).toHaveLength(1);
    // A bagged enchant is not worn, so nothing about the character changed.
    expect(sim.meta(sim.playerId)!.equipmentInstances.legs).toBeUndefined();
  });
});

describe('enchanting wiring: every denial', () => {
  const denials: [string, (sim: Sim) => void][] = [
    ['not_held', (sim) => sim.applyEnchant(LEGS_STA, worn('legs'))],
    ['wrong_slot', (sim) => sim.applyEnchant(WEAPON_MIGHT, worn('chest'))],
  ];
  it.each(denials)('refuses with %s and consumes nothing', (reason, act) => {
    const sim = wornSim();
    const dust = sim.countItem('arcane_dust');
    const before = rngState(sim);
    act(sim);
    expect(of(sim.events, 'enchantDeny')).toMatchObject({ reason });
    expect(of(sim.events, 'enchantResult')).toBeUndefined();
    expect(sim.countItem('arcane_dust')).toBe(dust);
    expect(drawsBetween(before, rngState(sim))).toBe(0);
  });

  it('refuses insufficient_materials and reports the short lines', () => {
    const sim = wornSim(42, 1, 0);
    sim.applyEnchant(CHEST_STA, worn('chest'));
    const deny = of(sim.events, 'enchantDeny');
    expect(deny).toMatchObject({ reason: 'insufficient_materials', itemId: 'copperguard_hauberk' });
    expect(deny?.reagents).toEqual([
      { itemId: 'arcane_dust', required: 3, held: 1, met: false },
      { itemId: 'arcane_essence', required: 2, held: 0, met: false },
    ]);
    expect(sim.countItem('arcane_dust')).toBe(1);
  });

  it('refuses a malformed target outright', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, { where: 'bag', index: -1 } as EnchantTarget);
    expect(of(sim.events, 'enchantDeny')).toMatchObject({ reason: 'not_held' });
    sim.events = [];
    sim.applyEnchant(CHEST_STA, { where: 'worn', slot: 'nonsense' } as unknown as EnchantTarget);
    expect(of(sim.events, 'enchantDeny')).toMatchObject({ reason: 'not_held' });
  });

  it('refuses an unknown enchant id silently (tamper-only)', () => {
    const sim = wornSim();
    sim.applyEnchant('enchant_not_a_thing', worn('chest'));
    expect(sim.events).toEqual([]);
    expect(sim.countItem('arcane_dust')).toBe(12);
  });

  it('refuses while dead and while busy on the shared, already localized lines', () => {
    const dead = wornSim();
    dead.player.dead = true;
    dead.applyEnchant(CHEST_STA, worn('chest'));
    expect(of(dead.events, 'error')).toMatchObject({ text: "You can't do that while dead." });

    const busy = wornSim();
    busy.player.castingAbility = 'gathering';
    busy.applyEnchant(CHEST_STA, worn('chest'));
    expect(of(busy.events, 'error')).toMatchObject({ text: 'You are busy.' });
    expect(busy.meta(busy.playerId)!.equipmentInstances.chest).toBeUndefined();
  });
});

describe('enchanting wiring: the zero-draw contract', () => {
  it('draws NOTHING on an apply, a replace, or any denial', () => {
    const sim = wornSim();
    const start = rngState(sim);
    sim.applyEnchant(CHEST_STA, worn('chest'));
    sim.applyEnchant(CHEST_SPI, worn('chest')); // denied (unconfirmed)
    sim.applyEnchant(CHEST_SPI, worn('chest'), true); // destructive replace
    sim.applyEnchant(CHEST_SPI, worn('chest'), true); // denied (same enchant)
    expect(rngState(sim)).toBe(start);
  });
});

describe('enchanting wiring: disenchant', () => {
  it('destroys the bagged piece and grants its materials', () => {
    const sim = wornSim();
    sim.addItem('copperguard_hauberk', 1);
    const index = bagIndexOf(sim, 'copperguard_hauberk');
    sim.events = [];

    const plan = sim.disenchantPreview(index)!;
    expect(plan).toEqual({ materialItemId: 'arcane_dust', minCount: 3, maxCount: 4 });

    const dustBefore = sim.countItem('arcane_dust');
    sim.disenchant(index);
    expect(sim.countItem('copperguard_hauberk')).toBe(0);
    const got = of(sim.events, 'disenchantResult')!;
    expect(got).toMatchObject({ itemId: 'copperguard_hauberk', materialItemId: 'arcane_dust' });
    // The preview is the truth: the resolve lands inside its stated range.
    expect(got.count).toBeGreaterThanOrEqual(plan.minCount);
    expect(got.count).toBeLessThanOrEqual(plan.maxCount);
    expect(sim.countItem('arcane_dust')).toBe(dustBefore + got.count);
    expect(got.secondaryItemId).toBeUndefined();
    expect(of(sim.events, 'craftSkill')).toMatchObject({ professionId: 'enchanting' });
  });

  it('yields the typed secondary on a rare piece, exactly as previewed', () => {
    const sim = wornSim();
    sim.addItem('cinderforged_hauberk', 1);
    const index = bagIndexOf(sim, 'cinderforged_hauberk');
    sim.events = [];

    const plan = sim.disenchantPreview(index)!;
    expect(plan).toEqual({
      materialItemId: 'arcane_essence',
      minCount: 1,
      maxCount: 2,
      secondaryItemId: 'resonant_links',
      secondaryCount: 1,
    });
    sim.disenchant(index);
    const got = of(sim.events, 'disenchantResult')!;
    expect(got.secondaryItemId).toBe('resonant_links');
    expect(got.secondaryCount).toBe(1);
    expect(sim.countItem('resonant_links')).toBe(1);
  });

  it('draws EXACTLY once on success and NEVER on a denial', () => {
    const sim = wornSim();
    sim.addItem('copperguard_hauberk', 1);
    const index = bagIndexOf(sim, 'copperguard_hauberk');
    const before = rngState(sim);
    sim.disenchant(index);
    expect(drawsBetween(before, rngState(sim))).toBe(1);

    for (const bad of [999, -1, bagIndexOf(sim, 'arcane_dust')]) {
      const state = rngState(sim);
      sim.events = [];
      sim.disenchant(bad);
      expect(drawsBetween(state, rngState(sim)), String(bad)).toBe(0);
      expect(of(sim.events, 'disenchantDeny'), String(bad)).toBeTruthy();
      expect(of(sim.events, 'disenchantResult'), String(bad)).toBeUndefined();
    }
  });

  it('refuses a material, a dead player and a busy one', () => {
    const sim = wornSim();
    sim.disenchant(bagIndexOf(sim, 'arcane_dust'));
    expect(of(sim.events, 'disenchantDeny')).toMatchObject({
      itemId: 'arcane_dust',
      reason: 'not_disenchantable',
    });

    sim.events = [];
    sim.player.dead = true;
    sim.disenchant(bagIndexOf(sim, 'arcane_dust'));
    expect(of(sim.events, 'error')).toMatchObject({ text: "You can't do that while dead." });

    sim.events = [];
    sim.player.dead = false;
    sim.player.castingAbility = 'gathering';
    sim.disenchant(bagIndexOf(sim, 'arcane_dust'));
    expect(of(sim.events, 'error')).toMatchObject({ text: 'You are busy.' });
  });

  it('never reaches a noDiscard piece, in the preview or the command', () => {
    const def = ITEMS.copperguard_hauberk;
    const sim = wornSim();
    sim.addItem('copperguard_hauberk', 1);
    const index = bagIndexOf(sim, 'copperguard_hauberk');
    sim.events = [];
    def.noDiscard = true;
    try {
      expect(sim.disenchantPreview(index)).toBe(null);
      const before = rngState(sim);
      sim.disenchant(index);
      expect(of(sim.events, 'disenchantDeny')).toMatchObject({ reason: 'not_disenchantable' });
      expect(sim.countItem('copperguard_hauberk')).toBe(1);
      expect(drawsBetween(before, rngState(sim))).toBe(0);
    } finally {
      delete def.noDiscard;
    }
  });
});

describe('enchanting wiring: persistence', () => {
  it('round-trips the enchanting skill and the worn enchant together', () => {
    const sim = wornSim();
    sim.applyEnchant(CHEST_STA, worn('chest'));
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect(saved.craftingProficiency).toEqual({ enchanting: 1 });
    expect(saved.equipmentInstances?.chest).toMatchObject({ enchant: CHEST_STA });

    const reloaded = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = reloaded.addPlayer('warrior', 'Ayla', { state: saved });
    expect(reloaded.meta(pid)!.crafting.enchanting).toBe(1);
    expect(reloaded.meta(pid)!.equipmentInstances.chest?.rolled?.stats).toEqual({ sta: 3 });
    // The bonus is live again on load, without a re-apply.
    expect(reloaded.entities.get(pid)!.stats.sta).toBe(sim.player.stats.sta);
  });
});

describe('enchanting wiring: the IWorld seam', () => {
  it('lists a slot enchants grouped base / runed / greater with reagent status', () => {
    const sim = wornSim();
    const rows = sim.slotEnchants('chest');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.itemSlot === 'chest')).toBe(true);
    const groups = rows.map((r) => r.group);
    expect(groups).toEqual([...groups].sort((a, b) => rank(a) - rank(b)));

    const sta = rows.find((r) => r.enchantId === CHEST_STA)!;
    expect(sta.statBonus).toEqual({ sta: 3 });
    expect(sta.reagentsMet).toBe(true);
    expect(sta.skillGain).toBe(1);
    expect(sta.reagents).toEqual([
      { itemId: 'arcane_dust', required: 3, held: 12, met: true },
      { itemId: 'arcane_essence', required: 2, held: 8, met: true },
    ]);
  });

  it('reads nothing but the shipped table, and draws nothing while reading', () => {
    const sim = wornSim();
    const before = rngState(sim);
    for (const slot of ['helmet', 'chest', 'legs', 'mainhand'] as const) {
      for (const row of sim.slotEnchants(slot)) {
        expect(enchantById(row.enchantId), row.enchantId).toBeTruthy();
      }
    }
    sim.disenchantPreview(0);
    expect(rngState(sim)).toBe(before);
  });
});

const rank = (g: string) => (g === 'base' ? 0 : g === 'runed' ? 1 : 2);

// ---------------------------------------------------------------------------
// Sim <-> ClientWorld parity
// ---------------------------------------------------------------------------

// A ClientWorld without the WebSocket plumbing, to drive applySnapshot directly.
function bareClient(pid: number): ClientWorld {
  const c: any = Object.create(ClientWorld.prototype);
  c.cfg = { seed: 20061, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = pid;
  c.ownPlayerId = pid;
  c.ownPlayerClass = 'warrior';
  c.spectating = null;
  c.moveInput = {};
  c.inventory = [];
  c.vendorBuyback = [];
  c.equipment = {};
  c.equipmentInstances = {};
  c.accountCosmetics = { completedQuestIds: [], mechChromaIds: [] };
  c.copper = 0;
  c.xp = 0;
  c.known = [];
  c.questLog = new Map();
  c.questsDone = new Set();
  c.pendingQuestCommands = new Map();
  c.partyInfo = null;
  c.tradeInfo = null;
  c.duelInfo = null;
  c.lastSnapAt = 0;
  c.snapInterval = 50;
  c.missingSince = new Map();
  c.pendingFacingDelta = 0;
  c.connected = true;
  c.eventQueue = [];
  c.mouselookFacing = null;
  c.lastInputSentAt = 0;
  c.lastInputSig = '';
  c.inputSeq = 0;
  c.pendingInputSeqSentAt = new Map();
  c.ackedInputSeq = 0;
  c.inputEchoSamples = [];
  c.spectateFacingPending = false;
  c.pendingSpectateFacing = null;
  return c;
}

function fakeWs() {
  const sent: any[] = [];
  const ws = { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) } as any;
  return { sent, ws };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) if (sent[i].t === 'snap') return sent[i];
  return null;
}

describe('enchanting wiring: Sim vs ClientWorld parity through applySnapshot', () => {
  let server: GameServer;
  beforeEach(() => {
    server = new GameServer();
  });
  afterEach(() => {
    server.stop?.();
    vi.clearAllMocks();
  });

  it('mirrors crafting skill, worn instances and every derived view', () => {
    const fc = fakeWs();
    const session = server.join(fc.ws, 1, 1, 'Ayla', 'warrior', null) as ClientSession;
    const sim = (server as any).sim as Sim;
    const pid = session.pid;

    sim.setPlayerLevel(10, pid);
    sim.addItem('copperguard_hauberk', 1, pid);
    sim.equipItem('copperguard_hauberk', pid);
    sim.addItem('arcane_dust', 12, pid);
    sim.addItem('arcane_essence', 8, pid);
    sim.addItem('cinderforged_hauberk', 1, pid);
    sim.applyEnchantFor(CHEST_STA, worn('chest'), undefined, pid);
    sim.meta(pid)!.crafting.smithing = 60;

    (server as any).broadcastSnapshots();
    const snap = lastSnap(fc.sent);
    expect(snap.self.craft).toEqual(sim.meta(pid)!.crafting);
    expect(snap.self.equipinst.chest.enchant).toBe(CHEST_STA);

    const client = bareClient(pid);
    (client as unknown as { applySnapshot(s: unknown): void }).applySnapshot(snap);

    expect(client.craftingSkills()).toEqual(sim.craftingSkillsFor(pid));
    expect(client.craftRecipes()).toEqual(sim.craftRecipesFor(pid));
    expect(client.craftRecipes('smithing')).toEqual(sim.craftRecipesFor(pid, 'smithing'));
    expect(client.slotEnchants('chest')).toEqual(sim.slotEnchantsFor(pid, 'chest'));
    expect(client.equipmentInstances.chest?.enchant).toBe(CHEST_STA);

    const index = client.inventory.findIndex((s) => s.itemId === 'cinderforged_hauberk');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(client.disenchantPreview(index)).toEqual(sim.disenchantPreviewFor(pid, index));
    // ...and the reagent rows the two worlds render are identical, which is the
    // whole point of deriving both from the same pure builder.
    const row = client.craftRecipes('smithing').find((r) => r.recipeId === 'recipe_ironguard_helm');
    expect(row).toEqual(
      sim.craftRecipesFor(pid, 'smithing').find((r) => r.recipeId === 'recipe_ironguard_helm'),
    );
  });

  it('routes the three commands over the wire and resolves them server-side', () => {
    const fc = fakeWs();
    const session = server.join(fc.ws, 2, 2, 'Bree', 'warrior', null) as ClientSession;
    const sim = (server as any).sim as Sim;
    const pid = session.pid;
    const send = (msg: unknown) => server.handleMessage(session, JSON.stringify(msg));

    sim.setPlayerLevel(10, pid);
    sim.addItem('copper_ore', 10, pid);
    sim.addItem('ironbark_log', 4, pid);
    send({ t: 'cmd', cmd: 'craft', recipeId: 'recipe_copperguard_hauberk' });
    expect(sim.countItem('copperguard_hauberk', pid)).toBe(1);
    expect(sim.meta(pid)!.crafting.smithing).toBe(1);

    sim.equipItem('copperguard_hauberk', pid);
    sim.addItem('arcane_dust', 3, pid);
    sim.addItem('arcane_essence', 2, pid);
    send({ t: 'cmd', cmd: 'enchant', enchantId: CHEST_STA, target: { where: 'worn', slot: 'chest' } });
    expect(sim.meta(pid)!.equipmentInstances.chest?.enchant).toBe(CHEST_STA);

    // A malformed target never reaches the Sim.
    const guard = rngState(sim);
    send({ t: 'cmd', cmd: 'enchant', enchantId: CHEST_STA, target: { where: 'pocket' } });
    send({ t: 'cmd', cmd: 'enchant', enchantId: CHEST_STA, target: { where: 'bag', index: 1.5 } });
    send({ t: 'cmd', cmd: 'craft', recipeId: 42 });
    send({ t: 'cmd', cmd: 'disenchant', index: -3 });
    expect(rngState(sim)).toBe(guard);

    sim.addItem('cinderforged_hauberk', 1, pid);
    const index = sim.meta(pid)!.inventory.findIndex((s) => s.itemId === 'cinderforged_hauberk');
    send({ t: 'cmd', cmd: 'disenchant', index });
    expect(sim.countItem('cinderforged_hauberk', pid)).toBe(0);
    expect(sim.countItem('resonant_links', pid)).toBe(1);
  });
});

describe('enchanting wiring: the shipped table is reachable', () => {
  it('routes every enchant to a slot the picker actually renders', () => {
    const sim = wornSim();
    const seen = new Set<string>();
    for (const slot of [
      'helmet',
      'shoulder',
      'chest',
      'waist',
      'legs',
      'feet',
      'gloves',
      'mainhand',
    ] as const) {
      for (const row of sim.slotEnchants(slot)) seen.add(row.enchantId);
    }
    expect(seen.size).toBe(Object.keys(ENCHANTS).length);
  });
});
