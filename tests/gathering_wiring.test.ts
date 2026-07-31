// Gathering wiring: the seam between the pure `src/sim/professions/` mechanics
// and the live Sim. The mechanics themselves are covered by
// professions_gathering / professions_tools; everything here is about the WIRING
// (node spawn, the interact arm, the cast, the grant, per-viewer respawn,
// interruption, persistence) and about the determinism contract at that seam.

import { describe, expect, it } from 'vitest';
import { GATHER_NODES, GATHER_TOOLS } from '../src/sim/content/professions';
import { ITEMS } from '../src/sim/data';
import { PROFESSION_ITEMS } from '../src/sim/content/professions';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const makeSim = (seed = 42) => new Sim({ seed, playerClass: 'warrior' });

function nodeObject(sim: Sim, nodeId: string): Entity {
  for (const e of sim.entities.values()) {
    if (e.kind === 'object' && e.objectItemId === nodeId) return e;
  }
  throw new Error(`no ground object spawned for node ${nodeId}`);
}

function teleportTo(sim: Sim, x: number, z: number) {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.vx = p.vz = p.vy = 0;
  p.onGround = true;
  p.fallStartY = p.pos.y;
}

// The authored nodes sit at real landmarks, several of them inside mob camps
// (the Copper Dig outcrops are one), and a wolf's first swing cancels the cast.
// Clearing the world keeps these tests about the wiring rather than about aggro.
function despawnMobs(sim: Sim) {
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.pos.x += 10000;
    e.pos.z += 10000;
    e.prevPos = { ...e.pos };
    e.spawnPos = { ...e.pos };
  }
}

/** Stand on a node with the right tool in the bags. */
function atNode(sim: Sim, nodeId: string, toolId: string | null = 'worn_miners_pick') {
  const obj = nodeObject(sim, nodeId);
  despawnMobs(sim);
  teleportTo(sim, obj.pos.x, obj.pos.z);
  if (toolId) sim.addItem(toolId, 1);
  sim.events = [];
  return obj;
}

/** Run the harvest cast to completion, returning everything it emitted. */
function finishCast(sim: Sim): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 20 * 10 && sim.player.castingAbility; i++) out.push(...sim.tick());
  return out;
}

const ORE_NODE = 'ore_eastbrook_1';

describe('gathering wiring: node spawn', () => {
  it('spawns every authored node as a ground object on the heightfield', () => {
    const sim = makeSim();
    const spawned = [...sim.entities.values()].filter(
      (e) => e.kind === 'object' && e.objectItemId !== null && GATHER_NODES.some((n) => n.id === e.objectItemId),
    );
    expect(spawned).toHaveLength(GATHER_NODES.length);
    expect(GATHER_NODES.length).toBe(42);
    for (const node of GATHER_NODES) {
      const obj = nodeObject(sim, node.id);
      expect(obj.pos.x).toBe(node.pos.x);
      expect(obj.pos.z).toBe(node.pos.z);
      // y comes from the shared heightfield, exactly like every other ground object
      expect(obj.pos.y).toBeCloseTo(terrainHeight(node.pos.x, node.pos.z, sim.cfg.seed), 10);
      expect(obj.name).toBe(node.objectName);
      expect(obj.lootable).toBe(true);
    }
  });

  it('spreads every profession item into ITEMS', () => {
    expect(Object.keys(PROFESSION_ITEMS)).toHaveLength(29);
    for (const id of Object.keys(PROFESSION_ITEMS)) {
      expect(ITEMS[id], id).toBeTruthy();
      expect(ITEMS[id].name).toBe(PROFESSION_ITEMS[id].name);
    }
    // The tier-1 rod is the SHIPPED pole, only tiered by GATHER_TOOLS: it must
    // not be redefined by this wave.
    expect(PROFESSION_ITEMS.simple_fishing_pole).toBeUndefined();
    expect(GATHER_TOOLS.simple_fishing_pole.tier).toBe(1);
    expect(ITEMS.simple_fishing_pole).toBeTruthy();
  });

  it('does not turn a node into an ordinary ground pickup', () => {
    const sim = makeSim();
    atNode(sim, ORE_NODE, null);
    sim.interact();
    // No tool: denied, and crucially the node id itself was never added as an item.
    expect(sim.countItem(ORE_NODE)).toBe(0);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'gatherDeny', nodeId: ORE_NODE, reason: 'no_tool' }),
    );
  });
});

describe('gathering wiring: the gates', () => {
  it('denies a bare-handed player with a text-free reason plus the required tier', () => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE, null);
    sim.pickUpObject(obj.id);
    expect(sim.player.castingAbility).toBe(null);
    expect(sim.events).toContainEqual({
      type: 'gatherDeny',
      nodeId: ORE_NODE,
      professionId: 'mining',
      reason: 'no_tool',
      requiredTier: 1,
      pid: sim.playerId,
    });
  });

  it('denies a tool that does not cover the node tier', () => {
    const sim = makeSim();
    // A tier-4 Ashen Wastes vein worked with a tier-1 pick.
    const obj = atNode(sim, 'ore_ashen_1', 'worn_miners_pick');
    sim.pickUpObject(obj.id);
    expect(sim.player.castingAbility).toBe(null);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'gatherDeny', reason: 'tool_tier', requiredTier: 4 }),
    );
  });

  it('denies a node this player already worked, with the wait left', () => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE);
    sim.pickUpObject(obj.id);
    finishCast(sim);
    sim.events = [];
    sim.pickUpObject(obj.id);
    const deny = sim.events.find((e) => e.type === 'gatherDeny');
    expect(deny).toMatchObject({ reason: 'not_ready', requiredTier: 1 });
    expect((deny as any).readyInSec).toBeGreaterThan(0);
  });

  it('keeps the respawn timer PER VIEWER: one player never blocks another', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const a = sim.addPlayer('warrior', 'Ayla');
    const b = sim.addPlayer('rogue', 'Bree');
    const obj = nodeObject(sim, ORE_NODE);
    despawnMobs(sim);
    for (const pid of [a, b]) {
      const p = sim.entities.get(pid)!;
      p.pos = { ...obj.pos };
      p.prevPos = { ...obj.pos };
      sim.addItem('worn_miners_pick', 1, pid);
    }
    sim.pickUpObject(obj.id, a);
    finishCast(sim);
    expect(sim.countItem('copper_ore', a)).toBeGreaterThan(0);

    // B has never touched it, so B may work it immediately.
    sim.events = [];
    sim.pickUpObject(obj.id, b);
    expect(sim.events.some((e) => e.type === 'gatherDeny')).toBe(false);
    expect(sim.entities.get(b)!.castingAbility).toBe('gathering');
  });
});

describe('gathering wiring: the harvest', () => {
  it('runs a timed cast and grants the material, the rarity and the skill-up', () => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE);
    sim.pickUpObject(obj.id);
    expect(sim.player.castingAbility).toBe('gathering');
    expect(sim.player.castTotal).toBeGreaterThan(0);
    expect(sim.player.castRemaining).toBe(sim.player.castTotal);
    expect(sim.events).toContainEqual(
      expect.objectContaining({ type: 'castStart', ability: 'gathering' }),
    );

    const events = finishCast(sim);
    const harvest = events.find((e) => e.type === 'gatherHarvest') as any;
    expect(harvest).toMatchObject({
      nodeId: ORE_NODE,
      professionId: 'mining',
      itemId: 'copper_ore',
    });
    expect(harvest.qty).toBeGreaterThan(0);
    expect(sim.countItem('copper_ore')).toBe(harvest.qty);
    // First harvest of a tier-1 node at proficiency 0: full-rate rung.
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'professionSkill', professionId: 'mining', skill: 1 }),
    );
    expect(sim.meta(sim.playerId)!.gathering.mining).toBe(1);
  });

  it('reaches the same node through interact()', () => {
    const sim = makeSim();
    atNode(sim, ORE_NODE);
    sim.interact();
    expect(sim.player.castingAbility).toBe('gathering');
  });
});

describe('gathering wiring: interruption costs nothing and draws nothing', () => {
  const interrupted = (kind: 'move' | 'damage' | 'cast') => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE);
    sim.pickUpObject(obj.id);
    const rngBefore = (sim as any).rng.s;
    if (kind === 'move') {
      sim.moveInput.forward = true;
      sim.tick();
      sim.moveInput.forward = false;
    } else if (kind === 'damage') {
      const source = [...sim.entities.values()].find((e) => e.kind === 'mob')!;
      (sim as any).dealDamage(source, sim.player, 1, false, 'physical', null, 'hit');
    } else {
      sim.castAbility('heroic_strike');
    }
    return { sim, obj, rngBefore, rngAfter: (sim as any).rng.s };
  };

  it.each(['move', 'damage', 'cast'] as const)('%s cancels the harvest', (kind) => {
    const { sim, obj, rngBefore, rngAfter } = interrupted(kind);
    expect(sim.player.castingAbility).not.toBe('gathering');
    expect(sim.meta(sim.playerId)!.gatherNodeId).toBe(null);
    expect(sim.countItem('copper_ore')).toBe(0);
    expect(sim.meta(sim.playerId)!.gathering.mining).toBe(0);
    // No draw: an interrupted harvest must never shift the world's rng stream.
    expect(rngAfter).toBe(rngBefore);
    // ...and no respawn stamp, so the node is immediately workable again.
    expect(sim.meta(sim.playerId)!.gatherReadyAt[ORE_NODE]).toBeUndefined();
    sim.events = [];
    sim.pickUpObject(obj.id);
    expect(sim.events.some((e) => e.type === 'gatherDeny')).toBe(false);
  });

  it('draws EXACTLY once per completed harvest', () => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE);
    sim.pickUpObject(obj.id);
    // Advance to the tick before completion so no unrelated tick logic draws.
    const before = (sim as any).rng.s;
    (sim as any).completeHarvest(sim.meta(sim.playerId)!);
    const after = (sim as any).rng.s;
    expect(after).not.toBe(before);
    // One mulberry32 step is one addition of 0x6D2B79F5 (mod 2^32).
    expect((before + 0x6d2b79f5) >>> 0).toBe(after >>> 0);
    expect(obj.lootable).toBe(true); // a node is permanent, never consumed
  });
});

describe('gathering wiring: persistence', () => {
  it('omits the key entirely until the character has gathered', () => {
    const sim = makeSim();
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect('gatheringProficiency' in saved).toBe(false);
  });

  it('round-trips proficiency and drops the session-only respawn stamps', () => {
    const sim = makeSim();
    const obj = atNode(sim, ORE_NODE);
    sim.pickUpObject(obj.id);
    finishCast(sim);
    const saved = sim.serializeCharacter(sim.playerId)!;
    expect(saved.gatheringProficiency).toEqual({ mining: 1 });

    const reloaded = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = reloaded.addPlayer('warrior', 'Ayla', { state: saved });
    const meta = reloaded.meta(pid)!;
    expect(meta.gathering).toEqual({ mining: 1, logging: 0, herbalism: 0, fishing: 0 });
    // Per-viewer respawn is deliberately session-only: a relog starts ready.
    expect(meta.gatherReadyAt).toEqual({});
  });

  it('loads a pre-feature save unchanged and clamps a tampered one', () => {
    const donor = new Sim({ seed: 42, playerClass: 'warrior' });
    const legacy = donor.serializeCharacter(donor.playerId)!;
    // A save written before this feature simply has no such key.
    delete (legacy as any).gatheringProficiency;
    delete (legacy as any).deeds;
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Old', { state: legacy as any });
    expect(sim.meta(pid)!.gathering).toEqual({
      mining: 0,
      logging: 0,
      herbalism: 0,
      fishing: 0,
    });

    const tampered = {
      ...(legacy as any),
      gatheringProficiency: { mining: 9999, bogus: 5, logging: -3 },
    };
    const pid2 = sim.addPlayer('warrior', 'Cheat', { state: tampered as any });
    const g = sim.meta(pid2)!.gathering as Record<string, number>;
    expect(g.mining).toBe(100); // clamped to the profession ceiling
    expect(g.logging).toBe(0);
    expect(g.bogus).toBeUndefined();
  });
});

describe('gathering wiring: the IWorld seam', () => {
  it('exposes one row per profession with its own ceiling', () => {
    const sim = makeSim();
    const rows = sim.gatheringSkills();
    expect(rows.map((r) => r.professionId)).toEqual([
      'mining',
      'logging',
      'herbalism',
      'fishing',
    ]);
    expect(rows.find((r) => r.professionId === 'fishing')!.maxSkill).toBe(200);
    expect(rows.find((r) => r.professionId === 'mining')!.maxSkill).toBe(100);
    expect(rows.every((r) => r.skill === 0)).toBe(true);
  });
});
