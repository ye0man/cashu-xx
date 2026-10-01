import * as Phaser from 'phaser';
import QRCode from 'qrcode';
import type { DepositQuote, MintInfoResponse } from '@cashu-xx/shared';
import { api, type ApiError } from '../systems/api';
import { getGameSession } from '../systems/session';

const POLL_MS = 2000;
const QR_SIZE = 160;
const QR_Y = 142;

function shorten(message: string, max = 64): string {
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}

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
  private polling = false;
  private pollError: string | null = null;

  constructor() {
    super({ key: 'PayScene' });
  }

  create(): void {
    this.proceeding = false;
    this.polling = false;
    this.pollError = null;
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
      .text(240, 234, 'creating invoice...', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#f7e7cf',
        wordWrap: { width: 440 },
        align: 'center',
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

    const session = getGameSession();
    this.add
      .text(240, 288, `TRAINER ID: ${session?.claimCode ?? '—'}  (T copies — save it!)`, {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-C', () => {
        if (this.quote) {
          void navigator.clipboard?.writeText(this.quote.invoice);
          this.flash('INVOICE COPIED!');
        }
      });
      keyboard.on('keydown-T', () => {
        const claim = getGameSession()?.claimCode;
        if (claim) {
          void navigator.clipboard?.writeText(claim);
          this.flash('TRAINER ID COPIED!');
        }
      });
      keyboard.on('keydown-R', () => {
        void this.checkMint();
        void this.requestQuote();
      });
    }

    void this.boot();
  }

  private async boot(): Promise<void> {
    // The invoice doesn't depend on the mint-info banner; fetch both at once so
    // the QR is never gated on the mint check.
    await Promise.all([this.checkMint(), this.requestQuote()]);
  }

  private async checkMint(): Promise<void> {
    this.mintText.setText('connecting to mint...');
    try {
      const info: MintInfoResponse = await api.mintInfo();
      this.mintText.setText(
        info.online
          ? `${info.name} · BETA · fee ${info.feePpk} ppk`
          : `mint offline (${info.error ?? 'unknown'}) — R retry`,
      );
    } catch (err) {
      this.mintText.setText(shorten((err as Error).message));
    }
  }

  private async requestQuote(): Promise<void> {
    const session = getGameSession();
    if (!session) {
      this.statusText.setText('no session — refresh the page');
      return;
    }
    this.statusText.setText('creating invoice...');
    try {
      this.quote = await api.deposit(session.sessionId);
      this.invoiceText.setText(this.quote.invoice);
      this.statusText.setText('AWAITING PAYMENT — 100 sats');
      await this.showQr(this.quote.invoice);
      this.startTimers();
    } catch (err) {
      this.statusText.setText(`invoice failed: ${shorten((err as ApiError).message)} — R retry`);
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
    this.statusText.setText(this.pollError ? `${this.pollError} — retrying · ${left}s` : `${label} · ${left}s`);
  }

  private async poll(): Promise<void> {
    const session = getGameSession();
    if (!session || this.proceeding || this.polling) {
      return;
    }
    this.polling = true;
    try {
      const status = await api.depositStatus(session.sessionId);
      this.pollError = null;
      if (status.paid && !status.bundlesReady) {
        this.statusText.setText('CONFIRMING PAYMENT...');
      }
      if (status.bundlesReady) {
        this.proceeding = true;
        this.statusText.setText('PAID — 10 tokens reserved. Good luck, XX.');
        this.pollEvent?.remove();
        this.tickEvent?.remove();
        this.time.delayedCall(900, () => {
          this.scene.start('WorldScene', { mapId: 'nussstadt' });
        });
      }
    } catch (err) {
      this.pollError = shorten((err as Error).message, 52);
      this.statusText.setText(`${this.pollError} — retrying...`);
    } finally {
      this.polling = false;
    }
  }

  private flash(message: string): void {
    this.statusText.setText(message);
  }

  private async showQr(payload: string): Promise<void> {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, payload, {
      margin: 2,
      width: QR_SIZE,
      errorCorrectionLevel: 'M',
      color: { dark: '#120a24ff', light: '#e8c9a0ff' },
    });
    if (this.textureKey) {
      this.textures.remove(this.textureKey);
    }
    this.textureKey = `pay-qr-${Date.now()}`;
    this.textures.addCanvas(this.textureKey, canvas);
    this.qrImage?.destroy();
    this.qrImage = this.add.image(240, QR_Y, this.textureKey).setDisplaySize(QR_SIZE, QR_SIZE);
  }
}
