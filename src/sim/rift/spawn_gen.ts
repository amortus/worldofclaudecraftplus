// The floor's creature plan: trash packs down the nave, and the giga-boss on
// the dais of the last floor.
//
// Sim layer: no DOM/Three imports. All randomness comes from the caller's LOCAL
// Rng, seeded from the descriptor.

import type { RiftTheme } from '../content/rift';
import type { Rng } from '../rng';
import { riftEntryZ, type RiftGeometry, toClear } from './layout_gen';
import type { RiftSpawn } from './types';

/** How far past the arrival point the first pack may stand. Rift trash has an
 * aggro radius of 11 to 14 (content/rift/mobs.ts) and aggro grows with level
 * difference, so 26 keeps the whole first pack outside it: walking into a rift
 * must never pull a pack before the party has done anything. */
export const RIFT_ENTRY_CLEARANCE = 26;

/** How far a trash spawn is jittered off its pack line, in z. */
const PACK_Z_JITTER = 2;

/** The lowest instance-local z anything may spawn at. */
export function riftMinSpawnZ(entryZ: number): number {
  return entryZ + RIFT_ENTRY_CLEARANCE;
}

export function planRiftSpawns(
  rng: Rng,
  theme: RiftTheme,
  geo: RiftGeometry,
  floorLevel: number,
  isBoss: boolean,
): RiftSpawn[] {
  const { layout, colliders } = geo;
  const out: RiftSpawn[] = [];
  const trashPool = theme.trash as string[];

  const minSpawnZ = riftMinSpawnZ(riftEntryZ(layout));
  // The band start absorbs the per-spawn jitter, so the whole first pack sits
  // beyond the clearance even after it is jittered south.
  const rawStartZ = layout.zMin + 22;
  const packStartZ = Math.max(rawStartZ, minSpawnZ + PACK_Z_JITTER);
  const packEndZ = layout.dais.z - (isBoss ? 22 : 14);
  const packGap = rng.pick([16, 18, 20]);
  // packCount is keyed to the ORIGINAL band start on purpose: pushing the packs
  // back off the entry must not add or drop an rng draw, or every downstream
  // object on every floor of every existing seed would shift.
  const packCount = Math.max(2, Math.floor((packEndZ - rawStartZ) / packGap));
  const packStride = packCount > 1 ? Math.max(0, (packEndZ - packStartZ) / (packCount - 1)) : 0;

  for (let i = 0; i < packCount; i++) {
    const lineZ = packStartZ + i * packStride;
    const size = isBoss ? rng.int(1, 2) : rng.int(2, 3);
    for (let j = 0; j < size; j++) {
      const templateId = rng.pick(trashPool);
      const spread = Math.max(2, geo.walkHalfAt(lineZ) - 4);
      // Round BEFORE the clearance march, so the stored point is exactly the one
      // validated as clear (no rounding drift between plan and runtime).
      const rawX = Math.round(rng.range(-spread, spread) * 10) / 10;
      const rawZ = Math.max(
        minSpawnZ,
        Math.round((lineZ + rng.range(-PACK_Z_JITTER, PACK_Z_JITTER)) * 10) / 10,
      );
      const p = toClear(colliders, rawX, rawZ);
      out.push({ templateId, x: p.x, z: p.z, level: floorLevel, role: 'trash' });
    }
  }

  if (isBoss) {
    // The boss stands ON the dais, unclamped: the dais is at the far end of a
    // 100-yard-plus nave, so it is never inside the arrival clearance.
    out.push({
      templateId: theme.boss,
      x: 0,
      z: layout.dais.z,
      level: floorLevel,
      boss: true,
      role: 'boss',
    });
    for (const gx of [-6, 6]) {
      const p = toClear(colliders, gx, Math.max(minSpawnZ, layout.dais.z - 6));
      out.push({
        templateId: rng.pick(trashPool),
        x: p.x,
        z: p.z,
        level: floorLevel,
        role: 'trash',
      });
    }
  }

  return out;
}
