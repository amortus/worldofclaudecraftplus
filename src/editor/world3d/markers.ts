// Editor gizmos: one pickable marker per EditorEntity, placed at the entity's
// (x, z) and lifted to the real terrain surface via groundHeight (the same
// deterministic height the sim/renderer use), so a marker sits exactly where the
// thing spawns in game. Each marker is a stem + head sphere (always readable,
// unlit) plus, for entities that carry a world radius (hub/lake/camp), a flat ring
// showing that footprint. Colored by kind. These are an overlay the editor owns;
// they are never part of the game scene.

import * as THREE from 'three';
import { groundHeight } from '../../sim/world';
import type { EditorEntity, EntityKind } from '../model';

const KIND_COLOR: Record<EntityKind, number> = {
  hub: 0xffd54a,
  graveyard: 0xb0b8c4,
  lake: 0x4aa3ff,
  poi: 0x7ee081,
  camp: 0xff6b6b,
  npc: 0x00e5ff,
  object: 0xffa726,
};

const HEAD_R = 1.2; // head sphere radius (yards)
const STEM_H = 4; // stem height so a head clears small terrain bumps
const SELECT_SCALE = 1.5;

interface MarkerRec {
  group: THREE.Group;
  head: THREE.Mesh;
  headMat: THREE.MeshBasicMaterial;
  baseColor: number;
}

export interface MarkerHandles {
  group: THREE.Group;
  /** raycast against these to select a marker */
  pickMeshes: THREE.Object3D[];
  /** the entity key a picked object belongs to, or null */
  keyOf(obj: THREE.Object3D): string | null;
  setSelected(key: string | null): void;
  /** during a drag: move a marker to (x, z) and re-snap it to the terrain surface */
  moveTo(key: string, x: number, z: number): void;
  dispose(): void;
}

export function buildMarkers(entities: readonly EditorEntity[], seed: number): MarkerHandles {
  const group = new THREE.Group();
  group.name = 'editor-markers';
  const recs = new Map<string, MarkerRec>();
  const pickMeshes: THREE.Object3D[] = [];
  // Shared geometry: one sphere + one unit cylinder reused across every marker.
  const headGeo = new THREE.SphereGeometry(HEAD_R, 16, 12);
  const stemGeo = new THREE.CylinderGeometry(0.18, 0.18, STEM_H, 8);
  const disposables: { dispose(): void }[] = [headGeo, stemGeo];

  for (const e of entities) {
    const color = KIND_COLOR[e.kind];
    const m = new THREE.Group();
    m.userData.key = e.key;

    const headMat = new THREE.MeshBasicMaterial({ color });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = STEM_H;
    head.userData.key = e.key;
    m.add(head);
    pickMeshes.push(head);

    const stemMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = STEM_H / 2;
    m.add(stem);
    disposables.push(headMat, stemMat);

    // Footprint ring for entities with a real world radius.
    if ((e.kind === 'hub' || e.kind === 'lake' || e.kind === 'camp') && e.radius > 2) {
      const ringGeo = new THREE.RingGeometry(e.radius - 0.4, e.radius, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2; // lay flat on the ground
      ring.position.y = 0.15;
      m.add(ring);
      disposables.push(ringGeo, ringMat);
    }

    m.position.set(e.point.x, groundHeight(e.point.x, e.point.z, seed), e.point.z);
    group.add(m);
    recs.set(e.key, { group: m, head, headMat, baseColor: color });
  }

  let selectedKey: string | null = null;

  const keyOf = (obj: THREE.Object3D): string | null => {
    let o: THREE.Object3D | null = obj;
    while (o) {
      const k = o.userData?.key;
      if (typeof k === 'string') return k;
      o = o.parent;
    }
    return null;
  };

  const setSelected = (key: string | null): void => {
    if (selectedKey && recs.has(selectedKey)) {
      const prev = recs.get(selectedKey)!;
      prev.group.scale.setScalar(1);
      prev.headMat.color.setHex(prev.baseColor);
    }
    selectedKey = key;
    if (key && recs.has(key)) {
      const cur = recs.get(key)!;
      cur.group.scale.setScalar(SELECT_SCALE);
      cur.headMat.color.setHex(0xffffff); // selected head reads white
    }
  };

  const moveTo = (key: string, x: number, z: number): void => {
    const rec = recs.get(key);
    if (!rec) return;
    rec.group.position.set(x, groundHeight(x, z, seed), z);
  };

  const dispose = (): void => {
    for (const d of disposables) d.dispose();
    group.clear();
  };

  return { group, pickMeshes, keyOf, setSelected, moveTo, dispose };
}
