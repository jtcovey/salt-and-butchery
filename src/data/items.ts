import type { CharacterClass } from '../types';
import { ArmorItem, WeaponItem, Item } from '../entities/Item';

/**
 * Prices and stats transcribed from the Equipment section of
 * `GDproj/Salt & Butchery.md`. Do not invent numbers here — if something needs
 * a price the doc doesn't give, add it to the doc first.
 *
 * Known gap: the doc quotes Oilpot at 25 silver and Lantern at 50 silver, but
 * never states a silver-to-gold rate. Those two are therefore NOT stocked, on
 * purpose — a made-up conversion would be a guess wearing a price tag.
 */

// ── Armour ────────────────────────────────────────────────────────────────
export const LEATHER_ARMOR = new ArmorItem('leather_armor', 'Leather Armor', 1, {},              1);
export const MAIL_ARMOR    = new ArmorItem('mail_armor',    'Mail Armor',    2, { strength: 1 }, 10);
export const PLATE_ARMOR   = new ArmorItem('plate_armor',   'Plate Armor',   3, { strength: 2 }, 50);

// ── Melee ─────────────────────────────────────────────────────────────────
export const SWORD      = new WeaponItem('sword',      'Sword',      'melee', 1, 2);
export const GREATSWORD = new WeaponItem('greatsword', 'Greatsword', 'melee', 2, 5,
  { twoHanded: true });
export const SPEAR      = new WeaponItem('spear',      'Spear',      'melee', 1, 2,
  { twoHanded: true });

// ── Ranged ────────────────────────────────────────────────────────────────
export const BOW      = new WeaponItem('bow',      'Bow',      'ranged', 1, 1,
  { twoHanded: true });
export const GREATBOW = new WeaponItem('greatbow', 'Greatbow', 'ranged', 2, 2,
  { twoHanded: true, requirements: { strength: 2, dexterity: 3 } });
export const CROSSBOW = new WeaponItem('crossbow', 'Crossbow', 'ranged', 2, 10,
  { twoHanded: true });

// ── Consumables ───────────────────────────────────────────────────────────
export const ANTIVENOM = new Item('antivenom', 'Antivenom', 'consumable', 1);
export const FIRESTICK = new Item('firestick', 'Firestick', 'consumable', 2);
export const FIRE_POT  = new Item('fire_pot',  'Fire Pot',  'consumable', 8);
export const GLOWSTONE = new Item('glowstone', 'Glowstone', 'consumable', 5);

/** What the town vendor keeps behind the counter. Ordered cheapest first. */
export const SHOP_STOCK: Item[] = [
  LEATHER_ARMOR, BOW, SWORD, SPEAR, ANTIVENOM, FIRESTICK, GREATBOW,
  GREATSWORD, GLOWSTONE, FIRE_POT, MAIL_ARMOR, CROSSBOW, PLATE_ARMOR,
];

/**
 * Every item the game knows about, for resolving ids on save load.
 * Anything craftable/lootable that isn't sold still belongs here.
 */
export const ALL_ITEMS: Item[] = [...SHOP_STOCK];

/**
 * What a class starts the game holding.
 *
 * Single source of truth: party creation equips from this, and its sprite
 * preview reads from it too — otherwise the preview could show armour the
 * character doesn't actually get.
 */
export function startingGear(charClass: CharacterClass): { weapon: WeaponItem; armor: ArmorItem } {
  if (charClass === 'thief')   return { weapon: BOW,   armor: LEATHER_ARMOR };
  if (charClass === 'warrior') return { weapon: SWORD, armor: MAIL_ARMOR };
  return { weapon: SWORD, armor: LEATHER_ARMOR };
}
