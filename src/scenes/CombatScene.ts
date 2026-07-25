import Phaser from 'phaser';
import type { Obstacle, GamePhase, CombatReturn } from '../types';
import { WorldState } from '../core/WorldState';
import type { Action } from '../actions/Action';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { TurnSystem } from '../systems/TurnSystem';
import { AISystem } from '../systems/AISystem';
import { TerrainRenderer } from '../render/TerrainRenderer';
import type { TileOverlay, SaltBody } from '../render/TerrainRenderer';
import { UnitRenderer } from '../render/UnitRenderer';
import { VFXRenderer } from '../render/VFXRenderer';
import { RangeIndicator } from '../ui/RangeIndicator';
import { UIButton, BUTTON_BACK, BUTTON_CHROME } from '../ui/UIButton';
import { TopBar } from '../ui/TopBar';
import { PC } from '../entities/PC';
import { NPC } from '../entities/NPC';
import { LAYOUT, UNIT_RADIUS, RANGED_RANGE, MELEE_RANGE } from '../config/constants';
import { GameOptions } from '../config/GameOptions';
import { SWORD, BOW } from '../data/items';
import { SFXSystem } from '../systems/SFXSystem';
import type { SFXId } from '../systems/SFXSystem';
import { BaseScene } from './BaseScene';

type CombatMode = 'select' | 'move' | 'targeting';

const DEFAULT_LEVEL = 'levels/TestMap1.json';

export class CombatScene extends BaseScene {
  private coords!: CoordinateSystem;
  private movement!: MovementSystem;
  private combat!: CombatSystem;
  private turns!: TurnSystem;
  private ai!: AISystem;
  private sfx!: SFXSystem;

  private terrain!: TerrainRenderer;
  private unitRenderer!: UnitRenderer;
  private rangeIndicator!: RangeIndicator;
  private vfx!: VFXRenderer;

  private party: PC[] = [];
  private enemies: NPC[] = [];
  private obstacles: Obstacle[] = [];
  private terrainGrid: number[][] | null = null;
  private saltBodies: SaltBody[] = [];
  private tileOverlays: Map<string, TileOverlay> = new Map();

  private mode: CombatMode = 'select';
  private activeAction: Action | null = null;
  private attacksRemaining = 0;
  private coneAngle = 0;
  private log: string[] = [];
  private logScroll = 0;
  private animating = false;
  /** False until loadLevel resolves and finishSetup wires TurnSystem/AISystem. */
  private ready = false;
  private levelFile = DEFAULT_LEVEL;

  // Undo state
  private undoSnapshot: {
    pcId: string;
    x: number; y: number; facing: number;
    stamina: number; movesUsedThisTurn: number; staminaMovesThisTurn: number;
    hasActedBefore: boolean;
  } | null = null;

  // UI elements
  private topBar!: TopBar;
  private panelGfx!: Phaser.GameObjects.Graphics;
  private phaseText!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private logMask!: Phaser.GameObjects.Graphics;
  private actionBtns: UIButton[] = [];
  private endTurnBtn!: UIButton;
  private moveInfoText!: Phaser.GameObjects.Text;
  private undoBtn!: UIButton;

  // End-of-combat overlay (victory or defeat) — kept for re-layout on resize
  private endGfx: Phaser.GameObjects.Graphics | null = null;
  private endText: Phaser.GameObjects.Text | null = null;
  private endBtn: UIButton | null = null;

  /** Location id this encounter belongs to; marked complete on victory. */
  private encounterId: string | null = null;
  private returnTo: CombatReturn = { scene: 'MenuScene' };

  constructor() { super({ key: 'CombatScene' }); }

  init(data?: {
    party?: PC[];
    levelFile?: string;
    encounterId?: string;
    returnTo?: CombatReturn;
  }) {
    if (data?.party) this.party = data.party;
    this.levelFile = data?.levelFile ?? DEFAULT_LEVEL;
    this.encounterId = data?.encounterId ?? null;
    this.returnTo = data?.returnTo ?? { scene: 'MenuScene' };
  }

  create() {
    this.coords = new CoordinateSystem(this);
    this.movement = new MovementSystem();
    this.combat = new CombatSystem();

    this.terrain = new TerrainRenderer(this, this.coords);
    this.unitRenderer = new UnitRenderer(this, this.coords);
    this.rangeIndicator = new RangeIndicator(this, this.coords);
    this.vfx = new VFXRenderer(this, this.coords);
    this.sfx = new SFXSystem(this);
    this.sfx.preload();

    this.buildUI();
    this.setupInput();
    this.watchReflow();

    this.loadLevel(this.levelFile);
  }

  protected override reflow(): void {
    this.redraw();
    this.layoutEndOverlay();
  }

  private async loadLevel(path: string): Promise<void> {
    try {
      const resp = await fetch(path);
      const data = await resp.json();

      if (data.terrainGrid) {
        this.terrainGrid = data.terrainGrid;
        this.movement.setTerrainGrid(data.terrainGrid);
        // Size the arena to the actual grid rather than leaving it at the 60x40 default.
        if (data.terrainGrid.length > 0) {
          this.coords.setArena(data.terrainGrid[0].length, data.terrainGrid.length);
        }
      }

      if (data.partySpawn && this.party.length > 0) {
        for (let i = 0; i < Math.min(this.party.length, data.partySpawn.length); i++) {
          this.party[i].x = data.partySpawn[i].x;
          this.party[i].y = data.partySpawn[i].y;
        }
      } else if (this.party.length === 0) {
        this.buildDefaultParty();
      }

      if (data.enemies && data.enemies.length > 0) {
        this.buildEnemiesFromData(data.enemies);
      } else {
        this.buildDefaultEnemies();
      }
    } catch {
      if (this.party.length === 0) this.buildDefaultParty();
      this.buildDefaultEnemies();
    }

    this.finishSetup();
  }

  private buildEnemiesFromData(spawns: Array<{ type: string; x: number; y: number; name?: string }>): void {
    this.enemies = spawns.map((s, i) => {
      const isArcher = s.type === 'skeleton_archer';
      const e = new NPC({
        id: `e${i}`, name: s.name || `Enemy-${i}`,
        hp: 1, maxHp: 1, ac: 3, strength: 0,
        x: s.x, y: s.y, radius: UNIT_RADIUS,
        color: isArcher ? 0xcc4488 : 0xcc6622,
        label: isArcher ? 'A' : undefined,
      });
      e.inventory.items.push(isArcher ? BOW : SWORD);
      return e;
    });
  }

  private finishSetup(): void {
    this.turns = new TurnSystem(this.party, this.enemies);
    this.ai = new AISystem(this.movement);

    this.turns.onPhaseChange = (_phase) => this.onPhaseChange(_phase);
    this.turns.onEnemyPhaseStart = () => this.runEnemyPhase();

    this.turns.beginPlayerTurn();
    this.logMsg(`—— Turn 1: Player Phase ——`);
    this.mode = 'move';
    this.ready = true;
    this.redraw();
  }

  private buildDefaultParty(): void {
    const defs: Array<{ cls: 'warrior' | 'thief' | 'sorcerer' | 'cleric'; name: string; x: number; y: number }> = [
      { cls: 'warrior', name: 'Ragnar', x: 8, y: 12 },
      { cls: 'thief', name: 'Skiv', x: 8, y: 18 },
      { cls: 'sorcerer', name: 'Aldric', x: 8, y: 24 },
      { cls: 'cleric', name: 'S. Mara', x: 8, y: 30 },
    ];
    const colors: Record<string, number> = { warrior: 0xe94560, thief: 0x44dd88, sorcerer: 0xaa44ee, cleric: 0xeecc44 };
    this.party = defs.map((d, i) => {
      const pc = new PC({
        id: `p${i}`, name: d.name, charClass: d.cls, level: 1,
        hp: d.cls === 'warrior' ? 2 : 1, maxHp: d.cls === 'warrior' ? 2 : 1,
        ac: 4, stamina: 1, maxStamina: 1,
        skills: { strength: d.cls === 'warrior' ? 1 : 0, dexterity: d.cls === 'thief' ? 1 : 0, intelligence: d.cls === 'sorcerer' ? 1 : 0, wisdom: d.cls === 'cleric' ? 1 : 0 },
        x: d.x, y: d.y, radius: UNIT_RADIUS, color: colors[d.cls],
      });
      pc.inventory.items.push(d.cls === 'thief' ? BOW : SWORD);
      return pc;
    });
  }

  private buildDefaultEnemies(): void {
    const melee: Array<[number, number, string]> = [[50, 10, 'Bone-1'], [50, 20, 'Bone-2'], [50, 30, 'Bone-3']];
    const archers: Array<[number, number, string]> = [[55, 14, 'Bow-1'], [55, 26, 'Bow-2']];
    let idx = 0;
    this.enemies = [
      ...melee.map(([x, y, name]) => {
        const e = new NPC({ id: `e${idx++}`, name, hp: 1, maxHp: 1, ac: 3, strength: 0, x, y, radius: UNIT_RADIUS, color: 0xcc6622 });
        e.inventory.items.push(SWORD);
        return e;
      }),
      ...archers.map(([x, y, name]) => {
        const e = new NPC({ id: `e${idx++}`, name, hp: 1, maxHp: 1, ac: 3, strength: 0, x, y, radius: UNIT_RADIUS, color: 0xcc4488, label: 'A' });
        e.inventory.items.push(BOW);
        return e;
      }),
    ];
  }

  private buildUI(): void {
    this.topBar = new TopBar(this, this.coords, {
      party: this.party,
      onOptions: () => this.openOptions(),
      onInventory: () => this.openInventory(),
      // Combat's only additions to the shared bar: the turn-done tick and dimming.
      decoratePC: (pc) => pc.turnDone ? { suffix: ' ✓', alpha: 0.4 } : {},
    });

    this.panelGfx = this.add.graphics().setDepth(8);
    this.phaseText = this.add.text(0, 0, '', { fontSize: '14px', color: '#ffffff' }).setDepth(9);
    this.logText = this.add.text(0, 0, '', { fontSize: '10px', color: '#bbbbbb', wordWrap: { width: 200 } }).setDepth(9);
    this.logMask = this.add.graphics().setDepth(9);
    this.moveInfoText = this.add.text(0, 0, '', { fontSize: '10px', color: '#66aa77' }).setDepth(9);

    for (let i = 0; i < 5; i++) {
      const idx = i;
      const btn = new UIButton(this, 0, 0, {
        text: '', width: 110, height: 26, fontSize: 11,
        ...BUTTON_CHROME,
        onClick: () => this.handleActionButton(idx),
      });
      btn.setDepth(10).setVisible(false);
      this.actionBtns.push(btn);
    }

    this.endTurnBtn = new UIButton(this, 0, 0, {
      text: 'END TURN', width: 110, height: 28, fontSize: 11,
      ...BUTTON_BACK,
      onClick: () => this.endCurrentTurn(),
    });
    this.endTurnBtn.setDepth(10);

    this.undoBtn = new UIButton(this, 0, 0, {
      text: 'UNDO MOVE', width: 110, height: 28, fontSize: 11,
      bgColor: 0x1a1a0a, hoverColor: 0x2a2a14, pressedColor: 0x3a3a1e,
      borderColor: 0x444422, borderHoverColor: 0x888844,
      textColor: '#aaaa44', textHoverColor: '#dddd66',
      onClick: () => this.undoMove(),
    });
    this.undoBtn.setDepth(10).setVisible(false);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.ready || this.animating || this.turns.phase !== 'player') return;
      // Buttons don't stop propagation; without this a click on one would also
      // fall through to the battlefield. Currently safe by geometry alone.
      if (this.input.hitTestPointer(pointer).length > 0) return;
      const worldPos = this.coords.screenToWorld(pointer.x, pointer.y);
      const inGame = this.coords.isInGameArea(pointer.x, pointer.y);
      if (!inGame) return;

      if (this.mode === 'targeting') {
        this.handleTargetClick(worldPos);
      } else {
        if (this.trySelectPC(worldPos)) return;
        if (this.mode === 'move') {
          this.handleMoveClick(worldPos);
        }
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.ready) return;
      if (this.mode !== 'targeting' || !this.activeAction || this.activeAction.target !== 'cone') return;
      const pc = this.turns.selectedPC;
      if (!pc) return;
      const worldPos = this.coords.screenToWorld(pointer.x, pointer.y);
      this.coneAngle = Math.atan2(worldPos.y - pc.y, worldPos.x - pc.x);
      this.redraw();
    });

    this.input.keyboard!.on('keydown-ENTER', () => this.endCurrentTurn());
    this.input.keyboard!.on('keydown-G', () => {
      GameOptions.showGrid = !GameOptions.showGrid;
      this.redraw();
    });
    this.input.keyboard!.on('keydown-I', () => this.openInventory());

    // Log scrolling via mouse wheel over the panel
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _dx: number, _dy: number, dz: number) => {
      const maxScroll = Math.max(0, this.log.length - 10);
      this.logScroll = Math.max(0, Math.min(maxScroll, this.logScroll - Math.sign(dz)));
      this.drawLog();
    });
  }

  private endCurrentTurn(): void {
    if (!this.ready || this.animating || this.turns.phase !== 'player') return;
    const pc = this.turns.selectedPC;
    if (!pc || pc.turnDone) return;
    this.logMsg(`${pc.name} ends turn.`);
    this.undoSnapshot = null;
    this.activeAction = null;
    this.turns.endCharTurn(pc);
    if (this.turns.phase === 'player') {
      this.mode = 'move';
    } else {
      this.mode = 'select';
    }
    this.redraw();
  }

  private invalidateUndo(): void {
    if (this.undoSnapshot && !this.undoSnapshot.hasActedBefore) {
      this.undoSnapshot = null;
    }
  }

  private undoMove(): void {
    if (!this.undoSnapshot) return;
    const pc = this.party.find(c => c.id === this.undoSnapshot!.pcId);
    if (!pc) return;
    pc.x = this.undoSnapshot.x;
    pc.y = this.undoSnapshot.y;
    pc.facing = this.undoSnapshot.facing;
    pc.stamina = this.undoSnapshot.stamina;
    pc.movesUsedThisTurn = this.undoSnapshot.movesUsedThisTurn;
    pc.staminaMovesThisTurn = this.undoSnapshot.staminaMovesThisTurn;
    this.undoSnapshot = null;
    this.mode = 'move';
    this.activeAction = null;
    this.logMsg(`${pc.name} undid move.`);
    this.redraw();
  }

  private trySelectPC(worldPos: { x: number; y: number }): boolean {
    const clicked = this.party.find(c => !c.dead && !c.status.includes('beaten') && !c.turnDone &&
      this.movement.distance(c, worldPos) <= c.radius);
    if (!clicked || clicked === this.turns.selectedPC) return false;
    this.turns.selectPC(clicked);
    this.mode = 'move';
    this.activeAction = null;
    this.undoSnapshot = null;
    this.redraw();
    return true;
  }

  private handleMoveClick(worldPos: { x: number; y: number }): void {
    const pc = this.turns.selectedPC;
    if (!pc) return;

    const blockers = this.getAllBlockers(pc);
    const resolved = this.movement.resolveMove(pc, worldPos, blockers);

    const dist = this.movement.distance(pc, resolved);
    if (dist < 0.05) return;

    if (dist > this.movement.maxMoveRange(pc)) return;
    const cost = this.movement.staminaCost(pc, dist);
    if (cost > pc.stamina) return;

    this.undoSnapshot = {
      pcId: pc.id,
      x: pc.x, y: pc.y, facing: pc.facing,
      stamina: pc.stamina, movesUsedThisTurn: pc.movesUsedThisTurn,
      staminaMovesThisTurn: pc.staminaMovesThisTurn,
      hasActedBefore: pc.hasActed,
    };

    const oldX = pc.x;
    const oldY = pc.y;
    pc.stamina -= cost;
    pc.staminaMovesThisTurn += cost;
    pc.movesUsedThisTurn += dist;
    pc.facing = this.movement.facingFrom(pc, resolved);
    pc.x = resolved.x;
    pc.y = resolved.y;
    this.disperseSaltBodies(oldX, oldY, pc.x, pc.y);

    const moveType = cost > 0 ? `moves (-${cost} stam)` : 'moves';
    this.logMsg(`${pc.name} ${moveType} ${dist.toFixed(1)} units.`);
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private getAllBlockers(exclude: PC): Array<{ x: number; y: number; radius: number }> {
    const blockers: Array<{ x: number; y: number; radius: number }> = [];
    for (const c of this.party) {
      if (c !== exclude && !c.dead) blockers.push(c);
    }
    for (const e of this.enemies) {
      blockers.push(e);
    }
    for (const obs of this.obstacles) {
      blockers.push(obs);
    }
    return blockers;
  }

  private checkAutoEndTurn(pc: PC): void {
    if (!GameOptions.autoEndTurn) return;
    if (pc.hasActed && pc.stamina <= 0) {
      this.time.delayedCall(100, () => {
        if (pc.turnDone) return;
        this.logMsg(`${pc.name} auto-ends turn.`);
        this.undoSnapshot = null;
        this.activeAction = null;
        this.turns.endCharTurn(pc);
        if (this.turns.phase === 'player') {
          this.mode = 'move';
        } else {
          this.mode = 'select';
        }
        this.redraw();
      });
    }
  }

  private handleActionButton(index: number): void {
    const pc = this.turns.selectedPC;
    if (!pc) return;
    const actions = pc.availableActions({ party: this.party, enemies: this.enemies, obstacles: this.obstacles });
    const action = actions[index];
    if (!action) return;

    if (this.activeAction === action) {
      this.logMsg(`${pc.name} cancels ${action.label}.`);
      this.mode = 'move';
      this.activeAction = null;
      this.redraw();
      return;
    }

    if (!action.canUse(pc, { party: this.party, enemies: this.enemies, obstacles: this.obstacles })) return;

    if (action.target === 'self') {
      this.executeSelfAction(pc, action);
    } else if (action.target === 'area') {
      this.executeAreaAction(pc, action);
    } else {
      this.mode = 'targeting';
      this.activeAction = action;
      this.attacksRemaining = action.attacks ?? 1;
      if (action.target === 'cone') {
        this.coneAngle = pc.facing;
      }
      this.redraw();
    }
  }

  private executeSelfAction(pc: PC, action: Action): void {
    pc.stamina--;
    pc.hasActed = true;
    this.invalidateUndo();

    switch (action.id) {
      case 'defend':
        this.combat.addStatus(pc, 'defending');
        this.logMsg(`${pc.name} defends (+1 AC) (-1 stam).`);
        break;
      case 'ward':
        this.combat.addWard(pc);
        this.logMsg(`${pc.name} casts Ward (${pc.wardStacks}/3) (-1 stam).`);
        break;
    }

    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private executeAreaAction(_pc: PC, _action: Action): void {
    // Reserved for future whirlwind-type abilities
    this.mode = 'move';
    this.activeAction = null;
    this.redraw();
  }

  private handleTargetClick(worldPos: { x: number; y: number }): void {
    const pc = this.turns.selectedPC;
    if (!pc || !this.activeAction) return;

    if (this.activeAction.target === 'enemy') {
      this.resolveEnemyTarget(pc, worldPos);
    } else if (this.activeAction.target === 'ally') {
      this.resolveAllyTarget(pc, worldPos);
    } else if (this.activeAction.target === 'cone') {
      this.resolveConeAttack(pc);
    }
  }

  private resolveConeAttack(pc: PC): void {
    const range = this.getActionRange(pc, this.activeAction!);
    const targets = this.enemies.filter(e => {
      const dist = this.movement.distance(pc, e);
      if (dist - e.radius > range) return false;
      const angleToEnemy = Math.atan2(e.y - pc.y, e.x - pc.x);
      let diff = angleToEnemy - this.coneAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const angularRadius = dist > 0 ? Math.asin(Math.min(1, e.radius / dist)) : Math.PI;
      return Math.abs(diff) <= Math.PI / 2 + angularRadius;
    });

    if (targets.length === 0) {
      this.logMsg(`${pc.name} — no enemies in cone!`);
      return;
    }

    pc.stamina--;
    pc.hasActed = true;
    this.invalidateUndo();
    this.logMsg(`${pc.name} uses FRENZY (-1 stam)!`, 'frenzy');

    for (const target of targets) {
      const result = this.combat.attack(pc, target, pc.skills.strength, pc.weaponDamage);
      if (result.wardBlocked) {
        this.logMsg(`  → ${target.name}: blocked by Ward!`);
      } else if (result.hit) {
        this.addBloodAt(target.x, target.y);
        this.logMsg(`  → ${target.name}: HIT (${result.total} vs AC${result.targetAC}) -${result.damage}HP`, 'hit');
        if (result.killed || result.beaten) {
          this.logMsg(`  → ${target.name} destroyed!`, 'deathMonster');
          this.killEnemy(target);
        }
      } else {
        this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
      }
    }

    if (this.turns.checkVictory()) { this.onVictory(); return; }
    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private resolveEnemyTarget(pc: PC, worldPos: { x: number; y: number }): void {
    const action = this.activeAction!;
    const target = this.enemies.find(e =>
      this.movement.distance(e, worldPos) <= e.radius + 0.5
    );
    if (!target) return;

    const range = this.getActionRange(pc, action);
    if (this.movement.distance(pc, target) - target.radius > range) return;

    const isPhysicalRanged = pc.inventory.equippedWeaponType() === 'ranged' &&
      (action.id === 'attack' || action.id === 'trick_shot');
    if (isPhysicalRanged && !this.movement.hasLineOfSight(pc, target)) {
      this.logMsg(`No line of sight to ${target.name}!`);
      return;
    }

    if (this.attacksRemaining === (action.attacks ?? 1)) {
      pc.stamina--;
      pc.hasActed = true;
      this.invalidateUndo();
      this.logMsg(`${pc.name} uses ${action.label} (-1 stam).`);
    }

    switch (action.id) {
      case 'attack':
      case 'trick_shot':
        this.resolveAttack(pc, target);
        break;
      case 'curse':
        this.resolveCurse(pc, target);
        break;
      default:
        this.resolveAttack(pc, target);
        break;
    }

    this.attacksRemaining--;

    if (this.turns.checkVictory()) { this.onVictory(); return; }

    if (this.attacksRemaining > 0 && this.enemies.length > 0) {
      this.logMsg(`  (${this.attacksRemaining} shot${this.attacksRemaining > 1 ? 's' : ''} remaining)`);
      this.redraw();
    } else {
      this.mode = 'move';
      this.activeAction = null;
      this.checkAutoEndTurn(pc);
      this.redraw();
    }
  }

  private resolveAttack(pc: PC, target: NPC): void {
    const isRanged = pc.inventory.equippedWeaponType() === 'ranged';
    if (isRanged) this.vfx.arrowTrail(pc.x, pc.y, target.x, target.y);
    const skill = isRanged ? pc.skills.dexterity : pc.skills.strength;
    const result = this.combat.attack(pc, target, skill, pc.weaponDamage);

    if (result.wardBlocked) {
      this.logMsg(`  → ${target.name}: blocked by Ward!`);
    } else if (result.hit) {
      this.addBloodAt(target.x, target.y);
      this.logMsg(`  → ${target.name}: HIT (${result.roll}+${skill}=${result.total} vs AC${result.targetAC}) -${result.damage}HP`, isRanged ? 'hitRanged' : 'hit');
      if (result.killed || result.beaten) {
        this.logMsg(`  → ${target.name} destroyed!`, 'deathMonster');
        this.killEnemy(target);
      }
    } else {
      this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
    }
  }

  private resolveCurse(pc: PC, target: NPC): void {
    this.vfx.curseBolt(pc.x, pc.y, target.x, target.y);
    const result = this.combat.curse(target, pc.skills.intelligence);
    if (result.wardBlocked) {
      this.logMsg(`  → ${target.name}: blocked by Ward!`);
    } else if (result.salted) {
      this.logMsg(`  → ${target.name}: HIT (${result.total} vs AC${result.targetAC}) TURNED TO SALT!`, 'curse');
      this.saltBodies.push({ x: target.x, y: target.y, radius: target.radius });
      this.killEnemy(target);
    } else {
      this.logMsg(`  → ${target.name}: MISS (${result.total} vs AC${result.targetAC})`, 'miss');
    }
  }

  private resolveAllyTarget(pc: PC, worldPos: { x: number; y: number }): void {
    const action = this.activeAction!;
    const target = this.party.find(c =>
      c !== pc && !c.dead && this.movement.distance(c, worldPos) <= c.radius + 0.5
    );
    if (!target) return;

    const range = this.getActionRange(pc, action);
    if (this.movement.distance(pc, target) - target.radius > range) return;

    switch (action.id) {
      case 'heal': {
        if (target.hp >= target.maxHp) return;
        pc.stamina--;
        pc.hasActed = true;
        this.invalidateUndo();
        const amount = 1 + pc.skills.wisdom;
        const healed = this.combat.heal(target, amount);
        const revived = target.hp > 0 && healed > 0 && target.hp === healed;
        if (revived) target.turnDone = false;
        this.vfx.healGlow(target.x, target.y);
        this.logMsg(`${pc.name} heals ${target.name} +${healed}HP (-1 stam)${revived ? ' — REVIVED!' : ''}`, 'heal');
        break;
      }
      case 'bless': {
        if (target.hp <= 0) return;
        pc.stamina--;
        pc.hasActed = true;
        this.invalidateUndo();
        this.combat.addStatus(target, 'blessed');
        this.vfx.blessGlow(target.x, target.y);
        this.logMsg(`${pc.name} blesses ${target.name} (+1 rolls) (-1 stam).`, 'bless');
        break;
      }
    }

    this.mode = 'move';
    this.activeAction = null;
    this.checkAutoEndTurn(pc);
    this.redraw();
  }

  private getActionRange(pc: PC, action: Action): number {
    if (action.numericRange !== undefined) return action.numericRange;
    if (action.id === 'attack') {
      const isRanged = pc.inventory.equippedWeaponType() === 'ranged';
      return isRanged ? RANGED_RANGE : MELEE_RANGE;
    }
    if (action.range === 'ranged') return RANGED_RANGE;
    return MELEE_RANGE;
  }

  private killEnemy(enemy: NPC): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx >= 0) this.enemies.splice(idx, 1);
  }

  private runEnemyPhase(): void {
    this.logMsg(`—— Turn ${this.turns.turn}: Enemy Phase ——`);
    this.animating = true;
    let delay = 0;

    this.enemies.forEach((e, i) => {
      delay += 500;
      this.time.delayedCall(delay, () => {
        const actions = this.ai.decideActions(e, this.party, this.obstacles);
        for (const action of actions) {
          if (action.type === 'move' && action.destination) {
            const prevX = e.x, prevY = e.y;
            e.facing = this.movement.facingFrom(e, action.destination);
            e.x = action.destination.x;
            e.y = action.destination.y;
            this.disperseSaltBodies(prevX, prevY, e.x, e.y);
            this.logMsg(`${e.name} moves.`);
          } else if ((action.type === 'attack' || action.type === 'ranged_attack') && action.target) {
            if (action.type === 'ranged_attack' && !this.movement.hasLineOfSight(e, action.target)) {
              this.logMsg(`${e.name} has no line of sight.`);
              continue;
            }
            if (action.type === 'ranged_attack') this.vfx.arrowTrail(e.x, e.y, action.target.x, action.target.y);
            const result = this.combat.attack(e, action.target, e.strength, e.weaponDamage, true);
            if (result.hit) {
              this.addBloodAt(action.target.x, action.target.y);
              this.logMsg(`${e.name} hits ${action.target.name}! (${result.total} vs AC${result.targetAC}) -${result.damage}HP`, 'hit');
              if (result.beaten) this.logMsg(`  → ${action.target.name} is BEATEN!`, 'deathHero');
              if (result.killed) this.logMsg(`  → ${action.target.name} is SLAIN!`, 'deathHero');
            } else {
              this.logMsg(`${e.name} misses ${action.target.name}. (${result.total} vs AC${result.targetAC})`, 'miss');
            }
          }
        }
        this.redraw();

        if (i === this.enemies.length - 1) {
          this.time.delayedCall(400, () => {
            this.animating = false;
            if (this.turns.checkDefeat()) {
              const dur = this.logMsg('✗ DEFEAT', 'defeat');
              this.redraw();
              this.time.delayedCall(Math.max(dur, 500), () => this.showDefeatOverlay());
              return;
            }
            this.turns.endEnemyPhase();
            this.logMsg(`—— Turn ${this.turns.turn}: Player Phase ——`);
            this.mode = 'move';
            this.redraw();
          });
        }
      });
    });

    if (this.enemies.length === 0) {
      this.time.delayedCall(400, () => {
        this.animating = false;
        this.turns.endEnemyPhase();
        this.mode = 'move';
        this.redraw();
      });
    }
  }

  private onPhaseChange(_phase: GamePhase): void {
    this.redraw();
  }

  private redraw(): void {
    // TurnSystem doesn't exist until finishSetup; a resize mid-load would throw.
    if (!this.ready) return;

    this.terrain.draw(this.obstacles, this.terrainGrid ?? undefined, this.tileOverlays, this.saltBodies);
    this.unitRenderer.draw(this.party, this.enemies, this.turns.selectedPC?.id ?? null);

    this.rangeIndicator.clear();
    const pc = this.turns.selectedPC;
    if (pc && this.turns.phase === 'player') {
      if (this.mode === 'move') {
        const freeRange = this.movement.freeRange(pc);
        const totalRange = this.movement.maxMoveRange(pc);
        this.rangeIndicator.drawMoveRange(pc.x, pc.y, freeRange, totalRange);
      } else if (this.mode === 'targeting' && this.activeAction) {
        const range = this.getActionRange(pc, this.activeAction);
        if (this.activeAction.target === 'cone') {
          this.rangeIndicator.drawCone(pc.x, pc.y, range, this.coneAngle, Math.PI / 2);
        } else if (this.activeAction.target === 'ally') {
          this.rangeIndicator.drawHealRange(pc.x, pc.y, range);
        } else if (this.activeAction.target === 'enemy') {
          this.rangeIndicator.drawAttackRange(pc.x, pc.y, range);
        }
      }
    }

    this.drawUI();
  }

  private drawUI(): void {
    this.topBar.layout();
    this.drawSidePanel();
    this.drawLog();
  }

  /**
   * Height of one action button. Shared with drawLog() so the log's top edge
   * lands flush under the button stack — these were computed independently
   * from different bases and disagreed.
   */
  private actionButtonHeight(): number {
    return Math.max(22, this.coords.canvasHeight * 0.032);
  }

  private drawSidePanel(): void {
    const h = this.coords.canvasHeight;
    const panel = this.coords.regionPixels(LAYOUT.sidePanel);

    this.panelGfx.clear();
    this.panelGfx.fillStyle(0x080814, 0.95);
    this.panelGfx.fillRect(panel.x, panel.y, panel.w, panel.h);
    this.panelGfx.lineStyle(1, 0x334466);
    this.panelGfx.lineBetween(panel.x, panel.y, panel.x, panel.y + panel.h);

    // Phase text
    const phaseLabel = this.turns.phase === 'victory' ? '★ VICTORY ★' : this.turns.phase === 'defeat' ? '✗ DEFEAT' : `Turn ${this.turns.turn} — ${this.turns.phase.toUpperCase()}`;
    this.phaseText.setPosition(panel.x + 8, panel.y + 8).setText(phaseLabel).setFontSize(this.coords.fontSize(0.02));

    // Movement / stamina info for selected PC
    const pc = this.turns.selectedPC;
    if (pc) {
      const freeLeft = Math.max(0, 8 - pc.movesUsedThisTurn);
      this.moveInfoText.setPosition(panel.x + 8, panel.y + h * 0.05)
        .setText(`Move: ${freeLeft.toFixed(1)} free  |  Stamina: ${pc.stamina}/${pc.maxStamina}`)
        .setFontSize(this.coords.fontSize(0.014))
        .setVisible(true);
    } else {
      this.moveInfoText.setVisible(false);
    }

    // Action buttons
    const actions = pc ? pc.availableActions({ party: this.party, enemies: this.enemies, obstacles: this.obstacles }) : [];
    const btnW = Math.max(90, panel.w * 0.85);
    const btnH = this.actionButtonHeight();
    const btnFontSize = this.coords.fontSize(0.015);
    const btnStartY = panel.y + h * 0.09 + btnH * 0.5;
    const btnGap = btnH + 4;

    for (let i = 0; i < this.actionBtns.length; i++) {
      const btn = this.actionBtns[i];
      if (i < actions.length && pc) {
        const isActive = this.activeAction === actions[i];
        const canUse = isActive || actions[i].canUse(pc, { party: this.party, enemies: this.enemies, obstacles: this.obstacles });
        const label = isActive ? `CANCEL ${actions[i].label}` : actions[i].label;
        btn.setVisible(true);
        btn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(btnStartY + i * btnGap));
        btn.resize(btnW, btnH, btnFontSize);
        btn.setText(label);
        btn.setEnabled(canUse);
        btn.setSelected(isActive);
      } else {
        btn.setVisible(false);
      }
    }

    // End turn button
    const endY = btnStartY + actions.length * btnGap + 8;
    this.endTurnBtn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(endY));
    this.endTurnBtn.resize(btnW, btnH, btnFontSize);
    this.endTurnBtn.setText(pc ? `END ${pc.name.toUpperCase()}'S TURN` : 'END TURN');
    this.endTurnBtn.setVisible(this.turns.phase === 'player');
    this.endTurnBtn.setEnabled(!!pc && !pc.turnDone);

    // Undo button
    if (this.undoSnapshot) {
      const undoY = endY + btnGap + 4;
      this.undoBtn.setPosition(Math.round(panel.x + panel.w / 2), Math.round(undoY));
      this.undoBtn.resize(btnW, btnH, btnFontSize);
      this.undoBtn.setVisible(true);
    } else {
      this.undoBtn.setVisible(false);
    }

  }

  private drawLog(): void {
    const panel = this.coords.regionPixels(LAYOUT.sidePanel);
    const btnH = this.actionButtonHeight();
    const logTop = panel.y + panel.h * 0.45 + btnH * 0.7;
    const logH = panel.h * 0.53;
    const fontSize = this.coords.fontSize(0.013);
    const maxVisible = 10;

    // Clamp scroll
    const maxScroll = Math.max(0, this.log.length - maxVisible);
    this.logScroll = Math.max(0, Math.min(maxScroll, this.logScroll));

    const visibleLines = this.log.slice(this.logScroll, this.logScroll + maxVisible);
    this.logText.setPosition(panel.x + 8, logTop)
      .setText(visibleLines.join('\n'))
      .setFontSize(fontSize)
      .setWordWrapWidth(panel.w - 24);

    // Draw scrollbar
    this.logMask.clear();
    if (this.log.length > maxVisible) {
      const barX = panel.x + panel.w - 8;
      const barH = logH;
      const thumbH = Math.max(20, barH * (maxVisible / this.log.length));
      const thumbY = logTop + (this.logScroll / maxScroll) * (barH - thumbH);

      this.logMask.fillStyle(0x222233, 0.5);
      this.logMask.fillRect(barX, logTop, 4, barH);
      this.logMask.fillStyle(0x5566aa, 0.8);
      this.logMask.fillRect(barX, thumbY, 4, thumbH);
    }
  }

  private addBloodAt(x: number, y: number): void {
    const col = Math.floor(x);
    const row = Math.floor(y);
    const key = `${col},${row}`;
    if (!this.tileOverlays.has(key)) {
      this.tileOverlays.set(key, 'blood');
    }
  }

  private disperseSaltBodies(fromX: number, fromY: number, toX: number, toY: number): void {
    for (let i = this.saltBodies.length - 1; i >= 0; i--) {
      const body = this.saltBodies[i];
      if (this.linePassesNearPoint(fromX, fromY, toX, toY, body.x, body.y, body.radius + UNIT_RADIUS)) {
        const col = Math.floor(body.x);
        const row = Math.floor(body.y);
        this.tileOverlays.set(`${col},${row}`, 'salt');
        this.logMsg(`A salt body crumbles to dust.`);
        this.saltBodies.splice(i, 1);
      }
    }
  }

  private linePassesNearPoint(ax: number, ay: number, bx: number, by: number, px: number, py: number, threshold: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((ax - px) ** 2 + (ay - py) ** 2) < threshold;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.sqrt((cx - px) ** 2 + (cy - py) ** 2) < threshold;
  }

  private openOptions(): void {
    this.scene.launch('OptionsScene', { returnTo: this.scene.key, overlay: true });
    this.scene.pause();
  }

  private openInventory(): void {
    this.scene.launch('InventoryScene', { returnTo: this.scene.key, overlay: true, party: this.party });
    this.scene.pause();
  }

  private logMsg(msg: string, sfx?: SFXId): number {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
    this.logScroll = Math.max(0, this.log.length - 10);
    if (sfx) return this.sfx.play(sfx);
    return 0;
  }

  /** Single victory path — reached from every kill that empties the field. */
  private onVictory(): void {
    if (this.encounterId) WorldState.markComplete(this.encounterId);
    const dur = this.logMsg('★ VICTORY ★', 'victory');
    this.mode = 'select';
    this.activeAction = null;
    this.redraw();
    this.time.delayedCall(Math.max(dur, 500), () => this.showVictoryOverlay());
  }

  private showDefeatOverlay(): void {
    this.showEndOverlay('DEFEATED', '#aa2222', 'ACCEPT DEATH', () => {
      this.scene.start('MenuScene');
    });
  }

  private showVictoryOverlay(): void {
    this.showEndOverlay('★ VICTORY ★', '#ddcc44', 'BACK 2 WORLD', () => this.leaveCombat());
  }

  /**
   * Hand the party back to wherever this encounter came from. Defaults to the
   * world map tile that triggered it; `returnTo` can override the destination.
   */
  private leaveCombat(): void {
    const dest = this.returnTo;
    if (dest.scene === 'WorldMapScene') {
      if (dest.mapFile) WorldState.mapFile = dest.mapFile;
      if (dest.tile) WorldState.partyTile = { x: dest.tile.x, y: dest.tile.y };
      this.scene.start('WorldMapScene', { party: this.party, mapFile: WorldState.mapFile });
    } else {
      this.scene.start(dest.scene, { party: this.party });
    }
  }

  /** Victory and defeat differ only in wording and colour. */
  private showEndOverlay(
    title: string,
    titleColor: string,
    buttonText: string,
    onClick: () => void,
  ): void {
    this.endGfx = this.add.graphics().setDepth(50);

    this.endText = this.add.text(0, 0, title, {
      color: titleColor,
      fontStyle: 'bold',
      fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(51);

    this.endBtn = new UIButton(this, 0, 0, {
      text: buttonText,
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x662222, borderHoverColor: 0xaa4444,
      textColor: '#cc6644', textHoverColor: '#ffaa66',
      onClick,
    });
    this.endBtn.setDepth(51);

    this.layoutEndOverlay();
  }

  /** Separate from creation so the overlay survives a resize. */
  private layoutEndOverlay(): void {
    if (!this.endGfx || !this.endText || !this.endBtn) return;

    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    this.endGfx.clear();
    this.endGfx.fillStyle(0x000000, 0.85);
    this.endGfx.fillRect(0, 0, w, h);

    this.endText
      .setPosition(Math.round(w / 2), Math.round(h * 0.35))
      .setFontSize(this.coords.fontSize(0.08));

    this.endBtn.setPosition(Math.round(w / 2), Math.round(h * 0.55));
    this.endBtn.resize(
      Math.max(200, w * 0.2),
      Math.max(40, h * 0.06),
      this.coords.fontSize(0.025),
    );
  }
}
