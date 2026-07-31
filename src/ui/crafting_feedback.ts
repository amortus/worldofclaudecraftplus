// Thin i18n consumer for the crafting / enchanting / disenchanting feedback
// surfaces.
//
// The consumer half of the split (wave 1's gathering_feedback.ts is the
// template): every decision (tone, whether a line is worth printing, which
// numbers survive rounding, which stats a masterwork actually baked) was made by
// crafting_ui_view.ts / enchanting_ui_view.ts. This module only turns those
// structures into localized text, formats every number through `formatNumber`,
// and hands the caller `{ text, color }` pairs it can drop straight into the
// combat log or a toast.
//
// The sim emits ids and numbers only, so every word below is authored in
// src/ui/i18n.catalog/hud_chrome.ts.

import { ITEMS } from '../sim/data';
import type {
  CraftDenyReason,
  CraftingProfessionId,
  EnchantStatBonus,
} from '../sim/professions';
import { isCraftingProfessionId, isSignableCraftOutput } from '../sim/professions';
import {
  CRAFT_TONE_COLOR,
  type CraftTone,
  craftResultView,
  craftSkillUpView,
  type StatBonusLine,
} from './crafting_ui_view';
import { craftProfessionName, enchantName, statBonusLabel } from './crafting_labels';
import type {
  DisenchantPreviewView,
  EnchantDenyReason,
  EnchantReplaceConfirmView,
} from './enchanting_ui_view';
import { instanceStatAttribution } from './enchanting_ui_view';
import { itemDisplayName } from './entity_i18n';
import { esc } from './esc';
import type { ItemInstance } from '../sim/types';
import { formatNumber, t, type TranslationKey } from './i18n';

/** A ready-to-print feedback line. */
export interface FeedbackLine {
  text: string;
  color: string;
}

function line(text: string, tone: CraftTone): FeedbackLine {
  return { text, color: CRAFT_TONE_COLOR[tone] };
}

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

/** An item's localized display name, or its raw id when no def knows it (a
 *  newer server's item). The id never reaches player copy for anything this
 *  wave ships: every one of its 40 items has a catalog row. */
function itemName(itemId: string): string {
  const def = ITEMS[itemId];
  return def ? itemDisplayName(def) : itemId;
}

/** "+3 Strength, +2 Stamina", the inline stat block an enchant row and a
 *  masterwork line both print. */
export function statBonusText(lines: readonly StatBonusLine[]): string {
  return lines
    .map((entry) =>
      t('hudChrome.crafting.statLine', {
        value: num(entry.value),
        stat: statBonusLabel(entry.stat),
      }),
    )
    .join(t('hudChrome.crafting.listJoin'));
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

export interface CraftResultInput {
  itemId?: string;
  count?: number;
  masterwork?: boolean;
  /** The bake, as the `craftComplete` event carries it (a loose numeric record
   *  on the wire). `statBonusLines` reads only the six known stat axes. */
  masterworkStats?: Readonly<Record<string, number>>;
  signedReagentUsed?: boolean;
  /** Skill is announced by its own `professionSkill` event, so these are
   *  optional here and default to "nothing was granted". */
  skillGain?: number;
  nextSkill?: number;
  /**
   * The crafter's display name. The bond only PRINTS for an output that
   * actually carries it: `isSignableCraftOutput` keys on the output kind, so a
   * stack of potions never claims a maker.
   */
  signer?: string;
}

/**
 * The lines one completed craft prints: the result, then the masterwork's baked
 * stats, then the maker's bond. A plain craft is one line; the extras only
 * appear when the sim actually granted them, so a stack of potions never prints
 * three lines about nothing.
 */
export function craftResultLines(result: CraftResultInput): FeedbackLine[] {
  const signable = isSignableCraftOutput(ITEMS[result.itemId ?? '']?.kind ?? 'junk');
  const view = craftResultView(
    {
      itemId: result.itemId,
      count: result.count,
      masterwork: result.masterwork,
      masterworkStats: result.masterworkStats as EnchantStatBonus | undefined,
      signedReagentUsed: result.signedReagentUsed,
      skillGain: result.skillGain ?? 0,
      nextSkill: result.nextSkill ?? 0,
    },
    signable ? result.signer : undefined,
  );
  const name = itemName(view.itemId);
  const out: FeedbackLine[] = [];
  const key: TranslationKey = view.masterwork
    ? 'hudChrome.crafting.result.masterwork'
    : view.count > 1
      ? 'hudChrome.crafting.result.batch'
      : 'hudChrome.crafting.result.single';
  out.push(line(t(key, { item: name, count: num(view.count) }), view.tone));
  if (view.masterwork && view.masterworkStats.length > 0) {
    out.push(
      line(
        t('hudChrome.crafting.result.masterworkStats', {
          stats: statBonusText(view.masterworkStats),
        }),
        'proc',
      ),
    );
  }
  if (view.signer) {
    out.push(line(t('hudChrome.crafting.result.makersBond', { name: view.signer }), 'info'));
  }
  if (view.signedReagentUsed) {
    out.push(line(t('hudChrome.crafting.result.signedReagent'), 'info'));
  }
  return out;
}

/**
 * Every reason a craft can be refused ON THE WIRE.
 *
 * The professions module's own `CraftDenyReason` is only the reagent arm; the
 * SERVER adds the three host-level refusals (an id no recipe table knows, a
 * player mid-cast, a dead player), which have no pure-core equivalent and are
 * still refusals the player has to be told about.
 */
export type CraftDeny = CraftDenyReason | 'unknown_recipe' | 'busy' | 'dead';

const CRAFT_DENY_KEY: Record<CraftDeny, TranslationKey> = {
  insufficient_materials: 'hudChrome.crafting.deny.insufficientMaterials',
  unknown_recipe: 'hudChrome.crafting.deny.unknownRecipe',
  busy: 'hudChrome.crafting.deny.busy',
  dead: 'hudChrome.crafting.deny.dead',
};

/**
 * The deny line for a refused craft. `short` is the reagent lines that came up
 * short; the line names the first one, because naming all of them turns a toast
 * into a paragraph and the window already lists every row in red.
 */
export function craftDenyLine(
  reason: CraftDeny,
  short: readonly { itemId: string; required: number; held: number }[] = [],
): FeedbackLine {
  const first = short[0];
  if (reason === 'insufficient_materials' && first) {
    return line(
      t('hudChrome.crafting.deny.insufficientNamed', {
        item: itemName(first.itemId),
        held: num(first.held),
        required: num(first.required),
      }),
      'warn',
    );
  }
  return line(t(CRAFT_DENY_KEY[reason]), 'warn');
}

/** The skill-up line for a craft, enchant or disenchant, or null when nothing
 *  was granted (a grey recipe teaches silently, by design). */
export function craftSkillUpLine(gain: {
  professionId: CraftingProfessionId;
  skillGain: number;
  nextSkill: number;
  maxSkill?: number;
}): FeedbackLine | null {
  const view = craftSkillUpView(gain);
  if (!view.show) return null;
  const profession = craftProfessionName(view.professionId);
  if (view.reachedCap) {
    return line(t('hudChrome.crafting.skillMastered', { profession }), view.tone);
  }
  return line(
    t('hudChrome.crafting.skillUp', { profession, skill: num(view.skill) }),
    view.tone,
  );
}

/** A craft profession's skill went up. Takes the authoritative event's own
 *  shape (the new value plus the ceiling), which the sim only emits when
 *  something was actually granted. */
export function craftProfessionSkillLine(
  professionId: CraftingProfessionId,
  skill: number,
  maxSkill: number,
): FeedbackLine {
  const profession = craftProfessionName(professionId);
  if (skill >= maxSkill) {
    return line(t('hudChrome.crafting.skillMastered', { profession }), 'good');
  }
  return line(t('hudChrome.crafting.skillUp', { profession, skill: num(skill) }), 'info');
}

// ---------------------------------------------------------------------------
// Enchanting
// ---------------------------------------------------------------------------

/** The success line for an apply. A destructive replace names BOTH enchants:
 *  the player agreed to destroy one, so the log has to record which. */
export function enchantResultLine(result: {
  enchantId: string;
  itemId?: string;
  replaced?: boolean;
  replacedEnchantId?: string;
}): FeedbackLine {
  const enchant = enchantName(result.enchantId);
  const item = itemName(result.itemId ?? '');
  if (result.replaced === true && result.replacedEnchantId !== undefined) {
    return line(
      t('hudChrome.enchanting.result.replaced', {
        enchant,
        item,
        destroyed: enchantName(result.replacedEnchantId),
      }),
      'good',
    );
  }
  return line(t('hudChrome.enchanting.result.applied', { enchant, item }), 'good');
}

/** Every reason an apply can be refused on the wire: the pure core's five gates
 *  plus the three host-level refusals the server adds. */
export type EnchantDeny = EnchantDenyReason | 'unknown_enchant' | 'busy' | 'dead';

const ENCHANT_DENY_KEY: Record<EnchantDeny, TranslationKey> = {
  not_held: 'hudChrome.enchanting.deny.notHeld',
  wrong_slot: 'hudChrome.enchanting.deny.wrongSlot',
  insufficient_materials: 'hudChrome.enchanting.deny.insufficientMaterials',
  already_enchanted: 'hudChrome.enchanting.deny.alreadyEnchanted',
  same_enchant: 'hudChrome.enchanting.deny.sameEnchant',
  unknown_enchant: 'hudChrome.enchanting.deny.unknownEnchantId',
  busy: 'hudChrome.enchanting.deny.busy',
  dead: 'hudChrome.enchanting.deny.dead',
};

/**
 * The deny line for a refused apply.
 *
 * `already_enchanted` is not really a refusal, it is a question: the sim is
 * telling the client to raise the destructive confirmation. Its line says so,
 * rather than reading as a dead end.
 */
export function enchantDenyLine(reason: EnchantDeny, itemId?: string): FeedbackLine {
  if (reason === 'wrong_slot') {
    return line(
      t('hudChrome.enchanting.deny.wrongSlotNamed', { item: itemName(itemId ?? '') }),
      'warn',
    );
  }
  return line(t(ENCHANT_DENY_KEY[reason]), 'warn');
}

// ---------------------------------------------------------------------------
// Disenchanting
// ---------------------------------------------------------------------------

/** The lines one completed disenchant prints: what was destroyed, then each
 *  material recovered on its own line. */
export function disenchantResultLines(result: {
  itemId: string;
  materialItemId?: string;
  count?: number;
  secondaryItemId?: string;
  secondaryCount?: number;
}): FeedbackLine[] {
  const out: FeedbackLine[] = [
    line(t('hudChrome.enchanting.disenchant.unmade', { item: itemName(result.itemId) }), 'info'),
  ];
  if (result.materialItemId && result.count) {
    out.push(
      line(
        t('hudChrome.enchanting.disenchant.recovered', {
          item: itemName(result.materialItemId),
          count: num(result.count),
        }),
        'good',
      ),
    );
  }
  if (result.secondaryItemId && result.secondaryCount) {
    out.push(
      line(
        t('hudChrome.enchanting.disenchant.recovered', {
          item: itemName(result.secondaryItemId),
          count: num(result.secondaryCount),
        }),
        'good',
      ),
    );
  }
  return out;
}

export type DisenchantDeny = 'not_held' | 'not_disenchantable' | 'busy' | 'dead';

const DISENCHANT_DENY_KEY: Record<DisenchantDeny, TranslationKey> = {
  not_held: 'hudChrome.enchanting.disenchant.denyNotHeld',
  not_disenchantable: 'hudChrome.enchanting.disenchant.denyNotDisenchantable',
  busy: 'hudChrome.enchanting.disenchant.denyBusy',
  dead: 'hudChrome.enchanting.disenchant.denyDead',
};

export function disenchantDenyLine(reason: DisenchantDeny): FeedbackLine {
  return line(t(DISENCHANT_DENY_KEY[reason]), 'warn');
}

// ---------------------------------------------------------------------------
// Item-tooltip attribution
// ---------------------------------------------------------------------------

/**
 * The per-line attribution block an enchanted / masterwork / signed copy adds
 * to its item tooltip.
 *
 * This is the answer to the vague "Enchanted" badge: the block NAMES the
 * enchant, lists the stats that came from it on their own lines, lists the
 * masterwork bake's stats separately, and prints the maker's bond. A player can
 * therefore read which points on the tooltip are the item's and which are the
 * enchanter's, which is exactly what the old badge hid.
 *
 * Returns an empty string for an ordinary copy, so the caller can concatenate
 * unconditionally.
 */
export function instanceAttributionHtml(
  instance: ItemInstance | undefined,
  enchantBonus?: EnchantStatBonus,
): string {
  const view = instanceStatAttribution(instance, enchantBonus);
  if (!view.hasAny) return '';
  let html = '';
  if (view.enchantId !== null) {
    html += `<div class="tt-green">${esc(
      t('hudChrome.enchanting.tooltip.enchanted', { enchant: enchantName(view.enchantId) }),
    )}</div>`;
    for (const entry of view.enchantLines) {
      html += `<div class="tt-green">${esc(
        t('hudChrome.enchanting.tooltip.fromEnchant', {
          value: num(entry.value),
          stat: statBonusLabel(entry.stat),
        }),
      )}</div>`;
    }
  }
  if (view.masterwork) {
    html += `<div class="tt-stat">${esc(t('hudChrome.crafting.tooltip.masterwork'))}</div>`;
    for (const entry of view.masterworkLines) {
      html += `<div class="tt-green">${esc(
        t('hudChrome.crafting.tooltip.fromMasterwork', {
          value: num(entry.value),
          stat: statBonusLabel(entry.stat),
        }),
      )}</div>`;
    }
  }
  if (view.signer) {
    html += `<div class="tt-sub">${esc(
      t('hudChrome.crafting.tooltip.makersBond', { name: view.signer }),
    )}</div>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// The destructive confirmations
// ---------------------------------------------------------------------------

/** The four strings Hud's `confirmDialog` takes. */
export interface ConfirmText {
  title: string;
  body: string;
  okText: string;
  cancelText: string;
}

/** "1 Arcane Shard, 2 Arcane Essence", a reagent cost as one readable clause. */
export function reagentCostText(
  cost: readonly { itemId: string; required: number }[],
): string {
  return cost
    .map((row) =>
      t('hudChrome.crafting.reagentCost', {
        count: num(row.required),
        item: itemName(row.itemId),
      }),
    )
    .join(t('hudChrome.crafting.listJoin'));
}

/**
 * The destructive REPLACE confirmation.
 *
 * It has to do four things the old vague UI did not: name the enchant being
 * destroyed, name the one arriving, state the exact reagent cost, and say
 * plainly that the old materials are gone and the swap cannot be undone. The
 * title carries the word "destroy" so the dialog is marked as destructive by
 * its text and not only by its colour.
 */
export function enchantReplaceConfirmText(view: EnchantReplaceConfirmView): ConfirmText {
  const destroyed = enchantName(view.destroyedEnchantId);
  const arriving = enchantName(view.enchantId);
  const item = itemName(view.itemId ?? '');
  const gaining = statBonusText(view.gaining);
  const body = [
    t('hudChrome.enchanting.replace.bodyDestroys', { destroyed, item }),
    t('hudChrome.enchanting.replace.bodyApplies', { enchant: arriving, stats: gaining }),
    t('hudChrome.enchanting.replace.bodyCost', { cost: reagentCostText(view.cost) }),
    t('hudChrome.enchanting.replace.warningNotRefunded'),
    t('hudChrome.enchanting.replace.warningCannotUndo'),
  ].join(' ');
  return {
    title: t('hudChrome.enchanting.replace.title', { destroyed }),
    body,
    okText: t('hudChrome.enchanting.replace.confirm'),
    cancelText: t('hudChrome.enchanting.replace.cancel'),
  };
}

/**
 * The DISENCHANT confirmation, which previews what the piece breaks down into:
 * a range on the ladder material (the sim's one draw is a +0/+1 bonus unit) and
 * an exact count on the typed weave, which is draw-free.
 */
export function disenchantConfirmText(view: DisenchantPreviewView): ConfirmText {
  const item = itemName(view.itemId);
  const material = view.exactMaterial
    ? t('hudChrome.enchanting.disenchant.yieldExact', {
        count: num(view.minCount),
        item: itemName(view.materialItemId),
      })
    : t('hudChrome.enchanting.disenchant.yieldRange', {
        min: num(view.minCount),
        max: num(view.maxCount),
        item: itemName(view.materialItemId),
      });
  const parts = [t('hudChrome.enchanting.disenchant.bodyYield', { material })];
  if (view.secondaryItemId !== undefined && view.secondaryCount !== undefined) {
    parts.push(
      t('hudChrome.enchanting.disenchant.bodySecondary', {
        secondary: t('hudChrome.enchanting.disenchant.yieldExact', {
          count: num(view.secondaryCount),
          item: itemName(view.secondaryItemId),
        }),
      }),
    );
  }
  parts.push(t('hudChrome.enchanting.disenchant.warningDestroyed'));
  parts.push(t('hudChrome.enchanting.disenchant.warningCannotUndo'));
  return {
    title: t('hudChrome.enchanting.disenchant.title', { item }),
    body: parts.join(' '),
    okText: t('hudChrome.enchanting.disenchant.confirm'),
    cancelText: t('hudChrome.enchanting.disenchant.cancel'),
  };
}

// ---------------------------------------------------------------------------
// The SimEvent adapter
// ---------------------------------------------------------------------------

/** The crafting-related event variants this module renders. Mirrors wave 1's
 *  `GatheringFeedbackEvent`: a structural union, not the `SimEvent` type, so
 *  this module never depends on the exact shape of the engine's union. */
export type CraftingFeedbackEvent =
  | ({ type: 'craftResult' } & CraftResultInput)
  | {
      type: 'craftDeny';
      recipeId?: string;
      professionId?: string;
      reason: CraftDeny;
      reagents?: readonly { itemId: string; required: number; held: number; met: boolean }[];
    }
  // Shared with the gathering wave: one event carries every profession's skill,
  // and the id decides which half renders it.
  | { type: 'craftSkill'; professionId: string; skill: number; maxSkill: number }
  | {
      type: 'enchantResult';
      enchantId: string;
      itemId?: string;
      where?: 'worn' | 'bag';
      replacedEnchantId?: string;
    }
  | { type: 'enchantDeny'; enchantId?: string; itemId?: string; reason: EnchantDeny }
  | {
      type: 'disenchantResult';
      itemId: string;
      materialItemId?: string;
      count?: number;
      secondaryItemId?: string;
      secondaryCount?: number;
    }
  | { type: 'disenchantDeny'; itemId?: string; reason: DisenchantDeny };

const CRAFTING_EVENT_TYPES = new Set<string>([
  'craftResult',
  'craftDeny',
  'craftSkill',
  'enchantResult',
  'enchantDeny',
  'disenchantResult',
  'disenchantDeny',
]);

/** True when `type` names an event this module renders. Lets the HUD's event
 *  arms route without re-listing the variants at the call site. */
export function isCraftingFeedbackEventType(type: string): boolean {
  return CRAFTING_EVENT_TYPES.has(type);
}

/** Extra context the events themselves do not carry. */
export interface CraftingFeedbackContext {
  /** The local player's name, stamped as the maker's bond on a signable output.
   *  The sim grants the copy silently, so the name never rides the event. */
  crafterName?: string;
}

/**
 * Render one crafting event into the lines the HUD logs, so composing the whole
 * feature into `handleEvents` is a single arm. Returns an empty list for an
 * event that produces no player line (a GATHERING profession's skill tick,
 * which wave 1's adapter owns) rather than throwing mid-frame.
 */
export function craftingEventLines(
  ev: CraftingFeedbackEvent,
  ctx: CraftingFeedbackContext = {},
): FeedbackLine[] {
  switch (ev.type) {
    case 'craftResult':
      return craftResultLines({ ...ev, signer: ev.signer ?? ctx.crafterName });
    case 'craftDeny':
      return [craftDenyLine(ev.reason, (ev.reagents ?? []).filter((r) => !r.met))];
    case 'craftSkill':
      if (!isCraftingProfessionId(ev.professionId)) return [];
      return [craftProfessionSkillLine(ev.professionId, ev.skill, ev.maxSkill)];
    case 'enchantResult':
      return [
        enchantResultLine({
          enchantId: ev.enchantId,
          itemId: ev.itemId,
          replaced: ev.replacedEnchantId !== undefined,
          replacedEnchantId: ev.replacedEnchantId,
        }),
      ];
    case 'enchantDeny':
      return [enchantDenyLine(ev.reason, ev.itemId)];
    case 'disenchantResult':
      return disenchantResultLines(ev);
    case 'disenchantDeny':
      return [disenchantDenyLine(ev.reason)];
  }
}

export { CRAFT_TONE_COLOR };
