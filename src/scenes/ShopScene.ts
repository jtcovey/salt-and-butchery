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
 * Two modes on the same list widget — BUY shows the vendor's stock, SELL shows
 * what the party is carrying. Rows are pooled and repopulated rather than
 * rebuilt, so switching modes doesn't churn GameObjects.
 */

/**
 * What the vendor pays, as a fraction of the item's listed price.
 *
 * 1.0 on purpose: the design doc gives buy prices and says nothing about a
 * markdown, and a made-up rate is a guess wearing a price tag. Change this one
 * constant if B wants the vendor to take a cut. Note items with no listed price
 * are already 0 by construction — Item's constructor defaults price to 0 — so
 * junk is sellable purely to be rid of it, exactly as asked.
 */
const SELL_RATE = 1.0;

interface Entry { item: Item; owner: PC | null; }

export class ShopScene extends BaseScene {
  private coords!: CoordinateSystem;
  private bgGfx!: Phaser.GameObjects.Graphics;
  private titleText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private modeBtn!: UIButton;
  private closeBtn!: UIButton;

  // Cursor-following detail panel.
  private tipGfx!: Phaser.GameObjects.Graphics;
  private tipText!: Phaser.GameObjects.Text;
  private tipEntry: Entry | null = null;

  private memberBtns: UIButton[] = [];
  private rows: {
    gfx: Phaser.GameObjects.Graphics;
    zone: Phaser.GameObjects.Zone;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    price: Phaser.GameObjects.Text;
    btn: UIButton;
  }[] = [];

  private returnScene = 'WorldMapScene';
  private overlay = false;
  private party: PC[] = [];
  private selected = 0;
  private mode: 'buy' | 'sell' = 'buy';
  private entries: Entry[] = [];

  constructor() { super({ key: 'ShopScene' }); }

  init(data?: { returnTo?: string; overlay?: boolean; party?: PC[] }) {
    if (data?.returnTo) this.returnScene = data.returnTo;
    this.overlay = data?.overlay ?? false;
    if (data?.party) this.party = data.party;
    this.selected = 0;
    this.mode = 'buy';
  }

  create() {
    this.coords = new CoordinateSystem(this);
    if (this.party.length === 0) this.party = this.registry.get('party') ?? [];

    // Phaser reuses the Scene instance, so these outlive their GameObjects
    // every time the shop is closed and reopened. Reset before rebuilding.
    this.memberBtns = [];
    this.rows = [];
    this.tipEntry = null;

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

    this.modeBtn = new UIButton(this, 0, 0, {
      text: 'SELL', ...BUTTON_CHROME,
      onClick: () => this.toggleMode(),
    });
    this.modeBtn.setDepth(1);

    // Who a purchase goes to. Hidden in sell mode — rows carry their own owner.
    this.party.forEach((pc, i) => {
      const btn = new UIButton(this, 0, 0, {
        text: pc.name, ...BUTTON_CHROME,
        onClick: () => { this.selected = i; this.rebuild(); },
      });
      btn.setDepth(1);
      this.memberBtns.push(btn);
    });

    this.closeBtn = new UIButton(this, 0, 0, {
      text: 'BACK', ...BUTTON_BACK,
      onClick: () => this.close(),
    });
    this.closeBtn.setDepth(1);

    // Tooltip lives above everything and never eats input.
    this.tipGfx = this.add.graphics().setDepth(50).setVisible(false);
    this.tipText = this.add.text(0, 0, '', {
      color: '#e8e4d8', fontFamily: 'monospace',
    }).setOrigin(0, 0).setDepth(51).setVisible(false);

    this.input.on('pointermove', () => this.positionTip());
    this.input.keyboard!.on('keydown-ESC', () => this.close());

    this.rebuild();
    this.watchReflow();
    this.reflow();
  }

  // ── mode + data ─────────────────────────────────────────────────────────
  private toggleMode(): void {
    this.mode = this.mode === 'buy' ? 'sell' : 'buy';
    this.hideTip();
    this.statusText.setText('');
    this.rebuild();
    this.reflow();
  }

  /** The list the rows render, rebuilt whenever mode or inventory changes. */
  private rebuild(): void {
    this.entries = this.mode === 'buy'
      ? SHOP_STOCK.map(item => ({ item, owner: null }))
      : this.party.flatMap(pc => pc.inventory.items.map(item => ({ item, owner: pc })));
    this.ensureRows(this.entries.length);
  }

  /** Rows are pooled: grown on demand, never destroyed. */
  private ensureRows(n: number): void {
    while (this.rows.length < n) {
      const i = this.rows.length;
      const gfx = this.add.graphics();
      const zone = this.add.zone(0, 0, 10, 10).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.showTip(i));
      zone.on('pointerout',  () => this.hideTip());
      zone.on('pointerdown', () => this.activate(i));
      const name = this.add.text(0, 0, '', {
        color: '#e8e4d8', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(1);
      const desc = this.add.text(0, 0, '', {
        color: '#8090a8', fontFamily: 'monospace',
      }).setOrigin(0, 0.5).setDepth(1);
      const price = this.add.text(0, 0, '', {
        color: '#e0c040', fontFamily: 'monospace',
      }).setOrigin(1, 0.5).setDepth(1);
      const btn = new UIButton(this, 0, 0, {
        text: 'BUY', ...BUTTON_CHROME,
        onClick: () => this.activate(i),
      });
      btn.setDepth(2);
      this.rows.push({ gfx, zone, name, desc, price, btn });
    }
  }

  private sellValue(item: Item): number {
    return Math.floor(item.price * SELL_RATE);
  }

  // ── transactions ────────────────────────────────────────────────────────
  private activate(i: number): void {
    const entry = this.entries[i];
    if (!entry) return;
    if (this.mode === 'buy') this.buy(entry.item);
    else this.sell(entry);
  }

  private buy(item: Item): void {
    const pc = this.party[this.selected] ?? null;
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
    this.rebuild();
    this.reflow();
  }

  private sell(entry: Entry): void {
    const pc = entry.owner;
    if (!pc) return;
    const at = pc.inventory.items.indexOf(entry.item);
    if (at < 0) return;

    pc.inventory.items.splice(at, 1);
    const paid = this.sellValue(entry.item);
    if (paid > 0) WorldState.earn(paid);

    this.statusText.setText(paid > 0
      ? `Sold ${pc.name}'s ${entry.item.name} for ${paid}g.`
      : `Discarded ${pc.name}'s ${entry.item.name} — worth nothing.`);

    this.hideTip();
    this.rebuild();
    this.reflow();
  }

  // ── cursor tooltip ──────────────────────────────────────────────────────
  private showTip(i: number): void {
    const entry = this.entries[i];
    if (!entry) return;
    this.tipEntry = entry;

    const item = entry.item;
    const lines: string[] = [item.name];
    const d = item.describe();
    if (d) lines.push(d);

    if (this.mode === 'sell') {
      const paid = this.sellValue(item);
      lines.push(paid > 0 ? `Sells for ${paid}g` : 'Worthless — discard only');
      if (entry.owner) {
        const equipped = entry.owner.inventory.equippedWeapon() === item
                      || entry.owner.inventory.equippedArmor()  === item;
        lines.push(equipped ? `Equipped by ${entry.owner.name}` : `Carried by ${entry.owner.name}`);
      }
    } else {
      lines.push(`Costs ${item.price}g`);
      const pc = this.party[this.selected];
      if (pc && !item.canEquip(pc)) lines.push(`${pc.name} can't use this`);
    }

    this.tipText.setText(lines.join('\n'));
    this.tipGfx.setVisible(true);
    this.tipText.setVisible(true);
    this.positionTip();
  }

  private hideTip(): void {
    this.tipEntry = null;
    this.tipGfx.setVisible(false);
    this.tipText.setVisible(false);
  }

  /** Follows the cursor, flipping sides so it never runs off the canvas. */
  private positionTip(): void {
    if (!this.tipEntry) return;
    const p = this.input.activePointer;
    const pad = Math.round(this.coords.fontSize(0.014));
    const w = this.tipText.width + pad * 2;
    const h = this.tipText.height + pad * 2;

    let x = p.x + 18;
    let y = p.y + 14;
    if (x + w > this.coords.canvasWidth)  x = p.x - w - 12;
    if (y + h > this.coords.canvasHeight) y = p.y - h - 8;

    this.tipGfx.clear();
    this.tipGfx.fillStyle(0x0b0b18, 0.97);
    this.tipGfx.fillRect(x, y, w, h);
    this.tipGfx.lineStyle(1, 0x5588cc);
    this.tipGfx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.tipText.setPosition(x + pad, y + pad);
  }

  private close(): void {
    if (this.overlay) {
      this.scene.resume(this.returnScene);
      this.scene.stop();
    } else {
      this.scene.start(this.returnScene);
    }
  }

  // ── layout ──────────────────────────────────────────────────────────────
  protected override reflow(): void {
    const w = this.coords.canvasWidth;
    const h = this.coords.canvasHeight;
    const buying = this.mode === 'buy';

    this.bgGfx.clear();
    this.bgGfx.fillStyle(0x000000, this.overlay ? 0.88 : 1);
    this.bgGfx.fillRect(0, 0, w, h);

    const title = this.coords.fontSize(0.034);
    const body  = this.coords.fontSize(0.021);
    const small = this.coords.fontSize(0.017);
    this.tipText.setFontSize(small);

    this.titleText.setText(buying ? 'ITEM SHOP' : 'SELL')
      .setFontSize(title).setPosition(Math.round(w / 2), Math.round(h * 0.05));
    this.goldText.setFontSize(body).setPosition(Math.round(w / 2), Math.round(h * 0.10));

    const btnH = Math.max(26, Math.round(h * 0.05));

    // Mode toggle sits top-right, away from the list.
    this.modeBtn.setText(buying ? 'SELL' : 'BUY');
    this.modeBtn.setPosition(Math.round(w - Math.min(w * 0.12, 110)), Math.round(h * 0.05));
    this.modeBtn.resize(Math.round(Math.min(w * 0.16, 140)), btnH, small);

    // Party selector — only meaningful when buying.
    const memW = Math.round(Math.min(w * 0.17, 150));
    const memGap = Math.round(memW * 0.08);
    const memTotal = this.memberBtns.length * memW + (this.memberBtns.length - 1) * memGap;
    const memY = Math.round(h * 0.17);
    this.memberBtns.forEach((btn, i) => {
      btn.setVisible(buying);
      btn.setPosition(Math.round((w - memTotal) / 2 + memW / 2 + i * (memW + memGap)), memY);
      btn.resize(memW, btnH, small);
    });

    const listW = Math.round(Math.min(w * 0.78, 720));
    const listX = Math.round((w - listW) / 2);
    const listTop = Math.round(buying ? h * 0.23 : h * 0.17);
    const footerH = Math.round(btnH * 2.2);
    const count = Math.max(this.entries.length, 1);
    const rowH = Math.max(22, Math.floor((h - listTop - footerH) / count));
    const rowBtnW = Math.round(Math.min(listW * 0.14, 90));

    this.rows.forEach((row, i) => {
      const entry = this.entries[i];
      const on = i < this.entries.length;
      row.gfx.setVisible(on); row.zone.setVisible(on);
      row.name.setVisible(on); row.desc.setVisible(on);
      row.price.setVisible(on); row.btn.setVisible(on);
      if (!on || !entry) { row.zone.disableInteractive(); return; }
      row.zone.setInteractive({ useHandCursor: true });

      const item = entry.item;
      const y = listTop + i * rowH;
      const mid = Math.round(y + rowH / 2);

      row.gfx.clear();
      row.gfx.fillStyle(i % 2 === 0 ? 0x14142a : 0x101024, 0.9);
      row.gfx.fillRect(listX, y, listW, rowH - 2);

      row.zone.setPosition(listX, y).setSize(listW, rowH - 2);

      // In sell mode the owner matters more than the stat line.
      const label = buying ? item.name : `${item.name}`;
      const sub = buying
        ? item.describe()
        : [entry.owner?.name, item.describe()].filter(Boolean).join(' · ');
      const value = buying ? item.price : this.sellValue(item);

      row.name.setText(label).setFontSize(body)
        .setPosition(listX + Math.round(rowH * 0.4), mid);
      row.desc.setText(sub).setFontSize(small)
        .setPosition(listX + Math.round(listW * 0.34), mid);
      row.price.setText(`${value}g`).setFontSize(body)
        .setPosition(listX + listW - rowBtnW - Math.round(rowH * 0.7), mid);
      row.btn.setText(buying ? 'BUY' : 'SELL');
      row.btn.setPosition(Math.round(listX + listW - rowBtnW / 2 - rowH * 0.25), mid);
      row.btn.resize(rowBtnW, Math.round(rowH * 0.72), small);
    });

    const listBottom = listTop + this.entries.length * rowH;
    this.statusText.setFontSize(small)
      .setPosition(Math.round(w / 2), Math.round(listBottom + btnH * 0.25));

    this.closeBtn.setPosition(Math.round(w / 2), Math.round(h - btnH * 0.75));
    this.closeBtn.resize(Math.round(Math.min(w * 0.2, 180)), btnH, small);

    this.refresh();
  }

  /** Volatile state — gold, selection, affordability — repainted in place. */
  private refresh(): void {
    this.goldText.setText(`Party Gold: ${WorldState.gold}`);
    const buying = this.mode === 'buy';
    const pc = this.party[this.selected] ?? null;

    this.memberBtns.forEach((btn, i) => {
      btn.setTextColor(i === this.selected ? '#ffff44' : '#aabbff');
    });

    this.entries.forEach((entry, i) => {
      const row = this.rows[i];
      if (!row) return;
      if (buying) {
        const affordable = WorldState.canAfford(entry.item.price);
        const usable = !pc || entry.item.canEquip(pc);
        row.price.setColor(affordable ? '#e0c040' : '#7a6a30');
        row.name.setColor(usable ? '#e8e4d8' : '#6b6b78');
        row.btn.setEnabled(affordable && usable);
      } else {
        const worth = this.sellValue(entry.item) > 0;
        row.price.setColor(worth ? '#e0c040' : '#6b6b78');
        row.name.setColor('#e8e4d8');
        row.btn.setEnabled(true);
      }
    });
  }
}
