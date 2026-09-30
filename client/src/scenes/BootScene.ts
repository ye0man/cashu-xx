import * as Phaser from 'phaser';
import { registerArt } from '../art/textures';
import { audio } from '../systems/audio';
import { loadSettings } from '../systems/settings';

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
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    for (const [key, url] of Object.entries(AUDIO_ASSETS)) {
      this.load.audio(key, url);
    }
  }

  create(): void {
    // All visual art is hand-authored pixel data (src/art), baked at boot.
    registerArt(this.textures);
    audio.init(this.sound);
    audio.setMuted(loadSettings().muted);
    audio.playTheme('title');
    this.scene.start('TitleScene');
  }
}
