// Item source level: the level of the content an item actually comes from (the
// top of the dropping mob's level band, or the hardest boss a quest reward is
// gated behind). Trimmed from upstream's item_level.ts to just the source index
// that item_level_req.ts needs; the raid-bonus/stat-budget half of that module
// belongs to the (unported) item level system.
//
// Pure, host-agnostic leaf (no DOM, no rng, no Sim state): it reads only the
// static content tables and does arithmetic, so the HUD imports it directly the
// same way it already consumes other pure sim leaves. The architecture purity
// gate (tests/architecture.test.ts) keeps it host-agnostic.
import { MOBS, QUESTS } from './data';

// itemId -> the level the item drops at (top of the dropping mob's band, or the
// hardest boss a quest reward is gated behind). Built once, lazily, from the
// static tables (so data.ts is fully initialized first) and memoized.
// Deterministic: pure function of the content tables, no rng, no clock.
let sourceIndex: Map<string, number> | null = null;

function buildSourceIndex(): Map<string, number> {
  const idx = new Map<string, number>();
  const bump = (itemId: string | undefined, level: number | undefined): void => {
    if (!itemId || level === undefined) return;
    const prev = idx.get(itemId);
    // Highest level wins: an item is "current" at the top of its sources.
    if (prev === undefined || level > prev) idx.set(itemId, level);
  };
  // Mob loot: an item is "current" at the top of the dropping mob's level band.
  for (const mob of Object.values(MOBS)) {
    if (!mob.loot) continue;
    for (const entry of mob.loot) bump(entry.itemId, mob.maxLevel);
  }
  // Quest rewards: gated behind the quest's hardest combat source: direct kill
  // objectives, or collected quest items traced back to the mob that drops them.
  // Fall back to the quest's own minLevel when no concrete source exists.
  for (const quest of Object.values(QUESTS)) {
    let source: number | undefined;
    const consider = (level: number | undefined): void => {
      if (level === undefined) return;
      if (source === undefined || level > source) source = level;
    };
    for (const objective of quest.objectives) {
      if (objective.type === 'kill' && objective.targetMobId) {
        consider(MOBS[objective.targetMobId]?.maxLevel);
      } else if (objective.type === 'collect' && objective.itemId) {
        consider(idx.get(objective.itemId));
      }
    }
    consider(quest.minLevel);
    for (const itemId of Object.values(quest.itemRewards)) bump(itemId, source);
  }
  return idx;
}

function sourceIndexOf(): Map<string, number> {
  if (!sourceIndex) sourceIndex = buildSourceIndex();
  return sourceIndex;
}

// The level of the content an item drops from, or undefined for items with no
// drop/quest source (vendor stock, starter gear, junk, conjured/quest items).
export function itemSourceLevel(itemId: string): number | undefined {
  return sourceIndexOf().get(itemId);
}
