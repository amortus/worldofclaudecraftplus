// Distance-based residency policy for the chunked terrain.
//
// terrain.ts used to build every chunk in the world at boot and keep it forever.
// That is nearly invisible on a 360x1440 zone strip (144 chunk cells) and fatal on
// a world several times that size: both resident geometry and meshing cost scale
// with the whole map instead of with what the player can actually see. See the
// honesty note on TERRAIN_RESIDENCY_BY_TIER in gfx.ts about how little this buys
// on TODAY's world; the payoff is the 3-column world it unblocks.
//
// This module is the pure decision half. Given every chunk's footprint, the
// camera position and the tier's radii, it says which chunks should be meshed and
// which should be released, with hysteresis so a chunk cannot thrash on and off
// while the player walks its border. No Three.js, no DOM, no GPU: the policy is
// unit-testable in plain Node, and terrain.ts is the thin consumer that meshes,
// disposes and draws.

/** A chunk's square world-space footprint, plus what it costs to mesh. */
export interface TerrainChunkFootprint {
  readonly centerX: number;
  readonly centerZ: number;
  /** half the footprint's side, in yards (a 60 yd chunk has half = 30) */
  readonly half: number;
  /**
   * Build cost in vertices. Known before building (it is a pure function of the
   * chunk's size and LOD spacing) and very nearly proportional to the wall-clock
   * meshing time, since the cost is dominated by per-vertex terrainHeight
   * sampling. This is what the frame budget is denominated in: counting CHUNKS
   * treats a 2809-vertex settlement chunk and a 400-vertex wilderness chunk as
   * the same 7x-different amount of work.
   */
  readonly cost: number;
}

/**
 * Residency distances, in yards, measured from the camera to a chunk's NEAREST
 * EDGE (not its centre, so a big far super-chunk is judged by the part of it the
 * player can actually reach).
 *
 * `keep` < `release` on purpose: that gap is the hysteresis band. A chunk is
 * built the moment its edge comes within `keep`, but it is not released until its
 * edge passes `release`, so a player pacing the boundary crosses a band, not a
 * line, and no chunk can rebuild twice in the same walk.
 */
export interface TerrainResidencyRadii {
  readonly keep: number;
  readonly release: number;
}

export interface TerrainResidencyPlan {
  /**
   * The authoritative desired state, one entry per footprint. This, not `build`,
   * is what a caller should consult to ask "should slot i be resident?" -- `build`
   * is only the slice of it this frame's budget can afford.
   */
  want: boolean[];
  /** slot indices to mesh this frame, nearest first, within the vertex budget */
  build: number[];
  /** slot indices whose geometry should be released now (never budget-capped) */
  release: number[];
  /** how many chunks the policy wants resident (the number of true entries in `want`) */
  desiredResident: number;
  /** wanted-but-not-yet-built chunks, INCLUDING the ones this frame's budget deferred */
  pendingBuilds: number;
  /** total vertex cost of `build`; the frame's actual meshing spend */
  buildCost: number;
  /** squared distances parallel to `build`; scratch, reused across frames */
  buildDistSq: number[];
}

/**
 * How many nearest candidates the planner ranks before applying the cost budget.
 * The budget is a vertex count, so the number of chunks it admits varies with
 * their LOD; 24 is more than any tier's budget can pay for even at the very
 * cheapest LOD in the game (144 vertices, the Lambert far band), and bounding it
 * is what keeps the per-frame ranking O(n * 24) instead of a full sort of every
 * candidate. tests/terrain_residency.test.ts pins that relationship.
 */
export const MAX_BUILD_CANDIDATES = 24;

/**
 * Interior grid divisions for a chunk of `size` yards at `spacing` yard vertex
 * spacing. terrain.ts's chunk builder uses this too, so the cost the planner
 * budgets against and the grid the builder walks cannot drift.
 */
export function terrainChunkDivisions(size: number, spacing: number): number {
  return Math.max(4, Math.round(size / spacing));
}

/**
 * A chunk's vertex count, derived WITHOUT building it: the (n+1)x(n+1) interior
 * grid wrapped in a one-vertex skirt ring, so (n+3)^2. This is what makes a
 * cost-weighted frame budget possible at all.
 */
export function terrainChunkVertexCount(size: number, spacing: number): number {
  const gw = terrainChunkDivisions(size, spacing) + 3; // + the skirt ring
  return gw * gw;
}

/** Distance from the camera to the nearest point of a chunk's footprint (0 inside it). */
export function chunkEdgeDistance(
  chunk: TerrainChunkFootprint,
  camX: number,
  camZ: number,
): number {
  const dx = Math.max(Math.abs(camX - chunk.centerX) - chunk.half, 0);
  const dz = Math.max(Math.abs(camZ - chunk.centerZ) - chunk.half, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * The hysteresis rule, on its own so it can be read and tested as one thing:
 * inside `keep` a chunk is always wanted, past `release` it is always dropped,
 * and between the two it simply keeps whatever state it already had.
 */
export function nextChunkResidency(
  resident: boolean,
  edgeDistance: number,
  radii: TerrainResidencyRadii,
): boolean {
  if (edgeDistance <= radii.keep) return true;
  if (edgeDistance > radii.release) return false;
  return resident;
}

export function emptyTerrainResidencyPlan(): TerrainResidencyPlan {
  return {
    want: [],
    build: [],
    release: [],
    desiredResident: 0,
    pendingBuilds: 0,
    buildCost: 0,
    buildDistSq: [],
  };
}

/**
 * Insertion-sorts (index, distSq) into a capped nearest-first list, shifting by
 * hand rather than via splice so a per-frame call allocates nothing at all. The
 * cap is MAX_BUILD_CANDIDATES, so the shift is trivial.
 */
function insertNearest(build: number[], distSq: number[], index: number, d: number): void {
  const full = build.length >= MAX_BUILD_CANDIDATES;
  if (full && d >= distSq[MAX_BUILD_CANDIDATES - 1]) return;
  let at = full ? MAX_BUILD_CANDIDATES - 1 : build.length;
  while (at > 0 && distSq[at - 1] > d) {
    build[at] = build[at - 1];
    distSq[at] = distSq[at - 1];
    at--;
  }
  build[at] = index;
  distSq[at] = d;
}

/**
 * One frame's residency decision.
 *
 * Pure with respect to its inputs: it never touches `footprints` or `resident`,
 * and writes its answer into `out` (reused across frames so a 60 Hz caller
 * allocates nothing).
 *
 * `vertexBudget` is a COST budget, not a chunk count. Candidates are taken
 * nearest first -- the chunk under the player's feet matters and the one at the
 * horizon does not -- and the walk stops at the first chunk that would overrun
 * the budget rather than skipping it for a cheaper one further away, so the
 * nearest-first ordering is never broken to save a millisecond. The single
 * nearest candidate is always admitted even when it alone exceeds the budget:
 * chunk meshing cannot be split across frames, so refusing it would stall
 * residency forever and leave a permanent hole instead of a one-frame hitch.
 *
 * Releases are never capped, since holding evicted geometry is exactly the leak
 * this policy exists to avoid.
 */
export function planTerrainResidency(
  footprints: readonly TerrainChunkFootprint[],
  resident: readonly boolean[],
  camX: number,
  camZ: number,
  radii: TerrainResidencyRadii,
  vertexBudget: number,
  out: TerrainResidencyPlan = emptyTerrainResidencyPlan(),
): TerrainResidencyPlan {
  const want = out.want;
  const build = out.build;
  const distSq = out.buildDistSq;
  const release = out.release;
  build.length = 0;
  distSq.length = 0;
  release.length = 0;
  if (want.length !== footprints.length) want.length = footprints.length;
  const keepSq = radii.keep * radii.keep;
  const releaseSq = radii.release * radii.release;
  let desired = 0;
  let pending = 0;
  for (let i = 0; i < footprints.length; i++) {
    const chunk = footprints[i];
    const dx = Math.max(Math.abs(camX - chunk.centerX) - chunk.half, 0);
    const dz = Math.max(Math.abs(camZ - chunk.centerZ) - chunk.half, 0);
    const d = dx * dx + dz * dz;
    const isResident = resident[i] === true;
    const wanted = d <= keepSq ? true : d > releaseSq ? false : isResident;
    want[i] = wanted;
    if (wanted) desired++;
    if (wanted && !isResident) {
      pending++;
      if (vertexBudget > 0) insertNearest(build, distSq, i, d);
    } else if (!wanted && isResident) {
      release.push(i);
    }
  }
  out.desiredResident = desired;
  out.pendingBuilds = pending;

  // Spend the vertex budget over the ranked candidates.
  let spent = 0;
  let taken = 0;
  for (let i = 0; i < build.length; i++) {
    const next = spent + footprints[build[i]].cost;
    if (i > 0 && next > vertexBudget) break;
    spent = next;
    taken++;
  }
  build.length = taken;
  distSq.length = taken;
  out.buildCost = spent;
  return out;
}
