import type { Vec2 } from '../types';
import type { DungeonLevel, DungeonEnemySpawn, DungeonRoom } from '../types/dungeon';
import { TILE_ROCK, TILE_TRACKS, TILE_DESTROYED } from '../config/terrain';
import { UNIT_RADIUS } from '../config/constants';

/**
 * The Goblin Nest.
 *
 * Structure is fixed, per B's spec — entrance, tunnel east, two south branches,
 * boss room — with exactly one roll: which branch holds the barracks and which
 * holds the garbage. That's deliberately not a Diablo-style generator yet.
 *
 * What matters here is the SHAPE of the output, not the randomness. This emits
 * a room graph carved into a grid; a real random generator later emits the same
 * thing from different rules and CombatScene never learns the difference.
 *
 *   ENTRANCE ──────── tunnel east ────────┐
 *   (4 archers,        │                  │
 *    4 skeletons)      ▼ south A          ▼ south B
 *                   ┌──────┐          ┌──────┐
 *                   │  one is BARRACKS, the  │
 *                   │  other is GARBAGE      │
 *                   └───┬──────────────┘
 *                       │ 2-wide passage from the barracks
 *                       ▼
 *                   BOSS ROOM (shaman + 8 archers + 12 warriors)
 */

const W = 56;
const H = 46;

/** Rect in tile coords. x/y are the top-left tile, inclusive. */
interface Rect { x: number; y: number; w: number; h: number; }

/**
 * Wide enough that the guards at its east end sit outside ACTIVATION_RADIUS (7)
 * from the party's back rank. At 14 wide they woke on the party's first step,
 * which defeats the point of seeing a room before you walk into it.
 */
const ENTRANCE: Rect = { x: 2,  y: 2,  w: 18, h: 9 };
/** Three tiles tall, so a party in column formation can't fully block it. */
const TUNNEL:   Rect = { x: 20, y: 5,  w: 27, h: 3 };
/** Halfway along the tunnel (which runs x 20-46), per spec. */
const BRANCH_A: Rect = { x: 32, y: 8,  w: 3,  h: 8 };
/** At the tunnel's end. */
const BRANCH_B: Rect = { x: 44, y: 8,  w: 3,  h: 8 };
const ROOM_A:   Rect = { x: 24, y: 16, w: 14, h: 10 };
const ROOM_B:   Rect = { x: 40, y: 16, w: 14, h: 10 };
/** Spans wide enough to be reached from under either candidate barracks. */
const BOSS:     Rect = { x: 24, y: 31, w: 27, h: 13 };

/**
 * Enemies sit in the lower part of the boss room, not spread through it.
 *
 * Two reasons: the room description has to land before anything wakes (the
 * doorway is at the top), and a boss fight reads better when the party gets to
 * step in and see what it's walked into before it starts.
 */
const BOSS_SPAWN: Rect = { x: 25, y: 36, w: 25, h: 7 };

/** Minimum gap between two spawned units. Units are 1.2 across; this clears. */
const MIN_SEPARATION = UNIT_RADIUS * 2 + 0.3;

function blankGrid(): number[][] {
  return Array.from({ length: H }, () => Array.from({ length: W }, () => TILE_ROCK));
}

function carve(grid: number[][], r: Rect, tile = TILE_TRACKS): void {
  for (let row = r.y; row < r.y + r.h; row++) {
    for (let col = r.x; col < r.x + r.w; col++) {
      if (row >= 0 && row < H && col >= 0 && col < W) grid[row][col] = tile;
    }
  }
}

/**
 * Tile centres inside a rect, ordered nearest-to-centre with jitter.
 *
 * NOT a uniform shuffle. Greedy placement over a shuffled room spreads a pack
 * evenly across the whole floor — the barracks came out with its nearest two
 * goblins 5 tiles apart and a median of 8.9, which puts every pair outside the
 * 4-tile morale window and means B's rout mechanic could never once fire.
 *
 * Sorting by distance from a centre packs the pack. `jitter` keeps it from
 * settling into a visible lattice, and larger values loosen the formation.
 */
function tilesAroundCentre(r: Rect, centre: Vec2, jitter: number, rng: () => number): Vec2[] {
  const tiles: Vec2[] = [];
  for (let row = r.y; row < r.y + r.h; row++) {
    for (let col = r.x; col < r.x + r.w; col++) {
      tiles.push({ x: col + 0.5, y: row + 0.5 });
    }
  }
  return tiles
    .map(t => ({ t, k: Math.hypot(t.x - centre.x, t.y - centre.y) + rng() * jitter }))
    .sort((a, b) => a.k - b.k)
    .map(e => e.t);
}

function centreOf(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * Place a pack inside a rect with no two units overlapping.
 *
 * Greedy over shuffled tile centres rather than random points with a relaxation
 * pass: tile centres are already on the grid and known walkable, so the only
 * thing left to enforce is separation. This can't produce the spawn-overlap bug
 * the encounter generator had, because a rejected candidate is simply skipped.
 */
function placePack(
  types: string[],
  area: Rect,
  group: string,
  rng: () => number,
  jitter = 3,
): DungeonEnemySpawn[] {
  const centre = centreOf(area);
  const attempt = (sep: number): DungeonEnemySpawn[] => {
    const candidates = tilesAroundCentre(area, centre, jitter, rng);
    const out: DungeonEnemySpawn[] = [];
    for (const type of types) {
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!out.every(o => Math.hypot(o.x - c.x, o.y - c.y) >= sep)) continue;
        out.push({ type, x: c.x, y: c.y, group });
        candidates.splice(i, 1);
        break;
      }
    }
    return out;
  };

  // Greedy placement in a tight room can strand itself — the entrance guard
  // pocket failed roughly 1 run in 300. A fresh shuffle almost always clears
  // it, so retry rather than silently shipping a pack one man short.
  for (let i = 0; i < 20; i++) {
    const out = attempt(MIN_SEPARATION);
    if (out.length === types.length) return out;
  }

  // Still stuck: the room is genuinely too small. Fall back to the tightest
  // spacing that still doesn't overlap — units touch but never interpenetrate.
  const relaxed = attempt(UNIT_RADIUS * 2 + 0.02);
  if (relaxed.length < types.length) {
    console.warn(`[dungeonGen] ${group}: placed ${relaxed.length}/${types.length}`);
  }
  return relaxed;
}

function repeat(type: string, n: number): string[] {
  return Array.from({ length: n }, () => type);
}

export function generateGoblinNest(rng: () => number = Math.random): DungeonLevel {
  const grid = blankGrid();

  carve(grid, ENTRANCE);
  carve(grid, TUNNEL);
  carve(grid, BRANCH_A);
  carve(grid, BRANCH_B);
  carve(grid, BOSS);

  // The one roll in the whole layout.
  const barracksIsA = rng() < 0.5;
  const barracks = barracksIsA ? ROOM_A : ROOM_B;
  const garbage = barracksIsA ? ROOM_B : ROOM_A;

  carve(grid, barracks);
  // Refuse and rot get their own floor so the room reads as different before
  // the description even fires.
  carve(grid, garbage, TILE_DESTROYED);

  // Two-tile-wide passage from the barracks down into the boss room, per spec.
  const passX = Math.round(barracks.x + barracks.w / 2) - 1;
  carve(grid, { x: passX, y: barracks.y + barracks.h, w: 2, h: BOSS.y - (barracks.y + barracks.h) + 1 });

  // Party enters at the far west of the entrance room, guards at its east end —
  // far enough apart (ACTIVATION_RADIUS is 7) that the party gets a look first.
  const partySpawn: Vec2[] = [
    { x: 3.5, y: 4.5 }, { x: 3.5, y: 6.5 }, { x: 3.5, y: 8.5 },
    { x: 5.5, y: 4.5 }, { x: 5.5, y: 6.5 }, { x: 5.5, y: 8.5 },
  ];

  const enemies: DungeonEnemySpawn[] = [
    ...placePack(
      [...repeat('goblin_archer', 4), ...repeat('skeleton', 4)],
      { x: ENTRANCE.x + ENTRANCE.w - 5, y: ENTRANCE.y, w: 5, h: ENTRANCE.h },
      'entrance', rng,
    ),
    ...placePack(
      [...repeat('goblin_warrior', 8), ...repeat('skeleton', 4)],
      barracks,
      'barracks', rng,
    ),
    // Looser jitter — twenty-one bodies packed as tight as a squad would be one
    // undifferentiated blob, and the shaman needs to be findable in it.
    ...placePack(
      ['goblin_shaman', ...repeat('goblin_archer', 8), ...repeat('goblin_warrior', 12)],
      BOSS_SPAWN,
      'boss', rng, 5,
    ),
  ];

  // ── The ambush ────────────────────────────────────────────────────────────
  // A sealed pocket above the boss room, on the far side from the corridor the
  // party came down, so when it opens the goblins are genuinely behind them and
  // between them and the way out. Carved as floor but walled off; nothing can
  // see through rock, so the pack can't wake on proximity.
  const pocketX = passX < 38 ? 38 : 26;
  const POCKET: Rect = { x: pocketX, y: BOSS.y - 4, w: 6, h: 3 };
  carve(grid, POCKET);

  const wallTiles: Vec2[] = [];
  for (let c = POCKET.x; c < POCKET.x + POCKET.w; c++) {
    wallTiles.push({ x: c, y: BOSS.y - 1 });
  }

  enemies.push(...placePack(repeat('goblin_warrior', 6), POCKET, 'ambush', rng, 1));

  const rooms: DungeonRoom[] = [
    {
      id: 'garbage', ...garbage,
      description:
        'The tunnel opens into a midden. Bones, rags and the leavings of many ' +
        'meals lie heaped against the walls, and something beneath it all has ' +
        'been rotting a long while. The stench is thick enough to taste.\n\n' +
        'Nothing living is in here. The passage ends at the far wall.',
    },
    {
      /**
       * In the approach corridor, NOT the room itself.
       *
       * Placed at the doorway it never fired: the pack wakes at 7 tiles, and
       * the party crosses that line one row before it crosses the threshold, so
       * the fight always opened first. Up here the leader is ~10 tiles out —
       * clear of activation — and reading it while still in the corridor is the
       * better beat anyway. You get told what's coming while you can still
       * choose not to walk into it.
       */
      id: 'boss', x: passX, y: barracks.y + barracks.h, w: 2, h: 3,
      description:
        'The passage widens and runs down into a great vaulted chamber, and ' +
        'the smell of woodsmoke and old blood comes up to meet you. Fires ' +
        'burn low around a crude standing stone.\n\n' +
        'There are a great many of them down there. One wears bones in its ' +
        'hair and is not shouting like the rest.',
    },
  ];

  return {
    id: 'goblin_nest',
    name: 'The Goblin Nest',
    terrainGrid: grid,
    partySpawn,
    enemies,
    rooms,
    ambush: {
      group: 'ambush',
      triggerGroup: 'boss',
      // Turn two: long enough that the party has committed and picked targets,
      // early enough that it changes how the fight is fought.
      afterTurns: 2,
      wallTiles,
    },
  };
}
