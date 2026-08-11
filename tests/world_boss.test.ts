import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { combatProfileForMob, scaledDefaultMobMeleeRange } from '../src/sim/mob_combat';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import {
  isWorldBossLootEligible,
  markWorldBossLooted,
  WORLD_BOSS_CORPSE_SECONDS,
  WORLD_BOSS_INTERVAL_SECONDS,
  WORLD_BOSSES,
  worldBossLockoutId,
} from '../src/sim/world_boss';

// Ported from upstream (levy-street) tests/world_boss.test.ts and adapted to our fork's
// INLINE Sim architecture: upstream extracted the mob AI into src/sim/mob/*.ts modules
// driven by a SimContext, so it imports respawnMob/resetEvadingMob and passes sim.ctx. We
// keep those inline as private Sim methods, so those helpers are reached as
// (sim as any).respawnMob(boss) / (sim as any).resetEvadingMob(boss).

const BOSS_ID = 'thunzharr_waking_peak';
const DAY = '2026-06-28';

// Minimal PlayerMeta stand-in for the pure lockout-gate helpers (they touch only
// .raidLockouts). Cast through unknown to satisfy the full PlayerMeta type.
function fakeMeta() {
  return { raidLockouts: new Map<string, number>() } as unknown as Parameters<
    typeof isWorldBossLootEligible
  >[0];
}

function makeSim(seed = 7) {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true, noPlayer: true });
}

function findBoss(sim: Sim): Entity | undefined {
  return [...(sim as any).entities.values()].find(
    (e: Entity) => e.templateId === BOSS_ID && !e.dead,
  );
}

// Force the world-boss scheduler to fire on the next tick instead of waiting the
// full interval, then tick once to spawn it. Returns the spawn-tick events.
function spawnBossNow(sim: Sim): { boss: Entity; events: SimEvent[] } {
  (sim as any).worldBossNextAt[0] = (sim as any).time;
  const events = sim.tick();
  const boss = findBoss(sim);
  if (!boss) throw new Error('world boss did not spawn');
  return { boss, events };
}

describe('world boss loot lockout gate (pure helpers)', () => {
  const NOW = 1_000_000;
  const RESET = NOW + 5 * 60 * 60 * 1000; // some future reset instant

  it('is eligible until looted, then blocked until the lockout expires', () => {
    const meta = fakeMeta();
    expect(isWorldBossLootEligible(meta, BOSS_ID, NOW)).toBe(true);
    markWorldBossLooted(meta, BOSS_ID, RESET);
    expect(isWorldBossLootEligible(meta, BOSS_ID, NOW)).toBe(false);
  });

  it('gate and rendered lockout are ONE value: the gate reads the raidLockouts entry', () => {
    const meta = fakeMeta();
    markWorldBossLooted(meta, BOSS_ID, RESET);
    expect((meta as any).raidLockouts.get(worldBossLockoutId(BOSS_ID))).toBe(RESET);
    expect(isWorldBossLootEligible(meta, BOSS_ID, RESET - 1)).toBe(false);
  });

  it('frees up exactly at the reset instant', () => {
    const meta = fakeMeta();
    markWorldBossLooted(meta, BOSS_ID, RESET);
    expect(isWorldBossLootEligible(meta, BOSS_ID, RESET - 1)).toBe(false);
    expect(isWorldBossLootEligible(meta, BOSS_ID, RESET)).toBe(true);
  });
});

describe('world boss scheduler', () => {
  it('spawns on the interval and announces server-wide', () => {
    const sim = makeSim();
    expect(findBoss(sim)).toBeUndefined();
    const { boss, events } = spawnBossNow(sim);
    expect(boss.level).toBe(20);
    const announce = events.find(
      (e) => e.type === 'log' && /rises over Thornpeak Heights!$/.test((e as any).text),
    );
    expect(announce).toBeDefined();
    // Server-wide => no pid (personal) and no entityId (proximity) anchor.
    expect((announce as any).pid).toBeUndefined();
    expect((announce as any).entityId).toBeUndefined();
  });

  it('worldBossAtBoot spawns the boss on the first tick, default waits the interval', () => {
    const atBoot = new Sim({
      seed: 7,
      playerClass: 'warrior',
      autoEquip: true,
      noPlayer: true,
      worldBossAtBoot: true,
    });
    atBoot.tick();
    expect(findBoss(atBoot)).toBeDefined();
    expect((atBoot as any).worldBossNextAt[0]).toBeCloseTo(WORLD_BOSS_INTERVAL_SECONDS, 0);
    const plain = makeSim();
    plain.tick();
    expect(findBoss(plain)).toBeUndefined();
  });

  it('does not spawn a second boss while one is alive', () => {
    const sim = makeSim();
    spawnBossNow(sim);
    (sim as any).worldBossNextAt[0] = (sim as any).time;
    sim.tick();
    const bosses = [...(sim as any).entities.values()].filter(
      (e: Entity) => e.templateId === BOSS_ID,
    );
    expect(bosses).toHaveLength(1);
  });

  it('schedules the next spawn one interval out', () => {
    const sim = makeSim();
    const before = (sim as any).worldBossNextAt[0] as number;
    expect(before).toBe(WORLD_BOSSES[0].intervalSeconds);
    (sim as any).worldBossNextAt[0] = (sim as any).time;
    sim.tick();
    expect((sim as any).worldBossNextAt[0]).toBeCloseTo(
      (sim as any).time + WORLD_BOSS_INTERVAL_SECONDS - 1 / 20,
      4,
    );
  });
});

describe('world boss raid-tier combat (melee, Stormcall hardcast, yells)', () => {
  function engageBoss(sim: Sim, pid: number, boss: Entity): Entity {
    const p = (sim as any).entities.get(pid) as Entity;
    p.pos = { ...boss.pos };
    p.pos.x += 2;
    p.maxHp = 1_000_000;
    p.hp = 1_000_000;
    (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
    return p;
  }

  const chatYells = (events: SimEvent[]) =>
    events.filter((e) => e.type === 'chat' && (e as any).channel === 'yell');

  it('swings raid-tier melee (Nythraxis-class per-swing damage)', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    const dmg = (54 + 10.3 * 19) * 1.5;
    expect(boss.weapon.min).toBe(Math.round(dmg * 0.8));
    expect(boss.weapon.max).toBe(Math.round(dmg * 1.25));
    expect(boss.weapon.max).toBeGreaterThan(400);
  });

  it('barks the engage yell exactly once per pull, to nearby players only', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    engageBoss(sim, pid, boss);
    let yells = chatYells(sim.tick()).filter((e) => /You wake the mountain/.test((e as any).text));
    expect(yells).toHaveLength(1);
    expect((yells[0] as any).pid).toBe(pid);
    const p = (sim as any).entities.get(pid) as Entity;
    (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
    yells = chatYells(sim.tick()).filter((e) => /You wake the mountain/.test((e as any).text));
    expect(yells).toHaveLength(0);
  });

  it('a player-owned pet pull triggers the engage yell too', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('hunter', 'Ada');
    const { boss } = spawnBossNow(sim);
    const p = (sim as any).entities.get(pid) as Entity;
    p.pos = { ...boss.pos };
    p.pos.x += 5;
    const pet = {
      id: 987_654,
      kind: 'mob',
      ownerId: pid,
      dead: false,
      pos: { ...boss.pos },
    } as unknown as Entity;
    (sim as any).aggroMob(boss, pet, false);
    const yells = chatYells(sim.tick()).filter((e) =>
      /You wake the mountain/.test((e as any).text),
    );
    expect(yells).toHaveLength(1);
    expect((yells[0] as any).pid).toBe(pid);
  });

  it('hardcasts Stormcall on a visible cast bar, then novas players in range', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    engageBoss(sim, pid, boss);
    const p = (sim as any).entities.get(pid) as Entity;
    p.gm = true;
    let sawCastBar = false;
    let castYell = false;
    let unleashed = false;
    for (let t = 0; t < 20 * 60 && !unleashed; t++) {
      p.pos.x = boss.pos.x + 2;
      p.pos.z = boss.pos.z;
      if (t % 20 === 0) {
        (sim as any).dealDamage(p, boss, 1, false, 'physical', 'Chip', 'hit', true);
      }
      const events = sim.tick();
      if (boss.castingAbility === 'thunzharr_stormcall') {
        sawCastBar = true;
        expect(boss.castTotal).toBeCloseTo(3.5, 5);
      }
      if (chatYells(events).some((e) => /The storm answers my call!/.test((e as any).text)))
        castYell = true;
      if (events.some((e) => e.type === 'log' && /unleashes Stormcall!$/.test((e as any).text)))
        unleashed = true;
    }
    expect(sawCastBar).toBe(true);
    expect(castYell).toBe(true);
    expect(unleashed).toBe(true);
    expect(boss.castingAbility).toBeNull();
  });

  it('barks the enrage yell when the last-fifth enrage turns on', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    engageBoss(sim, pid, boss);
    sim.tick();
    boss.hp = Math.floor(boss.maxHp * 0.19);
    const events = sim.tick();
    expect(boss.enraged).toBe(true);
    const yells = chatYells(events).filter((e) => /The peak breaks/.test((e as any).text));
    expect(yells).toHaveLength(1);
  });

  it('barks the summon yell as each stormling wave rises', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    engageBoss(sim, pid, boss);
    sim.tick();
    boss.hp = Math.floor(boss.maxHp * 0.6);
    const events = sim.tick();
    const yells = chatYells(events).filter((e) => /Rise, stormlings/.test((e as any).text));
    expect(yells).toHaveLength(1);
    expect(boss.summonedIds.length).toBeGreaterThan(0);
  });

  it('collapses the summoned stormlings the moment the boss dies', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    const p = engageBoss(sim, pid, boss);
    sim.tick();
    boss.hp = Math.floor(boss.maxHp * 0.6);
    sim.tick();
    const addIds = [...boss.summonedIds];
    expect(addIds.length).toBeGreaterThan(0);
    (sim as any).dealDamage(p, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);
    expect(boss.summonedIds).toHaveLength(0);
    for (const id of addIds) expect((sim as any).entities.has(id)).toBe(false);
    expect((sim as any).entities.has(boss.id)).toBe(true);
  });
});

describe('world boss personal loot', () => {
  function killWith(sim: Sim, boss: Entity, pids: number[]) {
    for (const pid of pids) {
      const e = (sim as any).entities.get(pid) as Entity;
      (sim as any).dealDamage(e, boss, 10, false, 'physical', 'Chip', 'hit', true);
    }
    const killer = (sim as any).entities.get(pids[0]) as Entity;
    (sim as any).dealDamage(killer, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);
  }

  it('drops an independent personal slot for every contributor', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const p2 = sim.addPlayer('mage', 'Bru');
    const { boss } = spawnBossNow(sim);
    killWith(sim, boss, [p1, p2]);

    const items = boss.loot?.items ?? [];
    const shardOwners = items
      .filter((s) => s.itemId === 'inert_storm_shard')
      .flatMap((s) => s.personalFor ?? []);
    expect(shardOwners).toContain(p1);
    expect(shardOwners).toContain(p2);
    for (const slot of items) {
      expect(slot.personalFor && slot.personalFor.length === 1).toBe(true);
      expect(slot.openToAll).toBeFalsy();
    }
    const lockoutId = worldBossLockoutId(BOSS_ID);
    expect((sim as any).players.get(p1).raidLockouts.has(lockoutId)).toBe(false);
    expect((sim as any).players.get(p2).raidLockouts.has(lockoutId)).toBe(false);
    const e1 = (sim as any).entities.get(p1) as Entity;
    e1.pos = { ...boss.pos };
    sim.lootCorpse(boss.id, p1);
    expect((sim as any).players.get(p1).raidLockouts.has(lockoutId)).toBe(true);
    expect((sim as any).players.get(p2).raidLockouts.has(lockoutId)).toBe(false);
  });

  it('gives a contributor who LOOTED a boss no loot from a second boss the same day', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const first = spawnBossNow(sim);
    killWith(sim, first.boss, [p1]);
    expect((first.boss.loot?.items ?? []).length).toBeGreaterThan(0);
    const e1 = (sim as any).entities.get(p1) as Entity;
    e1.pos = { ...first.boss.pos };
    sim.lootCorpse(first.boss.id, p1); // consumes the daily

    (sim as any).worldBossEntityIds[0] = null;
    const second = spawnBossNow(sim);
    killWith(sim, second.boss, [p1]);
    const ownedBySecond = (second.boss.loot?.items ?? []).flatMap((s) => s.personalFor ?? []);
    expect(ownedBySecond).not.toContain(p1);
  });

  it('keeps the daily for a contributor who never looted the corpse', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const first = spawnBossNow(sim);
    killWith(sim, first.boss, [p1]);
    expect((first.boss.loot?.items ?? []).length).toBeGreaterThan(0);

    (sim as any).worldBossEntityIds[0] = null;
    const second = spawnBossNow(sim);
    killWith(sim, second.boss, [p1]);
    const ownedBySecond = (second.boss.loot?.items ?? []).flatMap((s) => s.personalFor ?? []);
    expect(ownedBySecond).toContain(p1); // still eligible: the kill alone burned nothing
  });

  // 40 world builds. Full map parity roughly doubled the world's entity count
  // (14 zones, 183 camps, 617 mobs against 66 camps before), so 40 Sim
  // constructions no longer fit vitest's 5s default. The assertion is
  // unchanged; only the budget moved.
  it('caps gear at one epic piece per contributor (never a glove AND a belt in one kill)', () => {
    let anyGearDropped = false;
    for (let seed = 1; seed <= 40; seed++) {
      const sim = makeSim(seed);
      sim.utcDay = DAY;
      const pids = [
        sim.addPlayer('warrior', 'Ada'),
        sim.addPlayer('mage', 'Bru'),
        sim.addPlayer('rogue', 'Cyd'),
      ];
      const { boss } = spawnBossNow(sim);
      killWith(sim, boss, pids);
      const items = boss.loot?.items ?? [];
      for (const pid of pids) {
        const gear = items.filter(
          (s) => (s.personalFor ?? []).includes(pid) && s.itemId !== 'inert_storm_shard',
        );
        expect(gear.length).toBeLessThanOrEqual(1);
        if (gear.length === 1) anyGearDropped = true;
      }
    }
    expect(anyGearDropped).toBe(true);
  }, 60_000);

  it('looting writes ONE raid-lockout entry that is both the gate and the rendered timer', () => {
    const RESET = 9_999_999_999;
    const sim = new Sim({
      seed: 7,
      playerClass: 'warrior',
      autoEquip: true,
      noPlayer: true,
      lockoutNowMs: () => 1_000,
      raidResetMs: () => RESET,
    } as any);
    const p1 = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    killWith(sim, boss, [p1]);
    const meta = (sim as any).players.get(p1);
    const lockoutId = worldBossLockoutId(BOSS_ID);
    expect(meta.raidLockouts.has(lockoutId)).toBe(false);
    const e1 = (sim as any).entities.get(p1) as Entity;
    e1.pos = { ...boss.pos };
    sim.lootCorpse(boss.id, p1);
    expect(meta.raidLockouts.get(lockoutId)).toBe(RESET);
    expect(isWorldBossLootEligible(meta, BOSS_ID, (sim as any).lockoutNowMs())).toBe(false);
  });

  it('produces identical personal loot for the same seed (determinism)', () => {
    const run = () => {
      const sim = makeSim(99);
      sim.utcDay = DAY;
      const p1 = sim.addPlayer('warrior', 'Ada');
      const p2 = sim.addPlayer('rogue', 'Bru');
      const { boss } = spawnBossNow(sim);
      killWith(sim, boss, [p1, p2]);
      return JSON.stringify(boss.loot?.items ?? []);
    };
    expect(run()).toBe(run());
  });
});

describe('world boss loot roster survives contributor death and grouping', () => {
  it('keeps a contributor who DIED to the boss on the loot roster (not just the hate table)', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const p2 = sim.addPlayer('mage', 'Bru');
    const { boss } = spawnBossNow(sim);
    const e1 = (sim as any).entities.get(p1) as Entity;
    const e2 = (sim as any).entities.get(p2) as Entity;
    (sim as any).dealDamage(e1, boss, 10, false, 'physical', 'Chip', 'hit', true);
    (sim as any).dealDamage(e2, boss, 10, false, 'physical', 'Chip', 'hit', true);
    expect(boss.threat.has(p2)).toBe(true);

    (sim as any).dealDamage(boss, e2, 999_999, false, 'physical', 'Boss', 'hit', true);
    expect(e2.dead).toBe(true);
    expect(boss.threat.has(p2)).toBe(false); // pruned off the live hate table...
    expect(boss.bossDamagers.has(p2)).toBe(true); // ...but kept on the permanent roster

    (sim as any).dealDamage(e1, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);

    const owners = (boss.loot?.items ?? []).flatMap((s) => s.personalFor ?? []);
    expect(owners).toContain(p1);
    expect(owners).toContain(p2);
  });

  it('clears the damager roster on a full evade-home reset: a wiped pull ends loot rights', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'WipedRaiderA');
    const p2 = sim.addPlayer('mage', 'FreshRaiderB');
    const { boss } = spawnBossNow(sim);
    const e1 = (sim as any).entities.get(p1) as Entity;
    const e2 = (sim as any).entities.get(p2) as Entity;

    (sim as any).dealDamage(e1, boss, 10, false, 'physical', 'Chip', 'hit', true);
    expect(boss.bossDamagers.has(p1)).toBe(true);
    (sim as any).resetEvadingMob(boss);
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.bossDamagers.size).toBe(0);

    (sim as any).dealDamage(e2, boss, 10, false, 'physical', 'Chip', 'hit', true);
    (sim as any).dealDamage(e2, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);
    const owners = (boss.loot?.items ?? []).flatMap((s) => s.personalFor ?? []);
    expect(owners).toContain(p2);
    expect(owners).not.toContain(p1);
  });

  it('clears the damager roster on respawn: loot rights never carry across lives', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    const e1 = (sim as any).entities.get(p1) as Entity;
    (sim as any).dealDamage(e1, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);
    expect(boss.bossDamagers.has(p1)).toBe(true); // the kill snapshot already rolled loot
    (sim as any).respawnMob(boss);
    expect(boss.bossDamagers.size).toBe(0);
  });

  it('the lootable corpse window always fits inside the spawn cadence (never overlaps)', () => {
    expect(WORLD_BOSS_CORPSE_SECONDS).toBeLessThan(WORLD_BOSS_INTERVAL_SECONDS);
  });

  it('lets a slain world boss corpse linger far longer than a normal corpse', () => {
    const sim = makeSim();
    const p1 = sim.addPlayer('warrior', 'Ada');
    const { boss } = spawnBossNow(sim);
    const e1 = (sim as any).entities.get(p1) as Entity;
    (sim as any).dealDamage(e1, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);
    expect(boss.corpseTimer).toBe(WORLD_BOSS_CORPSE_SECONDS);
    expect(WORLD_BOSS_CORPSE_SECONDS).toBeGreaterThanOrEqual(900);
  });

  it('never routes a world-boss epic through a party need/greed roll (personal loot only)', () => {
    const sim = makeSim();
    sim.utcDay = DAY;
    const p1 = sim.addPlayer('warrior', 'Ada');
    const p2 = sim.addPlayer('mage', 'Bru');
    sim.partyInvite(p1, p2);
    sim.partyAccept(p2);
    const { boss } = spawnBossNow(sim);
    const e1 = (sim as any).entities.get(p1) as Entity;
    const e2 = (sim as any).entities.get(p2) as Entity;
    (sim as any).dealDamage(e1, boss, 10, false, 'physical', 'Chip', 'hit', true);
    (sim as any).dealDamage(e2, boss, 10, false, 'physical', 'Chip', 'hit', true);
    (sim as any).dealDamage(e1, boss, 999_999, false, 'physical', 'Finisher', 'hit', true);
    expect(boss.dead).toBe(true);

    for (const slot of boss.loot?.items ?? []) {
      expect(slot.personalFor && slot.personalFor.length === 1).toBe(true);
      expect(slot.openToAll).toBeFalsy();
    }
    e1.pos = { ...boss.pos };
    sim.lootCorpse(boss.id, p1);
    expect((sim as any).pendingLootRolls.size).toBe(0);
  });
});

describe('world boss anti-kite snare (Howling Gale)', () => {
  function place(sim: Sim, boss: Entity, pid: number, offset: number): Entity {
    const p = (sim as any).entities.get(pid) as Entity;
    p.maxHp = p.hp = 1_000_000;
    p.pos = { x: boss.pos.x + offset, z: boss.pos.z, y: boss.pos.y };
    return p;
  }

  function firePulse(sim: Sim, boss: Entity, pid: number, state: 'chase' | 'attack'): void {
    const p = (sim as any).entities.get(pid) as Entity;
    (sim as any).dealDamage(p, boss, 100, false, 'physical', 'Chip', 'hit', true);
    boss.aiState = state;
    boss.aggroTargetId = pid;
    boss.inCombat = true;
    boss.leashAnchor = { ...boss.pos };
    boss.aoeSlowTimer = 1 / 20;
    sim.tick();
  }

  it('outruns a player on foot: boss move speed exceeds base run speed', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('hunter', 'Runner');
    const { boss } = spawnBossNow(sim);
    const p = (sim as any).entities.get(pid) as Entity;
    expect(boss.moveSpeed).toBeGreaterThan(p.moveSpeed);
  });

  it('snares a ranged kiter it is chasing, cutting move speed to 70% (not kiteable)', () => {
    const sim = makeSim();
    const kiter = sim.addPlayer('hunter', 'Kiter');
    const { boss } = spawnBossNow(sim);
    const p = place(sim, boss, kiter, 22);
    firePulse(sim, boss, kiter, 'chase');
    expect(boss.aiState).toBe('chase');
    const slow = p.auras.find((a) => a.kind === 'slow' && a.name === 'Howling Gale');
    expect(slow).toBeTruthy();
    expect(slow?.value).toBe(0.7);
    expect((sim as any).moveSpeedMult(p)).toBeCloseTo(0.7, 5);
  });

  it('also fires from the attack state and only snares players inside the radius', () => {
    const sim = makeSim();
    const near = sim.addPlayer('hunter', 'Near');
    const far = sim.addPlayer('hunter', 'Runner');
    const { boss } = spawnBossNow(sim);
    const pNear = place(sim, boss, near, 22);
    const pFar = place(sim, boss, far, 200);
    firePulse(sim, boss, near, 'attack');
    expect(pNear.auras.some((a) => a.kind === 'slow' && a.name === 'Howling Gale')).toBe(true);
    expect(pFar.auras.some((a) => a.name === 'Howling Gale')).toBe(false);
  });

  it('does not re-apply the snare on the next engaged tick (once-per-cadence guard)', () => {
    const sim = makeSim();
    const kiter = sim.addPlayer('hunter', 'Kiter');
    const { boss } = spawnBossNow(sim);
    const p = place(sim, boss, kiter, 22);
    firePulse(sim, boss, kiter, 'chase');
    const slow = p.auras.find((a) => a.kind === 'slow' && a.name === 'Howling Gale');
    expect(slow).toBeTruthy();
    expect(boss.aoeSlowTimer).toBeGreaterThan(1);
    const remainingAfterPulse = slow!.remaining;
    place(sim, boss, kiter, 22);
    (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
    boss.aiState = 'chase';
    boss.aggroTargetId = kiter;
    boss.inCombat = true;
    boss.leashAnchor = { ...boss.pos };
    sim.tick();
    const slow2 = p.auras.find((a) => a.kind === 'slow' && a.name === 'Howling Gale');
    expect(slow2).toBeTruthy();
    expect(slow2!.remaining).toBeCloseTo(remainingAfterPulse - 1 / 20, 5);
  });
});

describe('world boss slow immunity', () => {
  it('shrugs off a player-applied snare but still takes a self-applied (scripted) slow', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    const pid = sim.addPlayer('mage', 'Chiller');

    (sim as any).applyAura(boss, {
      id: 'frostbolt_slow',
      name: 'Frostbolt',
      kind: 'slow',
      remaining: 5,
      duration: 5,
      value: 0.4,
      sourceId: pid,
      school: 'frost',
    });
    expect(boss.auras.some((a: { kind: string }) => a.kind === 'slow')).toBe(false);

    (sim as any).applyAura(boss, {
      id: 'self_slow',
      name: 'Rooted Stance',
      kind: 'slow',
      remaining: 5,
      duration: 5,
      value: 0.5,
      sourceId: boss.id,
      school: 'nature',
    });
    expect(boss.auras.some((a: { kind: string; id: string }) => a.id === 'self_slow')).toBe(true);
  });
});

describe('world boss participant HP scaling', () => {
  function engage(sim: Sim, boss: Entity, pid: number): Entity {
    const p = (sim as any).entities.get(pid) as Entity;
    p.maxHp = p.hp = 1_000_000;
    p.pos = { x: boss.pos.x + 8, z: boss.pos.z, y: boss.pos.y };
    (sim as any).dealDamage(p, boss, 10, false, 'physical', 'Chip', 'hit', true);
    return p;
  }

  it('spawns at 40k HP and grows the pool gently per participant, capped at 1M', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    expect(boss.maxHp).toBe(40_000);
    expect(boss.hp).toBe(40_000);

    for (let i = 0; i < 5; i++) engage(sim, boss, sim.addPlayer('warrior', `P${i}`));
    sim.tick();
    expect(boss.maxHp).toBe(60_000);

    for (let i = 5; i < 220; i++) engage(sim, boss, sim.addPlayer('warrior', `Q${i}`));
    sim.tick();
    expect(boss.maxHp).toBe(1_000_000);
  });

  it('never shrinks the grown pool when participants leave', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    for (let i = 0; i < 5; i++) engage(sim, boss, sim.addPlayer('warrior', `P${i}`));
    sim.tick();
    expect(boss.maxHp).toBe(60_000);
    boss.threat.clear();
    sim.tick();
    expect(boss.maxHp).toBe(60_000);
  });
});

describe('world boss is imposing and loud', () => {
  it('renders at a fixed visual scale while its melee reach stays pinned to a scale-5 body', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    expect(boss.scale).toBe(8);
    const reach = combatProfileForMob(boss.templateId, boss.scale).meleeRange;
    expect(reach).toBe(scaledDefaultMobMeleeRange(5));
    expect(reach).toBeLessThan(scaledDefaultMobMeleeRange(boss.scale));
  });

  it('bellows its engage yell far past the default yell range', () => {
    const sim = makeSim();
    const near = sim.addPlayer('warrior', 'Tank');
    const far = sim.addPlayer('warrior', 'Watcher');
    const { boss } = spawnBossNow(sim);
    const pn = (sim as any).entities.get(near) as Entity;
    pn.maxHp = pn.hp = 1_000_000;
    pn.pos = { x: boss.pos.x + 8, z: boss.pos.z, y: boss.pos.y };
    (sim as any).entities.get(far).pos = { x: boss.pos.x + 200, z: boss.pos.z, y: boss.pos.y };
    let engageToFar = 0;
    for (let t = 0; t < 5; t++) {
      const evs = sim.tick();
      for (const e of evs)
        if (e.type === 'chat' && (e as any).channel === 'yell' && (e as any).pid === far)
          if (/wake the mountain/.test((e as any).text)) engageToFar++;
    }
    expect(engageToFar).toBeGreaterThanOrEqual(1);
  });

  it('bellows periodic battle cries across the zone, but not past the loud range', () => {
    const sim = makeSim();
    const tank = sim.addPlayer('warrior', 'Tank');
    const far = sim.addPlayer('warrior', 'Watcher');
    const tooFar = sim.addPlayer('warrior', 'TooFar');
    const { boss } = spawnBossNow(sim);
    const pt = (sim as any).entities.get(tank) as Entity;
    pt.maxHp = pt.hp = 1_000_000;
    pt.pos = { x: boss.pos.x + 8, z: boss.pos.z, y: boss.pos.y };
    (sim as any).entities.get(far).pos = { x: boss.pos.x + 200, z: boss.pos.z, y: boss.pos.y };
    (sim as any).entities.get(tooFar).pos = { x: boss.pos.x + 400, z: boss.pos.z, y: boss.pos.y };
    (sim as any).dealDamage(pt, boss, 100, false, 'physical', 'Chip', 'hit', true);
    boss.aiState = 'attack';
    boss.aggroTargetId = tank;
    boss.inCombat = true;
    boss.leashAnchor = { ...boss.pos };
    boss.loudYellTimer = 1 / 20;
    const evs = sim.tick();
    const yellTextTo = (pid: number) =>
      evs
        .filter((e) => e.type === 'chat' && (e as any).channel === 'yell' && (e as any).pid === pid)
        .map((e) => (e as any).text as string);
    expect(yellTextTo(far).some((t) => /THUNDER ANSWERS/.test(t))).toBe(true);
    expect(yellTextTo(tooFar)).toHaveLength(0);
  });
});

describe('world boss pathing (phases through obstacles)', () => {
  it('walks a dead-straight chase line through a building collider', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    boss.pos = { x: 10, z: 2, y: 0 };
    const dest = { x: 10, z: 22, y: 0 };
    let arrived = false;
    const straightTicks = Math.ceil(20 / (boss.moveSpeed * (1 / 20))) + 2;
    for (let t = 0; t < straightTicks && !arrived; t++) {
      arrived = (sim as any).moveToward(boss, dest, boss.moveSpeed);
      expect(Math.abs(boss.pos.x - 10)).toBeLessThan(1e-6);
    }
    expect(arrived).toBe(true);
  });

  it('an ordinary mob still collides: the same straight line is deflected', () => {
    const sim = makeSim();
    const { boss } = spawnBossNow(sim);
    boss.templateId = 'forest_wolf';
    boss.pos = { x: 10, z: 8, y: 0 };
    (sim as any).moveToward(boss, { x: 10, z: 22, y: 0 }, 7);
    const deflected = Math.abs(boss.pos.x - 10) > 1e-6 || Math.abs(boss.pos.z - 8) < 0.3;
    expect(deflected).toBe(true);
  });

  it('the template opts in via phasesThroughObstacles', () => {
    expect(MOBS[BOSS_ID]?.phasesThroughObstacles).toBe(true);
  });
});

describe('world boss summons erupt centered on him and engage immediately', () => {
  it('spawns adds on the boss, aggroed on his target, anchored where they erupted', () => {
    const sim = makeSim();
    const tank = sim.addPlayer('warrior', 'Tank');
    const { boss } = spawnBossNow(sim);
    const pt = (sim as any).entities.get(tank) as Entity;
    pt.maxHp = pt.hp = 1_000_000;
    pt.pos = { x: boss.pos.x + 10, z: boss.pos.z, y: boss.pos.y };
    (sim as any).dealDamage(pt, boss, 50, false, 'physical', 'Chip', 'hit', true);
    boss.hp = Math.floor(boss.maxHp * 0.6);
    sim.tick();
    const adds = [...(sim as any).entities.values()].filter(
      (e: Entity) => e.templateId === 'thunzharr_stormling' && !e.dead,
    );
    expect(adds).toHaveLength(2);
    for (const add of adds) {
      expect(Math.hypot(add.pos.x - boss.pos.x, add.pos.z - boss.pos.z)).toBeLessThan(2);
      expect(add.aggroTargetId).toBe(tank);
      expect(add.inCombat).toBe(true);
      expect(add.aiState === 'chase' || add.aiState === 'attack').toBe(true);
      // Anchored where they ERUPTED (the tight cluster on the boss, before the
      // add's first chase step): kited from here, the leash walks them back to
      // this point beside the fight.
      expect(Math.hypot(add.spawnPos.x - boss.pos.x, add.spawnPos.z - boss.pos.z)).toBeLessThan(2);
      expect(add.leashAnchor).not.toBeNull();
    }
  });

  it('adds hatched from a KITED boss engage instead of leashing home instantly', () => {
    const sim = makeSim();
    const tank = sim.addPlayer('warrior', 'Tank');
    const { boss } = spawnBossNow(sim);
    const pt = (sim as any).entities.get(tank) as Entity;
    pt.maxHp = pt.hp = 1_000_000;
    // Drag the fight well past the open-world leash radius (45) from his spawn,
    // as a kiter does; his own anchor refreshes from the player's hits.
    boss.pos = {
      x: boss.spawnPos.x + 80,
      z: boss.spawnPos.z,
      y: boss.pos.y,
    };
    boss.prevPos = { ...boss.pos };
    (sim as any).rebucket(boss);
    pt.pos = { x: boss.pos.x + 10, z: boss.pos.z, y: boss.pos.y };
    pt.prevPos = { ...pt.pos };
    (sim as any).rebucket(pt);
    (sim as any).dealDamage(pt, boss, 50, false, 'physical', 'Chip', 'hit', true);
    boss.hp = Math.floor(boss.maxHp * 0.6);
    sim.tick();
    const adds = [...(sim as any).entities.values()].filter(
      (e: Entity) => e.templateId === 'thunzharr_stormling' && !e.dead,
    );
    expect(adds).toHaveLength(2);
    // The old behavior anchored adds to the boss's ORIGINAL spawn, so hatching
    // 80yd out put them instantly past their leash: first engaged tick flipped
    // them to evade with a wiped hate table and they never swung at anyone.
    for (let t = 0; t < 20; t++) sim.tick();
    for (const add of adds) {
      expect(add.aiState === 'chase' || add.aiState === 'attack').toBe(true);
      expect(add.aggroTargetId).toBe(tank);
      expect(add.threat.size).toBeGreaterThan(0);
    }
  });
});
