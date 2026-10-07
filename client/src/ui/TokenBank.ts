import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS } from '@cashu-xx/shared';
import { isMilestoneEarned } from '../systems/quests';
import { type PixelText, pixelText } from './text';

/**
 * Read-only status board at Minibits HQ: which tokens have been found. The
 * sats are paid out once, at the end, as a single combined token.
 */
export class TokenBank {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bodyText: PixelText;
  private readonly closeKeys: Phaser.Input.Keyboard.Key[];

  constructor(scene: Phaser.Scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(140).setVisible(false);
    const panel = scene.add
      .rectangle(width / 2, height / 2, width - 60, height - 50, 0x120a24, 0.98)
      .setStrokeStyle(2, 0x7b2fbe);
    this.bodyText = pixelText(scene, 50, 44, '', { color: '#e8c9a0', lineSpacing: 3 });
    this.container.add([panel, this.bodyText]);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('TokenBank requires keyboard input');
    }
    this.closeKeys = [keyboard.addKey('X'), keyboard.addKey('ESC'), keyboard.addKey('Z'), keyboard.addKey('ENTER')];
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(): void {
    this.container.setVisible(true);
    this.render();
  }

  close(): void {
    this.container.setVisible(false);
  }

  update(): void {
    if (!this.isOpen) {
      return;
    }
    if (this.closeKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.close();
    }
  }

  private render(): void {
    const earned = MILESTONE_IDS.filter((id) => isMilestoneEarned(id)).length;
    const header = `MINIBITS HQ · TOKEN BANK        X close`;
    const rows = MILESTONE_IDS.map((id) => {
      const state = isMilestoneEarned(id) ? 'FOUND' : '-----';
      return `  ${MILESTONE_LABELS[id].padEnd(22, '.')} ${state}`;
    });
    const footer = [
      '',
      `Tokens found: ${earned}/10 (${earned * 10} sats).`,
      'Prof. Hickory bundles them into ONE cashu token at the end —',
      'one QR to scan, or melt it straight to Lightning.',
    ];
    this.bodyText.setText([header, '', ...rows, ...footer].join('\n'));
  }
}
