// Regression for the upstream "Bound Guardian" direction fix: the quest text sent
// players to the wrong side of the map. Pin the quest's compass words against the
// real world coordinates using the engine's actual convention, so a future copy edit
// cannot silently reintroduce the drift.
//
// Convention (src/sim/content/zone1.ts: "+z north, +x WEST (east is -x: facing 0
// looks along +z and turning right decreases facing, so the rendered world and the
// corrected map both put -x on your right)"): +x is WEST, -x is EAST, +z is north.

import { describe, expect, it } from 'vitest';
import { ZONE3_OBJECTS } from '../src/sim/content/zone3';
import { DUNGEONS, QUESTS } from '../src/sim/data';

function objectPos(itemId: string): { x: number; z: number } {
  const obj = ZONE3_OBJECTS.find((o) => o.itemId === itemId);
  expect(obj, `${itemId} should be a registered zone3 object`).toBeTruthy();
  const pos = obj!.positions[0];
  expect(pos).toBeTruthy();
  return pos;
}

describe('q_nythraxis_bound_guardian quest text direction', () => {
  it('places the ritual circle north-west of the abandoned crypt door', () => {
    const crypt = DUNGEONS.nythraxis_crypt;
    expect(crypt, 'nythraxis_crypt dungeon should be registered').toBeTruthy();
    const ritual = objectPos('crypt_ritual_circle');
    expect(ritual.x).toBeGreaterThan(crypt.doorPos.x); // +x is west
    expect(ritual.z).toBeGreaterThan(crypt.doorPos.z); // +z is north
  });

  it("places the ritual circle north-east of High Priest Malric's grave", () => {
    const grave = objectPos('grave_high_priest_malric');
    const ritual = objectPos('crypt_ritual_circle');
    expect(ritual.x).toBeLessThan(grave.x); // -x is east
    expect(ritual.z).toBeGreaterThan(grave.z); // +z is north
  });

  it('describes those two bearings in the quest text', () => {
    const text = QUESTS.q_nythraxis_bound_guardian.text;
    expect(text).toContain('north-west of the abandoned crypt');
    expect(text).toContain("north-east of High Priest Malric's grave");
    // The pre-fix copy pointed the opposite way on both axes.
    expect(text).not.toContain('east of the abandoned crypt and south-east');
    expect(text).not.toContain('the western grave');
  });
});
