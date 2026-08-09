// The pure Dungeon Finder view model (src/ui/lfg_ui_model.ts) plus its copy
// layer (src/ui/lfg_ui_labels.ts).
//
// Both halves are DOM-free, so this drives them directly. `t()` THROWS on an
// untracked key in dev/test, so every label assertion here doubles as proof that
// the whole feature's catalog surface exists: every deny rung, every queue
// state, every relax step, every tier and role, the ready check and its two
// penalty lines.

import { describe, expect, it } from 'vitest';
import {
  DUNGEON_FINDER_DECLINE_PENALTY_SEC,
  DUNGEON_FINDER_DENY_REASONS,
  DUNGEON_FINDER_EVENTS,
  DUNGEON_FINDER_TIMEOUT_PENALTY_SEC,
  DUNGEON_FINDER_URGENT_SEC,
  LFG_IDEAL_COMPOSITION,
  LFG_PLAYER_STATES,
  LFG_RELAX_STEPS,
  LFG_ROLE_IDS,
  LFG_TIERS,
  buildLfgListingsView,
  buildLfgQueueView,
  buildReadyCheckView,
  denyCostsCooldown,
  denyEndsReadyCheck,
  dungeonFinderDenyReason,
  reconcileReadyCheck,
  isDungeonFinderEventType,
  isProposalCollapseReason,
  lfgCountdown,
  lfgCountdownUntil,
  lfgPlayerState,
  lfgRelax,
  lfgRoleCounts,
  lfgRoleRows,
  lfgTier,
  lfgWaitSpan,
  resolveRequestedRoles,
  type LfgListingLike,
  type LfgStatusInfo,
} from '../src/ui/lfg_ui_model';
import {
  dungeonFinderEventFeedback,
  lfgAbandonConfirmText,
  lfgAssignedRoleText,
  lfgCooldownText,
  lfgDenyText,
  lfgGroupSizeText,
  lfgLevelBandText,
  lfgLevelsToGoText,
  lfgLockedRowAria,
  lfgPenaltyText,
  lfgQueuedForText,
  lfgQueuedPlayersText,
  lfgReadyCheckText,
  lfgReadyTallyText,
  lfgRelaxText,
  lfgRequiresLevelText,
  lfgRoleCountAria,
  lfgRoleCountText,
  lfgRoleEnoughText,
  lfgRoleName,
  lfgRoleShortText,
  lfgRoleToggleAria,
  lfgStateText,
  lfgTierName,
  lfgTimeText,
  lfgWaitAria,
  lfgWaitText,
} from '../src/ui/lfg_ui_labels';
import {
  DUNGEON_FINDER_LISTINGS,
  LFG_DECLINE_COOLDOWN_SEC,
  LFG_READY_WINDOW_SEC,
  LFG_ROLES,
  LFG_TIMEOUT_COOLDOWN_SEC,
} from '../src/sim/lfg';

const status = (over: Partial<LfgStatusInfo> = {}): LfgStatusInfo => ({
  state: 'idle',
  dungeonId: null,
  waitSeconds: 0,
  queuedByRole: {},
  ...over,
});

describe('the pinned event names', () => {
  it('recognizes exactly the four contract names', () => {
    expect([...DUNGEON_FINDER_EVENTS]).toEqual([
      'lfgStatus',
      'lfgProposal',
      'lfgFormed',
      'lfgDeny',
    ]);
    for (const name of DUNGEON_FINDER_EVENTS) expect(isDungeonFinderEventType(name)).toBe(true);
    // Near misses must NOT route: this is the exact class of typo that killed
    // four of seven events in wave 2.
    for (const near of ['lfg', 'lfgStatusUpdate', 'dungeonFinderStatus', 'lfgproposal', '']) {
      expect(isDungeonFinderEventType(near)).toBe(false);
    }
  });
});

describe('roles', () => {
  it('mirrors the sim role ladder', () => {
    expect([...LFG_ROLE_IDS]).toEqual([...LFG_ROLES]);
  });

  it('normalizes a wire role bag, floor included', () => {
    expect(lfgRoleCounts({ tank: 2, healer: 1, dps: 7 })).toEqual({ tank: 2, healer: 1, dps: 7 });
    // Missing, negative, fractional and non-finite all read as zero: "NaN tanks
    // waiting" would send a player to re-roll a spec they did not need.
    expect(lfgRoleCounts({})).toEqual({ tank: 0, healer: 0, dps: 0 });
    expect(lfgRoleCounts(undefined)).toEqual({ tank: 0, healer: 0, dps: 0 });
    expect(lfgRoleCounts({ tank: -4, healer: 1.9, dps: Number.NaN })).toEqual({
      tank: 0,
      healer: 1,
      dps: 0,
    });
  });

  it('measures each role against the ideal five', () => {
    expect(LFG_IDEAL_COMPOSITION).toEqual({ tank: 1, healer: 1, dps: 3 });
    const rows = lfgRoleRows({ tank: 1, healer: 0, dps: 4 });
    expect(rows.map((r) => r.role)).toEqual(['tank', 'healer', 'dps']);
    expect(rows.map((r) => r.satisfied)).toEqual([true, false, true]);
    expect(rows.map((r) => r.needed)).toEqual([1, 1, 3]);
  });

  it('resolves a request against what the class can fill', () => {
    // A mage can never queue as a tank.
    expect(resolveRequestedRoles(['tank', 'dps'], ['dps'])).toEqual(['dps']);
    // An empty request means "anything", the sim's own rule.
    expect(resolveRequestedRoles([], ['tank', 'healer', 'dps'])).toEqual([
      'tank',
      'healer',
      'dps',
    ]);
    // A request with nothing eligible in it falls back to everything eligible
    // rather than producing an unqueueable player.
    expect(resolveRequestedRoles(['healer'], ['tank', 'dps'])).toEqual(['tank', 'dps']);
    // A caller with no eligible roles at all still yields damage.
    expect(resolveRequestedRoles([], [])).toEqual(['dps']);
  });
});

describe('state and tier coercion', () => {
  it('folds an unknown state to idle, which offers Join back', () => {
    for (const state of LFG_PLAYER_STATES) expect(lfgPlayerState(state)).toBe(state);
    expect(lfgPlayerState('somethingNew')).toBe('idle');
    expect(lfgPlayerState('')).toBe('idle');
  });

  it('folds an unknown tier and relax step to the safe rung', () => {
    for (const tier of LFG_TIERS) expect(lfgTier(tier)).toBe(tier);
    expect(lfgTier('mythic')).toBe('leveling');
    for (const step of LFG_RELAX_STEPS) expect(lfgRelax(step)).toBe(step);
    expect(lfgRelax('desperate')).toBe('ideal');
  });
});

describe('countdown boundaries', () => {
  it('rounds a remaining span UP so a live clock never shows zero early', () => {
    expect(lfgCountdown(59_999).shape).toBe('minutesSeconds');
    expect(lfgCountdown(59_999).totalSeconds).toBe(60);
    expect(lfgCountdown(59_001).totalSeconds).toBe(60);
    expect(lfgCountdown(1).totalSeconds).toBe(1);
    expect(lfgCountdown(1).shape).toBe('seconds');
  });

  it('is expired exactly at and past zero', () => {
    expect(lfgCountdown(0).expired).toBe(true);
    expect(lfgCountdown(0).shape).toBe('expired');
    expect(lfgCountdown(0).totalSeconds).toBe(0);
    expect(lfgCountdown(-5_000).expired).toBe(true);
    expect(lfgCountdown(1).expired).toBe(false);
  });

  it('splits at the hour and the minute', () => {
    expect(lfgCountdown(3_600_000).shape).toBe('hoursMinutes');
    expect(lfgCountdown(3_599_000).shape).toBe('minutesSeconds');
    expect(lfgCountdown(60_000).shape).toBe('minutesSeconds');
    expect(lfgCountdown(59_000).shape).toBe('seconds');
    const long = lfgCountdown(3_723_000);
    expect([long.hours, long.minutes, long.seconds]).toEqual([1, 2, 3]);
  });

  it('treats a missing deadline as already expired, never as forever', () => {
    expect(lfgCountdownUntil(0, 1_000).expired).toBe(true);
    expect(lfgCountdownUntil(-1, 1_000).expired).toBe(true);
    expect(lfgCountdownUntil(10_000, 4_000).totalSeconds).toBe(6);
  });

  it('rounds an elapsed wait DOWN and never calls it expired', () => {
    expect(lfgWaitSpan(0).totalSeconds).toBe(0);
    expect(lfgWaitSpan(0).expired).toBe(false);
    expect(lfgWaitSpan(0).shape).toBe('seconds');
    expect(lfgWaitSpan(59.9).totalSeconds).toBe(59);
    expect(lfgWaitSpan(-12).totalSeconds).toBe(0);
    expect(lfgWaitSpan(Number.NaN).totalSeconds).toBe(0);
  });
});

describe('queue presentation', () => {
  it('reads an idle player as joinable and not leavable', () => {
    const view = buildLfgQueueView(status(), 0);
    expect(view.canJoin).toBe(true);
    expect(view.canLeave).toBe(false);
    expect(view.queued).toBe(false);
    expect(view.cooldown).toBeNull();
  });

  it('reads a waiting player, with the role counts and the honest floor', () => {
    const view = buildLfgQueueView(
      status({
        state: 'queued',
        dungeonId: 'hollow_crypt',
        waitSeconds: 137,
        queuedByRole: { tank: 1, healer: 2, dps: 6 },
        relax: 'anchored',
        queuedPlayers: 6,
      }),
      0,
    );
    expect(view.queued).toBe(true);
    expect(view.canJoin).toBe(false);
    expect(view.canLeave).toBe(true);
    expect(view.wait.totalSeconds).toBe(137);
    expect(view.wait.shape).toBe('minutesSeconds');
    expect(view.counts).toEqual({ tank: 1, healer: 2, dps: 6 });
    expect(view.relax).toBe('anchored');
    // NEVER the sum: a druid is counted in all three, so 1+2+6 would trumpet a
    // queue three times its real size. The floor is the largest single role.
    expect(view.waitingFloor).toBe(6);
    expect(view.queuedPlayers).toBe(6);
    expect(view.compositionReady).toBe(true);
  });

  it('reports an incomplete composition as such', () => {
    const view = buildLfgQueueView(
      status({ state: 'queued', queuedByRole: { tank: 0, healer: 1, dps: 3 } }),
      0,
    );
    expect(view.compositionReady).toBe(false);
    expect(view.roles.find((r) => r.role === 'tank')?.satisfied).toBe(false);
  });

  it('reads a proposed player as still queued and not joinable', () => {
    const view = buildLfgQueueView(status({ state: 'proposed', dungeonId: 'claudeholme' }), 0);
    expect(view.proposed).toBe(true);
    expect(view.queued).toBe(true);
    expect(view.canJoin).toBe(false);
    expect(view.canLeave).toBe(true);
  });

  it('gives a cooldown a clock only when it has a real deadline', () => {
    const withClock = buildLfgQueueView(
      status({ state: 'cooldown', cooldownUntil: 100_000 }),
      40_000,
    );
    expect(withClock.onCooldown).toBe(true);
    expect(withClock.cooldown?.totalSeconds).toBe(60);
    // A zero deadline means "the world did not say", which must read as no clock
    // rather than as an already-lifted cooldown.
    expect(buildLfgQueueView(status({ state: 'cooldown', cooldownUntil: 0 }), 0).cooldown).toBeNull();
    expect(buildLfgQueueView(status({ state: 'cooldown' }), 0).cooldown).toBeNull();
  });

  it('is a pure function of its inputs', () => {
    const input = status({ state: 'queued', waitSeconds: 61, queuedByRole: { tank: 1, dps: 2 } });
    expect(buildLfgQueueView(input, 1234)).toEqual(buildLfgQueueView(input, 1234));
  });
});

describe('the offered dungeon list', () => {
  const listings: LfgListingLike[] = [...DUNGEON_FINDER_LISTINGS];

  it('sorts by the level gate and marks what the player may queue for', () => {
    const view = buildLfgListingsView(listings, { playerLevel: 13 });
    expect(view.rows.map((r) => r.minQueueLevel)).toEqual(
      [...view.rows.map((r) => r.minQueueLevel)].sort((a, b) => a - b),
    );
    expect(view.rows[0]?.dungeonId).toBe('hollow_crypt');
    expect(view.eligibleCount).toBe(2);
    const locked = view.rows.find((r) => r.dungeonId === 'claudeholme');
    expect(locked?.eligible).toBe(false);
    expect(locked?.levelsToGo).toBe(7);
  });

  it('never points the Join button at a locked row', () => {
    const view = buildLfgListingsView(listings, {
      playerLevel: 8,
      selectedDungeonId: 'claudeholme',
    });
    // The selection is out of reach, so it falls to the lowest eligible row.
    expect(view.selectedDungeonId).toBe('hollow_crypt');
    expect(view.rows.find((r) => r.selected)?.dungeonId).toBe('hollow_crypt');
  });

  it('lets the queued dungeon win the highlight while waiting', () => {
    const view = buildLfgListingsView(listings, {
      playerLevel: 20,
      selectedDungeonId: 'hollow_crypt',
      queuedDungeonId: 'gravewyrm_sanctum',
    });
    expect(view.selectedDungeonId).toBe('gravewyrm_sanctum');
    expect(view.rows.find((r) => r.dungeonId === 'gravewyrm_sanctum')?.queued).toBe(true);
  });

  it('resolves to nothing when every row is out of reach', () => {
    const view = buildLfgListingsView(listings, { playerLevel: 1 });
    expect(view.eligibleCount).toBe(0);
    expect(view.selectedDungeonId).toBeNull();
    expect(view.rows.every((r) => !r.selected)).toBe(true);
  });

  it('has no upper gate: a capped player may still queue for the first dungeon', () => {
    const view = buildLfgListingsView(listings, { playerLevel: 20 });
    expect(view.rows.find((r) => r.dungeonId === 'hollow_crypt')?.eligible).toBe(true);
  });
});

describe('the ready check', () => {
  const base = { proposalId: 'p1', dungeonId: 'hollow_crypt', openedAt: 0, expiresAt: 40_000 };

  it('quotes the SAME penalties the sim actually charges', () => {
    expect(DUNGEON_FINDER_DECLINE_PENALTY_SEC).toBe(LFG_DECLINE_COOLDOWN_SEC);
    expect(DUNGEON_FINDER_TIMEOUT_PENALTY_SEC).toBe(LFG_TIMEOUT_COOLDOWN_SEC);
    const view = buildReadyCheckView(base, 0);
    expect(view.declinePenaltySeconds).toBe(120);
    expect(view.timeoutPenaltySeconds).toBe(300);
  });

  it('drains the bar from full to empty across the real ready window', () => {
    expect(base.expiresAt - base.openedAt).toBe(LFG_READY_WINDOW_SEC * 1000);
    expect(buildReadyCheckView(base, 0).percentRemaining).toBe(100);
    expect(buildReadyCheckView(base, 20_000).percentRemaining).toBe(50);
    expect(buildReadyCheckView(base, 40_000).percentRemaining).toBe(0);
  });

  it('goes urgent only in the last seconds', () => {
    expect(buildReadyCheckView(base, 40_000 - (DUNGEON_FINDER_URGENT_SEC + 1) * 1000).urgent).toBe(
      false,
    );
    expect(buildReadyCheckView(base, 40_000 - DUNGEON_FINDER_URGENT_SEC * 1000).urgent).toBe(true);
    expect(buildReadyCheckView(base, 39_500).urgent).toBe(true);
  });

  it('is expired, unanswerable and empty exactly at the deadline', () => {
    const at = buildReadyCheckView(base, 40_000);
    expect(at.expired).toBe(true);
    expect(at.canAnswer).toBe(false);
    expect(at.percentRemaining).toBe(0);
    expect(at.countdown.totalSeconds).toBe(0);
    const past = buildReadyCheckView(base, 90_000);
    expect(past.expired).toBe(true);
    expect(past.percentRemaining).toBe(0);
    // One millisecond before the deadline the window is still open.
    const just = buildReadyCheckView(base, 39_999);
    expect(just.expired).toBe(false);
    expect(just.canAnswer).toBe(true);
    expect(just.countdown.totalSeconds).toBe(1);
  });

  it('survives a skewed or replayed window without dividing by zero', () => {
    const skewed = buildReadyCheckView({ ...base, openedAt: 90_000 }, 0);
    expect(Number.isFinite(skewed.percentRemaining)).toBe(true);
    expect(skewed.percentRemaining).toBeGreaterThanOrEqual(0);
    expect(skewed.percentRemaining).toBeLessThanOrEqual(100);
  });

  it('stops offering an answer once this player has responded', () => {
    const view = buildReadyCheckView({ ...base, responded: true }, 0);
    expect(view.responded).toBe(true);
    expect(view.canAnswer).toBe(false);
  });

  it('carries the assigned role and the tally when the world reports them', () => {
    const view = buildReadyCheckView(
      { ...base, role: 'healer', size: 5, acceptedCount: 3 },
      0,
    );
    expect(view.role).toBe('healer');
    expect(view.size).toBe(5);
    expect(view.acceptedCount).toBe(3);
    // A role the client does not know reads as none rather than as a bad label.
    expect(buildReadyCheckView({ ...base, role: 'bard' }, 0).role).toBeNull();
    expect(buildReadyCheckView(base, 0).size).toBeNull();
  });
});

describe('deny reasons', () => {
  it('covers the sim unions plus a catch-all', () => {
    // LfgJoinDeny (8) + LfgRespondDeny (3) + LfgCloseReason (5) + unknown.
    expect(DUNGEON_FINDER_DENY_REASONS.length).toBe(17);
    expect(new Set(DUNGEON_FINDER_DENY_REASONS).size).toBe(17);
    for (const rung of DUNGEON_FINDER_DENY_REASONS) {
      expect(dungeonFinderDenyReason(rung)).toBe(rung);
    }
  });

  it('folds wire spellings onto one rung', () => {
    expect(dungeonFinderDenyReason('level_too_low')).toBe('levelTooLow');
    expect(dungeonFinderDenyReason('LEVEL-TOO-LOW')).toBe('levelTooLow');
    expect(dungeonFinderDenyReason('level too low')).toBe('levelTooLow');
    expect(dungeonFinderDenyReason('no_slot')).toBe('noSlot');
    expect(dungeonFinderDenyReason('timeout')).toBe('timedOut');
  });

  it('lands anything it does not know on unknown rather than going silent', () => {
    expect(dungeonFinderDenyReason('a reason from a newer server')).toBe('unknown');
    expect(dungeonFinderDenyReason('')).toBe('unknown');
  });

  it('separates a collapse from a refusal, and charges only the two that cost', () => {
    for (const rung of ['declined', 'timedOut', 'memberLeft', 'memberUnavailable', 'noSlot'] as const) {
      expect(isProposalCollapseReason(rung)).toBe(true);
    }
    expect(isProposalCollapseReason('levelTooLow')).toBe(false);
    expect(denyCostsCooldown('declined')).toBe(true);
    expect(denyCostsCooldown('timedOut')).toBe(true);
    // A group that fell apart because somebody else went offline is not the
    // player's mistake and must not be billed as one.
    expect(denyCostsCooldown('memberUnavailable')).toBe(false);
    expect(denyCostsCooldown('noSlot')).toBe(false);
  });
});

describe('what a refusal does to an OPEN ready check', () => {
  it('closes it only when the proposal is actually gone', () => {
    for (const rung of ['declined', 'timedOut', 'memberLeft', 'memberUnavailable', 'noSlot'] as const) {
      expect(denyEndsReadyCheck(rung)).toBe(true);
    }
    expect(denyEndsReadyCheck('noProposal')).toBe(true);
    expect(denyEndsReadyCheck('wrongProposal')).toBe(true);
  });

  it('leaves a live ready check alone for a refusal of something else', () => {
    // These arrive WHILE the check is still counting down. Tearing the dialog
    // down for one of them would cost the player the 300 second timeout penalty
    // for a keypress that changed nothing.
    for (const rung of [
      'alreadyResponded',
      'alreadyQueued',
      'inProposal',
      'levelTooLow',
      'onCooldown',
      'unknownDungeon',
      'emptyGroup',
      'groupTooLarge',
      'duplicateMember',
      'unknown',
    ] as const) {
      expect(denyEndsReadyCheck(rung)).toBe(false);
    }
  });
});

describe('reconciling the dialog against the world', () => {
  const base = {
    liveProposalId: null as string | null,
    localProposalId: null as string | null,
    lastConfirmedAt: null as number | null,
    expiredProposalId: null as string | null,
    nowMs: 0,
    graceMs: 2000,
  };

  it('opens on a live proposal', () => {
    expect(reconcileReadyCheck({ ...base, liveProposalId: 'p1' })).toBe('open');
  });

  it('NEVER re-raises a window that already ran out', () => {
    // The world can keep reporting a proposal for a few frames past its
    // deadline; re-raising it would loop open / repaint / expire forever.
    expect(
      reconcileReadyCheck({ ...base, liveProposalId: 'p1', expiredProposalId: 'p1' }),
    ).toBe('ignore');
    expect(
      reconcileReadyCheck({ ...base, liveProposalId: 'p2', expiredProposalId: 'p1' }),
    ).toBe('open');
  });

  it('does nothing when there is neither a live nor a local proposal', () => {
    expect(reconcileReadyCheck(base)).toBe('ignore');
  });

  it('NEVER closes a check the world has not yet confirmed', () => {
    // The `lfgProposal` event can land a snapshot ahead of the mirrored state,
    // and a host that never mirrors it must not lose the whole 40 second window.
    expect(
      reconcileReadyCheck({ ...base, localProposalId: 'p1', lastConfirmedAt: null, nowMs: 999_999 }),
    ).toBe('keep');
  });

  it('closes only after the grace runs out from the LAST confirmation', () => {
    const confirmed = { ...base, localProposalId: 'p1', lastConfirmedAt: 10_000 };
    expect(reconcileReadyCheck({ ...confirmed, nowMs: 11_000 })).toBe('keep');
    expect(reconcileReadyCheck({ ...confirmed, nowMs: 12_000 })).toBe('keep');
    expect(reconcileReadyCheck({ ...confirmed, nowMs: 12_001 })).toBe('close');
  });
});

describe('copy', () => {
  it('has a line for EVERY deny rung', () => {
    for (const rung of DUNGEON_FINDER_DENY_REASONS) {
      const text = lfgDenyText(rung);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toBe(rung);
    }
    // An unrecognized wire reason still produces the unknown line, never blank.
    expect(lfgDenyText('brand new reason')).toBe(lfgDenyText('unknown'));
  });

  it('names the penalty in the two refusals that charge one', () => {
    const declined = lfgDenyText('declined');
    const timedOut = lfgDenyText('timedOut');
    expect(declined).toContain(lfgPenaltyText(DUNGEON_FINDER_DECLINE_PENALTY_SEC));
    expect(timedOut).toContain(lfgPenaltyText(DUNGEON_FINDER_TIMEOUT_PENALTY_SEC));
    // and does NOT bill a collapse somebody else caused
    expect(lfgDenyText('memberLeft')).toBe(lfgDenyText('memberLeft'));
    expect(lfgDenyText('memberLeft')).not.toContain(
      lfgPenaltyText(DUNGEON_FINDER_DECLINE_PENALTY_SEC),
    );
  });

  it('has a line for every state, relax step, tier and role', () => {
    for (const state of LFG_PLAYER_STATES) expect(lfgStateText(state).length).toBeGreaterThan(0);
    for (const step of LFG_RELAX_STEPS) expect(lfgRelaxText(step).length).toBeGreaterThan(0);
    for (const tier of LFG_TIERS) expect(lfgTierName(tier).length).toBeGreaterThan(0);
    for (const role of LFG_ROLE_IDS) expect(lfgRoleName(role).length).toBeGreaterThan(0);
  });

  it('renders every countdown shape, expired included', () => {
    expect(lfgTimeText(lfgCountdown(3_723_000)).length).toBeGreaterThan(0);
    expect(lfgTimeText(lfgCountdown(127_000)).length).toBeGreaterThan(0);
    expect(lfgTimeText(lfgCountdown(9_000)).length).toBeGreaterThan(0);
    expect(lfgTimeText(lfgCountdown(0)).length).toBeGreaterThan(0);
    // Seconds are zero-padded through the formatter, never String.padStart, so a
    // non-latin locale never gets ASCII zeroes spliced in.
    expect(lfgTimeText(lfgCountdown(127_000))).toContain('07');
  });

  it('states both ready-check consequences before the buttons', () => {
    const text = lfgReadyCheckText('hollow_crypt', lfgCountdown(40_000), 120, 300);
    expect(text.declineCost).toContain(lfgPenaltyText(120));
    expect(text.timeoutCost).toContain(lfgPenaltyText(300));
    expect(text.accept.length).toBeGreaterThan(0);
    expect(text.decline.length).toBeGreaterThan(0);
    expect(text.expired.length).toBeGreaterThan(0);
    expect(text.body).not.toBe(text.declineCost);
  });

  it('prices the leave-during-a-ready-check confirmation the same way', () => {
    const text = lfgAbandonConfirmText(DUNGEON_FINDER_DECLINE_PENALTY_SEC);
    expect(text.body).toContain(lfgPenaltyText(DUNGEON_FINDER_DECLINE_PENALTY_SEC));
    expect(text.ok.length).toBeGreaterThan(0);
    expect(text.cancel.length).toBeGreaterThan(0);
  });

  it('resolves every remaining label without throwing on an untracked key', () => {
    expect(lfgLevelBandText(7, 10).length).toBeGreaterThan(0);
    expect(lfgRequiresLevelText(20).length).toBeGreaterThan(0);
    // The locked-row name joins through a KEY, so the separator is the locale's.
    expect(lfgLockedRowAria('Claudeholme', 20)).toContain('Claudeholme');
    expect(lfgLockedRowAria('Claudeholme', 20)).toContain(lfgRequiresLevelText(20));
    expect(lfgLevelsToGoText(3).length).toBeGreaterThan(0);
    expect(lfgGroupSizeText(5, 3).length).toBeGreaterThan(0);
    // A dungeon that is never shorted gets its own line, not "pops with 5 or more".
    expect(lfgGroupSizeText(5, 5)).not.toBe(lfgGroupSizeText(5, 3));
    expect(lfgQueuedForText('hollow_crypt').length).toBeGreaterThan(0);
    expect(lfgQueuedPlayersText(4).length).toBeGreaterThan(0);
    expect(lfgWaitText(lfgWaitSpan(65)).length).toBeGreaterThan(0);
    expect(lfgWaitAria(lfgWaitSpan(65)).length).toBeGreaterThan(0);
    expect(lfgCooldownText(lfgCountdown(60_000)).length).toBeGreaterThan(0);
    expect(lfgCooldownText(null).length).toBeGreaterThan(0);
    expect(lfgRoleCountText('tank', 2).length).toBeGreaterThan(0);
    expect(lfgRoleCountAria('tank', 2, 1).length).toBeGreaterThan(0);
    expect(lfgRoleEnoughText().length).toBeGreaterThan(0);
    expect(lfgRoleShortText(3).length).toBeGreaterThan(0);
    expect(lfgAssignedRoleText('healer').length).toBeGreaterThan(0);
    expect(lfgReadyTallyText(3, 5).length).toBeGreaterThan(0);
    // The toggle's state is in its accessible NAME, not only in its colour.
    expect(lfgRoleToggleAria('tank', true, true)).not.toBe(lfgRoleToggleAria('tank', false, true));
    expect(lfgRoleToggleAria('tank', false, false).length).toBeGreaterThan(0);
  });
});

describe('event feedback', () => {
  it('says nothing in the log for a status tick', () => {
    const fb = dungeonFinderEventFeedback({
      type: 'lfgStatus',
      state: 'queued',
      dungeonId: 'hollow_crypt',
      waitSeconds: 30,
      queuedByRole: { tank: 1 },
    });
    expect(fb.lines).toEqual([]);
    expect(fb.banner).toBeNull();
    expect(fb.error).toBeNull();
    expect(fb.readyCheck).toBe(false);
  });

  it('flags a proposal as the one event that raises the dialog', () => {
    const fb = dungeonFinderEventFeedback({
      type: 'lfgProposal',
      proposalId: 'p1',
      dungeonId: 'hollow_crypt',
      expiresAt: 40_000,
    });
    expect(fb.readyCheck).toBe(true);
    expect(fb.banner).not.toBeNull();
    expect(fb.lines.length).toBe(1);
  });

  it('celebrates a formed group and toasts a refusal', () => {
    const formed = dungeonFinderEventFeedback({ type: 'lfgFormed', dungeonId: 'hollow_crypt' });
    expect(formed.banner).not.toBeNull();
    expect(formed.error).toBeNull();
    const deny = dungeonFinderEventFeedback({ type: 'lfgDeny', reason: 'onCooldown' });
    expect(deny.error).toBe(lfgDenyText('onCooldown'));
    expect(deny.lines[0]?.text).toBe(deny.error);
    // A collapse and a refusal are toned apart so the player can tell whose
    // fault it was at a glance.
    const collapse = dungeonFinderEventFeedback({ type: 'lfgDeny', reason: 'memberLeft' });
    expect(collapse.lines[0]?.color).not.toBe(deny.lines[0]?.color);
  });
});
