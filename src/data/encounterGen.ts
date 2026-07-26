import { TILE_GRASS, TILE_ROCK, TILE_FOREST } from '../config/terrain';

/**
 * Procedural encounter maps.
 *
 * Produces the same shape a hand-authored level file has, so CombatScene loads
 * one with no special case: `terrainGrid`, `partySpawn`, `enemies`.
 *
 * The interesting part is the FORMATION table. A random fight where everyone
 * always starts in a tidy line is the same fight every time; the variety lives
 * in where the two sides begin relative to each other, not in the scenery.
 */

export interface GeneratedEncounter {
  terrainGrid: number[][];
  partySpawn: { x: number; y: number }[];
  enemies: { type: string; x: number; y: number }[];
  /** Human-readable, for the log and for debugging a bad roll. */
  formation: string;
  formationBlurb: string;
}

const W = 30;
const H = 22;

/** Deterministic when seeded, so a bad map can be reproduced from its seed. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Rng = () => number;
const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * How the two sides are arranged at the bell.
 *
 * `weight` is relative — together is the common case because a party that has
 * been travelling as a group should usually be caught as a group. The scattered
 * and ambush layouts are the interesting minority.
 */
interface Formation {
  id: string;
  name: string;
  blurb: string;
  weight: number;
  place: (rng: Rng, partySize: number, enemyCount: number) => {
    party: { x: number; y: number }[];
    enemies: { x: number; y: number }[];
  };
}

/** Small jitter so formations don't look stamped. */
const j = (rng: Rng, n = 1.2) => (rng() - 0.5) * 2 * n;

const FORMATIONS: Formation[] = [
  {
    id: 'together', name: 'Together', weight: 45,
    blurb: 'You are travelling close. They come at you from the open ground.',
    place: (rng, ps, ec) => ({
      party: Array.from({ length: ps }, (_, i) => ({
        x: 5 + j(rng, 0.8), y: H / 2 - (ps - 1) * 1.4 / 2 + i * 1.4 + j(rng, 0.5),
      })),
      enemies: Array.from({ length: ec }, (_, i) => ({
        x: W - 6 + j(rng, 1.6), y: H / 2 - (ec - 1) * 1.6 / 2 + i * 1.6 + j(rng, 0.9),
      })),
    }),
  },
  {
    id: 'two_groups', name: 'Split', weight: 18,
    blurb: 'The column had drifted apart. You fight in two knots.',
    place: (rng, ps, ec) => {
      const half = Math.ceil(ps / 2);
      return {
        party: Array.from({ length: ps }, (_, i) => i < half
          ? { x: 5 + j(rng), y: H * 0.28 + i * 1.4 + j(rng, 0.6) }
          : { x: 6 + j(rng), y: H * 0.72 + (i - half) * 1.4 + j(rng, 0.6) }),
        enemies: Array.from({ length: ec }, (_, i) => ({
          x: W - 7 + j(rng, 2), y: H / 2 - (ec - 1) * 1.5 / 2 + i * 1.5 + j(rng, 1.2),
        })),
      };
    },
  },
  {
    id: 'scattered', name: 'Scattered', weight: 12,
    blurb: 'Strung out and careless. Everyone is somewhere else.',
    place: (rng, ps, ec) => ({
      party: Array.from({ length: ps }, () => ({
        x: 4 + rng() * 8, y: 3 + rng() * (H - 6),
      })),
      enemies: Array.from({ length: ec }, () => ({
        x: W - 12 + rng() * 9, y: 3 + rng() * (H - 6),
      })),
    }),
  },
  {
    id: 'ambushed', name: 'Ambushed', weight: 15,
    blurb: 'They were waiting. You are surrounded before anyone calls it.',
    place: (rng, ps, ec) => ({
      party: Array.from({ length: ps }, (_, i) => ({
        x: W / 2 + j(rng, 1.6), y: H / 2 - (ps - 1) * 1.3 / 2 + i * 1.3 + j(rng, 0.6),
      })),
      // Ring around the party at a rolled radius.
      enemies: Array.from({ length: ec }, (_, i) => {
        const a = (i / ec) * Math.PI * 2 + rng() * 0.5;
        const r = 7 + rng() * 2.5;
        return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
      }),
    }),
  },
  {
    id: 'ambusher', name: 'The Drop', weight: 10,
    blurb: 'You saw them first. They are strung out and unready.',
    place: (rng, ps, ec) => ({
      // Party arcs around them instead — the ambush reversed.
      party: Array.from({ length: ps }, (_, i) => {
        const a = (i / ps) * Math.PI * 1.2 - Math.PI * 0.6 + j(rng, 0.15);
        const r = 6.5 + rng() * 1.5;
        return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
      }),
      enemies: Array.from({ length: ec }, (_, i) => ({
        x: W / 2 - 1 + j(rng, 2.2), y: H / 2 - (ec - 1) * 1.2 / 2 + i * 1.2 + j(rng, 0.8),
      })),
    }),
  },
];

function rollFormation(rng: Rng): Formation {
  const total = FORMATIONS.reduce((n, f) => n + f.weight, 0);
  let r = rng() * total;
  for (const f of FORMATIONS) { r -= f.weight; if (r <= 0) return f; }
  return FORMATIONS[0];
}

/** Mostly grass, a scatter of rock, occasional forest for cover. */
function makeTerrain(rng: Rng): number[][] {
  const grid: number[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => TILE_GRASS));

  // A handful of rock blobs rather than pepper — clumps read as terrain,
  // single scattered tiles read as noise.
  const blobs = randInt(rng, 3, 7);
  for (let b = 0; b < blobs; b++) {
    const cx = randInt(rng, 2, W - 3);
    const cy = randInt(rng, 2, H - 3);
    const size = randInt(rng, 1, 4);
    for (let i = 0; i < size; i++) {
      const x = cx + randInt(rng, -1, 1);
      const y = cy + randInt(rng, -1, 1);
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) grid[y][x] = TILE_ROCK;
    }
  }

  // Forest blocks line of sight but is passable, so it makes real cover.
  const trees = randInt(rng, 2, 6);
  for (let t = 0; t < trees; t++) {
    const cx = randInt(rng, 2, W - 3);
    const cy = randInt(rng, 2, H - 3);
    for (let i = 0; i < randInt(rng, 1, 3); i++) {
      const x = cx + randInt(rng, -1, 1);
      const y = cy + randInt(rng, -1, 1);
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1 && grid[y][x] === TILE_GRASS) {
        grid[y][x] = TILE_FOREST;
      }
    }
  }
  return grid;
}

/** Nudge a spawn off rock so nobody starts inside a boulder. */
function clearSpawn(grid: number[][], p: { x: number; y: number }): { x: number; y: number } {
  const cx = Math.min(W - 1, Math.max(0, Math.floor(p.x)));
  const cy = Math.min(H - 1, Math.max(0, Math.floor(p.y)));
  if (grid[cy][cx] !== TILE_ROCK) return { x: cx + 0.5, y: cy + 0.5 };

  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        if (grid[y][x] !== TILE_ROCK) return { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  // Nothing near — clear the tile rather than spawn someone in stone.
  grid[cy][cx] = TILE_GRASS;
  return { x: cx + 0.5, y: cy + 0.5 };
}

export function generateEncounter(partySize: number, seed = Math.floor(Math.random() * 1e9)): GeneratedEncounter {
  const rng = makeRng(seed);
  const grid = makeTerrain(rng);

  const enemyCount = randInt(rng, 1, 6);
  const formation = rollFormation(rng);
  const placed = formation.place(rng, partySize, enemyCount);

  return {
    terrainGrid: grid,
    partySpawn: placed.party.map(p => clearSpawn(grid, p)),
    enemies: placed.enemies.map(p => {
      const at = clearSpawn(grid, p);
      // Roughly a third archers — enough that ranged threat is a real
      // consideration without every fight becoming a shooting gallery.
      return { type: rng() < 0.35 ? 'skeleton_archer' : 'skeleton', x: at.x, y: at.y };
    }),
    formation: formation.name,
    formationBlurb: formation.blurb,
  };
}
