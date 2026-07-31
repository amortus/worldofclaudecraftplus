// Rift rank (C/B/A/S): the ONE place a descriptor's `baseLevel` becomes
// difficulty. Every consumer (the generator's mob levels, the spawn-time stat
// transform, the mechanic budget) derives the same rank from the same
// descriptor, so the authoritative server, the offline Sim and the headless env
// all regenerate identical difficulty from the wire descriptor.
//
// Pure leaf: types only, no `data.ts` import, no sim state. A Vitest imports it
// directly.

import type { MobTemplate } from '../types';
import type { RiftRank, RiftSpawnRole } from './types';

/** Canonical rank -> descriptor `baseLevel`. The baseLevel IS the rank encoding
 * on the wire, so a rift needs no second difficulty field. */
export const RIFT_RANK_BASE_LEVEL: Record<RiftRank, number> = { C: 20, B: 22, A: 25, S: 28 };

/** The rank a descriptor `baseLevel` encodes (the inverse of the map above,
 * banded so any level lands in the nearest rank). */
export function riftRankForBaseLevel(baseLevel: number): RiftRank {
  const rounded = Math.round(baseLevel);
  if (rounded >= RIFT_RANK_BASE_LEVEL.S) return 'S';
  if (rounded >= RIFT_RANK_BASE_LEVEL.A) return 'A';
  if (rounded >= RIFT_RANK_BASE_LEVEL.B) return 'B';
  return 'C';
}

// Mob levels. Our player cap is 20 (types.ts MAX_LEVEL) and the highest level any
// hand-authored mob in this fork spawns at is 22 (The Ash-Marshal, the last
// Claudeholme boss), so 22 is the ceiling here too: a rift never introduces a mob
// level the rest of the game has never seen, which keeps con colours, XP and the
// hit table on ground the existing content already walks. C ramps 20 -> 22 across
// its floors; B, A and S sit at the 22 cap on every floor and take ALL of their
// extra difficulty from the stat transform below.
//
// (Upstream nudges its S rank to 23. We deliberately do not: 22 is our ceiling,
// and inventing a level nothing else in the fork uses would silently change
// level-difference math for one content type only.)
export const RIFT_MAX_MOB_LEVEL = 22;

/** Mob level for a floor: `baseLevel + floorIndex`, clamped to the ceiling. */
export function riftFloorLevel(baseLevel: number, floorIndex: number): number {
  return Math.max(1, Math.min(RIFT_MAX_MOB_LEVEL, Math.round(baseLevel) + floorIndex));
}

/** How many of a boss's optional mechanics are live at each rank. C shows one
 * thing, S shows the full kit; this is the second difficulty axis after stats,
 * and it is what makes an S boss read differently rather than just bigger. */
export const RIFT_RANK_MECHANIC_BUDGET: Record<RiftRank, number> = { C: 1, B: 2, A: 3, S: 4 };

/** Anti-kite move-speed floor at B and above. Player RUN_SPEED is 7
 * (sim/types.ts); our raid trash already runs at 10 and Claudeholme's at 6.2-7.2,
 * so 8 is a modest "you cannot walk away from this" floor rather than a new
 * speed class. C stays at each template's own speed: it is the normal-dungeon
 * rung and is meant to stay kiteable. */
export const RIFT_MIN_MOVE_SPEED = 8;

export interface RiftRankTuning {
  /** Spawn-list trash, including the dais guards flanking a boss. */
  healthMultiplier: number;
  damageMultiplier: number;
  /** The floor boss. Split from trash because one multiplier cannot serve both:
   * a rift runs ~10 packs, so an 8x trash pool would be a grind, while the boss
   * needs exactly that growth to stay a wall. */
  bossHealthMultiplier: number;
  bossDamageMultiplier: number;
  /** Boss-summoned add waves ride the trash health pool (they are wave pressure,
   * not extra bosses) but take their own softer damage line. */
  addDamageMultiplier: number;
  armorMultiplier: number;
  /** 0 keeps each template's own speed. */
  minMoveSpeed: number;
}

// ---------------------------------------------------------------------------
// Calibration, against OUR content, not upstream's.
//
// The rift mob templates in content/rift/mobs.ts are authored ON the C line, so
// every C multiplier is exactly 1.0 and the ladder above it is easy to read.
// Effective HP in this sim is (hpBase + hpPerLevel * level), then ~2.3x for an
// elite; effective damage is (dmgBase + dmgPerLevel * level), then ~1.5x elite
// (sim/types.ts MobTemplate.elite). The reference points, all real numbers from
// src/sim/content/:
//
//   five-man L20 elite trash (Sanctum Boneguard)   ~1,205 hp     ~99 dmg
//   five-man L20 boss        (Korzul)              ~3,174 hp    ~113 dmg
//   L20-22 dungeon trash     (Claudeholme roster)  ~810 hp       ~83 dmg
//   L20-22 dungeon boss      (The Ash-Marshal)     ~3,290 hp    ~171 dmg
//   raid trash               (Risen Royal Guard)   ~1,633 hp    ~207 dmg
//   raid boss                (Nythraxis)          ~51,239 hp    ~423 dmg
//
// Targets, in that same currency:
//   C  a normal five-man rung: boss on Korzul's line (~3,200 hp), trash ~1,300.
//   B  a hard five-man: boss ~7,100 (a ~2.2x longer fight, not a harder swing).
//   A  boss ~14,300; trash grows only 1.9x, so the rank's length lives in the
//      BOSS rather than in a longer trash grind.
//   S  boss ~28,000, roughly 55% of the ten-player raid boss. An S rift is meant
//      to be the hardest FIVE-player content in the fork and to sit clearly
//      below Claudexxaramas, not to eclipse it. Its trash lands ~3,400 and its
//      swings ~212, i.e. raid-trash class, which is the intended ceiling.
//
// Damage climbs far more slowly than health at every rank on purpose: the
// difference between C and S should be a healer-mana and mechanic-execution race
// over a long fight, not a swing that deletes a tank outright.
// ---------------------------------------------------------------------------

export const RIFT_RANK_TUNING: Record<RiftRank, RiftRankTuning> = {
  C: {
    healthMultiplier: 1.0,
    damageMultiplier: 1.0,
    bossHealthMultiplier: 1.0,
    bossDamageMultiplier: 1.0,
    addDamageMultiplier: 1.0,
    armorMultiplier: 1.0,
    minMoveSpeed: 0,
  },
  B: {
    healthMultiplier: 1.5,
    damageMultiplier: 1.35,
    bossHealthMultiplier: 2.2,
    bossDamageMultiplier: 1.3,
    addDamageMultiplier: 1.15,
    armorMultiplier: 1.12,
    minMoveSpeed: RIFT_MIN_MOVE_SPEED,
  },
  A: {
    healthMultiplier: 1.9,
    damageMultiplier: 1.6,
    bossHealthMultiplier: 4.4,
    bossDamageMultiplier: 1.55,
    addDamageMultiplier: 1.3,
    armorMultiplier: 1.25,
    minMoveSpeed: RIFT_MIN_MOVE_SPEED,
  },
  S: {
    healthMultiplier: 2.3,
    damageMultiplier: 1.8,
    bossHealthMultiplier: 8.6,
    bossDamageMultiplier: 1.75,
    addDamageMultiplier: 1.45,
    armorMultiplier: 1.4,
    minMoveSpeed: RIFT_MIN_MOVE_SPEED,
  },
};

/** The tuning a descriptor `baseLevel` resolves to. Never null: every rift mob
 * takes a transform, and at C every multiplier is 1.0. */
export function riftRankTuningFor(baseLevel: number): RiftRankTuning {
  return RIFT_RANK_TUNING[riftRankForBaseLevel(baseLevel)];
}

export function riftRoleHealthMultiplier(tuning: RiftRankTuning, role: RiftSpawnRole): number {
  return role === 'boss' ? tuning.bossHealthMultiplier : tuning.healthMultiplier;
}

export function riftRoleDamageMultiplier(tuning: RiftRankTuning, role: RiftSpawnRole): number {
  if (role === 'boss') return tuning.bossDamageMultiplier;
  if (role === 'add') return tuning.addDamageMultiplier;
  return tuning.damageMultiplier;
}

/** The spawn-time stat transform for one rift mob. Pure: it returns a NEW
 * template and never mutates the shared `MOBS` row, so a rift can never leak its
 * rank scaling into the overworld copy of a shared creature. */
export function riftRankTemplate(
  template: MobTemplate,
  tuning: RiftRankTuning,
  role: RiftSpawnRole,
): MobTemplate {
  const hp = riftRoleHealthMultiplier(tuning, role);
  const dmg = riftRoleDamageMultiplier(tuning, role);
  return {
    ...template,
    hpBase: template.hpBase * hp,
    hpPerLevel: template.hpPerLevel * hp,
    dmgBase: template.dmgBase * dmg,
    dmgPerLevel: template.dmgPerLevel * dmg,
    armorPerLevel: template.armorPerLevel * tuning.armorMultiplier,
    moveSpeed: Math.max(template.moveSpeed, tuning.minMoveSpeed),
  };
}
