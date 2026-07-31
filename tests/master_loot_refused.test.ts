import { describe, expect, it } from 'vitest';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { MOBS } from '../src/sim/data';

// A master looter picks a player who has since stopped being eligible (left the group,
// logged out, left the instance). Their client tore the prompt down the moment they
// clicked, so a silent refusal strands the item until the roll times out and leaves the
// looter with nothing on screen explaining why. The refusal must say so and hand the
// prompt back. Helpers mirror tests/loot_master_sim.test.ts.
const ITEM = 'greyjaw_hide_boots';

type MasterLootEvent = Extract<SimEvent, { type: 'masterLoot' }>;

function setup() {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
  const a = sim.addPlayer('warrior', 'Aleph');
  const b = sim.addPlayer('mage', 'Bet');
  const c = sim.addPlayer('rogue', 'Gimel');
  sim.tick();
  for (const m of [b, c]) {
    sim.partyInvite(m, a);
    sim.partyAccept(m);
  }
  sim.setPartyLootMaster(true, 0, 'uncommon', a); // looter slot 0 = leader (a)
  return { sim, a, b, c };
}

function openMasterRoll(sim: Sim, tapper: number, recipients: number[]): MasterLootEvent {
  const player = sim.entities.get(tapper)!;
  player.pos = { x: 20, y: 0, z: 20 };
  player.prevPos = { ...player.pos };
  const mob = createMob(990900, MOBS.forest_wolf, 5, { x: 20, y: 0, z: 20 });
  mob.dead = true;
  mob.lootable = true;
  mob.tappedById = tapper;
  mob.lootRecipientIds = recipients;
  mob.loot = { copper: 0, items: [{ itemId: ITEM, count: 1 }] };
  sim.entities.set(mob.id, mob);
  sim.lootCorpse(mob.id, tapper);
  const ml = sim.tick().find((e): e is MasterLootEvent => e.type === 'masterLoot');
  if (!ml) throw new Error('expected a masterLoot event');
  return ml;
}

describe('master loot: refused assignment', () => {
  it('tells the looter and re-offers the prompt when every pick is ineligible', () => {
    const { sim, a, b, c } = setup();
    const roll = openMasterRoll(sim, a, [a, b, c]);
    // A pid that is not on this roll's candidate list: what a client sends when its
    // prompt is stale, or when the roster moved under it between open and click.
    const outsider = sim.addPlayer('priest', 'Dalet');
    sim.tick();
    expect(roll.candidates.map((x) => x.pid)).not.toContain(outsider);

    sim.assignMasterLoot(roll.rollId, [outsider], a);
    const events = sim.tick();

    const error = events.find((e) => e.type === 'error' && (e as any).pid === a) as any;
    expect(error, 'the looter is told why the pick was refused').toBeTruthy();
    expect(error.text).toBe('That player can no longer receive this item.');

    const reoffer = events.find((e): e is MasterLootEvent => e.type === 'masterLoot');
    expect(reoffer, 'the prompt comes back so the item is not stranded').toBeTruthy();
    expect(reoffer!.rollId).toBe(roll.rollId);
    // The roll is still open, not consumed by the refusal.
    expect([...(sim as any).pendingLootRolls.keys()]).toContain(roll.rollId);
  });

  it('drops a player who left the world from the re-offered candidate list', () => {
    const { sim, a, b, c } = setup();
    const roll = openMasterRoll(sim, a, [a, b, c]);
    expect(roll.candidates.map((x) => x.pid)).toContain(b);

    const outsider = sim.addPlayer('priest', 'Dalet');
    sim.removePlayer(b);
    sim.tick();
    sim.assignMasterLoot(roll.rollId, [outsider], a);
    const reoffer = sim.tick().find((e): e is MasterLootEvent => e.type === 'masterLoot');

    expect(reoffer).toBeTruthy();
    // Re-offering someone who has left the world would only be refused again.
    expect(reoffer!.candidates.map((x) => x.pid)).not.toContain(b);
    expect(reoffer!.candidates.map((x) => x.pid)).toContain(c);
  });

  it('still grants normally when the pick is valid', () => {
    const { sim, a, b, c } = setup();
    const roll = openMasterRoll(sim, a, [a, b, c]);

    sim.assignMasterLoot(roll.rollId, [b], a);
    const events = sim.tick();

    expect(events.find((e) => e.type === 'error')).toBeFalsy();
    expect(events.find((e) => e.type === 'masterLoot')).toBeFalsy();
    expect(sim.meta(b)!.inventory.some((s) => s?.itemId === ITEM)).toBe(true);
  });
});
