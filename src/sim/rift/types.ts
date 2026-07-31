// Rift types: the descriptor that crosses the wire and the fully-resolved plan
// every host regenerates from it.
//
// A rift is a procedural, infinitely-varied instanced dungeon. EVERYTHING about
// it (room geometry, theme, spawns, the floor's one headline mechanic, the boss)
// is a pure function of `RiftDescriptor`, so the authoritative server, the
// offline browser Sim, and the headless RL env all regenerate byte-identical
// content. Only the descriptor is ever transmitted. This is the same model as
// `terrainHeight(x, z, seed)` in src/sim/world.ts.
//
// Sim layer: no DOM/Three imports. This file is types only.

import type { DungeonLayout } from '../dungeon_layout';

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

/** The rank ladder. Rank is the ONLY difficulty axis: a rift never scales with
 * party size. C is the entry rung (our normal five-man line), S the hardest. */
export type RiftRank = 'C' | 'B' | 'A' | 'S';

/** The complete wire/persistence footprint of one rift floor. Both hosts turn
 * this into identical content through `generateRiftFloor`. `origin` is the
 * instance-plane anchor the floor's local coordinates are offset by; it is
 * runtime placement (which instance slot the run was handed), NOT content, so
 * it deliberately takes no part in the generation hash. */
export interface RiftDescriptor {
  seed: number;
  /** Encodes the rank (see `riftRankForBaseLevel`) and the mob level ramp. */
  baseLevel: number;
  floorIndex: number;
  origin: { x: number; z: number };
}

// ---------------------------------------------------------------------------
// Placed content
// ---------------------------------------------------------------------------

/** One placed creature, instance-local. `level` is already resolved for the
 * floor; the spawn-time stat transform lives in `ranks.ts`. */
export interface RiftSpawn {
  templateId: string;
  x: number;
  z: number;
  level: number;
  boss?: boolean;
  /** Which rank multiplier pair this spawn takes. */
  role: RiftSpawnRole;
}

/** Which rank multiplier pair a spawn takes. Dais guards flanking a boss are
 * still `trash`; `add` is reserved for boss-summoned waves. */
export type RiftSpawnRole = 'trash' | 'boss' | 'add';

export type RiftObjectKind =
  | 'descent' // sinks the party to the next floor (opens on clear)
  | 'exit' // returns the party to the overworld (opens on the final boss kill)
  | 'beacon' // always-available way out, at the floor entry
  | 'chest' // the boss floor's reward cache
  | 'treasure' // an off-path reward chest tucked against a wall
  | 'rune_pylon' // walk-on pylon for the `rune_pylons` mechanic
  | 'ice_goal' // the sigil an `ice_slide` must stop on
  | 'boulder' // a pushable boulder for `boulder_push`
  | 'boulder_pad' // the socket a boulder must be pushed onto
  | 'seq_rune' // a numbered rune for the `sequence` mechanic
  | 'gate' // a portcullis blocking the nave until its switch is thrown
  | 'switch'; // the pressure plate that raises the linked gate

/** A placed interactable, instance-local. `nameId` is a STABLE ID, never English
 * prose: `src/sim/` is language-agnostic, so the client resolves the label (see
 * the string list in this directory's CLAUDE.md). `slot` orders sequence runes. */
export interface RiftObjectPlan {
  kind: RiftObjectKind;
  x: number;
  z: number;
  nameId: string;
  slot?: number;
}

// ---------------------------------------------------------------------------
// Headline mechanics: MUTUALLY EXCLUSIVE, exactly one per floor
// ---------------------------------------------------------------------------

/** The floor's ONE headline mechanic, layered on top of clear-the-room.
 * - `none`: clear-to-open (the boss floor is always `none`).
 * - `rune_pylons`: light every pylon by walking onto it.
 * - `ice_slide`: slide across the frictionless sheet and stop on the goal.
 * - `boulder_push`: shove every boulder onto its socket pad.
 * - `sequence`: step the runes south to north; a wrong step resets.
 * - `switch_gate`: throw the pressure plate to raise the portcullis.
 * `RiftFloorPlan.mechanic` is the single source of truth for which one is live;
 * `tests/rift_gen.test.ts` pins that no floor ever carries two. */
export type RiftMechanicKind =
  | 'none'
  | 'rune_pylons'
  | 'ice_slide'
  | 'boulder_push'
  | 'sequence'
  | 'switch_gate';

/** Node count for `rune_pylons` / `sequence`, 0 otherwise. The sequence order is
 * NOT stored: it is derived by z-sorting the placed runes south to north, so the
 * plan cannot disagree with the placement. */
export interface RiftMechanic {
  kind: RiftMechanicKind;
  nodeCount: number;
}

/** The frictionless sheet for an `ice_slide` floor: an axis box, instance-local. */
export interface RiftIceZone {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** A `switch_gate` portcullis. It is a RUNTIME clamp box, never a static
 * collider, so the always-clear central spine invariant still holds and a closed
 * gate can never make the boss unreachable in the geometry sense. */
export interface RiftGate {
  x: number;
  z: number;
  hw: number;
  hd: number;
  switchX: number;
  switchZ: number;
}

// ---------------------------------------------------------------------------
// Floor plan
// ---------------------------------------------------------------------------

/** Per-floor visual grade. Pure numbers (0xRRGGBB + fog distances) the renderer
 * consumes; carrying it in the plan keeps `src/render/` free of any rift rng. */
export interface RiftStyle {
  themeId: string;
  /** Which authored interior kit the renderer dresses the room with. */
  kit: RiftInteriorKit;
  torch: { flame: number; emissive: number; light: number };
  fog: { color: number; near: number; far: number };
  wallTint: number;
  floorTint: number;
}

/** The authored interior kits a rift floor can be dressed in. These are the
 * existing `DungeonDef.interior` visual families; a rift reuses them rather than
 * needing new art, which is the whole reason rifts are cheap content. */
export type RiftInteriorKit = 'crypt' | 'sanctum' | 'temple';

/** A fully-resolved floor: geometry + style + spawn plan + the one mechanic. */
export interface RiftFloorPlan {
  seed: number;
  baseLevel: number;
  rank: RiftRank;
  floorIndex: number;
  floorCount: number;
  isBoss: boolean;
  /** Stable id for the floor label, e.g. `rift.floor.ember`. Never prose. */
  nameId: string;
  themeId: string;
  /** The generated room, in the SAME plain-number shape every hand-authored
   * interior uses. `layoutColliders(layout)` (sim/dungeon_layout.ts) is the one
   * derivation for collision; the renderer builds its modules from the same
   * fields. See this directory's CLAUDE.md for why this shape was chosen. */
  layout: DungeonLayout;
  style: RiftStyle;
  /** Player arrival point, instance-local (just past the entrance porch). */
  entry: { x: number; z: number };
  spawns: RiftSpawn[];
  objects: RiftObjectPlan[];
  mechanic: RiftMechanic;
  iceZone: RiftIceZone | null;
  gate: RiftGate | null;
  /** Mob level every spawn on this floor was resolved at. */
  floorLevel: number;
}

/** The rift as a whole (seed + baseLevel), for naming and floor count. */
export interface RiftPlan {
  seed: number;
  baseLevel: number;
  rank: RiftRank;
  /** Stable id pair the client renders the proper noun from, e.g.
   * `{ nounId: 'rift.noun.ember', suffixId: 'rift.suffix.abyss' }`. */
  nameId: { nounId: string; suffixId: string };
  /** Theme of the final (boss) floor, which names the rift. */
  themeId: string;
  floorCount: number;
}
