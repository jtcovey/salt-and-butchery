// Terrain tile definitions — the single source of truth for tile behaviour.
//
// Tile ids are a contract with the map editor (tools/map-editor.html) and with
// every level JSON in public/levels/. Ids 0 and 1 must never change; existing
// level files depend on them. Add new tiles by appending a row to TILE_PROPS.

export const TILE_GRASS = 0;
export const TILE_ROCK = 1;
export const TILE_FOREST = 2;
export const TILE_ROAD = 3;
export const TILE_DESTROYED = 4;
export const TILE_TRACKS = 5;

export interface TileProps {
  name: string;
  /** Fill colour used by TerrainRenderer. */
  color: number;
  /** Can units walk over this tile? */
  passable: boolean;
  /** Does this tile block physical ranged attacks? Magic ignores LOS. */
  blocksLOS: boolean;
}

export const TILE_PROPS: Record<number, TileProps> = {
  [TILE_GRASS]:     { name: 'Grass',         color: 0x2a5a2a, passable: true,  blocksLOS: false },
  [TILE_ROCK]:      { name: 'Rock',          color: 0x4a4a4a, passable: false, blocksLOS: true },
  [TILE_FOREST]:    { name: 'Forest',        color: 0x14301a, passable: true,  blocksLOS: true },
  [TILE_ROAD]:      { name: 'Road',          color: 0x6e6a5e, passable: true,  blocksLOS: false },
  [TILE_DESTROYED]: { name: 'Destroyed',     color: 0x9c8b6b, passable: true,  blocksLOS: false },
  [TILE_TRACKS]:    { name: 'Goblin Tracks', color: 0x5a4732, passable: true,  blocksLOS: false },
};

/** Unknown tile ids fall back to grass so a bad level file degrades gracefully. */
export function tileProps(id: number): TileProps {
  return TILE_PROPS[id] ?? TILE_PROPS[TILE_GRASS];
}

export function isTileIdPassable(id: number): boolean {
  return tileProps(id).passable;
}

export function doesTileIdBlockLOS(id: number): boolean {
  return tileProps(id).blocksLOS;
}
