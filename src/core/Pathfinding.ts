import type { Vec2 } from '../types';
import { isTileIdPassable } from '../config/terrain';

/**
 * Grid A* over a terrain grid. One implementation, two consumers:
 * combat's AI (via MovementSystem.findGridPath, which walks the result until it
 * runs out of movement) and the world map's click-to-travel.
 *
 * Eight-directional by default. Diagonal steps cost sqrt(2) and are only taken
 * when both adjacent orthogonal tiles are open, so units never squeeze through
 * the corner gap between two rocks.
 */

const SQRT2 = Math.SQRT2;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];
const DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [1, -1], [-1, 1], [1, 1],
];

export interface TilePathOptions {
  /** Allow diagonal steps. Default true. */
  diagonal?: boolean;
  /** Safety valve on pathological searches. Default 8000. */
  maxIterations?: number;
}

/**
 * Least-cost tile path from `start` to `goal`, as tile-centre world coords.
 * Excludes the starting tile; the last entry is the goal tile's centre.
 * Returns null if the goal is unreachable, impassable, or off-grid.
 */
export function findTilePath(
  grid: number[][],
  start: Vec2,
  goal: Vec2,
  opts: TilePathOptions = {},
): Vec2[] | null {
  const rows = grid.length;
  if (rows === 0) return null;
  const cols = grid[0].length;

  const diagonal = opts.diagonal ?? true;
  const maxIterations = opts.maxIterations ?? 8000;

  const startCol = Math.floor(start.x);
  const startRow = Math.floor(start.y);
  const goalCol = Math.floor(goal.x);
  const goalRow = Math.floor(goal.y);

  if (!inBounds(goalCol, goalRow, cols, rows)) return null;
  if (!isTileIdPassable(grid[goalRow][goalCol])) return null;
  if (startCol === goalCol && startRow === goalRow) return [];

  const key = (c: number, r: number) => r * cols + c;
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();

  // Octile distance — admissible for 8-way movement, exact for 4-way when
  // diagonals are disabled (min term drops out on straight lines anyway).
  const h = (c: number, r: number) => {
    const dc = Math.abs(c - goalCol);
    const dr = Math.abs(r - goalRow);
    return diagonal
      ? (dc + dr) + (SQRT2 - 2) * Math.min(dc, dr)
      : dc + dr;
  };

  const sk = key(startCol, startRow);
  gScore.set(sk, 0);
  open.push(sk, h(startCol, startRow));

  const dirs = diagonal ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL;

  let iterations = 0;
  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    const ck = open.pop()!;
    if (closed.has(ck)) continue;
    closed.add(ck);

    const col = ck % cols;
    const row = Math.floor(ck / cols);

    if (col === goalCol && row === goalRow) {
      return reconstruct(cameFrom, sk, ck, cols);
    }

    for (const [dc, dr] of dirs) {
      const nc = col + dc;
      const nr = row + dr;
      if (!inBounds(nc, nr, cols, rows)) continue;
      if (!isTileIdPassable(grid[nr][nc])) continue;

      const isDiag = dc !== 0 && dr !== 0;
      if (isDiag) {
        // No corner cutting: both orthogonal neighbours must be open.
        if (!isTileIdPassable(grid[row][nc])) continue;
        if (!isTileIdPassable(grid[nr][col])) continue;
      }

      const nk = key(nc, nr);
      if (closed.has(nk)) continue;

      const tentative = (gScore.get(ck) ?? Infinity) + (isDiag ? SQRT2 : 1);
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentative);
        open.push(nk, tentative + h(nc, nr));
      }
    }
  }

  return null;
}

function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && c < cols && r >= 0 && r < rows;
}

function reconstruct(
  cameFrom: Map<number, number>,
  startKey: number,
  goalKey: number,
  cols: number,
): Vec2[] {
  const path: Vec2[] = [];
  let k = goalKey;
  while (k !== startKey) {
    path.unshift({ x: (k % cols) + 0.5, y: Math.floor(k / cols) + 0.5 });
    const prev = cameFrom.get(k);
    if (prev === undefined) break;
    k = prev;
  }
  return path;
}

/**
 * Binary min-heap keyed on fScore. Replaces re-sorting the open list on every
 * pop, which made the old search quadratic.
 */
class MinHeap {
  private keys: number[] = [];
  private scores: number[] = [];

  get size(): number { return this.keys.length; }

  push(key: number, score: number): void {
    this.keys.push(key);
    this.scores.push(score);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.keys[0];
    const lastKey = this.keys.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.scores[0] = lastScore;
      let i = 0;
      const n = this.keys.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < n && this.scores[l] < this.scores[smallest]) smallest = l;
        if (r < n && this.scores[r] < this.scores[smallest]) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}
