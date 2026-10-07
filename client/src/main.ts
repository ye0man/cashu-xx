import * as Phaser from 'phaser';
import { GAME_CONFIG } from './data/config';
import { BootScene } from './scenes/BootScene';
import { EndingScene } from './scenes/EndingScene';
import { MintScene } from './scenes/MintScene';
import { PayScene } from './scenes/PayScene';
import { TitleScene } from './scenes/TitleScene';
import { WorldScene } from './scenes/WorldScene';

interface Fit {
  /** CSS zoom: a whole number of *device* pixels per art pixel, divided back into CSS pixels. */
  zoom: number;
  left: number;
  top: number;
}

/**
 * Largest whole-number scale that fits the window, counted in device pixels.
 * Counting in CSS pixels breaks under OS display scaling (125%/150%): a CSS
 * zoom of 3 becomes 3.75 or 4.5 device pixels per art pixel, which the browser
 * resamples into uneven, blurry pixels. The canvas is also placed on a whole
 * device pixel, since centring can land it on a fractional offset.
 */
function fit(): Fit {
  const dpr = window.devicePixelRatio || 1;
  const deviceW = window.innerWidth * dpr;
  const deviceH = window.innerHeight * dpr;
  const scale = Math.max(1, Math.floor(Math.min(deviceW / GAME_CONFIG.width, deviceH / GAME_CONFIG.height)));
  const left = Math.max(0, Math.floor((deviceW - GAME_CONFIG.width * scale) / 2)) / dpr;
  const top = Math.max(0, Math.floor((deviceH - GAME_CONFIG.height * scale) / 2)) / dpr;
  return { zoom: scale / dpr, left, top };
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
    zoom: fit().zoom,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, TitleScene, MintScene, PayScene, WorldScene, EndingScene],
};

const game = new Phaser.Game(config);
if (import.meta.env.DEV) {
  // Lets tools/capture scripts jump straight to a scene.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

function applyFit(): void {
  const { zoom, left, top } = fit();
  game.scale.setZoom(zoom);
  const canvas = game.canvas;
  if (canvas) {
    canvas.style.position = 'absolute';
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
  }
}

game.events.once(Phaser.Core.Events.READY, applyFit);
window.addEventListener('resize', applyFit);

// Browser zoom / moving to a monitor with another scale changes devicePixelRatio
// without always firing `resize`.
function watchPixelRatio(): void {
  const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  query.addEventListener(
    'change',
    () => {
      applyFit();
      watchPixelRatio();
    },
    { once: true },
  );
}
watchPixelRatio();
