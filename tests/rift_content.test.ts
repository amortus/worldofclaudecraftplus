import { describe, expect, it } from 'vitest';
import { RIFT_ADD_IDS, RIFT_BOSS_IDS, RIFT_MOBS, RIFT_THEMES, RIFT_TRASH_IDS } from '../src/sim/content/rift';
import { MOBS } from '../src/sim/data';
import {
  RIFT_MAX_MOB_LEVEL,
  RIFT_MIN_MOVE_SPEED,
  RIFT_RANK_BASE_LEVEL,
  RIFT_RANK_MECHANIC_BUDGET,
  RIFT_RANK_TUNING,
  riftBossMechanicsAt,
  riftFloorCount,
  riftFloorLevel,
  riftRankForBaseLevel,
  riftRankTemplate,
  riftRankTuningFor,
  buildRiftFloor,
  type RiftRank,
} from '../src/sim/rift';
import type { MobTemplate } from '../src/sim/types';

const RANKS: RiftRank[] = ['C', 'B', 'A', 'S'];

// The sim's own derivation (src/sim/entity.ts): hp and damage are per level-1,
// and elites take ~2.3x health / ~1.5x damage.
const effHp = (t: MobTemplate, level: number) =>
  (t.hpBase + t.hpPerLevel * (level - 1)) * (t.elite ? 2.3 : 1);
const effDmg = (t: MobTemplate, level: number) =>
  (t.dmgBase + t.dmgPerLevel * (level - 1)) * (t.elite ? 1.5 : 1);

describe('rift content tables', () => {
  it('every rift template id is unique and does not collide with existing MOBS', () => {
    const ids = Object.keys(RIFT_MOBS);
    expect(new Set(ids).size).toBe(ids.length);
    // data.ts merges mob tables by spread, so a duplicate id would silently
    // overwrite an existing creature.
    for (const id of ids) expect(MOBS[id], `${id} already exists in MOBS`).toBeUndefined();
    expect(ids.every((id) => id.startsWith('rift_'))).toBe(true);
  });

  it('has eight themes, each with a distinct id, kit, roster and boss', () => {
    expect(RIFT_THEMES).toHaveLength(8);
    expect(new Set(RIFT_THEMES.map((t) => t.id)).size).toBe(8);
    expect(new Set(RIFT_THEMES.map((t) => t.boss)).size).toBe(8);
    for (const t of RIFT_THEMES) {
      expect(['crypt', 'sanctum', 'temple']).toContain(t.kit);
      expect(t.nounIds.length).toBeGreaterThanOrEqual(3);
      expect(t.nameId.startsWith('rift.theme.')).toBe(true);
      for (const n of t.nounIds) expect(n.startsWith('rift.noun.')).toBe(true);
    }
    // Every authored template is actually used by some theme.
    const used = new Set(RIFT_THEMES.flatMap((t) => [...t.trash, t.boss]));
    for (const id of [...RIFT_TRASH_IDS, ...RIFT_BOSS_IDS]) expect(used.has(id)).toBe(true);
  });

  it('reaches every boss-summoned add from a boss that can summon it', () => {
    const summoned = new Set(
      RIFT_BOSS_IDS.map((id) => RIFT_MOBS[id].summonAdds?.mobId).filter(Boolean) as string[],
    );
    for (const addId of RIFT_ADD_IDS) expect(summoned.has(addId)).toBe(true);
    for (const id of summoned) expect(RIFT_MOBS[id]).toBeDefined();
  });

  it('spawn-list trash is elite, adds are not, and adds carry no loot', () => {
    for (const id of RIFT_TRASH_IDS) expect(RIFT_MOBS[id].elite).toBe(true);
    for (const id of RIFT_ADD_IDS) {
      expect(RIFT_MOBS[id].elite).toBeUndefined();
      expect(RIFT_MOBS[id].loot).toEqual([]);
    }
  });

  it('renders bosses as giga-bosses between Korzul (1.8) and Nythraxis (3.1)', () => {
    for (const id of RIFT_BOSS_IDS) {
      const b = RIFT_MOBS[id];
      expect(b.boss).toBe(true);
      expect(b.elite).toBe(true);
      expect(b.ccImmune).toBe(true);
      expect(b.scale).toBeGreaterThanOrEqual(2.4);
      expect(b.scale).toBeLessThanOrEqual(3.3);
    }
  });

  it('spawns only in our real level band (nothing above the fork ceiling of 22)', () => {
    for (const t of Object.values(RIFT_MOBS)) {
      expect(t.minLevel).toBeGreaterThanOrEqual(20);
      expect(t.maxLevel).toBeLessThanOrEqual(RIFT_MAX_MOB_LEVEL);
    }
  });
});

// ---------------------------------------------------------------------------
// Stat budget, checked against the real numbers this content was anchored on.
// ---------------------------------------------------------------------------

describe('rift stat budget vs our level-20 content', () => {
  // Real templates from src/sim/content/dungeons.ts.
  const korzul = MOBS.korzul_the_gravewyrm;
  const boneguard = MOBS.sanctum_boneguard;
  const nythraxis = MOBS.nythraxis_scourge_of_thornpeak;

  it('puts C-rank trash on the five-man elite line', () => {
    const ref = effHp(boneguard, 20);
    for (const id of RIFT_TRASH_IDS) {
      const hp = effHp(riftRankTemplate(RIFT_MOBS[id], RIFT_RANK_TUNING.C, 'trash'), 20);
      expect(hp).toBeGreaterThan(ref * 0.95);
      expect(hp).toBeLessThan(ref * 1.35);
    }
  });

  it('puts a C-rank boss on Korzul his own line', () => {
    const ref = effHp(korzul, 20);
    for (const id of RIFT_BOSS_IDS) {
      const t = riftRankTemplate(RIFT_MOBS[id], RIFT_RANK_TUNING.C, 'boss');
      expect(effHp(t, 20)).toBeGreaterThan(ref * 0.95);
      expect(effHp(t, 20)).toBeLessThan(ref * 1.2);
      expect(effDmg(t, 20)).toBeGreaterThan(effDmg(korzul, 20) * 0.9);
      expect(effDmg(t, 20)).toBeLessThan(effDmg(korzul, 20) * 1.25);
    }
  });

  it('keeps the hardest S-rank boss clearly below the ten-player raid boss', () => {
    const raid = effHp(nythraxis, 20);
    for (const id of RIFT_BOSS_IDS) {
      const t = riftRankTemplate(RIFT_MOBS[id], RIFT_RANK_TUNING.S, 'boss');
      const hp = effHp(t, RIFT_MAX_MOB_LEVEL);
      expect(hp).toBeGreaterThan(20_000); // a real S-rank wall
      expect(hp).toBeLessThan(raid * 0.8); // but never eclipses Claudexxaramas
      // Damage climbs far more slowly than health: an S rift is a long fight,
      // not a swing that deletes a tank.
      expect(effDmg(t, RIFT_MAX_MOB_LEVEL)).toBeLessThan(effDmg(nythraxis, 20));
    }
  });

  it('keeps S-rank trash at or below raid-trash class', () => {
    const raidTrash = effDmg(MOBS.nythraxis_skeleton_warrior, 20);
    for (const id of RIFT_TRASH_IDS) {
      const t = riftRankTemplate(RIFT_MOBS[id], RIFT_RANK_TUNING.S, 'trash');
      expect(effDmg(t, RIFT_MAX_MOB_LEVEL)).toBeLessThanOrEqual(raidTrash * 1.15);
    }
  });

  it('never exceeds the game-wide armour ceiling', () => {
    for (const id of Object.keys(RIFT_MOBS)) {
      const t = riftRankTemplate(RIFT_MOBS[id], RIFT_RANK_TUNING.S, 'boss');
      expect(t.armorPerLevel).toBeLessThanOrEqual(55);
    }
  });
});

// ---------------------------------------------------------------------------
// The rank ladder
// ---------------------------------------------------------------------------

describe('rift rank ladder', () => {
  it('maps baseLevel to rank and back', () => {
    for (const rank of RANKS) {
      expect(riftRankForBaseLevel(RIFT_RANK_BASE_LEVEL[rank])).toBe(rank);
    }
    expect(riftRankForBaseLevel(1)).toBe('C');
    expect(riftRankForBaseLevel(21)).toBe('C');
    expect(riftRankForBaseLevel(99)).toBe('S');
  });

  it('is monotonic in every difficulty dial', () => {
    const keys = [
      'healthMultiplier',
      'damageMultiplier',
      'bossHealthMultiplier',
      'bossDamageMultiplier',
      'addDamageMultiplier',
      'armorMultiplier',
    ] as const;
    for (let i = 1; i < RANKS.length; i++) {
      const lo = RIFT_RANK_TUNING[RANKS[i - 1]];
      const hi = RIFT_RANK_TUNING[RANKS[i]];
      for (const k of keys) expect(hi[k], `${k} at ${RANKS[i]}`).toBeGreaterThan(lo[k]);
    }
  });

  it('makes C exactly the authored line (all multipliers 1.0)', () => {
    const c = RIFT_RANK_TUNING.C;
    expect(c.healthMultiplier).toBe(1);
    expect(c.damageMultiplier).toBe(1);
    expect(c.bossHealthMultiplier).toBe(1);
    expect(c.bossDamageMultiplier).toBe(1);
    expect(c.armorMultiplier).toBe(1);
    // C is the normal-dungeon rung and stays kiteable.
    expect(c.minMoveSpeed).toBe(0);
    for (const rank of ['B', 'A', 'S'] as RiftRank[]) {
      expect(RIFT_RANK_TUNING[rank].minMoveSpeed).toBe(RIFT_MIN_MOVE_SPEED);
    }
  });

  it('leaves a template untouched at C and never mutates the shared row', () => {
    const src = RIFT_MOBS.rift_boss_frost;
    const before = JSON.stringify(src);
    const out = riftRankTemplate(src, riftRankTuningFor(RIFT_RANK_BASE_LEVEL.C), 'boss');
    expect(out).not.toBe(src);
    expect(out).toEqual({ ...src, moveSpeed: src.moveSpeed });
    expect(JSON.stringify(src)).toBe(before);
  });

  it('ramps C mob levels and holds B/A/S at the ceiling', () => {
    expect(riftFloorLevel(RIFT_RANK_BASE_LEVEL.C, 0)).toBe(20);
    expect(riftFloorLevel(RIFT_RANK_BASE_LEVEL.C, 1)).toBe(21);
    expect(riftFloorLevel(RIFT_RANK_BASE_LEVEL.C, 2)).toBe(22);
    expect(riftFloorLevel(RIFT_RANK_BASE_LEVEL.C, 5)).toBe(RIFT_MAX_MOB_LEVEL);
    for (const rank of ['B', 'A', 'S'] as RiftRank[]) {
      for (let i = 0; i < 6; i++) {
        expect(riftFloorLevel(RIFT_RANK_BASE_LEVEL[rank], i)).toBe(RIFT_MAX_MOB_LEVEL);
      }
    }
  });

  it('spends the boss mechanic budget from C up to S', () => {
    for (const theme of RIFT_THEMES) {
      let prev = 0;
      for (const rank of RANKS) {
        const live = riftBossMechanicsAt(theme.id, rank);
        expect(live.length).toBeGreaterThanOrEqual(prev);
        expect(live.length).toBeLessThanOrEqual(RIFT_RANK_MECHANIC_BUDGET[rank]);
        expect(live).toEqual(theme.bossMechanics.slice(0, live.length));
        // Every live key is a mechanic the template actually carries.
        for (const key of live) expect(RIFT_MOBS[theme.boss][key]).toBeDefined();
        prev = live.length;
      }
      expect(riftBossMechanicsAt(theme.id, 'C')).toHaveLength(1);
      expect(riftBossMechanicsAt(theme.id, 'S')).toEqual(theme.bossMechanics);
    }
    expect(riftBossMechanicsAt('not_a_theme', 'S')).toEqual([]);
  });

  it('resolves every generated floor to a real, existing template', () => {
    for (const seed of [3, 11, 77, 909, 65535]) {
      for (const baseLevel of Object.values(RIFT_RANK_BASE_LEVEL)) {
        const count = riftFloorCount(seed);
        for (let i = 0; i < count; i++) {
          const f = buildRiftFloor(seed, baseLevel, i);
          expect(f.floorLevel).toBeLessThanOrEqual(RIFT_MAX_MOB_LEVEL);
          for (const s of f.spawns) {
            const t = RIFT_MOBS[s.templateId];
            expect(t, `${s.templateId} missing`).toBeDefined();
            expect(s.level).toBeGreaterThanOrEqual(t.minLevel);
            expect(s.level).toBeLessThanOrEqual(t.maxLevel);
            expect(riftRankTemplate(t, riftRankTuningFor(baseLevel), s.role)).toBeDefined();
          }
        }
      }
    }
  });
});
