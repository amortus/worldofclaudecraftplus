import { describe, expect, it } from 'vitest';

import { ClientWorld } from '../src/net/online';
import { resolvePosition } from '../src/sim/colliders';
import { RIFT_BAND_X_MIN, riftEligibleZones, RIFT_X, riftOrigin, riftSlotAt } from '../src/sim/data';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { generateRiftFloor } from '../src/sim/rift';
import { Sim } from '../src/sim/sim';
import { type Entity, MAX_LEVEL, type SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import type { IWorld } from '../src/world_api';

// The PORTAL half of the rift wiring: the sim-clock rotation, the x band and the
// generated-interior collider path, and the Sim <-> ClientWorld projection. The
// run lifecycle itself lives in tests/rift_wiring.test.ts.

interface RiftPortalState {
  id: string;
  zoneId: string;
  x: number;
  z: number;
  seed: number;
  baseLevel: number;
  entityId: number | null;
  opensAt: number;
  expiresAt: number;
  open: boolean;
}

interface RotationState {
  zoneId: string;
  portal: RiftPortalState | null;
  nextOpenAt: number;
  opened: number;
}

interface SimInternals {
  time: number;
  riftRotation: RotationState[];
  riftRuns: {
    partyKey: string | null;
    seed: number;
    baseLevel: number;
    floorIndex: number;
    floorCount: number;
    origin: { x: number; z: number };
    mobIds: number[];
    wayForwardId: number | null;
    sealed: boolean;
  }[];
  rebucket(e: Entity): void;
  handleDeath(e: Entity, killer: Entity | null): void;
}

const inner = (sim: Sim) => sim as unknown as SimInternals;

const RIFT_PORTAL_INTERVAL = 3600;
const RIFT_PORTAL_WINDOW = 1800;

function makeWorld(seed = 4711): { sim: Sim; pid: number } {
  const sim = new Sim({ seed, playerClass: 'warrior', noPlayer: true });
  const pid = sim.addPlayer('warrior', 'Delver');
  sim.setPlayerLevel(MAX_LEVEL, pid);
  return { sim, pid };
}

/** One full simulated second, which is exactly one pass of the rotation sweep. */
function tickSecond(sim: Sim): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 20; i++) out.push(...sim.tick());
  return out;
}

/**
 * Push the SIM CLOCK forward without simulating the hour in between. The
 * rotation reads `Sim.time` and nothing else, so this exercises the real
 * scheduler at a fraction of the cost of 72,000 real ticks. Never a wall clock:
 * there is none to move.
 */
function skipAhead(sim: Sim, seconds: number): void {
  inner(sim).time += seconds;
}

function teleport(sim: Sim, pid: number, x: number, z: number): Entity {
  const p = sim.entities.get(pid)!;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  inner(sim).rebucket(p);
  return p;
}

// ---------------------------------------------------------------------------
// The rotation
// ---------------------------------------------------------------------------

describe('rift portal rotation', () => {
  it('opens exactly one tear per eligible zone, off the sim clock', () => {
    const { sim } = makeWorld();
    const zones = riftEligibleZones().map((z) => z.id);
    const events = tickSecond(sim);

    const opened = events.filter((e) => e.type === 'riftPortal');
    expect(opened.map((e) => (e.type === 'riftPortal' ? e.zoneId : ''))).toEqual(zones);
    for (const e of opened) {
      if (e.type !== 'riftPortal') throw new Error('unreachable');
      expect(e.open).toBe(true);
      expect(e.portalId.startsWith(`${e.zoneId}:`)).toBe(true);
      expect(['C', 'B', 'A', 'S']).toContain(e.rank);
      // The window is projected onto the host clock, so the client can subtract
      // its own now from it.
      expect(e.expiresAt - e.opensAt).toBe(RIFT_PORTAL_WINDOW * 1000);
    }
    // World-visible: a tear is news for everyone, not one player's toast.
    expect(opened.every((e) => e.pid === undefined)).toBe(true);

    // A second sweep opens nothing new: one tear per zone at a time.
    expect(tickSecond(sim).filter((e) => e.type === 'riftPortal')).toEqual([]);
    for (const rot of inner(sim).riftRotation) expect(rot.opened).toBe(1);
  });

  it('is fully replayable from the world seed and differs between seeds', () => {
    const shape = (seed: number) => {
      const { sim } = makeWorld(seed);
      tickSecond(sim);
      return inner(sim).riftRotation.map((rot) => ({
        id: rot.portal!.id,
        seed: rot.portal!.seed,
        baseLevel: rot.portal!.baseLevel,
        x: Math.round(rot.portal!.x * 1000),
        z: Math.round(rot.portal!.z * 1000),
      }));
    };
    expect(shape(4711)).toEqual(shape(4711));
    expect(shape(4711)).not.toEqual(shape(4712));
  });

  it('an IGNORED rift collapses on its own and never blocks the rotation', () => {
    const { sim } = makeWorld();
    tickSecond(sim);
    const rot = inner(sim).riftRotation[0];
    const first = rot.portal!;

    // Still standing right up to the end of its admitting window.
    skipAhead(sim, RIFT_PORTAL_WINDOW - 5);
    tickSecond(sim);
    expect(rot.portal?.id).toBe(first.id);

    skipAhead(sim, 10);
    const collapse = tickSecond(sim).filter(
      (e) => e.type === 'riftPortal' && e.portalId === first.id,
    );
    expect(collapse.length).toBe(1);
    if (collapse[0].type !== 'riftPortal') throw new Error('unreachable');
    expect(collapse[0].open).toBe(false);
    expect(rot.portal).toBeNull();
    // The tear's world object is gone with it.
    expect(sim.entities.has(first.entityId!)).toBe(false);

    // The zone does NOT immediately re-open: it waits for the next interval.
    expect(rot.nextOpenAt).toBeGreaterThan(inner(sim).time);
    expect(rot.nextOpenAt % RIFT_PORTAL_INTERVAL).toBe(0);
    tickSecond(sim);
    expect(rot.portal).toBeNull();

    // At the boundary, a fresh tear with a NEW id and a new descriptor.
    skipAhead(sim, rot.nextOpenAt - inner(sim).time + 1);
    tickSecond(sim);
    expect(rot.portal).toBeTruthy();
    expect(rot.portal!.id).not.toBe(first.id);
    expect(rot.portal!.seed).not.toBe(first.seed);
    expect(rot.opened).toBe(2);
  });

  it('a zone opens no new tear until its rift has actually closed', () => {
    const { sim } = makeWorld();
    tickSecond(sim);
    const rot = inner(sim).riftRotation[0];
    const first = rot.portal!;

    // Well past two whole intervals, with the tear still admitting: the zone
    // holds, because the rotation is gated on the CLOSE, not on the clock alone.
    skipAhead(sim, RIFT_PORTAL_WINDOW - 5);
    tickSecond(sim);
    expect(rot.portal?.id).toBe(first.id);
    expect(rot.opened).toBe(1);
  });

  it('sealing a rift closes its tear at once and schedules the next one', () => {
    const { sim, pid } = makeWorld(20250809);
    tickSecond(sim);
    const rot = inner(sim).riftRotation[0];
    const portal = rot.portal!;
    teleport(sim, pid, portal.x, portal.z);
    sim.enterRift(portal.id, pid);
    const run = inner(sim).riftRuns.find((r) => r.partyKey !== null)!;

    // Drive the run to its final floor and drop the warden.
    const revive = () => {
      const p = sim.entities.get(pid)!;
      p.dead = false;
      p.hp = p.maxHp;
      return p;
    };
    for (let guard = 0; guard < 20 && !run.sealed; guard++) {
      revive();
      for (const id of [...run.mobIds]) {
        const mob = sim.entities.get(id);
        if (!mob || mob.dead) continue;
        mob.tappedById = pid;
        mob.hp = 0;
        inner(sim).handleDeath(mob, sim.entities.get(pid)!);
        if (run.sealed) break;
      }
      sim.tick();
      if (run.sealed || run.wayForwardId === null) continue;
      const way = sim.entities.get(run.wayForwardId)!;
      revive();
      teleport(sim, pid, way.pos.x, way.pos.z);
      revive();
      sim.tick();
    }
    expect(run.sealed).toBe(true);

    // The entrance shut the moment the rift sealed, without waiting out its
    // window, so nobody can walk back into a cleared rift.
    expect(rot.portal).toBeNull();
    expect(sim.entities.has(portal.entityId!)).toBe(false);
    expect(rot.nextOpenAt).toBeGreaterThan(inner(sim).time);
    expect(rot.nextOpenAt % RIFT_PORTAL_INTERVAL).toBe(0);
    expect(inner(sim).time).toBeLessThan(RIFT_PORTAL_WINDOW);
  });
});

// ---------------------------------------------------------------------------
// The x band and the generated interior's colliders
// ---------------------------------------------------------------------------

describe('rift instance plane', () => {
  it('stacks slots inside the reserved band, clear of every other plane', () => {
    for (let slot = 0; slot < 6; slot++) {
      const o = riftOrigin(slot);
      expect(o.x).toBe(RIFT_X);
      expect(o.x).toBeGreaterThanOrEqual(RIFT_BAND_X_MIN);
      expect(riftSlotAt(o.z)).toBe(slot);
    }
  });

  it('resolves a generated floor through the REAL collider path', () => {
    const seed = 0x51f7;
    const baseLevel = 20;
    const floorIndex = 0;
    const plan = generateRiftFloor(seed, baseLevel, floorIndex);
    const origin = riftOrigin(0);
    const ref = { seed, baseLevel, floorIndex };
    const worldSeed = 1234;

    const resolve = (x: number, z: number, withRef: boolean) =>
      resolvePosition(
        worldSeed,
        origin.x + x,
        origin.z + z,
        PLAYER_BODY_RADIUS,
        false,
        undefined,
        withRef ? ref : undefined,
      );

    // Standing in the side wall itself: the generated room refuses to hold the
    // body there and slides it out.
    const inWall = plan.layout.wallX!;
    expect(typeof inWall).toBe('number'); // a generated floor always sets its own
    const pushed = resolve(inWall, plan.layout.dais.z, true);
    expect(Math.abs(pushed.x - (origin.x + inWall))).toBeGreaterThan(0.1);

    // NEGATIVE CONTROL: without the descriptor there is no interior to resolve
    // against, so the same point is untouched. That is what proves the push
    // above came from the generated floor and not from the overworld grid.
    const unresolved = resolve(inWall, plan.layout.dais.z, false);
    expect(unresolved.x).toBeCloseTo(origin.x + inWall, 5);

    // The boss platform and every spawn stand in walkable space: the room the
    // party is dropped into is the room the generator promised.
    const dais = resolve(0, plan.layout.dais.z, true);
    expect(dais.x).toBeCloseTo(origin.x, 5);
    expect(dais.z).toBeCloseTo(origin.z + plan.layout.dais.z, 5);
    for (const spawn of plan.spawns) {
      const at = resolve(spawn.x, spawn.z, true);
      expect(Math.hypot(at.x - (origin.x + spawn.x), at.z - (origin.z + spawn.z))).toBeLessThan(1e-3);
    }
  });

  it('walks the whole entry-to-warden spine of a real boss floor', () => {
    // The boss floor is the one that has to be traversable end to end, and the
    // spine is the guaranteed-clear corridor the generator builds it around.
    const seed = 0x99a1;
    const baseLevel = 25;
    // The index is clamped into the run, so 5 always resolves to the LAST floor
    // whatever this seed's floor count turned out to be.
    const plan = generateRiftFloor(seed, baseLevel, 5);
    expect(plan.isBoss).toBe(true);
    const boss = plan.spawns.find((s) => s.role === 'boss');
    expect(boss, 'a boss floor always places its warden').toBeTruthy();
    if (!boss) throw new Error('unreachable');
    const origin = riftOrigin(2);
    const ref = { seed, baseLevel, floorIndex: plan.floorIndex };
    for (let z = plan.entry.z; z <= boss.z; z += 1) {
      const at = resolvePosition(
        7,
        origin.x,
        origin.z + z,
        PLAYER_BODY_RADIUS,
        false,
        undefined,
        ref,
      );
      expect(Math.abs(at.x - origin.x), `spine blocked at z=${z}`).toBeLessThan(1e-3);
    }
  });
});

// ---------------------------------------------------------------------------
// Sim <-> ClientWorld parity
// ---------------------------------------------------------------------------

function bareClient(pid: number): ClientWorld {
  const c: unknown = Object.create(ClientWorld.prototype);
  const w = c as Record<string, unknown>;
  w.cfg = { seed: 1, playerClass: 'warrior' };
  w.entities = new Map();
  w.playerId = pid;
  w.ownPlayerId = pid;
  w.ownPlayerClass = 'warrior';
  w.spectating = null;
  w.moveInput = {};
  w.inventory = [];
  w.vendorBuyback = [];
  w.equipment = {};
  w.accountCosmetics = { completedQuestIds: [], mechChromaIds: [] };
  w.copper = 0;
  w.xp = 0;
  w.known = [];
  w.questLog = new Map();
  w.questsDone = new Set();
  w.pendingQuestCommands = new Map();
  w.partyInfo = null;
  w.tradeInfo = null;
  w.duelInfo = null;
  w.lastSnapAt = 0;
  w.snapInterval = 50;
  w.missingSince = new Map();
  w.pendingFacingDelta = 0;
  w.connected = true;
  w.eventQueue = [];
  w.mouselookFacing = null;
  w.lastInputSentAt = 0;
  w.lastInputSig = '';
  w.inputSeq = 0;
  w.pendingInputSeqSentAt = new Map();
  w.ackedInputSeq = 0;
  w.inputEchoSamples = [];
  w.spectateFacingPending = false;
  w.pendingSpectateFacing = null;
  w.riftRun = null;
  w.riftPortalList = [];
  return c as ClientWorld;
}

describe('rift Sim / ClientWorld parity', () => {
  it('mirrors the run and the portal list field for field', () => {
    const { sim, pid } = makeWorld(864209);
    tickSecond(sim);
    const portal = inner(sim).riftRotation[0].portal!;
    teleport(sim, pid, portal.x, portal.z);
    sim.enterRift(portal.id, pid);

    const client = bareClient(1);
    const internals = client as unknown as { applySnapshot(s: unknown): void };
    internals.applySnapshot({
      t: 'snap',
      ents: [],
      self: {
        id: 1,
        k: 'player',
        tid: 'warrior',
        nm: 'Delver',
        lv: MAX_LEVEL,
        x: 0,
        y: 0,
        z: 0,
        f: 0,
        hp: 100,
        mhp: 100,
        res: 0,
        mres: 100,
        rtype: 'rage',
        rrun: sim.riftRunWire(pid),
        rportals: sim.riftPortalsWire(),
      },
    });

    expect(client.riftRun).toEqual(sim.riftRunWire(pid));
    expect(client.riftPortals()).toEqual(sim.riftPortalsWire());

    // The run projection carries exactly what the tracker reads.
    const run = client.riftRun!;
    expect(run.floorIndex).toBe(0);
    expect(run.floorCount).toBeGreaterThanOrEqual(3);
    expect(['C', 'B', 'A', 'S']).toContain(run.rank);
    expect(run.entranceClosesAt).toBeGreaterThan(0);
    expect(run.sealed).toBe(false);

    // Delta invariant: an omitted field must NOT wipe the mirrored state.
    internals.applySnapshot({ t: 'snap', ents: [], self: { id: 1 } });
    expect(client.riftRun).toEqual(sim.riftRunWire(pid));
    expect(client.riftPortals()).toEqual(sim.riftPortalsWire());

    // ...and an explicit null clears the run when the player steps back out.
    internals.applySnapshot({ t: 'snap', ents: [], self: { id: 1, rrun: null, rportals: [] } });
    expect(client.riftRun).toBeNull();
    expect(client.riftPortals()).toEqual([]);
  });

  it('both worlds satisfy the rift half of IWorld', () => {
    // A COMPILE-TIME check, and the reason it is worth a test: `Sim` only
    // satisfies `IWorld` structurally (it never declares `implements`), so
    // without an assignment like this one, dropping a member from `Sim` would
    // type-check and only fail in the offline browser world at runtime.
    type RiftSeam = Pick<IWorld, 'enterRift' | 'leaveRift' | 'riftRun' | 'riftPortals'>;
    const { sim, pid } = makeWorld();
    const offline: RiftSeam = sim;
    const online: RiftSeam = bareClient(pid);
    expect(typeof offline.enterRift).toBe('function');
    expect(typeof offline.leaveRift).toBe('function');
    expect(typeof online.enterRift).toBe('function');
    expect(typeof online.leaveRift).toBe('function');
    expect(offline.riftPortals()).toBeInstanceOf(Array);
    expect(online.riftPortals()).toBeInstanceOf(Array);
  });

  it('keeps the wire projection byte-stable while nothing changes', () => {
    // The server's snapshot differ compares JSON, so a projection that drifted
    // every tick would ship the portal list (and the run) at 20 Hz forever
    // instead of only when a tear opens or collapses. The host-clock window is
    // therefore stamped ONCE, when the tear opens.
    const { sim, pid } = makeWorld(5150);
    tickSecond(sim);
    const portal = inner(sim).riftRotation[0].portal!;
    teleport(sim, pid, portal.x, portal.z);
    sim.enterRift(portal.id, pid);

    const portalsJson = JSON.stringify(sim.riftPortalsWire());
    const runJson = JSON.stringify(sim.riftRunWire(pid));
    for (let i = 0; i < 40; i++) sim.tick();
    expect(JSON.stringify(sim.riftPortalsWire())).toBe(portalsJson);
    expect(JSON.stringify(sim.riftRunWire(pid))).toBe(runJson);

    // And a real change (the tear collapsing) DOES move it.
    skipAhead(sim, RIFT_PORTAL_WINDOW + 5);
    tickSecond(sim);
    expect(JSON.stringify(sim.riftPortalsWire())).not.toBe(portalsJson);
  });

  it('reports no run for a player who is not in a rift', () => {
    const { sim, pid } = makeWorld();
    tickSecond(sim);
    expect(sim.riftRunWire(pid)).toBeNull();
    expect(sim.riftRun).toBeNull();
    expect(sim.riftPortals().length).toBe(riftEligibleZones().length);
  });
});
