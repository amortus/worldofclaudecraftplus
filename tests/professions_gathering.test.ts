import { describe, expect, it } from 'vitest';
import {
  applyProficiencyGain,
  beginHarvest,
  emptyGatheringProficiency,
  GATHER_CAST_BASE_SEC,
  GATHER_CAST_FLOOR_SEC,
  GATHER_GAIN_TIER_STEP,
  type GatherAttempt,
  gatherCapabilityTier,
  gatherCastDurationSec,
  gatheringSkillsView,
  gatherNodeGainMultiplier,
  gatherSkillGain,
  MASTERY_MULTIPLIERS,
  masteryStateFor,
  MATERIAL_RARITY_MAX_PROFICIENCY,
  NODE_HARVEST_TABLE,
  normalizeGatheringProficiency,
  professionForNodeType,
  resolveHarvest,
  rollMaterialRarity,
  tierProgressMultiplier,
} from '../src/sim/professions';
import type { GatherNodeDef, GatherMaterialRow, MaterialRarity } from '../src/sim/professions';
import { Rng } from '../src/sim/rng';

const MAX = 100;

const node = (tier: number, type: GatherNodeDef['type'] = 'ore'): GatherNodeDef => ({
  id: `n_${type}_${tier}`,
  zoneId: 'eastbrook_vale',
  type,
  pos: { x: 0, z: 0 },
  tier,
  level: 4,
  objectName: 'Copper Vein',
});

const material: GatherMaterialRow = {
  itemId: 'copper_ore',
  qtyByRarity: { common: 1, uncommon: 2, rare: 2, epic: 3, legendary: 4 },
};

const attempt = (over: Partial<GatherAttempt> = {}): GatherAttempt => ({
  node: node(1),
  proficiency: 0,
  maxSkill: MAX,
  toolTier: 1,
  readyAt: undefined,
  now: 0,
  ...over,
});

describe('the four-state mastery curve', () => {
  it('has exactly four states, 1 / 0.5 / 0.25 / 0', () => {
    expect(MASTERY_MULTIPLIERS).toEqual([1, 0.5, 0.25, 0]);
  });

  it('scores every gap onto one of the four states', () => {
    expect(tierProgressMultiplier(0, 3)).toBe(1); // content above capability
    expect(tierProgressMultiplier(2, 2)).toBe(1); // equal
    expect(tierProgressMultiplier(3, 2)).toBe(0.5); // one below
    expect(tierProgressMultiplier(4, 2)).toBe(0.25); // two below
    expect(tierProgressMultiplier(5, 2)).toBe(0); // three below
    expect(tierProgressMultiplier(9, 2)).toBe(0); // and stays there
  });

  it('names the state for the client', () => {
    expect(masteryStateFor(2, 2)).toBe('full');
    expect(masteryStateFor(3, 2)).toBe('reduced');
    expect(masteryStateFor(4, 2)).toBe('minimal');
    expect(masteryStateFor(7, 2)).toBe('none');
  });
});

describe('gather proficiency gain walks the curve as skill rises', () => {
  // A tier-1 node sits on curve rung 0, so it passes through all four states
  // as the miner climbs: full below 25, half to 50, a quarter to 75, then
  // nothing at all, forever.
  it.each([
    [0, 1],
    [24, 1],
    [25, 0.5],
    [49, 0.5],
    [50, 0.25],
    [74, 0.25],
    [75, 0],
    [99, 0],
  ])('proficiency %i on a tier-1 node gains %d', (prof, mult) => {
    expect(gatherNodeGainMultiplier(prof, 1)).toBe(mult);
  });

  it('a tier-1 node stops granting skill forever once outgrown', () => {
    expect(gatherSkillGain(75, 1, MAX)).toBe(0);
    expect(gatherSkillGain(99, 1, MAX)).toBe(0);
  });

  it('a higher-tier node still pays full at a proficiency that grays tier 1', () => {
    expect(gatherNodeGainMultiplier(75, 1)).toBe(0);
    expect(gatherNodeGainMultiplier(75, 4)).toBe(1);
  });

  it('buckets capability at one tier per step', () => {
    expect(GATHER_GAIN_TIER_STEP).toBe(25);
    expect(gatherCapabilityTier(0)).toBe(0);
    expect(gatherCapabilityTier(24)).toBe(0);
    expect(gatherCapabilityTier(25)).toBe(1);
    expect(gatherCapabilityTier(100)).toBe(4);
    expect(gatherCapabilityTier(-5)).toBe(0);
  });
});

describe('the per-profession cap', () => {
  it('clamps a gain that would overshoot', () => {
    expect(applyProficiencyGain(99.5, 1, MAX)).toBe(MAX);
    expect(applyProficiencyGain(MAX, 1, MAX)).toBe(MAX);
  });

  it('grants nothing at the cap', () => {
    expect(gatherSkillGain(MAX, 4, MAX)).toBe(0);
  });

  it('grants only the remainder at the boundary', () => {
    expect(gatherSkillGain(99.5, 4, MAX)).toBeCloseTo(0.5, 10);
  });

  it('honours fishing’s higher ceiling when it is the one passed in', () => {
    expect(applyProficiencyGain(150, 1, 200)).toBe(151);
    expect(applyProficiencyGain(200, 1, 200)).toBe(200);
  });
});

describe('gather cast duration', () => {
  it('is the base with a matching tool and no band', () => {
    expect(gatherCastDurationSec(1, 1, 0)).toBe(GATHER_CAST_BASE_SEC);
  });

  it('shortens 0.4 s per tool tier above the node', () => {
    expect(gatherCastDurationSec(1, 2, 0)).toBeCloseTo(2.1, 10);
    expect(gatherCastDurationSec(1, 3, 0)).toBeCloseTo(1.7, 10);
  });

  it('shortens 0.15 s per proficiency band', () => {
    expect(gatherCastDurationSec(2, 2, 1)).toBeCloseTo(2.35, 10);
    expect(gatherCastDurationSec(2, 2, 2)).toBeCloseTo(2.2, 10);
  });

  it('never drops below the floor', () => {
    expect(gatherCastDurationSec(1, 4, 2)).toBe(GATHER_CAST_FLOOR_SEC);
    expect(gatherCastDurationSec(1, 99, 2)).toBe(GATHER_CAST_FLOOR_SEC);
  });

  it('is monotone non-increasing in tool tier', () => {
    const at = (t: number) => gatherCastDurationSec(1, t, 0);
    expect(at(1)).toBeGreaterThanOrEqual(at(2));
    expect(at(2)).toBeGreaterThanOrEqual(at(3));
    expect(at(3)).toBeGreaterThanOrEqual(at(4));
  });
});

describe('tool gating at the harvest gate', () => {
  it('refuses a bare-handed player, naming the tier the node needs', () => {
    const r = beginHarvest(attempt({ toolTier: 0, node: node(2) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_tool');
    expect(r.requiredTier).toBe(2);
    expect(r.castSeconds).toBeUndefined();
  });

  it('refuses a tool below the node tier', () => {
    const r = beginHarvest(attempt({ toolTier: 2, node: node(3) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('tool_tier');
    expect(r.requiredTier).toBe(3);
  });

  it('accepts a tool at exactly the node tier, and above', () => {
    expect(beginHarvest(attempt({ toolTier: 3, node: node(3) })).ok).toBe(true);
    expect(beginHarvest(attempt({ toolTier: 4, node: node(3) })).ok).toBe(true);
  });

  it('returns a cast duration a host can assign to castTotal', () => {
    // one tier of tool headroom, band 1 at proficiency 40 of 100
    const r = beginHarvest(attempt({ toolTier: 2, node: node(1), proficiency: 40 }));
    expect(r.ok).toBe(true);
    expect(r.castSeconds).toBeCloseTo(2.5 - 0.4 - 0.15, 10);
  });

  it('clamps a fully kitted-out gatherer to the cast floor', () => {
    // two tiers of headroom plus band 2 would compute 1.4; the floor wins
    const r = beginHarvest(attempt({ toolTier: 3, node: node(1), proficiency: 90 }));
    expect(r.ok).toBe(true);
    expect(r.castSeconds).toBe(GATHER_CAST_FLOOR_SEC);
  });

  it('refuses a node still on this player’s own respawn timer', () => {
    const r = beginHarvest(attempt({ readyAt: 130, now: 100 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_ready');
    expect(r.readyInSec).toBe(30);
  });

  it('accepts once the timer has elapsed', () => {
    expect(beginHarvest(attempt({ readyAt: 130, now: 130 })).ok).toBe(true);
  });

  it('reports the tool problem before the timer problem', () => {
    const r = beginHarvest(attempt({ toolTier: 0, readyAt: 130, now: 100 }));
    expect(r.reason).toBe('no_tool');
  });

  it('maps each node type to its profession', () => {
    expect(professionForNodeType('ore')).toBe('mining');
    expect(professionForNodeType('wood')).toBe('logging');
    expect(professionForNodeType('herb')).toBe('herbalism');
  });
});

describe('material rarity roll', () => {
  it('is always common at proficiency 0', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 500; i++) expect(rollMaterialRarity(0, rng)).toBe('common');
  });

  it('uses exactly one draw', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    rollMaterialRarity(60, a);
    b.next();
    expect(a.next()).toBe(b.next());
  });

  it('never lowers a tier’s odds as proficiency rises', () => {
    const share = (prof: number, of: MaterialRarity) => {
      const rng = new Rng(99);
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (rollMaterialRarity(prof, rng) === of) hits++;
      return hits / 20000;
    };
    expect(share(50, 'uncommon')).toBeGreaterThan(share(10, 'uncommon'));
    expect(share(100, 'rare')).toBeGreaterThan(share(50, 'rare'));
    expect(share(100, 'common')).toBeLessThan(share(50, 'common'));
  });

  it('keeps legendary near 2% at the ceiling', () => {
    const rng = new Rng(5);
    let hits = 0;
    for (let i = 0; i < 40000; i++) {
      if (rollMaterialRarity(MATERIAL_RARITY_MAX_PROFICIENCY, rng) === 'legendary') hits++;
    }
    expect(hits / 40000).toBeGreaterThan(0.015);
    expect(hits / 40000).toBeLessThan(0.025);
  });

  it('pins a NaN proficiency to common rather than falling through to legendary', () => {
    const rng = new Rng(3);
    expect(rollMaterialRarity(Number.NaN, rng)).toBe('common');
  });
});

describe('resolveHarvest', () => {
  it('yields the zone material, the rolled quantity, and the respawn stamp', () => {
    const r = resolveHarvest(attempt({ now: 500 }), material, new Rng(11));
    expect(r.granted).toBe(true);
    expect(r.itemId).toBe('copper_ore');
    expect(r.professionId).toBe('mining');
    expect(r.rarity).toBe('common'); // proficiency 0
    expect(r.qty).toBe(1);
    expect(r.skillGain).toBe(1);
    expect(r.nextProficiency).toBe(1);
    expect(r.nextReadyAt).toBe(500 + NODE_HARVEST_TABLE.ore.respawnSeconds);
  });

  it('grants zero skill on a grayed-out node but still yields material', () => {
    const r = resolveHarvest(attempt({ proficiency: 80 }), material, new Rng(4));
    expect(r.skillGain).toBe(0);
    expect(r.nextProficiency).toBe(80);
    expect(r.qty).toBeGreaterThanOrEqual(1);
  });

  it('uses exactly one draw regardless of proficiency', () => {
    const a = new Rng(21);
    const b = new Rng(21);
    resolveHarvest(attempt({ proficiency: 0 }), material, a);
    resolveHarvest(attempt({ proficiency: 100 }), material, b);
    expect(a.next()).toBe(b.next());
  });

  it('is deterministic: the same seed gives the same yields', () => {
    const run = () => {
      const rng = new Rng(1234);
      const out: string[] = [];
      let prof = 0;
      for (let i = 0; i < 200; i++) {
        const r = resolveHarvest(attempt({ proficiency: prof, node: node(3) }), material, rng);
        prof = r.nextProficiency;
        out.push(`${r.rarity}:${r.qty}:${r.nextProficiency}`);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('two different seeds do diverge (the determinism check is not vacuous)', () => {
    const run = (seed: number) => {
      const rng = new Rng(seed);
      return Array.from(
        { length: 100 },
        () => resolveHarvest(attempt({ proficiency: 60 }), material, rng).rarity,
      ).join(',');
    };
    expect(run(1)).not.toEqual(run(2));
  });
});

describe('proficiency record helpers', () => {
  const caps = { mining: 100, logging: 100, herbalism: 100, fishing: 200 };

  it('starts every profession at zero', () => {
    expect(emptyGatheringProficiency()).toEqual({
      mining: 0,
      logging: 0,
      herbalism: 0,
      fishing: 0,
    });
  });

  it('loads a pre-feature save cleanly', () => {
    expect(normalizeGatheringProficiency(undefined, caps)).toEqual(emptyGatheringProficiency());
    expect(normalizeGatheringProficiency({}, caps)).toEqual(emptyGatheringProficiency());
  });

  it('drops junk and clamps to the cap', () => {
    const out = normalizeGatheringProficiency(
      { mining: 500, logging: -3, herbalism: Number.NaN, fishing: 150, bogus: 40 },
      caps,
    );
    expect(out).toEqual({ mining: 100, logging: 0, herbalism: 0, fishing: 150 });
    expect('bogus' in out).toBe(false);
  });

  it('renders a UI view of ids and numbers only', () => {
    const view = gatheringSkillsView({ mining: 30, logging: 0, herbalism: 0, fishing: 12 }, caps);
    expect(view).toEqual([
      { professionId: 'mining', skill: 30, maxSkill: 100 },
      { professionId: 'logging', skill: 0, maxSkill: 100 },
      { professionId: 'herbalism', skill: 0, maxSkill: 100 },
      { professionId: 'fishing', skill: 12, maxSkill: 200 },
    ]);
  });
});
