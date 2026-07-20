import Phaser from 'phaser';
import type { PC } from '../entities/PC';
import { ArmorItem, WeaponItem } from '../entities/Item';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton } from '../ui/UIButton';

export class InventoryScene extends Phaser.Scene {
  private coords!: CoordinateSystem;
  private boxGroup!: Phaser.GameObjects.Group;
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

    this.buildStaticUI();
    this.refreshBoxes();
  }

  private buildStaticUI() {
    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;

    if (this.overlay) {
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.85);
      bg.fillRect(0, 0, w, h);
    } else {
      this.add.rectangle(0, 0, w, h, 0x080814).setOrigin(0, 0);
    }

    this.add.text(w / 2, 30, 'INVENTORY', {
      fontSize: `${this.coords.fontSize(0.04)}px`, color: '#ccddff', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    const btnW = Math.max(160, w * 0.15);
    const btnH = Math.max(36, h * 0.05);
    const closeBtn = new UIButton(this, w / 2, h - 50, {
      text: 'BACK', width: btnW, height: btnH, fontSize: this.coords.fontSize(0.022),
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x442222, borderHoverColor: 0x884444,
      textColor: '#cc8844', textHoverColor: '#ffaa66',
      onClick: () => this.closeInventory(),
    });
    closeBtn.setDepth(1);

    this.input.keyboard!.on('keydown-I', () => this.closeInventory());
  }

  private closeInventory(): void {
    if (this.overlay) {
      this.scene.resume(this.returnScene);
      this.scene.stop();
    } else {
      this.scene.start(this.returnScene);
    }
  }

  private refreshBoxes() {
    this.boxGroup.clear(true, true);
    this.party.forEach((pc: PC, i: number) => this.buildBox(pc, i));
  }

  private buildBox(pc: PC, i: number) {
    const w = this.coords.canvasWidth;
    const boxW = Math.min(308, (w - 48) / 2);
    const boxH = 210;
    const col = i % 2, row = Math.floor(i / 2);
    const totalW = boxW * 2 + 12;
    const startX = (w - totalW) / 2;
    const x = startX + col * (boxW + 12);
    const y = 60 + row * (boxH + 12);

    const gfx = this.add.graphics();
    gfx.fillStyle(0x0d0d22, 0.95);
    gfx.fillRect(x, y, boxW, boxH);
    gfx.lineStyle(1, 0x4455aa);
    gfx.strokeRect(x, y, boxW, boxH);
    gfx.setDepth(1);
    this.boxGroup.add(gfx);

    const colorHex = '#' + pc.color.toString(16).padStart(6, '0');
    const header = this.add.text(x + 10, y + 8, pc.name, {
      fontSize: '13px', color: colorHex, fontStyle: 'bold',
    }).setDepth(1);
    const sub = this.add.text(x + 10, y + 26,
      `${pc.charClass.toUpperCase()}  Lv ${pc.level}`, {
      fontSize: '10px', color: '#aaaaaa',
    }).setDepth(1);
    const stats = this.add.text(x + 10, y + 42,
      `HP ${pc.hp}/${pc.maxHp}   ST ${pc.stamina}/${pc.maxStamina}   AC ${pc.effectiveAC()}`, {
      fontSize: '10px', color: '#888888',
    }).setDepth(1);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x223344);
    divider.lineBetween(x + 8, y + 60, x + boxW - 8, y + 60);
    divider.setDepth(1);

    const items = pc.inventory.items;
    const itemObjs = items.length === 0
      ? [this.add.text(x + 10, y + 67, '— empty —', { fontSize: '9px', color: '#445566' }).setDepth(1)]
      : items.map((item, idx) => {
          const desc = item instanceof ArmorItem
            ? `${item.name}  +${item.acBonus} AC` + (item.requirements.strength ? `  (STR ${item.requirements.strength})` : '')
            : item instanceof WeaponItem
            ? `${item.name}  [${item.weaponType}]`
            : item.name;
          return this.add.text(x + 10, y + 67 + idx * 15, desc, {
            fontSize: '9px', color: '#6688aa',
          }).setDepth(1);
        });

    [header, sub, stats, divider, ...itemObjs].forEach(o => this.boxGroup.add(o));
  }
}
