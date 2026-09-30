import * as Phaser from 'phaser';
import { api } from '../systems/api';
import { setGameSession } from '../systems/session';

const LOG_START_Y = 170;
const LOG_LINE_HEIGHT = 16;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TitleScene extends Phaser.Scene {
  private started = false;
  private logIndex = 0;

  constructor() {
    super({ key: 'TitleScene' });
  }

  create(): void {
    this.started = false;
    this.logIndex = 0;

    this.add
      .text(240, 80, 'CASHU-XX', {
        fontFamily: 'Courier New',
        fontSize: '40px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);

    this.add
      .text(240, 118, 'a placeholder nut on the road to merge', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(240, 150, 'PRESS ENTER TO PLAY (100 sats, mock wallet)', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#b0a8bd',
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', () => {
        void this.startGame();
      });
    }
  }

  private log(line: string): void {
    this.add.text(40, LOG_START_Y + this.logIndex * LOG_LINE_HEIGHT, line, {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#e8c9a0',
    });
    this.logIndex += 1;
  }

  private async startGame(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    try {
      this.log('> creating session...');
      const session = await api.createSession();
      setGameSession(session);
      this.log(`> trainer id ${session.claimCode}`);
      this.log('> mint quote: 100 sats (mock)');
      const quote = await api.deposit(session.sessionId);
      this.log(`> invoice ${quote.invoice.slice(0, 28)}...`);
      this.log('> awaiting payment...');
      const status = await api.depositStatus(session.sessionId);
      this.log(status.paid ? '> PAID — 10 bundles locked' : '> not paid yet');
      await delay(700);
      this.scene.start('OverworldScene');
    } catch (err) {
      this.log(`> server offline (${(err as Error).message})`);
      this.log('> offline mode: walking only');
      await delay(1000);
      this.scene.start('OverworldScene');
    }
  }
}
