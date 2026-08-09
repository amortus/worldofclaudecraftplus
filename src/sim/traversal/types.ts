// Shared input shapes for the traversal core. Everything here is a plain
// function or record the CALLER supplies: the traversal modules never reach
// into `Sim`, never read a global, and never guess a value they were not given.

import type { Collider } from '../colliders';

/**
 * Absolute world-space top of an obstacle FOR MOVEMENT, in yards, or
 * `undefined` when the obstacle is full height (nothing crosses it).
 *
 * This is deliberately a caller-supplied function rather than a field read.
 * `Collider.cameraTopY` exists today but is documented as camera-only ("movement
 * ignores it"), so the traversal core must not silently promote it into a
 * movement rule. The wiring step decides what the movement top of each collider
 * class is and passes it in here.
 */
export type ColliderTopFn = (c: Collider) => number | undefined;

/** Walkable heightfield sample at a world XZ point (yards). */
export type GroundFn = (x: number, z: number) => number;

/** Predicate for colliders this mover ignores entirely (a jumper over fences). */
export type ColliderFilter = (c: Collider) => boolean;
