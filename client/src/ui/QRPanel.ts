import * as Phaser from 'phaser';
import QRCode from 'qrcode';

const QR_SIZE = 200;

export class QRPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly footerText: Phaser.GameObjects.Text;
  private readonly qrHolder: Phaser.GameObjects.Rectangle;
  private readonly actionKeys: Phaser.Input.Keyboard.Key[];
  private readonly copyKeys: Phaser.Input.Keyboard.Key[];
  private qrImage: Phaser.GameObjects.Image | null = null;
  private textureKey: string | null = null;
  private payload = '';
  private openPromise: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(150).setVisible(false);
    const panel = scene.add
      .rectangle(width / 2, height / 2, width - 48, height - 40, 0x120a24, 0.98)
      .setStrokeStyle(2, 0xe8c9a0);
    this.titleText = scene.add
      .text(width / 2, height / 2 - 128, '', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);
    this.qrHolder = scene.add
      .rectangle(width / 2, height / 2 - 18, QR_SIZE + 12, QR_SIZE + 12, 0x1e1036)
      .setStrokeStyle(2, 0x7b2fbe);
    this.bodyText = scene.add
      .text(width / 2, height / 2 + 100, '', {
        fontFamily: 'Courier New',
        fontSize: '9px',
        color: '#b0a8bd',
        wordWrap: { width: width - 80 },
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.footerText = scene.add
      .text(width / 2, height / 2 + 138, '', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);
    this.container.add([panel, this.titleText, this.qrHolder, this.bodyText, this.footerText]);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('QRPanel requires keyboard input');
    }
    this.actionKeys = [keyboard.addKey('Z'), keyboard.addKey('ENTER'), keyboard.addKey('SPACE')];
    this.copyKeys = [keyboard.addKey('C')];
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  async open(title: string, payload: string, footer: string): Promise<void> {
    this.payload = payload;
    this.titleText.setText(title);
    this.bodyText.setText(payload);
    this.footerText.setText(footer);
    this.container.setVisible(true);
    await this.renderQr(payload);
    return new Promise((resolve) => {
      this.openPromise = () => resolve();
    });
  }

  update(): void {
    if (!this.isOpen) {
      return;
    }
    if (this.copyKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      void navigator.clipboard?.writeText(this.payload);
      this.footerText.setText('COPIED! · Z close (save for later)');
    }
    if (this.actionKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.close();
    }
  }

  close(): void {
    this.container.setVisible(false);
    const resolve = this.openPromise;
    this.openPromise = null;
    resolve?.();
  }

  private async renderQr(payload: string): Promise<void> {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, payload, {
      margin: 1,
      width: QR_SIZE,
      errorCorrectionLevel: 'M',
      color: { dark: '#e8c9a0ff', light: '#120a24ff' },
    });
    if (this.textureKey) {
      this.scene.textures.remove(this.textureKey);
    }
    this.textureKey = `qr-${Date.now()}`;
    this.scene.textures.addCanvas(this.textureKey, canvas);
    this.qrImage?.destroy();
    this.qrImage = this.scene.add
      .image(this.scene.scale.width / 2, this.scene.scale.height / 2 - 18, this.textureKey)
      .setDisplaySize(QR_SIZE, QR_SIZE);
    this.container.add(this.qrImage);
  }
}
