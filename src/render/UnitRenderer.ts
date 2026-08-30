import Phaser from 'phaser';
import type { CoordinateSystem } from '../core/CoordinateSystem';
import type { PC } from '../entities/PC';
import type { NPC } from '../entities/NPC';
import { CLASS_LABEL, SPRITE_SCALE } from '../config/constants';
import { ensureCharacterTexture, armorLayerFor } from './CharacterSprites';

/**
 * Draws units. PCs render as a composited character sprite centred on their
 * circle at SPRITE_SCALE of its diameter — the circle stays the mechanical
 * footprint and the art overflows it.
 *
 * Anything without a sprite (enemies, or a PC before its texture is composited)
 * falls back to the original filled circle and letter.
 */
export class UnitRenderer {
  private scene: Phaser.Scene;
  private coords: CoordinateSystem;
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  /** Pooled — the old code destroyed and recreated these every draw. */
  private sprites: Phaser.GameObjects.Image[] = [];
  private spriteCount = 0;
  private labelCount = 0;

  constructor(scene: Phaser.Scene, coords: CoordinateSystem) {
    this.scene = scene;
    this.coords = coords;
    this.gfx = scene.add.graphics().setDepth(2);
  }

  draw(party: PC[], enemies: NPC[], selectedId: string | null): void {
    this.gfx.clear();
    this.spriteCount = 0;
    this.labelCount = 0;

    for (const pc of party) {
      if (pc.dead) continue;
      const alpha = pc.status.includes('beaten') ? 0.4 : pc.turnDone ? 0.6 : 1.0;
      this.drawPC(pc, pc.id === selectedId, alpha);
    }

    for (const e of enemies) {
      // A routed enemy reads as broken at a glance: dimmed, and marked with a
      // '!' instead of its type glyph. Without this the only sign a morale
      // check fired is that something wandered off, which is easy to miss in a
      // room holding twenty of them.
      const fleeing = e.fleeTurns > 0;
      this.drawCircleUnit(
        e.x, e.y, e.radius, e.color,
        fleeing ? '!' : e.label,
        false,
        fleeing ? 0.55 : 1.0,
      );
    }

    // Hide whatever the pools didn't need this pass.
    for (let i = this.spriteCount; i < this.sprites.length; i++) this.sprites[i].setVisible(false);
    for (let i = this.labelCount; i < this.labels.length; i++) this.labels[i].setVisible(false);
  }

  private drawPC(pc: PC, selected: boolean, alpha: number): void {
    const armor = armorLayerFor(pc.inventory.equippedArmor()?.id);
    const textureKey = ensureCharacterTexture(this.scene, pc.appearance, armor);
    if (!textureKey) {
      // Art not loaded yet — fall back so the unit is never invisible.
      this.drawCircleUnit(pc.x, pc.y, pc.radius, pc.color, CLASS_LABEL[pc.charClass] ?? '?', selected, alpha);
      return;
    }

    const pos = this.coords.worldToScreen(pc.x, pc.y);
    const r = this.coords.worldToPixelDist(pc.radius);

    // Faint base disc: keeps team colour readable under the art and gives the
    // figure something to stand on.
    this.gfx.fillStyle(pc.color, alpha * 0.45);
    this.gfx.fillCircle(pos.x, pos.y, r);

    const img = this.takeSprite();
    img.setTexture(textureKey)
      .setPosition(Math.round(pos.x), Math.round(pos.y))
      .setAlpha(alpha)
      .setVisible(true);

    // Width tracks the circle; height follows the source aspect.
    const width = r * 2 * SPRITE_SCALE;
    const src = this.scene.textures.get(textureKey).getSourceImage();
    const aspect = src.height / src.width;
    img.setDisplaySize(width, width * aspect);

    if (selected) {
      this.gfx.lineStyle(2, 0xffffff, 1);
      this.gfx.strokeCircle(pos.x, pos.y, r + 2);
    }
  }

  private drawCircleUnit(
    wx: number, wy: number, worldRadius: number,
    color: number, label: string, selected: boolean, alpha: number,
  ): void {
    const pos = this.coords.worldToScreen(wx, wy);
    const r = this.coords.worldToPixelDist(worldRadius);

    this.gfx.fillStyle(color, alpha);
    this.gfx.fillCircle(pos.x, pos.y, r);

    if (selected) {
      this.gfx.lineStyle(2, 0xffffff, 1);
      this.gfx.strokeCircle(pos.x, pos.y, r + 2);
    }

    const txt = this.takeLabel();
    txt.setPosition(pos.x, pos.y)
      .setText(label)
      .setFontSize(Math.max(8, Math.round(r * 1.2)))
      .setAlpha(alpha)
      .setVisible(true);
  }

  private takeSprite(): Phaser.GameObjects.Image {
    if (this.spriteCount === this.sprites.length) {
      this.sprites.push(this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5).setDepth(3));
    }
    return this.sprites[this.spriteCount++];
  }

  private takeLabel(): Phaser.GameObjects.Text {
    if (this.labelCount === this.labels.length) {
      this.labels.push(
        this.scene.add.text(0, 0, '', { color: '#000', fontStyle: 'bold' })
          .setOrigin(0.5).setDepth(4),
      );
    }
    return this.labels[this.labelCount++];
  }
}
