import { ArmorItem, WeaponItem } from '../entities/Item';

export const LEATHER_ARMOR = new ArmorItem('leather_armor', 'Leather Armor', 1);
export const MAIL_ARMOR    = new ArmorItem('mail_armor',    'Mail Armor',    2, { strength: 1 });

export const SWORD = new WeaponItem('sword', 'Sword', 'melee');
export const BOW   = new WeaponItem('bow',   'Bow',   'ranged');
