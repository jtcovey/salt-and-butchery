import Phaser from 'phaser';
import type { PC } from '../entities/PC';
import { ArmorItem, WeaponItem } from '../entities/Item';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton, BUTTON_BACK } from '../ui/UIButton';
import { BaseScene } from './BaseScene';
import { WorldState } from '../core/WorldState';

export class InventoryScene extends BaseScene {
  private coords!: CoordinateSystem;
  private boxGroup!: Phaser.GameObjects.Group;
  private bgGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private closeBtn!: UIButton;
  private returnScene = 'CombatScene';
  private overlay = false;
  private party: PC[] = [];

  constructor() { super({ key: 'InventoryScene' }); }

  init(data?: { returnTo?: string; overlay?: boolean; party?: PC[] }) {
    if (data?.returnTo) this.returnScene = data.returnTo;
    this.overlay = data?.overlay ?? false;
    if (data?.party) this.party = data.party;
  }

  create() {
    this.coords = new CoordinateSystem(this);
    this.boxGroup = this.add.group();

    if (this.party.length === 0) {
      this.party = this.registry.get('party') ?? [];
    }

    // Created once; positioned in reflow().
    this.bgGfx = this.add.graphics();

    this.titleText = this.add.text(0, 0, 'INVENTORY', {
      color: '#ccddff', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    this.goldText = this.add.text(0, 0, '', {
      color: '#e0c040', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(1);

    this.closeBtn = new UIButton(this, 0, 0, {
      text: 'BACK',
      ...BUTTON_BACK,
      onClick: () => this.closeInventory(),
    });
    this.closeBtn.setDepth(1);

    this.input.keyboard!.on('keydown-I', () => this.closeInventory());

    this.watchReflow();
    this.reflow();
  }

  private closeInventory(): void {
    if (this.overlay) {
      this.scene.resume(this.returnScene);
      this.scene.stop();
    } else {
      this.scene.start(this.returnScene);
    }
  }

  protected override reflow(): void {
    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    this.bgGfx.clear();
    if (this.overlay) {
      this.bgGfx.fillStyle(0x000000, 0.85);
    } else {
      this.bgGfx.fillStyle(0x080814, 1);
    }
    this.bgGfx.fillRect(0, 0, w, h);

    this.titleText
      .setPosition(Math.round(w / 2), Math.round(h * 0.05))
      .setFontSize(this.coords.fontSize(0.04));

    this.goldText
      .setText(`Party Gold: ${WorldState.gold}g`)
      .setPosition(Math.round(w / 2), Math.round(h * 0.05 + this.coords.fontSize(0.04) * 0.7))
      .setFontSize(this.coords.fontSize(0.02));

    const btnW = Math.max(160, w * 0.15);
    const btnH = Math.max(36, h * 0.055);
    this.closeBtn.setPosition(Math.round(w / 2), Math.round(h - btnH));
    this.closeBtn.resize(btnW, btnH, this.coords.fontSize(0.022));

    this.refreshBoxes();
  }

  private refreshBoxes() {
    this.boxGroup.clear(true, true);
    this.party.forEach((pc: PC, i: number) => this.buildBox(pc, i));
  }

  private buildBox(pc: PC, i: number) {
    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    const gap = Math.round(h * 0.018);
    const boxW = Math.min(Math.round(w * 0.3), Math.round((w - gap * 4) / 2));
    const boxH = Math.max(170, Math.round(h * 0.3));

    const col = i % 2;
    const row = Math.floor(i / 2);
    const totalW = boxW * 2 + gap;
    const startX = Math.round((w - totalW) / 2);
    const x = startX + col * (boxW + gap);
    const y = Math.round(h * 0.11) + row * (boxH + gap);

    const headerFont = this.coords.fontSize(0.019);
    const subFont = this.coords.fontSize(0.014);
    const itemFont = this.coords.fontSize(0.013);
    const pad = Math.round(boxW * 0.035);

    const gfx = this.add.graphics();
    gfx.fillStyle(0x0d0d22, 0.95);
    gfx.fillRect(x, y, boxW, boxH);
    gfx.lineStyle(1, 0x4455aa);
    gfx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
    gfx.setDepth(1);
    this.boxGroup.add(gfx);

    const colorHex = '#' + pc.color.toString(16).padStart(6, '0');
    const header = this.add.text(x + pad, y + pad, pc.name, {
      fontSize: `${headerFont}px`, color: colorHex, fontStyle: 'bold', fontFamily: 'monospace',
    }).setDepth(1);

    const subY = y + pad + headerFont + 4;
    const sub = this.add.text(x + pad, subY,
      `${pc.charClass.toUpperCase()}  Lv ${pc.level}`, {
      fontSize: `${subFont}px`, color: '#aaaaaa', fontFamily: 'monospace',
    }).setDepth(1);

    const statsY = subY + subFont + 4;
    const stats = this.add.text(x + pad, statsY,
      `HP ${pc.hp}/${pc.maxHp}   ST ${pc.stamina}/${pc.maxStamina}   AC ${pc.effectiveAC()}`, {
      fontSize: `${subFont}px`, color: '#888888', fontFamily: 'monospace',
    }).setDepth(1);

    const dividerY = Math.round(statsY + subFont + 8);
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x223344);
    divider.lineBetween(x + pad, dividerY, x + boxW - pad, dividerY);
    divider.setDepth(1);

    const itemsTop = dividerY + 6;
    const itemStep = itemFont + 6;
    const items = pc.inventory.items;
    const itemObjs = items.length === 0
      ? [this.add.text(x + pad, itemsTop, '— empty —', {
          fontSize: `${itemFont}px`, color: '#445566', fontFamily: 'monospace',
        }).setDepth(1)]
      : items.map((item, idx) => {
          const desc = item instanceof ArmorItem
            ? `${item.name}  +${item.acBonus} AC` + (item.requirements.strength ? `  (STR ${item.requirements.strength})` : '')
            : item instanceof WeaponItem
            ? `${item.name}  [${item.weaponType}]`
            : item.name;
          return this.add.text(x + pad, itemsTop + idx * itemStep, desc, {
            fontSize: `${itemFont}px`, color: '#6688aa', fontFamily: 'monospace',
          }).setDepth(1);
        });

    [header, sub, stats, divider, ...itemObjs].forEach(o => this.boxGroup.add(o));
  }
}
