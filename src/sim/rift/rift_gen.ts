// The procedural Rift generator: pure functions that turn a compact descriptor
// (seed + baseLevel + floorIndex) into a fully-resolved floor.
//
// DETERMINISM IS THE POINT. The authoritative server, the offline browser Sim
// and the headless RL env all call these identical functions, so no rift
// geometry, spawn, or mechanic is ever transmitted: only the descriptor. This
// mirrors `terrainHeight(x, z, seed)` in sim/world.ts, which the sim and the
// renderer both sample rather than sharing a heightmap.
//
// THE LOCAL-RNG RULE, and why it must never be "simplified" away. Generation
// uses an `Rng` constructed HERE from the descriptor. It must never take, read,
// or borrow the live world's `this.rng`. If it did, generating a rift mid-session
// would consume draws from the shared stream and shift the outcome of every
// later roll in the sim (loot, mob AI, respawn jitter), so two players in the
// same world would diverge from that tick onward. A rift is content addressed by
// its seed, not an event in the world's timeline. Reaching for `sim.rng` here
// looks harmless and is the single most expensive mistake available in this
// directory; sim/rift/CLAUDE.md says so again for the same reason.
//
// Sim layer: no DOM/Three imports, no Math.random / Date.now / performance.now.

import type { Collider } from '../colliders';
import {
  RIFT_SUFFIX_IDS,
  RIFT_THEME_BY_ID,
  RIFT_THEMES,
  type RiftBossMechanicKey,
  type RiftTheme,
} from '../content/rift';
import { layoutColliders } from '../dungeon_layout';
import { Rng } from '../rng';
import { buildRiftLayout, riftEntryZ, toClear } from './layout_gen';
import { planRiftMechanic } from './mechanics';
import { RIFT_RANK_MECHANIC_BUDGET, riftFloorLevel, riftRankForBaseLevel } from './ranks';
import { planRiftSpawns } from './spawn_gen';
import type {
  RiftFloorPlan,
  RiftObjectPlan,
  RiftPlan,
  RiftRank,
  RiftStyle,
} from './types';

/** A rift runs three to six floors, ending on a boss floor. */
export const RIFT_MIN_FLOORS = 3;
export const RIFT_MAX_FLOORS = 6;

// Independent seed streams. Each derived quantity gets its OWN salt, so adding a
// draw to one never shifts another (floor count cannot move the theme, a theme
// cannot move a floor's layout). The salts avoid the constants the delve
// generator already uses (sim.ts: 0x5a11c0de, 0x600dc0ff, 7919).
const SALT_FLOOR_COUNT = 0x510f;
const SALT_NAME = 0x9a3e;
const SALT_THEME = 0x7000;
const SALT_FLOOR = 0xf100;

/** Mix a descriptor field into an independent seed stream (a finalizing avalanche
 * hash, so neighbouring salts give unrelated streams). Pure. */
export function mixSeed(seed: number, salt: number): number {
  let h = ((seed >>> 0) ^ Math.imul(salt | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** How many floors this rift runs. Pure over the descriptor. */
export function riftFloorCount(seed: number): number {
  return new Rng(mixSeed(seed, SALT_FLOOR_COUNT)).int(RIFT_MIN_FLOORS, RIFT_MAX_FLOORS);
}

/** The theme of one floor. Each floor draws from its OWN stream, so a single
 * rift descends through wildly different environments and two rifts that share a
 * floor count still look nothing alike. */
export function riftThemeForFloor(seed: number, floorIndex: number): RiftTheme {
  return new Rng(mixSeed(seed, SALT_THEME + floorIndex)).pick(RIFT_THEMES as RiftTheme[]);
}

/** Which of a boss's optional mechanics are LIVE at this rank. C shows one, S
 * shows the whole kit; the runtime wave suppresses the rest at fire time. */
export function riftBossMechanicsAt(themeId: string, rank: RiftRank): RiftBossMechanicKey[] {
  const theme = RIFT_THEME_BY_ID[themeId];
  if (!theme) return [];
  return theme.bossMechanics.slice(0, RIFT_RANK_MECHANIC_BUDGET[rank]);
}

function buildStyle(theme: RiftTheme): RiftStyle {
  return {
    themeId: theme.id,
    kit: theme.kit,
    torch: { ...theme.torch },
    fog: { ...theme.fog },
    wallTint: theme.wallTint,
    floorTint: theme.floorTint,
  };
}

/** The rift as a whole: rank, name ids, and how deep it runs. */
export function generateRiftPlan(seed: number, baseLevel: number): RiftPlan {
  const floorCount = riftFloorCount(seed);
  const bossTheme = riftThemeForFloor(seed, floorCount - 1);
  const nameRng = new Rng(mixSeed(seed, SALT_NAME));
  return {
    seed: seed >>> 0,
    baseLevel: Math.round(baseLevel),
    rank: riftRankForBaseLevel(baseLevel),
    nameId: {
      nounId: nameRng.pick(bossTheme.nounIds as string[]),
      suffixId: nameRng.pick(RIFT_SUFFIX_IDS as string[]),
    },
    themeId: bossTheme.id,
    floorCount,
  };
}

/**
 * Build one floor from scratch. PURE and uncached: the same descriptor always
 * yields a structurally identical plan, on any host, in any order, with no
 * dependence on what was generated before it.
 *
 * `generateRiftFloor` is the memoised wrapper callers should use. This unmemoised
 * entry point exists so a determinism test can compare two INDEPENDENT builds
 * rather than comparing a cached object with itself, which would pass whether the
 * generator were deterministic or not.
 */
export function buildRiftFloor(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): RiftFloorPlan {
  const floorCount = riftFloorCount(seed);
  const index = Math.max(0, Math.min(floorCount - 1, Math.floor(floorIndex)));
  const isBoss = index === floorCount - 1;
  const theme = riftThemeForFloor(seed, index);
  const rank = riftRankForBaseLevel(baseLevel);
  const floorLevel = riftFloorLevel(baseLevel, index);

  // ONE local Rng for the whole floor. Every planner below shares it, so the
  // draw order here is a frozen contract: reordering these calls regenerates
  // every existing seed into a different dungeon.
  const rng = new Rng(mixSeed(seed, SALT_FLOOR + index));

  const geo = buildRiftLayout(rng, isBoss);
  // The mechanic runs BEFORE spawns: an ice floor turns its blocker rocks into
  // real pillars, and every later placement must see them.
  const mech = planRiftMechanic(rng, geo, isBoss);
  const spawns = planRiftSpawns(rng, theme, geo, floorLevel, isBoss);

  const { layout } = geo;
  const objects: RiftObjectPlan[] = [
    // The way out, at the arrival point. A run is never a dead end.
    { kind: 'beacon', x: 0, z: riftEntryZ(layout), nameId: 'rift.object.beacon' },
    ...mech.objects,
  ];

  if (isBoss) {
    objects.push({
      kind: 'chest',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r * 0.6),
      nameId: 'rift.object.chest',
    });
    // The exit's POSITION is content, so it belongs in the plan; the runtime
    // only makes it usable once the boss falls, which is what seals the rift.
    objects.push({
      kind: 'exit',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r + 3),
      nameId: 'rift.object.exit',
    });
  } else {
    objects.push({
      kind: 'descent',
      x: 0,
      z: layout.dais.z + Math.round(layout.dais.r + 2),
      nameId: 'rift.object.descent',
    });
  }

  // Off-path treasure, tucked against a wall away from the aisle. Rolled LAST so
  // changing or removing it cannot shift anything above it.
  if (!isBoss && rng.chance(0.45)) {
    const side = rng.chance(0.5) ? -1 : 1;
    const zT = Math.round(layout.zMin + rng.range(32, Math.max(32, layout.dais.z - 26)));
    const localW = geo.walkHalfAt(zT);
    if (localW >= 12) {
      const p = toClear(geo.colliders, side * (localW - 4), zT, 1.0);
      objects.push({ kind: 'treasure', x: p.x, z: p.z, nameId: 'rift.object.treasure' });
    }
  }

  return {
    seed: seed >>> 0,
    baseLevel: Math.round(baseLevel),
    rank,
    floorIndex: index,
    floorCount,
    isBoss,
    nameId: isBoss ? 'rift.floor.sanctum' : 'rift.floor.reaches',
    themeId: theme.id,
    layout,
    style: buildStyle(theme),
    entry: { x: 0, z: riftEntryZ(layout) },
    spawns,
    objects,
    mechanic: mech.mechanic,
    iceZone: mech.iceZone,
    gate: mech.gate,
    floorLevel,
  };
}

// ---------------------------------------------------------------------------
// Memoised access
// ---------------------------------------------------------------------------

const FLOOR_CACHE = new Map<string, RiftFloorPlan>();
const CACHE_LIMIT = 128;

/** Freeze a plan before it enters the memo table. A cached plan is handed to
 * many callers (the sim spawn path, the renderer every frame); if one of them
 * pushed a pillar or moved a spawn, every later reader would see a DIFFERENT
 * dungeon for the same descriptor and the hosts would silently disagree. The
 * generator's whole contract is that a descriptor names one fixed dungeon, so a
 * caller mutating a generated floor is always a bug, and this makes it a loud
 * one instead of a desync. Only the containers that generation itself builds
 * need freezing; the numeric leaves are immutable already. */
function freezePlan(plan: RiftFloorPlan): RiftFloorPlan {
  const l = plan.layout;
  Object.freeze(l.pillars);
  Object.freeze(l.tombs);
  Object.freeze(l.stubs);
  if (l.clutter) Object.freeze(l.clutter);
  Object.freeze(l.dais);
  Object.freeze(l);
  for (const s of plan.spawns) Object.freeze(s);
  Object.freeze(plan.spawns);
  for (const o of plan.objects) Object.freeze(o);
  Object.freeze(plan.objects);
  Object.freeze(plan.style.torch);
  Object.freeze(plan.style.fog);
  Object.freeze(plan.style);
  Object.freeze(plan.mechanic);
  Object.freeze(plan.entry);
  if (plan.iceZone) Object.freeze(plan.iceZone);
  if (plan.gate) Object.freeze(plan.gate);
  return Object.freeze(plan);
}

/** A fully-resolved floor, memoised and frozen. Both the sim spawn path and the
 * renderer regenerate the same floor repeatedly (the renderer per frame), so the
 * cache is a real cost saving and not premature. Use `buildRiftFloor` when you
 * need a fresh mutable copy. */
export function generateRiftFloor(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): RiftFloorPlan {
  const key = `${seed >>> 0}:${Math.round(baseLevel)}:${Math.floor(floorIndex)}`;
  const hit = FLOOR_CACHE.get(key);
  if (hit) return hit;
  const plan = freezePlan(buildRiftFloor(seed, baseLevel, floorIndex));
  if (FLOOR_CACHE.size >= CACHE_LIMIT) FLOOR_CACHE.clear();
  FLOOR_CACHE.set(key, plan);
  return plan;
}

/** Drop the memo table. For tests and for a host that wants the memory back. */
export function clearRiftFloorCache(): void {
  FLOOR_CACHE.clear();
}

/** Instance-local collider set for a rift floor. This is the SAME
 * `layoutColliders` every hand-authored interior goes through, which is what
 * makes a generated room walkable with no change to sim/colliders.ts. */
export function riftFloorColliders(
  seed: number,
  baseLevel: number,
  floorIndex: number,
): Collider[] {
  return layoutColliders(generateRiftFloor(seed, baseLevel, floorIndex).layout);
}
