import type { Entity } from '../sim/types';

/**
 * Whether a rig should hold the death pose. A RELEASED SPIRIT is the one thing
 * that is `dead` and still animates: the corpse run is a walk, so a ghost must
 * not lie prone while it moves. `ghost` is optional in the pick so the existing
 * callers (and the tests) that pass a bare `{ dead, hp }` keep working.
 */
export function isVisuallyDead(e: Pick<Entity, 'dead' | 'hp'> & { ghost?: boolean }): boolean {
  if (e.ghost) return false;
  return e.dead || e.hp <= 0;
}
