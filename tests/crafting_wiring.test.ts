// Crafting wiring: the seam between the pure `src/sim/professions/crafting`
// mechanics and the live Sim. The mechanics themselves are covered by
// crafting.test.ts / professions_content.test.ts; everything here is about the
// WIRING (the command, the gates, the grant, the skill-up, persistence, the
// IWorld surface) and about the determinism contract at that seam.
//
// The load-bearing rule this file pins: a successful craft draws EXACTLY ONE
// rng number and a denied one draws NONE. A change to either reorders the
// world's rng and desyncs every player on the realm.

import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES, CRAFTING_MAX_SKILL, recipeById } from '../src/sim/content/professions';
import { ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

const makeSim = (seed = 42) => new Sim({ seed, playerClass: 'warrior' });

// One mulberry32 step is one addition of 0x6D2B79F5 (mod 2^32); the gathering
// wiring test pins the same identity, and it is what turns "how many draws did
// that command make" into an exact assertion rather than an inequality.
const STEP = 0x6d2b79f5;
const rngState = (sim: Sim) => (sim as any).rng.s >>> 0;
const drawsBetween = (before: number, after: number) => {
  for (let n = 0; n <= 4; n++) if (((before + STEP * n) >>> 0) === after) return n;
  return -1;
};

/** Rung 1 smithing: 10 copper ore + 4 ironbark log -> one Copperguard Hauberk. */
const HAUBERK = 'recipe_copperguard_hauberk';
/** Rung 4 smithing: the only rung whose material tier feeds the proc term. */
const CINDER = 'recipe_cinderforged_hauberk';
/** Rung 1 alchemy: a stats-free consumable that comes TWO to a craft, so it can
 *  never masterwork and never mints an instance. */
const DRAUGHT = 'recipe_silverleaf_draught';

/** Put every reagent a recipe needs in the bag (optionally with extras). */
function stockReagents(sim: Sim, recipeId: string, extra = 0, pid?: number) {
  const recipe = recipeById(recipeId);
  if (!recipe) throw new Error(`no recipe ${recipeId}`);
  for (const r of recipe.reagents) sim.addItem(r.itemId, r.count + extra, pid);
  sim.events = [];
  return recipe;
}

const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.find((e) => e.type === type) as Extract<SimEvent, { type: T }> | undefined;

describe('crafting wiring: a successful craft end to end', () => {
  it('consumes the reagents, grants the item and teaches the skill', () => {
    const sim = makeSim();
    const recipe = stockReagents(sim, HAUBERK, 3);
    sim.craft(HAUBERK);

    // Reagents consumed, exactly the declared amounts, extras untouched.
    expect(sim.countItem('copper_ore')).toBe(3);
    expect(sim.countItem('ironbark_log')).toBe(3);
    expect(sim.countItem('copperguard_hauberk')).toBe(1);

    const done = of(sim.events, 'craftResult');
    expect(done).toMatchObject({
      recipeId: HAUBERK,
      professionId: 'smithing',
      itemId: 'copperguard_hauberk',
      count: 1,
      pid: sim.playerId,
    });
    expect(done?.consumed).toEqual([
      { itemId: 'copper_ore', count: 10 },
      { itemId: 'ironbark_log', count: 4 },
    ]);
    // Rung 1 at skill 0 is the full-rate rung.
    expect(done).toMatchObject({ skillGain: 1, nextSkill: 1, signer: sim.player.name });
    expect(of(sim.events, 'craftSkill')).toMatchObject({
      professionId: 'smithing',
      skill: 1,
      maxSkill: 125,
    });
    expect(sim.meta(sim.playerId)!.crafting.smithing).toBe(1);
    expect(recipe.professionId).toBe('smithing');
  });

  it('signs crafted GEAR with the maker but leaves consumables fungible', () => {
    const sim = makeSim();
    stockReagents(sim, HAUBERK);
    sim.craft(HAUBERK);
    const gear = sim.inventory.find((s) => s.itemId === 'copperguard_hauberk');
    expect(gear?.instance?.signer).toBe(sim.player.name);
    expect(gear?.instance?.signerId).toBe(sim.playerId);
    expect(gear?.instance?.craftedRecipeId).toBe(HAUBERK);

    stockReagents(sim, DRAUGHT);
    sim.craft(DRAUGHT);
    const potions = sim.inventory.filter((s) => s.itemId === 'silverleaf_draught');
    // Two to a craft, in ONE plain stack: an instanced copy would never stack.
    expect(potions).toHaveLength(1);
    expect(potions[0].count).toBe(2);
    expect(potions[0].instance).toBeUndefined();
  });

  it('never eats a signed reagent while a plain copy exists (removeFromSlots)', () => {
    const sim = makeSim();
    const recipe = recipeById(HAUBERK)!;
    // One signed ore among plain ones. removeFromSlots takes plain stacks first,
    // so the signed copy must survive a cost that could have consumed it.
    sim.addItem('copper_ore', 10);
    sim.addItem('copper_ore', 1, sim.playerId, { signer: 'Gorm', signerId: 77 });
    sim.addItem('ironbark_log', recipe.reagents[1].count);
    sim.events = [];
    sim.craft(HAUBERK);
    const signed = sim.inventory.filter((s) => s.itemId === 'copper_ore' && s.instance);
    expect(signed).toHaveLength(1);
    expect(signed[0].instance?.signer).toBe('Gorm');
    // ...and holding it raised the proc odds, which the event reports.
    expect(of(sim.events, 'craftResult')?.signedReagentUsed).toBe(true);
  });
});

describe('crafting wiring: the masterwork proc', () => {
  it('procs from a fixed seed, upgrading exactly one copy', () => {
    // Seed 6's first draw is below the 0.10 chance a capped smith gets on the
    // rung-4 recipe with a signed reagent (0.03 base + 0.02 two tiers above
    // + 0.02 signed + 0.03 material tier 3).
    const sim = makeSim(6);
    sim.meta(sim.playerId)!.crafting.smithing = CRAFTING_MAX_SKILL.smithing;
    const recipe = stockReagents(sim, CINDER);
    // One extra, SIGNED, copy of the lead reagent: holding it raises the proc
    // odds by MASTERWORK_SIGNED_CHANCE and `removeFromSlots` leaves it alone.
    sim.addItem(recipe.reagents[0].itemId, 1, sim.playerId, { signer: 'Gorm', signerId: 77 });
    sim.events = [];

    sim.craft(CINDER);
    const done = of(sim.events, 'craftResult');
    expect(done?.masterwork).toBe(true);
    expect(done?.signedReagentUsed).toBe(true);
    // The bake is a deterministic fraction of the item's own profile, additive
    // on top of the def's stats (armor 215 / sta 9 / str 5).
    expect(done?.masterworkStats).toEqual({ str: 2, sta: 3, armor: 72 });
    const copy = sim.inventory.find((s) => s.itemId === 'cinderforged_hauberk');
    expect(copy?.instance?.rolled?.masterwork).toBe(true);
    expect(copy?.instance?.rolled?.stats).toEqual({ str: 2, sta: 3, armor: 72 });
    // At the cap the craft teaches nothing, so no skill event rides along.
    expect(done).toMatchObject({ skillGain: 0, nextSkill: 125 });
    expect(of(sim.events, 'craftSkill')).toBeUndefined();
  });

  it('omits the masterwork fields on an ordinary craft', () => {
    const sim = makeSim();
    stockReagents(sim, HAUBERK);
    sim.craft(HAUBERK);
    const done = of(sim.events, 'craftResult');
    expect(done?.masterwork).toBeUndefined();
    expect(done?.masterworkStats).toBeUndefined();
    expect(
      sim.inventory.find((s) => s.itemId === 'copperguard_hauberk')?.instance?.rolled,
    ).toBeUndefined();
  });
});

describe('crafting wiring: the draw contract', () => {
  it('draws EXACTLY once per successful craft, even when nothing can masterwork', () => {
    for (const recipeId of [HAUBERK, DRAUGHT]) {
      const sim = makeSim();
      stockReagents(sim, recipeId);
      const before = rngState(sim);
      sim.craft(recipeId);
      expect(drawsBetween(before, rngState(sim)), recipeId).toBe(1);
    }
  });

  it('draws NOTHING on any refusal', () => {
    const refusals: [string, () => void][] = [];
    const sims: Sim[] = [];
    const push = (label: string, build: () => Sim, act: (sim: Sim) => void) => {
      const sim = build();
      sims.push(sim);
      refusals.push([label, () => act(sim)]);
    };
    push('unknown recipe', () => makeSim(), (sim) => sim.craft('recipe_no_such_thing'));
    push(
      'insufficient materials',
      () => {
        const sim = makeSim();
        sim.addItem('copper_ore', 1);
        sim.events = [];
        return sim;
      },
      (sim) => sim.craft(HAUBERK),
    );
    push(
      'dead',
      () => {
        const sim = makeSim();
        stockReagents(sim, HAUBERK);
        sim.player.dead = true;
        return sim;
      },
      (sim) => sim.craft(HAUBERK),
    );
    push(
      'busy',
      () => {
        const sim = makeSim();
        stockReagents(sim, HAUBERK);
        sim.player.castingAbility = 'gathering';
        return sim;
      },
      (sim) => sim.craft(HAUBERK),
    );
    refusals.forEach(([label, act], i) => {
      const sim = sims[i];
      const before = rngState(sim);
      act();
      expect(drawsBetween(before, rngState(sim)), label).toBe(0);
      expect(of(sim.events, 'craftResult'), label).toBeUndefined();
      expect(sim.countItem('copperguard_hauberk'), label).toBe(0);
    });
  });
});

describe('crafting wiring: every denial', () => {
  it('reports the short reagent lines on insufficient_materials', () => {
    const sim = makeSim();
    sim.addItem('copper_ore', 4);
    sim.events = [];
    sim.craft(HAUBERK);
    const deny = of(sim.events, 'craftDeny');
    expect(deny).toMatchObject({
      recipeId: HAUBERK,
      professionId: 'smithing',
      reason: 'insufficient_materials',
      pid: sim.playerId,
    });
    expect(deny?.reagents).toEqual([
      { itemId: 'copper_ore', required: 10, held: 4, met: false },
      { itemId: 'ironbark_log', required: 4, held: 0, met: false },
    ]);
    expect(sim.countItem('copper_ore')).toBe(4); // nothing consumed
  });

  it('refuses an unknown recipe id silently (tamper-only, like an unknown equip)', () => {
    const sim = makeSim();
    stockReagents(sim, HAUBERK);
    sim.craft('recipe_not_a_thing');
    expect(sim.events).toEqual([]);
    expect(sim.countItem('copper_ore')).toBe(10);
  });

  it('refuses while dead and while busy on the shared, already localized lines', () => {
    const dead = makeSim();
    stockReagents(dead, HAUBERK);
    dead.player.dead = true;
    dead.craft(HAUBERK);
    // The two host-level refusals every player action shares. Reusing these
    // exact literals is what keeps the deny EVENTS a 1:1 mirror of the pure
    // module's own reason union.
    expect(of(dead.events, 'error')).toMatchObject({ text: "You can't do that while dead." });
    expect(dead.countItem('copperguard_hauberk')).toBe(0);

    const busy = makeSim();
    stockReagents(busy, HAUBERK);
    busy.player.castingAbility = 'gathering';
    busy.craft(HAUBERK);
    expect(of(busy.events, 'error')).toMatchObject({ text: 'You are busy.' });
    expect(busy.countItem('copperguard_hauberk')).toBe(0);
  });

  it('keeps every crafting-specific event text-free: ids and numbers only', () => {
    const sim = makeSim();
    stockReagents(sim, HAUBERK);
    sim.craft(HAUBERK);
    sim.addItem('copper_ore', 1);
    sim.events = sim.events.filter((e) => e.type !== 'loot');
    sim.craft(HAUBERK); // denied: short reagents
    // No English reaches the log/error channels from the crafting arms
    // themselves; every line is composed and localized by the client.
    expect(sim.events.some((e) => e.type === 'error' || e.type === 'log')).toBe(false);
    for (const ev of sim.events) {
      for (const value of Object.values(ev as Record<string, unknown>)) {
        // The only strings are stable ids (no spaces, no punctuation).
        if (typeof value === 'string') expect(value).toMatch(/^[a-z0-9_]*$/i);
      }
    }
  });
});

describe('crafting wiring: persistence', () => {
  it('omits the key entirely until the character has crafted', () => {
    const sim = makeSim();
    expect('craftingProficiency' in sim.serializeCharacter(sim.playerId)!).toBe(false);
  });

  it('round-trips crafting skill', () => {
    const sim = makeSim();
    stockReagents(sim, HAUBERK);
    sim.craft(HAUBERK);
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect(saved.craftingProficiency).toEqual({ smithing: 1 });

    const reloaded = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = reloaded.addPlayer('warrior', 'Ayla', { state: saved });
    expect(reloaded.meta(pid)!.crafting).toEqual({
      smithing: 1,
      woodcraft: 0,
      alchemy: 0,
      enchanting: 0,
    });
  });

  it('loads a pre-feature save unchanged and clamps a tampered one', () => {
    const donor = makeSim();
    const legacy = donor.serializeCharacter(donor.playerId)!;
    delete (legacy as any).craftingProficiency;
    delete (legacy as any).gatheringProficiency;
    delete (legacy as any).deeds;
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Old', { state: legacy as any });
    expect(sim.meta(pid)!.crafting).toEqual({
      smithing: 0,
      woodcraft: 0,
      alchemy: 0,
      enchanting: 0,
    });
    // ...and a save that never had the key re-serializes without it.
    expect('craftingProficiency' in sim.serializeCharacter(pid)!).toBe(false);

    const tampered = {
      ...(legacy as any),
      craftingProficiency: { smithing: 9999, bogus: 5, alchemy: -3 },
    };
    const pid2 = sim.addPlayer('warrior', 'Cheat', { state: tampered as any });
    const c = sim.meta(pid2)!.crafting as Record<string, number>;
    expect(c.smithing).toBe(125); // clamped to the craft ceiling
    expect(c.alchemy).toBe(0);
    expect(c.bogus).toBeUndefined();
  });
});

describe('crafting wiring: the IWorld seam', () => {
  it('exposes one skill row per craft with its own ceiling', () => {
    const sim = makeSim();
    expect(sim.craftingSkills()).toEqual([
      { professionId: 'smithing', skill: 0, maxSkill: 125 },
      { professionId: 'woodcraft', skill: 0, maxSkill: 125 },
      { professionId: 'alchemy', skill: 0, maxSkill: 125 },
      { professionId: 'enchanting', skill: 0, maxSkill: 125 },
    ]);
  });

  it('lists every recipe with reagent status, and filters by craft', () => {
    const sim = makeSim();
    expect(sim.craftRecipes()).toHaveLength(CRAFT_RECIPES.length);
    const smithing = sim.craftRecipes('smithing');
    expect(smithing.every((r) => r.professionId === 'smithing')).toBe(true);

    const row = smithing.find((r) => r.recipeId === HAUBERK)!;
    expect(row).toMatchObject({
      resultItemId: 'copperguard_hauberk',
      resultCount: 1,
      skillReq: 0,
      level: 5,
      recipeTier: 0,
      capabilityTier: 0,
      masteryState: 'full',
      skillGain: 1,
      canCraft: false,
    });
    expect(row.masterworkChance).toBeCloseTo(0.03, 10);
    expect(row.reagents).toEqual([
      { itemId: 'copper_ore', required: 10, held: 0, met: false },
      { itemId: 'ironbark_log', required: 4, held: 0, met: false },
    ]);

    stockReagents(sim, HAUBERK);
    const stocked = sim.craftRecipes('smithing').find((r) => r.recipeId === HAUBERK)!;
    expect(stocked.canCraft).toBe(true);
    expect(stocked.reagents.every((r) => r.met)).toBe(true);
  });

  it('greys a rung the crafter has outgrown, and never draws while reading', () => {
    const sim = makeSim();
    sim.meta(sim.playerId)!.crafting.smithing = 100; // capability tier 4
    const before = rngState(sim);
    const row = sim.craftRecipes('smithing').find((r) => r.recipeId === HAUBERK)!;
    expect(row.masteryState).toBe('none');
    expect(row.skillGain).toBe(0);
    expect(rngState(sim)).toBe(before);
  });

  it('names a real item for every recipe result', () => {
    for (const row of makeSim().craftRecipes()) {
      expect(ITEMS[row.resultItemId], row.recipeId).toBeTruthy();
    }
  });
});

describe('crafting wiring: multiplayer', () => {
  it('resolves per player: one crafter never touches another bag or skill', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Ayla');
    const b = sim.addPlayer('rogue', 'Bree');
    stockReagents(sim, HAUBERK, 0, a);
    stockReagents(sim, HAUBERK, 0, b);
    sim.events = [];

    sim.craftItem(HAUBERK, a);
    expect(sim.countItem('copperguard_hauberk', a)).toBe(1);
    expect(sim.countItem('copperguard_hauberk', b)).toBe(0);
    expect(sim.countItem('copper_ore', b)).toBe(10);
    expect(sim.meta(a)!.crafting.smithing).toBe(1);
    expect(sim.meta(b)!.crafting.smithing).toBe(0);
    // The completion is personal (carries `pid`), so only the crafter sees it.
    expect(of(sim.events, 'craftResult')?.pid).toBe(a);
    expect(of(sim.events, 'craftSkill')?.pid).toBe(a);
    // ...and the signature names the crafter, not the primary player.
    expect(
      sim.meta(a)!.inventory.find((s) => s.itemId === 'copperguard_hauberk')?.instance?.signer,
    ).toBe('Ayla');
  });
});
