import * as Phaser from 'phaser';
import { GAME_CONFIG } from './data/config';
import { BootScene } from './scenes/BootScene';
import { PayScene } from './scenes/PayScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldScene } from './scenes/WorldScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: '#120a24',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, PayScene, WorldScene],
};

new Phaser.Game(config);
