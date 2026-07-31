// The floor's ONE headline mechanic, and the interactables that express it.
//
// MUTUAL EXCLUSION is structural, not a convention: a floor carries a single
// `RiftMechanicKind` enum value, and every placement below hangs off that one
// switch. There is no way to end up with an ice sheet and a portcullis on the
// same floor, because there is no second field to put the second one in. That
// matters more than it looks: the reason upstream lists these as mutually
// exclusive is legibility, and legibility only survives if the data model
// enforces it rather than the roll order.
//
// Every node is placed on or beside the always-clear central spine, and every
// placement is run through `toClear` against the room's real collider set, so a
// mechanic is solvable by construction and no prop renders inside a wall.
//
// Sim layer: no DOM/Three imports. All randomness comes from the caller's LOCAL
// Rng, seeded from the descriptor.

import { layoutColliders, PILLAR_COLLIDER_R } from '../dungeon_layout';
import type { Rng } from '../rng';
import { AISLE_HALF, type RiftGeometry, toClear } from './layout_gen';
import type { RiftGate, RiftIceZone, RiftMechanic, RiftMechanicKind, RiftObjectPlan } from './types';

/** Roll weights, cumulative. A floor is plain (`none`) about a tenth of the
 * time, so clear-the-room stays a real outcome rather than a rounding error. */
const MECHANIC_ROLL: ReadonlyArray<{ upTo: number; kind: RiftMechanicKind }> = [
  { upTo: 0.18, kind: 'rune_pylons' },
  { upTo: 0.36, kind: 'ice_slide' },
  { upTo: 0.54, kind: 'boulder_push' },
  { upTo: 0.72, kind: 'sequence' },
  { upTo: 0.9, kind: 'switch_gate' },
];

/** Extra clearance a bulky prop demands so its body never renders embedded in a
 * wall or a pillar. */
const PROP_R = 1.7;
/** Boulder lane offset. Inside AISLE_HALF, so a boulder and its socket always
 * fit and a straight northward shove always solves the floor. */
const BOULDER_X = 3.5;

export interface RiftMechanicPlan {
  mechanic: RiftMechanic;
  objects: RiftObjectPlan[];
  iceZone: RiftIceZone | null;
  gate: RiftGate | null;
}

const NO_MECHANIC: RiftMechanic = { kind: 'none', nodeCount: 0 };

function rollKind(rng: Rng): RiftMechanicKind {
  const roll = rng.next();
  for (const row of MECHANIC_ROLL) if (roll < row.upTo) return row.kind;
  return 'none';
}

/** The frictionless sheet: a wide box across the middle of the nave. The goal
 * sits at its north edge ON the spine, so a straight northward slide always
 * solves the floor no matter what the rocks do to the rest of the rink. */
function iceZoneFor(geo: RiftGeometry): RiftIceZone {
  const { layout } = geo;
  const zC = (layout.zMin + layout.dais.z) / 2;
  const hd = Math.max(10, Math.min(24, (layout.dais.z - 20 - (layout.zMin + 16)) / 2));
  const hw = Math.max(6, geo.walkHalfAt(zC) - 2);
  return { x: 0, z: zC, hw, hd };
}

/** Scatter blocker rocks across the rink (they stop a slide), keeping a clear
 * central corridor north to the goal. They go into `layout.pillars`, so the
 * renderer, the collider set and every later clearance check all see them. */
function addIceBlockers(rng: Rng, geo: RiftGeometry, ice: RiftIceZone): void {
  // A blocker becomes a real pillar, so its CENTRE must clear the spine by the
  // pillar collider radius (dungeon_layout PILLAR_COLLIDER_R is 1) plus a
  // margin. Anything closer would let a rock's body bleed into the aisle and
  // break the invariant the whole subsystem rests on.
  const CORRIDOR = AISLE_HALF + PILLAR_COLLIDER_R + 0.5;
  const maxX = Math.max(CORRIDOR + 2, ice.hw - 2);
  if (maxX <= CORRIDOR + 1.5) return; // rink too narrow for off-corridor rocks
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * rng.range(CORRIDOR, maxX);
    const z = rng.range(ice.z - ice.hd + 6, ice.z + ice.hd - 6);
    geo.layout.pillars.push({
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
    });
  }
  geo.colliders = layoutColliders(geo.layout);
}

/** A portcullis across the nave with its pressure plate to the SOUTH, so the
 * plate is always reached first. Null when the nave is too short to fit a fair
 * "plate, then gate, then room" sequence; the caller then falls back to `none`. */
function planGate(rng: Rng, geo: RiftGeometry): RiftGate | null {
  const { layout } = geo;
  const zGate = Math.round(layout.zMin + rng.range(50, Math.max(50, layout.dais.z - 32)));
  if (zGate >= layout.dais.z - 22) return null;
  const switchZ = zGate - rng.int(12, 18);
  if (switchZ <= layout.zMin + 18) return null;
  const hw = Math.max(AISLE_HALF + 3, geo.walkHalfAt(zGate));
  return { x: 0, z: zGate, hw, hd: 1.6, switchX: 0, switchZ };
}

/** Place a node a good way inside the wall but clear of the spine. */
function nodeX(geo: RiftGeometry, side: number, z: number): number {
  const w = geo.walkHalfAt(z);
  return side * Math.max(AISLE_HALF + 2.5, Math.min(w - 5, w * 0.6));
}

/** Roll and place the floor's one headline mechanic. Boss floors always come
 * back `none`: the boss IS the floor's mechanic, and a puzzle gate on a boss
 * floor would be a second thing to read during the fight.
 *
 * MUTATES `geo` for `ice_slide` (the blocker rocks become real pillars), which
 * is why it must run before spawns and structural objects are placed. */
export function planRiftMechanic(rng: Rng, geo: RiftGeometry, isBoss: boolean): RiftMechanicPlan {
  if (isBoss) return { mechanic: NO_MECHANIC, objects: [], iceZone: null, gate: null };

  const kind = rollKind(rng);
  const objects: RiftObjectPlan[] = [];
  const { layout, colliders } = geo;

  if (kind === 'rune_pylons') {
    const n = rng.int(3, 4);
    const z0 = layout.zMin + 40;
    const z1 = Math.max(z0, layout.dais.z - 14);
    for (let i = 0; i < n; i++) {
      const z = n > 1 ? z0 + ((z1 - z0) * i) / (n - 1) : (z0 + z1) / 2;
      const p = toClear(colliders, nodeX(geo, i % 2 === 0 ? -1 : 1, z), z, PROP_R);
      objects.push({ kind: 'rune_pylon', x: p.x, z: p.z, nameId: 'rift.object.rune_pylon' });
    }
    return { mechanic: { kind, nodeCount: n }, objects, iceZone: null, gate: null };
  }

  if (kind === 'ice_slide') {
    const iceZone = iceZoneFor(geo);
    addIceBlockers(rng, geo, iceZone);
    objects.push({
      kind: 'ice_goal',
      x: 0,
      z: Math.round(iceZone.z + iceZone.hd - 1.5),
      nameId: 'rift.object.ice_goal',
    });
    return { mechanic: { kind, nodeCount: 0 }, objects, iceZone, gate: null };
  }

  if (kind === 'boulder_push') {
    const count = rng.int(1, 2);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const bx = (i % 2 === 0 ? -1 : 1) * BOULDER_X;
      const bz = layout.zMin + 34 + i * 16;
      const padZ = Math.min(bz + 10, layout.dais.z - 6);
      if (padZ <= bz + 3) continue;
      objects.push({ kind: 'boulder_pad', x: bx, z: padZ, nameId: 'rift.object.boulder_pad' });
      objects.push({ kind: 'boulder', x: bx, z: bz, nameId: 'rift.object.boulder' });
      placed++;
    }
    // A room too short for even one boulder falls back to clear-to-open rather
    // than shipping a mechanic with nothing to solve.
    if (placed === 0) return { mechanic: NO_MECHANIC, objects: [], iceZone: null, gate: null };
    return { mechanic: { kind, nodeCount: placed }, objects, iceZone: null, gate: null };
  }

  if (kind === 'sequence') {
    const n = rng.int(3, 5);
    const zBase = layout.zMin + 34;
    for (let i = 0; i < n; i++) {
      const z = zBase + Math.floor(i / 2) * 16 + (i % 2) * 8;
      const p = toClear(colliders, nodeX(geo, i % 2 === 0 ? -1 : 1, z), z, 1.5);
      objects.push({
        kind: 'seq_rune',
        x: p.x,
        z: p.z,
        nameId: 'rift.object.seq_rune',
        // Placement index. The REQUIRED order is derived by z-sorting the placed
        // runes south to north at spawn time, so the plan can never disagree
        // with where the runes actually stand.
        slot: i,
      });
    }
    return { mechanic: { kind, nodeCount: n }, objects, iceZone: null, gate: null };
  }

  if (kind === 'switch_gate') {
    const gate = planGate(rng, geo);
    if (!gate) return { mechanic: NO_MECHANIC, objects: [], iceZone: null, gate: null };
    objects.push({ kind: 'gate', x: gate.x, z: gate.z, nameId: 'rift.object.gate' });
    objects.push({
      kind: 'switch',
      x: gate.switchX,
      z: gate.switchZ,
      nameId: 'rift.object.switch',
    });
    return { mechanic: { kind, nodeCount: 0 }, objects, iceZone: null, gate };
  }

  return { mechanic: NO_MECHANIC, objects: [], iceZone: null, gate: null };
}
