import type { GamePhase } from '../types';
import type { PC } from '../entities/PC';
import type { NPC } from '../entities/NPC';

export class TurnSystem {
  phase: GamePhase = 'player';
  turn = 1;
  private party: PC[];
  private enemies: NPC[];
  private selectedIndex = 0;

  onPhaseChange: ((phase: GamePhase) => void) | null = null;
  onTurnStart: (() => void) | null = null;
  onEnemyPhaseStart: (() => void) | null = null;

  constructor(party: PC[], enemies: NPC[]) {
    this.party = party;
    this.enemies = enemies;
  }

  get activeParty(): PC[] {
    return this.party.filter(c => !c.dead && !c.status.includes('beaten'));
  }

  get selectedPC(): PC | null {
    const active = this.activeParty;
    if (active.length === 0) return null;
    return active[this.selectedIndex % active.length] ?? null;
  }

  selectPC(pc: PC): void {
    const idx = this.activeParty.indexOf(pc);
    if (idx >= 0) this.selectedIndex = idx;
  }

  selectNext(): PC | null {
    const active = this.activeParty.filter(c => !c.turnDone);
    if (active.length === 0) return null;
    this.selectedIndex = this.activeParty.indexOf(active[0]);
    return active[0];
  }

  beginPlayerTurn(): void {
    this.phase = 'player';
    this.party.forEach(c => {
      if (c.dead) return;
      c.stamina = c.maxStamina;
      c.hasActed = false;
      c.movesUsedThisTurn = 0;
      c.staminaMovesThisTurn = 0;
      c.turnDone = c.status.includes('beaten');
      c.status = c.status.filter(s => s !== 'defending' && s !== 'blessed');
    });
    this.selectedIndex = 0;
    this.selectNext();
    this.onPhaseChange?.(this.phase);
    this.onTurnStart?.();
  }

  endCharTurn(pc: PC): void {
    pc.turnDone = true;
    const remaining = this.activeParty.filter(c => !c.turnDone);
    if (remaining.length === 0) {
      this.beginEnemyPhase();
    } else {
      this.selectNext();
    }
  }

  endPlayerPhase(): void {
    this.activeParty.forEach(c => { c.turnDone = true; });
    this.beginEnemyPhase();
  }

  beginEnemyPhase(): void {
    this.phase = 'enemy';
    this.onPhaseChange?.(this.phase);
    this.onEnemyPhaseStart?.();
  }

  endEnemyPhase(): void {
    this.turn++;
    this.beginPlayerTurn();
  }

  checkVictory(): boolean {
    if (this.enemies.length === 0) {
      this.phase = 'victory';
      this.onPhaseChange?.(this.phase);
      return true;
    }
    return false;
  }

  checkDefeat(): boolean {
    if (this.party.every(c => c.dead || c.status.includes('beaten'))) {
      this.phase = 'defeat';
      this.onPhaseChange?.(this.phase);
      return true;
    }
    return false;
  }

  removeEnemy(enemy: NPC): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }
}
