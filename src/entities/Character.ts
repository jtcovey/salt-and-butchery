import type { StatusEffect, Combatant, GameState } from '../types';
import type { Action } from '../actions/Action';
import { Inventory } from './Inventory';

export abstract class Character implements Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  x: number;
  y: number;
  radius: number;
  facing: number;
  weaponDamage: number;
  status: StatusEffect[] = [];
  dead = false;
  wardStacks = 0;
  inventory = new Inventory();

  constructor(init: {
    id: string; name: string; hp: number; maxHp: number;
    ac: number; x: number; y: number; radius: number;
    weaponDamage: number; facing?: number;
  }) {
    this.id = init.id;
    this.name = init.name;
    this.hp = init.hp;
    this.maxHp = init.maxHp;
    this.ac = init.ac;
    this.x = init.x;
    this.y = init.y;
    this.radius = init.radius;
    this.weaponDamage = init.weaponDamage;
    this.facing = init.facing ?? 0;
  }

  effectiveAC(): number {
    let ac = this.ac + this.inventory.acBonus();
    if (this.status.includes('defending')) ac += 1;
    if (this.status.includes('prone')) ac -= 2;
    return ac;
  }

  abstract availableActions(gameState: GameState): Action[];
}
