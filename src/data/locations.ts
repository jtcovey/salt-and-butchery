import { TILE_TRACKS, TILE_DESTROYED } from '../config/terrain';

/**
 * What a world map location *does*, keyed by the id the map editor derived from
 * its label. The editor only records identity — town / lost_caravan / goblin_nest
 * — and this table is where that becomes behaviour.
 *
 * Adding a location to a map is a data change; giving it behaviour is one row here.
 */
export interface LocationBehaviour {
  /** Encounter level launched when the party steps on this tile. */
  encounter?: string;
  /** Multi-encounter dungeon generated when the party steps on this tile. */
  dungeon?: string;
  /** Town map loaded when the party steps on this tile. */
  townMap?: string;
  /** Hidden from the map until this other location's encounter is won. */
  revealedBy?: string;
  /** Shown in the status line instead of the bare label. */
  blurb?: string;
}

export const LOCATION_BEHAVIOUR: Record<string, LocationBehaviour> = {
  town: {
    townMap: 'maps/town1.json',
    blurb: 'A town.',
  },
  lost_caravan: {
    encounter: 'levels/TestMap1.json',
    blurb: 'Wreckage on the road.',
  },
  goblin_nest: {
    revealedBy: 'lost_caravan',
    dungeon: 'goblin_nest',
    blurb: 'Something denned up in the rocks.',
  },
};

export function locationBehaviour(id: string): LocationBehaviour {
  return LOCATION_BEHAVIOUR[id] ?? {};
}

/**
 * Terrain that stays disguised until a location's encounter is won.
 *
 * The goblin tracks around the caravan read as plain ruined ground until the
 * party has actually found the wreck — then they resolve into a trail worth
 * following, and the nest they lead to appears.
 */
export interface TileReveal {
  tile: number;
  disguisedAs: number;
  revealedBy: string;
}

export const TILE_REVEALS: TileReveal[] = [
  { tile: TILE_TRACKS, disguisedAs: TILE_DESTROYED, revealedBy: 'lost_caravan' },
];
