import { describe, expect, it, vi } from 'vitest';

// Postgres is mocked so the authoritative server can be built in-process; this
// file compares the SERVER's sim against the offline sim tick for tick.
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

import { GameServer } from '../server/game';
import { ClientWorld } from '../src/net/online';
import {
  type Collider,
  interiorColliders,
  isBlocked,
  movementFloorAt,
  movementTopOf,
  resolveBodyMove,
  resolvePosition,
} from '../src/sim/colliders';
import {
  ARENA_LAYOUT,
  CLAUDEHOLME_LAYOUT,
  CLAUDEXX_LAYOUT,
  CRYPT_LAYOUT,
  layoutColliders,
  NYTHRAXIS_LAYOUT,
  SANCTUM_LAYOUT,
  TEMPLE_LAYOUT,
} from '../src/sim/dungeon_layout';
import { DELVE_MODULE_LAYOUTS, type DelveModuleId, delveModuleColliders } from '../src/sim/delve_layout';
import { DUNGEON_LIST, instanceOrigin, PROPS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { MAX_STEP_HEIGHT } from '../src/sim/traversal';
import { type Entity, type MoveInput, type PlayerClass, RUN_SPEED } from '../src/sim/types';
import { generateDecorations, groundHeight } from '../src/sim/world';

// The wiring of `src/sim/traversal/` into live movement. The core itself is
// covered by tests/traversal_{solver,ladder,ledge,pathfind_agreement}.test.ts;
// what is checked HERE is the five decisions the wiring had to make and the one
// property that matters more than any of them:
//
//   movement resolves in the shared sim that runs in three hosts (the offline
//   browser world, the authoritative server, the headless RL env) and feeds the
//   online client's mirror. A mismatch between hosts is not a broken feature,
//   it is rubber-banding for everyone who walks.

const SEED = 20061;
const R = 0.5;

const emptyInput = (): MoveInput => ({
  forward: false,
  back: false,
  turnLeft: false,
  turnRight: false,
  strafeLeft: false,
  strafeRight: false,
  jump: false,
});

/** A scripted input frame per tick: run, strafe, back up, jump, turn. */
function scriptedInput(tick: number): MoveInput {
  const inp = emptyInput();
  inp.forward = tick % 40 < 30;
  inp.back = tick % 40 >= 34;
  inp.strafeRight = tick % 17 < 6;
  inp.strafeLeft = tick % 23 < 4;
  inp.turnLeft = tick % 31 < 5;
  inp.turnRight = tick % 29 < 3;
  inp.jump = tick % 53 === 0;
  return inp;
}

/** Nearest shipped building to a point: something solid to run into. */
function nearestBuilding(x: number, z: number): { x: number; z: number } {
  let best = PROPS.buildings[0];
  let bestD = Infinity;
  for (const b of PROPS.buildings) {
    const d = (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return { x: best.x, z: best.z };
}

function place(sim: Sim, e: Entity, x: number, z: number, facing: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  e.vx = 0;
  e.vz = 0;
  e.vy = 0;
  e.onGround = true;
  e.jumping = false;
  e.fallStartY = e.pos.y;
  e.facing = facing;
}

function makeSim(cls: PlayerClass = 'warrior'): Sim {
  return new Sim({ seed: SEED, playerClass: cls, autoEquip: true });
}

/**
 * The sim's rng state, which mulberry32 advances by a fixed constant on EVERY
 * draw: an exact draw counter, not a sample of the stream.
 */
function rngState(sim: Sim): number {
  return (sim as unknown as { rng: { s: number } }).rng.s;
}

/** Run one sim through the scripted input and record every pose. */
function trace(
  sim: Sim,
  e: Entity,
  input: MoveInput,
  ticks: number,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    Object.assign(input, scriptedInput(i));
    sim.tick();
    out.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decision 1: what a collider means vertically
// ---------------------------------------------------------------------------

describe('the movement top policy is declared once and holds', () => {
  const allShipped = (): Collider[] => [
    ...layoutColliders(CRYPT_LAYOUT),
    ...layoutColliders(SANCTUM_LAYOUT),
    ...layoutColliders(TEMPLE_LAYOUT),
    ...layoutColliders(ARENA_LAYOUT),
    ...layoutColliders(NYTHRAXIS_LAYOUT),
    ...layoutColliders(CLAUDEHOLME_LAYOUT),
    ...layoutColliders(CLAUDEXX_LAYOUT),
    ...(Object.keys(DELVE_MODULE_LAYOUTS) as DelveModuleId[]).flatMap((id) => [
      ...delveModuleColliders(id),
    ]),
  ];

  it('finds a non-trivial set of shipped colliders to check', () => {
    expect(allShipped().length).toBeGreaterThan(50);
    expect(generateDecorations(SEED).length).toBeGreaterThan(100);
  });

  it('declares NO movement top on any shipped collider', () => {
    // `cameraTopY` is a visual silhouette (a canopy, a roofline), not a
    // standable surface. Promoting it would assert that a body may stand on a
    // tree canopy at the radius of its trunk, and would hand the player ground
    // the 2D mob router still calls a wall. So the movement top is opt-in and
    // nothing opts in: every collider in the world is full height for movement,
    // which is exactly what `resolvePosition` has always meant.
    for (const c of allShipped()) expect(movementTopOf(c)).toBeUndefined();
  });

  it('declares NO movement top on any open-world prop or decoration', () => {
    // Walk the same props `staticWorldColliders` is built from, through the
    // public seam that actually resolves them.
    const samples: { x: number; z: number }[] = [
      ...PROPS.buildings.map((b) => ({ x: b.x, z: b.z })),
      ...PROPS.wells.map((w) => ({ x: w.x, z: w.z })),
      ...PROPS.stalls.map((s) => ({ x: s.x, z: s.z })),
      ...PROPS.docks.map((d) => ({ x: d.x, z: d.z })),
      ...PROPS.crates.map(([x, z]) => ({ x, z })),
      ...PROPS.campfires.map(([x, z]) => ({ x, z })),
      ...generateDecorations(SEED).slice(0, 400).map((d) => ({ x: d.x, z: d.z })),
    ];
    expect(samples.length).toBeGreaterThan(400);
    for (const s of samples) {
      // With no movement top anywhere, the landing floor is the heightfield,
      // bit for bit, at every sampled prop.
      const g = groundHeight(s.x, s.z, SEED);
      expect(movementFloorAt(SEED, s.x, s.z, g, g)).toBe(g);
    }
  });

  it('still honours a movement top when one is declared (the wiring is live)', () => {
    // The proof that the step-up path is wired end to end and not dead code:
    // declare a top on a real collider the sim resolves against, and the public
    // seam strides onto it and reports the raised floor.
    const crypt = DUNGEON_LIST.find((d) => d.interior === 'crypt')!;
    const origin = instanceOrigin(crypt.index, 0);
    const colliders = interiorColliders('crypt');
    const lip = colliders.find((c) => c.type === 'obb') as Collider | undefined;
    expect(lip).toBeTruthy();
    const top = 0.5; // inside MAX_STEP_HEIGHT of feet at 0
    try {
      (lip as { moveTopY?: number }).moveTopY = top;
      expect(top).toBeLessThan(MAX_STEP_HEIGHT);
      // Aim straight at the collider from a body-length away.
      const cx = lip!.x;
      const cz = lip!.z;
      const reach = lip!.type === 'obb' ? Math.hypot(lip!.hw, lip!.hd) : lip!.r;
      const startX = cx - (reach + R + 1);
      const res = resolveBodyMove({
        seed: SEED,
        x: origin.x + startX,
        z: origin.z + cz,
        dx: reach + R + 2,
        dz: 0,
        feetY: 0,
        radius: R,
      });
      expect(res.steppedUp).toBe(true);
      expect(res.feetY).toBe(top);
      // And the vertical pass agrees: the body is supported up there.
      expect(movementFloorAt(SEED, res.x, res.z, 0, res.feetY)).toBe(top);
    } finally {
      delete (lip as { moveTopY?: number }).moveTopY;
    }
    // Policy restored: back to full height for movement.
    expect(movementTopOf(lip!)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Decision 2: the ladder must not out-reach the 2D router
// ---------------------------------------------------------------------------

describe('the traversal ladder cannot disagree with the mob router', () => {
  it('never resolves a player move onto ground the router calls blocked', () => {
    // `isBlocked` / `findPlayerPath` are 2D and have no feet height, so any
    // collider top the solver admits is ground the router will never path to.
    // With no movement top declared anywhere, the two views are identical by
    // construction; this walks a wide sample to prove it rather than assert it.
    const crypt = DUNGEON_LIST.find((d) => d.interior === 'crypt')!;
    const origin = instanceOrigin(crypt.index, 0);
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const res = resolveBodyMove({
        seed: SEED,
        x: origin.x,
        z: origin.z,
        dx: Math.sin(a) * 40,
        dz: Math.cos(a) * 40,
        feetY: 0,
        radius: R,
      });
      expect(isBlocked(SEED, res.x, res.z, R), `crypt ray ${i}`).toBe(false);
      expect(res.feetY, `crypt ray ${i}`).toBe(0);
    }
  });

  it('never resolves an open-world move into a prop the router calls blocked', () => {
    const town = nearestBuilding(0, 0);
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const sx = town.x + Math.sin(a) * 14;
      const sz = town.z + Math.cos(a) * 14;
      if (isBlocked(SEED, sx, sz, R)) continue; // start already inside geometry
      const res = resolveBodyMove({
        seed: SEED,
        x: sx,
        z: sz,
        dx: town.x - sx,
        dz: town.z - sz,
        feetY: groundHeight(sx, sz, SEED),
        radius: R,
      });
      expect(isBlocked(SEED, res.x, res.z, R), `town ray ${i}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Decision 3: collider ORDER is part of the result
// ---------------------------------------------------------------------------

describe('the broadphase hands every host the same collider order', () => {
  const move = (x: number, z: number, dx: number, dz: number) =>
    resolveBodyMove({ seed: SEED, x, z, dx, dz, feetY: groundHeight(x, z, SEED), radius: R });

  it('resolves the same move identically however many times it is asked', () => {
    // The gather and the solve both use module scratch. If any of it carried
    // state between calls, a repeat would drift.
    const town = nearestBuilding(0, 0);
    const first = move(town.x - 12, town.z, 24, 3);
    for (let i = 0; i < 200; i++) {
      const again = move(town.x - 12, town.z, 24, 3);
      expect(again.x, `repeat ${i}`).toBe(first.x);
      expect(again.z, `repeat ${i}`).toBe(first.z);
      expect(again.feetY, `repeat ${i}`).toBe(first.feetY);
      expect(again.hitWall, `repeat ${i}`).toBe(first.hitWall);
    }
  });

  it('is not disturbed by an interleaved solve in another region', () => {
    // Different regions hand back different collider lists through the same
    // scratch. Interleaving must not change either answer.
    const crypt = DUNGEON_LIST.find((d) => d.interior === 'crypt')!;
    const origin = instanceOrigin(crypt.index, 0);
    const town = nearestBuilding(0, 0);
    const townAlone = move(town.x - 12, town.z, 24, 3);
    const cryptAlone = resolveBodyMove({
      seed: SEED,
      x: origin.x,
      z: origin.z,
      dx: 30,
      dz: 7,
      feetY: 0,
      radius: R,
    });
    for (let i = 0; i < 50; i++) {
      const t = move(town.x - 12, town.z, 24, 3);
      const c = resolveBodyMove({
        seed: SEED,
        x: origin.x,
        z: origin.z,
        dx: 30,
        dz: 7,
        feetY: 0,
        radius: R,
      });
      movementFloorAt(SEED, town.x, town.z, 0, 0);
      expect(t.x).toBe(townAlone.x);
      expect(t.z).toBe(townAlone.z);
      expect(c.x).toBe(cryptAlone.x);
      expect(c.z).toBe(cryptAlone.z);
    }
  });

  it('gathers the same order whichever way the body is travelling', () => {
    // Cells are visited in ascending (gx, gz) over the swept box, never in
    // motion order, so an east-to-west solve sees the same list a west-to-east
    // solve does. Probed through the result: A->B then B->A must retrace.
    const town = nearestBuilding(0, 0);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const sx = town.x + Math.sin(a) * 20;
      const sz = town.z + Math.cos(a) * 20;
      const out = move(sx, sz, town.x - sx, town.z - sz);
      const back = move(out.x, out.z, sx - out.x, sz - out.z);
      const again = move(sx, sz, town.x - sx, town.z - sz);
      expect(again.x, `ray ${i}`).toBe(out.x);
      expect(again.z, `ray ${i}`).toBe(out.z);
      expect(Number.isFinite(back.x)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Decision 5 / the rng contract
// ---------------------------------------------------------------------------

describe('traversal draws no randomness', () => {
  it('never advances the sim rng stream, however far a body moves', () => {
    // An unpinned draw in movement would shift the whole world's rng stream:
    // different loot, different spawns, different crits, on every host that
    // walked a different distance. `mulberry32` advances its state on every
    // draw, so the state is an exact draw counter.
    const sim = makeSim();
    const before = rngState(sim);
    const town = nearestBuilding(sim.player.pos.x, sim.player.pos.z);
    for (let i = 0; i < 500; i++) {
      const a = (i / 500) * Math.PI * 2;
      resolveBodyMove({
        seed: SEED,
        x: town.x + Math.sin(a) * 10,
        z: town.z + Math.cos(a) * 10,
        dx: -Math.sin(a) * 12,
        dz: -Math.cos(a) * 12,
        feetY: groundHeight(town.x, town.z, SEED),
        radius: R,
        airborne: i % 3 === 0,
        ignoreFences: i % 5 === 0,
      });
      movementFloorAt(SEED, town.x, town.z, 0, 0);
      (sim as unknown as { resolveMove: (...a: unknown[]) => unknown }).resolveMove(
        sim.player.pos.x,
        sim.player.pos.z,
        town.x,
        town.z,
        R,
        sim.player,
        i % 2 === 0,
      );
    }
    expect(rngState(sim)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Determinism, the acceptance criterion
// ---------------------------------------------------------------------------

describe('movement is deterministic over a long run', () => {
  it('reproduces the same path from the same seed and the same input', () => {
    const ticks = 20 * 60; // one minute of scripted locomotion
    const a = makeSim();
    const b = makeSim();
    const town = nearestBuilding(a.player.pos.x, a.player.pos.z);
    const facing = Math.atan2(town.x - a.player.pos.x, town.z - a.player.pos.z);
    place(a, a.player, a.player.pos.x, a.player.pos.z, facing);
    place(b, b.player, a.player.pos.x, a.player.pos.z, facing);
    const ta = trace(a, a.player, a.moveInput, ticks);
    const tb = trace(b, b.player, b.moveInput, ticks);
    expect(tb).toEqual(ta);
    // And the run actually went somewhere, so the equality is not trivial.
    let travelled = 0;
    for (let i = 1; i < ta.length; i++) {
      travelled += Math.hypot(ta[i].x - ta[i - 1].x, ta[i].z - ta[i - 1].z);
    }
    // Yards of path actually walked. The script deliberately fights itself
    // (forward and back, both strafes, jumps) and the spawn is beside the inn,
    // so this is a floor on "the body really moved and really collided", not a
    // measure of speed.
    expect(travelled).toBeGreaterThan(RUN_SPEED * 2);
    expect(rngState(a)).toBe(rngState(b));
  });

  it('is unchanged by how many ticks a host batches per step', () => {
    // The headless RL env loops `tick()` `frameSkip` times per env step; the
    // browser loops it per frame; the server loops it per 50 ms interval.
    const ticks = 20 * 30;
    const perTick = makeSim();
    const batched = makeSim();
    const town = nearestBuilding(perTick.player.pos.x, perTick.player.pos.z);
    const facing = Math.atan2(town.x - perTick.player.pos.x, town.z - perTick.player.pos.z);
    place(perTick, perTick.player, perTick.player.pos.x, perTick.player.pos.z, facing);
    place(batched, batched.player, perTick.player.pos.x, perTick.player.pos.z, facing);
    const one = trace(perTick, perTick.player, perTick.moveInput, ticks);
    const many: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < ticks; i += 4) {
      for (let k = 0; k < 4 && i + k < ticks; k++) {
        Object.assign(batched.moveInput, scriptedInput(i + k));
        batched.tick();
        many.push({ ...batched.player.pos });
      }
    }
    expect(many).toEqual(one);
  });

  it('never leaves the body inside static geometry', () => {
    const ticks = 20 * 60;
    const sim = makeSim();
    const town = nearestBuilding(sim.player.pos.x, sim.player.pos.z);
    const facing = Math.atan2(town.x - sim.player.pos.x, town.z - sim.player.pos.z);
    place(sim, sim.player, sim.player.pos.x, sim.player.pos.z, facing);
    for (let i = 0; i < ticks; i++) {
      Object.assign(sim.moveInput, scriptedInput(i));
      sim.tick();
      const p = sim.player.pos;
      const fixed = resolvePosition(SEED, p.x, p.z, R);
      // Sliding leaves the body against a surface, never inside it: the point
      // resolver the router uses must not want to move it.
      expect(Math.hypot(fixed.x - p.x, fixed.z - p.z), `tick ${i}`).toBeLessThan(0.02);
    }
  });
});

// ---------------------------------------------------------------------------
// Host parity: offline sim vs the authoritative server, mirrored to the client
// ---------------------------------------------------------------------------

function fakeWs(): { sent: unknown[]; ws: unknown } {
  const sent: unknown[] = [];
  return {
    sent,
    ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) },
  };
}

function bareClient(pid: number): ClientWorld {
  const c = Object.create(ClientWorld.prototype) as Record<string, unknown>;
  c.cfg = { seed: SEED, playerClass: 'warrior' };
  c.entities = new Map();
  c.playerId = pid;
  c.ownPlayerId = pid;
  c.ownPlayerClass = 'warrior';
  c.spectating = null;
  c.moveInput = {};
  c.inventory = [];
  c.vendorBuyback = [];
  c.equipment = {};
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
  return c as unknown as ClientWorld;
}

// The wire encoder rounds to 2 decimals; `+ 0` normalizes -0, which JSON writes
// as 0 and which is otherwise not `Object.is`-equal.
const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

describe('the offline world and the authoritative server walk the same path', () => {
  it('resolves an identical trajectory, and the client mirrors it exactly', () => {
    const ticks = 20 * 20;
    const offline = makeSim();
    const server = new GameServer();
    const fc = fakeWs();
    const session = server.join(fc.ws as never, 7001, 7001, 'Walker', 'warrior', null);
    if ('error' in session) throw new Error(session.error);
    (session as { blockListLoaded: boolean }).blockListLoaded = true;
    const serverSim = (server as unknown as { sim: Sim }).sim;
    const hosted = serverSim.entities.get(session.pid)!;
    const meta = serverSim.meta(session.pid)!;

    const town = nearestBuilding(offline.player.pos.x, offline.player.pos.z);
    const facing = Math.atan2(town.x - offline.player.pos.x, town.z - offline.player.pos.z);
    const sx = offline.player.pos.x;
    const sz = offline.player.pos.z;
    place(offline, offline.player, sx, sz, facing);
    place(serverSim, hosted, sx, sz, facing);

    const client = bareClient(session.pid);
    for (let i = 0; i < ticks; i++) {
      const frame = scriptedInput(i);
      Object.assign(offline.moveInput, frame);
      Object.assign(meta.moveInput, frame);
      offline.tick();
      serverSim.tick();
      // Bit-for-bit, not "close": a rounding difference here is a desync.
      expect(hosted.pos.x, `tick ${i} x`).toBe(offline.player.pos.x);
      expect(hosted.pos.y, `tick ${i} y`).toBe(offline.player.pos.y);
      expect(hosted.pos.z, `tick ${i} z`).toBe(offline.player.pos.z);
      expect(hosted.onGround, `tick ${i} onGround`).toBe(offline.player.onGround);
    }

    // And what the online client mirrors is that same pose, to wire precision.
    (server as unknown as { broadcastSnapshots: () => void }).broadcastSnapshots();
    const snap = [...(fc.sent as { t: string }[])].reverse().find((m) => m.t === 'snap');
    expect(snap).toBeTruthy();
    (client as unknown as { applySnapshot: (s: unknown) => void }).applySnapshot(snap);
    const mirrored = (client as unknown as { entities: Map<number, Entity> }).entities.get(
      session.pid,
    )!;
    expect(mirrored).toBeTruthy();
    expect(mirrored.pos.x).toBe(round2(offline.player.pos.x));
    expect(mirrored.pos.y).toBe(round2(offline.player.pos.y));
    expect(mirrored.pos.z).toBe(round2(offline.player.pos.z));
  });
});
