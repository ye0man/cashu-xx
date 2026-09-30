import type * as Phaser from 'phaser';

export type ThemeKey =
  | 'title'
  | 'overworld'
  | 'night'
  | 'lab'
  | 'hq'
  | 'club'
  | 'hideout'
  | 'ceremony';

const MUSIC: Record<ThemeKey, string> = {
  title: 'music-title',
  overworld: 'music-overworld',
  night: 'music-night',
  lab: 'music-lab',
  hq: 'music-hq',
  club: 'music-club',
  hideout: 'music-hideout',
  ceremony: 'music-ceremony',
};

const MUSIC_VOLUME = 0.4;
const SFX_VOLUME = 0.6;

class AudioManager {
  private sound: Phaser.Sound.BaseSoundManager | null = null;
  private current: Phaser.Sound.BaseSound | null = null;
  private currentTheme: ThemeKey | null = null;

  init(sound: Phaser.Sound.BaseSoundManager): void {
    this.sound = sound;
  }

  playTheme(theme: ThemeKey): void {
    if (!this.sound || this.currentTheme === theme) {
      return;
    }
    this.current?.stop();
    this.currentTheme = theme;
    const key = MUSIC[theme];
    if (!this.sound.get(key)) {
      this.current = null;
      return;
    }
    this.current = this.sound.add(key, { loop: true, volume: MUSIC_VOLUME });
    this.current.play();
  }

  playSfx(key: string): void {
    if (!this.sound?.get(key)) {
      return;
    }
    this.sound.play(key, { volume: SFX_VOLUME });
  }
}

export const audio = new AudioManager();
