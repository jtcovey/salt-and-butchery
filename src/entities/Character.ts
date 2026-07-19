import type { StatusEffect, Combatant, GameState } from '../types';
import type { Action } from '../actions/Action';
import { Inventory } from './Inventory';

export abstract class Character implements Combatant {
  id:           string;
  name:         string;
  hp:           number;
  maxHp:        number;
  ac:           number;
  gridX:        number;
  gridY:        number;
  color:        number;
  weaponDamage: number;
  status:       StatusEffect[] = [];
  dead                         = false;
  inventory                    = new Inventory();

  constructor(init: {
    id: string; name: string; hp: number; maxHp: number;
    ac: number; gridX: number; gridY: number;
    color: number; weaponDamage: number;
  }) {
    this.id           = init.id;
    this.name         = init.name;
    this.hp           = init.hp;
    this.maxHp        = init.maxHp;
    this.ac           = init.ac;
    this.gridX        = init.gridX;
    this.gridY        = init.gridY;
    this.color        = init.color;
    this.weaponDamage = init.weaponDamage;
  }

  effectiveAC(): number {
    return this.ac + this.inventory.acBonus();
  }

  abstract availableActions(gameState: GameState): Action[];
}
