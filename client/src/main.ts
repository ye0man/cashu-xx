import * as Phaser from 'phaser';
import { GAME_CONFIG } from './data/config';
import { BootScene } from './scenes/BootScene';
import { EndingScene } from './scenes/EndingScene';
import { PayScene } from './scenes/PayScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldScene } from './scenes/WorldScene';

/** Largest whole-number zoom that fits the window: every art pixel stays square. */
function integerZoom(): number {
  const zx = Math.floor(window.innerWidth / GAME_CONFIG.width);
  const zy = Math.floor(window.innerHeight / GAME_CONFIG.height);
  return Math.max(1, Math.min(zx, zy));
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_CONFIG.width,
  height: GAME_CONFIG.height,
  backgroundColor: '#120a24',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: integerZoom(),
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, PayScene, WorldScene, EndingScene],
};

const game = new Phaser.Game(config);
window.addEventListener('resize', () => {
  game.scale.setZoom(integerZoom());
});
