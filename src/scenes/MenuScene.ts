import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { UIButton } from '../ui/UIButton';

export class MenuScene extends Phaser.Scene {
  private coords!: CoordinateSystem;
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private startBtn!: UIButton;

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
    this.startBtn.setPosition(cx, cy + this.coords.canvasHeight * 0.12);
    this.startBtn.resize(btnW, btnH, this.coords.fontSize(0.028));
  }
}
