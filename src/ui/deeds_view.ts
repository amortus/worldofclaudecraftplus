// Pure, host-agnostic view model for the Book of Deeds panel.
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts). Its input is the `DeedsView` readout
// the IWorld seam already publishes (`IWorld.deeds()`, implemented by both `Sim`
// and `ClientWorld`), so the panel never reaches past `IWorld` into the
// evaluator or the catalogue: the earned/total pair, the renown total and the
// per-deed bars all arrive already resolved by the one authoritative source.
//
// What this module adds on top of that flat readout is the three things the
// PANEL decides: which deeds a player may SEE (the hidden rule), how the visible
// ones group into the five category tabs, and what fraction each bar is filled.
//
// DOM-free and i18n-free: every label, including the category names and the deed
// names, is the consumer's business. tests/deeds_ui_view.test.ts drives it
// directly against the real readout.

import type { DeedCategory } from '../sim/deeds';
import type { DeedEntryView, DeedsView } from '../world_api';

/** The five categories, in the order the panel's tabs present them. */
export const DEED_CATEGORY_ORDER: readonly DeedCategory[] = [
  'progression',
  'combat',
  'exploration',
  'dungeon',
  'raid',
];

export interface DeedRowView {
  id: string;
  category: DeedCategory;
  /** Score this deed is worth. Zero is legal (a deed you cannot avoid earning). */
  renown: number;
  /** True for a deed that stays out of the book until it is earned. */
  hidden: boolean;
  complete: boolean;
  /** Progress numerator, clamped into [0, required]. */
  current: number;
  required: number;
  /** Progress as a 0..1 fraction; 1 whenever the deed is complete. */
  fraction: number;
  /** The same progress as a whole percent, 0..100 (bar width + aria value). */
  percent: number;
  /** A boolean deed (`required` is 1): the panel draws a check, not a bar. */
  binary: boolean;
  /** Title id this deed grants, if any (the stable `deed:` namespace). */
  titleId?: string;
}

export interface DeedCategoryView {
  category: DeedCategory;
  rows: DeedRowView[];
  /** Earned / visible totals WITHIN this category. */
  earned: number;
  total: number;
  /** Renown already banked from this category. */
  renown: number;
}

export interface DeedsPanelView {
  categories: DeedCategoryView[];
  /** The book-wide pair, taken straight from the IWorld readout. */
  completion: { earned: number; total: number };
  /** Total renown banked, taken straight from the IWorld readout. */
  renown: number;
  /** Every unlocked title id, in catalogue order. */
  titles: string[];
}

function rowFor(entry: DeedEntryView): DeedRowView {
  const required = entry.required > 0 ? entry.required : 1;
  const current = entry.earned ? required : Math.max(0, Math.min(entry.current, required));
  const fraction = current / required;
  return {
    id: entry.id,
    category: entry.category,
    renown: entry.renown,
    hidden: entry.hidden === true,
    complete: entry.earned,
    current,
    required,
    fraction,
    percent: Math.round(fraction * 100),
    binary: required === 1,
    ...(entry.titleId ? { titleId: entry.titleId } : {}),
  };
}

/**
 * Build the panel view from the IWorld chronicle readout.
 *
 * ROW VISIBILITY IS THE HIDDEN RULE: a deed flagged `hidden` is omitted entirely
 * until it is earned, so the book never advertises how many secrets are left.
 * Once earned it appears in its category like any other row. That is the same
 * masking the readout's own `earned`/`total` pair applies, which is why the two
 * always agree.
 *
 * Row order inside a category is the readout's order, which is the append-only
 * catalogue order, so two runs over the same inputs paint identical panels.
 */
export function buildDeedsPanelView(view: DeedsView): DeedsPanelView {
  const byCategory = new Map<DeedCategory, DeedCategoryView>();
  for (const category of DEED_CATEGORY_ORDER) {
    byCategory.set(category, { category, rows: [], earned: 0, total: 0, renown: 0 });
  }

  for (const entry of view.entries) {
    if (entry.hidden && !entry.earned) continue;
    // A row in an unknown category is skipped, never thrown on: a future
    // category must not blank the whole book on an older client.
    const bucket = byCategory.get(entry.category);
    if (!bucket) continue;
    bucket.rows.push(rowFor(entry));
    bucket.total++;
    if (entry.earned) {
      bucket.earned++;
      bucket.renown += entry.renown;
    }
  }

  return {
    categories: DEED_CATEGORY_ORDER.map((category) => byCategory.get(category) as DeedCategoryView),
    completion: { earned: view.earned, total: view.total },
    renown: view.renown,
    titles: [...view.titles],
  };
}

/** The rows of one category, or an empty list for a category with nothing visible. */
export function deedCategoryRows(view: DeedsPanelView, category: DeedCategory): DeedRowView[] {
  return view.categories.find((c) => c.category === category)?.rows ?? [];
}

export type { DeedCategory, DeedsView };
