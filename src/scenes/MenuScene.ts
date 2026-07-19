import Phaser from 'phaser';
import { UIButton } from '../ui/UIButton';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const W = this.scale.width;   // 820
    const H = this.scale.height;  // 540

    this.add.text(W / 2, 140, 'Salt & Butchery', {
      fontSize: '52px',
      color: '#cc0000',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    new UIButton(this, W / 2, 300, {
      text: 'New Game',
      onClick: () => this.scene.start('WorldScene'),
    });

    new UIButton(this, W / 2, 360, {
      text: 'Options',
      onClick: () => { /* TODO */ },
    });

    new UIButton(this, W / 2, 420, {
      text: 'Quit',
      onClick: () => { /* TODO */ },
    });
  }
}
