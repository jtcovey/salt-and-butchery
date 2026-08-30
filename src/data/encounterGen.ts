import { TILE_GRASS, TILE_ROCK, TILE_FOREST } from '../config/terrain';
import { UNIT_RADIUS } from '../config/constants';

/**
 * Procedural encounter maps.
 *
 * Produces the same shape a hand-authored level file has, so CombatScene loads
 * one with no special case: `terrainGrid`, `partySpawn`, `enemies`.
 *
 * The interesting part is the FORMATION table. A random fight where everyone
 * always starts in a tidy line is the same fight every time; the variety lives
 * in where the two sides begin relative to each other, not in the scenery.
 *
 * Everything scales with party level: more enemies, and a proportionally bigger
 * map so a larger fight doesn't just get more crowded.
 */

export interface GeneratedEncounter {
  terrainGrid: number[][];
  partySpawn: { x: number; y: number }[];
  enemies: { type: string; x: number; y: number }[];
  formation: string;
  formationBlurb: string;
  /** For the log — how big the roll came out. */
  enemyCount: number;
}

/** Level 1 arena. Grows by MAP_GROWTH_PER_LEVEL for each level above that. */
const BASE_W = 30;
const BASE_H = 22;
/** +25% per level: 100% at L1, 125% at L2, 150% at L3. */
const MAP_GROWTH_PER_LEVEL = 0.25;

/**
 * Minimum gap between any two spawned units.
 *
 * Two radii would be just touching, so there's a margin on top — units that
 * begin exactly touching read as overlapping and can't step past each other.
 */
const MIN_SEPARATION = UNIT_RADIUS * 2 + 0.3;

type Rng = () => number;

/** Deterministic when seeded, so a bad map can be reproduced from its seed. */
function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const randInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
/** `n`d6 — party level sets the number of dice, so L2 rolls 2d6. */
const rollD6s = (rng: Rng, n: number) => {
  let total = 0;
  for (let i = 0; i < n; i++) total += randInt(rng, 1, 6);
  return total;
};

interface Dims { W: number; H: number; }

interface Formation {
  id: string;
  name: string;
  blurb: string;
  weight: number;
  place: (rng: Rng, d: Dims, partySize: number, enemyCount: number) => {
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
    place: (rng, { W, H }, ps, ec) => ({
      party: Array.from({ length: ps }, (_, i) => ({
        x: 5 + j(rng, 0.8), y: H / 2 - (ps - 1) * 1.6 / 2 + i * 1.6 + j(rng, 0.4),
      })),
      enemies: Array.from({ length: ec }, (_, i) => ({
        x: W - 6 + j(rng, 1.6), y: H / 2 - (ec - 1) * 1.8 / 2 + i * 1.8 + j(rng, 0.6),
      })),
    }),
  },
  {
    id: 'two_groups', name: 'Split', weight: 18,
    blurb: 'The column had drifted apart. You fight in two knots.',
    place: (rng, { W, H }, ps, ec) => {
      const half = Math.ceil(ps / 2);
      return {
        party: Array.from({ length: ps }, (_, i) => i < half
          ? { x: 5 + j(rng), y: H * 0.28 + i * 1.6 + j(rng, 0.5) }
          : { x: 6 + j(rng), y: H * 0.72 + (i - half) * 1.6 + j(rng, 0.5) }),
        enemies: Array.from({ length: ec }, (_, i) => ({
          x: W - 7 + j(rng, 2), y: H / 2 - (ec - 1) * 1.7 / 2 + i * 1.7 + j(rng, 0.8),
        })),
      };
    },
  },
  {
    id: 'scattered', name: 'Scattered', weight: 12,
    blurb: 'Strung out and careless. Everyone is somewhere else.',
    place: (rng, { W, H }, ps, ec) => ({
      party: Array.from({ length: ps }, () => ({
        x: 3 + rng() * (W * 0.32), y: 3 + rng() * (H - 6),
      })),
      enemies: Array.from({ length: ec }, () => ({
        x: W * 0.55 + rng() * (W * 0.38), y: 3 + rng() * (H - 6),
      })),
    }),
  },
  {
    id: 'ambushed', name: 'Ambushed', weight: 15,
    blurb: 'They were waiting. You are surrounded before anyone calls it.',
    place: (rng, { W, H }, ps, ec) => {
      // One shared angle offset, not one per enemy — independent jitter on each
      // let two of them land on the same bearing and stack up.
      const spin = rng() * Math.PI * 2;
      // Ring has to grow with the count or a big roll packs shoulder to shoulder.
      const ringR = Math.max(7, (ec * MIN_SEPARATION) / (Math.PI * 2) + 5);
      return {
        party: Array.from({ length: ps }, (_, i) => ({
          x: W / 2 + j(rng, 1.4), y: H / 2 - (ps - 1) * 1.5 / 2 + i * 1.5 + j(rng, 0.4),
        })),
        enemies: Array.from({ length: ec }, (_, i) => {
          const a = spin + (i / ec) * Math.PI * 2;
          const r = ringR + j(rng, 1.2);
          return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
        }),
      };
    },
  },
  {
    id: 'ambusher', name: 'The Drop', weight: 10,
    blurb: 'You saw them first. They are strung out and unready.',
    place: (rng, { W, H }, ps, ec) => {
      const spin = rng() * 0.6 - 0.3;
      return {
        party: Array.from({ length: ps }, (_, i) => {
          const a = spin + (i / Math.max(1, ps - 1)) * Math.PI * 1.2 - Math.PI * 0.6;
          const r = 7 + j(rng, 0.8);
          return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r };
        }),
        enemies: Array.from({ length: ec }, (_, i) => ({
          x: W / 2 - 1 + j(rng, 1.8), y: H / 2 - (ec - 1) * 1.5 / 2 + i * 1.5 + j(rng, 0.5),
        })),
      };
    },
  },
];

function rollFormation(rng: Rng): Formation {
  const total = FORMATIONS.reduce((n, f) => n + f.weight, 0);
  let r = rng() * total;
  for (const f of FORMATIONS) { r -= f.weight; if (r <= 0) return f; }
  return FORMATIONS[0];
}

/** Mostly grass, a scatter of rock, occasional forest for cover. */
function makeTerrain(rng: Rng, { W, H }: Dims, scale: number): number[][] {
  const grid: number[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => TILE_GRASS));

  // Counts scale with AREA, so a bigger map keeps the same density of cover
  // rather than turning into an empty field.
  const area = scale * scale;
  const blobs = randInt(rng, Math.round(3 * area), Math.round(7 * area));
  for (let b = 0; b < blobs; b++) {
    const cx = randInt(rng, 2, W - 3);
    const cy = randInt(rng, 2, H - 3);
    for (let i = 0; i < randInt(rng, 1, 4); i++) {
      const x = cx + randInt(rng, -1, 1);
      const y = cy + randInt(rng, -1, 1);
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) grid[y][x] = TILE_ROCK;
    }
  }

  // Forest blocks line of sight but is passable, so it makes real cover.
  const trees = randInt(rng, Math.round(2 * area), Math.round(6 * area));
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

const onRock = (grid: number[][], p: { x: number; y: number }, { W, H }: Dims) => {
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
  return grid[cy][cx] === TILE_ROCK;
};

/**
 * Move a spawn off rock WITHOUT snapping to the tile centre.
 *
 * The snap was the real cause of units spawning on top of each other: any two
 * spawns inside the same tile collapsed onto the identical point. These units
 * are circles at float positions, so there was never a reason to quantise them.
 */
function offRock(grid: number[][], p: { x: number; y: number }, d: Dims): { x: number; y: number } {
  if (!onRock(grid, p, d)) return p;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x >= d.W - 1 || y >= d.H - 1) continue;
        if (grid[y][x] !== TILE_ROCK) {
          // Keep the sub-tile offset so neighbours don't all land dead-centre.
          return { x: x + (p.x - cx), y: y + (p.y - cy) };
        }
      }
    }
  }
  grid[Math.max(0, Math.min(d.H - 1, cy))][Math.max(0, Math.min(d.W - 1, cx))] = TILE_GRASS;
  return p;
}

/**
 * Relaxation pass pushing any overlapping pair apart.
 *
 * Applied across party AND enemies together, because a hero starting inside a
 * skeleton is exactly as broken as two skeletons sharing a tile. Formation-
 * agnostic on purpose — fixing each formation's jitter individually would just
 * be the same bug waiting in the next formation someone adds.
 */
function separate(pts: { x: number; y: number }[], d: Dims, rng: Rng): void {
  const pad = UNIT_RADIUS + 0.5;
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let k = i + 1; k < pts.length; k++) {
        const a = pts[i], b = pts[k];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= MIN_SEPARATION) continue;
        if (dist < 1e-4) { dx = rng() - 0.5; dy = rng() - 0.5; dist = Math.hypot(dx, dy) || 1; }
        const push = (MIN_SEPARATION - dist) / 2 + 0.001;
        const ux = dx / dist, uy = dy / dist;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        moved = true;
      }
    }
    for (const p of pts) {
      p.x = Math.max(pad, Math.min(d.W - pad, p.x));
      p.y = Math.max(pad, Math.min(d.H - pad, p.y));
    }
    if (!moved) break;
  }
}

export function generateEncounter(
  partySize: number,
  partyLevel = 1,
  seed = Math.floor(Math.random() * 1e9),
): GeneratedEncounter {
  const rng = makeRng(seed);

  const level = Math.max(1, partyLevel);
  const scale = 1 + MAP_GROWTH_PER_LEVEL * (level - 1);
  const dims: Dims = { W: Math.round(BASE_W * scale), H: Math.round(BASE_H * scale) };

  const grid = makeTerrain(rng, dims, scale);

  // Party level sets the number of dice: L1 = 1d6, L2 = 2d6, L3 = 3d6.
  const enemyCount = rollD6s(rng, level);

  const formation = rollFormation(rng);
  const placed = formation.place(rng, dims, partySize, enemyCount);

  // The two constraints fight each other: nudging off rock can stack two units,
  // and pushing them apart can shove one back into rock. Alternate until both
  // hold. Doing either once leaves ~0.1% of spawns standing in stone.
  let party = placed.party;
  let enemies = placed.enemies;
  for (let round = 0; round < 4; round++) {
    party = party.map(p => offRock(grid, p, dims));
    enemies = enemies.map(p => offRock(grid, p, dims));
    separate([...party, ...enemies], dims, rng);
  }
  // Rock wins the last word — a unit inside terrain is worse than a tight gap.
  party = party.map(p => offRock(grid, p, dims));
  enemies = enemies.map(p => offRock(grid, p, dims));

  return {
    terrainGrid: grid,
    partySpawn: party,
    enemies: enemies.map(p => ({
      // Roughly a third archers — enough that ranged threat matters without
      // every fight becoming a shooting gallery.
      type: rng() < 0.35 ? 'skeleton_archer' : 'skeleton',
      x: p.x, y: p.y,
    })),
    formation: formation.name,
    formationBlurb: formation.blurb,
    enemyCount,
  };
}
