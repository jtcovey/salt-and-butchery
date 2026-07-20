import type { Combatant, GameState } from '../types';

export interface Action {
  id: string;
  label: string;
  range: 'melee' | 'ranged' | 'self';
  numericRange?: number;
  target: 'enemy' | 'ally' | 'self' | 'area' | 'cone';
  attacks?: number;
  staminaCost: number;
  canUse(caster: Combatant, gameState: GameState): boolean;
}
