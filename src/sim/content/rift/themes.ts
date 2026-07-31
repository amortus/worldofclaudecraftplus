// The eight rift environment themes. Each pairs one of our EXISTING authored
// interior kits with a generated colour grade and a mob roster, so a rift needs
// no new art: that is the whole reason rifts are affordable content.
//
// Data-as-code: no logic here. Colour fields are 0xRRGGBB.
//
// LANGUAGE-AGNOSTIC. `src/sim/` never carries player prose, so a theme exposes
// stable IDs (`nameId`, `nounIds`) and the client resolves them. The English
// each id should render as is listed in src/sim/rift/CLAUDE.md, which is what
// the UI wave registers.

import { RIFT_ADD_IDS, RIFT_BOSS_IDS, RIFT_TRASH_IDS } from './mobs';

/** The optional mechanic keys a rift boss can drive, in the order the rank
 * budget spends them (C shows the first one, S the first four). Keys map 1:1 to
 * `MobTemplate` mechanic blocks that this sim already implements. */
export type RiftBossMechanicKey = 'aoePulse' | 'summonAdds' | 'enrage' | 'desperateHeal';

export interface RiftTheme {
  id: string;
  /** Stable id for the short environment label, e.g. "Frostbound". */
  nameId: string;
  /** Stable ids for the proper-noun fragments the rift name is assembled from. */
  nounIds: readonly string[];
  /** Which authored interior kit the renderer dresses this floor with. */
  kit: 'crypt' | 'sanctum' | 'temple';
  torch: { flame: number; emissive: number; light: number };
  fog: { color: number; near: number; far: number };
  wallTint: number;
  floorTint: number;
  /** Trash template ids this theme draws its packs from (content/rift/mobs.ts). */
  trash: readonly string[];
  /** Boss template id for a boss floor rolled with this theme. */
  boss: string;
  /** Rank-budget order for this boss's optional mechanics. Only keys the
   * template actually carries are listed. */
  bossMechanics: readonly RiftBossMechanicKey[];
}

export const RIFT_THEMES: readonly RiftTheme[] = [
  {
    id: 'frost',
    nameId: 'rift.theme.frost',
    nounIds: ['rift.noun.rime', 'rift.noun.hoarfrost', 'rift.noun.glacier', 'rift.noun.frost'],
    kit: 'crypt',
    torch: { flame: 0x9fd8ff, emissive: 0x4aa8ff, light: 0x8fd0ff },
    fog: { color: 0x0a1420, near: 16, far: 88 },
    wallTint: 0x9fc4e6,
    floorTint: 0xb0cfe6,
    trash: ['rift_frost_revenant', 'rift_rime_elemental'],
    boss: 'rift_boss_frost',
    bossMechanics: ['aoePulse', 'enrage'],
  },
  {
    id: 'ember',
    nameId: 'rift.theme.ember',
    nounIds: ['rift.noun.ember', 'rift.noun.cinder', 'rift.noun.magma', 'rift.noun.ash'],
    kit: 'sanctum',
    torch: { flame: 0xffb24a, emissive: 0xff5a1a, light: 0xff8a3a },
    fog: { color: 0x1a0a06, near: 14, far: 80 },
    wallTint: 0xd98a6a,
    floorTint: 0xc26a4a,
    trash: ['rift_ember_fiend', 'rift_magma_brute'],
    boss: 'rift_boss_ember',
    bossMechanics: ['aoePulse', 'summonAdds', 'enrage'],
  },
  {
    id: 'venom',
    nameId: 'rift.theme.venom',
    nounIds: ['rift.noun.venom', 'rift.noun.thorn', 'rift.noun.bramble', 'rift.noun.spider'],
    kit: 'temple',
    torch: { flame: 0xc9ff8a, emissive: 0x6fbf2a, light: 0xa6e85a },
    fog: { color: 0x0a1608, near: 14, far: 78 },
    wallTint: 0x8fae6a,
    floorTint: 0x7a9a55,
    trash: ['rift_venom_weaver', 'rift_thornback'],
    boss: 'rift_boss_venom',
    bossMechanics: ['aoePulse', 'summonAdds'],
  },
  {
    id: 'bone',
    nameId: 'rift.theme.bone',
    nounIds: ['rift.noun.bone', 'rift.noun.marrow', 'rift.noun.ossuary', 'rift.noun.grave'],
    kit: 'crypt',
    torch: { flame: 0xe8e0c8, emissive: 0xbfa870, light: 0xd8c8a0 },
    fog: { color: 0x0d0c0a, near: 18, far: 84 },
    wallTint: 0xd8cfb0,
    floorTint: 0xc8bfa0,
    trash: ['rift_boneclad', 'rift_marrow_troll'],
    boss: 'rift_boss_necro',
    bossMechanics: ['summonAdds', 'desperateHeal'],
  },
  {
    id: 'brute',
    nameId: 'rift.theme.brute',
    nounIds: ['rift.noun.war', 'rift.noun.skull', 'rift.noun.iron', 'rift.noun.blood'],
    kit: 'sanctum',
    torch: { flame: 0xffc46a, emissive: 0xd97a2a, light: 0xe89a4a },
    fog: { color: 0x120d08, near: 16, far: 82 },
    wallTint: 0xc0a878,
    floorTint: 0xb09868,
    trash: ['rift_stone_ogre', 'rift_iron_reaver'],
    boss: 'rift_boss_brute',
    bossMechanics: ['aoePulse', 'enrage'],
  },
  {
    id: 'void',
    nameId: 'rift.theme.void',
    nounIds: ['rift.noun.void', 'rift.noun.shadow', 'rift.noun.umbral', 'rift.noun.dusk'],
    kit: 'sanctum',
    torch: { flame: 0xc98aff, emissive: 0x7a2aff, light: 0xa65aff },
    fog: { color: 0x0a0612, near: 15, far: 80 },
    wallTint: 0x9a7ac0,
    floorTint: 0x8a6ab0,
    trash: ['rift_void_acolyte', 'rift_dread_stalker'],
    boss: 'rift_boss_arcane',
    bossMechanics: ['aoePulse', 'summonAdds'],
  },
  {
    id: 'storm',
    nameId: 'rift.theme.storm',
    nounIds: ['rift.noun.storm', 'rift.noun.tempest', 'rift.noun.thunder', 'rift.noun.gale'],
    kit: 'crypt',
    torch: { flame: 0x8af0ff, emissive: 0x2a9aff, light: 0x5abfff },
    fog: { color: 0x081018, near: 16, far: 86 },
    wallTint: 0x7aa8d8,
    floorTint: 0x6a98c8,
    trash: ['rift_storm_caller', 'rift_stormscale'],
    boss: 'rift_boss_storm',
    bossMechanics: ['aoePulse', 'enrage'],
  },
  {
    id: 'tide',
    nameId: 'rift.theme.tide',
    nounIds: ['rift.noun.sunken', 'rift.noun.abyssal', 'rift.noun.drowned', 'rift.noun.tide'],
    kit: 'temple',
    torch: { flame: 0x8afff0, emissive: 0x2ad9c0, light: 0x5ae8d0 },
    fog: { color: 0x06141a, near: 12, far: 76 },
    wallTint: 0x6aae9e,
    floorTint: 0x5a9e8e,
    trash: ['rift_tide_thrall', 'rift_deep_lurker'],
    boss: 'rift_boss_tide',
    bossMechanics: ['aoePulse', 'summonAdds', 'desperateHeal'],
  },
];

/** Stable ids for the proper-noun suffix half of a rift's name. */
export const RIFT_SUFFIX_IDS: readonly string[] = [
  'rift.suffix.abyss',
  'rift.suffix.depths',
  'rift.suffix.descent',
  'rift.suffix.hollow',
  'rift.suffix.labyrinth',
  'rift.suffix.warren',
  'rift.suffix.sanctum',
  'rift.suffix.rift',
];

export const RIFT_THEME_BY_ID: Record<string, RiftTheme> = Object.fromEntries(
  RIFT_THEMES.map((t) => [t.id, t]),
);

// Import-time content guards. Every theme must reference templates that exist,
// or a floor would spawn nothing and the run could not be completed. Ids are
// matched by string at runtime with no compile check (content/CLAUDE.md), so
// this is the check.
{
  const trashOk = new Set(RIFT_TRASH_IDS);
  const bossOk = new Set(RIFT_BOSS_IDS);
  const addOk = new Set(RIFT_ADD_IDS);
  for (const theme of RIFT_THEMES) {
    if (theme.trash.length < 2) throw new Error(`rift theme ${theme.id}: needs 2+ trash ids`);
    for (const id of theme.trash) {
      if (!trashOk.has(id)) throw new Error(`rift theme ${theme.id}: unknown trash id ${id}`);
      if (addOk.has(id)) throw new Error(`rift theme ${theme.id}: ${id} is a summoned add`);
    }
    if (!bossOk.has(theme.boss)) throw new Error(`rift theme ${theme.id}: unknown boss ${theme.boss}`);
    if (theme.bossMechanics.length === 0)
      throw new Error(`rift theme ${theme.id}: boss has no mechanic order`);
  }
}
