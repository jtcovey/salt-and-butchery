import Phaser from 'phaser';
import type { PC } from '../entities/PC';
import type { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton, BUTTON_CHROME } from './UIButton';
import { LAYOUT, MAX_PARTY_SLOTS } from '../config/constants';

export interface TopBarDecoration {
  /** Appended after the HP readout. */
  suffix?: string;
  /** Overrides alpha for a live, un-beaten PC. Dead/beaten dimming always wins. */
  alpha?: number;
}

export interface TopBarConfig {
  party: PC[];
  onOptions: () => void;
  onInventory: () => void;
  /**
   * Per-PC display override, consulted only for PCs that are alive and not
   * beaten. Combat uses it for the turn-done checkmark and dimming; the world
   * map has no turn state and omits it entirely.
   */
  decoratePC?: (pc: PC) => TopBarDecoration;
}

/**
 * The party bar across the top of the screen, plus the INVENTORY and options
 * buttons in its right corner. Shared by CombatScene and WorldMapScene.
 *
 * The owning scene calls `layout()` from its `reflow()`.
 */
export class TopBar {
  private coords: CoordinateSystem;
  private config: TopBarConfig;
  private gfx: Phaser.GameObjects.Graphics;
  private hpTexts: Phaser.GameObjects.Text[] = [];
  private inventoryBtn: UIButton;
  private optionsBtn: UIButton;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem, config: TopBarConfig) {
    this.coords = coords;
    this.config = config;

    this.gfx = scene.add.graphics().setDepth(8);

    for (let i = 0; i < MAX_PARTY_SLOTS; i++) {
      this.hpTexts.push(
        scene.add.text(0, 0, '', { fontSize: '10px', color: '#ccc' }).setDepth(9),
      );
    }

    this.inventoryBtn = new UIButton(scene, 0, 0, {
      text: 'INVENTORY', width: 160, height: 32, fontSize: 11,
      ...BUTTON_CHROME,
      onClick: () => this.config.onInventory(),
    });
    this.inventoryBtn.setDepth(10);

    this.optionsBtn = new UIButton(scene, 0, 0, {
      text: 'O', width: 32, height: 32, fontSize: 14,
      ...BUTTON_CHROME,
      onClick: () => this.config.onOptions(),
    });
    this.optionsBtn.setDepth(10);
  }

  setParty(party: PC[]): void {
    this.config.party = party;
  }

  layout(): void {
    const bar = this.coords.regionPixels(LAYOUT.topBar);

    this.gfx.clear();
    this.gfx.fillStyle(0x080814, 0.95);
    this.gfx.fillRect(bar.x, bar.y, bar.w, bar.h);
    this.gfx.lineStyle(1, 0x334466);
    this.gfx.lineBetween(0, bar.h, this.coords.canvasWidth, bar.h);

    const fontSize = this.coords.fontSize(0.018);
    const slotW = bar.w / MAX_PARTY_SLOTS;

    this.hpTexts.forEach((text, i) => {
      const pc = this.config.party[i];
      if (!pc) {
        text.setVisible(false);
        return;
      }

      // Dead/beaten dimming takes precedence over any decoration.
      const dimmed = pc.dead ? 0.3 : pc.status.includes('beaten') ? 0.5 : null;
      const deco = dimmed === null ? (this.config.decoratePC?.(pc) ?? {}) : {};

      text.setVisible(true)
        .setPosition(Math.round(bar.x + 12 + i * slotW), Math.round(bar.h / 2))
        .setOrigin(0, 0.5)
        .setText(`${pc.name} ${pc.hp}/${pc.maxHp}${deco.suffix ?? ''}`)
        .setColor('#' + pc.color.toString(16).padStart(6, '0'))
        .setFontSize(fontSize)
        .setAlpha(dimmed ?? deco.alpha ?? 1);
    });

    // Top-right: [INVENTORY] [O]
    // Sized from the bar's own height, not coords.scale — the arena scale
    // differs between scenes and must not drive chrome size.
    const btnSize = Math.max(24, Math.round(bar.h * 0.55));
    const oX = Math.round(bar.x + bar.w - btnSize / 2 - 4);
    const oY = Math.round(bar.h / 2);
    this.optionsBtn.setPosition(oX, oY);
    this.optionsBtn.resize(btnSize, btnSize, this.coords.fontSize(0.025));

    const invW = Math.round(btnSize * 5);
    const invX = Math.round(oX - btnSize / 2 - invW / 2 - 4);
    this.inventoryBtn.setPosition(invX, oY);
    this.inventoryBtn.resize(invW, btnSize, this.coords.fontSize(0.02));
  }
}
