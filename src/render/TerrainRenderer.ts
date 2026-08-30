import type { Obstacle } from '../types';
import type { CoordinateSystem } from '../core/CoordinateSystem';
import { GameOptions } from '../config/GameOptions';
import { tileProps } from '../config/terrain';

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

      /**
       * Snapped edge tables — the fix for grid lines vanishing at some scales.
       *
       * Tile size `s` is almost never a whole number of pixels (letterbox-fit
       * of a 60x40 arena lands on things like 16.8). Drawing tiles and lines at
       * raw fractional coords means each edge straddles a pixel boundary by a
       * different amount, so some lines rasterise and some smear into nothing.
       *
       * Rounding every edge ONCE, here, and using the same numbers for the tile
       * fills and the grid lines guarantees the two agree: no seams between
       * tiles, and every line lands on a real pixel column. Cells end up 1px
       * uneven here and there, which is invisible and correct for pixel art.
       */
      const xs: number[] = [];
      for (let c = 0; c <= cols; c++) xs.push(Math.round(this.coords.worldToScreen(c, 0).x));
      const ys: number[] = [];
      for (let r = 0; r <= rows; r++) ys.push(Math.round(this.coords.worldToScreen(0, r).y));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tileId = terrainGrid[r][c];
          const color = tileProps(tileId).color;
          this.gfx.fillStyle(color);
          this.gfx.fillRect(xs[c], ys[r], xs[c + 1] - xs[c], ys[r + 1] - ys[r]);
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
        // Width 1, not 0.5 — a sub-pixel line has no reliable rasterisation and
        // was the other half of the vanishing-lines bug. The +0.5 offset centres
        // a 1px stroke inside one pixel column instead of splitting two.
        this.gfx.lineStyle(1, 0x1a1a1a, 0.35);
        const top = ys[0], bottom = ys[rows];
        for (let c = 0; c <= cols; c++) {
          this.gfx.lineBetween(xs[c] + 0.5, top, xs[c] + 0.5, bottom);
        }
        const left = xs[0], right = xs[cols];
        for (let r = 0; r <= rows; r++) {
          this.gfx.lineBetween(left, ys[r] + 0.5, right, ys[r] + 0.5);
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
