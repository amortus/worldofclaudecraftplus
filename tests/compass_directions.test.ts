// Compass fidelity for player-visible quest text.
//
// The world convention is fixed by the sim's own math, not by prose:
//   angleTo(from, to) = atan2(dx, dz)            (src/sim/types.ts)
//   an entity moves along (sin facing, cos facing) (Sim.moveToward)
//   the HUD compass bearing is -facing, N=0 E=90  (src/ui/compass.ts)
// which makes +z NORTH, -z SOUTH, +x WEST and -x EAST.
//
// Quest copy kept drifting away from that (a "southeast" camp that is southwest,
// an "eastern" meadow that is west, graves whose east and west were swapped),
// and because pt_BR is our default locale a wrong English line ships as a wrong
// translation too. This test re-derives the compass word from the LIVE content
// tables through the SAME functions the HUD compass uses, so a camp that moves,
// or a line that is rewritten from screen-space intuition, fails here instead of
// misdirecting a player.
//
// Two tiers, on purpose:
//   STRICT - the nearest rose point must be exactly the word in the copy. Used
//            wherever the bearing is unambiguous.
//   LOOSE  - the named word only has to be within 90 degrees of the true
//            bearing. Used for prose that names a dominant axis for a diagonal
//            ("north past the third lake"). Still catches every inversion,
//            which is the failure mode that has actually shipped.

import { describe, expect, it } from 'vitest';

import { CAMPS, GROUND_OBJECTS, NPCS, QUESTS, ZONES } from '../src/sim/data';
import { angleTo, type Vec3 } from '../src/sim/types';
import { bearingDegrees, type CardinalId, headingLabel } from '../src/ui/compass';

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
const DEG: Record<CardinalId, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const WORD_TO_ID = Object.fromEntries(
  (Object.keys(WORD) as CardinalId[]).map((id) => [WORD[id], id]),
) as Record<string, CardinalId>;

// --- anchors, all resolved from the live tables -----------------------------

type Anchor =
  | { camp: string }
  | { object: string }
  | { npc: string }
  | { poi: string }
  | { lake: [string, number] };

function mean(points: { x: number; z: number }[], what: string): Vec3 {
  expect(points.length, `no coordinates found for ${what}`).toBeGreaterThan(0);
  const x = points.reduce((a, p) => a + p.x, 0) / points.length;
  const z = points.reduce((a, p) => a + p.z, 0) / points.length;
  return { x, y: 0, z };
}

function resolve(a: Anchor): Vec3 {
  if ('camp' in a) return mean(CAMPS.filter((c) => c.mobId === a.camp).map((c) => c.center), `camp ${a.camp}`);
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
  if ('lake' in a) {
    const [zoneId, index] = a.lake;
    const zone = ZONES.find((z) => z.id === zoneId);
    expect(zone?.lakes[index], `no lake ${index} in ${zoneId}`).toBeTruthy();
    const lake = zone!.lakes[index];
    return { x: lake.x, y: 0, z: lake.z };
  }
  const pois = ZONES.flatMap((z) => z.pois).filter((p) => p.label === a.poi);
  return mean(pois, `poi ${a.poi}`);
}

/** The rose point a player standing at `from` would read off the HUD compass
 *  while looking at `to`. Uses the sim's angleTo and the HUD's own bearing math,
 *  so the copy can never disagree with what the compass strip shows. */
function roseBetween(from: Anchor, to: Anchor): CardinalId {
  return headingLabel(bearingDegrees(angleTo(resolve(from), resolve(to))));
}

function bearingBetween(from: Anchor, to: Anchor): number {
  return bearingDegrees(angleTo(resolve(from), resolve(to)));
}

function angularError(a: number, b: number): number {
  return Math.abs(((((b - a) % 360) + 540) % 360) - 180);
}

// --- the cases -------------------------------------------------------------
//
// `template` is the exact phrase as it must read once {dir} is substituted.
// {dir}    -> north / northeast / ...
// {dirAdj} -> northern / eastern / ... (cardinals only; the copy never uses an
//             adjective form of a diagonal)

interface Case {
  quest: string;
  from: Anchor;
  to: Anchor;
  template: string;
  field?: 'text' | 'completionText';
}

const ADJ: Record<string, string> = {
  north: 'northern',
  south: 'southern',
  east: 'eastern',
  west: 'western',
};

function render(template: string, id: CardinalId): string {
  const word = WORD[id];
  if (template.includes('{dirAdj}')) {
    expect(ADJ[word], `no adjective form for ${word}; use {dir} in "${template}"`).toBeTruthy();
    return template.replace('{dirAdj}', ADJ[word]);
  }
  return template.replace('{dir}', word);
}

/** Which rose points a template can even express: the adjective form only
 *  exists for the four cardinals. */
function candidateIds(template: string): CardinalId[] {
  const all = Object.keys(WORD) as CardinalId[];
  return template.includes('{dirAdj}') ? all.filter((id) => ADJ[WORD[id]]) : all;
}

/** Copy hyphenates some diagonals ("north-west of the abandoned crypt"). Fold
 *  that away so the derived word matches either spelling. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/-/g, '');
}

const STRICT: Case[] = [
  // --- Eastbrook Vale ---
  { quest: 'q_wolves', from: { poi: 'Eastbrook' }, to: { camp: 'forest_wolf' }, template: 'on the {dir} road' },
  {
    quest: 'q_greyjaw',
    from: { camp: 'forest_wolf' },
    to: { camp: 'old_greyjaw' },
    template: 'the deep woods {dir} of the wolf runs',
  },
  { quest: 'q_boars', from: { poi: 'Eastbrook' }, to: { camp: 'wild_boar' }, template: 'the meadows {dir} of town' },
  {
    quest: 'q_spiders',
    from: { npc: 'apothecary_lin' },
    to: { camp: 'webwood_spider' },
    template: 'The lurkers in the {dirAdj} woods',
  },
  {
    quest: 'q_bones',
    from: { poi: 'Eastbrook' },
    to: { camp: 'restless_bones' },
    template: 'The old ruin on the {dir} hill',
  },
  // The bug that started this: the crates are at the SAME camp q_bandits sends
  // you to, and q_bandits already said southwest.
  {
    quest: 'q_supplies',
    from: { poi: 'Eastbrook' },
    to: { object: 'supply_crate' },
    template: 'their camp in the {dir} hills',
  },
  {
    quest: 'q_bandits',
    from: { poi: 'Eastbrook' },
    to: { camp: 'vale_bandit' },
    template: 'made camp in the {dir} hills',
  },
  { quest: 'q_mogger', from: { poi: 'Eastbrook' }, to: { camp: 'mogger' }, template: 'into the {dirAdj} meadow' },

  // --- Mirefen Marsh ---
  {
    quest: 'q_widows',
    from: { npc: 'herbalist_yara' },
    to: { camp: 'mire_widow' },
    template: 'the thicket {dir} of the road',
  },
  {
    quest: 'q_drowned_censers',
    from: { camp: 'mire_widow' },
    to: { object: 'rusted_censer' },
    template: '{dir} of the widow lake stands a chapel',
  },
  {
    quest: 'q_deacon',
    from: { npc: 'warden_fenwick' },
    to: { camp: 'deacon_voss' },
    template: 'Take the camp road {dir}',
  },

  // --- Thornpeak Heights: the Nythraxis grave chain, where east and west were
  // swapped in two consecutive quests.
  {
    quest: 'q_nythraxis_graves',
    from: { camp: 'boneclad_revenant' },
    to: { object: 'grave_sir_aldren' },
    template: 'Captain Aldren lies on the {dirAdj} rise',
  },
  {
    quest: 'q_nythraxis_bound_guardian',
    from: { object: 'grave_high_priest_malric' },
    to: { object: 'crypt_ritual_circle' },
    template: '{dir} of High Priest Malric',
  },

  // --- expansion pack ---
  {
    quest: 'q_ev_boars',
    from: { npc: 'houndmaster_teel' },
    to: { camp: 'wild_boar' },
    template: 'The boars in the {dir} meadow',
  },
  {
    quest: 'q_mf_polings',
    from: { npc: 'ferrywoman_odalie' },
    to: { camp: 'mire_prowler' },
    template: 'The channel {dir} of the causeway',
  },
];

// Prose that names a dominant axis for a bearing that is really diagonal. The
// word still has to point the player the right way (within 90 degrees), which
// is what every shipped bug violated.
const LOOSE: Case[] = [
  // Voss's grave is 113 degrees off the battlefield, right on the E/SE sector
  // line, so the rose point is not a stable expectation; what matters is that
  // the copy no longer says "western" for a grave on the east side.
  {
    quest: 'q_nythraxis_graves',
    from: { camp: 'boneclad_revenant' },
    to: { object: 'grave_captain_voss' },
    template: 'Royal Assassin Voss by the {dirAdj} cliff',
  },
  // The herd is east of Gravewatch and only slightly south of it, so "north"
  // names the weaker axis. Loose rather than rewritten: it still points a
  // player the right way.
  {
    quest: 'q_aw_rotting_herd',
    from: { camp: 'blighted_stag' },
    to: { poi: 'Gravewatch' },
    template: 'wander {dir} toward Gravewatch',
  },
  {
    quest: 'q_cult_camp',
    from: { lake: ['mirefen_marsh', 2] },
    to: { camp: 'gravecaller_cultist' },
    template: '{dir} past the third lake',
  },
  {
    quest: 'q_trolls',
    from: { poi: 'Fenbridge' },
    to: { camp: 'fen_troll' },
    template: 'barrow-mounds {dir} of the far lake',
  },
  {
    quest: 'q_ogre_edges',
    from: { poi: 'Highwatch' },
    to: { camp: 'thornpeak_ogre' },
    template: 'camped in the {dirAdj} foothills',
  },
  {
    quest: 'q_crushers',
    from: { poi: 'Highwatch' },
    to: { camp: 'ogre_crusher' },
    template: "war-camp squats in the {dirAdj} crags",
  },
  {
    quest: 'q_zealots',
    from: { npc: 'brother_aldric_highwatch' },
    to: { camp: 'wyrmcult_zealot' },
    template: 'the wind comes off the {dirAdj} peaks',
  },
  {
    quest: 'q_shard_cores',
    from: { npc: 'loremaster_caddis' },
    to: { poi: 'Gravewyrm Sanctum' },
    template: 'They point {dir}',
    field: 'completionText',
  },
  {
    quest: 'q_aw_wraiths',
    from: { npc: 'dawn_chaplain_orin' },
    to: { camp: 'wraithling' },
    template: 'The old barrows {dir} of here',
  },
];

function copy(c: Case): string {
  const quest = QUESTS[c.quest];
  expect(quest, `no quest ${c.quest}`).toBeTruthy();
  const text = c.field === 'completionText' ? quest.completionText : quest.text;
  expect(text, `quest ${c.quest} has no ${c.field ?? 'text'}`).toBeTruthy();
  return text!;
}

describe('quest copy names the compass direction the coordinates actually give', () => {
  it('agrees with the HUD compass on the convention itself', () => {
    // +z north, +x WEST, -x east. Pinned here so the whole table below has a
    // stated premise rather than an assumed one.
    const origin: Vec3 = { x: 0, y: 0, z: 0 };
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: 0, y: 0, z: 10 })))).toBe('N');
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: 0, y: 0, z: -10 })))).toBe('S');
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: 10, y: 0, z: 0 })))).toBe('W');
    expect(headingLabel(bearingDegrees(angleTo(origin, { x: -10, y: 0, z: 0 })))).toBe('E');
  });

  for (const c of STRICT) {
    it(`${c.quest}: "${c.template}"`, () => {
      const id = roseBetween(c.from, c.to);
      const phrase = render(c.template, id);
      expect(
        normalize(copy(c)),
        `derived bearing is ${bearingBetween(c.from, c.to).toFixed(1)} deg (${WORD[id]}), so the copy must read "${phrase}"`,
      ).toContain(normalize(phrase));
    });
  }

  for (const c of LOOSE) {
    it(`${c.quest} (dominant axis): "${c.template}"`, () => {
      const text = normalize(copy(c));
      const bearing = bearingBetween(c.from, c.to);
      // Find which word the copy actually used in this phrase.
      const used = candidateIds(c.template)
        .map((id) => ({ w: WORD[id], phrase: normalize(render(c.template, id)) }))
        .filter(({ phrase }) => text.includes(phrase));
      expect(used.length, `no direction word matched template "${c.template}" in ${c.quest}`).toBe(1);
      const err = angularError(bearing, DEG[WORD_TO_ID[used[0].w]]);
      expect(
        err,
        `${c.quest} says "${used[0].w}" but the bearing is ${bearing.toFixed(1)} deg (${WORD[headingLabel(bearing)]})`,
      ).toBeLessThan(90);
    });
  }
});
