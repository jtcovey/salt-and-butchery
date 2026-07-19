import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { WorldScene } from './scenes/WorldScene';
import { InventoryScene } from './scenes/InventoryScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 820,
  height: 540,
  backgroundColor: '#000000',
  scene: [BootScene, MenuScene, WorldScene, InventoryScene],
};

new Phaser.Game(config);
