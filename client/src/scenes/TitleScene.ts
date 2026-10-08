import * as Phaser from 'phaser';
import { api } from '../systems/api';
import { selectedMintLabel, selectedMintUrl, setSelectedMint } from '../systems/mint';
import { hasSave, loadSave } from '../systems/save';
import { setGameSession } from '../systems/session';
import { type PixelText, pixelText } from '../ui/text';

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export class TitleScene extends Phaser.Scene {
  private started = false;
  private statusText: PixelText | null = null;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.started = false;
    this.statusText = null;

    pixelText(this, 240, 28, 'CASHU-XX', { scale: 4, color: '#e8c9a0' }).setOrigin(0.5, 0);
    pixelText(this, 240, 70, 'a placeholder nut on the road to merge', { color: '#9d5fe0' }).setOrigin(0.5, 0);

    // The Cashu logo, pixel for pixel, on its pixel-drawn purple field.
    this.add.image(240, 152, 'logo-field');
    const hero = this.add.image(240, 152, 'logo').setScale(2).setOrigin(0.5);
    this.tweens.add({
      targets: hero,
      y: 148,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      // Whole-pixel steps only: a sub-pixel bob shimmers the sprite.
      onUpdate: () => hero.setY(Math.round(hero.y)),
    });

    const hint = pixelText(this, 240, 222, 'PRESS ENTER TO PLAY — 100 SATS', { scale: 2, color: '#e0d8ec' }).setOrigin(
      0.5,
      0,
    );
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    let nextY = 246;
    if (hasSave()) {
      pixelText(this, 240, nextY, 'PRESS C TO CONTINUE', { color: '#9d5fe0' }).setOrigin(0.5, 0);
      nextY += 14;
    }
    pixelText(this, 240, nextY, 'PRESS R TO RECOVER WITH TRAINER ID', { color: '#8a8298' }).setOrigin(0.5, 0);
    nextY += 14;
    pixelText(this, 240, nextY, 'PRESS M TO SELECT MINT', { color: '#8a8298' }).setOrigin(0.5, 0);
    nextY += 14;
    pixelText(this, 240, nextY, `MINT: ${selectedMintLabel()}`, { color: '#9d5fe0' }).setOrigin(0.5, 0);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', () => {
        void this.startGame();
      });
      keyboard.on('keydown-C', () => {
        this.continueGame();
      });
      keyboard.on('keydown-R', () => {
        void this.recoverGame();
      });
      keyboard.on('keydown-M', () => {
        this.scene.start('MintScene');
      });
    }
  }

  private continueGame(): void {
    const save = loadSave();
    if (!save) {
      return;
    }
    this.scene.start('WorldScene', {
      mapId: save.mapId,
      tileX: save.tileX,
      tileY: save.tileY,
      facing: save.facing,
    });
  }

  private async recoverGame(): Promise<void> {
    const code = window.prompt('Enter your Trainer ID (claim code):');
    if (!code) {
      return;
    }
    try {
      const recovered = await api.claim(code.trim().toUpperCase());
      setGameSession({
        sessionId: recovered.sessionId,
        authToken: recovered.authToken,
        claimCode: code.trim().toUpperCase(),
        mintUrl: recovered.mintUrl,
      });
      setSelectedMint({ url: recovered.mintUrl, label: host(recovered.mintUrl) });
      const save = loadSave();
      this.scene.start(
        'WorldScene',
        save
          ? {
              mapId: save.mapId,
              tileX: save.tileX,
              tileY: save.tileY,
              facing: save.facing,
            }
          : { mapId: 'nutsterdam' },
      );
    } catch {
      window.alert('Unknown Trainer ID. Check the code on your claim screen.');
    }
  }

  private async startGame(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    // Say something the instant ENTER lands; the request itself is quick now,
    // but a silent screen always feels hung.
    this.showStatus('opening a session with the mint...', '#9d5fe0');
    try {
      const session = await api.createSession(selectedMintUrl());
      setGameSession(session);
      this.scene.start('PayScene');
    } catch (err) {
      // Don't silently start an unpaid run whose tokens can never be claimed.
      this.started = false;
      this.showStatus(`${(err as Error).message} — ENTER to retry`, '#f07878');
      this.input.keyboard?.once('keydown-ENTER', () => {
        void this.startGame();
      });
    }
  }

  private showStatus(message: string, color: string): void {
    this.statusText?.destroy();
    this.statusText = pixelText(this, 240, 304, message, { color, maxWidth: 460, align: 'center' }).setOrigin(0.5, 0);
  }
}
