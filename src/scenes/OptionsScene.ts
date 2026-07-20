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

  constructor() { super({ key: 'OptionsScene' }); }

  init(data?: { returnTo?: string }) {
    if (data?.returnTo) this.returnScene = data.returnTo;
  }

  create() {
    this.coords = new CoordinateSystem(this);

    this.titleText = this.add.text(0, 0, 'OPTIONS', {
      fontSize: '28px', color: '#cc8844', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);

    const toggles: Array<{ key: keyof typeof GameOptions; label: string }> = [
      { key: 'godMode', label: 'GOD MODE' },
      { key: 'autoEndTurn', label: 'AUTO END TURN' },
    ];

    for (const toggle of toggles) {
      const btn = new UIButton(this, 0, 0, {
        text: this.toggleLabel(toggle.label, GameOptions[toggle.key]),
        width: 280, height: 42, fontSize: 16,
        onClick: () => {
          GameOptions[toggle.key] = !GameOptions[toggle.key];
          btn.setText(this.toggleLabel(toggle.label, GameOptions[toggle.key]));
        },
      });
      this.toggleBtns.push(btn);
    }

    this.backBtn = new UIButton(this, 0, 0, {
      text: 'BACK', width: 200, height: 42, fontSize: 16,
      bgColor: 0x1a0a0a, hoverColor: 0x2a1414, pressedColor: 0x3a1e1e,
      borderColor: 0x442222, borderHoverColor: 0x884444,
      textColor: '#cc8844', textHoverColor: '#ffaa66',
      onClick: () => this.scene.start(this.returnScene),
    });

    this.scale.on('resize', () => this.reflow());
    this.reflow();
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
    const startY = cy - gap * (this.toggleBtns.length - 1) / 2;

    this.toggleBtns.forEach((btn, i) => {
      btn.setPosition(cx, startY + i * gap);
      btn.resize(btnW, btnH, fontSize);
    });

    this.backBtn.setPosition(cx, startY + this.toggleBtns.length * gap + 20);
    this.backBtn.resize(btnW, btnH, fontSize);
  }
}
