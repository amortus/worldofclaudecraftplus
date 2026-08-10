// Public surface of the ported upstream realm ring. `src/sim/data.ts` and the
// tests import from here, never from the individual zone modules, so the pack
// can be reorganised without touching the merge layer.
//
// See ./CLAUDE.md for what is in the pack and what the port dropped.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';

import {
  EVERGARDEN_CAMPS,
  EVERGARDEN_ITEMS,
  EVERGARDEN_MOBS,
  EVERGARDEN_NPCS,
  EVERGARDEN_OBJECTS,
  EVERGARDEN_PROPS,
  EVERGARDEN_QUEST_ORDER,
  EVERGARDEN_QUESTS,
  EVERGARDEN_ROADS,
  EVERGARDEN_ZONE,
} from './evergarden';
import {
  GALECREST_CAMPS,
  GALECREST_ITEMS,
  GALECREST_MOBS,
  GALECREST_NPCS,
  GALECREST_OBJECTS,
  GALECREST_PROPS,
  GALECREST_QUEST_ORDER,
  GALECREST_QUESTS,
  GALECREST_ROADS,
  GALECREST_ZONE,
} from './galecrest';
import {
  PALMREACH_CAMPS,
  PALMREACH_ITEMS,
  PALMREACH_MOBS,
  PALMREACH_NPCS,
  PALMREACH_OBJECTS,
  PALMREACH_PROPS,
  PALMREACH_QUEST_ORDER,
  PALMREACH_QUESTS,
  PALMREACH_ROADS,
  PALMREACH_ZONE,
} from './palmreach';
import {
  WILLOWFEN_CAMPS,
  WILLOWFEN_ITEMS,
  WILLOWFEN_MOBS,
  WILLOWFEN_NPCS,
  WILLOWFEN_OBJECTS,
  WILLOWFEN_PROPS,
  WILLOWFEN_QUEST_ORDER,
  WILLOWFEN_QUESTS,
  WILLOWFEN_ROADS,
  WILLOWFEN_ZONE,
} from './willowfen';

export * from './evergarden';
export * from './galecrest';
export * from './palmreach';
export * from './willowfen';

// Ring order, south to north then west column before east column, which is the
// order a player meets them: Willowfen and Galecrest flank the Mirefen Marsh,
// Palmreach and Evergarden flank the Thornpeak Heights and the Ashen Wastes.
export const REALM_ZONE_DEFS: ZoneDef[] = [
  WILLOWFEN_ZONE,
  GALECREST_ZONE,
  PALMREACH_ZONE,
  EVERGARDEN_ZONE,
];

export const REALM_MOBS: Record<string, MobTemplate> = {
  ...WILLOWFEN_MOBS,
  ...GALECREST_MOBS,
  ...PALMREACH_MOBS,
  ...EVERGARDEN_MOBS,
};

export const REALM_NPCS: Record<string, NpcDef> = {
  ...WILLOWFEN_NPCS,
  ...GALECREST_NPCS,
  ...PALMREACH_NPCS,
  ...EVERGARDEN_NPCS,
};

export const REALM_QUESTS: Record<string, QuestDef> = {
  ...WILLOWFEN_QUESTS,
  ...GALECREST_QUESTS,
  ...PALMREACH_QUESTS,
  ...EVERGARDEN_QUESTS,
};

export const REALM_QUEST_ORDER: string[] = [
  ...WILLOWFEN_QUEST_ORDER,
  ...GALECREST_QUEST_ORDER,
  ...PALMREACH_QUEST_ORDER,
  ...EVERGARDEN_QUEST_ORDER,
];

export const REALM_ITEMS: Record<string, ItemDef> = {
  ...WILLOWFEN_ITEMS,
  ...GALECREST_ITEMS,
  ...PALMREACH_ITEMS,
  ...EVERGARDEN_ITEMS,
};

// Every camp here declares FROZEN exact `positions` (see any zone module), so
// world generation draws no rng for them at all: both every shipped spawn AND
// the post-worldgen rng cursor stay bit-identical. The list is still appended
// at the very END of the merged CAMPS array in data.ts, so array order cannot
// matter either.
export const REALM_CAMPS: CampDef[] = [
  ...WILLOWFEN_CAMPS,
  ...GALECREST_CAMPS,
  ...PALMREACH_CAMPS,
  ...EVERGARDEN_CAMPS,
];

// Ground objects consume entity ids in array order, so this list is appended
// last too and no shipped object's id moves.
export const REALM_OBJECTS: GroundObjectDef[] = [
  ...WILLOWFEN_OBJECTS,
  ...GALECREST_OBJECTS,
  ...PALMREACH_OBJECTS,
  ...EVERGARDEN_OBJECTS,
];

export const REALM_ROADS: { x: number; z: number }[][] = [
  ...WILLOWFEN_ROADS,
  ...GALECREST_ROADS,
  ...PALMREACH_ROADS,
  ...EVERGARDEN_ROADS,
];

export const REALM_PROP_SETS: ZonePropsDef[] = [
  WILLOWFEN_PROPS,
  GALECREST_PROPS,
  PALMREACH_PROPS,
  EVERGARDEN_PROPS,
];
