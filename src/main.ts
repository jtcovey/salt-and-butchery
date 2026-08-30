import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PartyCreationScene } from './scenes/PartyCreationScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { CombatScene } from './scenes/CombatScene';
import { InventoryScene } from './scenes/InventoryScene';
import { ShopScene } from './scenes/ShopScene';
import { OptionsScene } from './scenes/OptionsScene';

import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#0a0a14',
  roundPixels: true,
  // Character art is authored at its display size (30x36). Nearest-neighbour
  // keeps it crisp when the arena scales up instead of blurring it.
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: 'game-container',
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, MenuScene, PartyCreationScene, WorldMapScene, CombatScene, InventoryScene, ShopScene, OptionsScene],
};

const game = new Phaser.Game(config);

// Dev-only handle for driving the game from the browser console — jumping
// straight to a dungeon beats walking the world map every time you want to test
// the third room. Stripped from production builds by the DEV guard.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
