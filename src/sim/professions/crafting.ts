// Crafting: turning gathered materials into finished goods. The pure core
// behind the craft command.
//
// Shape of one craft, and the split this module exposes (the same cast-free
// twin of wave 1's `beginHarvest` / `resolveHarvest`):
//
//   1. `beginCraft` runs the rng-FREE gates (does the player hold every
//      reagent, in the required quantity) and reports the per-reagent cost,
//      the mastery state, and the skill this craft would teach
//   2. `resolveCraft` consumes the reagents, makes EXACTLY ONE rng draw (the
//      masterwork proc), and grants the output
//
// Draw contract: exactly ONE `rng.next()` per SUCCESSFUL craft, unconditional
// on the success path so the count never depends on the output's shape, and
// ZERO on every denial. That mirrors wave 1's one-draw-per-completed-harvest
// rule, and it is why `beginCraft` exists as a separate rng-free half.
//
// Skill follows the SAME four-state mastery curve gathering uses
// (`mastery.ts`), so a cheap recipe stops teaching once you have outgrown it by
// three tiers and the climb has to move to harder recipes. Crafting caps at
// 125, above gathering's 100 and below fishing's 200.
//
// Reagent consumption goes through `removeFromSlots` (`../item_instance`) and
// NOTHING else. That is load-bearing: it removes plain stacks first, so a
// reagent cost can never eat the signed copy sitting in the same bag while an
// ordinary one is available.
//
// Pure and host-agnostic: no `Sim` import, no `PlayerMeta`, no `ITEMS`, no
// content import. Every input is explicit and randomness arrives as an `Rng`
// parameter, never `Math.random`. The one thing this module does mutate is the
// `InvSlot[]` handed to `resolveCraft`, which is an explicit argument the
// caller owns; routing that mutation through the sanctioned add/remove paths
// is the whole point.

import { addToSlots, mintItemInstance, removeFromSlots } from '../item_instance';
import type { Rng } from '../rng';
import type { InvSlot, ItemDef, ItemInstance } from '../types';
import { applyProficiencyGain, capabilityTierFor, tierProgressMultiplier } from './mastery';
import { masterworkBonusStats, masterworkProcChance } from './masterwork';
import type {
  CraftingProficiency,
  CraftingProfessionId,
  CraftRecipeDef,
  EnchantStatBonus,
  PlayerCraftSkill,
  ReagentStatus,
  RecipeReagent,
} from './types';
import { CRAFTING_PROFESSION_IDS } from './types';

// ---------------------------------------------------------------------------
// The mastery curve
// ---------------------------------------------------------------------------

/** Every crafting profession's ceiling. Ported from upstream unchanged (their
 *  design doc pins crafts at 125 against gathering's 100 and fishing's 200). */
export const CRAFT_MAX_SKILL = 125;

// Every CRAFT_GAIN_TIER_STEP points of skill is one capability tier, scored
// against the recipe's own tier through the shared four-state curve. Ported
// verbatim from upstream's TIER_SKILL_STEP; wave 1 uses the same 25 for
// gathering, so a tier means the same thing on both sides of the wave.
//
// With a 125 ceiling that yields capability tiers 0..5, and our four recipe
// rungs sit at skillReq 0 / 25 / 50 / 75 (tiers 0..3), one per zone. The climb
// that falls out: rung 1 carries 0-74 and grays at 75, rung 2 carries 25-99,
// rung 3 carries 50-124, and rung 4 is the only rung that still teaches at
// full rate from 75 all the way to the 125 cap. The two tiers of headroom
// above the top rung are deliberate and are upstream's: they are what feeds
// the masterwork proc's per-tier-above term, so at-cap crafting is the
// masterwork hunt rather than dead content.
export const CRAFT_GAIN_TIER_STEP = 25;

/** Base skill granted by one successful craft, before the curve. */
export const CRAFT_BASE_GAIN = 1;

/** The player's capability tier in a craft at a given skill. */
export function craftCapabilityTier(skill: number): number {
  return capabilityTierFor(skill, CRAFT_GAIN_TIER_STEP);
}

/** The tier a recipe sits at, bucketed from its `skillReq` on the same ladder
 *  a player's skill is bucketed on, so the two are directly comparable. */
export function recipeTierFor(skillReq: number): number {
  return capabilityTierFor(skillReq, CRAFT_GAIN_TIER_STEP);
}

/** The four-state multiplier for crafting a `skillReq` recipe at `skill`.
 *  Deterministic and rng-free: the same craft at the same skill always moves
 *  the counter by exactly this multiple, never a skill-up roll. */
export function craftGainMultiplier(skill: number, skillReq: number): number {
  return tierProgressMultiplier(
    craftCapabilityTier(Math.max(0, skill)),
    recipeTierFor(Math.max(0, skillReq)),
  );
}

/** The skill one craft actually grants, already clamped against the ceiling.
 *  Returns 0 for a grayed-out recipe and 0 at the cap. */
export function craftSkillGain(skill: number, skillReq: number, maxSkill: number): number {
  const raw = CRAFT_BASE_GAIN * craftGainMultiplier(skill, skillReq);
  return applyProficiencyGain(skill, raw, maxSkill) - Math.max(0, skill);
}

// ---------------------------------------------------------------------------
// Reagents
// ---------------------------------------------------------------------------

/** How many copies of `itemId` a bag holds, instanced copies included. */
export function countItemInSlots(inventory: readonly InvSlot[], itemId: string): number {
  let total = 0;
  for (const slot of inventory) if (slot.itemId === itemId) total += slot.count;
  return total;
}

/**
 * Every reagent line of `recipe` resolved against `inventory`, in the recipe's
 * declared order.
 *
 * Upstream composes two discounts here (a self-signed-material reduction and a
 * specialization percentage). Neither is ported: the specialization perk keys
 * off their ten-craft wheel, and their self-signed discount only pays off with
 * their corpse-harvest signed-material faucet. Ours is therefore the identity
 * cost, and this function exists so the crafting window computes its displayed
 * requirement with the SAME code the consumption charges by, which is the part
 * of upstream's design that actually matters.
 */
export function reagentStatus(
  inventory: readonly InvSlot[],
  recipe: CraftRecipeDef,
): ReagentStatus[] {
  return reagentStatusOf(inventory, recipe.reagents);
}

/** The same resolution for a bare reagent list, so enchanting's reagent rows
 *  come out of the ONE function crafting's do rather than a second copy of the
 *  same three lines. */
export function reagentStatusOf(
  inventory: readonly InvSlot[],
  reagents: readonly RecipeReagent[],
): ReagentStatus[] {
  return reagents.map((r) => {
    const held = countItemInSlots(inventory, r.itemId);
    return { itemId: r.itemId, required: r.count, held, met: held >= r.count };
  });
}

/** Whether the bag holds every reagent the recipe requires. Read-only. */
export function hasRecipeReagents(
  inventory: readonly InvSlot[],
  recipe: CraftRecipeDef,
): boolean {
  return recipe.reagents.every((r) => countItemInSlots(inventory, r.itemId) >= r.count);
}

/** Whether the bag holds a copy of `itemId` carrying ANY player's signature.
 *  Feeds the masterwork proc's signed-reagent term, which upstream deliberately
 *  widened from self-signed-only: buying a gatherer's signed materials is worth
 *  as much to the proc as gathering your own. Checked BEFORE consumption,
 *  because `removeFromSlots` prefers plain copies and may well leave the signed
 *  one untouched. */
export function holdsSignedInstance(
  inventory: readonly InvSlot[],
  itemId: string,
): boolean {
  return inventory.some((s) => s.itemId === itemId && s.instance?.signer !== undefined);
}

/** Whether any of `reagents` is held as a signed copy. */
export function holdsAnySignedReagent(
  inventory: readonly InvSlot[],
  reagents: readonly RecipeReagent[],
): boolean {
  return reagents.some((r) => holdsSignedInstance(inventory, r.itemId));
}

// ---------------------------------------------------------------------------
// The output description
// ---------------------------------------------------------------------------

/** What the resolve needs to know about the recipe's result item. Passed in
 *  rather than looked up, so this module never imports `ITEMS` and a Vitest can
 *  drive it with a two-field literal. */
export interface CraftOutputInfo {
  kind: ItemDef['kind'];
  quality?: ItemDef['quality'];
  /** The result def's own stats. The masterwork bake amplifies this profile. */
  stats?: EnchantStatBonus;
}

/**
 * Whether a crafted output carries its maker's signature (the Maker's Bond).
 *
 * ADAPTED. Upstream signs on DEF QUALITY, rare-or-better, because their craft
 * outputs span ten crafts' worth of consumables and gear at every rarity and a
 * signed stack of potions would be unstackable clutter for no gain. Our
 * crafted gear tops out at `rare` on exactly one of four rungs, so a rarity
 * threshold would make the bond visible on three items out of twenty-four.
 * Keying on the output KIND instead puts the maker's name on every piece of
 * crafted equipment (which is what a player wants to see it on) and leaves
 * consumables fungible (which is what keeps a stack of potions a stack).
 */
export function isSignableCraftOutput(kind: ItemDef['kind']): boolean {
  return kind === 'weapon' || kind === 'armor';
}

// ---------------------------------------------------------------------------
// The two command halves
// ---------------------------------------------------------------------------

/** Why a craft attempt was refused. Stable ids, never player text: the client
 *  renders its own localized line from the id plus the reagent rows. */
export type CraftDenyReason = 'insufficient_materials';

export interface CraftAttempt {
  recipe: CraftRecipeDef;
  /** The player's skill in the recipe's profession. */
  skill: number;
  /** That profession's ceiling. */
  maxSkill: number;
  /** The crafter's bag. `resolveCraft` mutates it; `beginCraft` never does. */
  inventory: InvSlot[];
  /** The crafter's display name, stamped as the maker's signature. */
  crafterName: string;
  /** The crafter's entity id, so the bond survives a rename. */
  crafterId: number;
  /** The result item's def facts (see `CraftOutputInfo`). */
  output: CraftOutputInfo;
  /**
   * Commission crafting: the entity id of the player this craft is being
   * performed FOR. When set, every granted copy is bound to that player.
   *
   * ADAPTED. Upstream arms the copy with a `bindOnTrade` flag and binds on the
   * FIRST trade, which needs an `ItemInstance.bindOnTrade` field; `types.ts` is
   * out of this wave's file ownership and our `ItemInstance` has only
   * `boundTo`. So a commission binds AT CRAFT TIME to the named recipient
   * instead. The player-visible outcome for the case upstream designs around is
   * the same (the piece is the commissioner's and nobody else's) with one field
   * fewer; the difference is that our commission cannot be re-traded onward,
   * which for a made-to-order piece is arguably the point.
   */
  commissionFor?: number;
}

export interface CraftStart {
  ok: boolean;
  recipeId: string;
  professionId: CraftingProfessionId;
  /** Every reagent line resolved against the bag, whether ok or not, so a
   *  denial can show exactly which line is short. */
  reagents: ReagentStatus[];
  reason?: CraftDenyReason;
  /** The recipe's tier on the mastery ladder. */
  recipeTier: number;
  /** The crafter's capability tier. */
  capabilityTier: number;
  /** The skill this craft would teach, already clamped. 0 means gray or
   *  capped; the client colours the recipe row from `masteryStateFor`. */
  skillGain: number;
  /** The masterwork proc chance this craft would roll at, so the crafting
   *  window can show it. Draw-free. */
  masterworkChance: number;
}

/**
 * The rng-free half. Validates one craft attempt and reports its full cost,
 * mastery state and proc odds. Never mutates anything and never draws.
 */
export function beginCraft(a: CraftAttempt): CraftStart {
  const reagents = reagentStatus(a.inventory, a.recipe);
  const recipeTier = recipeTierFor(a.recipe.skillReq);
  const capabilityTier = craftCapabilityTier(a.skill);
  const start: CraftStart = {
    ok: reagents.every((r) => r.met),
    recipeId: a.recipe.id,
    professionId: a.recipe.professionId,
    reagents,
    recipeTier,
    capabilityTier,
    skillGain: craftSkillGain(a.skill, a.recipe.skillReq, a.maxSkill),
    masterworkChance: masterworkProcChance({
      tiersAboveRecipe: capabilityTier - recipeTier,
      signedReagent: holdsAnySignedReagent(a.inventory, a.recipe.reagents),
      materialTier: a.recipe.materialTier,
    }),
  };
  if (!start.ok) start.reason = 'insufficient_materials';
  return start;
}

export interface CraftResolution {
  ok: boolean;
  recipeId: string;
  professionId: CraftingProfessionId;
  reason?: CraftDenyReason;
  /** Set when ok: the item granted and how many copies. */
  itemId?: string;
  count?: number;
  /** Set when ok: true only when the proc landed AND the output could actually
   *  bake a bonus. A plain success omits it. */
  masterwork?: boolean;
  /** Set on a masterwork: the bonus stats baked into the procced copy. */
  masterworkStats?: EnchantStatBonus;
  /** Set when ok: true when at least one reagent was held as a signed copy,
   *  which raised the proc odds. */
  signedReagentUsed?: boolean;
  /** Skill to add, already clamped against the ceiling. */
  skillGain: number;
  /** The player's skill after `skillGain` is applied. */
  nextSkill: number;
  /** What was actually removed from the bag, in the recipe's order. Ids and
   *  numbers, for the client's "consumed" line. */
  consumed: RecipeReagent[];
}

/**
 * The rng half. Re-runs the rng-free gates first, so a denial here is exactly
 * as free as a denial from `beginCraft`: no consumption, no grant, NO DRAW.
 *
 * On success it consumes every reagent through `removeFromSlots` (plain stacks
 * first, so a signed copy is never eaten while an ordinary one exists), makes
 * the single masterwork proc draw, and adds the output through `addToSlots`.
 *
 * The draw is UNCONDITIONAL on the success path: it happens even when the
 * output cannot masterwork at all (a stats-free potion), so the draw count per
 * successful craft is always exactly 1 and adding or tuning a proc can never
 * shift the rest of the world's rng stream.
 */
export function resolveCraft(a: CraftAttempt, rng: Rng): CraftResolution {
  const recipe = a.recipe;
  const start = beginCraft(a);
  if (!start.ok) {
    return {
      ok: false,
      recipeId: recipe.id,
      professionId: recipe.professionId,
      reason: start.reason,
      skillGain: 0,
      nextSkill: Math.max(0, a.skill),
      consumed: [],
    };
  }

  // Read the signed-reagent fact BEFORE consuming: removeFromSlots prefers
  // plain copies, so the signed one is usually still sitting there afterwards,
  // but the check has to describe the bag the craft actually drew from.
  const signedReagentUsed = holdsAnySignedReagent(a.inventory, recipe.reagents);

  const consumed: RecipeReagent[] = [];
  for (const reagent of recipe.reagents) {
    const removed = removeFromSlots(a.inventory, reagent.itemId, reagent.count);
    consumed.push({ itemId: reagent.itemId, count: removed.removed });
  }

  // The single output-side draw.
  const procRoll = rng.next();
  const procChance = masterworkProcChance({
    tiersAboveRecipe: start.capabilityTier - start.recipeTier,
    signedReagent: signedReagentUsed,
    materialTier: recipe.materialTier,
  });
  const bonusStats = masterworkBonusStats({ stats: a.output.stats });
  const masterwork = procRoll < procChance && bonusStats !== null;

  const signable = isSignableCraftOutput(a.output.kind);
  const grantInstanced = signable || a.commissionFor !== undefined || masterwork;

  if (!grantInstanced) {
    // Plain fungible grant: a stack of potions stays a stack.
    addToSlots(a.inventory, recipe.resultItemId, recipe.resultCount);
  } else {
    // One slot per copy: an instanced copy never stacks (`canStack`), so a
    // resultCount > 1 instanced output has to open its own slot per unit
    // rather than share one `count`. The masterwork proc upgrades exactly ONE
    // copy (the bonus belongs to the copy that procced, not to the batch);
    // every other layer, the signature and the commission bond, applies to all
    // of them.
    for (let i = 0; i < recipe.resultCount; i++) {
      const instance = mintCraftInstance(a, recipe, signable);
      if (masterwork && i === 0 && bonusStats) {
        instance.rolled = { ...instance.rolled, masterwork: true, stats: { ...bonusStats } };
      }
      addToSlots(a.inventory, recipe.resultItemId, 1, instance);
    }
  }

  const skillGain = craftSkillGain(a.skill, recipe.skillReq, a.maxSkill);
  const result: CraftResolution = {
    ok: true,
    recipeId: recipe.id,
    professionId: recipe.professionId,
    itemId: recipe.resultItemId,
    count: recipe.resultCount,
    skillGain,
    nextSkill: Math.max(0, a.skill) + skillGain,
    consumed,
  };
  if (signedReagentUsed) result.signedReagentUsed = true;
  if (masterwork && bonusStats) {
    result.masterwork = true;
    result.masterworkStats = { ...bonusStats };
  }
  return result;
}

/** Mint the identity layer one crafted copy carries. Draw-free: it goes
 *  through `mintItemInstance` (the sanctioned minting path) with NO
 *  `masterworkChance`, which is the arm that would draw. The proc has already
 *  been decided by `resolveCraft`'s single draw. */
function mintCraftInstance(
  a: CraftAttempt,
  recipe: CraftRecipeDef,
  signable: boolean,
): ItemInstance {
  return (
    mintItemInstance(_NO_DRAW_RNG, {
      craftedRecipeId: recipe.id,
      ...(signable ? { signer: a.crafterName, signerId: a.crafterId } : {}),
      ...(a.commissionFor !== undefined ? { boundTo: a.commissionFor } : {}),
    }) ?? {}
  );
}

// `mintItemInstance` takes an `Rng` but only touches it on its
// `masterworkChance` arm, which this module never uses (crafting owns its
// single draw, made in `resolveCraft`). Handing it a stub that THROWS rather
// than a live generator turns "someone added a draw to the mint path" from a
// silent determinism bug into an immediate, loud failure.
const _NO_DRAW_RNG = {
  next(): number {
    throw new Error('crafting mint must not draw: the masterwork proc is the only craft draw');
  },
} as unknown as Rng;

// ---------------------------------------------------------------------------
// Per-player skill record helpers
// ---------------------------------------------------------------------------

/** A fresh, all-zero crafting skill record. */
export function emptyCraftingProficiency(): CraftingProficiency {
  const out = {} as CraftingProficiency;
  for (const id of CRAFTING_PROFESSION_IDS) out[id] = 0;
  return out;
}

/**
 * Coerce an untrusted record (a save row written before crafting existed, or a
 * wire payload) into a complete, finite, non-negative record clamped to each
 * craft's ceiling. Unknown keys are dropped and missing ones default to 0, so a
 * pre-feature save loads cleanly and a hand-edited one cannot inject a counter.
 */
export function normalizeCraftingProficiency(
  raw: Partial<Record<string, unknown>> | undefined,
  caps: Record<CraftingProfessionId, number>,
): CraftingProficiency {
  const out = emptyCraftingProficiency();
  if (!raw) return out;
  for (const id of CRAFTING_PROFESSION_IDS) {
    const v = raw[id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    out[id] = Math.min(v, caps[id]);
  }
  return out;
}

/** The read-only rows the "your crafts" panel renders. Ids and numbers only. */
export function craftingSkillsView(
  proficiency: CraftingProficiency,
  caps: Record<CraftingProfessionId, number>,
): PlayerCraftSkill[] {
  return CRAFTING_PROFESSION_IDS.map((professionId) => ({
    professionId,
    skill: proficiency[professionId] ?? 0,
    maxSkill: caps[professionId],
  }));
}
