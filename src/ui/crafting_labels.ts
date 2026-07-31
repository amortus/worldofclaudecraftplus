// Shared localized labels for the four craft professions and the enchant table.
//
// The crafting-side twin of wave 1's profession_labels.ts: one place that maps
// the sim's stable ids (`CraftingProfessionId`, an enchant id, an `EnchantGroup`,
// a `Stats` key) onto `t()` keys, so the Crafting window, the Apply Enchant
// list, the confirmations, the item tooltip and every chat line quote the same
// words. Kept out of the pure view modules on purpose: those stay i18n-free.
//
// Every key here lives in the English-only `hudChrome` catalog domain
// (src/ui/i18n.catalog/hud_chrome.ts), which is what makes an English-only
// contribution compile. The item NAMES the windows print are entity names and
// resolve through entity_i18n.ts (`itemDisplayName`) instead, exactly as wave
// 1's materials do.

import { hasTranslation, t, type TranslationKey } from './i18n';
import type { CraftingProfessionId, MasteryState } from './crafting_ui_view';
import { craftMasteryColor } from './crafting_ui_view';
import type { EnchantGroup } from './enchanting_ui_view';
import type { Stats } from '../sim/types';

// ---------------------------------------------------------------------------
// Craft professions
// ---------------------------------------------------------------------------

const CRAFT_NAME_KEY: Record<CraftingProfessionId, TranslationKey> = {
  smithing: 'hudChrome.crafting.names.smithing',
  woodcraft: 'hudChrome.crafting.names.woodcraft',
  alchemy: 'hudChrome.crafting.names.alchemy',
  enchanting: 'hudChrome.crafting.names.enchanting',
};

const CRAFT_DESC_KEY: Record<CraftingProfessionId, TranslationKey> = {
  smithing: 'hudChrome.crafting.descriptions.smithing',
  woodcraft: 'hudChrome.crafting.descriptions.woodcraft',
  alchemy: 'hudChrome.crafting.descriptions.alchemy',
  enchanting: 'hudChrome.crafting.descriptions.enchanting',
};

export function craftProfessionName(id: CraftingProfessionId): string {
  return t(CRAFT_NAME_KEY[id]);
}

export function craftProfessionDescription(id: CraftingProfessionId): string {
  return t(CRAFT_DESC_KEY[id]);
}

// ---------------------------------------------------------------------------
// Enchants
// ---------------------------------------------------------------------------

const ENCHANT_GROUP_KEY: Record<EnchantGroup, TranslationKey> = {
  base: 'hudChrome.enchanting.groups.base',
  runed: 'hudChrome.enchanting.groups.runed',
  greater: 'hudChrome.enchanting.groups.greater',
};

/** The Base / Runed / Greater section heading. */
export function enchantGroupLabel(group: EnchantGroup): string {
  return t(ENCHANT_GROUP_KEY[group]);
}

const ENCHANT_GROUP_BLURB_KEY: Record<EnchantGroup, TranslationKey> = {
  base: 'hudChrome.enchanting.groupBlurbs.base',
  runed: 'hudChrome.enchanting.groupBlurbs.runed',
  greater: 'hudChrome.enchanting.groupBlurbs.greater',
};

/** One line under a section heading saying what that rung costs to buy. */
export function enchantGroupBlurb(group: EnchantGroup): string {
  return t(ENCHANT_GROUP_BLURB_KEY[group]);
}

/**
 * The localized name of one enchant.
 *
 * Keyed by the enchant's own stable id under `hudChrome.enchanting.names.*`
 * (all 36 rows of `ENCHANTS` have a key). An id no catalog row knows is only
 * reachable from a hand-edited save or a newer server, and resolves to the
 * generic "an unknown enchantment" line rather than leaking a raw id into a
 * confirmation that is about to destroy something.
 */
export function enchantName(enchantId: string): string {
  const key = `hudChrome.enchanting.names.${enchantId}`;
  if (hasTranslation(key)) return t(key as TranslationKey);
  return t('hudChrome.enchanting.unknownEnchant');
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** The localized name of a stat axis, from the shared item-stat catalog so an
 *  enchant line and an item tooltip line read identically. */
export function statBonusLabel(stat: keyof Stats): string {
  return t(`itemUi.stats.${stat}` as TranslationKey);
}

// ---------------------------------------------------------------------------
// Crafted elixir auras
// ---------------------------------------------------------------------------

// The four alchemy elixirs stamp an aura whose name is authored as source
// English in `src/sim/content/professions/craft_recipes.ts` (the sim stays
// language-agnostic). The buff frame and the combat log surface that raw name,
// so it needs the same client-side resolver wave 1's Unstuck Sickness debuff
// uses: an English-keyed lookup that runs before the shared sim matcher.
const ELIXIR_AURA_KEY: Readonly<Record<string, TranslationKey>> = {
  'Silver Vigor': 'hudChrome.crafting.auras.silverVigor',
  'Golden Focus': 'hudChrome.crafting.auras.goldenFocus',
  'Sunpetal Swiftness': 'hudChrome.crafting.auras.sunpetalSwiftness',
  'Ashen Ward': 'hudChrome.crafting.auras.ashenWard',
};

/** The localized name of a crafted elixir's aura, or null when the name is not
 *  one of the four this wave adds (the caller then falls through to its own
 *  resolvers). */
export function localizeCraftedElixirAuraName(name: string): string | null {
  const key = ELIXIR_AURA_KEY[name];
  return key ? t(key) : null;
}

export { craftMasteryColor };
export type { CraftingProfessionId, EnchantGroup, MasteryState };
