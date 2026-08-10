import { describe, expect, it } from 'vitest';

import { CAMPS, GROUND_OBJECTS, NPCS, QUESTS, ZONES } from '../src/sim/data';
import { angleTo, type Vec3 } from '../src/sim/types';
import { bearingDegrees, type CardinalId, headingLabel } from '../src/ui/compass';

// ---------------------------------------------------------------------------
// Compass fidelity for the four zones ported from upstream.
//
// This is the single highest-risk class of error in the port. Upstream writes
// +x as EAST; this world is +z NORTH and +x WEST, so east is -x. Every compass
// word in their copy is therefore MIRRORED for us, and three of their lines
// were also wrong on their own axes before the mirror (the Galecrest beacon is
// south of Wickharbor, and the Evergarden's Lily Basin and fourth Quiet Sister
// are north of the maze, not south).
//
// The same two tiers as `tests/compass_directions.test.ts`, and the same
// derivation through the sim's `angleTo` and the HUD's own bearing math, so a
// line rewritten from screen-space intuition fails here instead of misdirecting
// a player in fourteen locales:
//   STRICT - the nearest rose point must be exactly the word in the copy.
//   LOOSE  - the word only has to be within 90 degrees of the true bearing,
//            for prose that names a dominant axis for a diagonal.
// ---------------------------------------------------------------------------

const WORD: Record<CardinalId, string> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};
const DEG: Record<CardinalId, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};
const WORD_TO_ID = Object.fromEntries(
  (Object.keys(WORD) as CardinalId[]).map((id) => [WORD[id], id]),
) as Record<string, CardinalId>;

type Anchor =
  | { camp: string }
  | { object: string }
  | { npc: string }
  | { poi: string }
  | { hub: string };

function mean(points: { x: number; z: number }[], what: string): Vec3 {
  expect(points.length, `no coordinates found for ${what}`).toBeGreaterThan(0);
  const x = points.reduce((a, p) => a + p.x, 0) / points.length;
  const z = points.reduce((a, p) => a + p.z, 0) / points.length;
  return { x, y: 0, z };
}

function resolve(a: Anchor): Vec3 {
  if ('camp' in a)
    return mean(
      CAMPS.filter((c) => c.mobId === a.camp).map((c) => c.center),
      `camp ${a.camp}`,
    );
  if ('object' in a)
    return mean(
      GROUND_OBJECTS.filter((o) => o.itemId === a.object).flatMap((o) => o.positions),
      `object ${a.object}`,
    );
  if ('npc' in a) {
    const npc = NPCS[a.npc];
    expect(npc, `no npc ${a.npc}`).toBeTruthy();
    return { x: npc.pos.x, y: 0, z: npc.pos.z };
  }
  if ('hub' in a) {
    const zone = ZONES.find((z) => z.id === a.hub);
    expect(zone, `no zone ${a.hub}`).toBeTruthy();
    return { x: zone!.hub.x, y: 0, z: zone!.hub.z };
  }
  return mean(
    ZONES.flatMap((z) => z.pois).filter((p) => p.label === a.poi),
    `poi ${a.poi}`,
  );
}

function bearing(from: Anchor, to: Anchor): number {
  return bearingDegrees(angleTo(resolve(from), resolve(to)));
}

function roseBetween(from: Anchor, to: Anchor): CardinalId {
  return headingLabel(bearing(from, to));
}

function delta(a: number, b: number): number {
  const d = Math.abs(((b - a + 540) % 360) - 180);
  return d;
}

/** The quest text really does contain the word, and the word is the rose point
 *  a player would read off the compass strip walking `from` to `to`. */
function strict(questId: string, word: string, from: Anchor, to: Anchor): void {
  const quest = QUESTS[questId];
  expect(quest, `no quest ${questId}`).toBeTruthy();
  expect(quest.text.toLowerCase(), `${questId} does not say "${word}"`).toContain(word);
  expect(roseBetween(from, to), `${questId}: "${word}"`).toBe(WORD_TO_ID[word]);
}

/** Same, but the named word only has to be the dominant axis (within 90deg). */
function loose(questId: string, word: string, from: Anchor, to: Anchor): void {
  const quest = QUESTS[questId];
  expect(quest, `no quest ${questId}`).toBeTruthy();
  expect(quest.text.toLowerCase(), `${questId} does not say "${word}"`).toContain(word);
  const got = bearing(from, to);
  expect(
    delta(DEG[WORD_TO_ID[word]], got),
    `${questId}: "${word}" but the bearing is ${got.toFixed(1)} (${headingLabel(got)})`,
  ).toBeLessThan(90);
}

describe('realm ring compass: the Willowfen', () => {
  it('sends the player NORTH from the Amberfen Steps to Bridgemere', () => {
    strict('q_wf_across_the_fenway', 'north', { npc: 'waykeeper_pell' }, { hub: 'willowfen' });
  });

  it('puts the toll skiff on the WEST track (upstream said east: +x is west here)', () => {
    loose(
      'q_wf_toll_and_tangle',
      'west',
      { hub: 'willowfen' },
      { object: 'bridgemere_toll_chest' },
    );
  });

  it('sends the player EAST around the moat to Mother Sedge (upstream said west)', () => {
    loose(
      'q_wf_witch_of_willowweep',
      'east',
      { npc: 'bridgewright_alden' },
      { npc: 'mother_sedge' },
    );
  });
});

describe('realm ring compass: the Galecrest', () => {
  it('puts Wickharbor WEST along the downs road from the Windway (upstream said east)', () => {
    loose('q_gc_down_the_windway', 'west', { npc: 'watcher_maren' }, { hub: 'galecrest' });
  });

  it('grazes the moor rams EAST of town (upstream said west)', () => {
    loose('q_gc_wool_off_the_downs', 'east', { hub: 'galecrest' }, { camp: 'moor_ram' });
  });

  it('puts the Old Beacon SOUTHWEST of town (upstream said northeast, wrong on both axes)', () => {
    strict('q_gc_keeper_of_the_flame', 'southwest', { hub: 'galecrest' }, { npc: 'keeper_bram' });
  });

  it('sends the player NORTH up the cliff road to the Wreckfields', () => {
    loose('q_gc_the_far_shore', 'north', { npc: 'keeper_bram' }, { npc: 'salvager_edda' });
  });
});

describe('realm ring compass: the Palmreach', () => {
  it('sends the player NORTH along the shore road to Drifthaven', () => {
    loose('q_pr_down_to_drifthaven', 'north', { npc: 'strandwatcher_pell' }, { hub: 'palmreach' });
  });
});

describe('realm ring compass: the Evergarden', () => {
  it('puts the gnome warren EAST of the maze (upstream said west)', () => {
    loose(
      'q_eg_gnomes_in_the_green',
      'east',
      { poi: 'The Great Maze' },
      { object: 'hedgewick_tool_cart' },
    );
  });

  it('puts the Lily Basin on the far NORTH lawns (upstream said south)', () => {
    loose(
      'q_eg_who_trims_the_hedges',
      'north',
      { npc: 'head_gardener_amaranth' },
      { npc: 'gardener_yew' },
    );
  });

  it('names all four Quiet Sisters by the quarter they really stand in', () => {
    const quest = QUESTS.q_eg_four_statues;
    const maze = resolve({ poi: 'The Great Maze' });
    const sisters = GROUND_OBJECTS.filter(
      (o) => o.itemId === 'evergarden_statue_rubbing',
    ).flatMap((o) => o.positions);
    expect(sisters).toHaveLength(4);
    // the pond-walk sister and the gnome-warren sister are named by their x
    // side of the maze, and the fourth by its z side
    const pondWalk = sisters.find((p) => p.x > maze.x)!;
    const warren = sisters.find((p) => p.x < maze.x && p.z > 1000)!;
    const farLawn = sisters.find((p) => p.z > 1100)!;
    expect(headingLabel(bearingDegrees(angleTo(maze, { x: pondWalk.x, y: 0, z: pondWalk.z })))).toBe(
      'W',
    );
    expect(quest.text).toContain('pond walk west of the maze');
    expect(
      delta(DEG.E, bearingDegrees(angleTo(maze, { x: warren.x, y: 0, z: warren.z }))),
    ).toBeLessThan(90);
    expect(quest.text).toContain('east lawn where the gnomes keep their warren');
    expect(
      delta(DEG.N, bearingDegrees(angleTo(maze, { x: farLawn.x, y: 0, z: farLawn.z }))),
    ).toBeLessThan(90);
    expect(quest.text).toContain('north lawn past the hedges');
  });
});

describe('realm ring compass: no ported line still reads in upstream own convention', () => {
  // A blunt backstop for the lines the cases above do not each name: every
  // compass word that survives in ported copy has been re-derived, so a future
  // edit that pastes an upstream string back in fails here.
  const RING_QUESTS = Object.values(QUESTS).filter((q) => /^q_(wf|gc|pr|eg)_/.test(q.id));

  it('carries exactly the direction words this file checks', () => {
    const found: string[] = [];
    for (const q of RING_QUESTS) {
      for (const word of Object.values(WORD)) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(q.text)) found.push(`${q.id}:${word}`);
      }
    }
    expect(found.sort()).toEqual(
      [
        'q_eg_four_statues:east',
        'q_eg_four_statues:north',
        'q_eg_four_statues:west',
        'q_eg_gnomes_in_the_green:east',
        'q_eg_who_trims_the_hedges:north',
        'q_gc_down_the_windway:west',
        'q_gc_keeper_of_the_flame:southwest',
        'q_gc_the_far_shore:north',
        'q_gc_wool_off_the_downs:east',
        'q_pr_down_to_drifthaven:north',
        'q_wf_across_the_fenway:north',
        'q_wf_toll_and_tangle:west',
        'q_wf_witch_of_willowweep:east',
      ].sort(),
    );
  });
});
