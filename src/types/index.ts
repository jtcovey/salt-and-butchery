export type CharacterClass = 'warrior' | 'thief' | 'sorcerer' | 'cleric';
export type StatusEffect = 'prone' | 'beaten' | 'burning' | 'frozen' | 'poisoned' | 'stunned' | 'defending' | 'blessed' | 'warded';
export type GamePhase = 'player' | 'enemy' | 'victory' | 'defeat';
export type ItemType = 'weapon' | 'armor' | 'consumable' | 'key';
export type BodyType = 1 | 2;

export interface Vec2 {
  x: number;
  y: number;
}

export interface CharacterSkills {
  strength: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
}

export interface Combatant {
  id: string;
  x: number;
  y: number;
  radius: number;
  facing: number;
  hp: number;
  maxHp: number;
  ac: number;
  weaponDamage: number;
  status: StatusEffect[];
  stamina?: number;
  maxStamina?: number;
  hasActed?: boolean;
  wardStacks?: number;
  inventory?: { equippedWeaponType(): 'melee' | 'ranged' | null };
}

export interface GameState {
  party: Combatant[];
  enemies: Combatant[];
  obstacles: Obstacle[];
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'pillar' | 'wall';
}

export interface EncounterData {
  id: string;
  name: string;
  enemies: EnemySpawn[];
  obstacles: ObstacleData[];
  arenaWidth: number;
  arenaHeight: number;
  partySpawn: Vec2[];
  victoryRoute: { map: string; position: Vec2 };
  defeatRoute: { scene: string };
}

export interface EnemySpawn {
  type: string;
  x: number;
  y: number;
  name?: string;
}

export interface ObstacleData {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'pillar' | 'wall';
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  nodes: MapNode[];
  connections: MapConnection[];
  partyStart: string;
}

export interface MapNode {
  id: string;
  x: number;
  y: number;
  type: 'empty' | 'encounter' | 'door' | 'rest' | 'shop';
  encounter?: string;
  targetMap?: string;
  label?: string;
}

export interface MapConnection {
  from: string;
  to: string;
}

export interface PartyMemberDef {
  name: string;
  charClass: CharacterClass;
  bodyType: BodyType;
}

export interface LayoutRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
