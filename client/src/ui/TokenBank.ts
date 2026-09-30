import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS, type MilestoneId } from '@cashu-xx/shared';
import { isMilestoneEarned } from '../systems/quests';

export class TokenBank {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly actionKeys: Phaser.Input.Keyboard.Key[];
  private readonly closeKeys: Phaser.Input.Keyboard.Key[];
  private readonly upKey: Phaser.Input.Keyboard.Key;
  private readonly downKey: Phaser.Input.Keyboard.Key;
  private readonly onPick: (milestoneId: MilestoneId) => void;
  private cursor = 0;

  constructor(scene: Phaser.Scene, onPick: (milestoneId: MilestoneId) => void) {
    this.onPick = onPick;
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
    this.actionKeys = [keyboard.addKey('Z'), keyboard.addKey('ENTER'), keyboard.addKey('SPACE')];
    this.closeKeys = [keyboard.addKey('X'), keyboard.addKey('ESC')];
    this.upKey = keyboard.addKey('UP');
    this.downKey = keyboard.addKey('DOWN');
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(): void {
    this.cursor = 0;
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
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.cursor = (this.cursor + MILESTONE_IDS.length - 1) % MILESTONE_IDS.length;
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.cursor = (this.cursor + 1) % MILESTONE_IDS.length;
      this.render();
    }
    if (this.actionKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      const milestoneId = MILESTONE_IDS[this.cursor];
      if (isMilestoneEarned(milestoneId)) {
        this.close();
        this.onPick(milestoneId);
      }
    }
  }

  private render(): void {
    const header = 'MINIBITS HQ · TOKEN BANK        Z claim · X close';
    const rows = MILESTONE_IDS.map((id, index) => {
      const marker = index === this.cursor ? '>' : ' ';
      const state = isMilestoneEarned(id) ? 'CLAIM' : '----';
      return `${marker} ${MILESTONE_LABELS[id].padEnd(22, '.')} ${state}`;
    });
    this.bodyText.setText([header, '', ...rows].join('\n'));
  }
}
