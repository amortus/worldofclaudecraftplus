// Distance-based residency policy for the chunked terrain.
//
// terrain.ts used to build every chunk in the world at boot and keep it forever.
// That is invisible on a 360x1440 zone strip (144 chunk cells) and fatal on a
// world several times that size: both resident geometry and boot cost scale with
// the whole map instead of with what the player can actually see.
//
// This module is the pure decision half. Given every chunk's footprint, the
// camera position and the tier's radii, it says which chunks should be meshed and
// which should be released, with hysteresis so a chunk cannot thrash on and off
// while the player walks its border. No Three.js, no DOM, no GPU: the policy is
// unit-testable in plain Node, and terrain.ts is the thin consumer that meshes,
// disposes and draws.

/** A chunk's square world-space footprint, in yards. */
export interface TerrainChunkFootprint {
  readonly centerX: number;
  readonly centerZ: number;
  /** half the footprint's side (a 60 yd chunk has half = 30) */
  readonly half: number;
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
  /** slot indices to mesh this frame, nearest first, at most the caller's budget */
  build: number[];
  /** slot indices whose geometry should be released now (never budget-capped) */
  release: number[];
  /** how many chunks the policy wants resident once the plan has converged */
  desiredResident: number;
  /** wanted-but-not-yet-built chunks, including the ones this frame's budget deferred */
  pendingBuilds: number;
  /** squared distances parallel to `build`; scratch, reused across frames */
  buildDistSq: number[];
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
  return { build: [], release: [], desiredResident: 0, pendingBuilds: 0, buildDistSq: [] };
}

/**
 * Insertion-sorts (index, distSq) into a capped nearest-first list, shifting by
 * hand rather than via splice so a per-frame call allocates nothing at all. The
 * cap is the frame's build budget (single digits), so the shift is trivial.
 */
function insertNearest(
  build: number[],
  distSq: number[],
  index: number,
  d: number,
  cap: number,
): void {
  const full = build.length >= cap;
  if (full && d >= distSq[cap - 1]) return;
  let at = full ? cap - 1 : build.length;
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
 * allocates nothing). Builds are capped at `budget` and ordered nearest first,
 * because the chunk under the player's feet matters and the one at the horizon
 * does not; releases are never capped, since holding evicted geometry is exactly
 * the leak this policy exists to avoid.
 */
export function planTerrainResidency(
  footprints: readonly TerrainChunkFootprint[],
  resident: readonly boolean[],
  camX: number,
  camZ: number,
  radii: TerrainResidencyRadii,
  budget: number,
  out: TerrainResidencyPlan = emptyTerrainResidencyPlan(),
): TerrainResidencyPlan {
  const build = out.build;
  const distSq = out.buildDistSq;
  const release = out.release;
  build.length = 0;
  distSq.length = 0;
  release.length = 0;
  const keepSq = radii.keep * radii.keep;
  const releaseSq = radii.release * radii.release;
  const cap = Math.max(0, Math.floor(budget));
  let desired = 0;
  let pending = 0;
  for (let i = 0; i < footprints.length; i++) {
    const chunk = footprints[i];
    const dx = Math.max(Math.abs(camX - chunk.centerX) - chunk.half, 0);
    const dz = Math.max(Math.abs(camZ - chunk.centerZ) - chunk.half, 0);
    const d = dx * dx + dz * dz;
    const isResident = resident[i] === true;
    const want = d <= keepSq ? true : d > releaseSq ? false : isResident;
    if (want) desired++;
    if (want && !isResident) {
      pending++;
      if (cap > 0) insertNearest(build, distSq, i, d, cap);
    } else if (!want && isResident) {
      release.push(i);
    }
  }
  out.desiredResident = desired;
  out.pendingBuilds = pending;
  return out;
}
