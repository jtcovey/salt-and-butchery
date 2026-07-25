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
  formatVersion?: number;
  id: string;
  name: string;
  enemies: EnemySpawn[];
  obstacles: ObstacleData[];
  arenaWidth: number;
  arenaHeight: number;
  tileSize?: number;
  terrainGrid?: number[][];
  partySpawn: Vec2[];
  victoryRoute?: { map: string; position: Vec2 };
  defeatRoute?: { scene: string };
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

/**
 * Where an encounter sends the party when it ends. Defaults to the world map
 * tile that triggered it; set explicitly to send them somewhere else — a
 * different map, a fixed tile, or another scene entirely.
 */
export interface CombatReturn {
  scene: string;
  mapFile?: string;
  tile?: Vec2;
}

/** World map destinations, plus the NPC roles a town map places. */
export type WorldLocationKind =
  | 'town' | 'encounter' | 'dungeon' | 'shop' | 'rest'
  | 'vendor' | 'inn' | 'quest' | 'dialog' | 'exit';

/** A travel destination on the overworld. Written by the map editor's World Map mode. */
export interface WorldLocation {
  /** Routing key the game keys behaviour off. Derived from the label by the editor. */
  id: string;
  label: string;
  kind: WorldLocationKind;
  /** Tile centre, world units. */
  x: number;
  y: number;
}

/**
 * An overworld map — same tile grid as an encounter, but the party is a single
 * token and the markers are places to travel to rather than combatants.
 * Identified by `kind: 'worldmap'`.
 */
export interface WorldMapData {
  formatVersion?: number;
  /** Towns are structurally identical to world maps — smaller, with NPC markers. */
  kind: 'worldmap' | 'town';
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize?: number;
  terrainGrid: number[][];
  partyStart: Vec2 | null;
  locations: WorldLocation[];
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
