import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_TONE_COLOR,
  fishingBiteView,
  gatherDenyView,
  harvestResultView,
  MATERIAL_RARITY_COLOR,
  reelOutcomeView,
  skillUpView,
} from '../src/ui/gathering_feedback_view';
import {
  UNSTUCK_URGENT_SECONDS,
  unstuckBlockedView,
  unstuckCancelledView,
  unstuckCompletedView,
  unstuckCountdownView,
  unstuckStartedView,
} from '../src/ui/unstuck_feedback_view';
import type { GatherStart, MaterialRarity, ReelOutcome } from '../src/sim/professions';
import { en } from '../src/ui/i18n.catalog';

const RARITIES: MaterialRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

describe('harvest result line', () => {
  it('colours the line by the ROLLED rarity, one distinct colour per tier', () => {
    const colors = RARITIES.map((rarity) => harvestResultView({ itemId: 'copper_ore', qty: 1, rarity }).color);
    expect(new Set(colors).size).toBe(RARITIES.length);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(harvestResultView({ itemId: 'copper_ore', qty: 1, rarity: 'legendary' }).color).toBe(
      MATERIAL_RARITY_COLOR.legendary,
    );
  });

  it('has no colour for poor: a harvested material is never junk-grade', () => {
    expect(Object.keys(MATERIAL_RARITY_COLOR)).toEqual(RARITIES);
  });

  it('flags anything above common as notable, so the richer line is used', () => {
    expect(harvestResultView({ itemId: 'x', qty: 1, rarity: 'common' }).notable).toBe(false);
    expect(harvestResultView({ itemId: 'x', qty: 2, rarity: 'uncommon' }).notable).toBe(true);
    expect(harvestResultView({ itemId: 'x', qty: 4, rarity: 'legendary' }).notable).toBe(true);
  });

  it('floors the quantity at one whole unit', () => {
    expect(harvestResultView({ itemId: 'x', qty: 0, rarity: 'common' }).qty).toBe(1);
    expect(harvestResultView({ itemId: 'x', qty: 2.7, rarity: 'rare' }).qty).toBe(2);
  });
});

describe('skill-up line', () => {
  it('prints nothing for a zero gain: grayed-out content grays out silently', () => {
    const view = skillUpView({ professionId: 'mining', skillGain: 0, nextProficiency: 90, maxSkill: 100 });
    expect(view.show).toBe(false);
    expect(view.gain).toBe(0);
  });

  it('prints the new proficiency for a real gain', () => {
    const view = skillUpView({ professionId: 'mining', skillGain: 1, nextProficiency: 41, maxSkill: 100 });
    expect(view.show).toBe(true);
    expect(view.skill).toBe(41);
    expect(view.reachedCap).toBe(false);
    expect(view.tone).toBe('info');
  });

  it('announces the one-time cap and switches tone', () => {
    const view = skillUpView({ professionId: 'fishing', skillGain: 0.5, nextProficiency: 200, maxSkill: 200 });
    expect(view.reachedCap).toBe(true);
    expect(view.tone).toBe('good');
  });

  it('never reports a proficiency past the ceiling', () => {
    const view = skillUpView({ professionId: 'mining', skillGain: 1, nextProficiency: 140, maxSkill: 100 });
    expect(view.skill).toBe(100);
  });
});

describe('harvest denial', () => {
  const start = (over: Partial<GatherStart>): GatherStart => ({
    ok: false,
    professionId: 'mining',
    requiredTier: 3,
    ...over,
  });

  it('produces no line for a harvest that passed the gates', () => {
    expect(gatherDenyView({ ok: true, professionId: 'mining', requiredTier: 1, castSeconds: 2 })).toBe(null);
  });

  it('carries the required tier on every deny reason, including the timer arm', () => {
    for (const reason of ['no_tool', 'tool_tier', 'not_ready'] as const) {
      expect(gatherDenyView(start({ reason, readyInSec: 4 }))!.requiredTier).toBe(3);
    }
  });

  it('only the not_ready arm carries a countdown', () => {
    expect(gatherDenyView(start({ reason: 'no_tool' }))!.readyInSec).toBeUndefined();
    expect(gatherDenyView(start({ reason: 'tool_tier' }))!.readyInSec).toBeUndefined();
    expect(gatherDenyView(start({ reason: 'not_ready', readyInSec: 4.2 }))!.readyInSec).toBe(5);
  });

  it('never counts down to zero seconds or a fraction', () => {
    expect(gatherDenyView(start({ reason: 'not_ready', readyInSec: 0.01 }))!.readyInSec).toBe(1);
    expect(gatherDenyView(start({ reason: 'not_ready', readyInSec: 0 }))!.readyInSec).toBe(1);
  });
});

describe('fishing bite and reel', () => {
  it('reports the reel window the rod bought', () => {
    expect(fishingBiteView(4.5)).toEqual({ windowSec: 4.5, tone: 'cue' });
    expect(fishingBiteView(-1).windowSec).toBe(0);
  });

  it('marks only a landed reel as a catch, and both misses as warnings', () => {
    const outcomes: ReelOutcome[] = ['too_early', 'landed', 'too_late'];
    expect(outcomes.map((o) => reelOutcomeView(o).landed)).toEqual([false, true, false]);
    expect(outcomes.map((o) => reelOutcomeView(o).tone)).toEqual(['warn', 'good', 'warn']);
  });

  it('has authored copy for all three reel outcomes and the bite cue', () => {
    const reel = en.hudChrome.professions.fishing.reel;
    expect(reel.tooEarly).toBeTruthy();
    expect(reel.landed).toBeTruthy();
    expect(reel.tooLate).toBeTruthy();
    expect(en.hudChrome.professions.fishing.bite).toBeTruthy();
  });
});

describe('unstuck feedback', () => {
  it('rounds the opening countdown to whole seconds', () => {
    expect(unstuckStartedView(10).seconds).toBe(10);
    expect(unstuckStartedView(9.6).seconds).toBe(10);
    expect(unstuckStartedView(-2).seconds).toBe(0);
  });

  it('turns the countdown urgent for its last few seconds only', () => {
    expect(unstuckCountdownView(10).urgent).toBe(false);
    expect(unstuckCountdownView(UNSTUCK_URGENT_SECONDS + 1).urgent).toBe(false);
    expect(unstuckCountdownView(UNSTUCK_URGENT_SECONDS).urgent).toBe(true);
    expect(unstuckCountdownView(1).urgent).toBe(true);
    expect(unstuckCountdownView(0).urgent).toBe(false);
    expect(unstuckCountdownView(2).tone).toBe('cue');
  });

  it('attaches a whole-second cooldown to the cooldown block and to nothing else', () => {
    expect(unstuckBlockedView('cooldown', 12.3).cooldownSeconds).toBe(13);
    expect(unstuckBlockedView('cooldown', 0).cooldownSeconds).toBe(1);
    expect(unstuckBlockedView('combat', 12).cooldownSeconds).toBeUndefined();
    expect(unstuckBlockedView('moving').cooldownSeconds).toBeUndefined();
  });

  it('separates the two completion outcomes and the revive flag', () => {
    const moved = unstuckCompletedView({ outcome: 'moved_to_graveyard', sicknessSeconds: 0 });
    expect(moved.revived).toBe(false);
    expect(moved.sickened).toBe(false);
    const revived = unstuckCompletedView({ outcome: 'revived_at_graveyard', sicknessSeconds: 300 });
    expect(revived.revived).toBe(true);
    expect(revived.sickened).toBe(true);
    expect(revived.sicknessSeconds).toBe(300);
  });

  it('has authored copy for every blocked reason, cancel reason and outcome', () => {
    const u = en.hudChrome.unstuck;
    const blocked: Array<keyof typeof u.blocked> = [
      'already_active',
      'cooldown',
      'combat',
      'controlled',
      'falling',
      'moving',
      'busy',
      'competitive',
      'trading',
    ];
    for (const reason of blocked) expect(u.blocked[reason], reason).toBeTruthy();
    const cancels: Array<keyof typeof u.cancelled> = [
      'moved',
      'damaged',
      'combat',
      'busy',
      'state_changed',
      'disconnected',
    ];
    for (const reason of cancels) expect(u.cancelled[reason], reason).toBeTruthy();
    expect(u.completed.moved_to_graveyard).toBeTruthy();
    expect(u.completed.revived_at_graveyard).toBeTruthy();
    expect(u.sicknessAura).toBe('Unstuck Sickness');
  });

  it('keeps every cancel reason a distinct sentence', () => {
    const values = Object.values(en.hudChrome.unstuck.cancelled);
    expect(new Set(values).size).toBe(values.length);
    for (const reason of ['moved', 'damaged', 'combat', 'busy', 'state_changed', 'disconnected'] as const) {
      expect(unstuckCancelledView(reason).tone).toBe('warn');
    }
  });
});

describe('the shared tone palette', () => {
  it('gives each tone one hex colour', () => {
    const tones = Object.keys(FEEDBACK_TONE_COLOR);
    expect(tones).toEqual(['info', 'good', 'warn', 'bad', 'cue']);
    for (const tone of tones) {
      expect(FEEDBACK_TONE_COLOR[tone as keyof typeof FEEDBACK_TONE_COLOR]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('profession copy', () => {
  it('names and describes all four professions', () => {
    for (const id of ['mining', 'logging', 'herbalism', 'fishing'] as const) {
      expect(en.hudChrome.professions.names[id]).toBeTruthy();
      expect(en.hudChrome.professions.descriptions[id]).toBeTruthy();
    }
  });

  it('labels all four mastery states plus the "no longer improves" hint', () => {
    for (const state of ['full', 'reduced', 'minimal', 'none'] as const) {
      expect(en.hudChrome.professions.mastery[state]).toBeTruthy();
    }
    expect(en.hudChrome.professions.masteryNoneHint).toBe('This no longer improves your skill.');
  });

  it('has a line for each of the three harvest deny reasons', () => {
    const deny = en.hudChrome.professions.deny;
    expect(deny.noTool).toBeTruthy();
    expect(deny.toolTier).toContain('{tier}');
    expect(deny.notReady).toContain('{seconds}');
  });

  it('states the tool-tier requirement with both placeholders', () => {
    expect(en.hudChrome.professions.requirement).toBe('Requires {profession} tool tier {tier}');
  });
});
