import { describe, expect, it } from 'vitest';
import { dungeonAt, zoneAt } from '../src/sim/data';
import { DT, type Stats } from '../src/sim/types';
import {
  type PendingUnstuck,
  requestUnstuck,
  tickUnstuck,
  UNSTUCK_COUNTDOWN_SECONDS,
  UNSTUCK_RETRY_COOLDOWN_SECONDS,
  UNSTUCK_SICKNESS_ID,
  UNSTUCK_SICKNESS_MAX_SECONDS,
  UNSTUCK_SICKNESS_MIN_LEVEL,
  UNSTUCK_SUCCESS_COOLDOWN_SECONDS,
  type UnstuckSnapshot,
  type UnstuckTickResult,
  unstuckBlockedReason,
  unstuckGraveyardFor,
  unstuckSickness,
  unstuckSicknessAura,
} from '../src/sim/unstuck';

// A player standing perfectly still, out of combat, eligible in every respect.
const idle = (over: Partial<UnstuckSnapshot> = {}): UnstuckSnapshot => ({
  time: 0,
  pos: { x: 10, y: 4, z: 20 },
  level: 20,
  dead: false,
  inCombat: false,
  combatTimer: 99,
  onGround: true,
  jumping: false,
  speed: 0,
  stunned: false,
  rooted: false,
  busy: false,
  sitting: false,
  moveInput: false,
  forcedMovement: false,
  competitive: false,
  trading: false,
  damageTaken: 0,
  cooldownRemaining: 0,
  areaKey: 'eastbrook_vale',
  ...over,
});

const start = (snap = idle()): PendingUnstuck => {
  const res = requestUnstuck(snap, null);
  if (!res.ok) throw new Error(`expected start, blocked: ${res.reason}`);
  return res.state;
};

/**
 * Drive the countdown from `state` for `ticks` sim ticks. `mutate` gets the
 * chance to disturb the snapshot at each step, which is how the cancel cases
 * are expressed. Stops at the first non-pending result.
 */
function run(
  state: PendingUnstuck,
  ticks: number,
  mutate: (snap: UnstuckSnapshot, tick: number) => UnstuckSnapshot = (s) => s,
): { result: UnstuckTickResult; countdowns: number[]; ticks: number } {
  let current = state;
  const countdowns: number[] = [];
  let result: UnstuckTickResult = { phase: 'pending', state, countdown: null };
  let i = 0;
  for (; i < ticks; i++) {
    const snap = mutate(idle({ time: (i + 1) * DT, damageTaken: 0 }), i + 1);
    result = tickUnstuck(snap, current);
    if (result.phase !== 'pending') break;
    if (result.countdown !== null) countdowns.push(result.countdown);
    current = result.state;
  }
  return { result, countdowns, ticks: i + 1 };
}

describe('unstuck: eligibility', () => {
  it('accepts a stationary, out-of-combat player and arms the countdown', () => {
    const res = requestUnstuck(idle(), null);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.seconds).toBe(UNSTUCK_COUNTDOWN_SECONDS);
    expect(res.state.endsAt).toBe(UNSTUCK_COUNTDOWN_SECONDS);
    expect(res.state.startedDead).toBe(false);
  });

  it('refuses to be a combat escape', () => {
    expect(unstuckBlockedReason(idle({ inCombat: true }))).toBe('combat');
    // Just-left-combat still counts: the 5s window matches the sim's own.
    expect(unstuckBlockedReason(idle({ inCombat: false, combatTimer: 1 }))).toBe('combat');
    expect(unstuckBlockedReason(idle({ combatTimer: 5 }))).toBeNull();
  });

  it('refuses every other exploit route', () => {
    expect(unstuckBlockedReason(idle({ stunned: true }))).toBe('controlled');
    expect(unstuckBlockedReason(idle({ rooted: true }))).toBe('controlled');
    expect(unstuckBlockedReason(idle({ onGround: false }))).toBe('falling');
    expect(unstuckBlockedReason(idle({ jumping: true }))).toBe('falling');
    expect(unstuckBlockedReason(idle({ speed: 3 }))).toBe('moving');
    expect(unstuckBlockedReason(idle({ forcedMovement: true }))).toBe('moving');
    expect(unstuckBlockedReason(idle({ moveInput: true }))).toBe('moving');
    expect(unstuckBlockedReason(idle({ busy: true }))).toBe('busy');
    expect(unstuckBlockedReason(idle({ sitting: true }))).toBe('busy');
    expect(unstuckBlockedReason(idle({ competitive: true }))).toBe('competitive');
    expect(unstuckBlockedReason(idle({ trading: true }))).toBe('trading');
  });

  it('rejects a second request and a request on cooldown', () => {
    const active = start();
    expect(requestUnstuck(idle(), active)).toMatchObject({ ok: false, reason: 'already_active' });
    const cd = requestUnstuck(idle({ cooldownRemaining: 12.2 }), null);
    expect(cd).toMatchObject({ ok: false, reason: 'cooldown', cooldownSeconds: 13 });
  });

  it('skips the motion gates for a corpse (its physics fields are frozen)', () => {
    // Dying mid-fall leaves onGround false forever; gating on it would strand
    // exactly the player unstuck exists to rescue.
    expect(unstuckBlockedReason(idle({ dead: true, onGround: false, speed: 9 }))).toBeNull();
    // The action gates still apply to the dead.
    expect(unstuckBlockedReason(idle({ dead: true, trading: true }))).toBe('trading');
  });
});

describe('unstuck: the countdown', () => {
  it('completes after exactly the countdown, on the sim clock', () => {
    const state = start();
    const { result, ticks } = run(state, 20 * 30);
    expect(result.phase).toBe('completed');
    // 10 seconds at 20 Hz. Never a wall clock: the only time input is snap.time.
    expect(ticks).toBe(UNSTUCK_COUNTDOWN_SECONDS / DT);
  });

  it('announces each whole second exactly once, counting down', () => {
    const { countdowns } = run(start(), 20 * 30);
    expect(countdowns).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('is cancelled by movement input', () => {
    const { result } = run(start(), 20 * 30, (s, t) => (t === 40 ? { ...s, moveInput: true } : s));
    expect(result).toMatchObject({ phase: 'cancelled', reason: 'moved' });
  });

  it('is cancelled by actually drifting out of the origin', () => {
    const { result } = run(start(), 20 * 30, (s, t) =>
      t === 60 ? { ...s, pos: { x: 12, y: 4, z: 20 } } : s,
    );
    expect(result).toMatchObject({ phase: 'cancelled', reason: 'moved' });
  });

  it('tolerates sub-threshold jitter without cancelling', () => {
    const { result } = run(start(), 20 * 30, (s) => ({
      ...s,
      pos: { x: 10.2, y: 4.1, z: 20.2 },
    }));
    expect(result.phase).toBe('completed');
  });

  it('is cancelled by damage, combat, and a cast', () => {
    expect(
      run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, damageTaken: 1 } : s)).result,
    ).toMatchObject({ phase: 'cancelled', reason: 'damaged' });
    expect(
      run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, inCombat: true } : s)).result,
    ).toMatchObject({ phase: 'cancelled', reason: 'combat' });
    expect(
      run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, busy: true } : s)).result,
    ).toMatchObject({ phase: 'cancelled', reason: 'busy' });
  });

  it('is cancelled by leaving the area or being controlled', () => {
    expect(
      run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, areaKey: 'mirefen_marsh' } : s)).result,
    ).toMatchObject({ phase: 'cancelled', reason: 'state_changed' });
    expect(
      run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, stunned: true } : s)).result,
    ).toMatchObject({ phase: 'cancelled', reason: 'state_changed' });
  });

  it('cancels when the player dies mid-countdown, so it is never a cheap death loop', () => {
    const { result } = run(start(), 20 * 30, (s, t) => (t === 30 ? { ...s, dead: true } : s));
    expect(result).toMatchObject({ phase: 'cancelled', reason: 'state_changed' });
  });

  it('cancels when a dead player is raised mid-countdown', () => {
    const state = start(idle({ dead: true }));
    const { result } = run(state, 20 * 30, (s, t) => ({ ...s, dead: t < 30 }));
    expect(result).toMatchObject({ phase: 'cancelled', reason: 'state_changed' });
  });
});

describe('unstuck: the outcome', () => {
  it('moves a LIVING player without killing them', () => {
    const { result } = run(start(), 20 * 30);
    expect(result.phase).toBe('completed');
    if (result.phase !== 'completed') return;
    expect(result.resolution.outcome).toBe('moved_to_graveyard');
    expect(result.resolution.revive).toBe(false);
    // There is no "kill" outcome in the union at all: the only two are the move
    // and the revive, so a living player can never be killed by /unstuck.
    expect(['moved_to_graveyard', 'revived_at_graveyard']).toContain(result.resolution.outcome);
  });

  it('REVIVES a dead player instead of killing them again', () => {
    const state = start(idle({ dead: true }));
    const { result } = run(state, 20 * 30, (s) => ({ ...s, dead: true }));
    expect(result.phase).toBe('completed');
    if (result.phase !== 'completed') return;
    expect(result.resolution.outcome).toBe('revived_at_graveyard');
    expect(result.resolution.revive).toBe(true);
  });

  it('lands on the same graveyard the death loop would use', () => {
    const { result } = run(start(), 20 * 30);
    if (result.phase !== 'completed') throw new Error('expected completion');
    expect(result.resolution.destination).toEqual(zoneAt(20).graveyard);
  });

  it('surfaces a dungeon unstuck at the graveyard of the DOOR zone', () => {
    // Mirrors releaseSpirit: inside an instance you surface where your corpse run
    // would have started, never at the zone the instance band happens to sit in.
    const inside = { x: 900, z: 0 };
    const dungeon = dungeonAt(inside.x);
    expect(dungeon).not.toBeNull();
    if (!dungeon) return;
    expect(unstuckGraveyardFor(inside)).toEqual(zoneAt(dungeon.doorPos.z).graveyard);
  });

  it('stamps the long success cooldown, not the short retry one', () => {
    const { result } = run(start(), 20 * 30);
    if (result.phase !== 'completed') throw new Error('expected completion');
    expect(result.resolution.cooldownSeconds).toBe(UNSTUCK_SUCCESS_COOLDOWN_SECONDS);
    expect(UNSTUCK_SUCCESS_COOLDOWN_SECONDS).toBeGreaterThan(UNSTUCK_RETRY_COOLDOWN_SECONDS);
  });
});

describe('unstuck: sickness', () => {
  it('waives the debuff below the classic level line', () => {
    expect(unstuckSickness(UNSTUCK_SICKNESS_MIN_LEVEL - 1).durationSeconds).toBe(0);
    expect(unstuckSickness(1).statPct).toBe(0);
  });

  it('scales with level and caps at five minutes', () => {
    expect(unstuckSickness(10).durationSeconds).toBe(60);
    expect(unstuckSickness(11).durationSeconds).toBe(90);
    expect(unstuckSickness(20).durationSeconds).toBe(UNSTUCK_SICKNESS_MAX_SECONDS);
    expect(unstuckSickness(20).statPct).toBe(0.75);
  });

  it('is applied on a successful unstuck', () => {
    const { result } = run(start(), 20 * 30);
    if (result.phase !== 'completed') throw new Error('expected completion');
    expect(result.resolution.sickness.id).toBe(UNSTUCK_SICKNESS_ID);
    expect(result.resolution.sickness.durationSeconds).toBe(UNSTUCK_SICKNESS_MAX_SECONDS);
  });

  it('builds a negative all-stats aura that never floors an attribute', () => {
    const base: Stats = { str: 100, agi: 80, sta: 120, int: 40, spi: 60, armor: 500 };
    const aura = unstuckSicknessAura(20, base, 7);
    expect(aura).not.toBeNull();
    if (!aura) return;
    expect(aura.id).toBe(UNSTUCK_SICKNESS_ID);
    expect(aura.kind).toBe('buff_allstats');
    expect(aura.value).toBeLessThan(0);
    expect(aura.duration).toBe(UNSTUCK_SICKNESS_MAX_SECONDS);
    expect(aura.sourceId).toBe(7);
    // The smallest attribute (int 40) survives with at least 1 point.
    expect(base.int + aura.value).toBeGreaterThanOrEqual(1);
  });

  it('builds no aura at all under the level line', () => {
    const base: Stats = { str: 20, agi: 20, sta: 20, int: 20, spi: 20, armor: 50 };
    expect(unstuckSicknessAura(5, base, 1)).toBeNull();
  });
});

describe('unstuck: determinism', () => {
  it('produces identical results from identical inputs', () => {
    const once = () => {
      const { result, countdowns, ticks } = run(start(), 20 * 30);
      return JSON.stringify({ result, countdowns, ticks });
    };
    expect(once()).toEqual(once());
  });

  it('reads no wall clock: replaying the same sim times replays the outcome', () => {
    const replay = (offset: number) => {
      const state = start(idle({ time: offset }));
      let current = state;
      let out: UnstuckTickResult | null = null;
      for (let i = 1; i <= 20 * 30; i++) {
        const res = tickUnstuck(idle({ time: offset + i * DT }), current);
        if (res.phase !== 'pending') {
          out = res;
          break;
        }
        current = res.state;
      }
      return out;
    };
    // The same relative sim time produces the same resolution regardless of when
    // in the world's life the attempt happened.
    const a = replay(0);
    const b = replay(5000);
    expect(a?.phase).toBe('completed');
    if (a?.phase !== 'completed' || b?.phase !== 'completed') return;
    expect(a.resolution.destination).toEqual(b.resolution.destination);
    expect(a.resolution.duration).toBeCloseTo(b.resolution.duration, 6);
  });
});
