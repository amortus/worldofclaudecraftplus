// Reputation - WoW-Classic-style faction standing (the "Dawn of Claude" faction
// is the first, earned in the Ashen Wastes against the Claudexxaramas corruption).
//
// A player holds a points total per faction. Points are stored relative to the
// Neutral floor (= 0): negative is below Neutral, positive above. The standing
// tier and the in-tier progress are DERIVED from cumulative vanilla thresholds,
// so the same math drives the rep bar, vendor gating, and raid attunement.
//
// Pure + deterministic (no Rng, no DOM): unit-tested directly (tests/reputation.test.ts).

export type ReputationStanding =
  | 'hated'
  | 'hostile'
  | 'unfriendly'
  | 'neutral'
  | 'friendly'
  | 'honored'
  | 'revered'
  | 'exalted';

export interface ReputationTier {
  standing: ReputationStanding;
  /** points at the start of this tier (cumulative from the Hated bottom) */
  floor: number;
  /** points needed to fill this tier; Infinity for Exalted (the cap) */
  span: number;
}

// Vanilla thresholds. Neutral 0..2999, Friendly 3000..8999, Honored 9000..20999,
// Revered 21000..41999, Exalted 42000+. Below Neutral mirrors downward.
export const REP_TIERS: readonly ReputationTier[] = [
  { standing: 'hated', floor: -42000, span: 36000 },
  { standing: 'hostile', floor: -6000, span: 3000 },
  { standing: 'unfriendly', floor: -3000, span: 3000 },
  { standing: 'neutral', floor: 0, span: 3000 },
  { standing: 'friendly', floor: 3000, span: 6000 },
  { standing: 'honored', floor: 9000, span: 12000 },
  { standing: 'revered', floor: 21000, span: 21000 },
  { standing: 'exalted', floor: 42000, span: Number.POSITIVE_INFINITY },
];

/** Lowest / highest stored points (Exalted is the cap; we don't track past it). */
export const REP_MIN = -42000;
export const REP_MAX = 42000;

/** Tier order index, for "is standing >= X" gating (vendor pieces, attunement). */
export const STANDING_ORDER: Record<ReputationStanding, number> = {
  hated: 0,
  hostile: 1,
  unfriendly: 2,
  neutral: 3,
  friendly: 4,
  honored: 5,
  revered: 6,
  exalted: 7,
};

export interface ReputationState {
  standing: ReputationStanding;
  /** points filled within the current tier */
  current: number;
  /** points to fill the current tier (0 at Exalted) */
  max: number;
  /** raw points relative to the Neutral floor, clamped to [REP_MIN, REP_MAX] */
  points: number;
}

/** Resolve raw points to a standing + in-tier progress (the rep-bar shape). */
export function reputationFor(points: number): ReputationState {
  const p = Math.max(REP_MIN, Math.min(REP_MAX, Math.round(points)));
  let tier = REP_TIERS[0];
  for (const t of REP_TIERS) {
    if (p >= t.floor) tier = t;
    else break;
  }
  if (tier.standing === 'exalted') return { standing: 'exalted', current: 0, max: 0, points: p };
  return { standing: tier.standing, current: p - tier.floor, max: tier.span, points: p };
}

/** True when `points` is at least the given standing (gating helper). */
export function atLeastStanding(points: number, standing: ReputationStanding): boolean {
  return STANDING_ORDER[reputationFor(points).standing] >= STANDING_ORDER[standing];
}

export interface FactionDef {
  id: string;
  /** English display name; localized client-side via the entity i18n chain. */
  name: string;
  /** starting points for a fresh character (Neutral = 0). */
  start: number;
}

// The faction registry. Dawn of Claude is the first; more can be appended.
export const FACTIONS: Record<string, FactionDef> = {
  dawn_of_claude: { id: 'dawn_of_claude', name: 'Dawn of Claude', start: 0 },
};

export const FACTION_IDS = Object.keys(FACTIONS);
