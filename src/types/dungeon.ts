import type { Vec2 } from './index';

/**
 * A multi-encounter level: one map, several fights, walking in between.
 *
 * Shaped so a generator emits it and CombatScene consumes it — the scene never
 * knows whether the layout was hand-authored or rolled. `terrainGrid`,
 * `partySpawn` and `enemies` are deliberately the same fields the existing
 * `levelData` path already takes, so a dungeon loads through the same code as a
 * random encounter; `rooms` and the `group` tag on each spawn are the only
 * additions.
 */

export interface DungeonEnemySpawn {
  type: string;
  x: number;
  y: number;
  /**
   * Which pack this one belongs to. Enemies sharing a group wake together, so a
   * group is exactly one engagement.
   */
  group: string;
}

/**
 * A named tile rect. Rooms exist for flavour text, not collision — walls are
 * terrain. `description` fires once, when the leader first steps inside.
 *
 * Combat rooms deliberately have no description: B's call, they'd interrupt the
 * approach right when the player is lining a fight up.
 */
export interface DungeonRoom {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  description?: string;
}

/**
 * A pack sealed behind a wall that breaks through mid-fight.
 *
 * The Goblin Slayer beat B asked for: you commit to the room in front of you
 * and they come through the stone behind you. Sealed means the group can never
 * be woken by proximity — rock blocks line of sight — and it stays hidden from
 * the renderer until it springs, so a fog-free map doesn't give it away.
 */
export interface DungeonAmbush {
  /** Group id of the hidden pack. */
  group: string;
  /** Springs during this group's engagement, not before. */
  triggerGroup: string;
  /** Turn of that engagement on which the wall comes down. */
  afterTurns: number;
  /** Wall tiles converted to floor when it springs. */
  wallTiles: Vec2[];
}

export interface DungeonLevel {
  id: string;
  name: string;
  terrainGrid: number[][];
  partySpawn: Vec2[];
  enemies: DungeonEnemySpawn[];
  rooms: DungeonRoom[];
  ambush?: DungeonAmbush;
}
