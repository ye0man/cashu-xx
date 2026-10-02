import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS } from '@cashu-xx/shared';
import { isMilestoneEarned } from '../systems/quests';

/**
 * Read-only status board at Minibits HQ: which tokens have been secured. There
 * is no per-token claim here any more — sats are cashed out by melting with
 * Prof. Hickory.
 */
export class TokenBank {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly closeKeys: Phaser.Input.Keyboard.Key[];

  constructor(scene: Phaser.Scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(140).setVisible(false);
    const panel = scene.add
      .rectangle(width / 2, height / 2, width - 60, height - 50, 0x120a24, 0.98)
      .setStrokeStyle(2, 0x7b2fbe);
    this.bodyText = scene.add
      .text(width / 2 - (width - 100) / 2, 48, '', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#e8c9a0',
      })
      .setOrigin(0, 0);
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
      const state = isMilestoneEarned(id) ? 'SECURED' : '-------';
      return `  ${MILESTONE_LABELS[id].padEnd(22, '.')} ${state}`;
    });
    const footer = [
      '',
      `Tokens secured: ${earned}/10.`,
      'Take your sats to Prof. Hickory — he melts them to your Lightning wallet.',
    ];
    this.bodyText.setText([header, '', ...rows, ...footer].join('\n'));
  }
}
