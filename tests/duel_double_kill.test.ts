import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { groundHeight } from '../src/sim/world';

// A duel must NEVER produce a real death. The 1-HP clamp used to be a synchronous
// map lookup: endDuel deleted the `duels` entry for both pids the instant the first
// lethal blow resolved, so a second, independently lethal blow against the OTHER
// duelist later in the SAME tick missed the lookup entirely and fell through to a
// real player death (both duelists dead, no winner).

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function teleport(sim: Sim, pid: number, x: number, z: number) {
  const e = sim.entities.get(pid)!;
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = groundHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  (sim as any).rebucket(e);
}

// Two adjacent players in an accepted duel, countdown run out so the bout is live.
function startedDuel(): { sim: Sim; a: number; b: number } {
  const sim = makeWorld();
  const a = sim.addPlayer('warrior', 'Aleph', { autoEquip: true });
  const b = sim.addPlayer('warrior', 'Bet', { autoEquip: true });
  teleport(sim, a, 0, -40);
  teleport(sim, b, 4, -40);
  sim.duelRequest(b, a);
  sim.duelAccept(b);
  for (let i = 0; i < 20 * 4; i++) {
    sim.tick();
    if (sim.duelFor(a)?.state === 'active') break;
  }
  return { sim, a, b };
}

describe('duel: simultaneous lethal exchange (#2609)', () => {
  it('resolves a same-tick reciprocal killing blow to one winner, not two corpses', () => {
    const { sim, a, b } = startedDuel();
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;
    expect(sim.duelFor(a)?.state).toBe('active');

    // Both blows land inside one tick, each independently lethal. The first one
    // ends the duel; the second must still be clamped by the same duel.
    (sim as any).dealDamage(ea, eb, eb.hp + 1000, false, 'physical', 'Finisher', 'hit');
    (sim as any).dealDamage(eb, ea, ea.hp + 1000, false, 'physical', 'Riposte', 'hit');

    expect(eb.dead).toBe(false);
    expect(eb.hp).toBe(1);
    expect(ea.dead).toBe(false);
    expect(ea.hp).toBe(1);
    expect(sim.duelFor(a)).toBeNull();
    expect(sim.duelFor(b)).toBeNull();
  });

  it('announces exactly one duel result for the reciprocal exchange', () => {
    const { sim, a, b } = startedDuel();
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;

    (sim as any).dealDamage(ea, eb, eb.hp + 1000, false, 'physical', 'Finisher', 'hit');
    (sim as any).dealDamage(eb, ea, ea.hp + 1000, false, 'physical', 'Riposte', 'hit');
    const events = sim.tick();

    const ends = events.filter(
      (e): e is Extract<SimEvent, { type: 'duelEnd' }> => e.type === 'duelEnd',
    );
    expect(ends).toHaveLength(1);
    // The blow that landed first wins; the loser is the other duelist.
    expect(ends[0].winnerName).toBe('Aleph');
    expect(ends[0].loserName).toBe('Bet');
    // Neither player died for real, and no death event was emitted for either.
    expect(events.some((e) => e.type === 'playerDeath')).toBe(false);
  });

  it('purges the ended duel at tick tail so a rematch can be requested at once', () => {
    const { sim, a, b } = startedDuel();
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;

    (sim as any).dealDamage(ea, eb, eb.hp + 1000, false, 'physical', 'Finisher', 'hit');
    sim.tick();
    expect((sim as any).duels.has(a)).toBe(false);
    expect((sim as any).duels.has(b)).toBe(false);

    // A fresh challenge is accepted rather than rejected with "already in progress".
    const events: SimEvent[] = [];
    sim.duelRequest(b, a);
    events.push(...sim.tick());
    expect(
      events.some((e) => e.type === 'error' && e.text === 'A duel is already in progress.'),
    ).toBe(false);
    expect(events.some((e) => e.type === 'duelRequest')).toBe(true);
  });

  it('stops clamping once the duel has ended and the tick has moved on', () => {
    const { sim, a, b } = startedDuel();
    const ea = sim.entities.get(a)!;
    const eb = sim.entities.get(b)!;

    (sim as any).dealDamage(ea, eb, eb.hp + 1000, false, 'physical', 'Finisher', 'hit');
    sim.tick(); // duel purged at tick tail
    // The bout is over: the two are no longer hostile to each other, so a later
    // blow is not a duel blow at all and the clamp must not resurrect the duel.
    expect(sim.isHostileTo(ea, eb)).toBe(false);
    expect(sim.duelFor(a)).toBeNull();
  });
});
