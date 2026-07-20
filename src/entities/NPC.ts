import type { GameState } from '../types';
import type { Action } from '../actions/Action';
import { Character } from './Character';

export class NPC extends Character {
  strength: number;
  label: string;
  color: number;

  constructor(init: {
    id: string; name: string; hp: number; maxHp: number;
    ac: number; strength: number; x: number; y: number; radius: number;
    color: number; label?: string;
  }) {
    super(init);
    this.strength = init.strength;
    this.label = init.label ?? 'E';
    this.color = init.color;
  }

  availableActions(_gameState: GameState): Action[] {
    return [];
  }
}
