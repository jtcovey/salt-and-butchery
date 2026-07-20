import type { CharacterClass, CharacterSkills, GameState } from '../types';
import type { Action } from '../actions/Action';
import { getActionsForClass } from '../actions/classActions';
import { Character } from './Character';

export class PC extends Character {
  charClass: CharacterClass;
  level: number;
  stamina: number;
  maxStamina: number;
  skills: CharacterSkills;
  movesUsedThisTurn = 0;
  staminaMovesThisTurn = 0;
  maxStaminaMoves = 1;
  hasActed = false;
  turnDone = false;
  color: number;

  constructor(init: {
    id: string; name: string; charClass: CharacterClass; level: number;
    hp: number; maxHp: number; ac: number;
    stamina: number; maxStamina: number; skills: CharacterSkills;
    x: number; y: number; radius: number;
    color: number;
  }) {
    super(init);
    this.charClass = init.charClass;
    this.level = init.level;
    this.stamina = init.stamina;
    this.maxStamina = init.maxStamina;
    this.skills = init.skills;
    this.color = init.color;
  }

  availableActions(_gameState: GameState): Action[] {
    return getActionsForClass(this.charClass);
  }
}
