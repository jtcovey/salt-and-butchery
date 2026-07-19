import type { CharacterClass } from '../types';
import type { Action } from './Action';

export const CLASS_ACTIONS: Record<CharacterClass, Action[]> = {
  warrior:  [],
  thief:    [],
  sorcerer: [],
  cleric: [
    {
      id: 'heal', label: 'HEAL',
      canUse(caster, gameState) {
        if (caster.hasActed || (caster.stamina ?? 0) <= 0) return false;
        return gameState.party.some(t =>
          t !== caster && t.hp > 0 && !t.status.includes('beaten') && t.hp < t.maxHp &&
          Math.abs(t.gridX - caster.gridX) + Math.abs(t.gridY - caster.gridY) === 1
        );
      },
      execute() {},
    },
  ],
};
