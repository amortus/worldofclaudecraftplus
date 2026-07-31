// Pure, host-agnostic view model for the gathering FEEDBACK surfaces: the
// harvest result line, the skill-up line, the harvest deny lines, the fishing
// bite cue and the reel outcomes.
//
// The pure-core half of the split (root CLAUDE.md Conventions). The sim emits
// ids and numbers only (`GatherDenyReason`, `MaterialRarity`, `ReelOutcome`),
// so the whole decision this layer makes is: what colour does that line take,
// is it worth showing at all, and which numbers does it carry. The i18n side is
// gathering_feedback.ts, which turns each of these structures into a `t()` line.
//
// DOM-free and i18n-free: tests/professions_ui_feedback.test.ts drives it
// directly. Numbers are raw; the consumer runs every one through `formatNumber`.

import type {
  GatherDenyReason,
  GatherStart,
  GatheringProfessionId,
  MaterialRarity,
  ReelOutcome,
} from '../sim/professions';

/**
 * Line tones, so the whole feature speaks one colour vocabulary. Every value
 * clears 4.5:1 against the chat log's near-black surface (src/ui/CLAUDE.md).
 */
export const FEEDBACK_TONE_COLOR = {
  info: '#d5c19a',
  good: '#7fdc4f',
  warn: '#ffb066',
  bad: '#ff8f85',
  cue: '#ffd100',
} as const;
export type FeedbackTone = keyof typeof FEEDBACK_TONE_COLOR;

/**
 * The rolled-rarity colouring for a harvest line. Deliberately a local copy of
 * the standard item-quality ladder rather than an import of `icons.ts`
 * QUALITY_COLOR: this module must stay canvas-free so a Vitest can import it
 * with no DOM. `poor` is absent because a harvested material is never
 * junk-grade (`MaterialRarity` excludes it).
 */
export const MATERIAL_RARITY_COLOR: Readonly<Record<MaterialRarity, string>> = {
  common: '#ffffff',
  uncommon: '#1eff00',
  rare: '#4a9eff',
  epic: '#c07cf5',
  legendary: '#ff8000',
};

// ---------------------------------------------------------------------------
// Harvest result
// ---------------------------------------------------------------------------

export interface HarvestResultView {
  itemId: string;
  /** Units yielded. Always at least 1 on a granted harvest. */
  qty: number;
  rarity: MaterialRarity;
  /** The rolled rarity's colour, which is what the line is painted in. */
  color: string;
  /** True above `common`: the line earns the "a rich seam" emphasis. */
  notable: boolean;
}

/** The harvest result line: item plus quantity, coloured by the ROLLED rarity
 *  (not the material's own def quality, which never changes). */
export function harvestResultView(result: {
  itemId: string;
  qty: number;
  rarity: MaterialRarity;
}): HarvestResultView {
  const rarity = result.rarity;
  return {
    itemId: result.itemId,
    qty: Math.max(1, Math.floor(result.qty)),
    rarity,
    color: MATERIAL_RARITY_COLOR[rarity] ?? MATERIAL_RARITY_COLOR.common,
    notable: rarity !== 'common',
  };
}

// ---------------------------------------------------------------------------
// Skill up
// ---------------------------------------------------------------------------

export interface SkillUpView {
  professionId: GatheringProfessionId;
  /** Proficiency after the gain, clamped into [0, maxSkill]. */
  skill: number;
  maxSkill: number;
  /** The gain that was actually applied. Zero for grayed-out content or at the cap. */
  gain: number;
  /** False when nothing was granted: the caller prints no line at all. */
  show: boolean;
  /** True when this gain is the one that finished the profession. */
  reachedCap: boolean;
  tone: FeedbackTone;
}

/**
 * The skill-up line. A zero gain is NOT a line: the four-state curve grays
 * content out silently, and printing "you gained 0" every swing would be noise.
 * The one-time cap message is the exception worth announcing.
 */
export function skillUpView(gain: {
  professionId: GatheringProfessionId;
  skillGain: number;
  nextProficiency: number;
  maxSkill: number;
}): SkillUpView {
  const maxSkill = gain.maxSkill;
  const skill = Math.max(0, Math.min(gain.nextProficiency, maxSkill));
  const applied = gain.skillGain > 0 ? gain.skillGain : 0;
  const reachedCap = applied > 0 && skill >= maxSkill;
  return {
    professionId: gain.professionId,
    skill,
    maxSkill,
    gain: applied,
    show: applied > 0,
    reachedCap,
    tone: reachedCap ? 'good' : 'info',
  };
}

// ---------------------------------------------------------------------------
// Harvest denial
// ---------------------------------------------------------------------------

export interface GatherDenyView {
  reason: GatherDenyReason;
  professionId: GatheringProfessionId;
  /** The tool tier the node demands. Always populated, even on `not_ready`. */
  requiredTier: number;
  /** Whole seconds still to wait, present only on `not_ready`. Ceiled, floored at 1. */
  readyInSec?: number;
  tone: FeedbackTone;
}

/**
 * The deny line for a refused harvest. `readyInSec` is ceiled and floored at 1
 * so a countdown never renders "0 seconds" on the tick before the node is ready
 * (and never a fraction). Returns null for a `GatherStart` that succeeded.
 */
export function gatherDenyView(start: GatherStart): GatherDenyView | null {
  if (start.ok || !start.reason) return null;
  const base = {
    reason: start.reason,
    professionId: start.professionId,
    requiredTier: start.requiredTier,
    tone: 'warn' as FeedbackTone,
  };
  if (start.reason !== 'not_ready') return base;
  return { ...base, readyInSec: Math.max(1, Math.ceil(start.readyInSec ?? 0)) };
}

// ---------------------------------------------------------------------------
// Fishing: the bite cue and the reel outcomes
// ---------------------------------------------------------------------------

export interface FishingBiteView {
  /** Seconds the reel window stays open, for the cue's countdown ring. */
  windowSec: number;
  tone: FeedbackTone;
}

/** The bite cue. Fires on the bite tick; the window is what the rod bought. */
export function fishingBiteView(reelWindowSeconds: number): FishingBiteView {
  return { windowSec: Math.max(0, reelWindowSeconds), tone: 'cue' };
}

export interface ReelOutcomeView {
  outcome: ReelOutcome;
  /** True only for `landed`: the one outcome that produces a catch. */
  landed: boolean;
  tone: FeedbackTone;
}

/** How a reel press reads to the player. Both misses are the same severity: the
 *  fish is gone either way, only the reason differs. */
export function reelOutcomeView(outcome: ReelOutcome): ReelOutcomeView {
  return {
    outcome,
    landed: outcome === 'landed',
    tone: outcome === 'landed' ? 'good' : 'warn',
  };
}

export type { GatherDenyReason, GatheringProfessionId, MaterialRarity, ReelOutcome };
