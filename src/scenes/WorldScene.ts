import Phaser from 'phaser';
import type { GamePhase, CharacterClass, GameState } from '../types';
import { PC } from '../entities/PC';
import { NPC } from '../entities/NPC';
import { LEATHER_ARMOR, MAIL_ARMOR, SWORD, BOW } from '../data/items';

const TILE       = 32;
const COLS       = 20;
const ROWS       = 15;
const TOP_BAR    = 60;
const MOVE_SPEED = 4;
const PANEL_X    = 644;
const AP_W       = 168;
const TAB_W      = Math.floor((AP_W - 3) / 2);
const AP_H       = 165;
const AP_D       = 20;

const CLASS_COLOR: Record<CharacterClass, number> = {
  warrior:  0xe94560,
  thief:    0x44dd88,
  sorcerer: 0xaa44ee,
  cleric:   0xeecc44,
};
const CLASS_LABEL: Record<CharacterClass, string> = {
  warrior: 'W', thief: 'T', sorcerer: 'S', cleric: 'C',
};

export class WorldScene extends Phaser.Scene {
  // ── Game state ─────────────────────────────────────────────────────────────
  private party:   PC[]      = [];
  private enemies: NPC[]     = [];
  private phase:   GamePhase = 'player';
  private turn     = 1;
  private log:     string[]  = [];

  // ── Selection / ActionsPanel state ────────────────────────────────────────
  private selectedChar:   PC | null                          = null;
  private apMode:         'move' | 'actions' | 'attacking' | 'healing' = 'move';
  private apVisible       = false;
  private apX             = 0;
  private apY             = 0;
  private reachableTiles  = new Map<string, number>();
  private attackableTiles = new Set<string>();
  private healableTiles   = new Set<string>();

  // ── Graphics ───────────────────────────────────────────────────────────────
  private mapGfx!: Phaser.GameObjects.Graphics;
  private hlGfx!:  Phaser.GameObjects.Graphics;

  // ── Sprites ────────────────────────────────────────────────────────────────
  private partyRects: Phaser.GameObjects.Rectangle[] = [];
  private partyTxts:  Phaser.GameObjects.Text[]      = [];
  private enemyRects: Phaser.GameObjects.Rectangle[] = [];
  private enemyTxts:  Phaser.GameObjects.Text[]      = [];

  // ── Overlay ────────────────────────────────────────────────────────────────
  private overlayPhase!:  Phaser.GameObjects.Text;
  private overlayLog!:    Phaser.GameObjects.Text;
  private partyHpTxts:    Phaser.GameObjects.Text[] = [];

  // ── ActionsPanel elements ──────────────────────────────────────────────────
  private apBg!:         Phaser.GameObjects.Graphics;
  private apHeader!:     Phaser.GameObjects.Text;
  private apStats!:      Phaser.GameObjects.Text;
  private apMoveTab!:    Phaser.GameObjects.Rectangle;
  private apMoveTabLbl!: Phaser.GameObjects.Text;
  private apActsTab!:    Phaser.GameObjects.Rectangle;
  private apActsTabLbl!: Phaser.GameObjects.Text;
  private apAtkBtn!:     Phaser.GameObjects.Rectangle;
  private apAtkLbl!:     Phaser.GameObjects.Text;
  private apDefBtn!:     Phaser.GameObjects.Rectangle;
  private apDefLbl!:     Phaser.GameObjects.Text;
  private apHealBtn!:    Phaser.GameObjects.Rectangle;
  private apHealLbl!:    Phaser.GameObjects.Text;
  private apHint!:       Phaser.GameObjects.Text;
  private apCancelBtn!:  Phaser.GameObjects.Rectangle;
  private apCancelLbl!:  Phaser.GameObjects.Text;
  private apEndBtn!:     Phaser.GameObjects.Rectangle;
  private apEndLbl!:     Phaser.GameObjects.Text;

  constructor() { super({ key: 'WorldScene' }); }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create() {
    this.buildParty();
    this.buildEnemies();
    this.drawMap();
    this.buildSprites();
    this.buildOverlay();
    this.buildActionsPanel();
    this.setupInput();
    this.beginPlayerTurn();
  }

  // ── Data init ──────────────────────────────────────────────────────────────

  private buildParty() {
    const setup: [CharacterClass, string, number, number][] = [
      ['warrior',  'Ragnar',  2, 3],
      ['thief',    'Skiv',    2, 5],
      ['sorcerer', 'Aldric',  2, 7],
      ['cleric',   'S. Mara', 2, 9],
    ];
    this.party = setup.map(([cls, name, gx, gy], i) => {
      const pc = new PC({
        id: `p${i}`, name, charClass: cls, level: 1,
        hp: cls === 'warrior' ? 2 : 1,
        maxHp: cls === 'warrior' ? 2 : 1,
        ac: 4, stamina: 1, maxStamina: 1,
        skills: {
          strength:     cls === 'warrior'  ? 1 : 0,
          dexterity:    cls === 'thief'    ? 1 : 0,
          intelligence: cls === 'sorcerer' ? 1 : 0,
          wisdom:       cls === 'cleric'   ? 1 : 0,
        },
        gridX: gx, gridY: gy,
        color: CLASS_COLOR[cls], weaponDamage: 1,
      });
      pc.inventory.items.push(cls === 'warrior' ? MAIL_ARMOR : LEATHER_ARMOR);
      pc.inventory.items.push(cls === 'thief' ? BOW : SWORD);
      return pc;
    });
  }

  private buildEnemies() {
    const melee:   [number, number, string][] = [
      [17, 2, 'Bone-1'], [17, 7, 'Bone-2'], [17, 12, 'Bone-3'],
    ];
    const archers: [number, number, string][] = [
      [19, 4, 'Bow-1'], [19, 9, 'Bow-2'],
    ];

    let idx = 0;
    this.enemies = [
      ...melee.map(([gx, gy, name]) => {
        const e = new NPC({ id: `e${idx++}`, name, hp: 1, maxHp: 1, ac: 3, strength: 0, gridX: gx, gridY: gy, color: 0xcc6622, weaponDamage: 1 });
        e.inventory.items.push(SWORD);
        return e;
      }),
      ...archers.map(([gx, gy, name]) => {
        const e = new NPC({ id: `e${idx++}`, name, hp: 1, maxHp: 1, ac: 3, strength: 0, gridX: gx, gridY: gy, color: 0xcc4488, weaponDamage: 1, label: 'A' });
        e.inventory.items.push(BOW);
        return e;
      }),
    ];
  }

  // ── Map ────────────────────────────────────────────────────────────────────

  private drawMap() {
    this.mapGfx = this.add.graphics().setDepth(0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const shade = (r + c) % 2 === 0 ? 0x1a1a2e : 0x16213e;
        this.mapGfx.fillStyle(shade);
        this.mapGfx.fillRect(c * TILE, r * TILE + TOP_BAR, TILE - 1, TILE - 1);
      }
    }
  }

  // ── Sprites ────────────────────────────────────────────────────────────────

  private buildSprites() {
    this.hlGfx = this.add.graphics().setDepth(1);

    this.party.forEach(c => {
      const rect = this.add.rectangle(gx2px(c.gridX), gy2py(c.gridY), TILE - 6, TILE - 6, c.color).setDepth(2);
      const txt  = this.add.text(gx2px(c.gridX), gy2py(c.gridY), CLASS_LABEL[c.charClass], {
        fontSize: '14px', color: '#000', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(3);
      this.partyRects.push(rect);
      this.partyTxts.push(txt);
    });

    this.enemies.forEach(e => {
      const rect = this.add.rectangle(gx2px(e.gridX), gy2py(e.gridY), TILE - 6, TILE - 6, e.color).setDepth(2);
      const txt  = this.add.text(gx2px(e.gridX), gy2py(e.gridY), e.label, {
        fontSize: '14px', color: '#000', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(3);
      this.enemyRects.push(rect);
      this.enemyTxts.push(txt);
    });
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  private buildOverlay() {
    // Top control bar
    const topBar = this.add.graphics().setDepth(8);
    topBar.fillStyle(0x080814);
    topBar.fillRect(0, 0, 820, TOP_BAR);
    topBar.lineStyle(1, 0x334466);
    topBar.lineBetween(0, TOP_BAR, 820, TOP_BAR);

    // Party HP readout — four equal columns across the left of the bar
    this.party.forEach((c, i) => {
      const col = '#' + c.color.toString(16).padStart(6, '0');
      this.partyHpTxts.push(
        this.add.text(16 + i * 130, TOP_BAR / 2, '', { fontSize: '10px', color: col })
          .setOrigin(0, 0.5).setDepth(9)
      );
    });

    // Inventory button — first button in the control bar
    const invBox = this.add.rectangle(592, TOP_BAR / 2, 92, 28, 0x0d0d1a)
      .setStrokeStyle(1, 0x4455aa)
      .setInteractive({ useHandCursor: true })
      .setDepth(9);
    const invLbl = this.add.text(592, TOP_BAR / 2, '[i]nventory', {
      fontSize: '10px', color: '#aabbff',
    }).setOrigin(0.5).setDepth(10);
    invBox.on('pointerdown', () => this.scene.switch('InventoryScene'));
    invBox.on('pointerover', () => invLbl.setColor('#ffffff'));
    invBox.on('pointerout',  () => invLbl.setColor('#aabbff'));

    // Right panel (below the control bar)
    const panel = this.add.graphics().setDepth(8);
    panel.fillStyle(0x080814);
    panel.fillRect(640, TOP_BAR, 180, 480);
    panel.lineStyle(1, 0x334466);
    panel.lineBetween(640, TOP_BAR, 640, TOP_BAR + 480);

    this.overlayPhase = this.add.text(PANEL_X, TOP_BAR + 8, '', {
      fontSize: '11px', color: '#ffffff',
    }).setDepth(9);

    // History panel — sits below the ActionsPanel (which ends at TOP_BAR+190)
    const histGfx = this.add.graphics().setDepth(9);
    histGfx.lineStyle(1, 0x334466);
    histGfx.lineBetween(641, TOP_BAR + 194, 819, TOP_BAR + 194);
    histGfx.lineBetween(641, TOP_BAR + 209, 819, TOP_BAR + 209);

    this.add.text(PANEL_X, TOP_BAR + 197, 'History', {
      fontSize: '9px', color: '#667799', fontStyle: 'italic',
    }).setDepth(9);

    this.overlayLog = this.add.text(PANEL_X, TOP_BAR + 213, '', {
      fontSize: '8px', color: '#888', wordWrap: { width: AP_W },
    }).setDepth(9);

    this.add.text(PANEL_X, TOP_BAR + 462, 'A:attack  D:defend  Space:end turn', {
      fontSize: '7px', color: '#446',
    }).setDepth(9);
  }

  // ── ActionsPanel ───────────────────────────────────────────────────────────

  private buildActionsPanel() {
    this.apBg = this.add.graphics().setDepth(AP_D);

    this.apHeader    = txt(this, '', '10px', '#fff', 'bold').setDepth(AP_D + 1);
    this.apStats     = txt(this, '', '9px',  '#aaa').setDepth(AP_D + 1);

    this.apMoveTab    = this.add.rectangle(0, 0, TAB_W, 22, 0x224488).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apMoveTabLbl = txt(this, 'MOVE',    '10px', '#fff').setDepth(AP_D + 2).setOrigin(0.5);
    this.apActsTab    = this.add.rectangle(0, 0, TAB_W, 22, 0x111133).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apActsTabLbl = txt(this, 'ACTIONS', '10px', '#556688').setDepth(AP_D + 2).setOrigin(0.5);

    this.apAtkBtn = this.add.rectangle(0, 0, AP_W - 2, 22, 0x551111).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apAtkLbl = txt(this, 'ATTACK', '10px', '#ff8888').setDepth(AP_D + 2).setOrigin(0.5);
    this.apDefBtn  = this.add.rectangle(0, 0, AP_W - 2, 22, 0x115511).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apDefLbl  = txt(this, 'DEFEND', '10px', '#88ff88').setDepth(AP_D + 2).setOrigin(0.5);
    this.apHealBtn = this.add.rectangle(0, 0, AP_W - 2, 22, 0x115533).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apHealLbl = txt(this, 'HEAL',   '10px', '#88ffcc').setDepth(AP_D + 2).setOrigin(0.5);

    this.apHint      = txt(this, 'Click an enemy to attack', '9px', '#ffaa44').setDepth(AP_D + 1);
    this.apCancelBtn = this.add.rectangle(0, 0, AP_W - 2, 22, 0x333344).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apCancelLbl = txt(this, 'CANCEL', '10px', '#aaaaaa').setDepth(AP_D + 2).setOrigin(0.5);

    this.apEndBtn = this.add.rectangle(0, 0, AP_W - 2, 22, 0x443322).setOrigin(0, 0).setDepth(AP_D + 1);
    this.apEndLbl = txt(this, 'END TURN', '10px', '#ffcc88').setDepth(AP_D + 2).setOrigin(0.5);

    this.setActionsPanelVisible(false);
  }

  private setActionsPanelVisible(v: boolean) {
    [
      this.apBg, this.apHeader, this.apStats,
      this.apMoveTab, this.apMoveTabLbl, this.apActsTab, this.apActsTabLbl,
      this.apAtkBtn, this.apAtkLbl, this.apDefBtn, this.apDefLbl,
      this.apHealBtn, this.apHealLbl,
      this.apHint, this.apCancelBtn, this.apCancelLbl,
      this.apEndBtn, this.apEndLbl,
    ].forEach(el => el?.setVisible(v));
  }

  private showActionsPanel(c: PC, resetMode = true) {
    this.selectedChar = c;
    if (resetMode) this.apMode = 'move';

    this.apX = PANEL_X;
    this.apY = TOP_BAR + 50;
    this.apVisible = true;

    this.setActionsPanelVisible(true);
    this.updateActionsPanel();
    this.refreshHighlights();
  }

  private updateActionsPanel() {
    if (!this.selectedChar || !this.apVisible) return;
    const c   = this.selectedChar;
    const x   = this.apX, y = this.apY;
    const gs  = this.getGameState();
    const acts = c.availableActions(gs);

    // Background + dividers
    this.apBg.clear();
    this.apBg.fillStyle(0x0d0d22, 0.97);
    this.apBg.fillRect(x, y, AP_W, AP_H);
    this.apBg.lineStyle(1, 0x4455aa);
    this.apBg.strokeRect(x, y, AP_W, AP_H);
    this.apBg.lineStyle(1, 0x334466);
    this.apBg.lineBetween(x, y + 30, x + AP_W, y + 30);
    this.apBg.lineBetween(x, y + 54, x + AP_W, y + 54);

    // Header
    const colorHex = '#' + c.color.toString(16).padStart(6, '0');
    this.apHeader.setPosition(x + 6, y + 5).setText(c.name).setColor(colorHex);
    this.apStats.setPosition(x + 6, y + 17).setText(
      `${c.charClass.toUpperCase()}  HP:${c.hp}/${c.maxHp}  ST:${c.stamina}/${c.maxStamina}`
    );

    // Tabs
    const moveActive = this.apMode === 'move';
    const actsActive = this.apMode === 'actions' || this.apMode === 'attacking';
    this.apMoveTab.setPosition(x + 1,                   y + 31).setFillStyle(moveActive ? 0x224488 : 0x111133);
    this.apMoveTabLbl.setPosition(x + 1 + TAB_W / 2,    y + 42).setColor(moveActive ? '#ffffff' : '#556688');
    this.apActsTab.setPosition(x + 2 + TAB_W,           y + 31).setFillStyle(actsActive ? 0x224488 : 0x111133);
    this.apActsTabLbl.setPosition(x + 2 + TAB_W + TAB_W / 2, y + 42).setColor(actsActive ? '#ffffff' : '#556688');

    // Content: actions vs targeting
    const inActions   = this.apMode === 'actions';
    const inTargeting = this.apMode === 'attacking' || this.apMode === 'healing';

    const canAtk  = acts.find(a => a.id === 'attack')?.canUse(c, gs) ?? false;
    const canDef  = acts.find(a => a.id === 'defend')?.canUse(c, gs) ?? false;
    const hasHeal = acts.some(a => a.id === 'heal');
    const canHeal = acts.find(a => a.id === 'heal')?.canUse(c, gs) ?? false;

    this.apAtkBtn.setVisible(inActions).setPosition(x + 1, y + 55).setFillStyle(canAtk ? 0x551111 : 0x221111);
    this.apAtkLbl.setVisible(inActions).setPosition(x + AP_W / 2, y + 66).setColor(canAtk ? '#ff8888' : '#553333');
    this.apDefBtn.setVisible(inActions).setPosition(x + 1, y + 79).setFillStyle(canDef ? 0x115511 : 0x112211);
    this.apDefLbl.setVisible(inActions).setPosition(x + AP_W / 2, y + 90).setColor(canDef ? '#88ff88' : '#335533');
    this.apHealBtn.setVisible(inActions && hasHeal).setPosition(x + 1, y + 103).setFillStyle(canHeal ? 0x115533 : 0x112233);
    this.apHealLbl.setVisible(inActions && hasHeal).setPosition(x + AP_W / 2, y + 114).setColor(canHeal ? '#88ffcc' : '#335544');

    const hintText = this.apMode === 'healing' ? 'Click an adjacent ally to heal' : 'Click an enemy to attack';
    this.apHint.setVisible(inTargeting).setPosition(x + 6, y + 57).setText(hintText);
    this.apCancelBtn.setVisible(inTargeting).setPosition(x + 1, y + 87);
    this.apCancelLbl.setVisible(inTargeting).setPosition(x + AP_W / 2, y + 98);

    // End Turn always shown
    this.apEndBtn.setPosition(x + 1, y + 130);
    this.apEndLbl.setPosition(x + AP_W / 2, y + 141);
  }

  private hideActionsPanel() {
    this.selectedChar = null;
    this.apVisible    = false;
    this.apMode       = 'move';
    this.reachableTiles.clear();
    this.attackableTiles.clear();
    this.healableTiles.clear();
    this.setActionsPanelVisible(false);
    this.hlGfx.clear();
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => {
      if (this.phase !== 'player') return;
      const c = this.selectedChar;
      if (!c || c.dead || c.turnDone || c.status.includes('beaten')) return;
      switch (ev.code) {
        case 'KeyA': {
          const wt = c.inventory.equippedWeaponType();
          const canAtk = !c.hasActed && c.stamina > 0 &&
            (wt === 'ranged' ? this.enemies.length > 0 : this.adjEnemies(c).length > 0);
          if (canAtk) { this.apMode = 'attacking'; this.updateActionsPanel(); this.refreshHighlights(); }
          break;
        }
        case 'KeyD': if (!c.hasActed && c.stamina > 0) this.doDefend(c); break;
        case 'KeyH': {
          if (c.charClass !== 'cleric') break;
          const gs = this.getGameState();
          const canHeal = !c.hasActed && c.stamina > 0 &&
            gs.party.some(t => t !== c && t.hp > 0 && !t.status.includes('beaten') &&
              t.hp < t.maxHp && Math.abs(t.gridX - c.gridX) + Math.abs(t.gridY - c.gridY) === 1);
          if (canHeal) { this.apMode = 'healing'; this.updateActionsPanel(); this.refreshHighlights(); }
          break;
        }
        case 'Space':
        case 'Enter': this.endCharTurn(c); break;
      }
    });

    this.input.keyboard!.on('keydown-I', () => this.scene.switch('InventoryScene'));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.phase !== 'player') return;

      const px = pointer.x, py = pointer.y;

      if (this.apVisible && this.isInActionsPanel(px, py)) {
        this.handleActionsPanelClick(px - this.apX, py - this.apY);
        return;
      }

      const clicked = this.charAtPixel(px, py);
      if (clicked && !clicked.dead && !clicked.turnDone && !clicked.status.includes('beaten')) {
        this.showActionsPanel(clicked, this.selectedChar !== clicked);
        return;
      }

      if (!this.selectedChar || !this.apVisible) return;
      const tx = Math.floor(px / TILE), ty = Math.floor((py - TOP_BAR) / TILE);
      if (!inBounds(tx, ty)) return;

      if (this.apMode === 'move' && this.reachableTiles.has(`${tx},${ty}`)) {
        this.doMoveToTile(this.selectedChar, tx, ty);
      } else if (this.apMode === 'attacking' && this.attackableTiles.has(`${tx},${ty}`)) {
        const enemy = this.enemyAtGrid(tx, ty);
        if (enemy) this.executeAttack(this.selectedChar, enemy);
      } else if (this.apMode === 'healing' && this.healableTiles.has(`${tx},${ty}`)) {
        const ally = this.partyMemberAtGrid(tx, ty);
        if (ally) this.executeHeal(this.selectedChar, ally);
      }
    });
  }

  private handleActionsPanelClick(lx: number, ly: number) {
    if (!this.selectedChar) return;
    const c = this.selectedChar;

    // Tab bar  y 31..53
    if (ly >= 31 && ly <= 53) {
      this.apMode = lx <= TAB_W + 1 ? 'move' : 'actions';
      this.updateActionsPanel();
      this.refreshHighlights();
      return;
    }

    // Actions content  y 55..125
    if (this.apMode === 'actions') {
      if (ly >= 55 && ly <= 77) {
        const wt = c.inventory.equippedWeaponType();
        const canAtk = !c.hasActed && c.stamina > 0 &&
          (wt === 'ranged' ? this.enemies.length > 0 : this.adjEnemies(c).length > 0);
        if (canAtk) {
          this.apMode = 'attacking';
          this.updateActionsPanel();
          this.refreshHighlights();
        }
        return;
      }
      if (ly >= 79 && ly <= 101) {
        if (!c.hasActed && c.stamina > 0) this.doDefend(c);
        return;
      }
      if (ly >= 103 && ly <= 125) {
        const gs = this.getGameState();
        const canHeal = !c.hasActed && c.stamina > 0 &&
          gs.party.some(t => t !== c && t.hp > 0 && !t.status.includes('beaten') &&
            t.hp < t.maxHp && Math.abs(t.gridX - c.gridX) + Math.abs(t.gridY - c.gridY) === 1);
        if (canHeal) {
          this.apMode = 'healing';
          this.updateActionsPanel();
          this.refreshHighlights();
        }
        return;
      }
    }

    // Targeting cancel  y 87..109
    if ((this.apMode === 'attacking' || this.apMode === 'healing') && ly >= 87 && ly <= 109) {
      this.apMode = 'actions';
      this.updateActionsPanel();
      this.refreshHighlights();
      return;
    }

    // End Turn  y 130..152
    if (ly >= 130 && ly <= 152) {
      this.endCharTurn(c);
    }
  }

  private isInActionsPanel(px: number, py: number): boolean {
    return px >= this.apX && px <= this.apX + AP_W
        && py >= this.apY && py <= this.apY + AP_H;
  }

  // ── Highlights ─────────────────────────────────────────────────────────────

  private refreshHighlights() {
    this.hlGfx.clear();
    this.reachableTiles.clear();
    this.attackableTiles.clear();
    this.healableTiles.clear();

    const c = this.selectedChar;
    if (!c || !this.apVisible || c.dead || c.turnDone || c.status.includes('beaten')) return;

    if (this.apMode === 'move') {
      this.reachableTiles = this.computeReachable(c);
      const freeRange = c.movesUsedThisTurn === 0 ? MOVE_SPEED : 0;
      this.reachableTiles.forEach((steps, key) => {
        const [tx, ty] = key.split(',').map(Number);
        const free = steps <= freeRange;
        this.hlGfx.fillStyle(free ? 0x2255cc : 0xddaa33, free ? 0.4 : 0.35);
        this.hlGfx.fillRect(tx * TILE, ty * TILE + TOP_BAR, TILE - 1, TILE - 1);
      });
    } else if (this.apMode === 'attacking') {
      const wt = c.inventory.equippedWeaponType();
      const targets = wt === 'ranged' ? this.enemies : this.adjEnemies(c);
      targets.forEach(e => {
        const key = `${e.gridX},${e.gridY}`;
        this.attackableTiles.add(key);
        this.hlGfx.fillStyle(0xaa1111, 0.55);
        this.hlGfx.fillRect(e.gridX * TILE, e.gridY * TILE + TOP_BAR, TILE - 1, TILE - 1);
      });
    } else if (this.apMode === 'healing') {
      this.party.forEach(t => {
        if (t === c || t.hp <= 0 || t.status.includes('beaten') || t.hp >= t.maxHp) return;
        if (Math.abs(t.gridX - c.gridX) + Math.abs(t.gridY - c.gridY) !== 1) return;
        const key = `${t.gridX},${t.gridY}`;
        this.healableTiles.add(key);
        this.hlGfx.fillStyle(0x22cc88, 0.55);
        this.hlGfx.fillRect(t.gridX * TILE, t.gridY * TILE + TOP_BAR, TILE - 1, TILE - 1);
      });
    }

    this.hlGfx.lineStyle(2, 0xffffff, 1);
    this.hlGfx.strokeRect(c.gridX * TILE, c.gridY * TILE + TOP_BAR, TILE - 1, TILE - 1);
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  private computeReachable(c: PC): Map<string, number> {
    const freeBonus = c.movesUsedThisTurn === 0 ? MOVE_SPEED : 0;
    const maxSteps  = freeBonus + c.stamina * MOVE_SPEED;
    if (maxSteps <= 0) return new Map();

    const dist = new Map<string, number>();
    dist.set(`${c.gridX},${c.gridY}`, 0);
    const queue: [number, number][] = [[c.gridX, c.gridY]];
    const reachable = new Map<string, number>();

    while (queue.length > 0) {
      const [x, y] = queue.shift()!;
      const d = dist.get(`${x},${y}`)!;
      if (d >= maxSteps) continue;
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]] as [number,number][]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny) || this.occupied(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (dist.has(key)) continue;
        dist.set(key, d + 1);
        reachable.set(key, d + 1);
        queue.push([nx, ny]);
      }
    }
    return reachable;
  }

  private doMoveToTile(c: PC, tx: number, ty: number) {
    const steps       = this.reachableTiles.get(`${tx},${ty}`)!;
    const freeBonus   = c.movesUsedThisTurn === 0 ? MOVE_SPEED : 0;
    const staminaCost = Math.max(0, Math.ceil((steps - freeBonus) / MOVE_SPEED));

    c.stamina           -= staminaCost;
    c.movesUsedThisTurn += steps;
    c.gridX = tx;
    c.gridY = ty;

    const idx = this.party.indexOf(c);
    moveSprite(this.partyRects[idx], tx, ty);
    moveSprite(this.partyTxts[idx],  tx, ty);

    this.showActionsPanel(c, false);
  }

  // ── Combat actions ─────────────────────────────────────────────────────────

  private executeAttack(c: PC, target: NPC) {
    c.stamina--;
    c.hasActed = true;

    const roll = d8(), atk = roll + c.skills.strength;
    if (atk > target.ac) {
      target.hp -= c.weaponDamage;
      this.log4(`${c.name} hits ${target.name}! (${roll}+${c.skills.strength}=${atk} vs AC${target.ac}) -${c.weaponDamage}HP`);
      if (target.hp <= 0) {
        this.log4(`${target.name} destroyed!`);
        this.killEnemy(target);
        if (this.checkVictory()) { this.hideActionsPanel(); return; }
      }
    } else {
      this.log4(`${c.name} misses! (${atk} vs AC${target.ac})`);
    }

    this.apMode = 'actions';
    this.updateActionsPanel();
    this.refreshHighlights();
  }

  private doDefend(c: PC) {
    c.stamina--;
    c.hasActed = true;
    if (!c.status.includes('defending')) c.status.push('defending');
    this.log4(`${c.name} defends (+1 AC until next turn).`);
    this.apMode = 'actions';
    this.updateActionsPanel();
    this.refreshHighlights();
  }

  private endCharTurn(c: PC) {
    c.turnDone = true;
    const idx = this.party.indexOf(c);
    this.partyRects[idx].setAlpha(0.45);
    this.hideActionsPanel();
    this.refreshOverlay();

    const stillActive = this.party.filter(ch => !ch.dead && !ch.status.includes('beaten') && !ch.turnDone);
    if (stillActive.length === 0) {
      this.beginEnemyPhase();
    } else {
      const next = this.party.find((ch, i) => i > idx && !ch.dead && !ch.status.includes('beaten') && !ch.turnDone)
                ?? stillActive[0];
      this.showActionsPanel(next);
    }
  }

  // ── Turn flow ──────────────────────────────────────────────────────────────

  private beginPlayerTurn() {
    this.phase = 'player';
    this.party.forEach((c, i) => {
      if (c.dead) return;
      c.stamina           = c.maxStamina;
      c.hasActed          = false;
      c.movesUsedThisTurn = 0;
      c.turnDone          = c.status.includes('beaten');
      c.status            = c.status.filter(s => s !== 'defending');
      if (!c.dead && !c.status.includes('beaten')) this.partyRects[i].setAlpha(1);
    });
    this.log4(`—— Turn ${this.turn}: Player Phase — click a character ——`);
    this.refreshOverlay();
    const firstActive = this.party.find(c => !c.dead && !c.status.includes('beaten'));
    if (firstActive) this.showActionsPanel(firstActive);
  }

  private beginEnemyPhase() {
    this.hideActionsPanel();
    this.phase = 'enemy';
    this.log4(`—— Turn ${this.turn}: Enemy Phase ——`);
    this.refreshOverlay();

    let delay = 0;
    this.enemies.forEach((e, i) => {
      delay += 400;
      this.time.delayedCall(delay, () => {
        this.runEnemyTurn(e);
        if (i === this.enemies.length - 1) {
          this.time.delayedCall(400, () => {
            if (!this.checkDefeat()) { this.turn++; this.beginPlayerTurn(); }
          });
        }
      });
    });

    if (this.enemies.length === 0) {
      this.time.delayedCall(400, () => {
        if (!this.checkDefeat()) { this.turn++; this.beginPlayerTurn(); }
      });
    }
  }

  private runEnemyTurn(e: NPC) {
    const targets = this.party.filter(c => !c.dead && !c.status.includes('beaten'));
    if (targets.length === 0) return;
    const nearest = targets.reduce((best, c) => manhattanDist(e, c) < manhattanDist(e, best) ? c : best);

    if (e.inventory.equippedWeaponType() === 'ranged') {
      this.enemyAttack(e, nearest);
    } else if (manhattanDist(e, nearest) === 1) {
      this.enemyAttack(e, nearest);
    } else {
      this.enemyStep(e, nearest);
      if (manhattanDist(e, nearest) === 1) this.enemyAttack(e, nearest);
    }
    this.refreshOverlay();
  }

  private enemyAttack(e: NPC, target: PC) {
    const roll = d8(), atk = roll + e.strength;
    const ac   = target.effectiveAC() + (target.status.includes('defending') ? 1 : 0);

    if (atk > ac) {
      target.hp -= e.weaponDamage;
      this.log4(`${e.name} hits ${target.name}! (${atk} vs AC${ac}) -${e.weaponDamage}HP`);
      if (target.hp <= 0) {
        const idx = this.party.indexOf(target);
        if (!target.status.includes('beaten')) {
          target.status.push('beaten');
          target.hp = 0;
          this.log4(`${target.name} is BEATEN!`);
          this.partyRects[idx].setAlpha(0.3);
        } else {
          target.dead = true;
          this.log4(`${target.name} is slain!`);
          this.partyRects[idx].setVisible(false);
          this.partyTxts[idx].setVisible(false);
        }
      }
    } else {
      this.log4(`${e.name} misses ${target.name}. (${atk} vs AC${ac})`);
    }
  }

  private enemyStep(e: NPC, target: PC) {
    for (let i = 0; i < MOVE_SPEED; i++) {
      if (manhattanDist(e, target) <= 1) break;
      const dx = Math.sign(target.gridX - e.gridX);
      const dy = Math.sign(target.gridY - e.gridY);
      const moves: [number, number][] = Math.abs(target.gridX - e.gridX) >= Math.abs(target.gridY - e.gridY)
        ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
      let moved = false;
      for (const [mx, my] of moves) {
        const nx = e.gridX + mx, ny = e.gridY + my;
        if (inBounds(nx, ny) && !this.occupied(nx, ny)) {
          e.gridX = nx; e.gridY = ny;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    const idx = this.enemies.indexOf(e);
    moveSprite(this.enemyRects[idx], e.gridX, e.gridY);
    moveSprite(this.enemyTxts[idx],  e.gridX, e.gridY);
  }

  // ── Win / Loss ─────────────────────────────────────────────────────────────

  private checkVictory(): boolean {
    if (this.enemies.length > 0) return false;
    this.phase = 'victory';
    this.log4('All enemies destroyed — VICTORY!');
    this.refreshOverlay();
    return true;
  }

  private checkDefeat(): boolean {
    if (this.party.some(c => !c.dead && !c.status.includes('beaten'))) return false;
    this.phase = 'defeat';
    this.log4('The party has fallen — DEFEAT.');
    this.refreshOverlay();
    return true;
  }

  // ── Overlay ────────────────────────────────────────────────────────────────

  private refreshOverlay() {
    if (this.phase === 'player' || this.phase === 'enemy') {
      const dots = this.party.map(c => {
        const l = CLASS_LABEL[c.charClass];
        return c.dead ? `✕${l}` : c.status.includes('beaten') ? `◌${l}` : c.turnDone ? `✓${l}` : `•${l}`;
      }).join(' ');
      const phaseLabel = this.phase === 'player' ? 'PLAYER' : 'ENEMY';
      this.overlayPhase.setText(`Turn ${this.turn} — ${phaseLabel}\n${dots}`);
    } else {
      this.overlayPhase.setText(this.phase === 'victory' ? '★ VICTORY! ★' : '✗ DEFEAT...');
    }
    this.overlayLog.setText(this.log.slice(-12).join('\n'));

    this.party.forEach((c, i) => {
      const t = this.partyHpTxts[i];
      if (!t) return;
      t.setText(`${c.name}  ${c.hp}/${c.maxHp} hp`)
       .setAlpha(c.dead ? 0.3 : c.status.includes('beaten') ? 0.5 : 1);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  getParty(): PC[] { return this.party; }

  private getGameState(): GameState {
    return { party: this.party, enemies: this.enemies };
  }

  private adjEnemies(c: PC): NPC[] {
    return this.enemies.filter(e => manhattanDist(e, c) === 1);
  }

  private occupied(x: number, y: number): boolean {
    return this.party.some(c => !c.dead && c.gridX === x && c.gridY === y)
        || this.enemies.some(e => e.gridX === x && e.gridY === y);
  }

  private charAtPixel(px: number, py: number): PC | null {
    const gx = Math.floor(px / TILE), gy = Math.floor((py - TOP_BAR) / TILE);
    return this.party.find(c => !c.dead && c.gridX === gx && c.gridY === gy) ?? null;
  }

  private enemyAtGrid(gx: number, gy: number): NPC | null {
    return this.enemies.find(e => e.gridX === gx && e.gridY === gy) ?? null;
  }

  private partyMemberAtGrid(gx: number, gy: number): PC | null {
    return this.party.find(c => c.gridX === gx && c.gridY === gy && !c.dead) ?? null;
  }

  private executeHeal(caster: PC, target: PC) {
    caster.stamina--;
    caster.hasActed = true;
    const amount = 1 + caster.skills.wisdom;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    this.log4(`${caster.name} heals ${target.name} for ${amount} HP. (${target.hp}/${target.maxHp})`);
    this.apMode = 'actions';
    this.updateActionsPanel();
    this.refreshHighlights();
    this.refreshOverlay();
  }

  private killEnemy(e: NPC) {
    const i = this.enemies.indexOf(e);
    if (i < 0) return;
    this.enemyRects[i].destroy();
    this.enemyTxts[i].destroy();
    this.enemies.splice(i, 1);
    this.enemyRects.splice(i, 1);
    this.enemyTxts.splice(i, 1);
  }

  private log4(msg: string) {
    this.log.push(msg);
    if (this.log.length > 60) this.log.shift();
    if (this.overlayLog) this.overlayLog.setText(this.log.slice(-12).join('\n'));
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

function gx2px(gx: number) { return gx * TILE + TILE / 2; }
function gy2py(gy: number) { return gy * TILE + TILE / 2 + TOP_BAR; }
function inBounds(x: number, y: number) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }
function manhattanDist(a: { gridX: number; gridY: number }, b: { gridX: number; gridY: number }) {
  return Math.abs(a.gridX - b.gridX) + Math.abs(a.gridY - b.gridY);
}
function d8() { return Math.floor(Math.random() * 8) + 1; }
function moveSprite(obj: { setPosition: (x: number, y: number) => unknown }, gx: number, gy: number) {
  obj.setPosition(gx2px(gx), gy2py(gy));
}
function txt(scene: Phaser.Scene, s: string, size: string, color: string, style?: string) {
  return scene.add.text(0, 0, s, { fontSize: size, color, fontStyle: style ?? 'normal' });
}
