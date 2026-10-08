import * as Phaser from 'phaser';
import type { DepositQuote, MintInfoResponse } from '@cashu-xx/shared';
import { api, type ApiError } from '../systems/api';
import { getGameSession } from '../systems/session';
import { addQrImage, invoiceQrPayload } from '../ui/qr';
import { type PixelText, pixelText } from '../ui/text';

/** The server reads local wallet state (the mint's websocket updates it), so polling is cheap. */
const POLL_MS = 1500;
const QR_MAX = 156;
const QR_CENTER_Y = 124;

function shorten(message: string, max = 70): string {
  return message.length > max ? `${message.slice(0, max - 1)}…` : message;
}

/** The invoice only needs to be eye-checkable on screen; C copies the full text. */
function displayInvoice(invoice: string): string {
  return invoice.length > 140 ? `${invoice.slice(0, 120)}…${invoice.slice(-16)}` : invoice;
}

export class PayScene extends Phaser.Scene {
  private statusText!: PixelText;
  private invoiceText!: PixelText;
  private mintText!: PixelText;
  private qrImage: Phaser.GameObjects.Image | null = null;
  private textureKey: string | null = null;
  private quote: DepositQuote | null = null;
  private pollEvent: Phaser.Time.TimerEvent | null = null;
  private tickEvent: Phaser.Time.TimerEvent | null = null;
  private proceeding = false;
  private polling = false;
  private pollError: string | null = null;
  private statusLabel = 'creating invoice...';

  constructor() {
    super({ key: 'PayScene' });
  }

  create(): void {
    this.proceeding = false;
    this.polling = false;
    this.pollError = null;
    this.quote = null;
    this.qrImage = null;
    this.textureKey = null;

    pixelText(this, 240, 10, 'PAY 100 SATS TO PLAY', { scale: 2, color: '#e8c9a0' }).setOrigin(0.5, 0);
    this.mintText = pixelText(this, 240, 32, 'connecting to mint...', { color: '#9d5fe0' }).setOrigin(0.5, 0);
    this.statusText = pixelText(this, 240, 208, this.statusLabel, { color: '#f7e7cf' }).setOrigin(0.5, 0);
    this.invoiceText = pixelText(this, 240, 222, '', {
      color: '#8a8298',
      maxWidth: 456,
      align: 'center',
    }).setOrigin(0.5, 0);

    const session = getGameSession();
    pixelText(this, 240, 270, `TRAINER ID: ${session?.claimCode ?? '—'}  (T copies — save it!)`, {
      color: '#9d5fe0',
    }).setOrigin(0.5, 0);
    pixelText(this, 240, 290, 'scan with any lightning wallet · C copy · R new invoice', {
      color: '#6b6478',
    }).setOrigin(0.5, 0);

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

    // The invoice doesn't depend on the mint-info banner; fetch both at once so
    // the QR is never gated on the mint check.
    void Promise.all([this.checkMint(), this.requestQuote()]);
  }

  private async checkMint(): Promise<void> {
    this.mintText.setText('connecting to mint...');
    try {
      const info: MintInfoResponse = await api.mintInfo(getGameSession()?.mintUrl);
      this.mintText.setText(
        info.online ? `${info.name} · fee ${info.feePpk} ppk` : `mint offline (${info.error ?? 'unknown'}) — R retry`,
      );
    } catch (err) {
      this.mintText.setText(shorten((err as Error).message));
    }
  }

  private async requestQuote(): Promise<void> {
    const session = getGameSession();
    if (!session) {
      this.setStatus('no session — refresh the page');
      return;
    }
    this.setStatus('creating invoice...');
    const startedAt = performance.now();
    try {
      this.quote = await api.deposit(session.sessionId);
      console.info(`[cashu-xx] invoice ready in ${Math.round(performance.now() - startedAt)}ms`);
      this.invoiceText.setText(displayInvoice(this.quote.invoice));
      this.setStatus('AWAITING PAYMENT — 100 sats');
      await this.showQr(this.quote.invoice);
      this.startTimers();
    } catch (err) {
      this.setStatus(`invoice failed: ${shorten((err as ApiError).message, 50)} — R retry`);
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
    this.statusText.setText(
      this.pollError ? `${this.pollError} — retrying · ${left}s` : `AWAITING PAYMENT — 100 sats · ${left}s`,
    );
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
        this.setStatus('CONFIRMING PAYMENT...');
      }
      if (status.bundlesReady) {
        this.proceeding = true;
        this.setStatus('PAID — 10 tokens to find. Good luck, XX.');
        this.pollEvent?.remove();
        this.tickEvent?.remove();
        this.time.delayedCall(900, () => {
          this.scene.start('WorldScene', { mapId: 'nutsterdam' });
        });
      }
    } catch (err) {
      this.pollError = shorten((err as Error).message, 52);
      this.setStatus(`${this.pollError} — retrying...`);
    } finally {
      this.polling = false;
    }
  }

  private setStatus(message: string): void {
    this.statusLabel = message;
    this.statusText.setText(message);
  }

  private flash(message: string): void {
    this.statusText.setText(message);
  }

  private async showQr(invoice: string): Promise<void> {
    const qr = await addQrImage(this, 240, QR_CENTER_Y, invoiceQrPayload(invoice), {
      maxSize: QR_MAX,
      errorCorrectionLevel: 'M',
    });
    this.qrImage?.destroy();
    if (this.textureKey) {
      this.textures.remove(this.textureKey);
    }
    this.qrImage = qr.image;
    this.textureKey = qr.textureKey;
  }
}
