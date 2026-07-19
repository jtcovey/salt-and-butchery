import type { CoordinateSystem } from '../core/CoordinateSystem';

export class RangeIndicator {
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(1);
  }

  clear(): void {
    this.gfx.clear();
  }

  drawMoveRange(wx: number, wy: number, freeRange: number, totalRange: number): void {
    const pos = this.coords.worldToScreen(wx, wy);

    if (totalRange <= 0 && freeRange <= 0) return;

    if (totalRange > freeRange && totalRange > 0) {
      const outerR = this.coords.worldToPixelDist(totalRange);
      this.gfx.fillStyle(0xaaaa22, 0.08);
      this.gfx.fillCircle(pos.x, pos.y, outerR);
      this.gfx.lineStyle(1, 0xccaa22, 0.4);
      this.gfx.strokeCircle(pos.x, pos.y, outerR);
    }

    if (freeRange > 0) {
      const innerR = this.coords.worldToPixelDist(freeRange);
      this.gfx.fillStyle(0x22aa44, 0.18);
      this.gfx.fillCircle(pos.x, pos.y, innerR);
      this.gfx.lineStyle(1, 0x44cc66, 0.6);
      this.gfx.strokeCircle(pos.x, pos.y, innerR);
    }
  }

  drawAttackRange(wx: number, wy: number, range: number): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(range);
    this.gfx.fillStyle(0xcc2222, 0.06);
    this.gfx.fillCircle(pos.x, pos.y, r);
    this.gfx.lineStyle(1, 0xcc2222, 0.5);
    this.gfx.strokeCircle(pos.x, pos.y, r);
  }

  drawCone(wx: number, wy: number, range: number, angle: number, halfArc: number): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(range);
    const startAngle = angle - halfArc;
    const endAngle = angle + halfArc;

    this.gfx.fillStyle(0xcc2222, 0.15);
    this.gfx.slice(pos.x, pos.y, r, startAngle, endAngle, false);
    this.gfx.fillPath();

    this.gfx.lineStyle(2, 0xff4444, 0.7);
    this.gfx.beginPath();
    this.gfx.arc(pos.x, pos.y, r, startAngle, endAngle, false);
    this.gfx.strokePath();

    // Edge lines
    this.gfx.lineStyle(1, 0xff4444, 0.5);
    this.gfx.lineBetween(
      pos.x, pos.y,
      pos.x + Math.cos(startAngle) * r, pos.y + Math.sin(startAngle) * r
    );
    this.gfx.lineBetween(
      pos.x, pos.y,
      pos.x + Math.cos(endAngle) * r, pos.y + Math.sin(endAngle) * r
    );
  }

  drawHealRange(wx: number, wy: number, range: number): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(range);
    this.gfx.fillStyle(0x22cc88, 0.06);
    this.gfx.fillCircle(pos.x, pos.y, r);
    this.gfx.lineStyle(1, 0x22cc88, 0.5);
    this.gfx.strokeCircle(pos.x, pos.y, r);
  }

  highlightTarget(wx: number, wy: number, radius: number, color: number): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(radius);
    this.gfx.lineStyle(2, color, 0.8);
    this.gfx.strokeCircle(pos.x, pos.y, r + 3);
  }
}
