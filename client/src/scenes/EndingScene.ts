import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS } from '@cashu-xx/shared';
import { audio } from '../systems/audio';
import { earnedMilestones } from '../systems/quests';

export class EndingScene extends Phaser.Scene {
  private readonly credits: string[] = [
    'CASHU-XX',
    '',
    'you entered as a placeholder.',
    'you leave as NUT-31.',
    '',
    '10 / 10 TOKENS CLAIMED',
    'the full 100 sats came home.',
    '',
    '— CAST —',
    'XX the placeholder nut',
    'PROF. HICKORY the maintainer',
    'RUSTY of cdk',
    'COCO of cashu-ts + coco',
    'PIP of nutshell',
    'DJ MAC the macadamia',
    'KIMI of the red team',
    'the RECEPTIONIST of Minibits HQ',
    'and 32 very opinionated signs',
    '',
    '— THE REAL PROCESS —',
    'open an issue. use NUT-XX.',
    'get two reviews. write MUST/SHOULD/MAY.',
    'land two implementation PRs.',
    'spec merges first.',
    'go build one: github.com/cashubtc/nuts',
    '',
    'built on cashu. mint is best-effort.',
    '',
    'THE END',
    '',
    'PRESS ENTER TO RETURN TO THE TITLE',
  ];

  constructor() {
    super({ key: 'EndingScene' });
  }

  create(): void {
    audio.playTheme('ceremony');
    const earned = earnedMilestones();
    const width = this.scale.width;

    this.add
      .text(width / 2, 40, 'NUT-31', {
        fontFamily: 'Courier New',
        fontSize: '36px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);

    const body = this.add.text(width / 2, 90, this.credits.join('\n'), {
      fontFamily: 'Courier New',
      fontSize: '11px',
      color: '#b0a8bd',
      align: 'center',
      lineSpacing: 4,
    });
    body.setOrigin(0.5, 0);

    const tally = MILESTONE_IDS.map((id, index) => {
      const done = earned.includes(id);
      return `${done ? '[x]' : '[ ]'} ${index + 1}. ${MILESTONE_LABELS[id]}`;
    }).join('\n');
    this.add
      .text(24, this.scale.height - 74, `TOKEN LEDGER (${earned.length}/10)\n${tally}`, {
        fontFamily: 'Courier New',
        fontSize: '8px',
        color: '#6b6478',
      })
      .setOrigin(0, 1);

    this.tweens.add({ targets: body, y: body.y - 20, duration: 4000, yoyo: true, repeat: -1 });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', () => {
        this.scene.start('TitleScene');
      });
    }
  }
}
