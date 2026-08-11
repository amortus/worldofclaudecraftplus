// Legacy-save scrubbing for content that no longer exists anywhere in the game.
//
// TWO frozen removal sets, both applied by `sanitizeRemovedZone1Content` (the
// name is kept for its call sites in sim.ts, server/db.ts and
// scripts/cleanup_removed_zone1_content.ts):
//   1. The Eastbrook Vale content retired upstream: the ten-step Warden's
//      Ledger, the two Brightwood Glade quests, and the wildlife pack their
//      objectives targeted.
//   2. The two INVENTED column zones (Alderfen Shallows and Grimhold Crags),
//      deleted whole by the full map parity pass. Upstream never had them, and
//      the grid cells they occupied belong to upstream's own zones now.
//
// The RETIRED Ashen Wastes is deliberately NOT scrubbed. It is parked, not
// deleted (`src/sim/content/zone4.ts` is intact and `src/sim/data.ts` says how
// to merge it again in one line), so a player's Ashen Wastes quest history,
// reputation and items are left exactly as they are: scrubbing them would be
// the one irreversible act in a reversible retirement.
//
// This list is FROZEN. The Vale was refilled with a new pack of townsfolk
// errands (see the banner in `content/zone1.ts`) rather than by reviving these
// chains, precisely so no retired id ever has to come back off this list: a
// revived id would silently mark a scrubbed legacy save as having already
// completed the new quest. Every id below stays scrubbed forever.
import type { CharacterState } from './sim';
import type { InvSlot } from './types';

export const REMOVED_ZONE1_QUEST_IDS = [
  'q_mogger_tracks',
  'q_brightwood_thinning',
  'q_brightwood_monarch',
  'q_ledger_first_duty',
  'q_ledger_teeth',
  'q_ledger_reedwater',
  'q_ledger_silk',
  'q_ledger_brood',
  'q_ledger_deepvermin',
  'q_ledger_toll',
  'q_ledger_vigil',
  'q_ledger_great_boar',
  'q_ledger_outlaw_captain',
] as const;

// Reward gear the retirement deliberately KEPT in the tables so equipped players
// did not lose the piece. `bramblehide_jerkin` is obtainable again as the reward
// for `q_wilkes_colors`; `monarch_crown_helm` is still shipped but unobtainable,
// because its name belongs to a stag that no longer exists.
export const RETIRED_ZONE1_ITEM_IDS = ['bramblehide_jerkin', 'monarch_crown_helm'] as const;

export const REMOVED_ZONE1_OBJECTIVE_ITEM_IDS = ['glade_pelt', 'monarch_heart'] as const;

export const REMOVED_ZONE1_MOB_IDS = [
  'elder_bristleback',
  'sableweb_matriarch',
  'sableweb_hatchling',
  'brightwood_hare',
  'glade_fox',
  'spotted_fawn',
  'meadow_crane',
  'thornpelt_badger',
  'dawnmane_doe',
  'bramble_lynx',
  'brightwood_stag',
  'grovetusk_boar',
  'sunhide_bear',
  'brightwood_monarch',
] as const;

// ---------------------------------------------------------------------------
// Set 2: the two invented column zones, deleted by the full map parity pass.
//
// FROZEN for the same reason set 1 is: a revived id would silently mark a
// scrubbed save as having already completed a quest it never saw. Note that
// `q_af_*` here are the ALDERFEN ids; upstream's Amberfall uses the same
// prefix with different suffixes (`q_af_goldmelt_road` and friends) and must
// never be added to this list.
// ---------------------------------------------------------------------------

export const REMOVED_COLUMN_QUEST_IDS = [
  'q_af_boards',
  'q_af_snappers',
  'q_af_withies',
  'q_af_poachers',
  'q_af_char',
  'q_af_sedgewatch',
  'q_af_miller',
  'q_gh_lurkers',
  'q_gh_ironvein',
  'q_gh_coal',
  'q_gh_binders',
  'q_gh_sled',
  'q_gh_watchtower',
  'q_gh_grimfang',
] as const;

/** The five quest objects and the six capstone rewards those zones minted.
 *  Unlike `RETIRED_ZONE1_ITEM_IDS`, none of these is kept in the item tables,
 *  so a save holding one holds an id nothing can resolve: scrubbed from the
 *  bag, the buyback and the equipment slots alike. */
export const REMOVED_COLUMN_ITEM_IDS = [
  'cut_withy',
  'alder_char',
  'mill_sluice_wheel',
  'cragcoal',
  'plundered_sledload',
  'weirguard_hauberk',
  'sedgeweave_robe',
  'millrace_jerkin',
  'grimfang_splitter',
  'coldhearth_emberstaff',
  'cragmaw_fang',
] as const;

export const REMOVED_COLUMN_MOB_IDS = [
  'sedge_skitterer',
  'mudfin_snapper',
  'reedwatch_poacher',
  'weir_husk',
  'the_drowned_miller',
  'crag_lurker',
  'grimhold_scavenger',
  'scree_binder',
  'coldhearth_marauder',
  'old_grimfang',
] as const;

const REMOVED_QUESTS: ReadonlySet<string> = new Set([
  ...REMOVED_ZONE1_QUEST_IDS,
  ...REMOVED_COLUMN_QUEST_IDS,
]);
const REMOVED_ITEMS: ReadonlySet<string> = new Set(REMOVED_COLUMN_ITEM_IDS);
const REMOVED_OBJECTIVE_ITEMS: ReadonlySet<string> = new Set(REMOVED_ZONE1_OBJECTIVE_ITEM_IDS);

function keepItem(slot: InvSlot): boolean {
  return !REMOVED_OBJECTIVE_ITEMS.has(slot.itemId) && !REMOVED_ITEMS.has(slot.itemId);
}

function sameSlots(a: readonly InvSlot[] | undefined, b: readonly InvSlot[] | undefined): boolean {
  if ((a?.length ?? 0) !== (b?.length ?? 0)) return false;
  return (a ?? []).every((slot, index) => {
    const other = b?.[index];
    return other?.itemId === slot.itemId && other.count === slot.count;
  });
}

export function sanitizeRemovedZone1Content(state: CharacterState): {
  state: CharacterState;
  changed: boolean;
} {
  const questLog = state.questLog
    .filter((quest) => !REMOVED_QUESTS.has(quest.questId))
    .map((quest) => ({ questId: quest.questId, counts: [...quest.counts], state: quest.state }));
  const questsDone = state.questsDone.filter((questId) => !REMOVED_QUESTS.has(questId));
  const inventory = state.inventory.filter(keepItem).map((slot) => ({ ...slot }));
  const vendorBuyback = state.vendorBuyback?.filter(keepItem).map((slot) => ({ ...slot }));
  // EQUIPMENT too, for set 2 only. A deleted reward has no ItemDef at all, and
  // `recalcPlayerStats` skips an unresolvable slot (`if (!item) continue`), so
  // the piece would sit in the slot forever granting nothing and rendering as a
  // bare id. Set 1's retired rewards are deliberately KEPT in the item tables
  // (see RETIRED_ZONE1_ITEM_IDS), so they are never touched here.
  let equipment = state.equipment;
  let equipmentChanged = false;
  for (const [slot, itemId] of Object.entries(state.equipment ?? {})) {
    if (typeof itemId !== 'string' || !REMOVED_ITEMS.has(itemId)) continue;
    if (!equipmentChanged) equipment = { ...state.equipment };
    equipmentChanged = true;
    delete (equipment as Record<string, unknown>)[slot];
  }

  const changed =
    questLog.length !== state.questLog.length ||
    questsDone.length !== state.questsDone.length ||
    equipmentChanged ||
    !sameSlots(inventory, state.inventory) ||
    !sameSlots(vendorBuyback, state.vendorBuyback);

  return {
    changed,
    state: {
      ...state,
      inventory,
      vendorBuyback,
      equipment,
      questLog,
      questsDone,
    },
  };
}
