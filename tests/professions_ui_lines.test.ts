// The localized line builders + SimEvent adapters that Hud composes. These are
// the thin i18n consumers over the pure views; the maths lives in
// tests/professions_ui_feedback.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  fishingEscapedLine,
  gatherDenyLine,
  gatheringEventLines,
  gatherNodeTooltipHtml,
  gatherRequirementLine,
  harvestResultLine,
  professionSkillLine,
  reelOutcomeLine,
  skillUpLine,
} from '../src/ui/gathering_feedback';
import {
  formatDuration,
  unstuckBlockedLine,
  unstuckCancelledLine,
  unstuckCompletedLines,
  unstuckCountdownLine,
  unstuckEventLines,
  unstuckStartedLine,
} from '../src/ui/unstuck_feedback';
import { MATERIAL_RARITY_COLOR } from '../src/ui/gathering_feedback_view';
import { gatherNodeById } from '../src/sim/content/professions';
import { setLanguage } from '../src/ui/i18n';

beforeAll(() => setLanguage('en'));

describe('harvest and skill lines', () => {
  it('names the harvested material and its count, coloured by the rolled rarity', () => {
    const common = harvestResultLine({ itemId: 'copper_ore', qty: 1, rarity: 'common' });
    expect(common.text).toContain('Copper Ore');
    expect(common.text).toContain('1');
    expect(common.color).toBe(MATERIAL_RARITY_COLOR.common);

    const epic = harvestResultLine({ itemId: 'cinderite_ore', qty: 3, rarity: 'epic' });
    expect(epic.text).toContain('Cinderite Ore');
    expect(epic.color).toBe(MATERIAL_RARITY_COLOR.epic);
    // Anything above common gets the richer wording.
    expect(epic.text).not.toBe(common.text.replace('Copper Ore', 'Cinderite Ore'));
  });

  it('falls back to the raw id for an item that is not in the table, without throwing', () => {
    expect(() => harvestResultLine({ itemId: 'nope', qty: 1, rarity: 'common' })).not.toThrow();
  });

  it('says nothing for a zero-gain harvest and announces the cap once', () => {
    expect(
      skillUpLine({ professionId: 'mining', skillGain: 0, nextProficiency: 80, maxSkill: 100 }),
    ).toBe(null);
    const up = skillUpLine({ professionId: 'mining', skillGain: 1, nextProficiency: 41, maxSkill: 100 })!;
    expect(up.text).toContain('Mining');
    expect(up.text).toContain('41');
    const capped = skillUpLine({ professionId: 'fishing', skillGain: 1, nextProficiency: 200, maxSkill: 200 })!;
    expect(capped.text).toContain('Fishing');
    expect(capped.text).toMatch(/master/i);
  });

  it('renders the professionSkill event shape directly', () => {
    expect(professionSkillLine('herbalism', 12, 100).text).toContain('Herbalism');
    expect(professionSkillLine('herbalism', 100, 100).text).toMatch(/master/i);
  });
});

describe('harvest deny lines', () => {
  const deny = (over: Record<string, unknown>) =>
    gatherDenyLine({ ok: false, professionId: 'mining', requiredTier: 3, ...over } as never)!;

  it('tells a bare-handed player to get a tool, naming the profession', () => {
    expect(deny({ reason: 'no_tool' }).text).toContain('Mining');
  });

  it('quotes the demanded tier when the carried tool is too crude', () => {
    const text = deny({ reason: 'tool_tier' }).text;
    expect(text).toContain('Mining');
    expect(text).toContain('3');
  });

  it('counts a busy node down in whole seconds, never zero', () => {
    expect(deny({ reason: 'not_ready', readyInSec: 4.2 }).text).toContain('5');
    expect(deny({ reason: 'not_ready', readyInSec: 0 }).text).toContain('1');
  });

  it('produces nothing for a harvest that passed the gates', () => {
    expect(gatherDenyLine({ ok: true, professionId: 'mining', requiredTier: 1, castSeconds: 2 })).toBe(null);
  });
});

describe('node tooltip', () => {
  const node = gatherNodeById('ore_eastbrook_1')!;

  it('exists in the shipped node table', () => {
    expect(node).toBeDefined();
    expect(node.tier).toBe(1);
  });

  it('states the requirement as "Requires {profession} tool tier {n}"', () => {
    const req = gatherRequirementLine('mining', 2, 0);
    expect(req.text).toBe('Requires Mining tool tier 2');
    expect(req.met).toBe(false);
    expect(gatherRequirementLine('mining', 2, 2).met).toBe(true);
  });

  it('shows the localized node name, the requirement and the mastery state', () => {
    const html = gatherNodeTooltipHtml(node, 'mining', 1, 0);
    expect(html).toContain('Copper Vein');
    expect(html).toContain('Requires Mining tool tier 1');
    expect(html).toContain('tt-sub');
    expect(html).not.toContain('tt-red');
  });

  it('marks the requirement red and adds no grey hint when the tool is too crude', () => {
    const html = gatherNodeTooltipHtml(gatherNodeById('ore_ashen_1')!, 'mining', 1, 0);
    expect(html).toContain('tt-red');
    expect(html).toContain('Cinderite Seam');
  });

  it('adds the "no longer improves your skill" hint on a grayed-out node', () => {
    // Mining 75 is the documented breakpoint where a tier-1 node stops teaching.
    const html = gatherNodeTooltipHtml(node, 'mining', 1, 75);
    expect(html).toContain('This no longer improves your skill.');
  });
});

describe('fishing lines', () => {
  it('has a distinct line for each reel outcome', () => {
    const texts = (['too_early', 'landed', 'too_late'] as const).map((o) => reelOutcomeLine(o).text);
    expect(new Set(texts).size).toBe(3);
  });

  it('distinguishes a timed-out window from a late pull', () => {
    expect(fishingEscapedLine('timeout').text).not.toBe(fishingEscapedLine('too_late').text);
    expect(fishingEscapedLine(undefined).text).toBe(fishingEscapedLine('timeout').text);
    expect(fishingEscapedLine('too_early').text).toBe(reelOutcomeLine('too_early').text);
  });
});

describe('the gathering SimEvent adapter', () => {
  it('renders a deny event', () => {
    const lines = gatheringEventLines({
      type: 'gatherDeny',
      nodeId: 'ore_eastbrook_1',
      professionId: 'mining',
      reason: 'no_tool',
      requiredTier: 1,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('Mining');
  });

  it('renders a harvest event with the rolled rarity colour', () => {
    const lines = gatheringEventLines({
      type: 'gatherHarvest',
      nodeId: 'ore_eastbrook_1',
      professionId: 'mining',
      itemId: 'copper_ore',
      rarity: 'rare',
      qty: 2,
    });
    expect(lines[0].color).toBe(MATERIAL_RARITY_COLOR.rare);
  });

  it('renders each fishing phase, including the text-free no-tackle deny', () => {
    for (const phase of ['bite', 'landed', 'no_tackle'] as const) {
      const lines = gatheringEventLines({ type: 'fishing', phase });
      expect(lines, phase).toHaveLength(1);
      expect(lines[0].text.length, phase).toBeGreaterThan(0);
    }
    expect(gatheringEventLines({ type: 'fishing', phase: 'escaped', reason: 'too_late' })[0].text).toBe(
      reelOutcomeLine('too_late').text,
    );
  });

  it('drops an event whose profession id it does not recognize instead of throwing', () => {
    expect(
      gatheringEventLines({
        type: 'professionSkill',
        professionId: 'alchemy',
        skill: 5,
        maxSkill: 100,
      }),
    ).toEqual([]);
  });
});

describe('unstuck lines', () => {
  it('opens with the full countdown and ticks it down', () => {
    expect(unstuckStartedLine(10).text).toContain('10');
    expect(unstuckCountdownLine(3).text).toContain('3');
  });

  it('quotes the remaining cooldown only on the cooldown block', () => {
    expect(unstuckBlockedLine('cooldown', 12.1).text).toContain('13');
    expect(unstuckBlockedLine('combat').text.length).toBeGreaterThan(0);
    expect(unstuckBlockedLine('combat').text).not.toMatch(/\{/);
  });

  it('gives every blocked and cancel reason a filled-in line with no stray placeholder', () => {
    const blocked = [
      'already_active',
      'cooldown',
      'combat',
      'controlled',
      'falling',
      'moving',
      'busy',
      'competitive',
      'trading',
    ] as const;
    for (const reason of blocked) {
      const text = unstuckBlockedLine(reason, 5).text;
      expect(text.length, reason).toBeGreaterThan(0);
      expect(text, reason).not.toMatch(/\{[a-z]+\}/i);
    }
    const cancels = ['moved', 'damaged', 'combat', 'busy', 'state_changed', 'disconnected'] as const;
    for (const reason of cancels) {
      const text = unstuckCancelledLine(reason).text;
      expect(text, reason).toContain('Unstuck cancelled.');
      expect(text, reason).not.toMatch(/\{[a-z]+\}/i);
    }
  });

  it('reports the two completion outcomes and only adds the sickness cost when it applies', () => {
    const moved = unstuckCompletedLines({ outcome: 'moved_to_graveyard', sicknessSeconds: 0 });
    expect(moved).toHaveLength(1);
    const revived = unstuckCompletedLines({ outcome: 'revived_at_graveyard', sicknessSeconds: 300 });
    expect(revived).toHaveLength(2);
    expect(revived[0].text).not.toBe(moved[0].text);
    expect(revived[1].text).toMatch(/5\s*min/);
  });

  it('formats a duration through Intl units, never a hand-appended letter', () => {
    expect(formatDuration(0)).toMatch(/0/);
    expect(formatDuration(45)).toMatch(/45/);
    expect(formatDuration(90)).toMatch(/1/);
    expect(formatDuration(90)).toMatch(/30/);
    expect(formatDuration(300)).toMatch(/5/);
  });
});

describe('the unstuck SimEvent adapter', () => {
  it('renders every phase', () => {
    expect(unstuckEventLines({ type: 'unstuck', phase: 'started', seconds: 10 })[0].text).toContain('10');
    expect(unstuckEventLines({ type: 'unstuck', phase: 'countdown', seconds: 2 })[0].text).toContain('2');
    expect(
      unstuckEventLines({ type: 'unstuck', phase: 'blocked', reason: 'combat' }),
    ).toHaveLength(1);
    expect(
      unstuckEventLines({ type: 'unstuck', phase: 'cancelled', reason: 'moved' }),
    ).toHaveLength(1);
    expect(
      unstuckEventLines(
        { type: 'unstuck', phase: 'completed', outcome: 'revived_at_graveyard' },
        180,
      ),
    ).toHaveLength(2);
  });

  it('drops an unrecognized reason id instead of throwing', () => {
    expect(unstuckEventLines({ type: 'unstuck', phase: 'blocked', reason: 'sneezing' })).toEqual([]);
    expect(unstuckEventLines({ type: 'unstuck', phase: 'cancelled', reason: 'sneezing' })).toEqual([]);
  });
});
