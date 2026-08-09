// Gathering nodes must sit on LAND.
//
// Wave 1's node coordinates were taken from upstream's pre-fix values, and six
// of them landed inside our lake basins: `baseHeight` carves a lake floor to
// WATER_LEVEL - 4, so those nodes were four yards under the surface. All three
// Eastbrook herb patches were among them, and they are the ONLY herbalism nodes
// in the starting zone, so a new herbalist had to swim out and dive to find any
// herb at all.
//
// Severity, stated honestly: this was never a hard block for us. Our interact
// check is 2D (`dist2d`), harvesting has no swim gate (only fishing does) and
// there is no breath system, so a player floating on the surface could work a
// submerged node. The defect is discoverability plus a vein rendered on a lake
// bottom.
//
// This test is the guard rather than the fix: it re-derives the ground height
// from the REAL `terrainHeight` at the REAL fixed WORLD_SEED, at the node and
// around the full harvest reach ring, so the next content wave cannot drop a
// node into a lake and still be green.

import { describe, expect, it } from 'vitest';

import { GATHER_NODES } from '../src/sim/content/professions';
import { INTERACT_RANGE } from '../src/sim/types';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';

// src/main.ts pins the client world to this seed, so it is the seed every real
// player's world is generated from.
const WORLD_SEED = 20061;
const RING_SAMPLES = 24;

function freeboard(x: number, z: number): number {
  return terrainHeight(x, z, WORLD_SEED) - WATER_LEVEL;
}

/** The lowest freeboard anywhere a player could stand and still reach the node.
 *  A node whose ring dips under the waterline is one you have to swim to work,
 *  even when the node itself is dry. */
function worstReachFreeboard(x: number, z: number): number {
  let worst = freeboard(x, z);
  for (let i = 0; i < RING_SAMPLES; i++) {
    const a = (i / RING_SAMPLES) * Math.PI * 2;
    const h = freeboard(x + Math.cos(a) * INTERACT_RANGE, z + Math.sin(a) * INTERACT_RANGE);
    if (h < worst) worst = h;
  }
  return worst;
}

describe('every gathering node is on dry land at the shipped world seed', () => {
  it('has nodes to check', () => {
    expect(GATHER_NODES.length).toBeGreaterThan(30);
  });

  for (const n of GATHER_NODES) {
    it(`${n.id} at (${n.pos.x}, ${n.pos.z})`, () => {
      const own = freeboard(n.pos.x, n.pos.z);
      expect(own, `${n.id} is ${(-own).toFixed(2)} yd UNDER water`).toBeGreaterThan(0);
      const reach = worstReachFreeboard(n.pos.x, n.pos.z);
      expect(
        reach,
        `${n.id} is dry but its ${INTERACT_RANGE} yd harvest reach dips ${(-reach).toFixed(2)} yd under water`,
      ).toBeGreaterThan(0);
    });
  }

  it('the starting zone still has herbalism nodes, and they are all reachable on foot', () => {
    const starter = GATHER_NODES.filter((n) => n.zoneId === 'eastbrook_vale' && n.type === 'herb');
    expect(starter.length, 'a new herbalist needs somewhere to start').toBeGreaterThanOrEqual(3);
    for (const n of starter) expect(worstReachFreeboard(n.pos.x, n.pos.z)).toBeGreaterThan(0);
  });

  it('no two nodes share a position', () => {
    const seen = new Set<string>();
    for (const n of GATHER_NODES) {
      const key = `${n.pos.x},${n.pos.z}`;
      expect(seen.has(key), `duplicate node position ${key} (${n.id})`).toBe(false);
      seen.add(key);
    }
  });
});
