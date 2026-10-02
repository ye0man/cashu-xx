import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS } from '@cashu-xx/shared';
import { audio } from '../systems/audio';
import { earnedMilestones } from '../systems/quests';

const BODY_STYLE = {
  fontFamily: 'Courier New',
  fontSize: '9px',
  color: '#b0a8bd',
  lineSpacing: 2,
} as const;

const LEDGER_STYLE = {
  fontFamily: 'Courier New',
  fontSize: '9px',
  color: '#6b6478',
  lineSpacing: 2,
} as const;

export class EndingScene extends Phaser.Scene {
  constructor() {
    super({ key: 'EndingScene' });
  }

  create(data: { receivedSats?: number } = {}): void {
    audio.playTheme('ceremony');
    const earned = earnedMilestones();
    const width = this.scale.width;
    const center = (y: number, text: string, size: string, color: string): void => {
      this.add
        .text(width / 2, y, text, { fontFamily: 'Courier New', fontSize: size, color })
        .setOrigin(0.5);
    };

    center(18, 'NUT-31', '24px', '#e8c9a0');
    center(42, 'you entered as a placeholder. you leave as NUT-31.', '10px', '#b0a8bd');
    center(
      56,
      data.receivedSats !== undefined
        ? `${earned.length}/10 TOKENS — ${data.receivedSats} sats melted home to your Lightning wallet.`
        : `${earned.length}/10 TOKENS SECURED — cash out with Prof. Hickory.`,
      '10px',
      '#b0a8bd',
    );

    // Two half-width columns keep every credit on screen at once — no scroll.
    this.add.text(20, 74, '— CAST —', BODY_STYLE);
    this.add.text(250, 74, '— THE REAL PROCESS —', BODY_STYLE);
    this.add.text(
      20,
      88,
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
      BODY_STYLE,
    );
    this.add.text(
      250,
      88,
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
      BODY_STYLE,
    );

    const tally = MILESTONE_IDS.map((id, index) => {
      const done = earned.includes(id);
      return `${done ? '[x]' : '[ ]'} ${index + 1}. ${MILESTONE_LABELS[id]}`;
    });
    this.add.text(20, 196, `— TOKEN LEDGER (${earned.length}/10) —`, BODY_STYLE);
    this.add.text(20, 210, tally.slice(0, 5).join('\n'), LEDGER_STYLE);
    this.add.text(250, 210, tally.slice(5).join('\n'), LEDGER_STYLE);

    center(276, 'THE END', '12px', '#e8c9a0');
    center(296, 'PRESS ENTER TO RETURN TO THE TITLE', '9px', '#6b6478');

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.once('keydown-ENTER', () => {
        this.scene.start('TitleScene');
      });
    }
  }
}
