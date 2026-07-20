import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton } from '../ui/UIButton';

export class MenuScene extends Phaser.Scene {
  private coords!: CoordinateSystem;
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;
  private optionsBtn!: UIButton;
  private creditText!: Phaser.GameObjects.Text;

  constructor() { super({ key: 'MenuScene' }); }

  create() {
    this.coords = new CoordinateSystem(this);

    this.titleText = this.add.text(0, 0, 'SALT & BUTCHERY', {
      fontSize: '32px', color: '#cc4444', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, 'A Tactical RPG', {
      fontSize: '16px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.startBtn = new UIButton(this, 0, 0, {
      text: 'NEW GAME', width: 240, height: 52, fontSize: 20,
      onClick: () => this.scene.start('PartyCreationScene'),
    });

    this.optionsBtn = new UIButton(this, 0, 0, {
      text: 'OPTIONS', width: 240, height: 52, fontSize: 20,
      bgColor: 0x1a1a0a, hoverColor: 0x2a2a14, pressedColor: 0x3a3a1e,
      borderColor: 0x444422, borderHoverColor: 0x888844,
      textColor: '#cc8844', textHoverColor: '#ffaa66',
      onClick: () => this.scene.start('OptionsScene', { returnTo: 'MenuScene' }),
    });

    this.creditText = this.add.text(0, 0, 'SFX from freesound.org', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0, 1);

    this.scale.on('resize', () => this.reflow());
    this.reflow();
  }

  private reflow(): void {
    const cx = this.coords.canvasWidth / 2;
    const cy = this.coords.canvasHeight / 2;

    this.titleText.setPosition(cx, cy - this.coords.canvasHeight * 0.1)
      .setFontSize(this.coords.fontSize(0.06));
    this.subtitleText.setPosition(cx, cy + this.coords.canvasHeight * 0.02)
      .setFontSize(this.coords.fontSize(0.025));

    const btnW = Math.max(200, this.coords.canvasWidth * 0.18);
    const btnH = Math.max(46, this.coords.canvasHeight * 0.07);
    const fontSize = this.coords.fontSize(0.028);
    this.startBtn.setPosition(Math.round(cx), Math.round(cy + this.coords.canvasHeight * 0.12));
    this.startBtn.resize(btnW, btnH, fontSize);
    this.optionsBtn.setPosition(Math.round(cx), Math.round(cy + this.coords.canvasHeight * 0.22));
    this.optionsBtn.resize(btnW, btnH, fontSize);

    this.creditText.setPosition(8, this.coords.canvasHeight - 8)
      .setFontSize(this.coords.fontSize(0.014));
  }
}
