// Rift creature templates: two trash elites and one giga-boss per environment
// theme (content/rift/themes.ts pairs them up).
//
// Data-as-code only, no logic. Shapes come from `MobTemplate` (../../types).
//
// STAT BUDGET. Every template here is authored ON THE C-RANK LINE, so the C
// entry in RIFT_RANK_TUNING (sim/rift/ranks.ts) is exactly 1.0 across the board
// and the B/A/S ladder is a single readable multiplier away. The C line is our
// own level-20 five-man line, taken from real numbers in this directory:
//
//   trash: Sanctum Boneguard (dungeons.ts) is hpBase 64 / hpPerLevel 23 /
//          dmgBase 12 / dmgPerLevel 2.7 / armorPerLevel 22, i.e. ~1,205 effective
//          hp and ~99 damage at level 20 after the ~2.3x / ~1.5x elite scaling.
//          Rift trash sits a touch above it (hpBase 70-84, hpPerLevel 24-27),
//          because a rift is endgame-only content that assumes a full group.
//   boss:  Korzul the Gravewyrm (dungeons.ts) is hpBase 420 / hpPerLevel 48 /
//          dmgBase 15 / dmgPerLevel 3.0 / armorPerLevel 34, i.e. ~3,174 effective
//          hp and ~113 damage at level 20. Rift bosses sit on that line.
//
// SCALE. Rift bosses render at 2.4x to 3.3x, between Korzul (1.8) and Nythraxis
// (3.1), so a rift boss reads as a giga-boss the moment it comes into view. That
// is the one visual signal a fully procedural dungeon gets for free.
//
// LOOT is deliberately EMPTY on every template. The rift loot economy is a later
// wave; an empty table is the honest state, not an oversight, and it keeps this
// wave's generator from silently minting endgame gear.
//
// NAMES are player-visible English, the source the client localizes (see
// content/CLAUDE.md). They are listed in this subsystem's CLAUDE.md so the UI
// wave can register the ids.

import type { MobTemplate } from '../../types';

/** Level band every rift mob spawns in. `riftFloorLevel` resolves the exact
 * level per floor; 22 is the fork's ceiling (see sim/rift/ranks.ts). */
const LVL_MIN = 20;
const LVL_MAX = 22;

interface TrashSpec {
  id: string;
  name: string;
  family: MobTemplate['family'];
  hpBase: number;
  hpPerLevel: number;
  dmgBase: number;
  dmgPerLevel: number;
  attackSpeed: number;
  armorPerLevel: number;
  moveSpeed: number;
  aggroRadius: number;
  scale: number;
  color: number;
  canSwim?: boolean;
}

function trash(s: TrashSpec): MobTemplate {
  return {
    id: s.id,
    name: s.name,
    minLevel: LVL_MIN,
    maxLevel: LVL_MAX,
    family: s.family,
    hpBase: s.hpBase,
    hpPerLevel: s.hpPerLevel,
    dmgBase: s.dmgBase,
    dmgPerLevel: s.dmgPerLevel,
    attackSpeed: s.attackSpeed,
    armorPerLevel: s.armorPerLevel,
    moveSpeed: s.moveSpeed,
    aggroRadius: s.aggroRadius,
    loot: [],
    scale: s.scale,
    color: s.color,
    elite: true,
    ...(s.canSwim ? { canSwim: true } : {}),
  };
}

interface BossSpec {
  id: string;
  name: string;
  family: MobTemplate['family'];
  hpBase: number;
  hpPerLevel: number;
  dmgBase: number;
  dmgPerLevel: number;
  attackSpeed: number;
  armorPerLevel: number;
  moveSpeed: number;
  scale: number;
  color: number;
  aoePulse?: MobTemplate['aoePulse'];
  summonAdds?: MobTemplate['summonAdds'];
  enrage?: MobTemplate['enrage'];
  desperateHeal?: MobTemplate['desperateHeal'];
}

function boss(s: BossSpec): MobTemplate {
  return {
    id: s.id,
    name: s.name,
    minLevel: LVL_MIN,
    maxLevel: LVL_MAX,
    family: s.family,
    hpBase: s.hpBase,
    hpPerLevel: s.hpPerLevel,
    dmgBase: s.dmgBase,
    dmgPerLevel: s.dmgPerLevel,
    attackSpeed: s.attackSpeed,
    armorPerLevel: s.armorPerLevel,
    moveSpeed: s.moveSpeed,
    aggroRadius: 18,
    loot: [],
    scale: s.scale,
    color: s.color,
    elite: true,
    boss: true,
    // Every level-20-plus boss in this fork is CC-immune (Korzul, the whole
    // Claudeholme line, Nythraxis); a rift boss is no different.
    ccImmune: true,
    slowImmune: true,
    ...(s.aoePulse ? { aoePulse: s.aoePulse } : {}),
    ...(s.summonAdds ? { summonAdds: s.summonAdds } : {}),
    ...(s.enrage ? { enrage: s.enrage } : {}),
    ...(s.desperateHeal ? { desperateHeal: s.desperateHeal } : {}),
  };
}

// ---------------------------------------------------------------------------
// Boss-summoned adds. Shared across themes: they are wave pressure on top of the
// boss, never spawn-list trash, so they are NOT elite and carry the softer
// `add` damage multiplier (sim/rift/ranks.ts).
// ---------------------------------------------------------------------------

const RIFT_ADDS: MobTemplate[] = [
  {
    id: 'rift_riftspawn',
    name: 'Riftspawn',
    minLevel: LVL_MIN,
    maxLevel: LVL_MAX,
    family: 'demon',
    // Roughly the Raised Bonewalker line (dungeons.ts), our existing
    // boss-summoned add: light, fast, dangerous in numbers.
    hpBase: 46,
    hpPerLevel: 16,
    dmgBase: 10,
    dmgPerLevel: 2.3,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 7.5,
    aggroRadius: 12,
    loot: [],
    scale: 0.95,
    color: 0x8a5ad0,
  },
  {
    id: 'rift_shardling',
    name: 'Rift Shardling',
    minLevel: LVL_MIN,
    maxLevel: LVL_MAX,
    family: 'elemental',
    hpBase: 44,
    hpPerLevel: 15,
    dmgBase: 11,
    dmgPerLevel: 2.4,
    attackSpeed: 1.8,
    armorPerLevel: 10,
    moveSpeed: 8,
    aggroRadius: 12,
    loot: [],
    scale: 0.9,
    color: 0x7ad0e0,
  },
];

// ---------------------------------------------------------------------------
// Trash, two per theme. Families are drawn from our own MobFamily union so the
// existing render/AI/threat behaviour applies unchanged.
// ---------------------------------------------------------------------------

const RIFT_TRASH: MobTemplate[] = [
  // Frostbound
  trash({
    id: 'rift_frost_revenant',
    name: 'Frostbound Revenant',
    family: 'undead',
    hpBase: 80,
    hpPerLevel: 26,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.4,
    armorPerLevel: 26,
    moveSpeed: 6.5,
    aggroRadius: 12,
    scale: 1.2,
    color: 0xa8cfe8,
  }),
  trash({
    id: 'rift_rime_elemental',
    name: 'Rime Elemental',
    family: 'elemental',
    hpBase: 72,
    hpPerLevel: 24,
    dmgBase: 13,
    dmgPerLevel: 2.9,
    attackSpeed: 2.0,
    armorPerLevel: 20,
    moveSpeed: 7,
    aggroRadius: 13,
    scale: 1.3,
    color: 0x7fbfe0,
  }),

  // Emberforge
  trash({
    id: 'rift_ember_fiend',
    name: 'Ember Fiend',
    family: 'demon',
    hpBase: 74,
    hpPerLevel: 24,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 1.8,
    armorPerLevel: 18,
    moveSpeed: 7.5,
    aggroRadius: 13,
    scale: 1.1,
    color: 0xe07a3a,
  }),
  trash({
    id: 'rift_magma_brute',
    name: 'Magma Brute',
    family: 'elemental',
    hpBase: 84,
    hpPerLevel: 27,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.8,
    armorPerLevel: 30,
    moveSpeed: 6,
    aggroRadius: 11,
    scale: 1.45,
    color: 0xc2502a,
  }),

  // Venomweald
  trash({
    id: 'rift_venom_weaver',
    name: 'Venomweald Weaver',
    family: 'spider',
    hpBase: 70,
    hpPerLevel: 24,
    dmgBase: 13,
    dmgPerLevel: 2.9,
    attackSpeed: 1.8,
    armorPerLevel: 18,
    moveSpeed: 8,
    aggroRadius: 14,
    scale: 1.25,
    color: 0x8fbf4a,
  }),
  trash({
    id: 'rift_thornback',
    name: 'Thornback Stalker',
    family: 'beast',
    hpBase: 78,
    hpPerLevel: 25,
    dmgBase: 13,
    dmgPerLevel: 2.8,
    attackSpeed: 2.2,
    armorPerLevel: 24,
    moveSpeed: 7.5,
    aggroRadius: 13,
    scale: 1.2,
    color: 0x6f9a3a,
  }),

  // Boneyard
  trash({
    id: 'rift_boneclad',
    name: 'Boneclad Sentinel',
    family: 'undead',
    hpBase: 82,
    hpPerLevel: 26,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.4,
    armorPerLevel: 28,
    moveSpeed: 6.5,
    aggroRadius: 12,
    scale: 1.15,
    color: 0xd8cfb0,
  }),
  trash({
    id: 'rift_marrow_troll',
    name: 'Marrow Troll',
    family: 'troll',
    hpBase: 84,
    hpPerLevel: 27,
    dmgBase: 13,
    dmgPerLevel: 2.8,
    attackSpeed: 2.6,
    armorPerLevel: 22,
    moveSpeed: 7,
    aggroRadius: 13,
    scale: 1.35,
    color: 0x9aa878,
  }),

  // Warcamp
  trash({
    id: 'rift_stone_ogre',
    name: 'Warcamp Ogre',
    family: 'ogre',
    hpBase: 84,
    hpPerLevel: 27,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 2.8,
    armorPerLevel: 26,
    moveSpeed: 6,
    aggroRadius: 12,
    scale: 1.5,
    color: 0x9a7a4a,
  }),
  trash({
    id: 'rift_iron_reaver',
    name: 'Iron Reaver',
    family: 'humanoid',
    hpBase: 72,
    hpPerLevel: 24,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 1.9,
    armorPerLevel: 24,
    moveSpeed: 7.5,
    aggroRadius: 13,
    scale: 1.1,
    color: 0xa03a30,
  }),

  // Voidscar
  trash({
    id: 'rift_void_acolyte',
    name: 'Voidscar Acolyte',
    family: 'humanoid',
    hpBase: 70,
    hpPerLevel: 24,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 2.0,
    armorPerLevel: 18,
    moveSpeed: 7,
    aggroRadius: 13,
    scale: 1.05,
    color: 0x8a6ac0,
  }),
  trash({
    id: 'rift_dread_stalker',
    name: 'Dread Stalker',
    family: 'demon',
    hpBase: 76,
    hpPerLevel: 25,
    dmgBase: 13,
    dmgPerLevel: 2.9,
    attackSpeed: 1.8,
    armorPerLevel: 20,
    moveSpeed: 8,
    aggroRadius: 14,
    scale: 1.25,
    color: 0x5a3a8a,
  }),

  // Stormspire
  trash({
    id: 'rift_storm_caller',
    name: 'Stormspire Caller',
    family: 'elemental',
    hpBase: 70,
    hpPerLevel: 24,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 2.0,
    armorPerLevel: 18,
    moveSpeed: 7,
    aggroRadius: 13,
    scale: 1.2,
    color: 0x6ab0e8,
  }),
  trash({
    id: 'rift_stormscale',
    name: 'Stormscale Drake',
    family: 'dragonkin',
    hpBase: 80,
    hpPerLevel: 26,
    dmgBase: 13,
    dmgPerLevel: 2.9,
    attackSpeed: 2.2,
    armorPerLevel: 28,
    moveSpeed: 7.5,
    aggroRadius: 13,
    scale: 1.4,
    color: 0x4a7ab0,
  }),

  // Sunken
  trash({
    id: 'rift_tide_thrall',
    name: 'Tidebound Thrall',
    family: 'murloc',
    hpBase: 72,
    hpPerLevel: 24,
    dmgBase: 13,
    dmgPerLevel: 2.8,
    attackSpeed: 2.0,
    armorPerLevel: 18,
    moveSpeed: 7.5,
    aggroRadius: 13,
    scale: 1.05,
    color: 0x4aa898,
    canSwim: true,
  }),
  trash({
    id: 'rift_deep_lurker',
    name: 'Deep Lurker',
    family: 'beast',
    hpBase: 82,
    hpPerLevel: 26,
    dmgBase: 12,
    dmgPerLevel: 2.7,
    attackSpeed: 2.5,
    armorPerLevel: 26,
    moveSpeed: 6.5,
    aggroRadius: 12,
    scale: 1.35,
    color: 0x2f7a70,
    canSwim: true,
  }),
];

// ---------------------------------------------------------------------------
// Bosses, one per theme. Each carries a kit of optional mechanics; how many of
// them are LIVE is the rank budget (sim/rift/ranks.ts RIFT_RANK_MECHANIC_BUDGET,
// ordered by content/rift/themes.ts `bossMechanics`), so a C boss shows one
// thing and an S boss shows the whole kit.
// ---------------------------------------------------------------------------

const RIFT_BOSSES: MobTemplate[] = [
  boss({
    id: 'rift_boss_frost',
    name: 'Hoarfrost, the Rime Sovereign',
    family: 'elemental',
    hpBase: 440,
    hpPerLevel: 48,
    dmgBase: 15,
    dmgPerLevel: 3.0,
    attackSpeed: 2.6,
    armorPerLevel: 36,
    moveSpeed: 6.8,
    scale: 2.9,
    color: 0x9fd8ff,
    aoePulse: { min: 30, max: 44, radius: 12, every: 9, name: 'Glacial Burst', school: 'frost' },
    enrage: { belowHpPct: 0.3, dmgMult: 1.4, hasteMult: 1.25 },
  }),
  boss({
    id: 'rift_boss_ember',
    name: 'Vulkarax, the Forgewrath',
    family: 'demon',
    hpBase: 450,
    hpPerLevel: 48,
    dmgBase: 16,
    dmgPerLevel: 3.1,
    attackSpeed: 2.4,
    armorPerLevel: 34,
    moveSpeed: 7,
    scale: 3.1,
    color: 0xff8a3a,
    aoePulse: { min: 32, max: 48, radius: 11, every: 8, name: 'Cinder Nova', school: 'fire' },
    summonAdds: { mobId: 'rift_riftspawn', count: 2, atHpPct: [0.6, 0.3] },
    enrage: { belowHpPct: 0.25, dmgMult: 1.45, hasteMult: 1.3 },
  }),
  boss({
    id: 'rift_boss_venom',
    name: 'Sythrenne, the Bramble Matron',
    family: 'spider',
    hpBase: 430,
    hpPerLevel: 47,
    dmgBase: 16,
    dmgPerLevel: 3.2,
    attackSpeed: 2.2,
    armorPerLevel: 30,
    moveSpeed: 7.4,
    scale: 2.7,
    color: 0x8fbf4a,
    aoePulse: { min: 30, max: 42, radius: 13, every: 9, name: 'Venom Spray', school: 'nature' },
    summonAdds: { mobId: 'rift_riftspawn', count: 3, atHpPct: [0.5] },
  }),
  boss({
    id: 'rift_boss_necro',
    name: 'Ossuar, the Marrow King',
    family: 'undead',
    hpBase: 460,
    hpPerLevel: 49,
    dmgBase: 15,
    dmgPerLevel: 3.0,
    attackSpeed: 2.5,
    armorPerLevel: 38,
    moveSpeed: 6.6,
    scale: 2.8,
    color: 0xd8cfb0,
    summonAdds: { mobId: 'rift_riftspawn', count: 3, atHpPct: [0.7, 0.4, 0.2] },
    desperateHeal: { belowHpPct: 0.2, healPct: 0.12 },
  }),
  boss({
    id: 'rift_boss_brute',
    name: 'Grokmar Skullbinder',
    family: 'ogre',
    hpBase: 470,
    hpPerLevel: 50,
    dmgBase: 17,
    dmgPerLevel: 3.3,
    attackSpeed: 2.8,
    armorPerLevel: 32,
    moveSpeed: 6.5,
    scale: 3.3,
    color: 0xc0a878,
    aoePulse: { min: 34, max: 50, radius: 10, every: 10, name: 'Skullquake', school: 'physical' },
    enrage: { belowHpPct: 0.3, dmgMult: 1.5, hasteMult: 1.3 },
  }),
  boss({
    id: 'rift_boss_arcane',
    name: 'Nul-Vareth, the Umbral Maw',
    family: 'demon',
    hpBase: 430,
    hpPerLevel: 47,
    dmgBase: 16,
    dmgPerLevel: 3.2,
    attackSpeed: 2.2,
    armorPerLevel: 30,
    moveSpeed: 7.2,
    scale: 3.0,
    color: 0xa65aff,
    aoePulse: { min: 32, max: 46, radius: 14, every: 8, name: 'Umbral Collapse', school: 'shadow' },
    summonAdds: { mobId: 'rift_shardling', count: 2, atHpPct: [0.65, 0.35] },
  }),
  boss({
    id: 'rift_boss_storm',
    name: 'Tempestrix, the Gale Herald',
    family: 'dragonkin',
    hpBase: 440,
    hpPerLevel: 48,
    dmgBase: 16,
    dmgPerLevel: 3.1,
    attackSpeed: 2.3,
    armorPerLevel: 34,
    moveSpeed: 7.5,
    scale: 3.0,
    color: 0x5abfff,
    aoePulse: {
      min: 32,
      max: 48,
      radius: 13,
      every: 8,
      name: 'Thunder Crash',
      school: 'nature',
      fx: 'nova',
    },
    enrage: { belowHpPct: 0.25, dmgMult: 1.4, hasteMult: 1.25 },
  }),
  boss({
    id: 'rift_boss_tide',
    name: 'Abyssara, the Drowned Chorus',
    family: 'murloc',
    hpBase: 445,
    hpPerLevel: 48,
    dmgBase: 15,
    dmgPerLevel: 3.0,
    attackSpeed: 2.4,
    armorPerLevel: 32,
    moveSpeed: 7,
    scale: 2.4,
    color: 0x5ae8d0,
    aoePulse: { min: 30, max: 44, radius: 12, every: 9, name: 'Drowning Hymn', school: 'frost' },
    summonAdds: { mobId: 'rift_shardling', count: 3, atHpPct: [0.55, 0.25] },
    desperateHeal: { belowHpPct: 0.25, healPct: 0.1 },
  }),
];

/** Every rift creature template, keyed by id. `sim/data.ts` merges this into the
 * flat `MOBS` table (a one-line spread) when the runtime wave lands; nothing
 * here depends on that having happened. */
export const RIFT_MOBS: Record<string, MobTemplate> = Object.fromEntries(
  [...RIFT_TRASH, ...RIFT_BOSSES, ...RIFT_ADDS].map((m) => [m.id, m]),
);

/** Spawn-list trash ids (the only templates a floor's packs draw from). */
export const RIFT_TRASH_IDS: readonly string[] = RIFT_TRASH.map((m) => m.id);
/** Floor-boss ids. */
export const RIFT_BOSS_IDS: readonly string[] = RIFT_BOSSES.map((m) => m.id);
/** Boss-summoned add ids. Never spawn-list trash. */
export const RIFT_ADD_IDS: readonly string[] = RIFT_ADDS.map((m) => m.id);
