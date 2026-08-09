import {
  arenaOriginAt,
  DUNGEON_X_THRESHOLD,
  defaultDelveModules,
  delveAt,
  delveModuleLocal,
  dungeonAt,
  INSTANCE_SLOT_COUNT,
  instanceOrigin,
  isArenaPos,
  isDelvePos,
  isRiftPos,
  PROPS,
  riftOrigin,
  riftSlotAt,
} from './data';
import { type DelveModuleId, delveModuleColliders } from './delve_layout';
import {
  ARENA_LAYOUT,
  CLAUDEHOLME_LAYOUT,
  CLAUDEXX_LAYOUT,
  CRYPT_LAYOUT,
  layoutColliders,
  NYTHRAXIS_LAYOUT,
  SANCTUM_LAYOUT,
  TEMPLE_LAYOUT,
} from './dungeon_layout';
import { riftFloorColliders } from './rift';
import {
  type ColliderFilter,
  type ColliderTopFn,
  floorHeightAt,
  MAX_STEP_HEIGHT,
  moveBody,
  type TraversalMoveResult,
} from './traversal';
import { generateDecorations, groundHeight } from './world';

// Static world collision. Prop placement comes from the per-zone content
// modules (merged into PROPS by sim/data.ts): the renderer builds its meshes
// from the same defs, so what you see is what you collide with.
// Sim layer: no three.js imports.

export interface CircleCollider {
  type: 'circle';
  x: number;
  z: number;
  r: number;
  /** Absolute world-space top used by camera occlusion; movement ignores it. */
  cameraTopY?: number;
  /** See {@link MOVEMENT_TOP_POLICY}. */
  moveTopY?: number;
  /**
   * When true the chase cam ray passes straight through this collider (no
   * pull-in). Movement still collides. Used for props that the renderer hides
   * when they cross the eye-to-camera segment instead of zooming in.
   */
  camGhost?: boolean;
}

export interface ObbCollider {
  type: 'obb';
  x: number;
  z: number;
  hw: number; // half width (local x)
  hd: number; // half depth (local z)
  rot: number; // yaw, three.js rotation.y convention
  /** Absolute world-space top used by camera occlusion; movement ignores it. */
  cameraTopY?: number;
  /** See {@link MOVEMENT_TOP_POLICY}. */
  moveTopY?: number;
  /** See {@link CircleCollider.camGhost}. */
  camGhost?: boolean;
  /**
   * Low fence rail: a grounded mover collides normally, but a mover that is
   * airborne above the rail (see `FENCE_RAIL_HEIGHT`) jumps clear of it. Set on
   * the OBBs built from `PROPS.fences`.
   */
  isFence?: boolean;
}

export type Collider = CircleCollider | ObbCollider;

// ---------------------------------------------------------------------------
// The movement top policy (DECIDED ONCE, HERE)
// ---------------------------------------------------------------------------
// `src/sim/traversal/` takes a caller-supplied `ColliderTopFn` precisely so it
// would not guess what a collider means vertically. This is that decision, and
// every later contributor reads it here.
//
// A collider has TWO tops and they are not the same number:
//
//   `cameraTopY` is the VISUAL SILHOUETTE. It is the height at which the chase
//   cam stops caring about an obstacle: a tree's canopy (7.5 * scale), a
//   building's roofline (8.0 to 10.8), a mud hut's spire (12.5). It is measured
//   for occlusion, not for standing, and several of these shapes have no flat
//   surface at that height at all: the collider is a CIRCLE around a trunk, and
//   its `cameraTopY` is the top of a canopy that overhangs the trunk by metres.
//
//   `moveTopY` is a STANDABLE SURFACE. Declaring it says three things at once:
//   a body may stride, vault, grab or land ON this collider at exactly that
//   height; the body is supported anywhere its CENTRE is inside the collider's
//   footprint at that height; and nothing above that height blocks it.
//
// Promoting `cameraTopY` into `moveTopY` wholesale would assert all three of
// those about canopies and rooflines, and would silently make every prop top in
// the world a destination the mob router (`isBlocked` / `findPlayerPath`, which
// are 2D and have no feet height) still calls solid ground-to-ground wall. So:
//
//   **`moveTopY` is OPT-IN PER COLLIDER, and no shipped collider opts in.**
//
// Every collider this file builds is FULL HEIGHT for movement, which is exactly
// what `resolvePosition` has always meant ("movement ignores it" on
// `cameraTopY`). Wiring the traversal solver therefore changes how a body moves
// HORIZONTALLY (swept collision, real sliding, MTV depenetration) and changes
// nothing about what it can get on top of. The step / vault / climb rungs are
// wired end to end and inert until content declares a top, which is the only
// state in which the ladder and the router cannot disagree.
//
// When you do declare one:
//  - `moveTopY` is ABSOLUTE world Y, even on interior collider sets (instance
//    origins offset X and Z only, never Y).
//  - Keep it within `MAX_STEP_HEIGHT` of the surrounding ground unless you have
//    also taught the router about it: above that, the body can reach ground the
//    router will never path to, and mobs will walk around a crate a player is
//    standing on. `tests/traversal_wiring.test.ts` bounds this.
//  - Only declare it on a collider whose footprint really is the flat surface.
//    A trunk circle under a canopy is not.
export const MOVEMENT_TOP_POLICY =
  'opt-in per collider; every shipped collider is full height for movement';

/**
 * The ONE {@link ColliderTopFn} the sim moves bodies with. `undefined` means
 * full height. See {@link MOVEMENT_TOP_POLICY}.
 */
export const movementTopOf: ColliderTopFn = (c) => c.moveTopY;

/** Colliders a mid-jump body passes through (see `CircleCollider.camGhost`'s
 * neighbour `isFence`). Mirrors the `ignoreFences` skip in `resolveAgainst`. */
const IGNORE_FENCES: ColliderFilter = (c) => c.type === 'obb' && c.isFence === true;

function topY(seed: number, x: number, z: number, height: number): number {
  return groundHeight(x, z, seed) + height;
}

// rotate a local offset by a three.js rotation.y angle
function rotY(lx: number, lz: number, rot: number): { x: number; z: number } {
  const c = Math.cos(rot),
    s = Math.sin(rot);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

// ---------------------------------------------------------------------------
// Collider sets
// ---------------------------------------------------------------------------

function staticWorldColliders(seed: number): Collider[] {
  const out: Collider[] = [];

  // Hideable render props are `camGhost`: they keep blocking movement but the
  // chase cam no longer pulls in for them; the renderer hides whichever one
  // crosses the eye-to-camera segment instead.
  for (const b of PROPS.buildings) {
    const height = b.kind === 'chapel' ? 10.8 : b.kind === 'inn' ? 7.8 : 8.0;
    out.push({
      type: 'obb',
      x: b.x,
      z: b.z,
      hw: b.w / 2,
      hd: b.d / 2,
      rot: b.rot,
      cameraTopY: topY(seed, b.x, b.z, height),
      camGhost: true,
    });
  }
  for (const w of PROPS.wells)
    out.push({
      type: 'circle',
      x: w.x,
      z: w.z,
      r: w.r,
      cameraTopY: topY(seed, w.x, w.z, 3.7),
      camGhost: true,
    });
  for (const s of PROPS.stalls)
    out.push({
      type: 'circle',
      x: s.x,
      z: s.z,
      r: s.r,
      cameraTopY: topY(seed, s.x, s.z, 3.1),
      camGhost: true,
    });

  // mines: mound behind the timber portal
  for (const m of PROPS.mines) {
    const mound = rotY(0, -3.4, m.rot);
    const x = m.x + mound.x,
      z = m.z + mound.z;
    out.push({ type: 'circle', x, z, r: 5, cameraTopY: topY(seed, x, z, 5.2), camGhost: true });
  }

  // dock huts
  for (const d of PROPS.docks) {
    const hut = rotY(d.hutLocal.x, d.hutLocal.z, d.rot);
    const x = d.x + hut.x,
      z = d.z + hut.z;
    out.push({
      type: 'obb',
      x,
      z,
      hw: d.hutLocal.hw,
      hd: d.hutLocal.hd,
      rot: d.rot,
      cameraTopY: topY(seed, x, z, 2.9),
      camGhost: true,
    });
  }

  for (const t of PROPS.tents)
    out.push({
      type: 'circle',
      x: t.x,
      z: t.z,
      r: 1.5 * t.scale,
      cameraTopY: topY(seed, t.x, t.z, 3.4 * t.scale),
      camGhost: true,
    });
  for (const [x, z] of PROPS.crates)
    out.push({ type: 'circle', x, z, r: 0.65, cameraTopY: topY(seed, x, z, 1.35), camGhost: true });
  for (const [x, z] of PROPS.campfires)
    out.push({ type: 'circle', x, z, r: 0.85, cameraTopY: topY(seed, x, z, 1.45), camGhost: true });
  for (const [x, z] of PROPS.mudHuts)
    out.push({ type: 'circle', x, z, r: 1.1, cameraTopY: topY(seed, x, z, 12.5), camGhost: true });
  for (const ruin of PROPS.ruinRings) {
    for (let i = 0; i < ruin.columns; i++) {
      const ang = (i / ruin.columns) * Math.PI * 2;
      const x = ruin.x + Math.sin(ang) * ruin.ringR,
        z = ruin.z + Math.cos(ang) * ruin.ringR;
      out.push({ type: 'circle', x, z, r: 0.6, cameraTopY: topY(seed, x, z, 4.3), camGhost: true });
    }
  }
  for (const f of PROPS.fences) {
    const dx = f.x2 - f.x1,
      dz = f.z2 - f.z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const x = (f.x1 + f.x2) / 2,
      z = (f.z1 + f.z2) / 2;
    out.push({
      type: 'obb',
      x,
      z,
      hw: len / 2 + FENCE_END_PAD,
      hd: FENCE_HALF_DEPTH,
      rot: Math.atan2(-dz, dx),
      cameraTopY: topY(seed, x, z, FENCE_RAIL_HEIGHT),
      camGhost: true,
      isFence: true,
    });
  }

  // trees & large rocks from the deterministic decoration field
  for (const d of generateDecorations(seed)) {
    if (d.kind === 'rock') {
      if (d.scale >= 0.8)
        out.push({
          type: 'circle',
          x: d.x,
          z: d.z,
          r: 0.7 * d.scale,
          cameraTopY: topY(seed, d.x, d.z, 1.25 * d.scale),
        });
    } else {
      // tree trunks only — canopies don't block
      out.push({
        type: 'circle',
        x: d.x,
        z: d.z,
        r: 0.55 * d.scale,
        cameraTopY: topY(seed, d.x, d.z, 7.5 * d.scale),
        camGhost: true,
      });
    }
  }
  return out;
}

// Interior collision sets, in instance-local coordinates. Derived from the
// SAME plain-data layouts the renderer builds the KayKit modules from
// (sim/dungeon_layout.ts), so render geometry and collision can no longer
// drift apart. The boss dais is walkable and deliberately has no collider.
const CRYPT_COLLIDERS: Collider[] = layoutColliders(CRYPT_LAYOUT);
const SANCTUM_COLLIDERS: Collider[] = layoutColliders(SANCTUM_LAYOUT);
const TEMPLE_COLLIDERS: Collider[] = layoutColliders(TEMPLE_LAYOUT);
const ARENA_COLLIDERS: Collider[] = layoutColliders(ARENA_LAYOUT);
const NYTHRAXIS_COLLIDERS: Collider[] = layoutColliders(NYTHRAXIS_LAYOUT);
const CLAUDEHOLME_COLLIDERS: Collider[] = layoutColliders(CLAUDEHOLME_LAYOUT);
const CLAUDEXX_COLLIDERS: Collider[] = layoutColliders(CLAUDEXX_LAYOUT);

// Interior collider sets keyed by DungeonDef.interior.
const INTERIOR_COLLIDERS: Record<string, Collider[]> = {
  crypt: CRYPT_COLLIDERS,
  sanctum: SANCTUM_COLLIDERS,
  temple: TEMPLE_COLLIDERS,
  nythraxis: NYTHRAXIS_COLLIDERS,
  claudeholme: CLAUDEHOLME_COLLIDERS,
  claudexxaramas: CLAUDEXX_COLLIDERS,
};

// ---------------------------------------------------------------------------
// Interior resolution: static key OR generated descriptor
// ---------------------------------------------------------------------------
// `DungeonDef.interior` is a closed union and the table above is a static
// record, so a procedurally generated rift floor has no key to be looked up by.
// Rather than widening the union (which would make every authored consumer
// handle a case that has no authored layout), interiors are resolved through
// the two functions below: the six authored interiors keep the EXACT lookup they
// had, and a rift floor names its colliders by descriptor instead, deriving them
// through the same `layoutColliders` every authored interior goes through.

/** A generated rift floor, named the only way it can be: by its descriptor. */
export interface RiftFloorRef {
  seed: number;
  baseLevel: number;
  floorIndex: number;
}

/** Colliders for one authored interior key. Unknown keys fall back to the crypt
 * set, byte-for-byte the behavior of the inline `?? CRYPT_COLLIDERS` lookup this
 * replaced. */
export function interiorColliders(interior: string): Collider[] {
  return INTERIOR_COLLIDERS[interior] ?? CRYPT_COLLIDERS;
}

/** No descriptor means no generated room is known for this position, so nothing
 * is claimed to block. Returning a WRONG authored room here would put invisible
 * walls in a generated one, which is worse than no collision. */
const NO_COLLIDERS: Collider[] = [];

/** Colliders for a generated rift floor. Pure over the descriptor and memoised
 * by the generator, so calling it per movement step is cheap. */
export function riftInteriorColliders(ref: RiftFloorRef | undefined): Collider[] {
  if (!ref) return NO_COLLIDERS;
  return riftFloorColliders(ref.seed, ref.baseLevel, ref.floorIndex);
}

// ---------------------------------------------------------------------------
// Spatial grid + movement resolution
// ---------------------------------------------------------------------------

const GRID_CELL = 16;
const MAX_BODY_RADIUS = 0.8; // largest mover we resolve for
const FENCE_HALF_DEPTH = 0.35;
const FENCE_END_PAD = 0.35;
/** Rail height of a fence (yards), used for camera occlusion. A jump passes
 * through fences while airborne regardless (see sim `Entity.jumping`). */
const FENCE_RAIL_HEIGHT = 2.8;

interface ColliderGrid {
  cells: Map<string, Collider[]>;
}

const gridCache = new Map<number, ColliderGrid>();

function colliderBounds(c: Collider): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (c.type === 'circle') {
    return { minX: c.x - c.r, maxX: c.x + c.r, minZ: c.z - c.r, maxZ: c.z + c.r };
  }
  const ext = Math.hypot(c.hw, c.hd);
  return { minX: c.x - ext, maxX: c.x + ext, minZ: c.z - ext, maxZ: c.z + ext };
}

function gridFor(seed: number): ColliderGrid {
  let grid = gridCache.get(seed);
  if (grid) return grid;
  grid = { cells: new Map() };
  for (const c of staticWorldColliders(seed)) {
    const b = colliderBounds(c);
    const x0 = Math.floor((b.minX - MAX_BODY_RADIUS) / GRID_CELL);
    const x1 = Math.floor((b.maxX + MAX_BODY_RADIUS) / GRID_CELL);
    const z0 = Math.floor((b.minZ - MAX_BODY_RADIUS) / GRID_CELL);
    const z1 = Math.floor((b.maxZ + MAX_BODY_RADIUS) / GRID_CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = `${gx},${gz}`;
        const list = grid.cells.get(key);
        if (list) list.push(c);
        else grid.cells.set(key, [c]);
      }
    }
  }
  gridCache.set(seed, grid);
  return grid;
}

// Push (x,z) out of one collider. Returns the corrected point, or null if clear.
function pushOut(c: Collider, x: number, z: number, r: number): { x: number; z: number } | null {
  if (c.type === 'circle') {
    const dx = x - c.x,
      dz = z - c.z;
    const min = c.r + r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return null;
    const d = Math.sqrt(d2);
    if (d < 1e-6) return { x: c.x + min, z: c.z };
    const k = min / d;
    return { x: c.x + dx * k, z: c.z + dz * k };
  }
  // OBB: into local frame
  const local = rotY(x - c.x, z - c.z, -c.rot);
  const ex = c.hw + r,
    ez = c.hd + r;
  if (Math.abs(local.x) >= ex || Math.abs(local.z) >= ez) return null;
  const pushX = ex - Math.abs(local.x);
  const pushZ = ez - Math.abs(local.z);
  const out = { x: local.x, z: local.z };
  if (pushX < pushZ) out.x = Math.sign(local.x || 1) * ex;
  else out.z = Math.sign(local.z || 1) * ez;
  const world = rotY(out.x, out.z, c.rot);
  return { x: c.x + world.x, z: c.z + world.z };
}

function resolveAgainst(
  list: Collider[],
  x: number,
  z: number,
  r: number,
  ignoreFences = false,
): { x: number; z: number } {
  let px = x,
    pz = z;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of list) {
      if (ignoreFences && c.type === 'obb' && c.isFence) continue;
      const res = pushOut(c, px, pz, r);
      if (res) {
        px = res.x;
        pz = res.z;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x: px, z: pz };
}

function instanceLocal(x: number, z: number): { ox: number; oz: number; interior: string } {
  const dungeon = dungeonAt(x);
  const index = dungeon?.index ?? 0;
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < INSTANCE_SLOT_COUNT; i++) {
    const o = instanceOrigin(index, i);
    const d = Math.abs(z - o.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const o = instanceOrigin(index, best);
  return { ox: o.x, oz: o.z, interior: dungeon?.interior ?? 'crypt' };
}

// Resolve a movement destination against all static geometry. Movers slide
// along obstacles. `r` is the body radius.
export function resolvePosition(
  seed: number,
  x: number,
  z: number,
  r = 0.5,
  ignoreFences = false,
  delveModules?: readonly string[],
  riftFloor?: RiftFloorRef,
): { x: number; z: number } {
  if (isRiftPos(x)) {
    const o = riftOrigin(riftSlotAt(z));
    const local = resolveAgainst(riftInteriorColliders(riftFloor), x - o.x, z - o.z, r);
    return { x: local.x + o.x, z: local.z + o.z };
  }
  if (isDelvePos(x)) {
    const delve = delveAt(x);
    const mods = delveModules?.length ? delveModules : delve ? defaultDelveModules(delve.id) : [];
    const loc = delveModuleLocal(x, z, mods);
    const colliders = delveModuleColliders(loc.moduleId as DelveModuleId);
    const local = resolveAgainst(colliders, loc.localX, loc.localZ, r);
    return { x: local.x + loc.ox, z: local.z + loc.oz };
  }
  if (isArenaPos(x)) {
    const o = arenaOriginAt(z);
    const local = resolveAgainst(ARENA_COLLIDERS, x - o.x, z - o.z, r, ignoreFences);
    return { x: local.x + o.x, z: local.z + o.z };
  }
  if (x > DUNGEON_X_THRESHOLD) {
    const { ox, oz, interior } = instanceLocal(x, z);
    const local = resolveAgainst(interiorColliders(interior), x - ox, z - oz, r, ignoreFences);
    return { x: local.x + ox, z: local.z + oz };
  }
  const grid = gridFor(seed);
  const key = `${Math.floor(x / GRID_CELL)},${Math.floor(z / GRID_CELL)}`;
  const list = grid.cells.get(key);
  if (!list) return { x, z };
  return resolveAgainst(list, x, z, r, ignoreFences);
}

function crossesFence(fromX: number, fromZ: number, toX: number, toZ: number, r: number): boolean {
  for (const f of PROPS.fences) {
    const dx = f.x2 - f.x1,
      dz = f.z2 - f.z1;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len,
      uz = dz / len;
    const nx = -uz,
      nz = ux;
    const fromRelX = fromX - f.x1,
      fromRelZ = fromZ - f.z1;
    const toRelX = toX - f.x1,
      toRelZ = toZ - f.z1;
    const fromSide = fromRelX * nx + fromRelZ * nz;
    const toSide = toRelX * nx + toRelZ * nz;
    if (fromSide === 0 && toSide === 0) continue;
    if (fromSide * toSide > 0) continue;
    const denom = fromSide - toSide;
    const t = Math.abs(denom) < 1e-6 ? 0 : fromSide / denom;
    if (t < 0 || t > 1) continue;
    const hitX = fromX + (toX - fromX) * t;
    const hitZ = fromZ + (toZ - fromZ) * t;
    const along = (hitX - f.x1) * ux + (hitZ - f.z1) * uz;
    if (along >= -FENCE_END_PAD - r && along <= len + FENCE_END_PAD + r) return true;
  }
  return false;
}

export function resolveMovement(
  seed: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  r = 0.5,
  ignoreFences = false,
  delveModules?: readonly string[],
  riftFloor?: RiftFloorRef,
): { x: number; z: number } {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return resolvePosition(seed, toX, toZ, r, ignoreFences, delveModules, riftFloor);
  const steps = Math.max(1, Math.ceil(d / 0.2));
  let x = fromX,
    z = fromZ;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nextX = fromX + dx * t;
    const nextZ = fromZ + dz * t;
    if (!ignoreFences && crossesFence(x, z, nextX, nextZ, r)) break;
    const resolved = resolvePosition(seed, nextX, nextZ, r, ignoreFences, delveModules, riftFloor);
    x = resolved.x;
    z = resolved.z;
    if (Math.hypot(x - nextX, z - nextZ) > r * 0.25) {
      const remainingX = toX - nextX;
      const remainingZ = toZ - nextZ;
      const correctionX = x - nextX;
      const correctionZ = z - nextZ;
      if (remainingX * correctionX + remainingZ * correctionZ < 0) break;
    }
  }
  return { x, z };
}

// ---------------------------------------------------------------------------
// Swept movement: the traversal solver, wired
// ---------------------------------------------------------------------------
// `resolveMovement` above walks a straight line in 0.2 yd sub-steps and pushes
// the body out of whatever it lands inside. That is discrete: it cannot report
// a contact normal, so it never really slides, and it only avoids tunnelling
// because the sub-step is smaller than the bodies. `resolveBodyMove` hands the
// same geometry to `src/sim/traversal/`, which sweeps continuously, slides on
// the real contact tangent, depenetrates along the minimum-translation axis and
// (once content declares a `moveTopY`) strides up onto tops.
//
// DETERMINISM: the collider list handed to a solve is the caller's order, and
// ties in time of impact go to the earlier entry, so the order IS part of the
// result. Everything below builds that order the same way on every host: the
// static grid is filled in `staticWorldColliders` order, cells are visited in
// ascending (gx, gz), and duplicates are dropped first-seen. Nothing sorts.
// `resolveMovement` and `resolvePosition` are LEFT ALONE on purpose: the mob
// router (`isBlocked`, `findPlayerPath`, `resolvePlayerDestination`) and mob
// wander are point queries, and re-deriving them through a swept solver would
// have moved every mob in the world in the same change.

interface ColliderRegion {
  list: readonly Collider[];
  ox: number;
  oz: number;
}

// Module scratch. Every field is written before it is read within one call and
// none of it escapes a call (callers copy out immediately), so it carries no
// state between calls; it exists because this runs per body per tick.
const region: ColliderRegion = { list: NO_COLLIDERS, ox: 0, oz: 0 };
const gathered: Collider[] = [];
const gatheredSeen = new Set<Collider>();
const moveOut: TraversalMoveResult = {
  x: 0,
  z: 0,
  feetY: 0,
  hitWall: false,
  steppedUp: false,
  depenetrated: false,
  passes: 0,
  sweeps: 0,
  overlaps: 0,
};

/**
 * Open-world colliders over the swept AABB, in a stable order: cells ascending
 * by gx then gz, each cell in `staticWorldColliders` insertion order, duplicates
 * (a collider spans every cell its padded bounds touch) dropped on first sight.
 * The single-cell case returns the cell list itself, which is byte-for-byte the
 * list `resolvePosition` has always resolved against.
 */
function openWorldColliders(
  seed: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): readonly Collider[] {
  const grid = gridFor(seed);
  const gx0 = Math.floor(Math.min(x0, x1) / GRID_CELL);
  const gx1 = Math.floor(Math.max(x0, x1) / GRID_CELL);
  const gz0 = Math.floor(Math.min(z0, z1) / GRID_CELL);
  const gz1 = Math.floor(Math.max(z0, z1) / GRID_CELL);
  if (gx0 === gx1 && gz0 === gz1) return grid.cells.get(`${gx0},${gz0}`) ?? NO_COLLIDERS;
  gathered.length = 0;
  gatheredSeen.clear();
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const list = grid.cells.get(`${gx},${gz}`);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (gatheredSeen.has(c)) continue;
        gatheredSeen.add(c);
        gathered.push(c);
      }
    }
  }
  return gathered;
}

/**
 * Which collider set governs a body at (x, z), and the instance-local origin
 * its coordinates must be expressed in. Mirrors `resolvePosition`'s region
 * split exactly, including which point decides the region: the DESTINATION,
 * because that is the point the last sub-step of `resolveMovement` resolved at.
 */
function regionAt(
  seed: number,
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  delveModules?: readonly string[],
  riftFloor?: RiftFloorRef,
): ColliderRegion {
  if (isRiftPos(x)) {
    const o = riftOrigin(riftSlotAt(z));
    region.list = riftInteriorColliders(riftFloor);
    region.ox = o.x;
    region.oz = o.z;
    return region;
  }
  if (isDelvePos(x)) {
    const delve = delveAt(x);
    const mods = delveModules?.length ? delveModules : delve ? defaultDelveModules(delve.id) : [];
    const loc = delveModuleLocal(x, z, mods);
    region.list = delveModuleColliders(loc.moduleId as DelveModuleId);
    region.ox = loc.ox;
    region.oz = loc.oz;
    return region;
  }
  if (isArenaPos(x)) {
    const o = arenaOriginAt(z);
    region.list = ARENA_COLLIDERS;
    region.ox = o.x;
    region.oz = o.z;
    return region;
  }
  if (x > DUNGEON_X_THRESHOLD) {
    const { ox, oz, interior } = instanceLocal(x, z);
    region.list = interiorColliders(interior);
    region.ox = ox;
    region.oz = oz;
    return region;
  }
  region.list = openWorldColliders(seed, fromX, fromZ, x, z);
  region.ox = 0;
  region.oz = 0;
  return region;
}

/**
 * Does any collider in play declare a movement top? While the answer is no (see
 * {@link MOVEMENT_TOP_POLICY}) the swept solver and the 2D point resolver mean
 * exactly the same thing by "blocked", and the two can be reconciled.
 */
function regionHasMovementTops(list: readonly Collider[]): boolean {
  for (let i = 0; i < list.length; i++) if (list[i].moveTopY !== undefined) return true;
  return false;
}

export interface BodyMoveParams {
  seed: number;
  /** Body centre at the start of the tick (world XZ, yards). */
  x: number;
  z: number;
  /** Intended motion for this tick (yards). */
  dx: number;
  dz: number;
  /** Feet height at the start of the tick (world Y, yards). */
  feetY: number;
  /** Body radius (yards). */
  radius?: number;
  /** Airborne bodies mantle over tops instead of striding onto them. */
  airborne?: boolean;
  /** A body airborne from a jump passes through fence rails. */
  ignoreFences?: boolean;
  delveModules?: readonly string[];
  riftFloor?: RiftFloorRef;
}

export interface BodyMoveResult {
  x: number;
  z: number;
  /** Feet height, raised when the body strode up onto a collider top. */
  feetY: number;
  /** The motion was cut short by something the body could not step onto. */
  hitWall: boolean;
  steppedUp: boolean;
}

// Reused so the per-tick hot path allocates only the returned result.
const moveParams = {
  x: 0,
  z: 0,
  feetY: 0,
  dx: 0,
  dz: 0,
  radius: 0.5,
  colliders: NO_COLLIDERS as readonly Collider[],
  topOf: movementTopOf,
  airborne: false,
  ignore: undefined as ColliderFilter | undefined,
};

/**
 * Resolve ONE tick of horizontal motion for one body through the traversal
 * solver. Pure over its arguments plus the (pure, seed-keyed) collider sets, so
 * the offline world, the authoritative server and the headless env all get the
 * same answer for the same tick.
 */
export function resolveBodyMove(p: BodyMoveParams): BodyMoveResult {
  const r = p.radius ?? 0.5;
  const endX = p.x + p.dx;
  const endZ = p.z + p.dz;
  const reg = regionAt(p.seed, endX, endZ, p.x, p.z, p.delveModules, p.riftFloor);
  moveParams.x = p.x - reg.ox;
  moveParams.z = p.z - reg.oz;
  moveParams.feetY = p.feetY;
  moveParams.dx = p.dx;
  moveParams.dz = p.dz;
  moveParams.radius = r;
  moveParams.colliders = reg.list;
  moveParams.airborne = p.airborne ?? false;
  moveParams.ignore = p.ignoreFences ? IGNORE_FENCES : undefined;
  const res = moveBody(moveParams, moveOut);
  let x = res.x + reg.ox;
  let z = res.z + reg.oz;
  // Reconcile the swept result with the POINT resolver the rest of the sim
  // reads through (`resolvePosition`, and therefore `isBlocked`,
  // `findPlayerPath`, `resolvePlayerDestination`, `lineOfSightClear`).
  //
  // The two do not describe the same box. `sweepCollider` inflates an OBB into
  // its exact Minkowski sum, a rectangle with ROUNDED corners of the body
  // radius; `pushOut` (and the traversal core's own `overlapCollider`, which
  // mirrors it) inflates it into a SQUARE box. Inside a corner wedge of up to
  // `r * (sqrt(2) - 1)`, about 0.21 yd, the sweep is happy and the push-out is
  // not. Measured against the shipped inn at (12, -6), which is a 6 x 7 box
  // rotated 2.4 rad: a body walked straight at its corner settles 0.06 yd
  // inside what `isBlocked` calls solid. Left alone that is not a static
  // disagreement but a 20 Hz buzz, because the next tick's depenetration pushes
  // the body straight back out along the square axis and the next sweep walks
  // it straight back in.
  //
  // So the swept solve owns the PATH (continuous, no tunnelling, real tangent
  // sliding) and the point resolver owns the final RESTING position, exactly as
  // it did when `resolveMovement` called it once per sub-step. That keeps the
  // player's position a place the mob router agrees is standable, which is the
  // property everything downstream already assumes.
  //
  // It is skipped when any collider in play declares a movement top, because
  // the point resolver is 2D: it would shove a body straight off a surface it
  // is legitimately standing on. That is the same 2D/3D boundary decision 2
  // bounds, surfacing in the one place it can be handled honestly.
  if (!regionHasMovementTops(reg.list)) {
    const settled = resolvePosition(p.seed, x, z, r, p.ignoreFences, p.delveModules, p.riftFloor);
    x = settled.x;
    z = settled.z;
  }
  // Anti-tunnel guard, kept from the sub-stepped resolver: a body that starts
  // INSIDE a fence rail volume could otherwise be depenetrated out the far
  // side, which is the one way a fence is crossable on foot. Evaluated against
  // the RESOLVED segment, not the raw intent: the solver already holds the body
  // a full radius off the rail, so approaching a fence now slides along it
  // instead of stopping dead the way the raw-intent test would.
  if (!p.ignoreFences && crossesFence(p.x, p.z, x, z, r)) {
    return { x: p.x, z: p.z, feetY: p.feetY, hitWall: true, steppedUp: false };
  }
  return { x, z, feetY: res.feetY, hitWall: res.hitWall, steppedUp: res.steppedUp };
}

/**
 * The surface a body's vertical pass should land and snap against at (x, z):
 * the heightfield, raised by any collider top the body's CENTRE is standing
 * over and could have reached this tick.
 *
 * Tops above `feetY + MAX_STEP_HEIGHT` are ignored, because a surface further
 * up than the body can stride is a surface it is standing BESIDE, not on.
 * With no shipped collider declaring a `moveTopY` this returns `groundY`
 * unchanged, bit for bit (see {@link MOVEMENT_TOP_POLICY}).
 */
export function movementFloorAt(
  seed: number,
  x: number,
  z: number,
  groundY: number,
  feetY: number,
  delveModules?: readonly string[],
  riftFloor?: RiftFloorRef,
): number {
  const reg = regionAt(seed, x, z, x, z, delveModules, riftFloor);
  return floorHeightAt(
    x - reg.ox,
    z - reg.oz,
    groundY,
    reg.list,
    movementTopOf,
    feetY + MAX_STEP_HEIGHT,
  );
}

export function isBlocked(
  seed: number,
  x: number,
  z: number,
  r = 0.5,
  ignoreFences = false,
  riftFloor?: RiftFloorRef,
): boolean {
  const res = resolvePosition(seed, x, z, r, ignoreFences, undefined, riftFloor);
  return Math.abs(res.x - x) > 1e-4 || Math.abs(res.z - z) > 1e-4;
}

// Would a straight move from (fromX,fromZ) to (toX,toZ) cross a fence line?
// Used by click-to-move to fire a jump just before reaching a fence it has
// routed through, since the player can hop over fences but not walk through.
export function pathCrossesFence(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  r = 0.5,
): boolean {
  return crossesFence(fromX, fromZ, toX, toZ, r);
}

// ---------------------------------------------------------------------------
// Camera occlusion — third-person chase-cam pull-in
// ---------------------------------------------------------------------------
// The renderer sweeps a ray from the player's head (`a`) toward the desired
// camera position (`b`) and pulls the camera in to the surface of the first
// static obstacle in between, so the chase cam never sits inside a wall.
// Pure XZ math against the SAME colliders movement uses (what you see is what
// you collide with). Returns the fraction of the a->b segment the camera may
// travel before the first occluder (1 = unobstructed). Open-world colliders
// carry precomputed `cameraTopY` values, so large rocks still pull the camera
// in only when the ray passes below their visual top. Hideable props are
// flagged `camGhost` and skipped entirely (the renderer hides them instead).

// First entry param t along a->b for a circle (radius already padded).
// Infinity = no hit; we also bail when `a` is already inside (never slam the
// camera onto the player).
function rayCircleEntry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number,
): number {
  const dx = bx - ax,
    dz = bz - az;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return Infinity;
  const fx = ax - cx,
    fz = az - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c < 0) return Infinity; // origin inside the circle
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  return (-b - Math.sqrt(disc)) / (2 * a);
}

// First entry param t along a->b for an OBB (extents already padded).
function rayObbEntry(
  c: ObbCollider,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  pad: number,
): number {
  const la = rotY(ax - c.x, az - c.z, -c.rot);
  const lb = rotY(bx - c.x, bz - c.z, -c.rot);
  const ex = c.hw + pad,
    ez = c.hd + pad;
  if (Math.abs(la.x) < ex && Math.abs(la.z) < ez) return Infinity; // origin inside the box
  const dx = lb.x - la.x,
    dz = lb.z - la.z;
  let tmin = -Infinity,
    tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (la.x < -ex || la.x > ex) return Infinity;
  } else {
    let t1 = (-ex - la.x) / dx,
      t2 = (ex - la.x) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (Math.abs(dz) < 1e-9) {
    if (la.z < -ez || la.z > ez) return Infinity;
  } else {
    let t1 = (-ez - la.z) / dz,
      t2 = (ez - la.z) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  if (tmax < tmin || tmax < 0) return Infinity;
  return tmin;
}

// Minimum entry fraction over one collider list (1 = clear). `infinite` skips
// the height gate (interior walls are full-height; the open world is not).
function sweepColliders(
  list: Collider[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  pad: number,
  infinite: boolean,
): number {
  let best = 1;
  for (const c of list) {
    if (c.camGhost) continue; // chase cam passes through; renderer hides it instead
    const t =
      c.type === 'circle'
        ? rayCircleEntry(ax, az, bx, bz, c.x, c.z, c.r + pad)
        : rayObbEntry(c, ax, az, bx, bz, pad);
    if (!(t > 1e-4) || t >= best) continue;
    if (!infinite && c.cameraTopY !== undefined && ay + (by - ay) * t > c.cameraTopY) continue;
    best = t;
  }
  return best;
}

// Fraction of the head->camera segment the chase cam may travel before the
// first static occluder. `a` is the look-at pivot (player head), `b` the
// desired camera position. Mirrors resolvePosition's region split.
export function cameraOcclusion(
  seed: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  pad = 0.35,
  delveModules?: readonly string[],
  riftFloor?: RiftFloorRef,
): number {
  if (isRiftPos(ax)) {
    const o = riftOrigin(riftSlotAt(az));
    return sweepColliders(
      riftInteriorColliders(riftFloor),
      ax - o.x,
      ay,
      az - o.z,
      bx - o.x,
      by,
      bz - o.z,
      pad,
      true,
    );
  }
  if (isDelvePos(ax)) {
    const delve = delveAt(ax);
    const mods = delveModules?.length ? delveModules : delve ? defaultDelveModules(delve.id) : [];
    const loc = delveModuleLocal(ax, az, mods);
    const colliders = delveModuleColliders(loc.moduleId as DelveModuleId);
    return sweepColliders(
      colliders,
      loc.localX,
      ay,
      loc.localZ,
      bx - loc.ox,
      by,
      bz - loc.oz,
      pad,
      true,
    );
  }
  if (isArenaPos(ax)) {
    const o = arenaOriginAt(az);
    return sweepColliders(
      ARENA_COLLIDERS,
      ax - o.x,
      ay,
      az - o.z,
      bx - o.x,
      by,
      bz - o.z,
      pad,
      true,
    );
  }
  if (ax > DUNGEON_X_THRESHOLD) {
    const { ox, oz, interior } = instanceLocal(ax, az);
    const colliders = interiorColliders(interior);
    return sweepColliders(colliders, ax - ox, ay, az - oz, bx - ox, by, bz - oz, pad, true);
  }
  const grid = gridFor(seed);
  const gx0 = Math.floor(Math.min(ax, bx) / GRID_CELL),
    gx1 = Math.floor(Math.max(ax, bx) / GRID_CELL);
  const gz0 = Math.floor(Math.min(az, bz) / GRID_CELL),
    gz1 = Math.floor(Math.max(az, bz) / GRID_CELL);
  let best = 1;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const list = grid.cells.get(`${gx},${gz}`);
      if (list) best = Math.min(best, sweepColliders(list, ax, ay, az, bx, by, bz, pad, false));
    }
  }
  return best;
}

export function lineOfSightClear(
  seed: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  r = 0.05,
  riftFloor?: RiftFloorRef,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  const steps = Math.max(2, Math.ceil(d / 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    if (isBlocked(seed, x, z, r, false, riftFloor)) return false;
  }
  return true;
}
