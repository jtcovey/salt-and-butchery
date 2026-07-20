import type { Vec2, LayoutRegion } from '../types';
import { LAYOUT, DEFAULT_ARENA_WIDTH, DEFAULT_ARENA_HEIGHT } from '../config/constants';

export class CoordinateSystem {
  private scene: Phaser.Scene;
  private arenaWidth = DEFAULT_ARENA_WIDTH;
  private arenaHeight = DEFAULT_ARENA_HEIGHT;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get canvasWidth(): number { return this.scene.scale.width; }
  get canvasHeight(): number { return this.scene.scale.height; }

  get viewportPixelRect(): { x: number; y: number; w: number; h: number } {
    const region = LAYOUT.gameArea;
    return {
      x: this.canvasWidth * region.x,
      y: this.canvasHeight * region.y,
      w: this.canvasWidth * region.width,
      h: this.canvasHeight * region.height,
    };
  }

  get scale(): number {
    const vp = this.viewportPixelRect;
    return Math.min(vp.w / this.arenaWidth, vp.h / this.arenaHeight);
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    const vp = this.viewportPixelRect;
    const s = this.scale;
    const offsetX = vp.x + (vp.w - this.arenaWidth * s) / 2;
    const offsetY = vp.y + (vp.h - this.arenaHeight * s) / 2;
    return { x: offsetX + wx * s, y: offsetY + wy * s };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const vp = this.viewportPixelRect;
    const s = this.scale;
    const offsetX = vp.x + (vp.w - this.arenaWidth * s) / 2;
    const offsetY = vp.y + (vp.h - this.arenaHeight * s) / 2;
    return { x: (sx - offsetX) / s, y: (sy - offsetY) / s };
  }

  worldToPixelDist(d: number): number { return d * this.scale; }

  regionPixels(region: LayoutRegion): { x: number; y: number; w: number; h: number } {
    return {
      x: this.canvasWidth * region.x,
      y: this.canvasHeight * region.y,
      w: this.canvasWidth * region.width,
      h: this.canvasHeight * region.height,
    };
  }

  fontSize(pct: number): number {
    return Math.max(10, Math.round(this.canvasHeight * pct));
  }

  setArena(w: number, h: number): void {
    this.arenaWidth = w;
    this.arenaHeight = h;
  }

  getArenaWidth(): number { return this.arenaWidth; }
  getArenaHeight(): number { return this.arenaHeight; }

  isInGameArea(sx: number, sy: number): boolean {
    const vp = this.viewportPixelRect;
    return sx >= vp.x && sx <= vp.x + vp.w && sy >= vp.y && sy <= vp.y + vp.h;
  }
}
