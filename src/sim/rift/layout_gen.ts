// Procedural room geometry for one rift floor.
//
// THE INTEGRATION CONSTRAINT, stated once because everything here follows from
// it: our interiors are plain-number `DungeonLayout` records (sim/dungeon_layout.ts)
// and that record is the SINGLE source for both the render modules and the
// collider set (`layoutColliders`). So a generated floor must express itself as a
// `DungeonLayout` and nothing else. It does, using only fields the record already
// has, which is why nothing outside this directory has to change:
//
//   - the room is a rectangle |x| <= wallX over z in [zMin, zMax]
//   - its SILHOUETTE (rotunda, taper, apse, hourglass, chambers, cavern,
//     corridor) is carved by wall-hugging `stubs`: each band is an OBB slab
//     reaching in from the side wall to the profile's half-width at that depth.
//     `layoutColliders` already turns every stub into an OBB collider and the
//     renderer already places wall-stub modules for them, so a curved-looking
//     room needs no new geometry primitive, no polygon shell, and no change to
//     `DungeonLayout`, `layoutColliders`, or `colliders.ts`.
//   - obstacles are `pillars` (circles), `tombs` (wall-side OBBs) and `clutter`
//     (small circles), all fields the record already carries.
//
// PLAYABILITY INVARIANT: the central spine |x| <= AISLE_HALF is kept free of
// every emitted obstacle, at every depth, by construction. A generated floor
// whose boss cannot be reached is a run that cannot be completed, so this is not
// a nicety; `tests/rift_gen.test.ts` proves it with a real grid flood fill from
// the entry to the boss rather than trusting the construction.
//
// Sim layer: no DOM/Three imports. All randomness comes from the caller's LOCAL
// Rng (seeded from the descriptor), never the live sim rng.

import type { Collider } from '../colliders';
import {
  type DungeonLayout,
  type GridPoint,
  layoutColliders,
  type WallStub,
} from '../dungeon_layout';
import type { Rng } from '../rng';

// ---- Tuning ---------------------------------------------------------------
// Room dimensions are anchored on our OWN authored interiors, not on upstream's
// (sim/dungeon_layout.ts): every one of them starts at zMin -19 so the entrance
// porch and door props line up, and runs 110 (crypt) to 177 (sanctum) deep at
// |x| = 23. A rift floor sits inside that envelope, so the existing KayKit wall
// modules and the chase-cam porch behave exactly as they do in a hand-authored
// dungeon, and a floor still fits one instance slot (data.ts instanceOrigin
// stacks slots 500 apart in z and gives each dungeon index a 600-wide x band).

/** Front wall centreline, matching every authored interior. */
export const RIFT_Z_MIN = -19;
/** Player arrival offset past the front wall (inside the entrance porch). */
export const RIFT_ENTRY_Z_OFFSET = 8;
/** Half-width of the always-clear central spine. No generated obstacle, stub, or
 * silhouette band may intrude on |x| <= AISLE_HALF at any depth. */
export const AISLE_HALF = 5.5;
/** Player body radius used for every clearance check here. */
export const BODY_R = 0.6;

const LENGTH_BOSS: readonly [number, number] = [104, 132];
const LENGTH_NORMAL: readonly [number, number] = [112, 152];
/** Narrowest the profile may pinch to: leaves the spine plus a real walking
 * margin on both sides so a pinch never reads as a dead end. */
const WIDTH_MIN: readonly [number, number] = [11, 15];
const WIDTH_MAX_BOSS: readonly [number, number] = [24, 32];
const WIDTH_MAX_NORMAL: readonly [number, number] = [19, 30];
/** Depth of one silhouette band (half-depth of the OBB slab it emits). */
const BAND_HD = 4;
/** Below this the band is not worth a stub (a sliver reads as wall noise). */
const MIN_BAND_INSET = 1.5;

export const ROOM_ARCHETYPES = [
  'hall',
  'rotunda',
  'taper',
  'apse',
  'hourglass',
  'chambers',
  'cavern',
  'corridor',
] as const;
export type RoomArchetype = (typeof ROOM_ARCHETYPES)[number];

/** Boss floors only roll shapes that are WIDE at the back, where the dais and
 * the oversized boss sit, so the final fight always has an open arena. */
export const BOSS_ARCHETYPES: readonly RoomArchetype[] = ['hall', 'taper', 'apse'];

export interface RiftGeometry {
  layout: DungeonLayout;
  colliders: Collider[];
  /** Walkable half-width at instance-local z, derived from the EMITTED
   * silhouette bands (not from the continuous profile), so a placement can never
   * be validated against a width the room does not actually have. */
  walkHalfAt: (z: number) => number;
  archetype: RoomArchetype;
}

// ---- Profiles -------------------------------------------------------------

type Profile = (t: number) => number;

function smoothstep(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

function makeProfile(rng: Rng, archetype: RoomArchetype, wMin: number, wMax: number): Profile {
  const span = wMax - wMin;
  switch (archetype) {
    case 'rotunda': // one bulging round hall
      return (t) => wMin + span * Math.sin(Math.PI * t);
    case 'taper': // widens steadily toward the boss end
      return (t) => wMin + span * t;
    case 'apse': // narrow nave, then a wide round chamber at the far end
      return (t) => (t < 0.5 ? wMin : wMin + span * smoothstep((t - 0.5) / 0.5));
    case 'hourglass': // wide ends, a pinched waist
      return (t) => wMin + span * (1 - Math.sin(Math.PI * t));
    case 'chambers': // wide / narrow / wide / narrow / wide
      return (t) => wMin + span * (0.5 + 0.5 * Math.cos(4 * Math.PI * t));
    case 'cavern': {
      // Organic wobble from three fixed-phase harmonics. The phases are drawn
      // once here, so the profile stays a pure function afterwards.
      const p1 = rng.range(0, Math.PI * 2);
      const p2 = rng.range(0, Math.PI * 2);
      const p3 = rng.range(0, Math.PI * 2);
      return (t) => {
        const w =
          0.55 +
          0.22 * Math.sin(3 * Math.PI * t + p1) +
          0.14 * Math.sin(5 * Math.PI * t + p2) +
          0.09 * Math.sin(8 * Math.PI * t + p3);
        return wMin + span * Math.max(0, Math.min(1, w));
      };
    }
    case 'corridor': // a thin passage the whole way; baffle fins add the weave
      return () => wMin + Math.min(span, 3);
    default: // 'hall', the plain rectangle
      return () => wMax;
  }
}

// ---- Clearance ------------------------------------------------------------

/** Whether (x, z) clears every collider by radius `r`. Mirrors the OBB local
 * frame `colliders.ts` `pushOut` uses (rotY with its z-sign flip), so a point
 * this call accepts is a point the runtime resolver will not push. */
export function isClear(colliders: readonly Collider[], x: number, z: number, r = BODY_R): boolean {
  for (const c of colliders) {
    if (c.type === 'circle') {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + r) * (c.r + r)) return false;
    } else {
      const dx = x - c.x;
      const dz = z - c.z;
      const cos = Math.cos(c.rot);
      const sin = Math.sin(c.rot);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return false;
    }
  }
  return true;
}

/** March a candidate point toward the always-clear spine until it clears every
 * collider by `r`. Deterministic (a fixed one-unit march, no rng) and guaranteed
 * to terminate: |x| <= AISLE_HALF is obstacle-free by construction, so x = 0 is
 * always a valid answer. `r` lets a bulky prop demand extra wall clearance. */
export function toClear(
  colliders: readonly Collider[],
  x: number,
  z: number,
  r = BODY_R,
): GridPoint {
  if (isClear(colliders, x, z, r)) return { x, z };
  const step = x >= 0 ? -1 : 1;
  let cx = x;
  for (let i = 0; i < 60; i++) {
    cx += step;
    if (Math.abs(cx) <= AISLE_HALF) cx = 0;
    if (isClear(colliders, cx, z, r)) return { x: cx, z };
    if (cx === 0) break;
  }
  return { x: 0, z };
}

// ---- Generation -----------------------------------------------------------

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** Build the room for one floor. Draw order is fixed and must not be reordered:
 * every downstream planner shares this Rng, so moving a draw here shifts every
 * spawn, object and mechanic on every floor of every existing seed. */
export function buildRiftLayout(rng: Rng, isBoss: boolean): RiftGeometry {
  const zMin = RIFT_Z_MIN;
  const [lenLo, lenHi] = isBoss ? LENGTH_BOSS : LENGTH_NORMAL;
  const length = rng.int(lenLo, lenHi);
  const zMax = zMin + length;
  const midZ = (zMin + zMax) / 2;

  const archetype = isBoss
    ? rng.pick(BOSS_ARCHETYPES as RoomArchetype[])
    : rng.pick(ROOM_ARCHETYPES as unknown as RoomArchetype[]);

  const wMin = rng.range(WIDTH_MIN[0], WIDTH_MIN[1]);
  const [maxLo, maxHi] = isBoss ? WIDTH_MAX_BOSS : WIDTH_MAX_NORMAL;
  const wMax = Math.max(wMin + 4, rng.range(maxLo, maxHi));
  const profile = makeProfile(rng, archetype, wMin, wMax);
  const wallX = Math.round(wMax);
  const profileAt = (z: number): number =>
    Math.max(wMin, Math.min(wallX, profile(Math.max(0, Math.min(1, (z - zMin) / length)))));

  // 1. Carve the silhouette as wall-hugging OBB bands. `hall` stays a plain
  //    rectangle (no bands), which is why it is in the archetype set at all.
  const stubs: WallStub[] = [];
  const bands: Array<{ z: number; hd: number; inset: number }> = [];
  if (archetype !== 'hall') {
    for (let bz = zMin + BAND_HD; bz <= zMax - BAND_HD; bz += BAND_HD * 2) {
      const inset = wallX - profileAt(bz);
      if (inset < MIN_BAND_INSET) continue;
      const hw = round1(inset / 2);
      const centerMag = round1(wallX - hw);
      stubs.push({ x: -centerMag, z: bz, hw, hd: BAND_HD });
      stubs.push({ x: centerMag, z: bz, hw, hd: BAND_HD });
      bands.push({ z: bz, hd: BAND_HD, inset: hw * 2 });
    }
  }

  // 2. The walkable envelope, read back off the EMITTED bands. A band is treated
  //    as covering a little beyond its slab so a placement right at a band seam
  //    is judged by the narrower of the two, never the wider.
  const BAND_MARGIN = 2;
  const walkHalfAt = (z: number): number => {
    let inset = 0;
    for (const b of bands) {
      if (z >= b.z - b.hd - BAND_MARGIN && z <= b.z + b.hd + BAND_MARGIN) {
        if (b.inset > inset) inset = b.inset;
      }
    }
    return Math.max(AISLE_HALF + 1, wallX - inset);
  };

  // 3. The boss dais, sized to the room it actually sits in.
  const daisWant = isBoss ? rng.range(11, 14) : rng.range(8, 10.5);
  const daisR = Math.max(6, Math.min(daisWant, walkHalfAt(zMax - 14) - 2));
  const dais = { x: 0, z: zMax - Math.round(daisR + 6), r: round1(daisR) };

  // 4. Flanking pillar rows down the nave, off the spine, inside the envelope.
  const pillars: GridPoint[] = [];
  const pillarBase = rng.pick([12, 14, 16]);
  const rowGap = rng.pick([14, 16, 18, 20]);
  for (let z = zMin + rng.int(22, 30); z <= dais.z - 16; z += rowGap) {
    const inset = Math.min(pillarBase, walkHalfAt(z) - 3);
    if (inset < AISLE_HALF + 2) continue; // too narrow here to flank the aisle
    if (rng.chance(0.25)) pillars.push({ x: rng.chance(0.5) ? -inset : inset, z });
    else pillars.push({ x: -inset, z }, { x: inset, z });
  }

  // 5. Wall-side obstacles hugging the carved walls.
  const tombs: GridPoint[] = [];
  const tombZs: number[] = [];
  if (rng.chance(0.8)) {
    const tombGap = rng.pick([20, 24, 28]);
    for (let z = zMin + rng.int(16, 24); z <= dais.z - 20; z += tombGap) {
      const inset = walkHalfAt(z) - 4;
      if (inset < AISLE_HALF + 2) continue;
      const left = rng.chance(0.85);
      const right = rng.chance(0.85);
      if (left) tombs.push({ x: -inset, z });
      if (right) tombs.push({ x: inset, z });
      if (left || right) tombZs.push(z);
    }
  }

  // 6. Baffle fins: short one-sided stubs reaching a little way in from the wall,
  //    so the path weaves without ever crossing the spine. Always on for the thin
  //    `corridor`, a common garnish elsewhere, never on a boss floor (the arena
  //    stays open).
  if (!isBoss && (archetype === 'corridor' || rng.chance(0.4))) {
    const bafGap = rng.pick([10, 12, 14]);
    let side = rng.chance(0.5) ? -1 : 1;
    for (let z = zMin + rng.int(24, 32); z <= dais.z - 18; z += bafGap) {
      const w = walkHalfAt(z);
      if (w < AISLE_HALF + 5) {
        side = -side;
        continue; // no room here for a fin that still leaves a passage
      }
      if (tombZs.some((tz) => Math.abs(tz - z) < 4)) {
        side = -side;
        continue; // do not bury a wall-side obstacle inside a fin
      }
      // hw capped so the fin's inner edge stays >= AISLE_HALF + 1.5.
      const hw = Math.min(rng.range(2, 3.5), (w - AISLE_HALF - 2) / 2);
      if (hw < 0.75) {
        side = -side;
        continue;
      }
      stubs.push({
        x: round1(side * (w - hw - 0.5)),
        z,
        hw: round1(hw),
        hd: rng.pick([1.5, 2, 2.5]),
      });
      side = -side;
    }
  }

  // 7. Floor clutter, scattered off the spine and inside the envelope.
  const clutter: GridPoint[] = [];
  const clutterCount = rng.int(4, 10);
  for (let i = 0; i < clutterCount; i++) {
    const z = zMin + rng.range(14, Math.max(14, dais.z - 18 - zMin));
    const hw = walkHalfAt(z);
    if (hw - AISLE_HALF < 4) continue;
    const side = rng.chance(0.5) ? -1 : 1;
    clutter.push({ x: round1(side * rng.range(AISLE_HALF + 2, hw - 2)), z: round1(z) });
  }

  const layout: DungeonLayout = {
    zMin,
    zMax,
    sideWallZ: midZ,
    sideWallHd: length / 2 + 1,
    wallX,
    endWallHw: wallX + 1,
    floorHalfX: wallX,
    doorZ: zMin + 2,
    pillars,
    tombs,
    stubs,
    dais,
    clutter,
  };
  return { layout, colliders: layoutColliders(layout), walkHalfAt, archetype };
}

/** The floor's arrival point. One expression, read by both the plan's `entry`
 * and the spawn planner's clearance band, so the two can never disagree. */
export function riftEntryZ(layout: DungeonLayout): number {
  return layout.zMin + RIFT_ENTRY_Z_OFFSET;
}
