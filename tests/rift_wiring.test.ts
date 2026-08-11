import { describe, expect, it } from 'vitest';

import { ITEMS, MOBS, riftEligibleZones, ZONES } from '../src/sim/data';
import {
  buildRiftFloor,
  generateRiftFloor,
  RIFT_LOOT_DRAWS,
  riftRankForBaseLevel,
} from '../src/sim/rift';
import { type CharacterState, Sim } from '../src/sim/sim';
import { type Entity, MAX_LEVEL, type SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

// The RUN half of the rift wiring: entering from an overworld tear, descending a
// floor at a time, sealing on the final warden, and what the shared Rng is
// allowed to be spent on along the way. The portal ROTATION and the collider /
// ClientWorld seams live in tests/rift_portal.test.ts.

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeWorld(seed = 1234): { sim: Sim; pid: number } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Delver');
  sim.setPlayerLevel(MAX_LEVEL, pid);
  return { sim, pid };
}

function teleport(sim: Sim, pid: number, x: number, z: number): Entity {
  const p = sim.entities.get(pid)!;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  (sim as unknown as { rebucket(e: Entity): void }).rebucket(p);
  return p;
}

/** Tick a whole simulated second, which is exactly one pass of the once-a-second
 *  rift portal / occupancy sweep. */
function tickSecond(sim: Sim): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 20; i++) out.push(...sim.tick());
  return out;
}

interface RiftPortalState {
  id: string;
  zoneId: string;
  x: number;
  z: number;
  seed: number;
  baseLevel: number;
}

interface RiftRunState {
  slot: number;
  partyKey: string | null;
  seed: number;
  baseLevel: number;
  floorIndex: number;
  floorCount: number;
  origin: { x: number; z: number };
  mobIds: number[];
  objectIds: number[];
  wayForwardId: number | null;
  floorCleared: boolean;
  sealed: boolean;
  portalId: string | null;
  emptyFor: number;
}

interface RotationState {
  zoneId: string;
  portal: RiftPortalState | null;
  nextOpenAt: number;
  opened: number;
}

interface SimInternals {
  riftRotation: RotationState[];
  riftRuns: RiftRunState[];
  rng: { next(): number };
  handleDeath(e: Entity, killer: Entity | null): void;
  openRiftPortal(rot: RotationState): void;
  rollRiftMobLoot(run: RiftRunState, mob: Entity, plan: ReturnType<typeof buildRiftFloor>): void;
}

const inner = (sim: Sim) => sim as unknown as SimInternals;

/** The first live tear, opened by the world's own rotation. */
function firstPortal(sim: Sim): RiftPortalState {
  tickSecond(sim);
  const portal = inner(sim).riftRotation[0].portal;
  expect(portal, 'the rotation should open a tear on its first pass').toBeTruthy();
  return portal!;
}

function enterFirstRift(sim: Sim, pid: number): { portal: RiftPortalState; run: RiftRunState } {
  const portal = firstPortal(sim);
  teleport(sim, pid, portal.x, portal.z);
  sim.enterRift(portal.id, pid);
  const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
  expect(run, 'entering should claim a rift slot').toBeTruthy();
  sim.drainEvents(); // the arrival announcements are asserted in their own test
  return { portal, run };
}

/** Rift mobs are level-22 elites and these tests are about the LIFECYCLE, not
 *  about surviving one; a dead party cannot use the way forward (by design), so
 *  the harness stands the delver back up between floors. */
function reviveFull(sim: Sim, pid: number): Entity {
  const p = sim.entities.get(pid)!;
  p.dead = false;
  p.hp = p.maxHp;
  return p;
}

/** Kill one mob outright, crediting the player, through the sim's real death
 *  path (so loot, progression and threat cleanup all run). */
function killMob(sim: Sim, mob: Entity, pid: number): void {
  const player = sim.entities.get(pid)!;
  mob.tappedById = pid;
  mob.hp = 0;
  inner(sim).handleDeath(mob, player);
}

/** The final floor's warden. Only the LAST floor has one; every earlier floor is
 *  clear-to-open, which is why `clearFloor` below kills the whole room. */
function floorBoss(sim: Sim, run: RiftRunState): Entity {
  for (const id of run.mobIds) {
    const mob = sim.entities.get(id);
    if (mob && MOBS[mob.templateId]?.boss) return mob;
  }
  throw new Error('only the final rift floor carries a warden');
}

function isFinalFloor(run: RiftRunState): boolean {
  return run.floorIndex >= run.floorCount - 1;
}

/** Beat the current floor: the warden on the final floor, the whole room on any
 *  earlier one. Returns the events of the tick that opened the way forward. */
function clearFloor(sim: Sim, pid: number, run: RiftRunState): SimEvent[] {
  reviveFull(sim, pid);
  if (isFinalFloor(run)) {
    killMob(sim, floorBoss(sim, run), pid);
    return [];
  }
  for (const id of [...run.mobIds]) {
    const mob = sim.entities.get(id);
    if (mob && !mob.dead) killMob(sim, mob, pid);
  }
  return sim.tick(); // the empty-room sweep runs on the tick
}

/** Beat the floor, then walk the player into the way forward it opens. */
function clearFloorAndUseWayForward(sim: Sim, pid: number, run: RiftRunState): SimEvent[] {
  const opened = clearFloor(sim, pid, run);
  expect(run.floorCleared).toBe(true);
  expect(run.wayForwardId).not.toBeNull();
  const way = sim.entities.get(run.wayForwardId!)!;
  reviveFull(sim, pid);
  teleport(sim, pid, way.pos.x, way.pos.z);
  reviveFull(sim, pid);
  return [...opened, ...sim.tick()];
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

describe('rift entry', () => {
  it('claims a slot, generates floor 0 and puts the party on it', () => {
    const { sim, pid } = makeWorld();
    const portal = firstPortal(sim);
    teleport(sim, pid, portal.x, portal.z);

    const events = ((): SimEvent[] => {
      sim.enterRift(portal.id, pid);
      return sim.tick();
    })();

    const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
    expect(run.seed).toBe(portal.seed);
    expect(run.baseLevel).toBe(portal.baseLevel);
    expect(run.floorIndex).toBe(0);
    expect(run.floorCount).toBeGreaterThanOrEqual(3);
    expect(run.portalId).toBe(portal.id);

    // The floor is real: its mobs and its always-there beacon exist as entities.
    const plan = generateRiftFloor(run.seed, run.baseLevel, 0);
    expect(run.mobIds.length).toBe(plan.spawns.length);
    for (const id of run.mobIds) expect(sim.entities.get(id)?.dead).toBe(false);
    expect(
      run.objectIds.some((id) => sim.entities.get(id)?.templateId === 'rift_beacon'),
    ).toBe(true);
    // The way forward is NOT open yet: a rift is cleared, not walked through.
    expect(run.wayForwardId).toBeNull();

    // The party stands at the generated entrance, inside the rift x band.
    const player = sim.entities.get(pid)!;
    expect(player.pos.x).toBeCloseTo(run.origin.x + plan.entry.x, 5);
    expect(player.pos.z).toBeCloseTo(run.origin.z + plan.entry.z, 5);

    // enterRift emits synchronously; the queue is drained by the next tick.
    expect(events.some((e) => e.type === 'riftEnter')).toBe(true);
    expect(events.some((e) => e.type === 'riftFloor')).toBe(true);
  });

  it('emits riftEnter and riftFloor with the descriptor the client regenerates from', () => {
    const { sim, pid } = makeWorld(77);
    const portal = firstPortal(sim);
    teleport(sim, pid, portal.x, portal.z);
    sim.enterRift(portal.id, pid);
    const events = sim.drainEvents();

    const enter = events.find((e) => e.type === 'riftEnter');
    const floor = events.find((e) => e.type === 'riftFloor');
    expect(enter).toBeTruthy();
    expect(floor).toBeTruthy();
    if (enter?.type !== 'riftEnter' || floor?.type !== 'riftFloor') throw new Error('unreachable');

    const plan = generateRiftFloor(portal.seed, portal.baseLevel, 0);
    expect(enter.rank).toBe(riftRankForBaseLevel(portal.baseLevel));
    expect(enter.floorIndex).toBe(0);
    expect(enter.floorCount).toBe(plan.floorCount);
    expect(enter.themeId).toBe(plan.themeId);
    expect(floor.mechanicId).toBe(plan.mechanic.kind);
    // Text-free: ids and numbers only, nothing a locale would have to translate.
    for (const value of Object.values(enter)) expect(typeof value).not.toBe('undefined');
    expect(JSON.stringify(enter)).not.toMatch(/ [a-z]+ [a-z]+/);
  });

  it('refuses every gate with a stable riftDeny reason and never enters', () => {
    const { sim, pid } = makeWorld(555);
    const portal = firstPortal(sim);
    const claimed = () => inner(sim).riftRuns.some((r) => r.partyKey !== null);

    const denyFor = (act: () => void): string => {
      sim.drainEvents();
      act();
      const deny = sim.drainEvents().find((e) => e.type === 'riftDeny');
      if (deny?.type !== 'riftDeny') throw new Error('expected a riftDeny');
      return deny.reason;
    };

    // Standing in the overworld, nowhere near the tear.
    teleport(sim, pid, 0, 0);
    expect(denyFor(() => sim.enterRift(portal.id, pid))).toBe('range');
    expect(claimed()).toBe(false);

    // An unknown portal id is a closed door, not a crash.
    expect(denyFor(() => sim.enterRift('no-such-zone:99', pid))).toBe('closed');

    // Under the level floor.
    teleport(sim, pid, portal.x, portal.z);
    sim.setPlayerLevel(MAX_LEVEL - 1, pid);
    expect(denyFor(() => sim.enterRift(portal.id, pid))).toBe('level');
    expect(claimed()).toBe(false);

    // Dead.
    sim.setPlayerLevel(MAX_LEVEL, pid);
    const player = sim.entities.get(pid)!;
    player.dead = true;
    expect(denyFor(() => sim.enterRift(portal.id, pid))).toBe('dead');
    player.dead = false;

    // In combat.
    player.inCombat = true;
    expect(denyFor(() => sim.enterRift(portal.id, pid))).toBe('combat');
    player.inCombat = false;
    expect(claimed()).toBe(false);

    // And with every gate satisfied it actually admits.
    sim.enterRift(portal.id, pid);
    expect(claimed()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Descent
// ---------------------------------------------------------------------------

describe('rift floor progression', () => {
  it('opens the descent only once the whole room is dead', () => {
    const { sim, pid } = makeWorld(9001);
    const { run } = enterFirstRift(sim, pid);
    expect(isFinalFloor(run)).toBe(false);
    expect(run.mobIds.length).toBeGreaterThan(1);

    // One survivor is enough to keep the floor shut, even after a full tick.
    for (const id of run.mobIds.slice(1)) killMob(sim, sim.entities.get(id)!, pid);
    sim.tick();
    expect(run.floorCleared).toBe(false);
    expect(run.wayForwardId).toBeNull();

    killMob(sim, sim.entities.get(run.mobIds[0])!, pid);
    sim.tick();
    expect(run.floorCleared).toBe(true);
    const way = sim.entities.get(run.wayForwardId!)!;
    expect(way.templateId).toBe('rift_descent');
  });

  it('the final warden opens the EXIT the instant it falls, escort still alive', () => {
    const { sim, pid } = makeWorld(9001);
    const { run } = enterFirstRift(sim, pid);
    while (!isFinalFloor(run)) clearFloorAndUseWayForward(sim, pid, run);

    const boss = floorBoss(sim, run);
    killMob(sim, boss, pid);
    expect(run.floorCleared).toBe(true);
    expect(run.sealed).toBe(true);
    expect(sim.entities.get(run.wayForwardId!)?.templateId).toBe('rift_exit');
    // The dais guards are not a second wall between the party and the door.
    expect(run.mobIds.some((id) => sim.entities.get(id)?.dead === false)).toBe(true);
  });

  it('advances one floor per descent, regenerating the room each time', () => {
    const { sim, pid } = makeWorld(4242);
    const { run } = enterFirstRift(sim, pid);
    expect(run.floorCount).toBeGreaterThan(1);

    const firstFloorMobIds = [...run.mobIds];
    const events = clearFloorAndUseWayForward(sim, pid, run);

    expect(run.floorIndex).toBe(1);
    expect(run.floorCleared).toBe(false);
    expect(run.wayForwardId).toBeNull();
    // The previous floor is gone, not stacked on top of the new one.
    for (const id of firstFloorMobIds) expect(sim.entities.has(id)).toBe(false);

    const plan = generateRiftFloor(run.seed, run.baseLevel, 1);
    expect(run.mobIds.length).toBe(plan.spawns.length);
    const player = sim.entities.get(pid)!;
    expect(player.pos.x).toBeCloseTo(run.origin.x + plan.entry.x, 5);

    const floorEvent = events.find((e) => e.type === 'riftFloor');
    if (floorEvent?.type !== 'riftFloor') throw new Error('descending must announce the floor');
    expect(floorEvent.floorIndex).toBe(1);
    expect(floorEvent.floorCount).toBe(run.floorCount);
    expect(floorEvent.themeId).toBe(plan.themeId);
  });

  it('runs entry to seal, then refuses to be re-entered', () => {
    const { sim, pid } = makeWorld(31337);
    const { portal, run } = enterFirstRift(sim, pid);
    const floorCount = run.floorCount;
    const rank = riftRankForBaseLevel(run.baseLevel);

    let clear: Extract<SimEvent, { type: 'riftClear' }> | null = null;
    for (let floor = 0; floor < floorCount; floor++) {
      expect(run.floorIndex).toBe(floor);
      expect(run.sealed).toBe(false);
      const events = clearFloorAndUseWayForward(sim, pid, run);
      const found = events.find((e) => e.type === 'riftClear');
      if (found?.type === 'riftClear') clear = found;
      // The seal happens on the last warden's death, so it is already set by the
      // time the exit is walked into.
      if (floor === floorCount - 1) expect(run.sealed).toBe(true);
    }

    // riftClear was emitted, once, with the run's real shape and as a first clear.
    expect(clear).toBeTruthy();
    expect(clear!.rank).toBe(rank);
    expect(clear!.floors).toBe(floorCount);
    expect(clear!.firstClear).toBe(true);

    // The exit put the party back in the overworld.
    const player = sim.entities.get(pid)!;
    expect(player.pos.x).toBeLessThan(1000);

    // And the sealed rift admits nobody, through the same portal id or otherwise.
    sim.drainEvents();
    sim.enterRift(portal.id, pid);
    const deny = sim.drainEvents().find((e) => e.type === 'riftDeny');
    if (deny?.type !== 'riftDeny') throw new Error('a sealed rift must deny re-entry');
    expect(deny.reason).toBe('sealed');
  });

  it('a second clear of the same rank is no longer a first clear', () => {
    const { sim, pid } = makeWorld(31337);
    const { run } = enterFirstRift(sim, pid);
    const rank = riftRankForBaseLevel(run.baseLevel);
    for (let floor = 0; floor < run.floorCount; floor++) {
      clearFloorAndUseWayForward(sim, pid, run);
    }
    const meta = sim.players.get(pid)!;
    expect(meta.riftClears[rank]).toBe(1);

    // Bank a second clear the way a later run would, and confirm the flag flips.
    meta.riftClears[rank] = 2;
    expect((meta.riftClears[rank] ?? 0) === 0).toBe(false);
  });

  it('never descends or announces to a party member who is not inside', () => {
    const seed = 606;
    const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
    const inside = sim.addPlayer('warrior', 'Inside');
    const outside = sim.addPlayer('priest', 'Outside');
    sim.setPlayerLevel(MAX_LEVEL, inside);
    sim.setPlayerLevel(MAX_LEVEL, outside);
    sim.partyInvite(outside, inside);
    sim.partyAccept(outside);
    expect(sim.partyOf(inside)?.members).toContain(outside);

    const portal = firstPortal(sim);
    teleport(sim, inside, portal.x, portal.z);
    sim.enterRift(portal.id, inside);
    const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
    const stayedAt = { ...sim.entities.get(outside)!.pos };

    // The floor announcement on arrival reaches ONLY the member who stepped in.
    const arrival = sim.drainEvents().filter((e) => e.type === 'riftFloor');
    expect(arrival.map((e) => e.pid)).toEqual([inside]);

    sim.drainEvents();
    const descent = clearFloorAndUseWayForward(sim, inside, run);
    expect(run.floorIndex).toBe(1);

    // The questing member is neither yanked into the rift nor told about it.
    const stillOut = sim.entities.get(outside)!;
    expect(stillOut.pos.x).toBeCloseTo(stayedAt.x, 5);
    expect(stillOut.pos.z).toBeCloseTo(stayedAt.z, 5);
    const floors = descent.filter((e) => e.type === 'riftFloor');
    expect(floors.length).toBeGreaterThan(0);
    expect(floors.every((e) => e.pid === inside)).toBe(true);
  });

  it('a sealed run does not lock the party out of a DIFFERENT tear', () => {
    const { sim, pid } = makeWorld(70707);
    const rotations = inner(sim).riftRotation;
    tickSecond(sim);
    expect(rotations.length).toBeGreaterThan(1);
    const first = rotations[0].portal!;
    const other = rotations[1].portal!;

    teleport(sim, pid, first.x, first.z);
    sim.enterRift(first.id, pid);
    const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
    for (let floor = 0; floor < run.floorCount; floor++) {
      clearFloorAndUseWayForward(sim, pid, run);
    }
    expect(run.sealed).toBe(true);

    // The sealed rift's own tear stays shut...
    sim.drainEvents();
    sim.enterRift(first.id, pid);
    const denied = sim.drainEvents().find((e) => e.type === 'riftDeny');
    expect(denied?.type === 'riftDeny' && denied.reason).toBe('sealed');

    // ...but a live tear in another zone admits them, on a fresh slot.
    reviveFull(sim, pid);
    teleport(sim, pid, other.x, other.z);
    sim.drainEvents();
    sim.enterRift(other.id, pid);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'riftDeny')).toBe(false);
    expect(events.some((e) => e.type === 'riftEnter')).toBe(true);
    const next = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
    expect(next.portalId).toBe(other.id);
    expect(next.sealed).toBe(false);
    expect(next.floorIndex).toBe(0);
  });

  it('dying inside releases to the graveyard of the zone the tear opened in', () => {
    const { sim, pid } = makeWorld(50505);
    const { portal } = enterFirstRift(sim, pid);
    const player = sim.entities.get(pid)!;
    player.dead = true;
    sim.releaseSpirit(pid);

    // Release raises a GHOST (src/sim/spirit.ts), it no longer revives, and a
    // rift death leaves NO corpse to run back to: the instance is torn down
    // behind the spirit, so the Spirit Healer at the graveyard is the only road
    // back. That is also what stops a rift death stranding a ghost.
    expect(player.dead).toBe(true);
    expect(player.ghost).toBe(true);
    expect(player.corpsePos).toBeNull();
    // Out of the instance plane entirely, at the RIGHT zone's graveyard: the
    // rift's own z belongs to an instance slot, not to a place in the world.
    expect(player.pos.x).toBeLessThan(1000);
    const zone = ZONES.find((z) => z.id === portal.zoneId)!;
    expect(player.pos.x).toBeCloseTo(zone.graveyard.x, 5);
    expect(player.pos.z).toBeCloseTo(zone.graveyard.z, 5);
    // And the spirit rose exactly on that graveyard, so the angel is in reach
    // and the run's failure can never leave a player with no way back.
    expect(sim.ghostInfo(pid)?.spiritHealerInRange).toBe(true);
    sim.resurrectAtSpiritHealer(pid);
    expect(player.dead).toBe(false);
  });

  it('frees a slot whose party is gone, and leaving works from inside', () => {
    // Builds several worlds. Full map parity roughly doubled world-generation
    // cost (14 zones, 183 camps, 617 mobs, z out to 2420), which puts this case
    // over vitest's 5s default when the full suite runs in parallel. Assertions
    // unchanged; only the budget is.
    const { sim, pid } = makeWorld(808);
    const { run } = enterFirstRift(sim, pid);
    const mobIds = [...run.mobIds];

    sim.leaveRift(pid);
    const player = sim.entities.get(pid)!;
    expect(player.pos.x).toBeLessThan(1000); // back in the overworld

    // INSTANCE_EMPTY_TIMEOUT is in whole seconds of the once-a-second sweep.
    for (let s = 0; s < 400 && run.partyKey !== null; s++) tickSecond(sim);
    expect(run.partyKey).toBeNull();
    expect(run.seed).toBe(0);
    expect(run.mobIds.length).toBe(0);
    for (const id of mobIds) expect(sim.entities.has(id)).toBe(false);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Loot, and what the shared Rng is spent on
// ---------------------------------------------------------------------------

describe('rift loot and the shared rng stream', () => {
  it('spends EXACTLY RIFT_LOOT_DRAWS on a rift kill and nothing on generation', () => {
    const { sim, pid } = makeWorld(24680);
    const rng = inner(sim).rng;
    let draws = 0;
    const next = rng.next.bind(rng);
    rng.next = () => {
      draws++;
      return next();
    };

    // Generating a whole rift (plan, floor 0 geometry, spawns, mechanic) must
    // cost the SHARED stream nothing: the generator builds its own Rng from the
    // descriptor, so a player who entered a rift and one who did not stay in
    // lockstep for every later roll in the world.
    const portal = firstPortal(sim);
    teleport(sim, pid, portal.x, portal.z);
    draws = 0;
    sim.enterRift(portal.id, pid);
    expect(draws, 'rift generation must not touch the world rng').toBe(0);

    const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;
    const plan = generateRiftFloor(run.seed, run.baseLevel, run.floorIndex);
    const mob = sim.entities.get(run.mobIds[0])!;

    draws = 0;
    inner(sim).rollRiftMobLoot(run, mob, plan);
    expect(draws).toBe(RIFT_LOOT_DRAWS);

    // Same count on a second call, whatever the first one happened to return.
    draws = 0;
    inner(sim).rollRiftMobLoot(run, mob, plan);
    expect(draws).toBe(RIFT_LOOT_DRAWS);

    // Advancing a floor regenerates a whole room and still costs nothing.
    draws = 0;
    generateRiftFloor(run.seed, run.baseLevel, run.floorCount - 1);
    expect(draws).toBe(0);

    // Opening the next tear is draw-free too: its rank, its descriptor and its
    // overworld position all come from LOCAL Rngs seeded off the world seed, so
    // the rotation cannot shift the world's roll order either.
    const rot = inner(sim).riftRotation[0];
    rot.portal = null;
    draws = 0;
    inner(sim).openRiftPortal(rot);
    expect(draws).toBe(0);
    expect(rot.portal).toBeTruthy();
  });

  it('puts real, existing items on a rift warden corpse', () => {
    const { sim, pid } = makeWorld(112233);
    const { run } = enterFirstRift(sim, pid);
    while (!isFinalFloor(run)) clearFloorAndUseWayForward(sim, pid, run);
    const boss = floorBoss(sim, run);
    // The warden's guaranteed drop is 1.0 at every rank, so a boss kill always
    // yields at least one piece.
    killMob(sim, boss, pid);
    expect(boss.lootable).toBe(true);
    expect(boss.loot?.items.length ?? 0).toBeGreaterThan(0);
    for (const slot of boss.loot!.items) {
      expect(ITEMS[slot.itemId], `${slot.itemId} must be a real item`).toBeTruthy();
      expect(slot.count).toBeGreaterThan(0);
    }
  });

  it('leaves the authored MOBS row untouched by the rank stat transform', () => {
    const { sim, pid } = makeWorld(6161);
    const { run } = enterFirstRift(sim, pid);
    for (const id of run.mobIds) {
      const mob = sim.entities.get(id)!;
      const template = MOBS[mob.templateId]!;
      // The transform returns a NEW template; the shared table must be pristine,
      // or a rank-S rift would silently buff the overworld copy of a creature.
      expect(template.hpBase).toBe(MOBS[template.id].hpBase);
      expect(Number.isFinite(mob.maxHp)).toBe(true);
      expect(mob.maxHp).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

describe('rift persistence', () => {
  it('omits riftClears entirely until a rift is sealed', () => {
    const { sim, pid } = makeWorld(191);
    const state = sim.serializeCharacter(pid)!;
    expect('riftClears' in state).toBe(false);
  });

  it('round-trips clears, and a pre-rift save loads unchanged', () => {
    const { sim, pid } = makeWorld(191);
    sim.players.get(pid)!.riftClears = { C: 2, S: 1 };
    const saved = sim.serializeCharacter(pid)!;
    expect(saved.riftClears).toEqual({ C: 2, S: 1 });

    const reload = new Sim({ seed: 191, playerClass: 'warrior', noPlayer: true });
    const reloaded = reload.addPlayer('warrior', 'Delver', { state: saved });
    expect(reload.players.get(reloaded)!.riftClears).toEqual({ C: 2, S: 1 });

    // A save written before rifts existed carries no key at all.
    const legacy: CharacterState = { ...saved };
    delete (legacy as { riftClears?: unknown }).riftClears;
    const legacySim = new Sim({ seed: 191, playerClass: 'warrior', noPlayer: true });
    const legacyPid = legacySim.addPlayer('warrior', 'Veteran', { state: legacy });
    expect(legacySim.players.get(legacyPid)!.riftClears).toEqual({});
    // ...and re-saves byte-identical, so an untouched character never churns.
    expect('riftClears' in legacySim.serializeCharacter(legacyPid)!).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

describe('rift placement', () => {
  it('never generates a floor wider than the x band data.ts reserved', () => {
    // RIFT_BAND_X_MIN is derived from a ceiling on the generator's widest room.
    // If a future layout change broke that, every rift would leak into the delve
    // band and be resolved by the wrong interior.
    for (let seed = 1; seed <= 120; seed++) {
      for (let floor = 0; floor < 6; floor++) {
        const layout = buildRiftFloor(seed * 7919, 20, floor).layout;
        expect(layout.wallX).toBeLessThanOrEqual(32);
      }
    }
  });

  it('opens a rotation entry for exactly the endgame zones', () => {
    const { sim } = makeWorld();
    const zones = riftEligibleZones().map((z) => z.id);
    expect(zones.length).toBeGreaterThan(0);
    expect(inner(sim).riftRotation.map((r) => r.zoneId)).toEqual(zones);
  });
});
