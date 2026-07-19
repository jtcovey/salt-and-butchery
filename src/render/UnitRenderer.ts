import type { CoordinateSystem } from '../core/CoordinateSystem';
import type { PC } from '../entities/PC';
import type { NPC } from '../entities/NPC';
import { CLASS_LABEL } from '../config/constants';

export class UnitRenderer {
  private scene: Phaser.Scene;
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.scene = scene;
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(2);
  }

  draw(party: PC[], enemies: NPC[], selectedId: string | null): void {
    this.gfx.clear();
    this.labels.forEach(l => l.destroy());
    this.labels = [];

    for (const pc of party) {
      if (pc.dead) continue;
      this.drawUnit(pc.x, pc.y, pc.radius, pc.color, CLASS_LABEL[pc.charClass] ?? '?',
        pc.id === selectedId, pc.status.includes('beaten') ? 0.4 : pc.turnDone ? 0.6 : 1.0);
    }

    for (const e of enemies) {
      this.drawUnit(e.x, e.y, e.radius, e.color, e.label, false, 1.0);
    }
  }

  private drawUnit(wx: number, wy: number, worldRadius: number, color: number, label: string, selected: boolean, alpha: number): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(worldRadius);

    this.gfx.fillStyle(color, alpha);
    this.gfx.fillCircle(pos.x, pos.y, r);

    if (selected) {
      this.gfx.lineStyle(2, 0xffffff, 1);
      this.gfx.strokeCircle(pos.x, pos.y, r + 2);
    }

    const fontSize = Math.max(8, Math.round(r * 1.2));
    const txt = this.scene.add.text(pos.x, pos.y, label, {
      fontSize: `${fontSize}px`, color: '#000', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(3).setAlpha(alpha);
    this.labels.push(txt);
  }
}
