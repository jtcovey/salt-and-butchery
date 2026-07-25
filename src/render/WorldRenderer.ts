import Phaser from 'phaser';
import type { WorldLocation, Vec2 } from '../types';
import type { PC } from '../entities/PC';
import type { CoordinateSystem } from '../core/CoordinateSystem';
import { locationKindProps, PARTY_TOKEN_COLOR } from '../config/worldMap';
import { ensureCharacterTexture, armorLayerFor } from './CharacterSprites';

/** How wide a lone hero is drawn on the overworld, in world units. */
export const PARTY_TOKEN_UNITS = 1.5;

/** One party member, positioned by the scene. */
export interface PartyMemberDraw {
  pc: PC;
  /** World-unit position. */
  pos: Vec2;
  /** Width as a fraction of PARTY_TOKEN_UNITS. */
  scale: number;
}

/**
 * Where each party member sits inside the token footprint, as fractions of it.
 * One member fills the token; more are packed into a grid and shrunk to fit, so
 * the marker keeps the same footprint no matter the party size.
 *
 * Used for world maps, where the party is one abstract group marker. Towns
 * position members individually along a walking trail instead.
 */
export interface ClusterSlot { dx: number; dy: number; scale: number; }

export function clusterLayout(count: number): ClusterSlot[] {
  if (count <= 1) return [{ dx: 0, dy: 0, scale: 1 }];

  // 2 across, then 2x2, then 3x2 for a full party of six.
  const cols = count <= 2 ? 2 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const scale = 1 / Math.max(cols, rows);

  const slots: ClusterSlot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Centre partial rows (e.g. the 5th member of five) rather than left-aligning.
    const inRow = Math.min(cols, count - row * cols);
    const rowOffset = (cols - inRow) / 2;

    slots.push({
      dx: (col + rowOffset - (cols - 1) / 2) * scale,
      dy: (row - (rows - 1) / 2) * scale,
      scale,
    });
  }
  return slots;
}

/**
 * Draws the overworld's moving parts: location markers, their labels, the party,
 * and the look-mode cursor. Terrain is left to TerrainRenderer, which works
 * unchanged on a world map's grid.
 */
export class WorldRenderer {
  private scene: Phaser.Scene;
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;
  private glyphs: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private partySprites: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.scene = scene;
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(2);
  }

  draw(
    locations: WorldLocation[],
    partyPos: Vec2 | null,
    lookTile?: Vec2 | null,
    members: PartyMemberDraw[] = [],
  ): void {
    this.gfx.clear();

    const s = this.coords.scale;
    const markerR = s * 0.45;
    const glyphSize = this.coords.fontSize(0.02);
    const labelSize = this.coords.fontSize(0.015);

    this.ensurePool(locations.length);

    locations.forEach((loc, i) => {
      const props = locationKindProps(loc.kind);
      const p = this.coords.worldToScreen(loc.x, loc.y);

      this.gfx.fillStyle(props.color, 1);
      this.gfx.fillCircle(p.x, p.y, markerR);
      this.gfx.lineStyle(2, 0x000000, 0.8);
      this.gfx.strokeCircle(p.x, p.y, markerR);

      this.glyphs[i]
        .setVisible(true)
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setText(props.glyph)
        .setFontSize(glyphSize);

      this.labels[i]
        .setVisible(true)
        .setPosition(Math.round(p.x), Math.round(p.y + markerR + 2))
        .setText(loc.label)
        .setFontSize(labelSize);
    });

    for (let i = locations.length; i < this.glyphs.length; i++) {
      this.glyphs[i].setVisible(false);
      this.labels[i].setVisible(false);
    }

    // Look cursor sits under the party so the marker is never obscured.
    if (lookTile) {
      const tl = this.coords.worldToScreen(Math.floor(lookTile.x), Math.floor(lookTile.y));
      this.gfx.lineStyle(2, 0xffffaa, 0.9);
      this.gfx.strokeRect(Math.round(tl.x) + 1, Math.round(tl.y) + 1, Math.round(s) - 2, Math.round(s) - 2);
    }

    this.drawParty(partyPos, members);
  }

  /**
   * Members arrive already positioned — the scene decides whether they cluster
   * (world map) or trail in a line (town), since a trail depends on movement
   * history this renderer has no view of.
   *
   * Drawn back-to-front so the leader overlaps whoever's following.
   */
  private drawParty(partyPos: Vec2 | null, members: PartyMemberDraw[]): void {
    const tokenPx = this.coords.worldToPixelDist(PARTY_TOKEN_UNITS);

    if (members.length === 0) {
      // No party data — fall back to the plain token so the position still reads.
      if (partyPos) {
        const centre = this.coords.worldToScreen(partyPos.x, partyPos.y);
        this.gfx.fillStyle(PARTY_TOKEN_COLOR, 1);
        this.gfx.fillCircle(centre.x, centre.y, tokenPx * 0.26);
        this.gfx.lineStyle(2, 0x0a2030, 0.9);
        this.gfx.strokeCircle(centre.x, centre.y, tokenPx * 0.26);
      }
      this.hidePartyFrom(0);
      return;
    }

    let used = 0;
    for (let i = members.length - 1; i >= 0; i--) {
      const { pc, pos, scale } = members[i];
      const p = this.coords.worldToScreen(pos.x, pos.y);
      const armor = armorLayerFor(pc.inventory.equippedArmor()?.id);
      const key = ensureCharacterTexture(this.scene, pc.appearance, armor);

      if (!key) {
        // Art not ready — a coloured pip keeps the member visible.
        this.gfx.fillStyle(pc.color, 1);
        this.gfx.fillCircle(p.x, p.y, tokenPx * scale * 0.3);
        continue;
      }

      const img = this.takePartySprite(used++);
      const src = this.scene.textures.get(key).getSourceImage();
      const width = tokenPx * scale;

      img.setTexture(key)
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setDisplaySize(width, width * (src.height / src.width))
        .setDepth(4 + (members.length - i))
        .setVisible(true);
    }

    this.hidePartyFrom(used);
  }

  private hidePartyFrom(index: number): void {
    for (let i = index; i < this.partySprites.length; i++) {
      this.partySprites[i].setVisible(false);
    }
  }

  private takePartySprite(index: number): Phaser.GameObjects.Image {
    while (this.partySprites.length <= index) {
      this.partySprites.push(
        this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5).setDepth(4),
      );
    }
    return this.partySprites[index];
  }

  private ensurePool(n: number): void {
    while (this.glyphs.length < n) {
      this.glyphs.push(
        this.scene.add.text(0, 0, '', {
          color: '#ffffff', fontStyle: 'bold', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(3),
      );
      this.labels.push(
        this.scene.add.text(0, 0, '', {
          color: '#eeeeee', fontFamily: 'monospace',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(3),
      );
    }
  }
}
