import type { Combatant, GameState } from '../types';

export interface Action {
  id:    string;
  label: string;
  canUse(caster: Combatant, gameState: GameState): boolean;
  execute(caster: Combatant, target: Combatant | null, gameState: GameState): void;
}
