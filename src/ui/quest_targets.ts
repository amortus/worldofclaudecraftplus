// Pure, host-agnostic resolver: "for this quest objective, WHERE in the world
// should we point the player?" It maps a quest objective's target (a mob, a
// ground object, an NPC, or a collectible item's drop source) to world
// locations, reading only the static, frozen content tables in src/sim/data.
// No DOM, no Three, no Sim state, fully deterministic -> unit-tested directly
// (tests/quest_targets.test.ts), mirroring the pure-core split of quest_tracker.ts
// and subzone.ts. The HUD (map markers) and the renderer (waypoint arrow) consume
// its output; this module owns the geography, they own the drawing.

import { CAMPS, GROUND_OBJECTS, MOBS, NPCS, QUESTS, zoneAt } from '../sim/data';
import type { QuestObjective } from '../sim/types';
import { questTurnInNpcIds } from '../sim/types';
import { nearestSubzone } from './subzone';

export type TargetKind = 'mobCamp' | 'npc' | 'object';

export interface TargetLocation {
  x: number;
  z: number;
  /** Search radius in world units: 0 for a point (NPC / object), the camp
   *  radius for a mob spawn region (so the map can draw a "look here" ring and
   *  the arrow can stop pulling once you are inside the cluster). */
  radius: number;
  kind: TargetKind;
  /** The zone the location sits in (for the "Zone, Subzone" readout). */
  zoneId: string;
  zoneName: string;
  /** The nearest named landmark, or null in open wilderness. */
  poiLabel: string | null;
}

export interface QuestMarker extends TargetLocation {
  questId: string;
  /** Index into QuestDef.objectives, or -1 for the turn-in marker. */
  objIndex: number;
  objType: QuestObjective['type'] | 'turnin';
}

function loc(x: number, z: number, radius: number, kind: TargetKind): TargetLocation {
  const zone = zoneAt(x, z);
  return { x, z, radius, kind, zoneId: zone.id, zoneName: zone.name, poiLabel: nearestSubzone(x, z, zone.pois, null) };
}

/** Every authored spawn camp (center + radius) for a mob template. One mob can
 *  have several camps in different regions. Empty when the mob has no overworld
 *  camp (e.g. dungeon-only mobs), in which case we simply show no marker. */
function mobCamps(mobId: string): TargetLocation[] {
  return CAMPS.filter((c) => c.mobId === mobId).map((c) => loc(c.center.x, c.center.z, c.radius, 'mobCamp'));
}

/** Where a collectible item comes from: ground objects that yield it, plus the
 *  spawn camps of every mob whose loot table can drop it. */
function itemSources(itemId: string): TargetLocation[] {
  const out: TargetLocation[] = [];
  for (const o of GROUND_OBJECTS) {
    if (o.itemId === itemId) for (const p of o.positions) out.push(loc(p.x, p.z, 0, 'object'));
  }
  for (const mobId of Object.keys(MOBS)) {
    if ((MOBS[mobId].loot ?? []).some((l) => l.itemId === itemId)) out.push(...mobCamps(mobId));
  }
  return out;
}

/** Candidate world locations for a single quest objective. */
export function objectiveLocations(obj: QuestObjective): TargetLocation[] {
  switch (obj.type) {
    case 'kill':
      return obj.targetMobId ? mobCamps(obj.targetMobId) : [];
    case 'collect':
      return obj.itemId ? itemSources(obj.itemId) : [];
    case 'interact':
      if (obj.targetObjectItemId) {
        const o = GROUND_OBJECTS.find((g) => g.itemId === obj.targetObjectItemId);
        return o ? o.positions.map((p) => loc(p.x, p.z, 0, 'object')) : [];
      }
      if (obj.targetNpcId) {
        const n = NPCS[obj.targetNpcId];
        return n ? [loc(n.pos.x, n.pos.z, 0, 'npc')] : [];
      }
      return [];
    default:
      return [];
  }
}

/** Markers for a quest's INCOMPLETE objectives (counts is the per-objective
 *  progress, index-aligned to QuestDef.objectives). When every objective is
 *  done, returns the turn-in NPC marker(s) instead, so the arrow retargets to
 *  the quest giver. Unknown quest id -> no markers. */
export function questMarkers(questId: string, counts: readonly number[]): QuestMarker[] {
  const quest = QUESTS[questId];
  if (!quest) return [];
  const markers: QuestMarker[] = [];
  let allDone = true;
  quest.objectives.forEach((obj, i) => {
    if ((counts[i] ?? 0) >= obj.count) return;
    allDone = false;
    for (const l of objectiveLocations(obj)) markers.push({ ...l, questId, objIndex: i, objType: obj.type });
  });
  if (allDone) {
    for (const npcId of questTurnInNpcIds(quest)) {
      const n = NPCS[npcId];
      if (n) markers.push({ ...loc(n.pos.x, n.pos.z, 0, 'npc'), questId, objIndex: -1, objType: 'turnin' });
    }
  }
  return markers;
}

export interface NearestResult<T> {
  marker: T;
  /** World distance from the point to the marker, clamped to the area edge
   *  (0 once the player is inside a camp radius). */
  dist: number;
}

/** The marker closest to (px,pz), measuring to the nearest edge of an area
 *  marker (so an in-radius camp reads as distance 0). Null for an empty list. */
export function pickNearest<T extends { x: number; z: number; radius: number }>(
  markers: readonly T[],
  px: number,
  pz: number,
): NearestResult<T> | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const m of markers) {
    const d = Math.max(0, Math.hypot(m.x - px, m.z - pz) - m.radius);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best ? { marker: best, dist: bestDist } : null;
}
