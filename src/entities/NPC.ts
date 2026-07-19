import type { GameState } from '../types';
import type { Action } from '../actions/Action';
import { Character } from './Character';

export class NPC extends Character {
  strength: number;
  label:    string;

  constructor(init: {
    id: string; name: string; hp: number; maxHp: number;
    ac: number; strength: number; gridX: number; gridY: number;
    color: number; weaponDamage: number; label?: string;
  }) {
    super(init);
    this.strength = init.strength;
    this.label    = init.label ?? 'E';
  }

  availableActions(_gameState: GameState): Action[] {
    return [];
  }
}
