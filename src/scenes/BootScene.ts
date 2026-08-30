import { BaseScene } from './BaseScene';
import { preloadCharacterSprites } from '../render/CharacterSprites';

/**
 * One-shot entry point. No layout, so no reflow needed.
 *
 * Also the project's only real preload phase — loading character art here means
 * every later scene can assume the textures exist rather than racing them.
 */
export class BootScene extends BaseScene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    preloadCharacterSprites(this.load);
  }

  create() {
    this.scene.start('MenuScene');
  }
}
