import type { Obstacle } from '../types';
import type { CoordinateSystem } from '../core/CoordinateSystem';

export class TerrainRenderer {
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(0);
  }

  draw(obstacles: Obstacle[]): void {
    this.gfx.clear();

    const s = this.coords.scale;
    const aw = this.coords.getArenaWidth();
    const ah = this.coords.getArenaHeight();

    const origin = this.coords.worldToScreen(0, 0);

    // Arena background
    this.gfx.fillStyle(0x121222);
    this.gfx.fillRect(origin.x, origin.y, aw * s, ah * s);

    // Arena border
    this.gfx.lineStyle(1, 0x334466);
    this.gfx.strokeRect(origin.x, origin.y, aw * s, ah * s);

    // Obstacles
    for (const obs of obstacles) {
      const pos = this.coords.worldToScreen(obs.x, obs.y);
      const r = this.coords.worldToPixelDist(obs.radius);
      this.gfx.fillStyle(0x3a3a4a);
      this.gfx.fillCircle(pos.x, pos.y, r);
      this.gfx.lineStyle(1, 0x555566);
      this.gfx.strokeCircle(pos.x, pos.y, r);
    }
  }
}
