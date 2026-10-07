import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS, type PayoutPreviewResponse } from '@cashu-xx/shared';
import { audio } from '../systems/audio';
import { meltTo, payoutPreview, payoutToken, promptDestination } from '../systems/payout';
import { earnedMilestones } from '../systems/quests';
import { addQrImage } from '../ui/qr';
import { type PixelText, pixelText } from '../ui/text';

const QR_MAX = 196;
const QR_CENTER_Y = 146;

type Outcome = { kind: 'token'; sats: number } | { kind: 'melted'; sats: number } | { kind: 'none' };

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.length > 74 ? `${text.slice(0, 73)}…` : text;
}

/**
 * The end of the run, in two pages: first the payout (every earned token
 * bundled into ONE cashu token, shown as one QR, with Lightning as the
 * fallback), then the credits.
 */
export class EndingScene extends Phaser.Scene {
  private page: 'payout' | 'credits' = 'payout';
  private statusText!: PixelText;
  private detailText!: PixelText;
  private footerText!: PixelText;
  private qrImage: Phaser.GameObjects.Image | null = null;
  private qrTexture: string | null = null;
  private token: string | null = null;
  private earnedSats = 0;
  private busy = false;
  private outcome: Outcome = { kind: 'none' };
  private pageObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'EndingScene' });
  }

  create(): void {
    audio.playTheme('ceremony');
    this.page = 'payout';
    this.token = null;
    this.busy = false;
    this.outcome = { kind: 'none' };
    this.qrImage = null;
    this.qrTexture = null;
    this.pageObjects = [];

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-ENTER', () => this.advance());
      keyboard.on('keydown-C', () => this.copyToken());
      keyboard.on('keydown-L', () => void this.sendToLightning());
    }
    void this.showPayout();
  }

  // ── page 1: payout ─────────────────────────────────────────────────────────

  private async showPayout(): Promise<void> {
    this.track(pixelText(this, 240, 8, 'ONE TOKEN', { scale: 2, color: '#e8c9a0' }).setOrigin(0.5, 0));
    this.statusText = this.track(pixelText(this, 240, 30, 'bundling your tokens…', { color: '#9d5fe0' }).setOrigin(0.5, 0));
    this.detailText = this.track(
      pixelText(this, 240, 256, '', { color: '#f7e7cf', maxWidth: 460, align: 'center' }).setOrigin(0.5, 0),
    );
    this.footerText = this.track(pixelText(this, 240, 296, '', { color: '#6b6478' }).setOrigin(0.5, 0));

    this.busy = true;
    let preview: PayoutPreviewResponse;
    try {
      preview = await payoutPreview();
    } catch (err) {
      this.fail(`could not reach the mint server: ${message(err)}`);
      return;
    }
    this.earnedSats = preview.earnedSats;

    if (preview.state === 'legacy') {
      this.done('This run predates the payout update — ask the operator to sweep it.', 'ENTER credits');
      return;
    }
    if (preview.state === 'melted') {
      this.outcome = { kind: 'melted', sats: preview.paidSats ?? 0 };
      this.done(`${preview.paidSats ?? 0} sats were already sent to your Lightning wallet.`, 'ENTER credits');
      return;
    }
    if (preview.state === 'melt_pending') {
      this.done('Your Lightning payout is still settling — check your wallet.', 'L check again · ENTER credits');
      return;
    }
    if (preview.state === 'token' && preview.token) {
      await this.showToken(preview.token, preview.paidSats ?? preview.earnedSats, preview.earnedCount);
      return;
    }
    if (preview.earnedCount === 0) {
      this.done('No tokens found this run — nothing to bundle. The sats stay with the mint.', 'ENTER credits');
      return;
    }

    try {
      const issued = await payoutToken();
      await this.showToken(issued.token, issued.amountSats, issued.milestoneCount);
    } catch (err) {
      this.fail(`bundling failed: ${message(err)}`);
    }
  }

  private async showToken(token: string, sats: number, count: number): Promise<void> {
    this.token = token;
    this.outcome = { kind: 'token', sats };
    this.statusText.setText(`${count} find${count === 1 ? '' : 's'} · ${sats} sats in one token · scan with any cashu wallet`);
    try {
      const qr = await addQrImage(this, 240, QR_CENTER_Y, token, {
        maxSize: QR_MAX,
        errorCorrectionLevel: 'L',
      });
      this.qrImage = qr.image;
      this.qrTexture = qr.textureKey;
      this.track(qr.image);
      this.detailText.setText('Redeem it before you close this page — or press C to copy it.');
    } catch {
      this.detailText.setText('This token is too long for a QR code — press C to copy it into your wallet.');
    }
    this.footerText.setText('C copy token · L send to Lightning instead · ENTER credits');
    this.busy = false;
  }

  private copyToken(): void {
    if (this.page !== 'payout' || !this.token) {
      return;
    }
    void navigator.clipboard?.writeText(this.token);
    this.detailText.setText('TOKEN COPIED — paste it into any cashu wallet to redeem.');
  }

  private async sendToLightning(): Promise<void> {
    if (this.page !== 'payout' || this.busy || this.earnedSats <= 0 || this.outcome.kind === 'melted') {
      return;
    }
    const destination = promptDestination(this.outcome.kind === 'token' ? this.outcome.sats : this.earnedSats);
    if (!destination) {
      this.detailText.setText('No Lightning address or invoice given — your token is still here.');
      return;
    }
    this.busy = true;
    this.detailText.setText('melting your sats to Lightning…');
    try {
      const result = await meltTo(destination);
      this.clearQr();
      this.token = null;
      if (result.state === 'melted') {
        this.outcome = { kind: 'melted', sats: result.amountSats };
        this.statusText.setText('PAID TO LIGHTNING');
        this.done(
          `${result.amountSats} sats sent to ${destination.kind === 'address' ? destination.value : 'your invoice'}${result.feeSats > 0 ? ` (${result.feeSats} sat fee reserve)` : ''}.`,
          'ENTER credits',
        );
      } else {
        this.statusText.setText('PAYMENT SETTLING');
        this.done('The Lightning payment is in flight and will land shortly.', 'L check again · ENTER credits');
      }
    } catch (err) {
      this.busy = false;
      this.detailText.setText(`melt failed: ${message(err)}`);
    }
  }

  private done(detail: string, footer: string): void {
    if (this.statusText.text === 'bundling your tokens…') {
      this.statusText.setText(this.outcome.kind === 'melted' ? 'PAID TO LIGHTNING' : '');
    }
    this.detailText.setY(this.qrImage ? 256 : 140).setText(detail);
    this.footerText.setText(footer);
    this.busy = false;
  }

  private fail(detail: string): void {
    this.statusText.setText('SOMETHING WENT WRONG');
    this.done(`${detail}\nYour tokens are safe on the server — talk to Prof. Hickory to retry.`, 'ENTER credits');
  }

  private clearQr(): void {
    this.qrImage?.destroy();
    this.qrImage = null;
    if (this.qrTexture) {
      this.textures.remove(this.qrTexture);
      this.qrTexture = null;
    }
  }

  private advance(): void {
    if (this.page === 'credits') {
      this.scene.start('TitleScene');
      return;
    }
    if (this.busy) {
      return;
    }
    this.clearQr();
    for (const object of this.pageObjects) {
      object.destroy();
    }
    this.pageObjects = [];
    this.page = 'credits';
    this.showCredits();
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.pageObjects.push(object);
    return object;
  }

  // ── page 2: credits ────────────────────────────────────────────────────────

  private showCredits(): void {
    const earned = earnedMilestones();
    const center = (y: number, text: string, color: string, scale = 1): void => {
      pixelText(this, 240, y, text, { color, scale }).setOrigin(0.5, 0);
    };
    const outcome =
      this.outcome.kind === 'token'
        ? `${earned.length}/10 TOKENS — ${this.outcome.sats} sats bundled into one token.`
        : this.outcome.kind === 'melted'
          ? `${earned.length}/10 TOKENS — ${this.outcome.sats} sats melted home over Lightning.`
          : `${earned.length}/10 TOKENS FOUND.`;

    center(8, 'NUT-31', '#e8c9a0', 3);
    center(42, 'you entered as a placeholder. you leave as NUT-31.', '#b0a8bd');
    center(56, outcome, '#b0a8bd');

    const body = { color: '#b0a8bd', lineSpacing: 2 };
    // Two half-width columns keep every credit on screen at once — no scroll.
    pixelText(this, 20, 76, '— CAST —', body);
    pixelText(this, 250, 76, '— THE REAL PROCESS —', body);
    pixelText(
      this,
      20,
      92,
      [
        'XX the placeholder nut',
        'PROF. HICKORY the maintainer',
        'RUSTY of cdk',
        'COCO of cashu-ts + coco',
        'PIP of nutshell',
        'DJ MAC the macadamia',
        'KIMI of the red team',
        'the RECEPTIONIST of Minibits HQ',
        'and 32 very opinionated signs',
      ].join('\n'),
      body,
    );
    pixelText(
      this,
      250,
      92,
      [
        'open an issue. use NUT-XX.',
        'get two reviews. MUST/SHOULD/MAY.',
        'land two implementation PRs.',
        'spec merges first.',
        'go build one:',
        'github.com/cashubtc/nuts',
        '',
        'built on cashu. mint is best-effort.',
      ].join('\n'),
      body,
    );

    const tally = MILESTONE_IDS.map((id, index) => {
      const done = earned.includes(id);
      return `${done ? '[x]' : '[ ]'} ${String(index + 1).padStart(2, ' ')}. ${MILESTONE_LABELS[id]}`;
    });
    const ledger = { color: '#8a8298', lineSpacing: 2 };
    pixelText(this, 20, 206, `— TOKEN LEDGER (${earned.length}/10) —`, body);
    pixelText(this, 20, 222, tally.slice(0, 5).join('\n'), ledger);
    pixelText(this, 250, 222, tally.slice(5).join('\n'), ledger);

    center(286, 'THE END', '#e8c9a0', 2);
    center(306, 'PRESS ENTER TO RETURN TO THE TITLE', '#6b6478');
  }
}
