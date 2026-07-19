import Phaser from 'phaser';
import type { WorldScene } from './WorldScene';
import type { PC } from '../entities/PC';
import { ArmorItem, WeaponItem } from '../entities/Item';


export class InventoryScene extends Phaser.Scene {
  private boxGroup!: Phaser.GameObjects.Group;

  constructor() { super({ key: 'InventoryScene' }); }

  create() {
    this.buildStaticUI();
    this.boxGroup = this.add.group();
    this.refreshBoxes();
    this.events.on('wake', this.refreshBoxes, this);
  }

  private buildStaticUI() {
    const TOP_BAR = 60;

    // Full dark background
    this.add.rectangle(0, 0, 820, TOP_BAR + 480, 0x080814).setOrigin(0, 0);

    // Top control bar separator
    const topBar = this.add.graphics().setDepth(8);
    topBar.lineStyle(1, 0x334466);
    topBar.lineBetween(0, TOP_BAR, 820, TOP_BAR);

    // Right panel (below control bar)
    const panel = this.add.graphics().setDepth(8);
    panel.fillStyle(0x080814);
    panel.fillRect(640, TOP_BAR, 180, 480);
    panel.lineStyle(1, 0x334466);
    panel.lineBetween(640, TOP_BAR, 640, TOP_BAR + 480);

    // Screen title in control bar
    this.add.text(120, TOP_BAR / 2, 'INVENTORY', {
      fontSize: '14px', color: '#ccddff', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // "[i]nterface" toggle button — same position as the game screen's inventory button
    const ifaceBox = this.add.rectangle(592, TOP_BAR / 2, 92, 28, 0x0d0d1a)
      .setStrokeStyle(1, 0x4455aa)
      .setInteractive({ useHandCursor: true })
      .setDepth(9);
    const ifaceLbl = this.add.text(592, TOP_BAR / 2, '[i]nterface', {
      fontSize: '10px', color: '#aabbff',
    }).setOrigin(0.5).setDepth(10);
    ifaceBox.on('pointerdown', () => this.returnToGame());
    ifaceBox.on('pointerover', () => ifaceLbl.setColor('#ffffff'));
    ifaceBox.on('pointerout',  () => ifaceLbl.setColor('#aabbff'));

    // 'I' key returns to game
    this.input.keyboard!.on('keydown-I', () => this.returnToGame());
  }

  private refreshBoxes() {
    this.boxGroup.clear(true, true);
    const world = this.scene.get('WorldScene') as WorldScene;
    world.getParty().forEach((pc, i) => this.buildBox(pc, i));
  }

  private buildBox(pc: PC, i: number) {
    const TOP_BAR = 60;
    const col = i % 2, row = Math.floor(i / 2);
    const x = 12 + col * 318, y = TOP_BAR + 8 + row * 222;
    const w = 308, h = 210;

    const gfx = this.add.graphics();
    gfx.fillStyle(0x0d0d22, 0.95);
    gfx.fillRect(x, y, w, h);
    gfx.lineStyle(1, 0x4455aa);
    gfx.strokeRect(x, y, w, h);
    this.boxGroup.add(gfx);

    const colorHex = '#' + pc.color.toString(16).padStart(6, '0');
    const header = this.add.text(x + 10, y + 8, pc.name, {
      fontSize: '13px', color: colorHex, fontStyle: 'bold',
    });
    const sub = this.add.text(x + 10, y + 26,
      `${pc.charClass.toUpperCase()}  Lv ${pc.level}`, {
      fontSize: '10px', color: '#aaaaaa',
    });
    const stats = this.add.text(x + 10, y + 42,
      `HP ${pc.hp}/${pc.maxHp}   ST ${pc.stamina}/${pc.maxStamina}   AC ${pc.effectiveAC()}`, {
      fontSize: '10px', color: '#888888',
    });

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x223344);
    divider.lineBetween(x + 8, y + 60, x + w - 8, y + 60);

    const items = pc.inventory.items;
    const itemObjs = items.length === 0
      ? [this.add.text(x + 10, y + 67, '— empty —', { fontSize: '9px', color: '#445566' })]
      : items.map((item, idx) => {
          const desc = item instanceof ArmorItem
            ? `${item.name}  +${item.acBonus} AC` + (item.requirements.strength ? `  (STR ${item.requirements.strength})` : '')
            : item instanceof WeaponItem
            ? `${item.name}  [${item.weaponType}]`
            : item.name;
          return this.add.text(x + 10, y + 67 + idx * 15, desc, {
            fontSize: '9px', color: '#6688aa',
          });
        });

    [header, sub, stats, divider, ...itemObjs].forEach(o => this.boxGroup.add(o));
  }

  private returnToGame() {
    this.scene.switch('WorldScene');
  }
}
