import Phaser from 'phaser';
import type { PC } from '../entities/PC';

export class WorldMapScene extends Phaser.Scene {
  private party: PC[] = [];

  constructor() { super({ key: 'WorldMapScene' }); }

  init(data?: { party?: PC[] }) {
    if (data?.party) this.party = data.party;
  }

  create() {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    this.add.text(cx, cy - 40, 'WORLD MAP (stub)', {
      fontSize: '20px', color: '#888',
    }).setOrigin(0.5);

    const btn = this.add.text(cx, cy + 20, '[ Enter Combat Test ]', {
      fontSize: '18px', color: '#44ccff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerdown', () => {
      this.scene.start('CombatScene', { party: this.party });
    });
  }
}
