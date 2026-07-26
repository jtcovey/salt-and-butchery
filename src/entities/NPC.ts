import type { GameState } from '../types';
import type { Action } from '../actions/Action';
import { Character } from './Character';

export class NPC extends Character {
  strength: number;
  label: string;
  color: number;

  /** Key into ENEMY_TYPES. Lets systems ask what something *is* without string-matching names. */
  typeId: string;

  /**
   * Whether this one can be routed. Undead are 'steady' because the lore says
   * they have no mind to break; goblins are 'breaks'. See data/enemies.ts.
   */
  morale: 'breaks' | 'steady';

  /**
   * Turns left running away. While positive the AI flees the nearest party
   * member instead of fighting, decrementing each enemy phase.
   */
  fleeTurns = 0;

  /** Contributed to the engagement's XP pot on death. */
  xp: number;

  constructor(init: {
    id: string; name: string; hp: number; maxHp: number;
    ac: number; strength: number; x: number; y: number; radius: number;
    color: number; label?: string;
    typeId?: string; morale?: 'breaks' | 'steady'; xp?: number;
  }) {
    super(init);
    this.strength = init.strength;
    this.label = init.label ?? 'E';
    this.color = init.color;
    this.typeId = init.typeId ?? 'goblin_warrior';
    this.morale = init.morale ?? 'steady';
    this.xp = init.xp ?? 0;
  }

  availableActions(_gameState: GameState): Action[] {
    return [];
  }
}
