import type { CampDef, GroundObjectDef, MobTemplate, NpcDef, QuestDef, ZoneDef, ZonePropsDef } from '../types';

// Zone 4 - The Ashen Wastes: a dead, blighted land north of Thornpeak Heights,
// reached through a mountain pass that opens automatically once this zone is
// appended (the engine turns the old z=900 world wall into an inter-zone ridge
// with a central pass). Grey/brown/dead palette via the 'blight' biome, with the
// Naxx necropolis drifting LOW over the ground. Deliberately SPARSE to start
// (no mobs/NPCs/quests yet) - it is a walkable new map; content comes later.
export const ZONE4_ZONE: ZoneDef = {
  id: 'ashen_wastes',
  name: 'The Ashen Wastes',
  zMin: 900, // must equal Thornpeak's zMax (zone bands tile contiguously)
  zMax: 1260,
  levelRange: [20, 26],
  biome: 'blight',
  hub: { x: 0, z: 1020, radius: 20, name: 'Gravewatch' },
  graveyard: { x: 15, z: 1005 },
  lakes: [{ x: -60, z: 1100, radius: 16 }],
  pois: [
    { x: 0, z: 1020, label: 'Gravewatch' },
    { x: 0, z: 905, label: 'The Ashen Pass' },
    { x: -70, z: 1100, label: 'The Stillmere' },
    { x: 80, z: 1075, label: 'The Bonefields' },
    { x: -55, z: 1170, label: 'Hollow Barrows' },
    { x: 45, z: 1215, label: 'The Pale Reach' },
  ],
  welcome: 'The Ashen Wastes stretch out, grey and lifeless. Something vast drifts low over the dead ground.',
};

export const ZONE4_ROADS: { x: number; z: number }[][] = [
  // the dead road climbing north out of the pass up to Gravewatch
  [{ x: 0, z: 898 }, { x: 0, z: 1020 }],
];

export const ZONE4_MOBS: Record<string, MobTemplate> = {};
export const ZONE4_NPCS: Record<string, NpcDef> = {};
export const ZONE4_QUESTS: Record<string, QuestDef> = {};
export const ZONE4_QUEST_ORDER: string[] = [];
export const ZONE4_CAMPS: CampDef[] = [];
export const ZONE4_OBJECTS: GroundObjectDef[] = [];
export const ZONE4_PROPS: ZonePropsDef = {
  buildings: [],
  wells: [],
  stalls: [],
  mines: [],
  docks: [],
  tents: [],
  crates: [],
  campfires: [],
  mudHuts: [],
  ruinRings: [],
  fences: [],
  graveyards: [],
  delveMarkers: [],
};
