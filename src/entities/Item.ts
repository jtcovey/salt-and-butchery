import type { ItemType } from '../types';
import type { PC } from './PC';

export class Item {
  readonly id:   string;
  readonly name: string;
  readonly type: ItemType;
  /**
   * Shop price in gold, straight from the design doc's Equipment section.
   * 0 means "not for sale" — quest items and starting gear that has no listed
   * price. The doc also quotes a few things in silver (Oilpot 25s, Lantern 50s)
   * but never states a gold conversion, so those are deliberately not stocked
   * yet rather than priced on an invented rate.
   */
  readonly price: number;

  constructor(id: string, name: string, type: ItemType, price = 0) {
    this.id    = id;
    this.name  = name;
    this.type  = type;
    this.price = price;
  }

  canEquip(_pc: PC): boolean { return true; }

  /** One-line shop/inventory description. Subclasses say what they do. */
  describe(): string { return ''; }
}

export class WeaponItem extends Item {
  readonly weaponType: 'melee' | 'ranged';
  readonly damage: number;
  /** Doc: two-handed weapons need 3 Strength to wield one-handed. */
  readonly requirements: { strength?: number; dexterity?: number };
  readonly twoHanded: boolean;

  constructor(
    id: string,
    name: string,
    weaponType: 'melee' | 'ranged',
    damage = 1,
    price = 0,
    opts: { twoHanded?: boolean; requirements?: { strength?: number; dexterity?: number } } = {},
  ) {
    super(id, name, 'weapon', price);
    this.weaponType   = weaponType;
    this.damage       = damage;
    this.twoHanded    = opts.twoHanded ?? false;
    this.requirements = opts.requirements ?? {};
  }

  canEquip(pc: PC): boolean {
    const req = this.requirements;
    // Doc phrases some as "either 2 strength OR 3 dexterity" — hence the OR.
    if (req.strength !== undefined && req.dexterity !== undefined) {
      return pc.skills.strength >= req.strength || pc.skills.dexterity >= req.dexterity;
    }
    if (req.strength !== undefined)  return pc.skills.strength >= req.strength;
    if (req.dexterity !== undefined) return pc.skills.dexterity >= req.dexterity;
    return true;
  }

  describe(): string {
    const bits = [`${this.damage} dmg`, this.weaponType];
    if (this.twoHanded) bits.push('two-handed');
    return bits.join(', ');
  }
}

export class ArmorItem extends Item {
  readonly acBonus:      number;
  readonly requirements: { strength?: number };

  constructor(
    id:           string,
    name:         string,
    acBonus:      number,
    requirements: { strength?: number } = {},
    price = 0,
  ) {
    super(id, name, 'armor', price);
    this.acBonus      = acBonus;
    this.requirements = requirements;
  }

  canEquip(pc: PC): boolean {
    return pc.skills.strength >= (this.requirements.strength ?? 0);
  }

  describe(): string {
    const str = this.requirements.strength;
    return `+${this.acBonus} AC` + (str ? `, needs ${str} Str` : '');
  }
}
