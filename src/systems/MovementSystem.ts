import type { Combatant, Vec2 } from '../types';
import { MOVE_PER_STAMINA, FREE_MOVE, ADJACENT_TOLERANCE } from '../config/constants';

export class MovementSystem {
  private terrainGrid: number[][] | null = null;

  setTerrainGrid(grid: number[][]): void {
    this.terrainGrid = grid;
  }

  isTilePassable(x: number, y: number): boolean {
    if (!this.terrainGrid) return true;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row < 0 || row >= this.terrainGrid.length) return false;
    if (col < 0 || col >= this.terrainGrid[0].length) return false;
    return this.terrainGrid[row][col] === 0;
  }

  hasLineOfSight(from: Vec2, to: Vec2): boolean {
    if (!this.terrainGrid) return true;

    let col = Math.floor(from.x);
    let row = Math.floor(from.y);
    const endCol = Math.floor(to.x);
    const endRow = Math.floor(to.y);

    if (col === endCol && row === endRow) return true;

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const stepCol = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepRow = dy > 0 ? 1 : dy < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;

    let tMaxX = dx !== 0
      ? ((dx > 0 ? col + 1 - from.x : from.x - col) * tDeltaX)
      : Infinity;
    let tMaxY = dy !== 0
      ? ((dy > 0 ? row + 1 - from.y : from.y - row) * tDeltaY)
      : Infinity;

    const maxSteps = Math.abs(endCol - col) + Math.abs(endRow - row) + 2;
    for (let i = 0; i < maxSteps; i++) {
      if (tMaxX < tMaxY) {
        col += stepCol;
        tMaxX += tDeltaX;
      } else {
        row += stepRow;
        tMaxY += tDeltaY;
      }

      if (col === endCol && row === endRow) break;

      if (row < 0 || row >= this.terrainGrid.length ||
          col < 0 || col >= this.terrainGrid[0].length) return false;

      if (this.terrainGrid[row][col] === 1) return false;
    }

    return true;
  }

  distance(a: Vec2, b: Vec2): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  isAdjacent(a: Combatant, b: Combatant): boolean {
    return this.distance(a, b) <= a.radius + b.radius + ADJACENT_TOLERANCE;
  }

  isInRange(a: Vec2, b: Vec2, range: number): boolean {
    return this.distance(a, b) <= range;
  }

  freeRange(unit: { movesUsedThisTurn: number }): number {
    return Math.max(0, FREE_MOVE - unit.movesUsedThisTurn);
  }

  maxMoveRange(unit: { movesUsedThisTurn: number; stamina: number; staminaMovesThisTurn?: number; maxStaminaMoves?: number }): number {
    const free = this.freeRange(unit);
    const paidSoFar = Math.max(0, unit.movesUsedThisTurn - FREE_MOVE);
    const blocksBought = Math.ceil(paidSoFar / MOVE_PER_STAMINA);
    const remainingPaid = blocksBought > 0 ? blocksBought * MOVE_PER_STAMINA - paidSoFar : 0;
    const maxSM = unit.maxStaminaMoves ?? 1;
    const usedSM = unit.staminaMovesThisTurn ?? 0;
    const staminaMovesLeft = Math.max(0, maxSM - usedSM);
    const availableStamina = Math.min(unit.stamina, staminaMovesLeft);
    const newPaid = availableStamina * MOVE_PER_STAMINA;
    return free + remainingPaid + newPaid;
  }

  staminaCost(unit: { movesUsedThisTurn: number }, dist: number): number {
    const totalUsed = unit.movesUsedThisTurn + dist;
    if (totalUsed <= FREE_MOVE) return 0;
    const totalPaid = totalUsed - FREE_MOVE;
    const alreadyPaid = Math.max(0, unit.movesUsedThisTurn - FREE_MOVE);
    const newStaminaBlocks = Math.ceil(totalPaid / MOVE_PER_STAMINA) - Math.ceil(alreadyPaid / MOVE_PER_STAMINA);
    return Math.max(0, newStaminaBlocks);
  }

  canReach(unit: { x: number; y: number; movesUsedThisTurn: number; stamina: number }, target: Vec2): boolean {
    const dist = this.distance(unit, target);
    return dist <= this.maxMoveRange(unit);
  }

  findPath(
    start: Vec2, goal: Vec2, moverRadius: number,
    obstacles: Array<{ x: number; y: number; radius: number }>,
  ): Vec2[] {
    if (this.isPathClear(start, goal, moverRadius, obstacles)) {
      return [goal];
    }
    const dir = normalize({ x: goal.x - start.x, y: goal.y - start.y });
    const dist = this.distance(start, goal);
    let lo = 0, hi = dist;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const testPoint = { x: start.x + dir.x * mid, y: start.y + dir.y * mid };
      if (this.isPathClear(start, testPoint, moverRadius, obstacles)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return [{ x: start.x + dir.x * lo, y: start.y + dir.y * lo }];
  }

  isPathClear(
    from: Vec2, to: Vec2, moverRadius: number,
    obstacles: Array<{ x: number; y: number; radius: number }>,
  ): boolean {
    for (const obs of obstacles) {
      if (circleIntersectsSegment(from, to, obs, moverRadius + obs.radius)) {
        return false;
      }
    }
    if (this.terrainGrid) {
      const margin = 0.3;
      const dist = this.distance(from, to);
      const steps = Math.ceil(dist / 0.5);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = from.x + (to.x - from.x) * t;
        const py = from.y + (to.y - from.y) * t;
        if (!this.isTilePassable(px, py) ||
            !this.isTilePassable(px + margin, py) ||
            !this.isTilePassable(px - margin, py) ||
            !this.isTilePassable(px, py + margin) ||
            !this.isTilePassable(px, py - margin)) return false;
      }
    }
    return true;
  }

  isPositionBlocked(pos: Vec2, radius: number, obstacles: Array<{ x: number; y: number; radius: number }>): boolean {
    return obstacles.some(obs => this.distance(pos, obs) < radius + obs.radius);
  }

  resolveMove(
    mover: { x: number; y: number; radius: number },
    target: Vec2,
    blockers: Array<{ x: number; y: number; radius: number }>,
  ): Vec2 {
    const dx = target.x - mover.x;
    const dy = target.y - mover.y;
    const moveDist = Math.sqrt(dx * dx + dy * dy);
    if (moveDist < 0.01) return { x: mover.x, y: mover.y };

    let closestT = 1;

    for (const b of blockers) {
      const t = this.circleContactT(mover, target, mover.radius, b, b.radius);
      if (t !== null && t < closestT) closestT = t;
    }

    if (this.terrainGrid) {
      const margin = 0.3;
      const steps = Math.ceil(moveDist / 0.4);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (t > closestT) break;
        const px = mover.x + dx * t;
        const py = mover.y + dy * t;
        if (!this.isTilePassable(px, py) ||
            !this.isTilePassable(px + margin, py) ||
            !this.isTilePassable(px - margin, py) ||
            !this.isTilePassable(px, py + margin) ||
            !this.isTilePassable(px, py - margin)) {
          closestT = Math.max(0, (i - 1) / steps - 0.01);
          break;
        }
      }
    }

    closestT = Math.max(0, closestT - 0.01);

    return {
      x: mover.x + dx * closestT,
      y: mover.y + dy * closestT,
    };
  }

  private circleContactT(
    from: Vec2, to: Vec2, moverRadius: number,
    center: Vec2, centerRadius: number,
  ): number | null {
    const combinedR = moverRadius + centerRadius;
    const ddx = to.x - from.x;
    const ddy = to.y - from.y;
    const fx = from.x - center.x;
    const fy = from.y - center.y;

    const a = ddx * ddx + ddy * ddy;
    if (a === 0) return null;

    const b = 2 * (fx * ddx + fy * ddy);
    const c = fx * fx + fy * fy - combinedR * combinedR;

    if (c <= 0) {
      // Already overlapping — only block if moving closer
      if (b < 0) return 0;
      return null;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
    return t;
  }

  findGridPath(start: Vec2, goal: Vec2, maxDist: number): Vec2 | null {
    if (!this.terrainGrid) return goal;

    const startCol = Math.floor(start.x);
    const startRow = Math.floor(start.y);
    const goalCol = Math.floor(goal.x);
    const goalRow = Math.floor(goal.y);

    if (startCol === goalCol && startRow === goalRow) return goal;

    const rows = this.terrainGrid.length;
    const cols = this.terrainGrid[0].length;

    const key = (c: number, r: number) => r * cols + c;
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const cameFrom = new Map<number, number>();
    const open: Array<{ col: number; row: number }> = [];

    const h = (c: number, r: number) => Math.abs(c - goalCol) + Math.abs(r - goalRow);

    const sk = key(startCol, startRow);
    gScore.set(sk, 0);
    fScore.set(sk, h(startCol, startRow));
    open.push({ col: startCol, row: startRow });

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    let iterations = 0;
    while (open.length > 0 && iterations < 2000) {
      iterations++;
      open.sort((a, b) => (fScore.get(key(a.col, a.row)) ?? Infinity) - (fScore.get(key(b.col, b.row)) ?? Infinity));
      const current = open.shift()!;
      const ck = key(current.col, current.row);

      if (current.col === goalCol && current.row === goalRow) {
        const path: Array<{ col: number; row: number }> = [];
        let k = ck;
        while (k !== sk) {
          path.unshift({ col: k % cols, row: Math.floor(k / cols) });
          k = cameFrom.get(k)!;
        }

        let totalDist = 0;
        let prev = start;
        for (const step of path) {
          const wp = { x: step.col + 0.5, y: step.row + 0.5 };
          totalDist += this.distance(prev, wp);
          if (totalDist > maxDist) return prev === start ? null : prev;
          prev = wp;
        }
        return prev;
      }

      for (const [dc, dr] of dirs) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        if (this.terrainGrid![nr][nc] !== 0) continue;

        const nk = key(nc, nr);
        const tentG = (gScore.get(ck) ?? Infinity) + 1;
        if (tentG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, ck);
          gScore.set(nk, tentG);
          fScore.set(nk, tentG + h(nc, nr));
          if (!open.some(o => o.col === nc && o.row === nr)) {
            open.push({ col: nc, row: nr });
          }
        }
      }
    }

    return null;
  }

  facingFrom(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  isInFrontArc(unit: Combatant, target: Vec2, halfAngle: number = Math.PI / 2): boolean {
    const angleToTarget = Math.atan2(target.y - unit.y, target.x - unit.x);
    let diff = angleToTarget - unit.facing;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= halfAngle;
  }
}

function normalize(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

function circleIntersectsSegment(a: Vec2, b: Vec2, center: Vec2, combinedRadius: number): boolean {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const ac = { x: center.x - a.x, y: center.y - a.y };
  const abLen2 = ab.x * ab.x + ab.y * ab.y;
  if (abLen2 === 0) return Math.sqrt((a.x - center.x) ** 2 + (a.y - center.y) ** 2) < combinedRadius;
  const t = Math.max(0, Math.min(1, (ac.x * ab.x + ac.y * ab.y) / abLen2));
  const closest = { x: a.x + t * ab.x, y: a.y + t * ab.y };
  const ddx = closest.x - center.x;
  const ddy = closest.y - center.y;
  return Math.sqrt(ddx * ddx + ddy * ddy) < combinedRadius;
}
