import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';
import type { PlayerClass } from '../src/sim/types';
import {
  LFG_INTENT_KINDS,
  createLfgQueueState,
  joinDungeonFinder,
  respondToLfgProposal,
  tickDungeonFinder,
  type LfgIntent,
  type LfgIntentKind,
} from '../src/sim/lfg';

const LFG_DIR = join(__dirname, '..', 'src', 'sim', 'lfg');
const sources = readdirSync(LFG_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({ file: f, text: readFileSync(join(LFG_DIR, f), 'utf8') }));

const CRYPT = 'hollow_crypt';
const party = (base: number) =>
  (
    [
      [base + 1, 'warrior'],
      [base + 2, 'priest'],
      [base + 3, 'mage'],
      [base + 4, 'rogue'],
      [base + 5, 'hunter'],
    ] as [number, PlayerClass][]
  ).map(([pid, cls]) => ({ pid, cls, level: 20 }));

// One full lifecycle: three parties queue, slots are scarce, one player
// declines, another times out, the rest form a group.
function runScenario(): LfgIntent[] {
  const state = createLfgQueueState();
  const intents: LfgIntent[] = [];
  for (let g = 0; g < 3; g++) {
    for (const member of party(g * 10)) {
      joinDungeonFinder(state, {
        dungeonId: CRYPT,
        members: [member],
        premade: false,
        now: g * 2,
      });
    }
  }
  intents.push(...tickDungeonFinder(state, { now: 10, freeInstanceSlots: { [CRYPT]: 2 }, isAvailable: () => true }).intents);
  const first = state.proposals[0];
  for (const member of [...first.members]) {
    const res = respondToLfgProposal(state, {
      pid: member.pid,
      accept: member.pid !== first.members[2].pid,
      now: 11,
    });
    intents.push(...res.intents);
  }
  intents.push(...tickDungeonFinder(state, { now: 12, freeInstanceSlots: { [CRYPT]: 2 }, isAvailable: () => true }).intents);
  const ready = state.proposals[0];
  for (const member of [...ready.members]) {
    intents.push(...respondToLfgProposal(state, { pid: member.pid, accept: true, now: 13 }).intents);
  }
  intents.push(...tickDungeonFinder(state, { now: 14, freeInstanceSlots: { [CRYPT]: 2 }, isAvailable: (pid) => pid !== 25 }).intents);
  intents.push(...tickDungeonFinder(state, { now: 200, freeInstanceSlots: { [CRYPT]: 1 }, isAvailable: () => true }).intents);
  return intents;
}

describe('dungeon finder determinism', () => {
  // The rule, not just its symptom: this subsystem draws ZERO times, because
  // the host calls it inside the 20 Hz tick on the world's shared Rng stream
  // and one draw would reorder every downstream roll in the world.
  it('never touches randomness or a wall clock', () => {
    const banned = [
      /\bRng\b/,
      /Math\.random/,
      /Date\.now/,
      /performance\.now/,
      /\.next\s*\(/,
      /\.chance\s*\(/,
      /\.pick\s*\(/,
      /\brng\b/i,
    ];
    for (const { file, text } of sources) {
      // Strip comments: the CLAUDE-style prose in these files talks ABOUT rng.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      for (const rx of banned) {
        expect(rx.test(code), `${file} must stay free of ${rx}`).toBe(false);
      }
    }
  });

  it('imports nothing outside src/sim, and only as types', () => {
    for (const { file, text } of sources) {
      expect(text, `${file} must not import a host module`).not.toMatch(
        /from '\.\.\/\.\.\/(render|ui|game|net)/,
      );
      // The only cross-directory imports are type-only.
      const crossDir = [...text.matchAll(/^(import[\s\S]*?)from '(\.\.\/[^']+)';$/gm)];
      for (const [, head, spec] of crossDir) {
        expect(head.startsWith('import type'), `${file}: ${spec} must be a type-only import`).toBe(
          true,
        );
      }
    }
  });

  // The draw count is pinned by the source scan above, which is the only pin
  // that CAN fail: no function here accepts an Rng, so there is no stream to
  // hand in and observe. What is assertable is the shape that makes that true.
  it('exposes no entry point that could take an rng', () => {
    expect(tickDungeonFinder).toHaveLength(2); // (state, input)
    const input = { now: 0, freeInstanceSlots: {}, isAvailable: () => true };
    expect(Object.keys(input).sort()).toEqual(['freeInstanceSlots', 'isAvailable', 'now']);
    // A control stream, untouched by a full run, still reads as a fresh one.
    const control = new Rng(20260809);
    const expected = [control.next(), control.next(), control.next()];
    runScenario();
    const after = new Rng(20260809);
    expect([after.next(), after.next(), after.next()]).toEqual(expected);
  });

  it('replays a full scenario to the identical intent stream', () => {
    const a = runScenario();
    const b = runScenario();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  // TRAP 1 (docs/design/parity-backlog.md): sim-to-UI event names are compared
  // as strings and a rename is invisible to tsc. Pin the contract here.
  it('emits only the frozen intent kinds', () => {
    const emitted = new Set(runScenario().map((i) => i.kind));
    for (const kind of emitted) expect(LFG_INTENT_KINDS).toContain(kind);
    // Every declared kind is reachable from a real run except the penalty arm's
    // sibling, so assert the declared set instead of only the observed one.
    expect([...LFG_INTENT_KINDS].sort()).toEqual(
      [
        'dungeonFinderFormGroup',
        'dungeonFinderPenalty',
        'dungeonFinderProposalClosed',
        'dungeonFinderProposalOpened',
      ] satisfies LfgIntentKind[],
    );
    // OBSTACLE 3: none of them may be the taken chat-channel token.
    for (const kind of LFG_INTENT_KINDS) expect(kind).not.toBe('lfg');
  });
});
