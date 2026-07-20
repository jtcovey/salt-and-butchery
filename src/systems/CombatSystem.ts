import type { Combatant, StatusEffect } from '../types';
import { d8 } from '../core/Dice';
import { GameOptions } from '../config/GameOptions';

export interface AttackResult {
  hit: boolean;
  roll: number;
  total: number;
  targetAC: number;
  damage: number;
  killed: boolean;
  beaten: boolean;
  wardBlocked: boolean;
}

export interface CurseResult {
  hit: boolean;
  roll: number;
  total: number;
  targetAC: number;
  salted: boolean;
  wardBlocked: boolean;
}

export class CombatSystem {
  attack(attacker: Combatant, target: Combatant, skillBonus: number, damage: number, targetIsPC = false): AttackResult {
    const targetAC = this.effectiveAC(target);

    if (target.wardStacks && target.wardStacks > 0) {
      target.wardStacks--;
      if (target.wardStacks === 0) {
        target.status = target.status.filter(s => s !== 'warded');
      }
      return { hit: false, roll: 0, total: 0, targetAC, damage: 0, killed: false, beaten: false, wardBlocked: true };
    }

    const roll = d8();
    const blessBonus = attacker.status?.includes('blessed') ? 1 : 0;
    const total = roll + skillBonus + blessBonus;
    const hit = total > targetAC;

    if (!hit) {
      return { hit: false, roll, total, targetAC, damage: 0, killed: false, beaten: false, wardBlocked: false };
    }

    if (targetIsPC && GameOptions.godMode) {
      return { hit: true, roll, total, targetAC, damage: 0, killed: false, beaten: false, wardBlocked: false };
    }

    target.hp -= damage;
    let killed = false;
    let beaten = false;

    if (target.hp <= 0) {
      if (target.status.includes('beaten')) {
        killed = true;
      } else {
        beaten = true;
        target.hp = 0;
        this.addStatus(target, 'beaten');
        this.addStatus(target, 'prone');
      }
    }

    return { hit: true, roll, total, targetAC, damage, killed, beaten, wardBlocked: false };
  }

  curse(target: Combatant, skillBonus: number): CurseResult {
    const targetAC = this.effectiveAC(target);

    if (target.wardStacks && target.wardStacks > 0) {
      target.wardStacks--;
      if (target.wardStacks === 0) {
        target.status = target.status.filter(s => s !== 'warded');
      }
      return { hit: false, roll: 0, total: 0, targetAC, salted: false, wardBlocked: true };
    }

    const roll = d8();
    const total = roll + skillBonus;
    const hit = total > targetAC;

    if (hit) {
      target.hp = 0;
      this.addStatus(target, 'beaten');
    }

    return { hit, roll, total, targetAC, salted: hit, wardBlocked: false };
  }

  heal(target: Combatant, amount: number): number {
    const healed = Math.min(amount, target.maxHp - target.hp);
    target.hp += healed;
    if (target.status.includes('beaten') && target.hp > 0) {
      target.status = target.status.filter(s => s !== 'beaten' && s !== 'prone');
    }
    return healed;
  }

  addWard(target: Combatant): void {
    target.wardStacks = Math.min(3, (target.wardStacks ?? 0) + 1);
    if (!target.status.includes('warded')) {
      target.status.push('warded');
    }
  }

  effectiveAC(target: Combatant): number {
    let ac = target.ac;
    if (target.status.includes('defending')) ac += 1;
    if (target.status.includes('prone')) ac -= 2;
    return ac;
  }

  addStatus(target: Combatant, effect: StatusEffect): void {
    if (!target.status.includes(effect)) {
      target.status.push(effect);
    }
  }

  removeStatus(target: Combatant, effect: StatusEffect): void {
    target.status = target.status.filter(s => s !== effect);
  }

  processBurning(target: Combatant): boolean {
    if (!target.status.includes('burning')) return false;
    target.hp -= 1;
    if (target.hp <= 0) {
      if (!target.status.includes('beaten')) {
        this.addStatus(target, 'beaten');
        this.addStatus(target, 'prone');
        target.hp = 0;
      }
    }
    return true;
  }
}
