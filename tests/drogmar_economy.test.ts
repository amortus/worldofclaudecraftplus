// Warlord Drogmar was a gold faucet.
//
// The respawn rule is `respawnSeconds * (respawnMult ?? (rare ? 4 : 1))`, and
// `boss`/`elite` are NOT inputs to it. Drogmar declared neither `rare` nor
// `respawnMult`, so he came back on the 25 s BASE timer while dropping 2000
// guaranteed copper, inside a camp of Thornpeak Crushers that each dropped 200.
// He was roughly 55 percent of the camp's guaranteed coin, every 25 seconds.
//
// The numbers here are anchored, not invented: 7.2 is the shipped cadence for a
// named quest kill target, 650 is Marrowlord Varkas (the other zone3 named
// elite), and the crusher's coin now sits inside zone3's own trash band.

import { describe, expect, it } from 'vitest';

import { MOBS, QUESTS } from '../src/sim/data';

const DROGMAR = 'warlord_drogmar';
const CRUSHER = 'ogre_crusher';

/** The respawn multiplier the sim will actually apply (sim.ts). */
function effectiveRespawnMult(id: string): number {
  const t = MOBS[id];
  return t.respawnMult ?? (t.rare ? 4 : 1);
}

function guaranteedCopper(id: string): number {
  return (MOBS[id].loot ?? [])
    .filter((l) => l.copper && l.chance === 1)
    .reduce((a, l) => a + (l.copper ?? 0), 0);
}

describe('Warlord Drogmar respawn and coin', () => {
  it('is a quest kill target, so his cadence has to be a quest cadence', () => {
    const kills = Object.values(QUESTS).flatMap((q) =>
      q.objectives.filter((o) => o.type === 'kill' && o.targetMobId === DROGMAR),
    );
    expect(kills.length, 'q_drogmar has a hard kill objective on him').toBeGreaterThan(0);
  });

  it('does not rely on boss/elite to slow its respawn, because they do not', () => {
    expect(MOBS[DROGMAR].boss).toBe(true);
    expect(MOBS[DROGMAR].elite).toBe(true);
    // The bug: with no respawnMult and no `rare`, both flags resolve to 1x.
    expect(MOBS[DROGMAR].respawnMult).toBeDefined();
    expect(effectiveRespawnMult(DROGMAR)).toBeGreaterThan(1);
  });

  it('uses the shipped named-quest-target cadence, not a bespoke number', () => {
    expect(MOBS[DROGMAR].respawnMult).toBe(MOBS.old_cragmaw.respawnMult);
    expect(MOBS[DROGMAR].respawnMult).toBe(MOBS.captain_verlan.respawnMult);
  });

  it('drops the same guaranteed coin as the other zone3 named elite', () => {
    expect(guaranteedCopper(DROGMAR)).toBe(guaranteedCopper('marrowlord_varkas'));
  });

  it('the crusher sits inside zone3 trash band, not four times it', () => {
    const band = ['thornpeak_ogre', 'stormcrag_elemental', 'wyrmcult_zealot'].map(guaranteedCopper);
    const crusher = guaranteedCopper(CRUSHER);
    expect(crusher).toBeGreaterThanOrEqual(Math.min(...band));
    expect(crusher).toBeLessThanOrEqual(Math.max(...band));
  });

  it('is no longer the majority of his own camp per cycle', () => {
    // 8 crushers share Drogmar's war-camp, and each of them respawns 7.2x faster
    // than he now does. The boss must not out-earn the pack he leads.
    const CAMP_CRUSHERS = 8;
    const bossRate = guaranteedCopper(DROGMAR) / effectiveRespawnMult(DROGMAR);
    const campRate = (CAMP_CRUSHERS * guaranteedCopper(CRUSHER)) / effectiveRespawnMult(CRUSHER);
    expect(bossRate).toBeLessThan(campRate);
    expect(bossRate / (bossRate + campRate)).toBeLessThan(0.2);
  });
});
