import * as Phaser from 'phaser';
import { audio } from '../systems/audio';
import { loadSettings } from '../systems/settings';

const IMAGE_ASSETS: Record<string, string> = {
  'tile-floor': 'assets/tiles/tile-floor.png',
  'tile-wall': 'assets/tiles/tile-wall.png',
  'tile-water': 'assets/tiles/tile-water.png',
  'tile-door': 'assets/tiles/tile-door.png',
  sign: 'assets/tiles/sign.png',
  pickup: 'assets/tiles/pickup.png',
  'npc-hickory': 'assets/sprites/hickory.png',
  'npc-rusty': 'assets/sprites/rusty.png',
  'npc-coco': 'assets/sprites/coco.png',
  'npc-pip': 'assets/sprites/pip.png',
  'npc-djmac': 'assets/sprites/djmac.png',
  'npc-kimi': 'assets/sprites/kimi.png',
  'npc-receptionist': 'assets/sprites/receptionist.png',
  'npc-civ-a': 'assets/sprites/civ-doner.png',
  'npc-civ-b': 'assets/sprites/civ-commuter.png',
};

const AUDIO_ASSETS: Record<string, string> = {
  'music-title': 'assets/audio/title.mp3',
  'music-overworld': 'assets/audio/overworld.mp3',
  'music-night': 'assets/audio/night.mp3',
  'music-lab': 'assets/audio/lab.mp3',
  'music-hq': 'assets/audio/hq.mp3',
  'music-club': 'assets/audio/club.mp3',
  'music-hideout': 'assets/audio/hideout.mp3',
  'music-ceremony': 'assets/audio/ceremony.mp3',
  'sfx-text': 'assets/audio/sfx-text.mp3',
  'sfx-menu': 'assets/audio/sfx-menu.mp3',
  'sfx-door': 'assets/audio/sfx-door.mp3',
  'sfx-item': 'assets/audio/sfx-item.mp3',
  'sfx-token': 'assets/audio/sfx-token.mp3',
};

export class BootScene extends Phaser.Scene {
  private readonly failed = new Set<string>();

  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failed.add(file.key);
    });
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 24,
    });
    for (const [key, url] of Object.entries(IMAGE_ASSETS)) {
      this.load.image(key, url);
    }
    for (const [key, url] of Object.entries(AUDIO_ASSETS)) {
      this.load.audio(key, url);
    }
  }

  create(): void {
    audio.init(this.sound);
    audio.setMuted(loadSettings().muted);
    this.makeFallbacks();
    audio.playTheme('title');
    this.scene.start('TitleScene');
  }

  private makeFallbacks(): void {
    for (const key of this.failed) {
      if (key === 'player') {
        this.makePlaceholderPlayer();
      } else if (key.startsWith('npc-')) {
        this.makeNpc(key, 0xe8c9a0, 0x7b2fbe);
      } else if (!key.startsWith('music-') && !key.startsWith('sfx-')) {
        this.makeTileFallback(key);
      }
    }
  }

  private makePlaceholderPlayer(): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0xe8c9a0, 1);
    gfx.fillRect(2, 6, 12, 16);
    gfx.fillStyle(0x7b2fbe, 1);
    gfx.fillRect(2, 2, 12, 6);
    gfx.fillStyle(0x000000, 1);
    gfx.fillRect(2, 12, 12, 3);
    gfx.generateTexture('player', 16, 24);
    gfx.destroy();
  }

  private makeTileFallback(key: string): void {
    const colors: Record<string, number> = {
      'tile-floor': 0x2d1b4e,
      'tile-wall': 0x1e1036,
      'tile-water': 0x2c5f8a,
      'tile-door': 0xc9a87c,
      sign: 0xe8c9a0,
      pickup: 0xf7e7cf,
    };
    const gfx = this.add.graphics();
    gfx.fillStyle(colors[key] ?? 0x2d1b4e, 1);
    gfx.fillRect(0, 0, 16, 16);
    gfx.generateTexture(key, 16, 16);
    gfx.destroy();
  }

  private makeNpc(key: string, body: number, accent: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(body, 1);
    gfx.fillRect(2, 6, 12, 16);
    gfx.fillStyle(accent, 1);
    gfx.fillRect(2, 2, 12, 6);
    gfx.fillStyle(0x120a24, 1);
    gfx.fillRect(2, 12, 12, 3);
    gfx.generateTexture(key, 16, 24);
    gfx.destroy();
  }
}
