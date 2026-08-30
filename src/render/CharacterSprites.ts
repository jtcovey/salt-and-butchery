import Phaser from 'phaser';
import type { BodyType } from '../types';
import type { Appearance } from '../config/appearance';
import { hexString } from '../config/appearance';

/**
 * Character sprites are assembled from layers.
 *
 * Base body (4 layers): three white masks that get tinted — skin, primary
 * garments, secondary boots/trim — plus black line art over the top.
 *
 * Armour (3 layers): primary and secondary masks plus its own line art, drawn
 * over the finished body. No skin layer, since armour covers it.
 *
 * Armour is tinted with the *same* primary/secondary as the character, so a
 * hero's gear carries their colours.
 *
 * Rather than tinting at draw time, each unique look is composited once into a
 * cached texture. `main.ts` uses `Phaser.AUTO`, which can fall back to Canvas
 * where Phaser's tinting is emulated and unreliable, and `UnitRenderer` rebuilds
 * every draw — so per-frame tinting would repeat work that changes only when a
 * character's colours or equipment change.
 */

export type ArmorLayerId = 'leather' | 'mail';

interface LayerSet {
  lines: string;
  prim: string;
  sec: string;
  /** Base body only — armour covers skin. */
  skin?: string;
}

const BASE_LAYERS: Record<BodyType, Required<LayerSet>> = {
  1: { lines: 'bt1_lines', skin: 'bt1_skin', prim: 'bt1_prim', sec: 'bt1_sec' },
  2: { lines: 'bt2_lines', skin: 'bt2_skin', prim: 'bt2_prim', sec: 'bt2_sec' },
};

/** Armour sets still being drawn are simply absent — they render without armour. */
const ARMOR_LAYERS: Partial<Record<ArmorLayerId, Record<BodyType, LayerSet>>> = {
  leather: {
    1: { lines: 'bt1_leather_lines', prim: 'bt1_leather_prim', sec: 'bt1_leather_sec' },
    2: { lines: 'bt2_leather_lines', prim: 'bt2_leather_prim', sec: 'bt2_leather_sec' },
  },
  mail: {
    1: { lines: 'bt1_mail_lines', prim: 'bt1_mail_prim', sec: 'bt1_mail_sec' },
    2: { lines: 'bt2_mail_lines', prim: 'bt2_mail_prim', sec: 'bt2_mail_sec' },
  },
};

/** Inventory item id → armour layer set. */
const ARMOR_BY_ITEM_ID: Record<string, ArmorLayerId> = {
  leather_armor: 'leather',
  mail_armor: 'mail',
};

export function armorLayerFor(itemId: string | undefined): ArmorLayerId | null {
  return itemId ? ARMOR_BY_ITEM_ID[itemId] ?? null : null;
}

/** Source images to load. Paths are relative to `public/`. */
export const SPRITE_FILES: ReadonlyArray<readonly [string, string]> = [
  ['bt1_lines', 'sprites/BT1Lines.png'],
  ['bt1_skin',  'sprites/BT1Skin.png'],
  ['bt1_prim',  'sprites/BT1Prim.png'],
  ['bt1_sec',   'sprites/BT1Sec.png'],
  ['bt2_lines', 'sprites/BT2Lines.png'],
  ['bt2_skin',  'sprites/BT2Skin.png'],
  ['bt2_prim',  'sprites/BT2Prim.png'],
  ['bt2_sec',   'sprites/BT2Sec.png'],

  ['bt1_leather_lines', 'sprites/BT1LeatherLines.png'],
  ['bt1_leather_prim',  'sprites/BT1LeatherPrim.png'],
  ['bt1_leather_sec',   'sprites/BT1LeatherSec.png'],
  ['bt2_leather_lines', 'sprites/BT2LeatherLines.png'],
  ['bt2_leather_prim',  'sprites/BT2LeatherPrim.png'],
  ['bt2_leather_sec',   'sprites/BT2LeatherSec.png'],

  ['bt1_mail_lines', 'sprites/BT1MailLines.png'],
  ['bt1_mail_prim',  'sprites/BT1MailPrim.png'],
  ['bt1_mail_sec',   'sprites/BT1MailSec.png'],
  ['bt2_mail_lines', 'sprites/BT2MailLines.png'],
  ['bt2_mail_prim',  'sprites/BT2MailPrim.png'],
  ['bt2_mail_sec',   'sprites/BT2MailSec.png'],
];

export function preloadCharacterSprites(load: Phaser.Loader.LoaderPlugin): void {
  for (const [key, path] of SPRITE_FILES) {
    load.image(key, path);
  }
}

export function characterTextureKey(a: Appearance, armor: ArmorLayerId | null): string {
  return `char:${a.bodyType}:${a.skin}:${a.primary}:${a.secondary}:${armor ?? 'none'}`;
}

/**
 * Composite (or fetch from cache) the texture for one look.
 * Returns null when the base images haven't finished loading, so callers can
 * fall back to plain circles rather than popping in mid-frame.
 */
export function ensureCharacterTexture(
  scene: Phaser.Scene,
  a: Appearance,
  armor: ArmorLayerId | null = null,
): string | null {
  const base = BASE_LAYERS[a.bodyType];
  if (!base) return null;

  // Armour whose art isn't in yet degrades to an unarmoured body.
  const armorSet = armor ? ARMOR_LAYERS[armor]?.[a.bodyType] : undefined;
  const effectiveArmor = armorSet ? armor : null;

  const key = characterTextureKey(a, effectiveArmor);
  if (scene.textures.exists(key)) return key;

  const required = [base.lines, base.skin, base.prim, base.sec];
  if (armorSet) required.push(armorSet.lines, armorSet.prim, armorSet.sec);
  for (const src of required) {
    if (!scene.textures.exists(src)) return null;
  }

  const lines = sourceImage(scene, base.lines);
  const w = lines.width;
  const h = lines.height;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Source art is authored at display size; never let the browser blur it.
  ctx.imageSmoothingEnabled = false;

  // Body: skin, garments, boots, then linework.
  drawTintedMask(ctx, scene, base.skin, a.skin, w, h);
  drawTintedMask(ctx, scene, base.prim, a.primary, w, h);
  drawTintedMask(ctx, scene, base.sec, a.secondary, w, h);
  ctx.drawImage(lines, 0, 0, w, h);

  // Armour over the top, wearing the character's own colours.
  if (armorSet) {
    drawTintedMask(ctx, scene, armorSet.prim, a.primary, w, h);
    drawTintedMask(ctx, scene, armorSet.sec, a.secondary, w, h);
    ctx.drawImage(sourceImage(scene, armorSet.lines), 0, 0, w, h);
  }

  const texture = scene.textures.addCanvas(key, canvas);
  // Keep small source art crisp when scaled up rather than bilinear-blurred.
  texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** One reusable scratch buffer rather than fresh canvases per layer. */
let scratch: HTMLCanvasElement | null = null;

function getScratch(w: number, h: number): CanvasRenderingContext2D | null {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  const ctx = scratch.getContext('2d');
  if (!ctx) return null;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/**
 * Paint `color` through a white mask. `source-in` keeps the fill only where the
 * mask is opaque, preserving its antialiased edges.
 */
function drawTintedMask(
  dst: CanvasRenderingContext2D,
  scene: Phaser.Scene,
  maskKey: string,
  color: number,
  w: number,
  h: number,
): void {
  const ctx = getScratch(w, h);
  if (!ctx) return;

  ctx.drawImage(sourceImage(scene, maskKey), 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hexString(color);
  ctx.fillRect(0, 0, w, h);

  dst.drawImage(scratch!, 0, 0);
}

function sourceImage(scene: Phaser.Scene, key: string): CanvasImageSource & { width: number; height: number } {
  return scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
}
