import Phaser from 'phaser';
import { UIButton, BUTTON_CHROME } from './UIButton';
import type { CoordinateSystem } from '../core/CoordinateSystem';

/** Pool size for choice buttons. The Inn's three is the widest case so far. */
const MAX_CHOICES = 4;

/**
 * The bottom-of-screen text panel with choice buttons along its base.
 *
 * Lifted out of WorldMapScene, where it was built for the Mayor, the shop and
 * the Inn. The dungeon needs the same thing for room descriptions, so rather
 * than a second copy it lives here and both scenes drive it.
 *
 * Deliberately dumb: it knows how to show text and report which button was
 * pressed, and nothing about quests, shops or rooms. The owning scene decides
 * what a choice *means*. A room description is just the one-choice case.
 */
export class DialogPanel {
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private btns: UIButton[] = [];
  private choices: string[] = [];
  private onPick: ((index: number) => void) | null = null;

  /** Non-null while open. Identifies the speaker/room so re-opening is a no-op. */
  private openKey: string | null = null;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem, depth = 20) {
    this.coords = coords;

    this.gfx = scene.add.graphics().setDepth(depth).setVisible(false);
    this.label = scene.add.text(0, 0, '', {
      color: '#e8e4d8', fontFamily: 'monospace', align: 'center',
    }).setOrigin(0.5, 0).setDepth(depth + 1).setVisible(false);

    // Pooled — a dialog shows as many as it needs and hides the rest.
    for (let i = 0; i < MAX_CHOICES; i++) {
      const btn = new UIButton(scene, 0, 0, {
        text: 'OK', ...BUTTON_CHROME,
        onClick: () => this.pick(i),
      });
      btn.setDepth(depth + 1).setVisible(false);
      this.btns.push(btn);
    }
  }

  get isOpen(): boolean {
    return this.openKey !== null;
  }

  /** Which speaker/room is showing, or null. */
  get key(): string | null {
    return this.openKey;
  }

  /**
   * Show text with a set of choices. Re-opening the same `key` is a no-op, so
   * standing next to an NPC (or inside a room trigger) doesn't re-fire it every
   * frame. Choices beyond MAX_CHOICES are dropped rather than silently
   * overflowing the panel.
   */
  open(key: string, text: string, choices: string[], onPick: (index: number) => void): void {
    if (this.openKey === key) return;
    this.openKey = key;
    this.choices = (choices.length > 0 ? choices : ['OK']).slice(0, MAX_CHOICES);
    this.onPick = onPick;
    this.label.setText(text);
  }

  close(): void {
    this.openKey = null;
    this.onPick = null;
  }

  private pick(index: number): void {
    if (!this.isOpen || index >= this.choices.length) return;
    this.onPick?.(index);
  }

  /**
   * Lay out inside `area` (the play region, so the panel never covers the side
   * panel). Call from the scene's own layout/reflow pass — this does not
   * subscribe to resize itself.
   */
  layout(area: { x: number; y: number; w: number; h: number }): void {
    const open = this.isOpen;
    this.gfx.setVisible(open);
    this.label.setVisible(open);
    this.btns.forEach((b, i) => b.setVisible(open && i < this.choices.length));

    this.gfx.clear();
    if (!open) return;

    const fontSize = this.coords.fontSize(0.024);
    this.label.setFontSize(fontSize);

    // Wrap to the panel rather than letting one long line set the width.
    const panelW = Math.round(Math.min(area.w * 0.62, Math.max(area.w * 0.4, 460)));
    const pad = Math.round(fontSize * 0.9);
    this.label.setWordWrapWidth(panelW - pad * 2);
    this.label.setAlign('left');
    this.label.setOrigin(0, 0);

    const btnH = Math.max(26, Math.round(this.coords.canvasHeight * 0.05));
    const panelH = Math.round(this.label.height + btnH + pad * 3);
    const panelX = Math.round(area.x + (area.w - panelW) / 2);
    const panelY = Math.round(area.y + area.h - panelH - 12);

    this.gfx.fillStyle(0x0b0b18, 0.97);
    this.gfx.fillRect(panelX, panelY, panelW, panelH);
    this.gfx.lineStyle(2, 0x5588cc);
    this.gfx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

    this.label.setPosition(panelX + pad, panelY + pad);

    // Choices share the panel width evenly along the bottom.
    const n = this.choices.length;
    const gap = Math.round(pad * 0.6);
    const btnW = Math.round((panelW - pad * 2 - gap * (n - 1)) / n);
    const btnY = Math.round(panelY + panelH - pad - btnH / 2);
    this.choices.forEach((text, i) => {
      const btn = this.btns[i];
      btn.setText(text);
      btn.setPosition(Math.round(panelX + pad + btnW / 2 + i * (btnW + gap)), btnY);
      btn.resize(btnW, btnH, this.coords.fontSize(0.018));
    });
  }
}
