// Gathering proficiency bands: the shared 0/1/2 ladder over one profession's
// proficiency counter. Two consumers read it: the gather-cast duration (a
// higher band shaves the cast) and the fishing catch table (a higher band
// shifts weight out of junk and into food fish).
//
// Pure leaf: no host state, no rng, directly Vitest-importable. Kept in its own
// module (rather than inside fishing.ts, upstream's original home) because
// `gathering.ts` needs it too and fishing.ts already depends on gathering.ts.
//
// ADAPTED, not ported verbatim. Upstream pins the thresholds at the literal
// [0, 100, 200] and documents them as "the thirds of the gathering maxSkill",
// which was true when every gathering profession capped at 300. Their caps
// later dropped to 100 (mining/logging/herbalism) and 200 (fishing) without the
// literals being re-derived, so on their live numbers a miner can never leave
// band 0 and an angler reaches band 2 only at exactly the cap. We keep the
// DOCUMENTED intent (thirds of the profession's own ceiling) instead of the
// stale literals, which restores the ladder for all four professions and
// reproduces upstream's original 300-cap boundaries exactly.

/** Band boundaries as a fraction of the profession's own `maxSkill`. */
export const PROFICIENCY_BAND_FRACTIONS = [0, 1 / 3, 2 / 3] as const;

/** The three minimum-proficiency boundaries for a profession capped at
 *  `maxSkill`. Floored to whole points so the boundary is a value a counter can
 *  actually land on: mining (100) bands at 0/33/66, fishing (200) at 0/66/133. */
export function proficiencyBandThresholds(maxSkill: number): [number, number, number] {
  return [
    Math.floor(PROFICIENCY_BAND_FRACTIONS[0] * maxSkill),
    Math.floor(PROFICIENCY_BAND_FRACTIONS[1] * maxSkill),
    Math.floor(PROFICIENCY_BAND_FRACTIONS[2] * maxSkill),
  ];
}

/** Which band a proficiency selects. Pure state (no rng), so it never perturbs
 *  a draw-order contract. A NaN proficiency fails both comparisons and falls to
 *  band 0, matching the proficiency-0 default. */
export function proficiencyBandFor(proficiency: number, maxSkill: number): 0 | 1 | 2 {
  const t = proficiencyBandThresholds(maxSkill);
  if (proficiency >= t[2]) return 2;
  if (proficiency >= t[1]) return 1;
  return 0;
}
