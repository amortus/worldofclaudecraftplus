// Ghost wiring: the seam between the pure `src/sim/spirit.ts` rules and the live
// Sim. The rules themselves are covered by ghost.test.ts; everything here is
// about the WIRING - the release, the corpse run, the Spirit Healer, how the
// ghost interacts with /unstuck, rifts and the ad-rewarded revive, the
// persistence round trip, and the determinism property (the whole system draws
// zero rng).

import { describe, expect, it } from 'vitest';
import { RIFT_X, zoneAt } from '../src/sim/data';
import { type CharacterState, Sim } from '../src/sim/sim';
import {
  CORPSE_REZ_RANGE,
  GHOST_RUN_MULT,
  RES_HEALER_HP_FRACTION,
  RES_HP_FRACTION,
  RES_SICKNESS_MIN_LEVEL,
  RESURRECTION_SICKNESS_ID,
  resurrectionSickness,
} from '../src/sim/spirit';
import {
  UNSTUCK_COOLDOWN_ID,
  UNSTUCK_COUNTDOWN_SECONDS,
  UNSTUCK_SICKNESS_ID,
} from '../src/sim/unstuck';
import type { SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

/** A world with nothing alive in it, so nothing interferes with a corpse run. */
function quietSim(seed = 42): Sim {
  const sim = new Sim({ seed, playerClass: 'warrior' });
  for (const e of sim.entities.values()) {
    if (e.kind !== 'mob') continue;
    e.dead = true;
    e.hp = 0;
    e.pos.x += 10000;
    e.pos.z += 10000;
    e.prevPos = { ...e.pos };
    e.spawnPos = { ...e.pos };
  }
  sim.player.combatTimer = 99;
  sim.player.inCombat = false;
  return sim;
}

function teleport(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

/** Kill the player outright, without routing through combat (no rng). */
function kill(sim: Sim): void {
  const p = sim.player;
  p.hp = 0;
  (sim as any).handleDeath(p, null);
  sim.drainEvents();
}

const of = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e) => e.type === type);

describe('releasing the spirit', () => {
  it('leaves the body where it fell and raises a ghost at the graveyard', () => {
    const sim = quietSim();
    teleport(sim, 20, -60);
    const fell = { ...sim.player.pos };
    kill(sim);
    sim.releaseSpirit();
    const p = sim.player;

    // The defining change: release is no longer a revive.
    expect(p.dead).toBe(true);
    expect(p.ghost).toBe(true);
    expect(p.corpsePos).toEqual({ x: fell.x, y: fell.y, z: fell.z });
    const gy = zoneAt(fell.x, fell.z).graveyard;
    expect(p.pos.x).toBeCloseTo(gy.x, 5);
    expect(p.pos.z).toBeCloseTo(gy.z, 5);
    // A ghost shows a full (greyed) bar.
    expect(p.hp).toBe(p.maxHp);

    const ev = of(sim.drainEvents(), 'ghostRelease');
    expect(ev).toHaveLength(1);
    expect(ev[0].type === 'ghostRelease' && ev[0].corpse).toEqual(p.corpsePos);
  });

  it('is idempotent: releasing an already-released spirit does nothing', () => {
    const sim = quietSim();
    kill(sim);
    sim.releaseSpirit();
    const at = { ...sim.player.pos };
    sim.drainEvents();
    sim.releaseSpirit();
    expect(sim.player.pos).toEqual(at);
    expect(of(sim.drainEvents(), 'ghostRelease')).toHaveLength(0);
  });

  it('lets the ghost walk (faster, and unslowable), which the corpse never could', () => {
    const sim = quietSim();
    kill(sim);
    sim.releaseSpirit();
    const p = sim.player;
    // A snare that landed before death must not follow the spirit home.
    p.auras.push({
      id: 'test_snare',
      name: 'Snare',
      kind: 'slow',
      remaining: 60,
      duration: 60,
      value: 0.3,
      sourceId: 1,
      school: 'physical',
    });
    expect(sim.moveSpeedMult(p)).toBe(GHOST_RUN_MULT);

    const before = { ...p.pos };
    sim.moveInput.forward = true;
    for (let i = 0; i < 20; i++) sim.tick();
    expect(Math.hypot(p.pos.x - before.x, p.pos.z - before.z)).toBeGreaterThan(1);
    sim.moveInput.forward = false;
  });

  it('an unreleased corpse does not walk', () => {
    const sim = quietSim();
    kill(sim);
    const p = sim.player;
    const before = { ...p.pos };
    sim.moveInput.forward = true;
    for (let i = 0; i < 20; i++) sim.tick();
    expect(p.pos.x).toBeCloseTo(before.x, 6);
    expect(p.pos.z).toBeCloseTo(before.z, 6);
    sim.moveInput.forward = false;
  });
});

describe('the corpse run', () => {
  it('resurrects at the body for half pools and no sickness', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    const p = sim.player;
    // Walk the spirit back to within range of its body.
    const corpse = p.corpsePos!;
    p.pos.x = corpse.x + CORPSE_REZ_RANGE - 5;
    p.pos.z = corpse.z;
    sim.drainEvents();

    sim.resurrectAtCorpse();
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    expect(p.corpsePos).toBeNull();
    expect(p.hp).toBe(Math.max(1, Math.round(p.maxHp * RES_HP_FRACTION)));
    expect(p.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);

    const events = sim.drainEvents();
    const rez = of(events, 'ghostResurrect');
    expect(rez).toHaveLength(1);
    expect(rez[0].type === 'ghostResurrect' && rez[0].via).toBe('corpse');
    expect(rez[0].type === 'ghostResurrect' && rez[0].sickness).toBe(0);
    // The legacy signal every pre-ghost consumer still listens for.
    expect(of(events, 'respawn')).toHaveLength(1);
  });

  it('refuses a corpse rez from out of range, and says why', () => {
    const sim = quietSim();
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    sim.drainEvents();
    sim.resurrectAtCorpse();
    const deny = of(sim.drainEvents(), 'ghostDeny');
    expect(deny).toHaveLength(1);
    expect(deny[0].type === 'ghostDeny' && deny[0].reason).toBe('corpse_too_far');
    expect(sim.player.dead).toBe(true);
  });

  it('refuses either resurrection from a living player', () => {
    const sim = quietSim();
    sim.resurrectAtCorpse();
    sim.resurrectAtSpiritHealer();
    const deny = of(sim.drainEvents(), 'ghostDeny');
    expect(deny).toHaveLength(2);
    expect(deny.every((d) => d.type === 'ghostDeny' && d.reason === 'not_ghost')).toBe(true);
  });
});

describe('the Spirit Healer', () => {
  it('raises the ghost at the graveyard for a fifth of its pools plus sickness', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    sim.drainEvents();
    const p = sim.player;

    sim.resurrectAtSpiritHealer();
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    const sickness = p.auras.find((a) => a.id === RESURRECTION_SICKNESS_ID);
    expect(sickness).toBeDefined();
    expect(sickness?.remaining).toBe(resurrectionSickness(20).durationSeconds);
    // The pools are taken from the ALREADY drained maxima, so the bar is not
    // over the top of a shrunken pool.
    expect(p.hp).toBe(Math.max(1, Math.round(p.maxHp * RES_HEALER_HP_FRACTION)));
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);

    const rez = of(sim.drainEvents(), 'ghostResurrect');
    expect(rez[0].type === 'ghostResurrect' && rez[0].via).toBe('healer');
    expect(rez[0].type === 'ghostResurrect' && rez[0].sickness).toBeGreaterThan(0);
  });

  it('waives the sickness under the classic minimum level', () => {
    const sim = quietSim();
    sim.setPlayerLevel(RES_SICKNESS_MIN_LEVEL - 1);
    kill(sim);
    sim.releaseSpirit();
    sim.resurrectAtSpiritHealer();
    expect(sim.player.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);
  });

  it('refuses once the ghost has wandered away from the graveyard', () => {
    const sim = quietSim();
    kill(sim);
    sim.releaseSpirit();
    sim.player.pos.x += 500;
    sim.drainEvents();
    sim.resurrectAtSpiritHealer();
    const deny = of(sim.drainEvents(), 'ghostDeny');
    expect(deny[0].type === 'ghostDeny' && deny[0].reason).toBe('no_healer');
  });

  it('never lets the two sicknesses coexist and compound', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    const p = sim.player;
    // Owe Unstuck Sickness first, then take the angel's bargain.
    (sim as any).completeUnstuck(p, (sim as any).players.get(p.id), {
      destination: { x: p.pos.x, z: p.pos.z },
      revive: false,
      cooldownSeconds: 1,
      outcome: 'moved_to_graveyard',
    });
    expect(p.auras.some((a) => a.id === UNSTUCK_SICKNESS_ID)).toBe(true);
    kill(sim);
    sim.releaseSpirit();
    sim.resurrectAtSpiritHealer();
    expect(p.auras.filter((a) => a.id === UNSTUCK_SICKNESS_ID)).toHaveLength(0);
    expect(p.auras.filter((a) => a.id === RESURRECTION_SICKNESS_ID)).toHaveLength(1);
  });
});

describe('/unstuck keeps working, and is not a free corpse teleport', () => {
  it('raises a ghost at the graveyard and ABANDONS its corpse', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    const p = sim.player;
    const corpse = { ...p.corpsePos! };
    // Wander the spirit off, so the graveyard is not where it stands.
    sim.drainEvents();
    sim.player.cooldowns.delete(UNSTUCK_COOLDOWN_ID);
    sim.startUnstuck();
    // tick() RETURNS the drained events, so collect them here rather than
    // asking drainEvents() afterwards (which would already be empty).
    const events: SimEvent[] = [];
    for (let i = 0; i < 20 * (UNSTUCK_COUNTDOWN_SECONDS + 1); i++) events.push(...sim.tick());

    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    // The whole point: unstuck did NOT carry the spirit to its body.
    expect(p.corpsePos).toBeNull();
    expect(Math.hypot(p.pos.x - corpse.x, p.pos.z - corpse.z)).toBeGreaterThan(CORPSE_REZ_RANGE);
    expect(p.auras.some((a) => a.id === UNSTUCK_SICKNESS_ID)).toBe(true);
    const rez = of(events, 'ghostResurrect');
    expect(rez).toHaveLength(1);
    expect(rez[0].type === 'ghostResurrect' && rez[0].via).toBe('unstuck');
  });

  it('holds a MOVING ghost to the living motion gates', () => {
    // A corpse is frozen, so unstuck skips the motion gates for it. A ghost
    // genuinely walks, so it must not be able to /unstuck mid-run.
    const sim = quietSim();
    kill(sim);
    sim.releaseSpirit();
    sim.drainEvents();
    sim.moveInput.forward = true;
    sim.tick();
    sim.startUnstuck();
    const blocked = sim.drainEvents().filter((e) => e.type === 'unstuck');
    expect(blocked[0].type === 'unstuck' && blocked[0].phase).toBe('blocked');
    sim.moveInput.forward = false;
  });
});

describe('the dungeon corpse run', () => {
  // Most deaths happen inside an instance, so this is the corpse run's MAIN
  // path: no Spirit Healer stands inside a dungeon, so the spirit runs back to
  // the door and re-entering IS the corpse run.
  const dungeonSim = () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    sim.enterDungeon('gravewyrm_sanctum');
    sim.drainEvents();
    return sim;
  };

  it('records a corpse inside the instance and sends the spirit out to a graveyard', () => {
    const sim = dungeonSim();
    const p = sim.player;
    expect(p.pos.x).toBeGreaterThan(600); // inside the instance band
    const inside = { ...p.pos };
    kill(sim);
    sim.releaseSpirit();
    expect(p.ghost).toBe(true);
    expect(p.corpsePos).toEqual({ x: inside.x, y: inside.y, z: inside.z });
    expect(p.pos.x).toBeLessThan(600); // the spirit is out in the overworld
  });

  it('resurrects the spirit at the entry when it walks back through its own door', () => {
    const sim = dungeonSim();
    const p = sim.player;
    kill(sim);
    sim.releaseSpirit();
    sim.drainEvents();

    sim.enterDungeon('gravewyrm_sanctum');
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    expect(p.corpsePos).toBeNull();
    expect(p.pos.x).toBeGreaterThan(600);
    // Re-entering is the corpse run, so it is penalty-free: half pools, no sickness.
    expect(p.hp).toBe(Math.max(1, Math.round(p.maxHp * RES_HP_FRACTION)));
    expect(p.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);
    const rez = of(sim.drainEvents(), 'ghostResurrect');
    expect(rez[0].type === 'ghostResurrect' && rez[0].via).toBe('corpse');
  });

  it('refuses an UNRELATED door, so walking a spirit into any dungeon is not a free rez', () => {
    const sim = dungeonSim();
    const p = sim.player;
    kill(sim);
    sim.releaseSpirit();
    const outside = { ...p.pos };
    sim.drainEvents();

    sim.enterDungeon('nythraxis_crypt');
    expect(p.dead).toBe(true);
    expect(p.ghost).toBe(true);
    expect(p.pos.x).toBeCloseTo(outside.x, 6);
    expect(of(sim.drainEvents(), 'ghostResurrect')).toHaveLength(0);
  });

  it('still refuses an ordinary unreleased corpse at the door', () => {
    const sim = dungeonSim();
    const p = sim.player;
    // Leave the instance alive first, so the door is a real re-entry.
    sim.leaveDungeon(sim.playerId);
    kill(sim);
    const at = { ...p.pos };
    sim.enterDungeon('gravewyrm_sanctum');
    expect(p.dead).toBe(true);
    expect(p.pos.x).toBeCloseTo(at.x, 6);
  });
});

describe('rifts never strand a spirit', () => {
  it('releases out of the rift with NO corpse, so the angel is the only road back', () => {
    const sim = quietSim();
    const p = sim.player;
    // Stand on the rift instance plane without needing a live run: the release
    // path only reads the position band to decide corpse recoverability.
    p.pos.x = RIFT_X;
    p.pos.z = 0;
    p.prevPos = { ...p.pos };
    kill(sim);
    sim.releaseSpirit();

    expect(p.ghost).toBe(true);
    expect(p.corpsePos).toBeNull();
    expect(p.pos.x).toBeLessThan(1000); // out of the instance plane entirely
    const ev = of(sim.drainEvents(), 'ghostRelease');
    expect(ev[0].type === 'ghostRelease' && ev[0].corpse).toBeNull();

    // And the spirit rose exactly on its graveyard, so the healer is in reach.
    expect(sim.ghostInfo()?.spiritHealerInRange).toBe(true);
    sim.resurrectAtSpiritHealer();
    expect(p.dead).toBe(false);
  });
});

describe('the ad-rewarded revive', () => {
  it('still stands an unreleased body up in place, at full pools and no sickness', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    teleport(sim, 20, -60);
    const fell = { ...sim.player.pos };
    kill(sim);
    sim.reviveInPlace(sim.playerId);
    const p = sim.player;
    expect(p.dead).toBe(false);
    expect(p.pos.x).toBeCloseTo(fell.x, 6);
    expect(p.pos.z).toBeCloseTo(fell.z, 6);
    expect(p.hp).toBe(p.maxHp);
    expect(p.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);
  });

  it('carries a RELEASED spirit back to its body: the corpse run, bought', () => {
    const sim = quietSim();
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    const corpse = { ...sim.player.corpsePos! };
    sim.reviveInPlace(sim.playerId);
    const p = sim.player;
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    expect(p.pos.x).toBeCloseTo(corpse.x, 6);
    expect(p.pos.z).toBeCloseTo(corpse.z, 6);
    expect(p.hp).toBe(p.maxHp);
  });

  it('raises a corpse-less spirit where it stands rather than stranding it', () => {
    const sim = quietSim();
    const p = sim.player;
    p.pos.x = RIFT_X;
    p.prevPos = { ...p.pos };
    kill(sim);
    sim.releaseSpirit();
    const at = { ...p.pos };
    sim.reviveInPlace(sim.playerId);
    expect(p.dead).toBe(false);
    expect(p.pos.x).toBeCloseTo(at.x, 6);
  });
});

describe('persistence', () => {
  const load = (state: CharacterState) => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', noPlayer: true });
    const pid = sim.addPlayer('warrior', 'Wisp', { state });
    return { sim, pid, p: sim.entities.get(pid)! };
  };

  it('omits the death block entirely for a living, unsick character', () => {
    const sim = quietSim();
    const state = sim.serializeCharacter(sim.playerId)!;
    expect('death' in state).toBe(false);
    // The byte-for-byte contract: a pre-feature save round-trips unchanged.
    expect(JSON.stringify(state)).not.toContain('"death"');
  });

  it('loads a save written before the death loop existed, unchanged', () => {
    const sim = quietSim();
    const before = sim.serializeCharacter(sim.playerId)!;
    // A genuine pre-feature payload has no `death` key at all.
    const legacy = JSON.parse(JSON.stringify(before)) as CharacterState;
    delete (legacy as { death?: unknown }).death;
    const { p, sim: loaded, pid } = load(legacy);
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    expect(p.corpsePos).toBeNull();
    expect(p.auras.some((a) => a.id === RESURRECTION_SICKNESS_ID)).toBe(false);
    // ...and re-saves byte-identical apart from the entity id the new world minted.
    const after = loaded.serializeCharacter(pid)!;
    expect('death' in after).toBe(false);
  });

  it('round-trips a released spirit, so logging out is not a resurrection', () => {
    const sim = quietSim();
    teleport(sim, 20, -60);
    kill(sim);
    sim.releaseSpirit();
    const corpse = { ...sim.player.corpsePos! };
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.death).toEqual({ dead: true, ghost: true, corpse });

    const { p } = load(state);
    expect(p.dead).toBe(true);
    expect(p.ghost).toBe(true);
    expect(p.corpsePos).toEqual(corpse);
    expect(p.hp).toBe(p.maxHp); // greyed full bar, still dead
  });

  it('round-trips an unreleased body', () => {
    const sim = quietSim();
    kill(sim);
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.death).toEqual({ dead: true });
    const { p } = load(state);
    expect(p.dead).toBe(true);
    expect(p.ghost).toBe(false);
    expect(p.hp).toBe(0);
  });

  it('resumes Resurrection Sickness rather than resetting it', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    kill(sim);
    sim.releaseSpirit();
    sim.resurrectAtSpiritHealer();
    // Burn some of the penalty off.
    for (let i = 0; i < 20 * 30; i++) sim.tick();
    const state = sim.serializeCharacter(sim.playerId)!;
    const left = state.death!.sickness!;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(resurrectionSickness(20).durationSeconds);

    const { p } = load(state);
    const restored = p.auras.find((a) => a.id === RESURRECTION_SICKNESS_ID);
    expect(restored?.remaining).toBeCloseTo(left, 1);
  });

  it('degrades a malformed death block to a living character rather than throwing', () => {
    const sim = quietSim();
    const state = sim.serializeCharacter(sim.playerId)!;
    const junk = {
      ...state,
      death: { dead: 'yes', ghost: 1, corpse: { x: NaN, y: 0, z: 0 }, sickness: 'soon' },
    } as unknown as CharacterState;
    const { p } = load(junk);
    expect(p.dead).toBe(false);
    expect(p.ghost).toBe(false);
    expect(p.corpsePos).toBeNull();
  });
});

describe('determinism', () => {
  it('the whole death loop draws zero rng', () => {
    const sim = quietSim();
    sim.setPlayerLevel(20);
    teleport(sim, 20, -60);
    const rngState = () => (sim as any).rng.s as number;

    kill(sim);
    const before = rngState();
    sim.releaseSpirit();
    sim.ghostInfo();
    sim.resurrectAtCorpse(); // denied, out of range
    sim.player.pos.x = sim.player.corpsePos!.x;
    sim.player.pos.z = sim.player.corpsePos!.z;
    sim.resurrectAtCorpse();
    expect(rngState()).toBe(before);

    kill(sim);
    sim.releaseSpirit();
    sim.resurrectAtSpiritHealer();
    expect(rngState()).toBe(before);
  });

  it('two identical runs through the loop produce identical worlds', () => {
    const run = () => {
      const sim = quietSim(1234);
      teleport(sim, 20, -60);
      kill(sim);
      sim.releaseSpirit();
      sim.moveInput.forward = true;
      for (let i = 0; i < 60; i++) sim.tick();
      sim.moveInput.forward = false;
      sim.resurrectAtSpiritHealer();
      for (let i = 0; i < 60; i++) sim.tick();
      const p = sim.player;
      return [p.pos.x, p.pos.z, p.hp, p.dead ? 1 : 0, p.ghost ? 1 : 0, (sim as any).rng.s];
    };
    expect(run()).toEqual(run());
  });
});
