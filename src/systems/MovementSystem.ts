import type { Combatant, Vec2 } from '../types';
import { MOVE_PER_STAMINA, FREE_MOVE, ADJACENT_TOLERANCE } from '../config/constants';

export class MovementSystem {
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

    // Remaining distance from already-purchased stamina blocks
    const paidSoFar = Math.max(0, unit.movesUsedThisTurn - FREE_MOVE);
    const blocksBought = Math.ceil(paidSoFar / MOVE_PER_STAMINA);
    const remainingPaid = blocksBought > 0 ? blocksBought * MOVE_PER_STAMINA - paidSoFar : 0;

    // New blocks we can still buy (capped by maxStaminaMoves)
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
    start: Vec2,
    goal: Vec2,
    moverRadius: number,
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
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const fx = from.x - center.x;
    const fy = from.y - center.y;

    const a = dx * dx + dy * dy;
    if (a === 0) return null;

    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - combinedR * combinedR;

    if (c <= 0) return 0;

    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > 1) return null;
    return t;
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
  const dx = closest.x - center.x;
  const dy = closest.y - center.y;
  return Math.sqrt(dx * dx + dy * dy) < combinedRadius;
}
