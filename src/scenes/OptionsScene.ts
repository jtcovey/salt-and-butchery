import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton } from '../ui/UIButton';
import { GameOptions } from '../config/GameOptions';

export class OptionsScene extends Phaser.Scene {
  private coords!: CoordinateSystem;
  private titleText!: Phaser.GameObjects.Text;
  private toggleBtns: UIButton[] = [];
  private backBtn!: UIButton;
  private returnScene = 'MenuScene';
  private overlay = false;

  // Volume slider
  private sliderGfx!: Phaser.GameObjects.Graphics;
  private sliderLabel!: Phaser.GameObjects.Text;
  private sliderX = 0;
  private sliderY = 0;
  private sliderW = 280;
  private sliderH = 12;
  private dragging = false;

  constructor() { super({ key: 'OptionsScene' }); }

  init(data?: { returnTo?: string; overlay?: boolean }) {
    if (data?.returnTo) this.returnScene = data.returnTo;
    this.overlay = data?.overlay ?? false;
  }

  create() {
    this.coords = new CoordinateSystem(this);
    this.toggleBtns = [];

    if (this.overlay) {
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.7);
      bg.fillRect(0, 0, this.coords.canvasWidth, this.coords.canvasHeight);
      bg.setDepth(0);
    }

    this.titleText = this.add.text(0, 0, 'OPTIONS', {
      fontSize: '28px', color: '#cc8844', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const toggles: Array<{ key: 'godMode' | 'autoEndTurn' | 'showGrid'; label: string }> = [
      { key: 'godMode', label: 'GOD MODE' },
      { key: 'autoEndTurn', label: 'AUTO END TURN' },
      { key: 'showGrid', label: 'SHOW GRID' },
    ];

    for (const toggle of toggles) {
      const btn = new UIButton(this, 0, 0, {
        text: this.toggleLabel(toggle.label, GameOptions[toggle.key] as boolean),
        width: 280, height: 42, fontSize: 16,
        onClick: () => {
          (GameOptions[toggle.key] as boolean) = !(GameOptions[toggle.key] as boolean);
          btn.setText(this.toggleLabel(toggle.label, GameOptions[toggle.key] as boolean));
        },
      });
      this.toggleBtns.push(btn);
    }

    this.sliderGfx = this.add.graphics().setDepth(5);
    this.sliderLabel = this.add.text(0, 0, '', {
      fontSize: '16px', color: '#aabbff', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isOnSlider(pointer.x, pointer.y)) {
        this.dragging = true;
        this.updateSliderFromPointer(pointer.x);
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.dragging) this.updateSliderFromPointer(pointer.x);
    });
    this.input.on('pointerup', () => { this.dragging = false; });

    this.backBtn = new UIButton(this, 0, 0, {
      text: 'BACK', width: 200, height: 42, fontSize: 16,
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x442222, borderHoverColor: 0x884444,
      textColor: '#cc8844', textHoverColor: '#ffaa66',
      onClick: () => this.closeOptions(),
    });

    this.scale.on('resize', () => this.reflow());
    this.reflow();
  }

  private isOnSlider(px: number, py: number): boolean {
    const trackLeft = this.sliderX - this.sliderW / 2;
    const trackRight = this.sliderX + this.sliderW / 2;
    return px >= trackLeft - 10 && px <= trackRight + 10 &&
           py >= this.sliderY - 20 && py <= this.sliderY + 20;
  }

  private updateSliderFromPointer(px: number): void {
    const trackLeft = this.sliderX - this.sliderW / 2;
    const t = Math.max(0, Math.min(1, (px - trackLeft) / this.sliderW));
    GameOptions.sfxVolume = Math.round(t * 100) / 100;
    this.drawSlider();
  }

  private drawSlider(): void {
    this.sliderGfx.clear();
    const trackLeft = this.sliderX - this.sliderW / 2;
    const trackTop = this.sliderY - this.sliderH / 2;

    // Track background
    this.sliderGfx.fillStyle(0x222233, 0.8);
    this.sliderGfx.fillRoundedRect(trackLeft, trackTop, this.sliderW, this.sliderH, 4);

    // Filled portion
    const fillW = this.sliderW * GameOptions.sfxVolume;
    if (fillW > 0) {
      this.sliderGfx.fillStyle(0x5566aa, 0.9);
      this.sliderGfx.fillRoundedRect(trackLeft, trackTop, fillW, this.sliderH, 4);
    }

    // Track border
    this.sliderGfx.lineStyle(1, 0x334466);
    this.sliderGfx.strokeRoundedRect(trackLeft, trackTop, this.sliderW, this.sliderH, 4);

    // Thumb
    const thumbX = trackLeft + fillW;
    this.sliderGfx.fillStyle(0xaabbff, 1);
    this.sliderGfx.fillCircle(thumbX, this.sliderY, 8);

    const pct = Math.round(GameOptions.sfxVolume * 100);
    this.sliderLabel.setText(`SFX VOLUME: ${pct}%`);
  }

  private closeOptions(): void {
    if (this.overlay) {
      this.scene.resume(this.returnScene);
      this.scene.stop();
    } else {
      this.scene.start(this.returnScene);
    }
  }

  private toggleLabel(name: string, on: boolean): string {
    return `${name}: ${on ? 'ON' : 'OFF'}`;
  }

  private reflow(): void {
    const cx = this.coords.canvasWidth / 2;
    const cy = this.coords.canvasHeight / 2;

    this.titleText.setPosition(cx, cy - this.coords.canvasHeight * 0.2)
      .setFontSize(this.coords.fontSize(0.05));

    const btnW = Math.max(240, this.coords.canvasWidth * 0.22);
    const btnH = Math.max(36, this.coords.canvasHeight * 0.06);
    const fontSize = this.coords.fontSize(0.022);
    const gap = btnH + 12;
    const startY = cy - gap * (this.toggleBtns.length) / 2;

    this.toggleBtns.forEach((btn, i) => {
      btn.setPosition(Math.round(cx), Math.round(startY + i * gap));
      btn.resize(btnW, btnH, fontSize);
    });

    // Volume slider below toggles
    const sliderSlotY = startY + this.toggleBtns.length * gap;
    this.sliderX = Math.round(cx);
    this.sliderY = Math.round(sliderSlotY + 12);
    this.sliderW = Math.round(btnW);
    this.sliderLabel.setPosition(Math.round(cx), Math.round(sliderSlotY - 10)).setFontSize(fontSize);
    this.drawSlider();

    this.backBtn.setPosition(Math.round(cx), Math.round(this.sliderY + 40));
    this.backBtn.resize(btnW, btnH, fontSize);
  }
}
