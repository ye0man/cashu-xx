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
      .text(240, 72, 'CASHU-XX', {
        fontFamily: 'Courier New',
        fontSize: '40px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 110, 'a placeholder nut on the road to merge', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(240, 148, 'PRESS ENTER TO PLAY — 100 SATS', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#b0a8bd',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    let nextY = 172;
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
        color: '#6b6478',
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
    } catch {
      this.scene.start('WorldScene', { mapId: 'nussstadt' });
    }
  }
}
