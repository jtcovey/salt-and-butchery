import type { ItemType } from '../types';
import { Item, ArmorItem, WeaponItem } from './Item';

/**
 * The equipped item is the FIRST of its kind in `items` — no separate slot.
 * That was already the rule before the shop existed; `equip()` simply makes it
 * an operation you can name instead of an accident of insertion order.
 */
export class Inventory {
  items: Item[] = [];

  equippedWeapon(): WeaponItem | null {
    return this.items.find((i): i is WeaponItem => i instanceof WeaponItem) ?? null;
  }

  equippedArmor(): ArmorItem | null {
    return this.items.find((i): i is ArmorItem => i instanceof ArmorItem) ?? null;
  }

  add(item: Item): void {
    this.items.push(item);
  }

  /** Move `item` to the front so it becomes the equipped one of its type. */
  equip(item: Item): void {
    const at = this.items.indexOf(item);
    if (at > 0) this.items.splice(at, 1);
    if (at !== 0) this.items.unshift(item);
  }

  /** Buying a replacement should swap, not hoard. Returns what came off. */
  replaceEquipped(item: Item): Item | null {
    const old = item instanceof WeaponItem ? this.equippedWeapon()
              : item instanceof ArmorItem  ? this.equippedArmor()
              : null;
    if (old) this.items.splice(this.items.indexOf(old), 1);
    this.items.unshift(item);
    return old;
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
