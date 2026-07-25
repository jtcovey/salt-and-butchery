import type { CharacterClass } from '../types';
import { ArmorItem, WeaponItem } from '../entities/Item';

export const LEATHER_ARMOR = new ArmorItem('leather_armor', 'Leather Armor', 1);
export const MAIL_ARMOR    = new ArmorItem('mail_armor',    'Mail Armor',    2, { strength: 1 });

export const SWORD = new WeaponItem('sword', 'Sword', 'melee');
export const BOW   = new WeaponItem('bow',   'Bow',   'ranged');

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
