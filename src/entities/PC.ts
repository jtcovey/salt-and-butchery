import type { CharacterClass, CharacterSkills, GameState } from '../types';
import type { Action } from '../actions/Action';
import { CLASS_ACTIONS } from '../actions/classActions';
import { Character } from './Character';

const BASE_ACTIONS: Action[] = [
  {
    id:    'attack',
    label: 'ATTACK',
    canUse(caster, gameState) {
      const pc = caster as PC;
      if (pc.hasActed || pc.stamina <= 0) return false;
      const wt = pc.inventory.equippedWeaponType();
      if (!wt) return false;
      if (wt === 'ranged') return gameState.enemies.length > 0;
      return gameState.enemies.some(e =>
        Math.abs(e.gridX - pc.gridX) + Math.abs(e.gridY - pc.gridY) === 1
      );
    },
    execute() {},
  },
  {
    id:    'defend',
    label: 'DEFEND',
    canUse(caster) {
      const pc = caster as PC;
      return !pc.hasActed && pc.stamina > 0;
    },
    execute() {},
  },
];

export class PC extends Character {
  charClass:         CharacterClass;
  level:             number;
  stamina:           number;
  maxStamina:        number;
  skills:            CharacterSkills;
  movesUsedThisTurn  = 0;
  hasActed           = false;
  turnDone           = false;

  constructor(init: {
    id: string; name: string; charClass: CharacterClass; level: number;
    hp: number; maxHp: number; ac: number;
    stamina: number; maxStamina: number; skills: CharacterSkills;
    gridX: number; gridY: number; color: number; weaponDamage: number;
  }) {
    super(init);
    this.charClass  = init.charClass;
    this.level      = init.level;
    this.stamina    = init.stamina;
    this.maxStamina = init.maxStamina;
    this.skills     = init.skills;
  }

  availableActions(_gameState: GameState): Action[] {
    return [...BASE_ACTIONS, ...CLASS_ACTIONS[this.charClass]];
  }
}
