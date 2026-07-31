// Pure, host-agnostic view model for the Skills panel (the four gathering
// professions).
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts / stat_tooltip_view.ts). It owns the
// only things the panel actually decides: where each profession sits against
// its own ceiling, which proficiency band that buys, and which of the four
// mastery states each content tier is worth to that profession right now. The
// DOM/i18n side lives in skills_panel.ts and renders nothing this module did
// not already decide.
//
// DOM-free and i18n-free, so tests/skills_panel_view.test.ts drives it directly.
// Every number here is raw: the consumer runs each one through `formatNumber`.

import {
  canGatherTier,
  capabilityTierFor,
  effectiveFishingBand,
  FISHING_GAIN_TIER_STEP,
  GATHER_GAIN_TIER_STEP,
  type GatheringProficiency,
  type GatheringProfessionId,
  GATHERING_PROFESSION_IDS,
  gatheringSkillsView,
  type MasteryState,
  masteryStateFor,
  NO_TOOL_OWNED,
  type PlayerProfessionSkill,
  proficiencyBandFor,
} from '../sim/professions';

/** The content tiers a gatherer can work, one per zone. Index 0 is tier 1. */
export const GATHER_CONTENT_TIERS: readonly number[] = [1, 2, 3, 4];

/**
 * Points of proficiency per capability tier, per profession. Fishing rides the
 * same four-state curve at a wider step because it carries the deeper (200)
 * ceiling; see src/sim/professions/fishing.ts.
 */
export const PROFESSION_TIER_STEP: Readonly<Record<GatheringProfessionId, number>> = {
  mining: GATHER_GAIN_TIER_STEP,
  logging: GATHER_GAIN_TIER_STEP,
  herbalism: GATHER_GAIN_TIER_STEP,
  fishing: FISHING_GAIN_TIER_STEP,
};

/**
 * The classic skill-up colouring for the four mastery states: orange (this
 * still teaches you everything), yellow (half), green (a quarter), grey (it has
 * nothing left to teach). The greys and greens are lifted a little off the
 * literal classic values so every one of them clears 4.5:1 against the panel's
 * near-black surface (src/ui/CLAUDE.md accessibility floor).
 */
export const MASTERY_STATE_COLOR: Readonly<Record<MasteryState, string>> = {
  full: '#ff8040',
  reduced: '#ffe14d',
  minimal: '#5fd45f',
  none: '#9d9d9d',
};

/** The capability tier a profession's proficiency buys, on its own step. */
export function capabilityTierForProfession(
  professionId: GatheringProfessionId,
  proficiency: number,
): number {
  return capabilityTierFor(Math.max(0, proficiency), PROFESSION_TIER_STEP[professionId]);
}

/**
 * Which of the four mastery states working tier-`contentTier` content is worth
 * to this profession at this proficiency. A tier-T node or water sits on curve
 * rung T - 1, exactly as `gatherNodeGainMultiplier` scores it, so the panel can
 * never disagree with the gain the sim actually grants.
 */
export function masteryStateForContent(
  professionId: GatheringProfessionId,
  proficiency: number,
  contentTier: number,
): MasteryState {
  return masteryStateFor(
    capabilityTierForProfession(professionId, proficiency),
    Math.max(0, contentTier - 1),
  );
}

/** One profession's row in the panel. */
export interface SkillsPanelRow {
  professionId: GatheringProfessionId;
  /** Proficiency, clamped into [0, maxSkill] so a stale wire value cannot overfill a bar. */
  skill: number;
  maxSkill: number;
  /** Progress against the ceiling as a 0..1 fraction. */
  fraction: number;
  /** The same progress as a whole percent, 0..100 (the bar width and the aria value). */
  percent: number;
  /** True once the profession has hit its own ceiling. */
  capped: boolean;
  /** The 0/1/2 band the player's own proficiency earns. */
  band: 0 | 1 | 2;
  /**
   * The band that is actually IN EFFECT. For fishing this is
   * `min(proficiency band, rod tier - 1)`: a rod caps the catch table and the
   * sim applies that cap SILENTLY (no event, no denial, the cast just rolls off
   * a lower row). Surfacing it here is the only place a Master-standing angler
   * on a starter pole can find out why their catches never improved.
   */
  effectiveBand: 0 | 1 | 2;
  /** True when the carried tool, not the player, is what limits the band. */
  bandCappedByTool: boolean;
  /** Capability tier on the four-state mastery curve. */
  capabilityTier: number;
  /** Points still needed for the next capability tier; null at the cap. */
  pointsToNextTier: number | null;
  /** Best owned tool tier, or NO_TOOL_OWNED (0) when the player carries none. */
  toolTier: number;
  /** The highest content tier the owned tool can work; 0 with no tool. Always 0
   *  for fishing, which has no node tiers: any rod fishes any water. */
  workableTier: number;
  /** Mastery state per content tier, index-aligned with GATHER_CONTENT_TIERS. */
  tierStates: MasteryState[];
  /** True when no content tier teaches this profession anything any more. */
  exhausted: boolean;
}

export interface SkillsPanelView {
  rows: SkillsPanelRow[];
  /** Sum of every profession's proficiency, the panel's one headline number. */
  totalSkill: number;
  /** Sum of every profession's ceiling. */
  totalMaxSkill: number;
}

function clampSkill(skill: number, maxSkill: number): number {
  if (!(skill > 0)) return 0;
  return skill > maxSkill ? maxSkill : skill;
}

/** The highest content tier `toolTier` may work. Zero when no tool is carried. */
function workableTierFor(toolTier: number): number {
  if (toolTier === NO_TOOL_OWNED) return 0;
  let best = 0;
  for (const tier of GATHER_CONTENT_TIERS) if (canGatherTier(toolTier, tier)) best = tier;
  return best;
}

function buildRow(skill: PlayerProfessionSkill, toolTier: number): SkillsPanelRow {
  const maxSkill = skill.maxSkill;
  const value = clampSkill(skill.skill, maxSkill);
  const fraction = maxSkill > 0 ? value / maxSkill : 0;
  const step = PROFESSION_TIER_STEP[skill.professionId];
  const capabilityTier = capabilityTierForProfession(skill.professionId, value);
  const nextTierAt = (capabilityTier + 1) * step;
  const tierStates = GATHER_CONTENT_TIERS.map((tier) =>
    masteryStateForContent(skill.professionId, value, tier),
  );
  const band = proficiencyBandFor(value, maxSkill);
  // Only fishing has a rod-capped band; the node professions gate on tool TIER
  // (a hard denial the player already sees), so their effective band is their own.
  const effectiveBand =
    skill.professionId === 'fishing' ? effectiveFishingBand(value, toolTier, maxSkill) : band;
  return {
    professionId: skill.professionId,
    skill: value,
    maxSkill,
    fraction,
    percent: Math.round(fraction * 100),
    capped: value >= maxSkill,
    band,
    effectiveBand,
    bandCappedByTool: effectiveBand < band,
    capabilityTier,
    pointsToNextTier: nextTierAt > maxSkill ? null : nextTierAt - value,
    toolTier,
    workableTier: skill.professionId === 'fishing' ? 0 : workableTierFor(toolTier),
    tierStates,
    exhausted: tierStates.every((state) => state === 'none'),
  };
}

/**
 * Build the Skills panel view from the rows `IWorld.gatheringSkills()` already
 * returns (the sim's own `gatheringSkillsView` output). This is the entry point
 * the panel actually uses, so the client never re-derives a cap.
 */
export function skillsPanelViewFromRows(
  skills: readonly PlayerProfessionSkill[],
  toolTiers?: Partial<Record<GatheringProfessionId, number>>,
): SkillsPanelView {
  const rows = skills.map((skill) =>
    buildRow(skill, toolTiers?.[skill.professionId] ?? NO_TOOL_OWNED),
  );
  return {
    rows,
    totalSkill: rows.reduce((sum, row) => sum + row.skill, 0),
    totalMaxSkill: rows.reduce((sum, row) => sum + row.maxSkill, 0),
  };
}

/**
 * The same view from a raw proficiency record plus the ceiling table (100 for
 * mining / logging / herbalism, 200 for fishing). Row order is
 * `GATHERING_PROFESSION_IDS`, so the three node professions keep a contiguous
 * prefix and fishing is always last.
 */
export function buildSkillsPanelView(
  proficiency: GatheringProficiency,
  caps: Record<GatheringProfessionId, number>,
  toolTiers?: Partial<Record<GatheringProfessionId, number>>,
): SkillsPanelView {
  return skillsPanelViewFromRows(gatheringSkillsView(proficiency, caps), toolTiers);
}

/** What a node's tooltip must say about the tool it demands. */
export interface GatherRequirementView {
  professionId: GatheringProfessionId;
  /** The node's tier, i.e. the tool tier it demands. */
  requiredTier: number;
  /** Best owned tool tier for that profession, NO_TOOL_OWNED (0) when none. */
  toolTier: number;
  /** True when the player carries any tool for that profession at all. */
  hasTool: boolean;
  /** True when the carried tool actually covers the node. */
  meets: boolean;
}

/**
 * The tool-tier requirement line for one node, decided without a DOM. Mirrors
 * `beginHarvest`'s gate order exactly (tool ownership first, then tier), so the
 * tooltip and the deny message can never disagree.
 */
export function gatherRequirementView(
  professionId: GatheringProfessionId,
  requiredTier: number,
  toolTier: number,
): GatherRequirementView {
  const hasTool = toolTier !== NO_TOOL_OWNED;
  return {
    professionId,
    requiredTier,
    toolTier,
    hasTool,
    meets: hasTool && canGatherTier(toolTier, requiredTier),
  };
}

export { GATHERING_PROFESSION_IDS };
export type { GatheringProfessionId, MasteryState, PlayerProfessionSkill };
