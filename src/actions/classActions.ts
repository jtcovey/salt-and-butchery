import type { CharacterClass } from '../types';
import type { Action } from './Action';
import { RANGED_RANGE, MELEE_RANGE } from '../config/constants';

const ATTACK: Action = {
  id: 'attack', label: 'ATTACK', range: 'melee', target: 'enemy', staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const DEFEND: Action = {
  id: 'defend', label: 'DEFEND', range: 'self', target: 'self', staminaCost: 1,
  canUse(caster) {
    return !caster.hasActed && (caster.stamina ?? 0) >= 1;
  },
};

const FRENZY: Action = {
  id: 'frenzy', label: 'FRENZY', range: 'melee', target: 'cone', numericRange: MELEE_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const TRICK_SHOT: Action = {
  id: 'trick_shot', label: 'TRICK SHOT', range: 'ranged', target: 'enemy', numericRange: RANGED_RANGE, attacks: 2, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const CURSE: Action = {
  id: 'curse', label: 'CURSE', range: 'ranged', target: 'enemy', numericRange: RANGED_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.enemies.length > 0;
  },
};

const WARD: Action = {
  id: 'ward', label: 'WARD', range: 'self', target: 'self', staminaCost: 1,
  canUse(caster) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return (caster.wardStacks ?? 0) < 3;
  },
};

const HEAL: Action = {
  id: 'heal', label: 'HEAL', range: 'melee', target: 'ally', numericRange: MELEE_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.party.some(t => t !== caster && t.hp < t.maxHp);
  },
};

const BLESS: Action = {
  id: 'bless', label: 'BLESS', range: 'ranged', target: 'ally', numericRange: RANGED_RANGE, staminaCost: 1,
  canUse(caster, gameState) {
    if (caster.hasActed || (caster.stamina ?? 0) < 1) return false;
    return gameState.party.some(t => t !== caster && t.hp > 0);
  },
};

const CLASS_ACTIONS: Record<CharacterClass, Action[]> = {
  warrior:  [ATTACK, FRENZY, DEFEND],
  thief:    [ATTACK, TRICK_SHOT, DEFEND],
  sorcerer: [ATTACK, CURSE, WARD, DEFEND],
  cleric:   [ATTACK, HEAL, BLESS, DEFEND],
};

export function getActionsForClass(cls: CharacterClass): Action[] {
  return CLASS_ACTIONS[cls];
}
