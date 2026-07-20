import type { Obstacle } from '../types';
import type { CoordinateSystem } from '../core/CoordinateSystem';
import { GameOptions } from '../config/GameOptions';

const TILE_COLORS: Record<number, number> = {
  0: 0x2a5a2a, // grass
  1: 0x4a4a4a, // rock
};

export type TileOverlay = 'blood' | 'salt';

export interface SaltBody {
  x: number;
  y: number;
  radius: number;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export class TerrainRenderer {
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(0);
  }

  draw(
    obstacles: Obstacle[],
    terrainGrid?: number[][],
    overlays?: Map<string, TileOverlay>,
    saltBodies?: SaltBody[],
  ): void {
    this.gfx.clear();

    const s = this.coords.scale;
    const aw = this.coords.getArenaWidth();
    const ah = this.coords.getArenaHeight();
    const origin = this.coords.worldToScreen(0, 0);

    if (terrainGrid && terrainGrid.length > 0) {
      const rows = terrainGrid.length;
      const cols = terrainGrid[0].length;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tileId = terrainGrid[r][c];
          const color = TILE_COLORS[tileId] ?? TILE_COLORS[0];
          const pos = this.coords.worldToScreen(c, r);
          this.gfx.fillStyle(color);
          this.gfx.fillRect(pos.x, pos.y, s, s);
        }
      }

      if (overlays) {
        for (const [key, type] of overlays) {
          const [colStr, rowStr] = key.split(',');
          const col = parseInt(colStr);
          const row = parseInt(rowStr);
          const pos = this.coords.worldToScreen(col, row);
          if (type === 'blood') {
            this.drawBloodSplatter(pos.x, pos.y, s, col * 1000 + row);
          } else if (type === 'salt') {
            this.drawSaltPile(pos.x, pos.y, s, col * 1000 + row);
          }
        }
      }

      if (GameOptions.showGrid) {
        this.gfx.lineStyle(0.5, 0x1a1a1a, 0.3);
        for (let c = 0; c <= cols; c++) {
          const p = this.coords.worldToScreen(c, 0);
          const p2 = this.coords.worldToScreen(c, rows);
          this.gfx.lineBetween(p.x, p.y, p2.x, p2.y);
        }
        for (let r = 0; r <= rows; r++) {
          const p = this.coords.worldToScreen(0, r);
          const p2 = this.coords.worldToScreen(cols, r);
          this.gfx.lineBetween(p.x, p.y, p2.x, p2.y);
        }
      }
    } else {
      this.gfx.fillStyle(0x121222);
      this.gfx.fillRect(origin.x, origin.y, aw * s, ah * s);
    }

    this.gfx.lineStyle(1, 0x334466);
    this.gfx.strokeRect(origin.x, origin.y, aw * s, ah * s);

    for (const obs of obstacles) {
      const pos = this.coords.worldToScreen(obs.x, obs.y);
      const r = this.coords.worldToPixelDist(obs.radius);
      this.gfx.fillStyle(0x3a3a4a);
      this.gfx.fillCircle(pos.x, pos.y, r);
      this.gfx.lineStyle(1, 0x555566);
      this.gfx.strokeCircle(pos.x, pos.y, r);
    }

    if (saltBodies) {
      for (const body of saltBodies) {
        const pos = this.coords.worldToScreen(body.x, body.y);
        const r = this.coords.worldToPixelDist(body.radius);
        this.gfx.fillStyle(0xbbbbbb, 0.6);
        this.gfx.fillCircle(pos.x, pos.y, r);
        this.gfx.lineStyle(1, 0x999999, 0.4);
        this.gfx.strokeCircle(pos.x, pos.y, r);
      }
    }
  }

  private drawBloodSplatter(tileX: number, tileY: number, tileSize: number, seed: number): void {
    const rng = seededRandom(seed + 7777);
    const margin = tileSize * 0.1;
    const inner = tileSize - margin * 2;
    const count = 12 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const ox = tileX + margin + rng() * inner;
      const oy = tileY + margin + rng() * inner;
      const dotR = tileSize * (0.06 + rng() * 0.08);
      const shade = rng() > 0.5 ? 0xaa1111 : 0x880000;
      this.gfx.fillStyle(shade, 0.7 + rng() * 0.25);
      this.gfx.fillCircle(ox, oy, dotR);
    }
  }

  private drawSaltPile(tileX: number, tileY: number, tileSize: number, seed: number): void {
    const rng = seededRandom(seed + 3333);
    const margin = tileSize * 0.1;
    const inner = tileSize - margin * 2;
    const count = 16 + Math.floor(rng() * 10);
    for (let i = 0; i < count; i++) {
      const ox = tileX + margin + rng() * inner;
      const oy = tileY + margin + rng() * inner;
      const dotR = tileSize * (0.04 + rng() * 0.06);
      const shade = rng() > 0.4 ? 0xeeeeee : 0xcccccc;
      this.gfx.fillStyle(shade, 0.7 + rng() * 0.25);
      this.gfx.fillCircle(ox, oy, dotR);
    }
  }
}
