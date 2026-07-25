import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PartyCreationScene } from './scenes/PartyCreationScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { CombatScene } from './scenes/CombatScene';
import { InventoryScene } from './scenes/InventoryScene';
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
  scene: [BootScene, MenuScene, PartyCreationScene, WorldMapScene, CombatScene, InventoryScene, OptionsScene],
};

new Phaser.Game(config);
