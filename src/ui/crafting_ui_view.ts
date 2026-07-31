// Pure, host-agnostic view model for the Crafting window (the four craft
// professions: smithing, woodcraft, alchemy, enchanting).
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts and wave 1's skills_panel_view.ts). It
// owns the only things the window actually decides: where each craft sits
// against its 125 ceiling, which of the four mastery states a recipe is worth
// right now, which reagent lines are short and by how much, and whether the
// Craft button may be pressed at all. The DOM/i18n side lives in
// crafting_window.ts and renders nothing this module did not already decide.
//
// Every gate is resolved by calling the SIM's own `beginCraft`, never by
// re-deriving the rule here: the window's displayed requirement is then computed
// by exactly the code the consumption charges by, which is the whole point of
// `reagentStatus` existing as a separate rng-free half.
//
// DOM-free and i18n-free, so tests/crafting_ui_view.test.ts drives it directly.
// Every number here is raw: the consumer runs each one through `formatNumber`.

import {
  beginCraft,
  CRAFT_GAIN_TIER_STEP,
  CRAFT_MAX_SKILL,
  craftCapabilityTier,
  CRAFTING_PROFESSION_IDS,
  type CraftDenyReason,
  type CraftingProfessionId,
  type CraftRecipeDef,
  type CraftResolution,
  type CraftStart,
  type EnchantStatBonus,
  type MasteryState,
  masteryStateFor,
  type PlayerCraftSkill,
  type ReagentStatus,
  recipeTierFor,
} from '../sim/professions';
import type { InvSlot, Stats } from '../sim/types';
import { MASTERY_STATE_COLOR } from './skills_panel_view';

// ---------------------------------------------------------------------------
// Stat lines
// ---------------------------------------------------------------------------

/**
 * The fixed order every stat block in this feature prints in: the five primary
 * attributes in the sim's own `MASTERWORK_PRIMARY_STATS` order, then armor,
 * which rides its own point scale. Fixed rather than object-key order so a
 * masterwork bake, an enchant bonus and a tooltip attribution line can never
 * disagree about which line comes first.
 */
export const STAT_LINE_ORDER: readonly (keyof Stats)[] = [
  'str',
  'agi',
  'sta',
  'int',
  'spi',
  'armor',
];

/** One "+N Stamina" row, already ordered. */
export interface StatBonusLine {
  stat: keyof Stats;
  value: number;
}

/** A stat record flattened into ordered, non-zero lines. Zero and negative
 *  entries are dropped: every bonus in this feature is add-only, so a zero is
 *  residue rather than information. */
export function statBonusLines(bonus: EnchantStatBonus | undefined): StatBonusLine[] {
  if (!bonus) return [];
  const lines: StatBonusLine[] = [];
  for (const stat of STAT_LINE_ORDER) {
    const value = bonus[stat];
    if (value !== undefined && value > 0) lines.push({ stat, value });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The mastery curve, reused rather than re-derived
// ---------------------------------------------------------------------------

/**
 * Which of the four mastery states crafting `skillReq` content is worth at
 * `skill`, scored on the SAME ladder `craftGainMultiplier` scores it on. Both
 * sides are bucketed through the sim's own `capabilityTierFor` (via
 * `craftCapabilityTier` / `recipeTierFor`), so the colour the window paints can
 * never disagree with the skill the sim actually grants.
 */
export function craftMasteryState(skill: number, skillReq: number): MasteryState {
  return masteryStateFor(
    craftCapabilityTier(Math.max(0, skill)),
    recipeTierFor(Math.max(0, skillReq)),
  );
}

/** The classic orange / yellow / green / grey colour for a mastery state.
 *  Wave 1's constant, imported rather than re-declared, so the Skills panel and
 *  the Crafting window are literally the same four colours. */
export function craftMasteryColor(state: MasteryState): string {
  return MASTERY_STATE_COLOR[state];
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One reagent line of a recipe, resolved against the bag. */
export interface CraftReagentRow extends ReagentStatus {
  /** How many more units are needed. 0 once the line is met. */
  short: number;
}

function reagentRows(status: readonly ReagentStatus[]): CraftReagentRow[] {
  return status.map((row) => ({ ...row, short: row.met ? 0 : row.required - row.held }));
}

/** One recipe's row in the window. */
export interface CraftRecipeRow {
  recipeId: string;
  professionId: CraftingProfessionId;
  resultItemId: string;
  /** Copies granted per craft. Shown as "x2" on the alchemy draughts. */
  resultCount: number;
  /** The output's content level, which is also its `requiredLevel` on gear. */
  level: number;
  skillReq: number;
  recipeTier: number;
  /** The crafter's own capability tier, for the "N tiers above" readout. */
  capabilityTier: number;
  mastery: MasteryState;
  /** The mastery state's colour, so the consumer never re-maps the state. */
  masteryColor: string;
  reagents: CraftReagentRow[];
  /** True when every reagent line is met: the Craft button is pressable. */
  craftable: boolean;
  /** Why the button is disabled. Absent when `craftable`. */
  denyReason?: CraftDenyReason;
  /** The reagent item ids that are short, in the recipe's declared order. The
   *  disabled button's reason names these. */
  shortItemIds: string[];
  /** Skill this craft would teach, already clamped. 0 means grey or capped. */
  skillGain: number;
  /** True when the recipe still teaches anything at all. */
  teaches: boolean;
  /** The masterwork proc chance this craft would roll at, as a 0..1 fraction. */
  masterworkChance: number;
}

/** One craft profession's section in the window. */
export interface CraftProfessionRow {
  professionId: CraftingProfessionId;
  /** Skill, clamped into [0, maxSkill] so a stale wire value cannot overfill a bar. */
  skill: number;
  maxSkill: number;
  /** Progress against the ceiling as a 0..1 fraction. */
  fraction: number;
  /** The same progress as a whole percent, 0..100 (bar width and aria value). */
  percent: number;
  capped: boolean;
  capabilityTier: number;
  /** Points still needed for the next capability tier; null at the ceiling. */
  pointsToNextTier: number | null;
  recipes: CraftRecipeRow[];
  /** How many of this craft's recipes can be made right now. */
  craftableCount: number;
}

export interface CraftingWindowView {
  professions: CraftProfessionRow[];
  /** The profession section the window is showing. Always one of `professions`. */
  active: CraftingProfessionId;
  totalSkill: number;
  totalMaxSkill: number;
  /** How many recipes are craftable across every craft, the one headline number. */
  totalCraftable: number;
}

export interface CraftingWindowInput {
  /** The rows `IWorld.craftingSkills()` returns for the local player. */
  skills: readonly PlayerCraftSkill[];
  /** Every recipe, in authored order (`CRAFT_RECIPES`). */
  recipes: readonly CraftRecipeDef[];
  /** The crafter's bag. Never mutated: only `beginCraft`'s rng-free half runs. */
  inventory: readonly InvSlot[];
  /** The profession tab to show. Falls back to the first row when absent or unknown. */
  activeProfessionId?: CraftingProfessionId;
}

function clampSkill(skill: number, maxSkill: number): number {
  if (!(skill > 0)) return 0;
  return skill > maxSkill ? maxSkill : skill;
}

/**
 * One recipe row, resolved through the sim's own gates.
 *
 * `beginCraft` needs a crafter identity and the output's def facts for the
 * RESOLVE half; its rng-free half reads neither (it only resolves reagents,
 * tiers, the gain and the proc odds), so the placeholders below never reach a
 * decision. Calling it anyway is deliberate: it is what guarantees the window's
 * displayed cost is computed by the same code the consumption charges by.
 */
function recipeRow(
  recipe: CraftRecipeDef,
  skill: number,
  maxSkill: number,
  inventory: readonly InvSlot[],
): CraftRecipeRow {
  const start: CraftStart = beginCraft({
    recipe,
    skill,
    maxSkill,
    // `beginCraft` never mutates the array (only `resolveCraft` does), so the
    // window's read-only bag is safe to hand over.
    inventory: inventory as InvSlot[],
    crafterName: '',
    crafterId: 0,
    output: { kind: 'junk' },
  });
  const reagents = reagentRows(start.reagents);
  const mastery = craftMasteryState(skill, recipe.skillReq);
  const row: CraftRecipeRow = {
    recipeId: recipe.id,
    professionId: recipe.professionId,
    resultItemId: recipe.resultItemId,
    resultCount: recipe.resultCount,
    level: recipe.level,
    skillReq: recipe.skillReq,
    recipeTier: start.recipeTier,
    capabilityTier: start.capabilityTier,
    mastery,
    masteryColor: craftMasteryColor(mastery),
    reagents,
    craftable: start.ok,
    shortItemIds: reagents.filter((r) => !r.met).map((r) => r.itemId),
    skillGain: start.skillGain,
    teaches: start.skillGain > 0,
    masterworkChance: start.masterworkChance,
  };
  if (start.reason) row.denyReason = start.reason;
  return row;
}

function professionRow(
  skillRow: PlayerCraftSkill,
  input: CraftingWindowInput,
): CraftProfessionRow {
  const maxSkill = skillRow.maxSkill;
  const skill = clampSkill(skillRow.skill, maxSkill);
  const fraction = maxSkill > 0 ? skill / maxSkill : 0;
  const capabilityTier = craftCapabilityTier(skill);
  const nextTierAt = (capabilityTier + 1) * CRAFT_GAIN_TIER_STEP;
  const recipes = input.recipes
    .filter((recipe) => recipe.professionId === skillRow.professionId)
    .map((recipe) => recipeRow(recipe, skill, maxSkill, input.inventory));
  return {
    professionId: skillRow.professionId,
    skill,
    maxSkill,
    fraction,
    percent: Math.round(fraction * 100),
    capped: skill >= maxSkill,
    capabilityTier,
    pointsToNextTier: nextTierAt > maxSkill ? null : nextTierAt - skill,
    recipes,
    craftableCount: recipes.filter((r) => r.craftable).length,
  };
}

/**
 * Build the whole Crafting window from the rows `IWorld.craftingSkills()`
 * already returns plus the recipe table and the live bag. Row order is
 * `CRAFTING_PROFESSION_IDS`, so the tabs never reshuffle between runs.
 */
export function buildCraftingWindowView(input: CraftingWindowInput): CraftingWindowView {
  const professions = input.skills.map((skillRow) => professionRow(skillRow, input));
  const requested = input.activeProfessionId;
  const active =
    requested !== undefined && professions.some((p) => p.professionId === requested)
      ? requested
      : (professions[0]?.professionId ?? CRAFTING_PROFESSION_IDS[0]);
  return {
    professions,
    active,
    totalSkill: professions.reduce((sum, row) => sum + row.skill, 0),
    totalMaxSkill: professions.reduce((sum, row) => sum + row.maxSkill, 0),
    totalCraftable: professions.reduce((sum, row) => sum + row.craftableCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/** Line tones, shared with wave 1's gathering feedback vocabulary. Every value
 *  clears 4.5:1 against the chat log's near-black surface. */
export const CRAFT_TONE_COLOR = {
  info: '#d5c19a',
  good: '#7fdc4f',
  proc: '#ffd100',
  warn: '#ffb066',
  bad: '#ff8f85',
} as const;
export type CraftTone = keyof typeof CRAFT_TONE_COLOR;

export interface CraftResultView {
  itemId: string;
  count: number;
  /** True when the single proc draw landed AND the output could bake a bonus. */
  masterwork: boolean;
  /** The bonus stats baked into the procced copy, ordered. Empty when plain. */
  masterworkStats: StatBonusLine[];
  /** True when a signed reagent raised the odds this craft rolled at. */
  signedReagentUsed: boolean;
  /** The maker's bond stamped on the output, when the caller knows the name. */
  signer?: string;
  skillGain: number;
  nextSkill: number;
  tone: CraftTone;
}

/**
 * The success line for one completed craft. A masterwork is the one outcome
 * that earns its own tone: it is the single random thing crafting does, and its
 * baked stats are what the player is actually being told about.
 */
export function craftResultView(
  result: Pick<
    CraftResolution,
    'itemId' | 'count' | 'masterwork' | 'masterworkStats' | 'signedReagentUsed' | 'skillGain' | 'nextSkill'
  >,
  signer?: string,
): CraftResultView {
  const masterwork = result.masterwork === true;
  const view: CraftResultView = {
    itemId: result.itemId ?? '',
    count: Math.max(1, Math.floor(result.count ?? 1)),
    masterwork,
    masterworkStats: masterwork ? statBonusLines(result.masterworkStats) : [],
    signedReagentUsed: result.signedReagentUsed === true,
    skillGain: result.skillGain > 0 ? result.skillGain : 0,
    nextSkill: Math.max(0, result.nextSkill),
    tone: masterwork ? 'proc' : 'good',
  };
  if (signer) view.signer = signer;
  return view;
}

export interface CraftDenyView {
  reason: CraftDenyReason;
  /** The reagent lines that are short, so the line can name the first one. */
  short: CraftReagentRow[];
  tone: CraftTone;
}

/** The deny line for a refused craft, or null for a `CraftStart` that passed. */
export function craftDenyView(start: CraftStart): CraftDenyView | null {
  if (start.ok || !start.reason) return null;
  return {
    reason: start.reason,
    short: reagentRows(start.reagents).filter((row) => !row.met),
    tone: 'warn',
  };
}

export interface CraftSkillUpView {
  professionId: CraftingProfessionId;
  skill: number;
  maxSkill: number;
  gain: number;
  /** False when nothing was granted: the caller prints no line at all. */
  show: boolean;
  /** True when this gain is the one that finished the craft. */
  reachedCap: boolean;
  tone: CraftTone;
}

/**
 * The skill-up line for a craft, enchant or disenchant. A zero gain is silence
 * by design (the four-state curve greys content out without a message); the
 * one-time 125 cap message is the exception worth announcing.
 */
export function craftSkillUpView(gain: {
  professionId: CraftingProfessionId;
  skillGain: number;
  nextSkill: number;
  maxSkill?: number;
}): CraftSkillUpView {
  const maxSkill = gain.maxSkill ?? CRAFT_MAX_SKILL;
  const skill = Math.max(0, Math.min(gain.nextSkill, maxSkill));
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

export { CRAFTING_PROFESSION_IDS, MASTERY_STATE_COLOR };
export type { CraftDenyReason, CraftingProfessionId, CraftRecipeDef, MasteryState, PlayerCraftSkill };
