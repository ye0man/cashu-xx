import * as Phaser from 'phaser';
import QRCode from 'qrcode';
import type { DepositQuote, MintInfoResponse } from '@cashu-xx/shared';
import { api, type ApiError } from '../systems/api';
import { getGameSession } from '../systems/session';

const POLL_MS = 2000;

export class PayScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private invoiceText!: Phaser.GameObjects.Text;
  private mintText!: Phaser.GameObjects.Text;
  private qrImage: Phaser.GameObjects.Image | null = null;
  private textureKey: string | null = null;
  private quote: DepositQuote | null = null;
  private pollEvent: Phaser.Time.TimerEvent | null = null;
  private tickEvent: Phaser.Time.TimerEvent | null = null;
  private proceeding = false;

  constructor() {
    super({ key: 'PayScene' });
  }

  create(): void {
    this.proceeding = false;
    this.add
      .text(240, 26, 'PAY 100 SATS TO PLAY', {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);
    this.mintText = this.add
      .text(240, 48, 'connecting to mint...', {
        fontFamily: 'Courier New',
        fontSize: '10px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);
    this.statusText = this.add
      .text(240, 232, 'creating invoice...', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#f7e7cf',
      })
      .setOrigin(0.5);
    this.invoiceText = this.add
      .text(240, 262, '', {
        fontFamily: 'Courier New',
        fontSize: '9px',
        color: '#b0a8bd',
        wordWrap: { width: 420 },
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.add
      .text(240, 302, 'scan with any lightning wallet · C copy · R new invoice', {
        fontFamily: 'Courier New',
        fontSize: '10px',
        color: '#6b6478',
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-C', () => {
        if (this.quote) {
          void navigator.clipboard?.writeText(this.quote.invoice);
          this.flash('COPIED!');
        }
      });
      keyboard.on('keydown-R', () => {
        void this.requestQuote();
      });
    }

    void this.boot();
  }

  private async boot(): Promise<void> {
    try {
      const info: MintInfoResponse = await api.mintInfo();
      this.mintText.setText(
        info.online
          ? `${info.name} · BETA · fee ${info.feePpk} ppk`
          : `mint offline (${info.error ?? 'unknown'}) — R retry`,
      );
    } catch {
      this.mintText.setText('mint status unavailable');
    }
    await this.requestQuote();
  }

  private async requestQuote(): Promise<void> {
    const session = getGameSession();
    if (!session) {
      this.statusText.setText('no session — refresh the page');
      return;
    }
    try {
      this.quote = await api.deposit(session.sessionId);
      this.invoiceText.setText(this.quote.invoice);
      this.statusText.setText('AWAITING PAYMENT — 100 sats');
      await this.showQr(this.quote.invoice);
      this.startTimers();
    } catch (err) {
      this.statusText.setText(`invoice failed (${(err as ApiError).status ?? 'offline'}) — R retry`);
    }
  }

  private startTimers(): void {
    this.pollEvent?.remove();
    this.tickEvent?.remove();
    this.pollEvent = this.time.addEvent({ delay: POLL_MS, loop: true, callback: () => void this.poll() });
    this.tickEvent = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tick() });
    void this.poll();
  }

  private tick(): void {
    if (!this.quote || this.proceeding) {
      return;
    }
    const left = Math.max(0, Math.round((this.quote.expiresAt - Date.now()) / 1000));
    if (left === 0) {
      this.flash('invoice expired — issuing a new one...');
      void this.requestQuote();
      return;
    }
    const label = this.statusText.text.startsWith('CONFIRMING') ? 'CONFIRMING PAYMENT' : 'AWAITING PAYMENT — 100 sats';
    this.statusText.setText(`${label} · ${left}s`);
  }

  private async poll(): Promise<void> {
    const session = getGameSession();
    if (!session || this.proceeding) {
      return;
    }
    try {
      const status = await api.depositStatus(session.sessionId);
      if (status.paid && !status.bundlesReady) {
        this.statusText.setText('CONFIRMING PAYMENT...');
      }
      if (status.bundlesReady) {
        this.proceeding = true;
        this.statusText.setText('PAID — 10 bundles locked. Good luck, XX.');
        this.pollEvent?.remove();
        this.tickEvent?.remove();
        this.time.delayedCall(900, () => {
          this.scene.start('WorldScene', { mapId: 'nussstadt' });
        });
      }
    } catch {
      this.statusText.setText('mint unreachable — retrying...');
    }
  }

  private flash(message: string): void {
    this.statusText.setText(message);
  }

  private async showQr(payload: string): Promise<void> {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, payload, {
      margin: 1,
      width: 180,
      errorCorrectionLevel: 'M',
      color: { dark: '#e8c9a0ff', light: '#120a24ff' },
    });
    if (this.textureKey) {
      this.textures.remove(this.textureKey);
    }
    this.textureKey = `pay-qr-${Date.now()}`;
    this.textures.addCanvas(this.textureKey, canvas);
    this.qrImage?.destroy();
    this.qrImage = this.add.image(240, 140, this.textureKey).setDisplaySize(180, 180);
  }
}
