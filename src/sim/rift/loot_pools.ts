// The rift loot economy: what a rift kill drops, per rank, per floor, boss or
// trash. Pure and host-agnostic; the caller supplies the `Rng`.
//
// ===========================================================================
// THE FIXED DRAW CONTRACT. Read this before touching anything below.
// ===========================================================================
//
// `rollRiftLoot` is called from inside the world's tick with the SHARED world
// `Rng` (unlike the generator in this directory, which builds its own local Rng
// from the descriptor: see this directory's CLAUDE.md). The shared Rng is a
// single ordered stream, so the NUMBER of draws a call makes is part of the
// contract, not an implementation detail. If the count varied with how many
// items happened to drop, one player's lucky roll would shift every later draw
// in the world (mob AI, respawn jitter, every other loot roll) and two clients
// replaying the same tick stream would diverge and never re-converge.
//
// Therefore: EVERY call to `rollRiftLoot` consumes EXACTLY `RIFT_LOOT_DRAWS`
// values from the caller's Rng. Always. Same count for a boss and for trash, at
// every rank, on every floor, whether it returns three items or none. The draws
// are taken up front, unconditionally, in one loop; the results are only
// INTERPRETED afterwards, so no early return and no conditional branch can ever
// change the count. Unused draws are dead on purpose; that waste is the price of
// a stable stream and it is cheap (eight doubles per kill).
//
// If you add a reward slot, add TWO draws (gate + pick) at the END of the fixed
// list and bump `RIFT_LOOT_DRAWS`. Never make a draw conditional.
// `tests/rift_loot.test.ts` pins the count by instrumenting `Rng.next`.
//
// ===========================================================================
// WHERE THE NUMBERS COME FROM
// ===========================================================================
//
// Rifts must sit ALONGSIDE the fork's authored endgame, never eclipse it. The
// three things they are measured against, all real numbers from
// `src/sim/content/`:
//
//   Claudeholme (5-player, 8 bosses)  each boss drops exactly one tier-0.55 epic
//     (a 0.34/0.33/0.33 rollGroup summing to 1.0) and Veholt adds a 0.6 chance of
//     a chase epic: about 8.6 epics per clear. Its TRASH drops no items at all,
//     only copper.
//   Claudexxaramas (10-player raid, 15 bosses)  one tier-1 epic per boss plus a
//     0.15 diversity epic on six of them: about 16 epics per clear, split ten
//     ways.
//   The level 15-20 open-world endgame  uncommons at 900-1100 sell (the realm
//     ring's own stock, one uncommon per zone, plus the Veiled Hollow's Wardsmith
//     trio) and the rares just under the five-man band. This rung USED to be read
//     off the Ashen Wastes (zone 4); that zone is retired (see the PARKED CONTENT
//     banner in `src/sim/data.ts`) and the Veiled Hollow now holds its ground, so
//     every pool below was re-sourced onto live gear. The substitution table is
//     cited at the B pool.
//
// A rift is ONE boss and about 43 elite trash over three to six floors (4.67
// floors and 43.0 trash averaged over 200 seeds of the real generator; the
// budget test in tests/rift_loot.test.ts re-derives both from `buildRiftFloor`
// rather than trusting this comment). The rates below put an S-rank clear at
// about 1.9 epics plus a thin green/blue trickle, against Claudeholme's 8.6 per
// clear of comparable length. Rifts are the VARIETY and LEGENDARY path, not the
// gear farm.
//
// Every rank pool is drawn from gear this fork already ships (cited at each
// pool). The only new items are the three legendaries in
// `content/rift/items.ts`, budgeted at or just under the raid's off-set epics.

import { RIFT_LEGENDARY_IDS } from '../content/rift';
import type { Rng } from '../rng';
import { RIFT_MAX_FLOORS } from './rift_gen';
import type { RiftRank } from './types';

/** One rolled drop. `count` is the stack size, always fixed per slot so it never
 * costs a draw. */
export interface RiftLootDrop {
  itemId: string;
  count: number;
}

/** Values consumed from the caller's Rng by EVERY `rollRiftLoot` call. See the
 * fixed draw contract at the top of this module. */
export const RIFT_LOOT_DRAWS = 8;

// Fixed slot layout of those eight draws. Each reward slot is a (gate, pick)
// pair: the gate decides whether the slot yields anything, the pick chooses from
// that slot's pool. Both are always drawn.
const D_PRIMARY_GATE = 0;
const D_PRIMARY_PICK = 1;
const D_BONUS_GATE = 2;
const D_BONUS_PICK = 3;
const D_CHASE_GATE = 4;
const D_CHASE_PICK = 5;
const D_LEGENDARY_GATE = 6;
const D_LEGENDARY_PICK = 7;

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export interface RiftRankPools {
  /** What a trash elite can drop. Green-to-blue at every rank: the rank ladder
   * is expressed in the BOSS pools and the chase, never by letting trash rain
   * epics, which is how a repeatable dungeon becomes the best farm in the game. */
  trash: readonly string[];
  /** The boss's GUARANTEED drop, and the pool its bonus roll re-draws from. */
  boss: readonly string[];
  /** The boss's rank-signature chase. By design each rank's chase pool is the
   * NEXT rank's baseline, so pushing a rank is always worth it. */
  chase: readonly string[];
}

// A consumable trickle every rift trash elite can drop, at every rank. Vendor
// staples (`healing_potion` / `mana_potion` are 170 copper buyValue in
// content/items.ts, `roasted_boar` 100), so this is pure quality-of-life for a
// long run and moves no gear economy at all. Deliberately flat across ranks.
const TRASH_CONSUMABLES: readonly string[] = ['healing_potion', 'mana_potion', 'roasted_boar'];
const TRASH_CONSUMABLE_COUNT = 2;

export const RIFT_LOOT_POOLS: Record<RiftRank, RiftRankPools> = {
  // C is the entry rung: our own normal five-man line. Anchored on the Sanctum
  // roster in content/zone3.ts, which is exactly the content a C rift boss is
  // statted against (Korzul, ~3,174 effective hp; see sim/rift/ranks.ts).
  C: {
    // The uncommons the Sanctum bosses hand out in their guaranteed rollGroups
    // (Korgath / Velkhar / Korzul `*_guaranteed_uncommon`), plus their weapons.
    trash: [
      'boneplate_vest',
      'revenant_silk_robe',
      'nightwalk_jerkin',
      'zealotsbane_blade',
      'emberwood_staff',
      'cultist_flayer',
    ],
    // The Sanctum bonus-group rares (`korgath_bonus` / `velkhar_bonus`), which
    // drop at 0.05 to 0.10 apiece there.
    boss: [
      'korgaths_chainwraps',
      'boneguard_breastplate',
      'staff_of_velkhar',
      'shadowmeld_tunic',
      'gravewyrm_sabatons',
      'wyrmcult_soulsteps',
      'gravewyrm_stalkers_treads',
      'gravewyrm_scale_hauberk',
      'wyrmcult_grand_robe',
      'wyrmscale_jerkin',
    ],
    // Korzul's three signature weapon epics (`korzul_bonus`, 0.05 each there).
    chase: ['wyrmfang_greatblade', 'staff_of_the_gravewyrm', 'fang_of_korzul'],
  },

  // B is a hard five-man. Anchored on the level 15-20 open-world drop tier, the
  // fork's open-world endgame, which is the rung above the Sanctum.
  //
  // THE ASHEN WASTES SUBSTITUTION. Every id this pool used to name came from
  // `content/zone4.ts`, which `data.ts` no longer merges, so each one was a
  // dangling reference: `rollRiftLoot` returned it, the sim could not resolve it
  // to an `ItemDef`, and the drop silently vanished (at B a warden could hand out
  // nothing at all). Each parked id is replaced ONCE, here, and the same
  // replacement is used everywhere that id appeared, so the A and S pools below
  // stay the subsets of this one they always were:
  //
  //   ashen_warboots     -> wardplate_cuirass       unc  mail chest   1100
  //   ashen_slippers     -> veilcloth_robe          unc  cloth chest  1100
  //   ashen_treads       -> nightweave_tunic        unc  leather chest 1100
  //   dawnward_gauntlets -> lilybed_mantle          rare shoulder     2400
  //   dawnward_gloves    -> wardens_oathband        rare cloth gloves 1800
  //   dawnward_grips     -> sunken_idol_mantle      rare shoulder     2400
  //   behemoth_girdle    -> fountain_court_mantle   rare shoulder     2400
  //   behemoth_sash      -> barrowshade_mantle      rare shoulder     2400
  //   behemoth_belt      -> mantle_of_the_unhorsed  rare shoulder     2400
  //   deathward_helm     -> frostmane_mantle        rare shoulder     2200
  //   deathward_hood     -> mantle_of_the_meredark  rare shoulder     2300
  //   deathward_cowl     -> mawscale_pauldrons      rare shoulder     2200
  //   gravelord_pauldrons-> cf_ef_feet              rare feet         1500
  //   gravelord_amice    -> cf_cs_feet              rare feet         1500
  //   gravelord_spaulders-> cf_ss_feet              rare feet         1500
  //
  // WHY THE TRASH ROWS WENT BLUE. Zone 4's greens were stat-rich for their sell
  // value (deathward_helm: 14 primary points at 1100 sell) and nothing live at
  // this band matches them; the best live greens here carry 8 to 9 points, which
  // is UNDER the C pool's Sanctum greens (9.17 average). Filling twelve slots
  // with them would have made a B rift's trash worse than a C rift's, which
  // `tests/rift_loot.test.ts` rank monotonicity catches and which is the wrong
  // ladder besides. So the pool keeps the Veiled Hollow's own greens at the
  // bottom and spends the rest on the rare mantle each ported realm zone drops,
  // which is what the level 15-20 open world actually pays now. Still green to
  // blue, never epic, exactly as the interface doc above requires.
  //
  // The `gravelord_*` rares become the Cinderforge's, `content/expansion`: a
  // level-20 five-man that sits between the Sanctum (C) and Claudeholme (A),
  // which is precisely the B rung. Pool SIZES are unchanged everywhere, so the
  // fixed draw contract and every `pickFrom` index are untouched.
  B: {
    // The Veiled Hollow's Wardsmith stock (realms/veiled_hollow.ts, uncommon
    // 1100) plus the Hollow's capstone rare and one rare mantle from each of the
    // other ported zones.
    trash: [
      'wardplate_cuirass',
      'veilcloth_robe',
      'nightweave_tunic',
      'lilybed_mantle',
      'wardens_oathband',
      'sunken_idol_mantle',
      'fountain_court_mantle',
      'barrowshade_mantle',
      'mantle_of_the_unhorsed',
      'frostmane_mantle',
      'mantle_of_the_meredark',
      'mawscale_pauldrons',
    ],
    // The Cinderforge's rare boots plus the top Sanctum rares.
    boss: [
      'cf_ef_feet',
      'cf_cs_feet',
      'cf_ss_feet',
      'gravewyrm_scale_hauberk',
      'wyrmcult_grand_robe',
      'wyrmscale_jerkin',
      'gravewyrm_sabatons',
      'wyrmcult_soulsteps',
      'gravewyrm_stalkers_treads',
    ],
    // Korzul's armor epics (the Deathlord / Necromancer's / Wyrmshadow families).
    chase: [
      'deathlord_warplate',
      'necromancers_starshroud',
      'wyrmshadow_harness',
      'deathlords_dread_visage',
      'necromancers_soulspire_mantle',
      'wyrmshadow_talongrips',
      'deathlord_legguards',
      'necromancers_soulsteps',
      'wyrmshadow_legguards',
    ],
  },

  // A is Claudeholme's rung: its boss pool IS the Claudeholme tier-0.55 set, but
  // only the small slots and the weapons, and only one guaranteed piece per RUN
  // against Claudeholme's one per BOSS (eight of them).
  A: {
    // The heavier half of the B trash pool plus its rares, the same six-then-three
    // split it always had, under the Ashen Wastes substitution table cited there.
    trash: [
      'fountain_court_mantle',
      'barrowshade_mantle',
      'mantle_of_the_unhorsed',
      'frostmane_mantle',
      'mantle_of_the_meredark',
      'mawscale_pauldrons',
      'cf_ef_feet',
      'cf_cs_feet',
      'cf_ss_feet',
    ],
    // Claudeholme tier 0.55, low band (feet/gloves/waist, 2400 sell) plus the
    // three set weapons (6000 sell): content/dungeons.ts CLAUDEHOLME_ITEMS.
    boss: [
      'pw_feet',
      'hm_feet',
      'as_feet',
      'pw_gloves',
      'hm_gloves',
      'as_gloves',
      'pw_waist',
      'hm_waist',
      'as_waist',
      'pw_mh',
      'hm_mh',
      'as_mh',
    ],
    // Claudeholme tier 0.55, high band (helmet/legs/shoulder/chest).
    chase: [
      'pw_helmet',
      'hm_helmet',
      'as_helmet',
      'pw_legs',
      'hm_legs',
      'as_legs',
      'pw_shoulder',
      'hm_shoulder',
      'as_shoulder',
      'pw_chest',
      'hm_chest',
      'as_chest',
    ],
  },

  // S is the hardest FIVE-player content in the fork (its boss is ~28,600 hp,
  // roughly 56% of the ten-player Nythraxis: sim/rift/ranks.ts). Its ceiling is
  // the raid's OFF-SET epics. A rift never drops a Claudexxaramas tier-1 SET
  // piece and never drops Mournlight; the raid keeps both.
  S: {
    // The top of the A trash pool, under the Ashen Wastes substitution table
    // cited at the B pool. Still no epics from trash.
    trash: [
      'frostmane_mantle',
      'mantle_of_the_meredark',
      'mawscale_pauldrons',
      'cf_ef_feet',
      'cf_cs_feet',
      'cf_ss_feet',
    ],
    // Claudeholme tier 0.55, high band.
    boss: [
      'pw_helmet',
      'hm_helmet',
      'as_helmet',
      'pw_legs',
      'hm_legs',
      'as_legs',
      'pw_shoulder',
      'hm_shoulder',
      'as_shoulder',
      'pw_chest',
      'hm_chest',
      'as_chest',
    ],
    // Veholt's chase epics (0.2 each on the Claudeholme deathlord) and the six
    // Claudexxaramas DIVERSITY epics (0.15 each on a raid boss). Never set gear.
    chase: [
      'veholt_war',
      'veholt_mag',
      'veholt_rog',
      'cx_ep_war',
      'cx_ep_mag',
      'cx_ep_rog',
      'cx_ep_helm',
      'cx_ep_robe',
      'cx_ep_legs',
    ],
  },
};

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

export interface RiftRankRates {
  /** Chance one trash elite yields a gear drop. Anchored on the existing
   * dungeon-trash green bonus lines (0.04 to 0.06 apiece), then cut hard,
   * because a rift kills roughly 43 trash per run where a five-man's trash drops
   * NOTHING at all. At S this is about 1.5 pieces over a whole clear. */
  trashGear: number;
  /** Chance one trash elite yields the consumable trickle. Flat by design. */
  trashConsumable: number;
  /** Chance one trash elite yields something from the rank's BOSS pool: the
   * "an elite just dropped a real piece" moment. Zero at C and B on purpose;
   * even at S, a whole run's trash only adds ~0.08 pieces. */
  trashUpset: number;
  /** The boss's guaranteed drop. 1.0 at every rank, mirroring the guaranteed
   * 0.34/0.33/0.33 set rollGroup every Claudeholme and Claudexxaramas boss has. */
  bossPrimary: number;
  /** A second draw from the boss pool. Under Veholt's 0.6 chase group at every
   * rank, so the fork's authored final boss stays the richer single kill. */
  bossBonus: number;
  /** The rank-signature chase. At S, 0.18 is one raid boss's diversity-epic
   * rate (0.15) and under Veholt's per-item chase rate (0.2). */
  bossChase: number;
  /**
   * PER LEGENDARY ITEM chance on a boss kill (the pool has
   * `RIFT_LEGENDARY_IDS.length` entries, so the gate is this times that).
   *
   * Upstream shipped their legendary at 4% per item, measured it, and cut it to
   * 0.3%. We start at that order of magnitude rather than rediscovering their
   * mistake: 0.3% per item at S is one specific legendary per ~333 S clears, and
   * ANY legendary per ~111. C never drops one at all, because the entry rung
   * must not be the efficient farm for the rarest thing in the game.
   *
   * This is the one rate the floor-depth bonus below deliberately does NOT
   * touch: the legendary rate is the number people will argue about, so it stays
   * a flat, auditable per-rank constant.
   */
  legendaryPerItem: number;
}

export const RIFT_LOOT_RATES: Record<RiftRank, RiftRankRates> = {
  C: {
    trashGear: 0.01,
    trashConsumable: 0.08,
    trashUpset: 0,
    bossPrimary: 1,
    bossBonus: 0.2,
    bossChase: 0.05,
    legendaryPerItem: 0,
  },
  B: {
    trashGear: 0.015,
    trashConsumable: 0.08,
    trashUpset: 0,
    bossPrimary: 1,
    bossBonus: 0.3,
    bossChase: 0.08,
    legendaryPerItem: 0.0005,
  },
  A: {
    trashGear: 0.022,
    trashConsumable: 0.08,
    trashUpset: 0.0008,
    bossPrimary: 1,
    bossBonus: 0.4,
    bossChase: 0.12,
    legendaryPerItem: 0.0015,
  },
  S: {
    trashGear: 0.03,
    trashConsumable: 0.08,
    trashUpset: 0.0015,
    bossPrimary: 1,
    bossBonus: 0.5,
    bossChase: 0.18,
    legendaryPerItem: 0.003,
  },
};

/** Per-floor reward step. A rift runs three to six floors and the boss is always
 * the LAST one, so this is what makes a deeper rift worth the longer run: a
 * six-floor boss pays ~1.30x on its bonus and chase rolls, a three-floor boss
 * ~1.12x. Small on purpose, and it never touches the guaranteed drop (already
 * 1.0) or the legendary rate. */
export const RIFT_FLOOR_RATE_STEP = 0.06;

/** The depth multiplier for a floor. Clamped to the generator's floor range so a
 * malformed index can never inflate a rate. */
export function riftFloorRateMultiplier(floorIndex: number): number {
  const i = Math.max(0, Math.min(RIFT_MAX_FLOORS - 1, Math.floor(floorIndex)));
  return 1 + RIFT_FLOOR_RATE_STEP * i;
}

// ---------------------------------------------------------------------------
// The roll
// ---------------------------------------------------------------------------

/** Index a pool from a [0,1) draw. Never out of range, even at exactly 1. */
function pickFrom(pool: readonly string[], u: number): string {
  return pool[Math.min(pool.length - 1, Math.floor(u * pool.length))];
}

/**
 * Roll the loot for ONE rift kill.
 *
 * Consumes EXACTLY `RIFT_LOOT_DRAWS` values from `rng`, always: see the fixed
 * draw contract at the top of this module. Pure apart from advancing `rng`; the
 * same (rank, floorIndex, isBoss) against the same Rng state always yields the
 * same drops on every host.
 *
 * `isBoss` picks an entirely different reward shape, it is not a multiplier: a
 * boss is a guaranteed piece plus a bonus, a chase and the legendary lottery,
 * while trash is a thin gear trickle plus consumables. Class locks are NOT
 * resolved here (the caller does not pass a class): drops are class-agnostic
 * exactly as every authored boss table in this fork is, and `requiredClass` is
 * enforced at equip time.
 */
export function rollRiftLoot(
  rank: RiftRank,
  floorIndex: number,
  isBoss: boolean,
  rng: Rng,
): RiftLootDrop[] {
  // THE FIXED DRAW COUNT. Taken up front, unconditionally, before a single
  // decision is made, so no branch below can change how far the shared world
  // stream advanced.
  const draw: number[] = new Array(RIFT_LOOT_DRAWS);
  for (let i = 0; i < RIFT_LOOT_DRAWS; i++) draw[i] = rng.next();

  const pools = RIFT_LOOT_POOLS[rank];
  const rates = RIFT_LOOT_RATES[rank];
  const depth = riftFloorRateMultiplier(floorIndex);
  const out: RiftLootDrop[] = [];

  if (isBoss) {
    // Primary: the guaranteed piece.
    const primary = pickFrom(pools.boss, draw[D_PRIMARY_PICK]);
    if (draw[D_PRIMARY_GATE] < rates.bossPrimary) out.push({ itemId: primary, count: 1 });
    // Bonus: a second piece from the same pool. Rotated off the primary index
    // when the two draws land on the same slot, so a boss never hands out the
    // same item twice, and rotating costs no extra draw.
    if (draw[D_BONUS_GATE] < Math.min(1, rates.bossBonus * depth)) {
      const bonus = pickFrom(pools.boss, draw[D_BONUS_PICK]);
      const at = pools.boss.indexOf(bonus);
      out.push({
        itemId: bonus === primary ? pools.boss[(at + 1) % pools.boss.length] : bonus,
        count: 1,
      });
    }
    if (draw[D_CHASE_GATE] < Math.min(1, rates.bossChase * depth)) {
      out.push({ itemId: pickFrom(pools.chase, draw[D_CHASE_PICK]), count: 1 });
    }
    // The legendary lottery. Gate = per-item rate times the pool size, so the
    // documented `legendaryPerItem` is literally the chance of one NAMED
    // legendary, which is the unit the tuning conversation happens in.
    const legendaryGate = Math.min(1, rates.legendaryPerItem * RIFT_LEGENDARY_IDS.length);
    if (draw[D_LEGENDARY_GATE] < legendaryGate) {
      out.push({ itemId: pickFrom(RIFT_LEGENDARY_IDS, draw[D_LEGENDARY_PICK]), count: 1 });
    }
    return out;
  }

  // Trash. Same eight draws; draws 6 and 7 are dead here, by contract.
  if (draw[D_PRIMARY_GATE] < Math.min(1, rates.trashGear * depth)) {
    out.push({ itemId: pickFrom(pools.trash, draw[D_PRIMARY_PICK]), count: 1 });
  }
  if (draw[D_BONUS_GATE] < Math.min(1, rates.trashConsumable)) {
    out.push({
      itemId: pickFrom(TRASH_CONSUMABLES, draw[D_BONUS_PICK]),
      count: TRASH_CONSUMABLE_COUNT,
    });
  }
  if (draw[D_CHASE_GATE] < Math.min(1, rates.trashUpset * depth)) {
    out.push({ itemId: pickFrom(pools.boss, draw[D_CHASE_PICK]), count: 1 });
  }
  return out;
}
