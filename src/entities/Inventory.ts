import type { ItemType } from '../types';
import { Item, ArmorItem, WeaponItem } from './Item';

export class Inventory {
  items: Item[] = [];

  equippedWeapon(): WeaponItem | null {
    return this.items.find((i): i is WeaponItem => i instanceof WeaponItem) ?? null;
  }

  equippedArmor(): ArmorItem | null {
    return this.items.find((i): i is ArmorItem => i instanceof ArmorItem) ?? null;
  }

  equippedWeaponType(): 'melee' | 'ranged' | null {
    return this.equippedWeapon()?.weaponType ?? null;
  }

  acBonus(): number {
    return this.equippedArmor()?.acBonus ?? 0;
  }

  weaponDamage(): number {
    return this.equippedWeapon()?.damage ?? 1;
  }

  hasItem(type: ItemType): boolean {
    return this.items.some(i => i.type === type);
  }
}
