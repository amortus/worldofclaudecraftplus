// Public surface of the gathering-professions subsystem. Host code (sim.ts, the
// server, tests) imports from here; the individual modules stay private detail
// so a later crafting wave can reshuffle them without touching call sites.
//
// This barrel is MECHANICS ONLY and deliberately imports no content: the tables
// live behind their own barrel at `src/sim/content/professions/`. Keeping the
// two apart is what lets every function here take explicit inputs and stay
// directly Vitest-drivable.

// The four-state mastery curve, shared by every profession skill.
export {
  applyProficiencyGain,
  capabilityTierFor,
  FULL_TIER_MULTIPLIER,
  MASTERY_MULTIPLIERS,
  MASTERY_STATES,
  type MasteryState,
  masteryStateFor,
  MINIMAL_TIER_MULTIPLIER,
  NONE_TIER_MULTIPLIER,
  REDUCED_TIER_MULTIPLIER,
  tierProgressMultiplier,
} from './mastery';

// Proficiency bands (cast-time reduction, fishing catch table).
export {
  PROFICIENCY_BAND_FRACTIONS,
  proficiencyBandFor,
  proficiencyBandThresholds,
} from './proficiency_bands';

// Tool tiers and gating.
export {
  BARE_HANDS_TOOL_TIER,
  bestOwnedGatherToolTier,
  bestOwnedGatherToolTierOrNone,
  canGatherTier,
  gatherToolTier,
  hasFishingImplement,
  NO_TOOL_OWNED,
  toolsForProfession,
} from './tools';

// Node gathering: mining, logging, herbalism.
export {
  beginHarvest,
  emptyGatheringProficiency,
  GATHER_BASE_GAIN,
  GATHER_CAST_BAND_REDUCTION_SEC,
  GATHER_CAST_BASE_SEC,
  GATHER_CAST_FLOOR_SEC,
  GATHER_CAST_TOOL_TIER_REDUCTION_SEC,
  GATHER_GAIN_TIER_STEP,
  type GatherAttempt,
  gatherCapabilityTier,
  gatherCastDurationSec,
  type GatherDenyReason,
  gatheringSkillsView,
  gatherNodeGainMultiplier,
  gatherSkillGain,
  type GatherStart,
  type HarvestResolution,
  isNodeReady,
  MATERIAL_RARITY_MAX_PROFICIENCY,
  MATERIAL_RARITY_SHARE,
  NODE_HARVEST_TABLE,
  normalizeGatheringProficiency,
  professionForNodeType,
  resolveHarvest,
  rollMaterialRarity,
} from './gathering';

// Fishing: the bite minigame and the catch ladder.
export {
  type BiteSchedule,
  biteDelayMaxSec,
  biteScheduleTicks,
  effectiveFishingBand,
  FISH_BITE_DELAY_MAX_SEC,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_BITE_DELAY_ROD_REDUCTION_SEC,
  FISH_REEL_WINDOW_ROD_BONUS_SEC,
  FISH_REEL_WINDOW_SEC,
  FISHING_BASE_GAIN,
  FISHING_GAIN_TIER_STEP,
  type FishingCatchAttempt,
  type FishingCatchResolution,
  fishingBandFor,
  fishingCapabilityTier,
  fishingCatchGain,
  fishingWaterGainMultiplier,
  reelWindowSec,
  type ReelOutcome,
  resolveFishingCatch,
  resolveReel,
  resolveReelTick,
  rollBiteSchedule,
  rollCatch,
} from './fishing';

// Record shapes.
export {
  type CarriedItem,
  type FishingBandTables,
  type FishingEntry,
  type GatherMaterialRow,
  type GatherNodeDef,
  type GatherNodeType,
  type GatherToolDef,
  type GatherToolTable,
  GATHERING_PROFESSION_IDS,
  type GatheringProficiency,
  type GatheringProfessionDef,
  type GatheringProfessionId,
  isGatheringProfessionId,
  type MaterialRarity,
  type PlayerProfessionSkill,
  type ProfessionCategory,
  type ProfessionRecord,
} from './types';
