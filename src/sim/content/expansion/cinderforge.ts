// THE CINDERFORGE - a five-player dungeon for the level cap, entered from the
// eastern Ashen Wastes.
//
// LORE. Long before the Claudexxaramas anchored over the north, the old empire
// sank a war-forge into the bedrock east of the Bonefields and fed it for a
// hundred years. Eleven winters ago a chapter of the Dawn of Claude went down
// there with a simple plan: relight the forge, pour weapons that could burn the
// blight out of the ground, and hand them to the garrison at Gravewatch. They
// called themselves the Ember Covenant. They got their fire. They did not get
// to choose what answered the striking of it. The forge has not gone out since,
// it takes no fuel, and the Covenant's smiths are still at the anvils with
// cinders where their eyes were, working for the thing that sits in the heat at
// the bottom: Vharkul, the Unquenched.
//
// WHY IT LOOKS LIKE THIS. The dungeon reuses the shipped `sanctum` interior
// (three stone chambers, waists at z 67 and z 115, the boss dais at z 146), so
// it needs no new geometry, no new collider set and no new art. Its pacing is
// deliberately Gravewyrm Sanctum's: bosses on the dais line at z 72 / 114 / 146
// with two guards each at z-2. A dedicated layout is proposed below
// (CINDERFORGE_LAYOUT) for the wiring step; it keeps the same walls and waists
// so every spawn coordinate here stays valid either way.
//
// BALANCE ANCHORS. Trash is anchored on Gravewyrm Sanctum's elites
// (sanctum_boneguard / sanctum_drakonid, dungeons.ts) one tier on. The three
// bosses are anchored on Claudeholme's wing bosses (ch_gatewarden,
// ch_tollkeeper, ch_ashmarshal) and its deathlord (ch_veholt), because the
// Cinderforge is Claudeholme's SIBLING at the cap, not its successor. Every
// anchor is named at the site.
import type { DungeonDef, DungeonSpawn, MobTemplate } from '../../types';
import type { DungeonLayout } from '../../dungeon_layout';

// ---------------------------------------------------------------------------
// Mobs. Families are restricted to ones that already ship a rig
// (`FAMILY_KEYS` in src/render/characters/manifest.ts): humanoid -> mob_bandit,
// elemental -> mob_elemental, demon -> mob_demonalt. Nothing here needs new
// art; the report lists the optional MOB_KEYS overrides that would sharpen the
// silhouettes.
// ---------------------------------------------------------------------------

export const CINDERFORGE_MOBS: Record<string, MobTemplate> = {
  // Trash. Anchor: `sanctum_boneguard` (dungeons.ts, elite 19-20, hpBase 64,
  // hpPerLevel 23, dmgBase 12, dmgPerLevel 2.7, attackSpeed 2.3,
  // armorPerLevel 22, moveSpeed 6.5, aggroRadius 12, copper 350 on its
  // drakonid sibling). One content tier on, so roughly +8 percent on the
  // durability line and the level band moves 20-21 like Claudeholme's trash.
  cf_covenant_smith: {
    id: 'cf_covenant_smith',
    name: 'Ember Covenant Smith',
    minLevel: 20,
    maxLevel: 21,
    family: 'humanoid',
    elite: true,
    hpBase: 72,
    hpPerLevel: 25,
    dmgBase: 14,
    dmgPerLevel: 2.9,
    attackSpeed: 2.4,
    armorPerLevel: 26,
    moveSpeed: 6.5,
    aggroRadius: 12,
    // Anchor: `claudeholme_reaver`'s cleave (radius 6, mult 0.6).
    cleave: { radius: 6, mult: 0.6, name: 'Hammerfall' },
    loot: [
      { copper: 340, chance: 1 },
      { itemId: 'cf_slag_ingot', chance: 0.6 },
      { itemId: 'cf_covenant_ledger', chance: 0.8, questId: 'q_cf_covenant' },
    ],
    scale: 1.05,
    color: 0x8a5a32,
  },
  // The Covenant's chanters keep the smiths standing. Anchor for the heal:
  // `ch_plaguewright`'s mendAlly (healMin 50, healMax 72, radius 14, every 8);
  // scaled down because this is trash, not a boss.
  cf_ashbound_zealot: {
    id: 'cf_ashbound_zealot',
    name: 'Ashbound Zealot',
    minLevel: 20,
    maxLevel: 21,
    family: 'humanoid',
    elite: true,
    hpBase: 68,
    hpPerLevel: 24,
    dmgBase: 13,
    dmgPerLevel: 2.8,
    attackSpeed: 2.1,
    armorPerLevel: 20,
    moveSpeed: 7,
    aggroRadius: 13,
    mendAlly: { healMin: 44, healMax: 62, radius: 12, every: 8, name: 'Rite of the Ember', school: 'fire' },
    loot: [
      { copper: 330, chance: 1 },
      { itemId: 'cf_slag_ingot', chance: 0.5 },
    ],
    scale: 1.0,
    color: 0xb5482a,
  },
  // Slag that got up and walked. Anchor: `sanctum_drakonid` (elite 19-20,
  // hpBase 68, hpPerLevel 24, armorPerLevel 26, copper 350) for the durable
  // trash slot; the burn is anchored on `blighted_husk`'s bleed
  // (chance 0.25, perTick 6, interval 3, duration 12) raised for elite tier.
  cf_slag_elemental: {
    id: 'cf_slag_elemental',
    name: 'Slagbound Elemental',
    minLevel: 20,
    maxLevel: 21,
    family: 'elemental',
    elite: true,
    hpBase: 76,
    hpPerLevel: 26,
    dmgBase: 14,
    dmgPerLevel: 3.0,
    attackSpeed: 2.6,
    armorPerLevel: 30,
    moveSpeed: 6,
    aggroRadius: 12,
    bleed: { chance: 0.3, perTick: 8, interval: 3, duration: 12, name: 'Molten Spatter', school: 'fire' },
    loot: [
      { copper: 350, chance: 1 },
      { itemId: 'cf_slag_ingot', chance: 0.6 },
    ],
    scale: 1.2,
    color: 0xc2521e,
  },
  // Fast, thin, and it panics. Anchor for the frenzy: `ashen_ghoul`'s enrage
  // (belowHpPct 0.35, dmgMult 1.35, hasteMult 1.25), zone4.ts.
  cf_emberling: {
    id: 'cf_emberling',
    name: 'Forge Emberling',
    minLevel: 20,
    maxLevel: 21,
    family: 'demon',
    elite: true,
    hpBase: 62,
    hpPerLevel: 22,
    dmgBase: 15,
    dmgPerLevel: 3.1,
    attackSpeed: 1.8,
    armorPerLevel: 18,
    moveSpeed: 8,
    aggroRadius: 13,
    enrage: { belowHpPct: 0.35, dmgMult: 1.35, hasteMult: 1.25 },
    loot: [{ copper: 320, chance: 1 }],
    scale: 0.9,
    color: 0xd96b2a,
  },
  // Summoned add, never placed in the spawn list. Anchor: `claudeholme_husk`
  // (non-elite cap trash, hpBase 120, hpPerLevel 26) cut down, matching how
  // `raised_bonewalker` and `bone_construct` sit under their summoners.
  cf_cinder_wisp: {
    id: 'cf_cinder_wisp',
    name: 'Cinder Wisp',
    minLevel: 20,
    maxLevel: 21,
    family: 'elemental',
    hpBase: 60,
    hpPerLevel: 20,
    dmgBase: 12,
    dmgPerLevel: 2.6,
    attackSpeed: 2.0,
    armorPerLevel: 14,
    moveSpeed: 8,
    aggroRadius: 10,
    loot: [], // summoned add - nothing to loot
    scale: 0.7,
    color: 0xe08a3c,
  },

  // Boss 1, the Forgehall. Anchor: `ch_gatewarden` (dungeons.ts, level 21,
  // hpBase 320, hpPerLevel 40, dmgBase 20, dmgPerLevel 3.8, attackSpeed 2.5,
  // armorPerLevel 36, moveSpeed 7, aggroRadius 16, cleave radius 8 mult 0.7,
  // copper 1200). The healing debuff is `naxx_deathguard`'s mortalStrike
  // (chance 0.35, healReduction 0.5, duration 10), zone4.ts. Copper sits
  // between ch_gatewarden (1200) and ch_ashmarshal (1700).
  cf_forgewarden_bexley: {
    id: 'cf_forgewarden_bexley',
    name: 'Forgewarden Bexley',
    minLevel: 21,
    maxLevel: 21,
    family: 'humanoid',
    elite: true,
    boss: true,
    ccImmune: true,
    hpBase: 320,
    hpPerLevel: 40,
    dmgBase: 20,
    dmgPerLevel: 3.8,
    attackSpeed: 2.4,
    armorPerLevel: 36,
    moveSpeed: 7,
    aggroRadius: 16,
    cleave: { radius: 8, mult: 0.7, name: 'Anvil Sweep' },
    mortalStrike: { chance: 0.35, healReduction: 0.5, duration: 10, name: 'Tempering Blow', school: 'physical' },
    loot: [
      { copper: 1400, chance: 1 },
      // The guaranteed-uncommon triplet pattern: one rollGroup summing to 1.00,
      // so every kill drops exactly one archetype piece (ch_gatewarden_set).
      { itemId: 'cf_ef_gloves', chance: 0.34, rollGroup: 'cf_bexley_set' },
      { itemId: 'cf_cs_gloves', chance: 0.33, rollGroup: 'cf_bexley_set' },
      { itemId: 'cf_ss_gloves', chance: 0.33, rollGroup: 'cf_bexley_set' },
    ],
    scale: 1.35,
    color: 0x9c5a2e,
  },

  // Boss 2, the Bellows Vault. Anchor: between `ch_gatewarden` (320/40) and
  // `ch_ashmarshal` (level 22, hpBase 360, hpPerLevel 44, dmgBase 23,
  // dmgPerLevel 4.1, armorPerLevel 40, copper 1700). The nova is
  // `ch_plaguewright`'s aoePulse verbatim (min 28, max 40, radius 11, every 9)
  // re-schooled to fire; the adds follow `ch_tollkeeper`'s summonAdds
  // (count 2, atHpPct 0.66 / 0.33).
  cf_slagheart: {
    id: 'cf_slagheart',
    name: 'The Slagheart',
    minLevel: 21,
    maxLevel: 21,
    family: 'elemental',
    elite: true,
    boss: true,
    ccImmune: true,
    hpBase: 340,
    hpPerLevel: 42,
    dmgBase: 21,
    dmgPerLevel: 3.9,
    attackSpeed: 2.5,
    armorPerLevel: 38,
    moveSpeed: 6.4,
    aggroRadius: 16,
    aoePulse: { min: 28, max: 40, radius: 11, every: 9, name: 'Bellows Blast', school: 'fire', fx: 'nova' },
    summonAdds: { mobId: 'cf_cinder_wisp', count: 2, atHpPct: [0.66, 0.33] },
    loot: [
      { copper: 1600, chance: 1 },
      { itemId: 'cf_ef_waist', chance: 0.34, rollGroup: 'cf_slagheart_set' },
      { itemId: 'cf_cs_waist', chance: 0.33, rollGroup: 'cf_slagheart_set' },
      { itemId: 'cf_ss_waist', chance: 0.33, rollGroup: 'cf_slagheart_set' },
    ],
    scale: 1.5,
    color: 0xd4551c,
  },

  // Final boss. Anchor: between `ch_ashmarshal` (level 22, 360/44, 23/4.1,
  // armorPerLevel 40, copper 1700) and `ch_veholt` (level 22, 520/64, 24/4.4,
  // attackSpeed 2.4, armorPerLevel 46, aggroRadius 18, copper 3000). Vharkul is
  // the deathlord's peer, not his better, so he sits under him on every line.
  // The enrage is ch_veholt's verbatim (belowHpPct 0.25, dmgMult 1.5,
  // hasteMult 1.3); the nova sits between ch_veholt's Hollow Reckoning
  // (34-50, radius 12, every 9) and ch_plaguewright's (28-40).
  cf_vharkul: {
    id: 'cf_vharkul',
    name: 'Vharkul the Unquenched',
    minLevel: 22,
    maxLevel: 22,
    family: 'demon',
    elite: true,
    boss: true,
    ccImmune: true,
    hpBase: 440,
    hpPerLevel: 52,
    dmgBase: 23,
    dmgPerLevel: 4.2,
    attackSpeed: 2.4,
    armorPerLevel: 42,
    moveSpeed: 7,
    aggroRadius: 18,
    aoePulse: { min: 32, max: 46, radius: 12, every: 9, name: 'Unquenched Roar', school: 'fire', fx: 'nova' },
    summonAdds: { mobId: 'cf_cinder_wisp', count: 3, atHpPct: [0.7, 0.4] },
    enrage: { belowHpPct: 0.25, dmgMult: 1.5, hasteMult: 1.3 },
    loot: [
      { copper: 2600, chance: 1 },
      { itemId: 'cf_ef_chest', chance: 0.34, rollGroup: 'cf_vharkul_set' },
      { itemId: 'cf_cs_chest', chance: 0.33, rollGroup: 'cf_vharkul_set' },
      { itemId: 'cf_ss_chest', chance: 0.33, rollGroup: 'cf_vharkul_set' },
      // Chase group. Anchor: `ch_veholt_chase`, three epics at 0.2 each.
      { itemId: 'cf_quenchless_cleaver', chance: 0.2, rollGroup: 'cf_vharkul_chase' },
      { itemId: 'cf_quenchless_brand', chance: 0.2, rollGroup: 'cf_vharkul_chase' },
      { itemId: 'cf_quenchless_fang', chance: 0.2, rollGroup: 'cf_vharkul_chase' },
      { itemId: 'cf_quenchless_ember', chance: 1, questId: 'q_cf_unquenched' },
    ],
    scale: 1.7,
    color: 0xb03018,
  },
};

// ---------------------------------------------------------------------------
// Spawns. Instance-local coordinates. Every |x| stays well inside
// DUNGEON_WALK_HALF_X (22), and the three chambers follow Gravewyrm Sanctum's
// pacing: trash packs spaced past social-aggro range, then two guards at z-2
// in front of each boss.
// ---------------------------------------------------------------------------

const CINDERFORGE_SPAWN_LIST: DungeonSpawn[] = [
  // Chamber 1, the Forgehall: the Covenant still at its anvils.
  { mobId: 'cf_covenant_smith', x: -6, z: 16 },
  { mobId: 'cf_covenant_smith', x: 6, z: 18 },
  { mobId: 'cf_emberling', x: -8, z: 30 },
  { mobId: 'cf_emberling', x: 8, z: 32 },
  { mobId: 'cf_ashbound_zealot', x: 0, z: 34 },
  { mobId: 'cf_covenant_smith', x: -5, z: 46 },
  { mobId: 'cf_slag_elemental', x: 5, z: 48 },
  { mobId: 'cf_ashbound_zealot', x: -7, z: 58 },
  { mobId: 'cf_covenant_smith', x: 7, z: 60 },
  // Guards at z-2, the Gravewyrm Sanctum pattern. Held to |x| <= 3 so they sit
  // in the middle of the chamber-waist passage and never clip its wall stub.
  { mobId: 'cf_covenant_smith', x: -3, z: 70 },
  { mobId: 'cf_covenant_smith', x: 3, z: 70 },
  { mobId: 'cf_forgewarden_bexley', x: 0, z: 72 },

  // Chamber 2, the Bellows Vault: where the heat stops being fire.
  { mobId: 'cf_slag_elemental', x: -6, z: 80 },
  { mobId: 'cf_emberling', x: 6, z: 82 },
  { mobId: 'cf_ashbound_zealot', x: 0, z: 94 },
  { mobId: 'cf_slag_elemental', x: -7, z: 96 },
  { mobId: 'cf_covenant_smith', x: 7, z: 98 },
  { mobId: 'cf_slag_elemental', x: -3, z: 112 },
  { mobId: 'cf_slag_elemental', x: 3, z: 112 },
  { mobId: 'cf_slagheart', x: 0, z: 114 },

  // Chamber 3, the Quenchless Hall: Vharkul's heat on the dais at z 146.
  { mobId: 'cf_emberling', x: -6, z: 124 },
  { mobId: 'cf_emberling', x: 6, z: 126 },
  { mobId: 'cf_ashbound_zealot', x: 0, z: 132 },
  { mobId: 'cf_emberling', x: -4, z: 144 },
  { mobId: 'cf_emberling', x: 4, z: 144 },
  { mobId: 'cf_vharkul', x: 0, z: 146 },
];

// ---------------------------------------------------------------------------
// The dungeon.
//
// WIRING NOTE (see the report): `index: 8` puts the instance origin at
// x = 900 + 8*600 = 5700, which `dungeonAt` currently rejects because
// ARENA_X_MIN is 5400. The wiring step must move the arena and delve bands out
// by 600 (ARENA_X 5400 -> 6000, DELVE_X_MIN 6000 -> 6600, and the matching pin
// in tests/delves.test.ts). Indices 0..7 are all taken (0 hollow_crypt,
// 1 sunken_bastion, 2 gravewyrm_sanctum, 3 drowned_temple, 4/5 nythraxis,
// 6 claudeholme, 7 claudexxaramas), so there is no free slot below the arena.
// ---------------------------------------------------------------------------

export const CINDERFORGE_DUNGEON_DEFS: Record<string, DungeonDef> = {
  cinderforge: {
    id: 'cinderforge',
    name: 'The Cinderforge',
    index: 8,
    doorPos: { x: 122, z: 1058 }, // the forge mouth in the east waste, clear of every zone4 camp and prop
    entry: { x: 0, z: 4 },
    exitOffset: { x: 0, z: -6 },
    spawns: CINDERFORGE_SPAWN_LIST,
    interior: 'sanctum',
    suggestedPlayers: 5,
    enterText: 'Heat rolls up the stair to meet you. Somewhere below, hammers are still falling.',
    leaveText: 'You climb out of the heat into the ashen wind.',
  },
};

// ---------------------------------------------------------------------------
// PROPOSED dedicated interior, for the wiring step only.
//
// The shipped def above uses `interior: 'sanctum'`, which needs no render or
// collider change at all. If the Cinderforge is later given its own look, this
// is the layout to move VERBATIM into `src/sim/dungeon_layout.ts` as
// CINDERFORGE_LAYOUT (plus 'cinderforge' on the DungeonDef.interior union in
// types.ts, an arm in render/dungeon.ts buildInterior, and an entry in
// INTERIOR_COLLIDERS in colliders.ts).
//
// It deliberately keeps SANCTUM_LAYOUT's shell (zMin -19, zMax 158, side wall
// slab, waists at z 67 and z 115, dais at z 146 r 11.5) so every spawn above
// stays valid and no mob has to move. Only the dressing differs: the pillar
// rows become forge columns bunched around each chamber's working floor, and
// the empty wall-side slots carry cooling troughs (`tombs`) the way the temple
// carries reliquary altars.
// ---------------------------------------------------------------------------

export const CINDERFORGE_LAYOUT: DungeonLayout = (() => {
  const pillars: { x: number; z: number }[] = [];
  // Forge columns, denser around the three working floors than the sanctum's
  // even 15u rhythm, so the fighting space reads as a hall of furnaces.
  for (const z of [12, 24, 42, 54, 84, 96, 126, 138]) {
    for (const x of [-14, 14]) pillars.push({ x, z });
  }
  const tombs: { x: number; z: number }[] = [];
  // Cooling troughs hugging the walls of the first two chambers only; the
  // Quenchless Hall is bare stone because nothing in it has ever cooled.
  for (const z of [20, 40, 60, 88, 108]) {
    tombs.push({ x: -19, z });
    tombs.push({ x: 19, z });
  }
  const stubs: { x: number; z: number; hw: number; hd: number }[] = [];
  for (const sx of [-14, 14]) {
    stubs.push({ x: sx, z: 67, hw: 9, hd: 5 }); // Forgehall -> Bellows Vault
    stubs.push({ x: sx, z: 115, hw: 9, hd: 3 }); // Bellows Vault -> Quenchless Hall
  }
  return {
    zMin: -19,
    zMax: 158,
    sideWallZ: 69.5,
    sideWallHd: 89,
    pillars,
    tombs,
    stubs,
    dais: { x: 0, z: 146, r: 11.5 },
  };
})();
