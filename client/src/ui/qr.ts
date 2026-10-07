import type * as Phaser from 'phaser';
import QRCode from 'qrcode';

export interface QrImage {
  image: Phaser.GameObjects.Image;
  textureKey: string;
  /** Rendered edge length in game pixels (a whole multiple of the module count). */
  size: number;
}

export interface QrOptions {
  /** Largest edge the code may occupy, in game pixels. */
  maxSize: number;
  /** Quiet-zone width in modules. */
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  dark?: string;
  light?: string;
}

/**
 * Draws a QR code with every module exactly N whole game pixels wide. Fitting
 * a code into an arbitrary width gives fractional modules (e.g. 140 px / 81
 * modules = 1.73 px), which nearest-neighbour scaling renders as uneven bars
 * that phone cameras struggle with.
 */
export async function addQrImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  payload: string,
  options: QrOptions,
): Promise<QrImage> {
  const margin = options.margin ?? 2;
  const errorCorrectionLevel = options.errorCorrectionLevel ?? 'M';
  const modules = QRCode.create(payload, { errorCorrectionLevel }).modules.size + margin * 2;
  const scale = Math.max(1, Math.floor(options.maxSize / modules));
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, payload, {
    margin,
    scale,
    errorCorrectionLevel,
    color: { dark: options.dark ?? '#120a24ff', light: options.light ?? '#e8c9a0ff' },
  });
  const textureKey = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  scene.textures.addCanvas(textureKey, canvas);
  const size = modules * scale;
  // Place by the top-left corner on whole pixels: centering an odd-sized
  // image would put every module on a half pixel.
  const image = scene.add.image(Math.round(x - size / 2), Math.round(y - size / 2), textureKey).setOrigin(0);
  return { image, textureKey, size };
}

/**
 * bolt11 invoices are case-insensitive; upper-casing lets the QR use the
 * denser alphanumeric mode, so the code has fewer, larger modules.
 */
export function invoiceQrPayload(invoice: string): string {
  return /^ln[a-z0-9]+$/i.test(invoice) ? invoice.toUpperCase() : invoice;
}
