import { ALL_CLASSES, type ItemDef, type PlayerClass } from './types';

export type ArmorType = 'cloth' | 'leather' | 'mail';
type WeaponArchetype = 'warrior' | 'caster' | 'rogue';

const MAIL_CLASSES = new Set<PlayerClass>(['warrior', 'paladin', 'shaman']);
const LEATHER_CLASSES = new Set<PlayerClass>(['druid', 'rogue', 'hunter']);
const CLOTH_CLASSES = new Set<PlayerClass>(['mage', 'priest', 'warlock']);
const CASTER_ARCHETYPE_CLASSES = new Set<PlayerClass>(['mage', 'priest', 'warlock', 'druid']);
const WARRIOR_WEAPON_CLASSES = new Set<PlayerClass>(['warrior', 'rogue', 'hunter', 'shaman', 'paladin']);
const CASTER_WEAPON_CLASSES = new Set<PlayerClass>(['mage', 'priest', 'warlock', 'shaman', 'paladin', 'druid']);
const ROGUE_WEAPON_CLASSES = new Set<PlayerClass>(['rogue', 'hunter']);
const OLD_WARRIOR_WEAPON_ARCHETYPE = new Set<PlayerClass>(['warrior', 'paladin', 'shaman']);
const OLD_CASTER_WEAPON_ARCHETYPE = new Set<PlayerClass>(['mage', 'priest', 'warlock', 'druid']);

const ARMOR_RANK: Record<ArmorType, number> = {
  cloth: 0,
  leather: 1,
  mail: 2,
};

function subsetOf(classes: readonly PlayerClass[], allowed: ReadonlySet<PlayerClass>): boolean {
  return classes.length > 0 && classes.every((cls) => allowed.has(cls));
}

export function armorTypeForItem(item: ItemDef): ArmorType | null {
  if (item.kind !== 'armor') return null;
  if (item.armorType) return item.armorType;
  if (!item.requiredClass) return null;
  if (subsetOf(item.requiredClass, MAIL_CLASSES)) return 'mail';
  if (subsetOf(item.requiredClass, LEATHER_CLASSES)) return 'leather';
  if (subsetOf(item.requiredClass, CLOTH_CLASSES) || subsetOf(item.requiredClass, CASTER_ARCHETYPE_CLASSES)) return 'cloth';
  return null;
}

export function maxArmorTypeForClass(cls: PlayerClass): ArmorType {
  if (MAIL_CLASSES.has(cls)) return 'mail';
  if (LEATHER_CLASSES.has(cls)) return 'leather';
  return 'cloth';
}

export function weaponArchetypeForItem(item: ItemDef): WeaponArchetype | null {
  if (item.kind !== 'weapon' || !item.requiredClass) return null;
  if (subsetOf(item.requiredClass, OLD_WARRIOR_WEAPON_ARCHETYPE)) return 'warrior';
  if (subsetOf(item.requiredClass, OLD_CASTER_WEAPON_ARCHETYPE)) return 'caster';
  if (subsetOf(item.requiredClass, ROGUE_WEAPON_CLASSES)) return 'rogue';
  return null;
}

// The full set of classes `canEquipItem` actually admits for a given armor weight,
// i.e. every class whose max armor rank is at least `armorType`'s rank. Used to tell
// a genuinely enforced armor class list (one that names exactly this set, e.g. mail
// naming only warrior/paladin/shaman) apart from `requiredClass` values that are
// narrower loot-targeting metadata `canEquipItem` never reads (armor short-circuits
// on weight before it would reach `requiredClass`).
export function classesThatCanEquipArmorType(armorType: ArmorType): PlayerClass[] {
  const rank = ARMOR_RANK[armorType];
  return ALL_CLASSES.filter((cls) => ARMOR_RANK[maxArmorTypeForClass(cls)] >= rank);
}

export function canEquipItem(cls: PlayerClass, item: ItemDef): boolean {
  const armorType = armorTypeForItem(item);
  if (armorType) return ARMOR_RANK[armorType] <= ARMOR_RANK[maxArmorTypeForClass(cls)];
  const weaponArchetype = weaponArchetypeForItem(item);
  if (weaponArchetype === 'warrior') return WARRIOR_WEAPON_CLASSES.has(cls);
  if (weaponArchetype === 'caster') return CASTER_WEAPON_CLASSES.has(cls);
  if (weaponArchetype === 'rogue') return ROGUE_WEAPON_CLASSES.has(cls);
  if (item.requiredClass) return item.requiredClass.includes(cls);
  return true;
}

// Every class `canEquipItem` actually admits for this item, in canonical class
// order. Derived from `canEquipItem` itself rather than re-deriving the rule, so a
// caller can never drift out of sync with what is really enforced: the archetype
// DETECTION sets above (OLD_*) are deliberately narrower than the PROFICIENCY sets
// canEquipItem enforces, so an item's `requiredClass` is not usable as a stand-in
// for the admitted set.
export function classesThatCanEquipItem(item: ItemDef): PlayerClass[] {
  return ALL_CLASSES.filter((cls) => canEquipItem(cls, item));
}
