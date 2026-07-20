import type { NPC } from '../entities/NPC';
import type { PC } from '../entities/PC';
import type { Obstacle } from '../types';
import { MovementSystem } from './MovementSystem';
import { MOVE_PER_STAMINA, RANGED_RANGE } from '../config/constants';

export interface AIAction {
  type: 'move' | 'attack' | 'ranged_attack';
  target?: PC;
  destination?: { x: number; y: number };
}

export class AISystem {
  private movement: MovementSystem;

  constructor(movement: MovementSystem) {
    this.movement = movement;
  }

  decideActions(enemy: NPC, party: PC[], obstacles: Obstacle[]): AIAction[] {
    const actions: AIAction[] = [];
    const targets = party.filter(c => !c.dead && !c.status.includes('beaten'));
    if (targets.length === 0) return actions;

    const nearest = targets.reduce((best, c) =>
      this.movement.distance(enemy, c) < this.movement.distance(enemy, best) ? c : best
    );

    const isRanged = enemy.inventory.equippedWeaponType() === 'ranged';

    if (isRanged) {
      if (this.movement.isInRange(enemy, nearest, RANGED_RANGE)) {
        actions.push({ type: 'ranged_attack', target: nearest });
      } else {
        const dest = this.moveToward(enemy, nearest, MOVE_PER_STAMINA, obstacles);
        if (dest) actions.push({ type: 'move', destination: dest });
        if (this.movement.isInRange({ x: dest?.x ?? enemy.x, y: dest?.y ?? enemy.y }, nearest, RANGED_RANGE)) {
          actions.push({ type: 'ranged_attack', target: nearest });
        }
      }
    } else {
      if (this.movement.isAdjacent(enemy, nearest)) {
        actions.push({ type: 'attack', target: nearest });
      } else {
        const dest = this.moveToward(enemy, nearest, MOVE_PER_STAMINA, obstacles);
        if (dest) {
          actions.push({ type: 'move', destination: dest });
          const movedEnemy = { ...enemy, x: dest.x, y: dest.y };
          if (this.movement.isAdjacent(movedEnemy, nearest)) {
            actions.push({ type: 'attack', target: nearest });
          }
        }
      }
    }

    return actions;
  }

  private moveToward(enemy: NPC, target: PC, maxDist: number, obstacles: Obstacle[]): { x: number; y: number } | null {
    const dist = this.movement.distance(enemy, target);
    if (dist <= 0) return null;

    const moveAmount = Math.min(maxDist, dist - enemy.radius - target.radius);
    if (moveAmount <= 0) return null;

    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const goal = {
      x: enemy.x + (dx / dist) * moveAmount,
      y: enemy.y + (dy / dist) * moveAmount,
    };

    const path = this.movement.findPath(enemy, goal, enemy.radius, obstacles);
    return path.length > 0 ? path[path.length - 1] : null;
  }
}
