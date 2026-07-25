import type { CharacterClass, CharacterSkills, GameState, BodyType } from '../types';
import type { Action } from '../actions/Action';
import type { Appearance } from '../config/appearance';
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
  /** UI tint — party bar, inventory header. Mirrors `primaryColor`. */
  color: number;

  // Appearance. Drives the composited sprite; see render/CharacterSprites.ts.
  bodyType: BodyType;
  skinColor: number;
  primaryColor: number;
  secondaryColor: number;

  constructor(init: {
    id: string; name: string; charClass: CharacterClass; level: number;
    hp: number; maxHp: number; ac: number;
    stamina: number; maxStamina: number; skills: CharacterSkills;
    x: number; y: number; radius: number;
    color: number;
    // Optional so existing construction sites (default party, tests) still compile.
    bodyType?: BodyType;
    skinColor?: number;
    primaryColor?: number;
    secondaryColor?: number;
  }) {
    super(init);
    this.charClass = init.charClass;
    this.level = init.level;
    this.stamina = init.stamina;
    this.maxStamina = init.maxStamina;
    this.skills = init.skills;
    this.color = init.color;

    this.bodyType = init.bodyType ?? 1;
    this.skinColor = init.skinColor ?? 0xe0b48c;
    this.primaryColor = init.primaryColor ?? init.color;
    this.secondaryColor = init.secondaryColor ?? 0x40444c;
  }

  get appearance(): Appearance {
    return {
      bodyType: this.bodyType,
      skin: this.skinColor,
      primary: this.primaryColor,
      secondary: this.secondaryColor,
    };
  }

  availableActions(_gameState: GameState): Action[] {
    return getActionsForClass(this.charClass);
  }
}
