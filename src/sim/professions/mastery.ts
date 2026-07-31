// The four-state mastery curve, shared by every profession skill.
//
// Ported from upstream's `professions/wheel.ts` (`tierProgressMultiplier`,
// `REDUCED_TIER_MULTIPLIER`, `MINIMAL_TIER_MULTIPLIER`): a player's capability
// tier is scored against the tier of the thing they just worked, and the gap
// selects one of exactly four progress states:
//
//   - at or above your capability tier .... FULL     (1)
//   - one tier below ...................... REDUCED  (1/2)
//   - two tiers below ..................... MINIMAL  (1/4)
//   - three or more tiers below ........... NONE     (0)
//
// That last state is the whole point: a cheap node stops granting skill
// forever once you have outgrown it by three tiers, so the climb has to move
// to harder content instead of being farmed at the starting zone.
//
// Deliberately NOT a skill-up roll: the multiplier is deterministic and draws
// zero rng, so adding or removing a gather never perturbs the world's rng
// stream (src/sim determinism invariant).

/** Progress multiplier for content at or above your capability tier. */
export const FULL_TIER_MULTIPLIER = 1;
/** Progress multiplier for content exactly one tier below capability. */
export const REDUCED_TIER_MULTIPLIER = 0.5;
/** Progress multiplier for content exactly two tiers below capability. */
export const MINIMAL_TIER_MULTIPLIER = 0.25;
/** Progress multiplier for content three or more tiers below capability. */
export const NONE_TIER_MULTIPLIER = 0;

/** The four states in order, so a UI (or a test) can enumerate them without
 *  restating the numbers. */
export const MASTERY_MULTIPLIERS = [
  FULL_TIER_MULTIPLIER,
  REDUCED_TIER_MULTIPLIER,
  MINIMAL_TIER_MULTIPLIER,
  NONE_TIER_MULTIPLIER,
] as const;

/** Names for the four states, index-aligned with `MASTERY_MULTIPLIERS`. Stable
 *  ids, not player text: the client picks its own localized wording (and, in
 *  classic tradition, its own orange/yellow/green/grey colour) from these. */
export type MasteryState = 'full' | 'reduced' | 'minimal' | 'none';
export const MASTERY_STATES: readonly MasteryState[] = ['full', 'reduced', 'minimal', 'none'];

/**
 * The progress multiplier for working `contentTier` content at
 * `capabilityTier` capability. Pure, rng-free, and monotone: raising your
 * capability never raises the multiplier, and it never goes below zero.
 *
 * A NaN on either side falls through every comparison to the FULL state the
 * same way an equal-tier pair does, matching the "a fresh skill always gains"
 * default rather than silently zeroing a player's progress.
 */
export function tierProgressMultiplier(capabilityTier: number, contentTier: number): number {
  const tiersBelow = capabilityTier - contentTier;
  if (!(tiersBelow > 0)) return FULL_TIER_MULTIPLIER;
  if (tiersBelow === 1) return REDUCED_TIER_MULTIPLIER;
  if (tiersBelow === 2) return MINIMAL_TIER_MULTIPLIER;
  return NONE_TIER_MULTIPLIER;
}

/** Which of the four states a (capability, content) pair selects. The client
 *  renders the tooltip/minimap colour from this id. */
export function masteryStateFor(capabilityTier: number, contentTier: number): MasteryState {
  const mult = tierProgressMultiplier(capabilityTier, contentTier);
  const at = MASTERY_MULTIPLIERS.indexOf(mult as (typeof MASTERY_MULTIPLIERS)[number]);
  return MASTERY_STATES[at];
}

/**
 * Bucket a flat skill value into a capability tier: every `step` points is one
 * tier. Skill 0 to step-1 is tier 0, and so on. Never negative; a NaN pins to
 * tier 0 rather than propagating.
 */
export function capabilityTierFor(skill: number, step: number): number {
  if (!(skill > 0)) return 0;
  return Math.floor(skill / step);
}

/**
 * Add `gain` to `current`, clamped into [0, maxSkill]. The single place a
 * profession cap is enforced: every producer routes its gain through here, so
 * no caller can push a counter past its ceiling.
 */
export function applyProficiencyGain(current: number, gain: number, maxSkill: number): number {
  const base = current > 0 ? current : 0;
  const next = base + (gain > 0 ? gain : 0);
  return next > maxSkill ? maxSkill : next;
}
