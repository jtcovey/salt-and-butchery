export type CharacterClass = 'warrior' | 'thief' | 'sorcerer' | 'cleric';
export type StatusEffect   = 'prone' | 'beaten' | 'burning' | 'frozen' | 'poisoned' | 'stunned' | 'defending';
export type GamePhase      = 'player' | 'enemy' | 'victory' | 'defeat';
export type ItemType       = 'weapon' | 'armor' | 'consumable' | 'key';

export interface CharacterSkills {
  strength:     number;
  dexterity:    number;
  intelligence: number;
  wisdom:       number;
}


export interface Combatant {
  id:           string;
  gridX:        number;
  gridY:        number;
  hp:           number;
  maxHp:        number;
  ac:           number;
  weaponDamage: number;
  status:       StatusEffect[];
  stamina?:     number;
  hasActed?:    boolean;
}

export interface GameState {
  party:   Combatant[];
  enemies: Combatant[];
}
