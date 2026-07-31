// Thin i18n consumer for the gathering feedback surfaces.
//
// The consumer half of the split: every decision (tone, colour, whether a line
// is worth printing at all, which numbers survive rounding) was already made by
// gathering_feedback_view.ts. This module only turns those structures into
// localized text, formats every number through `formatNumber`, and hands the
// caller a `{ text, color }` pair it can drop straight into the combat log, a
// toast, or a tooltip.
//
// It renders the node TOOLTIP too, since that line is the same requirement the
// deny message quotes and the two must never disagree.

import { esc } from './esc';
import { gatherNodeDisplayName, itemDisplayName } from './entity_i18n';
import {
  FEEDBACK_TONE_COLOR,
  type FeedbackTone,
  fishingBiteView,
  gatherDenyView,
  harvestResultView,
  type MaterialRarity,
  reelOutcomeView,
  skillUpView,
} from './gathering_feedback_view';
import { formatNumber, t, type TranslationKey } from './i18n';
import { masteryColor, masteryLabel, professionName } from './profession_labels';
import { gatherRequirementView, masteryStateForContent } from './skills_panel_view';
import {
  type GatherNodeDef,
  type GatherStart,
  type GatheringProfessionId,
  isGatheringProfessionId,
  type ReelOutcome,
} from '../sim/professions';
import { ITEMS } from '../sim/data';

/** A ready-to-print feedback line. */
export interface FeedbackLine {
  text: string;
  color: string;
}

function line(text: string, tone: FeedbackTone): FeedbackLine {
  return { text, color: FEEDBACK_TONE_COLOR[tone] };
}

function num(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

/**
 * The harvest result line. It is coloured by the ROLLED rarity rather than by a
 * tone, because that colour is the whole point: a legendary roll off a common
 * material has to read as a legendary roll.
 */
export function harvestResultLine(result: {
  itemId: string;
  qty: number;
  rarity: MaterialRarity;
}): FeedbackLine {
  const view = harvestResultView(result);
  const item = ITEMS[view.itemId];
  const name = item ? itemDisplayName(item) : view.itemId;
  const key: TranslationKey = view.notable
    ? 'hudChrome.professions.harvest.resultRich'
    : 'hudChrome.professions.harvest.result';
  return { text: t(key, { item: name, count: num(view.qty) }), color: view.color };
}

/**
 * The skill-up line, or null when nothing was granted. A zero gain is silence
 * by design: the four-state curve grays content out without a message.
 */
export function skillUpLine(gain: {
  professionId: GatheringProfessionId;
  skillGain: number;
  nextProficiency: number;
  maxSkill: number;
}): FeedbackLine | null {
  const view = skillUpView(gain);
  if (!view.show) return null;
  const name = professionName(view.professionId);
  if (view.reachedCap) {
    return line(t('hudChrome.professions.skillMastered', { profession: name }), view.tone);
  }
  return line(
    t('hudChrome.professions.skillUp', { profession: name, skill: num(view.skill) }),
    view.tone,
  );
}

/** The deny line for a refused harvest, or null for a `GatherStart` that passed. */
export function gatherDenyLine(start: GatherStart): FeedbackLine | null {
  const view = gatherDenyView(start);
  if (!view) return null;
  const profession = professionName(view.professionId);
  if (view.reason === 'no_tool') {
    return line(t('hudChrome.professions.deny.noTool', { profession }), view.tone);
  }
  if (view.reason === 'tool_tier') {
    return line(
      t('hudChrome.professions.deny.toolTier', { profession, tier: num(view.requiredTier) }),
      view.tone,
    );
  }
  return line(
    t('hudChrome.professions.deny.notReady', { seconds: num(view.readyInSec ?? 1) }),
    view.tone,
  );
}

// ---------------------------------------------------------------------------
// Node tooltip
// ---------------------------------------------------------------------------

/** The tool-tier requirement line for one node, plus whether it is satisfied. */
export function gatherRequirementLine(
  professionId: GatheringProfessionId,
  requiredTier: number,
  toolTier: number,
): { text: string; met: boolean } {
  const view = gatherRequirementView(professionId, requiredTier, toolTier);
  return {
    text: t('hudChrome.professions.requirement', {
      profession: professionName(professionId),
      tier: num(view.requiredTier),
    }),
    met: view.meets,
  };
}

/**
 * The hover tooltip for a gatherable world node: its localized name, the tool
 * tier it demands (green when the carried tool serves, red when it does not),
 * and what working it is still worth on the four-state mastery curve.
 */
export function gatherNodeTooltipHtml(
  node: GatherNodeDef,
  professionId: GatheringProfessionId,
  toolTier: number,
  proficiency: number,
): string {
  const req = gatherRequirementLine(professionId, node.tier, toolTier);
  const state = masteryStateForContent(professionId, proficiency, node.tier);
  const verdict = t(
    req.met ? 'hudChrome.professions.requirementMet' : 'hudChrome.professions.requirementUnmet',
  );
  return (
    `<div class="tt-name">${esc(gatherNodeDisplayName(node.id))}</div>` +
    `<div class="${req.met ? 'tt-sub' : 'tt-red'}">${esc(req.text)}</div>` +
    `<div class="${req.met ? 'tt-sub' : 'tt-red'}">${esc(verdict)}</div>` +
    `<div class="tt-sub" style="color:${esc(masteryColor(state))}">${esc(masteryLabel(state))}</div>` +
    (state === 'none'
      ? `<div class="tt-sub">${esc(t('hudChrome.professions.masteryNoneHint'))}</div>`
      : '')
  );
}

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

/** The bite cue. `reelWindowSeconds` is what the equipped rod bought. */
export function fishingBiteLine(reelWindowSeconds: number): FeedbackLine {
  const view = fishingBiteView(reelWindowSeconds);
  return line(t('hudChrome.professions.fishing.bite'), view.tone);
}

/** The accessible name for the bite cue widget, spoken the moment it appears. */
export function fishingBiteAria(): string {
  return t('hudChrome.professions.fishing.biteAria');
}

/** The countdown label on the bite cue, e.g. "3s to reel". */
export function fishingBiteWindowLabel(reelWindowSeconds: number): string {
  return t('hudChrome.professions.fishing.biteWindow', {
    seconds: formatNumber(Math.max(0, reelWindowSeconds), { maximumFractionDigits: 1 }),
  });
}

const REEL_KEY: Record<ReelOutcome, TranslationKey> = {
  too_early: 'hudChrome.professions.fishing.reel.tooEarly',
  landed: 'hudChrome.professions.fishing.reel.landed',
  too_late: 'hudChrome.professions.fishing.reel.tooLate',
};

/** One of the three reel outcomes. */
export function reelOutcomeLine(outcome: ReelOutcome): FeedbackLine {
  const view = reelOutcomeView(outcome);
  return line(t(REEL_KEY[view.outcome]), view.tone);
}

/**
 * A fish that got away. `timeout` (the window closed with no reel at all) is a
 * different miss from `too_late` (a reel that came after the window), so it gets
 * its own line rather than borrowing one that blames the player for pulling.
 */
export function fishingEscapedLine(reason?: 'too_early' | 'too_late' | 'timeout'): FeedbackLine {
  if (reason === 'too_early' || reason === 'too_late') return reelOutcomeLine(reason);
  return line(t('hudChrome.professions.fishing.reel.timeout'), 'warn');
}

/** Casting with no rod in the bags. */
export function fishingNoTackleLine(): FeedbackLine {
  return line(t('hudChrome.professions.fishing.noTackle'), 'warn');
}

/**
 * A profession's proficiency went up. Takes the `professionSkill` event's own
 * shape (the new value plus the ceiling), since the sim only emits it when
 * something was actually granted.
 */
export function professionSkillLine(
  professionId: GatheringProfessionId,
  skill: number,
  maxSkill: number,
): FeedbackLine {
  const profession = professionName(professionId);
  if (skill >= maxSkill) {
    return line(t('hudChrome.professions.skillMastered', { profession }), 'good');
  }
  return line(t('hudChrome.professions.skillUp', { profession, skill: num(skill) }), 'info');
}

// ---------------------------------------------------------------------------
// The SimEvent adapter
// ---------------------------------------------------------------------------

/** The gathering-related `SimEvent` variants this module renders. */
export type GatheringFeedbackEvent =
  | {
      type: 'gatherDeny';
      nodeId: string;
      professionId: string;
      reason: 'no_tool' | 'tool_tier' | 'not_ready';
      requiredTier: number;
      readyInSec?: number;
    }
  | {
      type: 'gatherHarvest';
      nodeId: string;
      professionId: string;
      itemId: string;
      rarity: MaterialRarity;
      qty: number;
    }
  | { type: 'professionSkill'; professionId: string; skill: number; maxSkill: number }
  | { type: 'fishing'; phase: 'bite' | 'landed' | 'escaped' | 'no_tackle'; reason?: string };

/** Extra context the SimEvents themselves do not carry. */
export interface GatheringFeedbackContext {
  /**
   * The reel window the equipped rod bought, in seconds. The `fishing`/`bite`
   * event carries no duration, so the caller derives it once with
   * `reelWindowSec(bestOwnedGatherToolTier(inventory, 'fishing', GATHER_TOOLS))`.
   */
  reelWindowSeconds?: number;
}

/**
 * Render one gathering `SimEvent` into the lines the HUD logs, so composing the
 * whole feature into `handleEvents` is a single arm. Returns an empty list for
 * an event that produces no player line (an unknown profession id from a newer
 * server, for instance) rather than throwing mid-frame.
 */
export function gatheringEventLines(
  ev: GatheringFeedbackEvent,
  ctx: GatheringFeedbackContext = {},
): FeedbackLine[] {
  switch (ev.type) {
    case 'gatherDeny': {
      if (!isGatheringProfessionId(ev.professionId)) return [];
      const deny = gatherDenyLine({
        ok: false,
        professionId: ev.professionId,
        requiredTier: ev.requiredTier,
        reason: ev.reason,
        readyInSec: ev.readyInSec,
      });
      return deny ? [deny] : [];
    }
    case 'gatherHarvest':
      return [harvestResultLine({ itemId: ev.itemId, qty: ev.qty, rarity: ev.rarity })];
    case 'professionSkill':
      if (!isGatheringProfessionId(ev.professionId)) return [];
      return [professionSkillLine(ev.professionId, ev.skill, ev.maxSkill)];
    case 'fishing':
      if (ev.phase === 'bite') return [fishingBiteLine(ctx.reelWindowSeconds ?? 0)];
      if (ev.phase === 'landed') return [reelOutcomeLine('landed')];
      if (ev.phase === 'no_tackle') return [fishingNoTackleLine()];
      return [fishingEscapedLine(ev.reason as 'too_early' | 'too_late' | 'timeout' | undefined)];
  }
}

export { FEEDBACK_TONE_COLOR };
