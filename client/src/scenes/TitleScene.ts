import * as Phaser from 'phaser';
import { api } from '../systems/api';
import { hasSave, loadSave } from '../systems/save';
import { setGameSession } from '../systems/session';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.started = false;

    this.add
      .text(240, 44, 'CASHU-XX', {
        fontFamily: 'Courier New',
        fontSize: '40px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 76, 'a placeholder nut on the road to merge', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);

    // The Cashu logo, pixel for pixel, on its purple field.
    this.add.circle(240, 156, 52, 0x7f38ca);
    const hero = this.add.image(240, 156, 'logo').setScale(2).setOrigin(0.5);
    this.tweens.add({ targets: hero, y: 152, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const hint = this.add
      .text(240, 232, 'PRESS ENTER TO PLAY — 100 SATS', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#e0d8ec',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    let nextY = 256;
    if (hasSave()) {
      this.add
        .text(240, nextY, 'PRESS C TO CONTINUE', {
          fontFamily: 'Courier New',
          fontSize: '12px',
          color: '#9d5fe0',
        })
        .setOrigin(0.5);
      nextY += 18;
    }
    this.add
      .text(240, nextY, 'PRESS R TO RECOVER WITH TRAINER ID', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#8a8298',
      })
      .setOrigin(0.5);

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
      });
      const save = loadSave();
      this.scene.start('WorldScene', save ? {
        mapId: save.mapId,
        tileX: save.tileX,
        tileY: save.tileY,
        facing: save.facing,
      } : { mapId: 'nussstadt' });
    } catch {
      window.alert('Unknown Trainer ID. Check the code on your claim screen.');
    }
  }

  private async startGame(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      const session = await api.createSession();
      setGameSession(session);
      await delay(150);
      this.scene.start('PayScene');
    } catch (err) {
      // Don't silently start an unpaid run whose tokens can never be claimed.
      this.started = false;
      this.showError(`${(err as Error).message} — ENTER to retry`);
      this.input.keyboard?.once('keydown-ENTER', () => {
        void this.startGame();
      });
    }
  }

  private errorText: Phaser.GameObjects.Text | null = null;

  private showError(message: string): void {
    this.errorText?.destroy();
    this.errorText = this.add
      .text(240, 300, message, {
        fontFamily: 'Courier New',
        fontSize: '10px',
        color: '#f07878',
        wordWrap: { width: 460 },
        align: 'center',
      })
      .setOrigin(0.5);
  }
}
