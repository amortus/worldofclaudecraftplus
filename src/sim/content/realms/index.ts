// Public surface of the ported upstream realm ring. `src/sim/data.ts` and the
// tests import from here, never from the individual zone modules, so the pack
// can be reorganised without touching the merge layer.
//
// Eleven of upstream's fourteen zones live here: everything except the three
// original strip bands (`eastbrook_vale`, `mirefen_marsh`, `thornpeak_heights`),
// which we already shared with them by id and by z band.
//
// See ./CLAUDE.md for what is in the pack and what the port dropped.

import type { CampDef, GroundObjectDef, ItemDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../../types';

import {
  AMBERFALL_CAMPS,
  AMBERFALL_ITEMS,
  AMBERFALL_MOBS,
  AMBERFALL_NPCS,
  AMBERFALL_OBJECTS,
  AMBERFALL_PROPS,
  AMBERFALL_QUEST_ORDER,
  AMBERFALL_QUESTS,
  AMBERFALL_ROADS,
  AMBERFALL_ZONE,
} from './amberfall';
import {
  DRAKELANDS_CAMPS,
  DRAKELANDS_ITEMS,
  DRAKELANDS_MOBS,
  DRAKELANDS_NPCS,
  DRAKELANDS_OBJECTS,
  DRAKELANDS_PROPS,
  DRAKELANDS_QUEST_ORDER,
  DRAKELANDS_QUESTS,
  DRAKELANDS_ROADS,
  DRAKELANDS_ZONE,
} from './drakelands';
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
  FARSHORE_CAMPS,
  FARSHORE_ITEMS,
  FARSHORE_MOBS,
  FARSHORE_NPCS,
  FARSHORE_OBJECTS,
  FARSHORE_PROPS,
  FARSHORE_QUEST_ORDER,
  FARSHORE_QUESTS,
  FARSHORE_ROADS,
  FARSHORE_ZONE,
} from './farshore';
import {
  FROSTVEIL_CAMPS,
  FROSTVEIL_ITEMS,
  FROSTVEIL_MOBS,
  FROSTVEIL_NPCS,
  FROSTVEIL_OBJECTS,
  FROSTVEIL_PROPS,
  FROSTVEIL_QUEST_ORDER,
  FROSTVEIL_QUESTS,
  FROSTVEIL_ROADS,
  FROSTVEIL_ZONE,
} from './frostveil';
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
  NIGHTBLOOM_CAMPS,
  NIGHTBLOOM_ITEMS,
  NIGHTBLOOM_MOBS,
  NIGHTBLOOM_NPCS,
  NIGHTBLOOM_OBJECTS,
  NIGHTBLOOM_PROPS,
  NIGHTBLOOM_QUEST_ORDER,
  NIGHTBLOOM_QUESTS,
  NIGHTBLOOM_ROADS,
  NIGHTBLOOM_ZONE,
} from './nightbloom';
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
  HOLLOW_CAMPS,
  HOLLOW_ITEMS,
  HOLLOW_MOBS,
  HOLLOW_NPCS,
  HOLLOW_OBJECTS,
  HOLLOW_PROPS,
  HOLLOW_QUEST_ORDER,
  HOLLOW_QUESTS,
  HOLLOW_ROADS,
  HOLLOW_ZONE,
} from './veiled_hollow';
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
import {
  WRAITHWOOD_CAMPS,
  WRAITHWOOD_ITEMS,
  WRAITHWOOD_MOBS,
  WRAITHWOOD_NPCS,
  WRAITHWOOD_OBJECTS,
  WRAITHWOOD_PROPS,
  WRAITHWOOD_QUEST_ORDER,
  WRAITHWOOD_QUESTS,
  WRAITHWOOD_ROADS,
  WRAITHWOOD_ZONE,
} from './wraithwood';

export * from './amberfall';
export * from './drakelands';
export * from './evergarden';
export * from './farshore';
export * from './frostveil';
export * from './galecrest';
export * from './nightbloom';
export * from './palmreach';
export * from './veiled_hollow';
export * from './willowfen';
export * from './wraithwood';

// STRIP ZONES FIRST, IN ASCENDING z. `data.ts` spreads this list after the
// three original bands, and `STRIP_ZONES` there is an order-preserving filter
// that world.ts walks as a south-to-north stack (STRIP_BOUND, the shape
// cascade) and that `zoneAt`'s fallback walks as a contiguous z tiling. Putting
// the Veiled Hollow (900..1440) before the Frostveil Reach (1440..1960) is what
// keeps that stack sorted. The nine COLUMN zones follow in ring order, south to
// north, west column before east column; among columns the order is free.
export const REALM_ZONE_DEFS: ZoneDef[] = [
  HOLLOW_ZONE,
  FROSTVEIL_ZONE,
  FARSHORE_ZONE,
  WILLOWFEN_ZONE,
  GALECREST_ZONE,
  PALMREACH_ZONE,
  EVERGARDEN_ZONE,
  NIGHTBLOOM_ZONE,
  WRAITHWOOD_ZONE,
  AMBERFALL_ZONE,
  DRAKELANDS_ZONE,
];

export const REALM_MOBS: Record<string, MobTemplate> = {
  ...HOLLOW_MOBS,
  ...FROSTVEIL_MOBS,
  ...FARSHORE_MOBS,
  ...WILLOWFEN_MOBS,
  ...GALECREST_MOBS,
  ...PALMREACH_MOBS,
  ...EVERGARDEN_MOBS,
  ...NIGHTBLOOM_MOBS,
  ...WRAITHWOOD_MOBS,
  ...AMBERFALL_MOBS,
  ...DRAKELANDS_MOBS,
};

export const REALM_NPCS: Record<string, NpcDef> = {
  ...HOLLOW_NPCS,
  ...FROSTVEIL_NPCS,
  ...FARSHORE_NPCS,
  ...WILLOWFEN_NPCS,
  ...GALECREST_NPCS,
  ...PALMREACH_NPCS,
  ...EVERGARDEN_NPCS,
  ...NIGHTBLOOM_NPCS,
  ...WRAITHWOOD_NPCS,
  ...AMBERFALL_NPCS,
  ...DRAKELANDS_NPCS,
};

export const REALM_QUESTS: Record<string, QuestDef> = {
  ...HOLLOW_QUESTS,
  ...FROSTVEIL_QUESTS,
  ...FARSHORE_QUESTS,
  ...WILLOWFEN_QUESTS,
  ...GALECREST_QUESTS,
  ...PALMREACH_QUESTS,
  ...EVERGARDEN_QUESTS,
  ...NIGHTBLOOM_QUESTS,
  ...WRAITHWOOD_QUESTS,
  ...AMBERFALL_QUESTS,
  ...DRAKELANDS_QUESTS,
};

export const REALM_QUEST_ORDER: string[] = [
  ...HOLLOW_QUEST_ORDER,
  ...FROSTVEIL_QUEST_ORDER,
  ...FARSHORE_QUEST_ORDER,
  ...WILLOWFEN_QUEST_ORDER,
  ...GALECREST_QUEST_ORDER,
  ...PALMREACH_QUEST_ORDER,
  ...EVERGARDEN_QUEST_ORDER,
  ...NIGHTBLOOM_QUEST_ORDER,
  ...WRAITHWOOD_QUEST_ORDER,
  ...AMBERFALL_QUEST_ORDER,
  ...DRAKELANDS_QUEST_ORDER,
];

export const REALM_ITEMS: Record<string, ItemDef> = {
  ...HOLLOW_ITEMS,
  ...FROSTVEIL_ITEMS,
  ...FARSHORE_ITEMS,
  ...WILLOWFEN_ITEMS,
  ...GALECREST_ITEMS,
  ...PALMREACH_ITEMS,
  ...EVERGARDEN_ITEMS,
  ...NIGHTBLOOM_ITEMS,
  ...WRAITHWOOD_ITEMS,
  ...AMBERFALL_ITEMS,
  ...DRAKELANDS_ITEMS,
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
  // The full-map pass, appended after the ring that shipped first so no camp
  // already frozen at the live seed changes its array index.
  ...HOLLOW_CAMPS,
  ...FROSTVEIL_CAMPS,
  ...FARSHORE_CAMPS,
  ...NIGHTBLOOM_CAMPS,
  ...WRAITHWOOD_CAMPS,
  ...AMBERFALL_CAMPS,
  ...DRAKELANDS_CAMPS,
];

// Ground objects consume entity ids in array order, so this list is appended
// last too and no shipped object's id moves.
export const REALM_OBJECTS: GroundObjectDef[] = [
  ...WILLOWFEN_OBJECTS,
  ...GALECREST_OBJECTS,
  ...PALMREACH_OBJECTS,
  ...EVERGARDEN_OBJECTS,
  ...HOLLOW_OBJECTS,
  ...FROSTVEIL_OBJECTS,
  ...FARSHORE_OBJECTS,
  ...NIGHTBLOOM_OBJECTS,
  ...WRAITHWOOD_OBJECTS,
  ...AMBERFALL_OBJECTS,
  ...DRAKELANDS_OBJECTS,
];

export const REALM_ROADS: { x: number; z: number }[][] = [
  ...WILLOWFEN_ROADS,
  ...GALECREST_ROADS,
  ...PALMREACH_ROADS,
  ...EVERGARDEN_ROADS,
  ...HOLLOW_ROADS,
  ...FROSTVEIL_ROADS,
  ...FARSHORE_ROADS,
  ...NIGHTBLOOM_ROADS,
  ...WRAITHWOOD_ROADS,
  ...AMBERFALL_ROADS,
  ...DRAKELANDS_ROADS,
];

export const REALM_PROP_SETS: ZonePropsDef[] = [
  WILLOWFEN_PROPS,
  GALECREST_PROPS,
  PALMREACH_PROPS,
  EVERGARDEN_PROPS,
  HOLLOW_PROPS,
  FROSTVEIL_PROPS,
  FARSHORE_PROPS,
  NIGHTBLOOM_PROPS,
  WRAITHWOOD_PROPS,
  AMBERFALL_PROPS,
  DRAKELANDS_PROPS,
];
