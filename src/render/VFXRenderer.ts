import type { CoordinateSystem } from '../core/CoordinateSystem';

export class VFXRenderer {
  private scene: Phaser.Scene;
  private coords: CoordinateSystem;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.scene = scene;
    this.coords = coords;
  }

  arrowTrail(fromX: number, fromY: number, toX: number, toY: number): void {
    this.projectile(fromX, fromY, toX, toY, 0x000000, 2, 200);
  }

  curseBolt(fromX: number, fromY: number, toX: number, toY: number): void {
    this.projectile(fromX, fromY, toX, toY, 0xcc2222, 2.5, 200);
  }

  healGlow(targetX: number, targetY: number): void {
    this.glow(targetX, targetY, 0x44ee66, 400);
  }

  blessGlow(targetX: number, targetY: number): void {
    this.glow(targetX, targetY, 0xeedd44, 400);
  }

  private projectile(
    fromWX: number, fromWY: number, toWX: number, toWY: number,
    color: number, thickness: number, duration: number,
  ): void {
    const gfx = this.scene.add.graphics().setDepth(15);
    const from = this.coords.worldToScreen(fromWX, fromWY);
    const to = this.coords.worldToScreen(toWX, toWY);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const tailLen = Math.min(len * 0.3, 20);

    let elapsed = 0;
    const event = this.scene.time.addEvent({
      delay: 16,
      repeat: Math.ceil(duration / 16),
      callback: () => {
        elapsed += 16;
        const t = Math.min(1, elapsed / duration);
        const headX = from.x + dx * t;
        const headY = from.y + dy * t;
        const tailT = Math.max(0, t - tailLen / len);
        const tailX = from.x + dx * tailT;
        const tailY = from.y + dy * tailT;

        gfx.clear();
        gfx.lineStyle(thickness, color, 1 - t * 0.3);
        gfx.lineBetween(tailX, tailY, headX, headY);

        if (t >= 1) {
          gfx.clear();
          gfx.destroy();
          event.destroy();
        }
      },
    });
  }

  private glow(wx: number, wy: number, color: number, duration: number): void {
    const gfx = this.scene.add.graphics().setDepth(15);
    const pos = this.coords.worldToScreen(wx, wy);
    const maxR = this.coords.worldToPixelDist(1.2);

    let elapsed = 0;
    const event = this.scene.time.addEvent({
      delay: 16,
      repeat: Math.ceil(duration / 16),
      callback: () => {
        elapsed += 16;
        const t = Math.min(1, elapsed / duration);
        const alpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        const r = maxR * (0.5 + t * 0.5);

        gfx.clear();
        gfx.fillStyle(color, alpha * 0.35);
        gfx.fillCircle(pos.x, pos.y, r);
        gfx.lineStyle(2, color, alpha * 0.7);
        gfx.strokeCircle(pos.x, pos.y, r * 0.7);

        if (t >= 1) {
          gfx.clear();
          gfx.destroy();
          event.destroy();
        }
      },
    });
  }
}
