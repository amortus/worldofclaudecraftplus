// Harmful-vs-beneficial classification for an aura, plus the pure decision for the
// combat-log message an aura-GAIN SimEvent produces for an entity OTHER than the
// player (the hud.ts 'aura' case). Host-agnostic (no DOM, no i18n runtime) so both
// calls are unit-testable without a HUD harness, following the pure-core pattern used
// across src/ui/*_view.ts.
//
// The gain event only carries {targetId, name, gained}, no kind and no value, so the
// caller looks up the live Aura the event just applied on the target's aura list
// (matched by name) and passes it in here. That reuses the SAME classifier the
// buff/debuff aura bar split uses, instead of inventing a second harmful/beneficial
// rule that could drift from it.

import type { Aura, AuraKind } from '../sim/types';

// Aura kinds that are harmful on their face: the CLIENT's list, lifted verbatim out
// of hud.ts's aura-bar buff/debuff split so the bar and the combat-log line can never
// disagree. It is deliberately WIDER than the sim's HARMFUL_AURA_KINDS (src/sim/sim.ts),
// which exists only to tag /targetbuffs output; every kind the sim calls harmful is
// harmful here too, and tests/aura_gain_log.test.ts pins that superset relation so a
// kind added to the sim's set can never be beneficial here.
const DEBUFF_AURA_KINDS: readonly AuraKind[] = [
  'dot',
  'slow',
  'root',
  'stun',
  'incapacitate',
  'polymorph',
  'attackspeed',
  'debuff_ap',
  'sunder',
  'mortal_wound',
  'silence',
  'disarm',
  'blind',
  'expose',
  'spellvuln',
  'lockout',
  'vulnerability',
  'hex',
  'tongues',
  'cost_tax',
  'heal_absorb',
  'critvuln',
];

const DEBUFF_KIND_SET = new Set<string>(DEBUFF_AURA_KINDS);

/**
 * True when an aura is a debuff. A negative-value stat aura (a mob's Withering Wail
 * sapping attack power, an Intellect-draining curse) is a debuff even though it
 * reuses a `buff_*` kind, so the value breaks that tie.
 */
export function isDebuffAura(kind: AuraKind, value: number): boolean {
  return DEBUFF_KIND_SET.has(kind) || (kind.startsWith('buff_') && value < 0);
}

export type AuraGainLogKey = 'hud.combat.auraAfflicted' | 'hudChrome.combat.auraGainOther';

/**
 * The combat-log key for "some other unit just gained an aura". `matchedAura` is the
 * live Aura found on the target at the moment the event is handled; when none can be
 * found (it already expired before the event drained, or the online mirror has not
 * echoed it yet) the gain reads as neutral rather than being assumed harmful.
 */
export function auraGainLogKeyFor(
  matchedAura: Pick<Aura, 'kind' | 'value'> | undefined,
): AuraGainLogKey {
  if (!matchedAura) return 'hudChrome.combat.auraGainOther';
  return isDebuffAura(matchedAura.kind, matchedAura.value ?? 0)
    ? 'hud.combat.auraAfflicted'
    : 'hudChrome.combat.auraGainOther';
}

/**
 * Finds the live aura a just-applied gain event refers to on the target's aura list,
 * matched by the display name the event carries.
 */
export function findAuraForGainEvent<T extends Pick<Aura, 'name'>>(
  auras: readonly T[],
  name: string,
): T | undefined {
  return auras.find((a) => a.name === name);
}
