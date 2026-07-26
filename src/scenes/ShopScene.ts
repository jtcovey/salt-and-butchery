import Phaser from 'phaser';
import type { PC } from '../entities/PC';
import { Item, ArmorItem, WeaponItem } from '../entities/Item';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton, BUTTON_BACK, BUTTON_CHROME } from '../ui/UIButton';
import { WorldState } from '../core/WorldState';
import { SHOP_STOCK } from '../data/items';
import { BaseScene } from './BaseScene';

/**
 * The town vendor's counter. Overlay scene, same lifecycle as InventoryScene:
 * launched paused-over the world map, resumes it on close.
 *
 * Buying equips onto the SELECTED party member, replacing whatever they had in
 * that slot — Inventory treats the first item of a type as equipped, so a
 * purchase that didn't replace would sit uselessly behind the old gear.
 */
export class ShopScene extends BaseScene {
  private coords!: CoordinateSystem;
  private bgGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private closeBtn!: UIButton;

  private memberBtns: UIButton[] = [];
  private rows: {
    gfx: Phaser.GameObjects.Graphics;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    price: Phaser.GameObjects.Text;
    btn: UIButton;
  }[] = [];

  private returnScene = 'WorldMapScene';
  private overlay = false;
  private party: PC[] = [];
  private selected = 0;

  constructor() { super({ key: 'ShopScene' }); }

  init(data?: { returnTo?: string; overlay?: boolean; party?: PC[] }) {
    if (data?.returnTo) this.returnScene = data.returnTo;
    this.overlay = data?.overlay ?? false;
    if (data?.party) this.party = data.party;
    this.selected = 0;
  }

  create() {
    this.coords = new CoordinateSystem(this);
    if (this.party.length === 0) this.party = this.registry.get('party') ?? [];

    // Phaser reuses the Scene instance, so these outlive their GameObjects
    // every time the shop is closed and reopened. Reset before rebuilding.
    this.memberBtns = [];
    this.rows = [];

    this.bgGfx = this.add.graphics();

    this.titleText = this.add.text(0, 0, 'ITEM SHOP', {
      color: '#ccddff', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(1);

    this.goldText = this.add.text(0, 0, '', {
      color: '#e0c040', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(1);

    this.statusText = this.add.text(0, 0, '', {
      color: '#9fb0c8', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(1);

    // Who the purchase goes to. Buying is per-character because equipment is.
    this.party.forEach((pc, i) => {
      const btn = new UIButton(this, 0, 0, {
        text: pc.name, ...BUTTON_CHROME,
        onClick: () => { this.selected = i; this.refresh(); },
      });
      btn.setDepth(1);
      this.memberBtns.push(btn);
    });

    for (const item of SHOP_STOCK) {
      const gfx = this.add.graphics();
      const name = this.add.text(0, 0, item.name, {
        color: '#e8e4d8', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(1);
      const desc = this.add.text(0, 0, item.describe(), {
        color: '#8090a8', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(1);
      const price = this.add.text(0, 0, `${item.price}g`, {
        color: '#e0c040', fontFamily: 'monospace',
      }).setOrigin(1, 0.5).setDepth(1);
      const btn = new UIButton(this, 0, 0, {
        text: 'BUY', ...BUTTON_CHROME,
        onClick: () => this.buy(item),
      });
      btn.setDepth(1);
      this.rows.push({ gfx, name, desc, price, btn });
    }

    this.closeBtn = new UIButton(this, 0, 0, {
      text: 'BACK', ...BUTTON_BACK,
      onClick: () => this.close(),
    });
    this.closeBtn.setDepth(1);

    this.input.keyboard!.on('keydown-ESC', () => this.close());

    this.watchReflow();
    this.reflow();
  }

  private buyer(): PC | null {
    return this.party[this.selected] ?? null;
  }

  private buy(item: Item): void {
    const pc = this.buyer();
    if (!pc) return;

    if (!item.canEquip(pc) && (item instanceof WeaponItem || item instanceof ArmorItem)) {
      this.statusText.setText(`${pc.name} can't use ${item.name}.`);
      return;
    }
    if (!WorldState.canAfford(item.price)) {
      this.statusText.setText(`Not enough gold for ${item.name} (${item.price}g).`);
      return;
    }
    WorldState.spend(item.price);

    if (item instanceof WeaponItem || item instanceof ArmorItem) {
      const old = pc.inventory.replaceEquipped(item);
      this.statusText.setText(old
        ? `${pc.name} equips ${item.name}, drops ${old.name}.`
        : `${pc.name} equips ${item.name}.`);
    } else {
      pc.inventory.add(item);
      this.statusText.setText(`${pc.name} takes the ${item.name}.`);
    }
    this.refresh();
  }

  /** Repaint the volatile bits — gold, selection, affordability — in place. */
  private refresh(): void {
    this.goldText.setText(`Party Gold: ${WorldState.gold}`);
    const pc = this.buyer();

    this.memberBtns.forEach((btn, i) => {
      btn.setTextColor(i === this.selected ? '#ffff44' : '#aabbff');
    });

    SHOP_STOCK.forEach((item, i) => {
      const row = this.rows[i];
      const affordable = WorldState.canAfford(item.price);
      const usable = !pc || item.canEquip(pc);
      row.price.setColor(affordable ? '#e0c040' : '#7a6a30');
      row.name.setColor(usable ? '#e8e4d8' : '#6b6b78');
      row.btn.setEnabled(affordable && usable);
    });
  }

  private close(): void {
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
    this.bgGfx.fillStyle(0x000000, this.overlay ? 0.88 : 1);
    this.bgGfx.fillRect(0, 0, w, h);

    const title = this.coords.fontSize(0.034);
    const body  = this.coords.fontSize(0.021);
    const small = this.coords.fontSize(0.017);

    this.titleText.setFontSize(title).setPosition(Math.round(w / 2), Math.round(h * 0.05));
    this.goldText.setFontSize(body).setPosition(Math.round(w / 2), Math.round(h * 0.10));

    // Party selector row.
    const memW = Math.round(Math.min(w * 0.17, 150));
    const memH = Math.max(26, Math.round(h * 0.05));
    const memGap = Math.round(memW * 0.08);
    const memTotal = this.memberBtns.length * memW + (this.memberBtns.length - 1) * memGap;
    const memY = Math.round(h * 0.17);
    this.memberBtns.forEach((btn, i) => {
      btn.setPosition(Math.round((w - memTotal) / 2 + memW / 2 + i * (memW + memGap)), memY);
      btn.resize(memW, memH, small);
    });

    // Stock list. Row height comes from the space actually available between the
    // party selector and the footer — a fixed fraction overruns the BACK button
    // once the stock list is long enough, which it already is at 13 items.
    const listW = Math.round(Math.min(w * 0.78, 720));
    const listX = Math.round((w - listW) / 2);
    const listTop = Math.round(h * 0.23);
    const footerH = Math.round(memH * 2.2);   // status line + BACK button + air
    const rowH = Math.max(22, Math.floor((h - listTop - footerH) / this.rows.length));
    const btnW = Math.round(Math.min(listW * 0.14, 90));

    this.rows.forEach((row, i) => {
      const y = listTop + i * rowH;
      const mid = Math.round(y + rowH / 2);
      row.gfx.clear();
      row.gfx.fillStyle(i % 2 === 0 ? 0x14142a : 0x101024, 0.9);
      row.gfx.fillRect(listX, y, listW, rowH - 2);

      row.name.setFontSize(body).setPosition(listX + Math.round(rowH * 0.4), mid);
      row.desc.setFontSize(small)
        .setPosition(listX + Math.round(listW * 0.34), mid);
      row.price.setFontSize(body)
        .setPosition(listX + listW - btnW - Math.round(rowH * 0.7), mid);
      row.btn.setPosition(Math.round(listX + listW - btnW / 2 - rowH * 0.25), mid);
      row.btn.resize(btnW, Math.round(rowH * 0.72), small);
    });

    const listBottom = listTop + this.rows.length * rowH;
    this.statusText.setFontSize(small)
      .setPosition(Math.round(w / 2), Math.round(listBottom + memH * 0.25));

    this.closeBtn.setPosition(Math.round(w / 2), Math.round(h - memH * 0.75));
    this.closeBtn.resize(Math.round(Math.min(w * 0.2, 180)), memH, small);

    this.refresh();
  }
}
