import type { ItemType } from '../types';
import type { PC } from './PC';

export class Item {
  readonly id:   string;
  readonly name: string;
  readonly type: ItemType;

  constructor(id: string, name: string, type: ItemType) {
    this.id   = id;
    this.name = name;
    this.type = type;
  }

  canEquip(_pc: PC): boolean { return true; }
}

export class WeaponItem extends Item {
  readonly weaponType: 'melee' | 'ranged';

  constructor(id: string, name: string, weaponType: 'melee' | 'ranged') {
    super(id, name, 'weapon');
    this.weaponType = weaponType;
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
  ) {
    super(id, name, 'armor');
    this.acBonus      = acBonus;
    this.requirements = requirements;
  }

  canEquip(pc: PC): boolean {
    return pc.skills.strength >= (this.requirements.strength ?? 0);
  }
}
