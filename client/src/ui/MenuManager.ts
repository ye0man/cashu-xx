import * as Phaser from 'phaser';
import { MILESTONE_IDS, MILESTONE_LABELS } from '@cashu-xx/shared';
import { SIGN_TOTAL } from '../data/signs';
import { audio } from '../systems/audio';
import { getJournal, isMilestoneEarned } from '../systems/quests';
import { getGameSession } from '../systems/session';
import { cycleTextSpeed, getSettings, toggleMuted } from '../systems/settings';
import { worldState, writeSave } from '../systems/save';
import type { Direction } from '../systems/movement';

type MenuPage = 'DRAFT' | 'TOKENS' | 'SIGNS' | 'SETTINGS' | 'SAVE';

const PAGES: MenuPage[] = ['DRAFT', 'TOKENS', 'SIGNS', 'SETTINGS', 'SAVE'];

export interface MenuSnapshot {
  mapId: string;
  tileX: number;
  tileY: number;
  facing: Direction;
}

export class MenuManager {
  private readonly container: Phaser.GameObjects.Container;
  private readonly tabsText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly trainerText: Phaser.GameObjects.Text;
  private readonly actionKeys: Phaser.Input.Keyboard.Key[];
  private readonly closeKeys: Phaser.Input.Keyboard.Key[];
  private readonly muteKeys: Phaser.Input.Keyboard.Key[];
  private readonly copyKeys: Phaser.Input.Keyboard.Key[];
  private readonly leftKey: Phaser.Input.Keyboard.Key;
  private readonly rightKey: Phaser.Input.Keyboard.Key;
  private readonly snapshot: () => MenuSnapshot;

  private pageIndex = 0;
  private savedFlash = false;
  private copiedFlash = false;

  constructor(scene: Phaser.Scene, snapshot: () => MenuSnapshot) {
    this.snapshot = snapshot;
    const width = scene.scale.width;
    const height = scene.scale.height;

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(90).setVisible(false);
    const panel = scene.add
      .rectangle(40, 30, width - 80, height - 70, 0x120a24, 0.97)
      .setOrigin(0)
      .setStrokeStyle(2, 0x7b2fbe);
    this.tabsText = scene.add.text(54, 42, '', {
      fontFamily: 'Courier New',
      fontSize: '13px',
      color: '#9d5fe0',
    });
    this.bodyText = scene.add.text(54, 68, '', {
      fontFamily: 'Courier New',
      fontSize: '12px',
      color: '#e8c9a0',
      wordWrap: { width: width - 110 },
    });
    // The Trainer ID is the only way back into this run, so it rides along on
    // every menu page — not just the payment screen where you first saw it.
    this.trainerText = scene.add.text(54, height - 54, '', {
      fontFamily: 'Courier New',
      fontSize: '10px',
      color: '#b0a8bd',
    });
    this.container.add([panel, this.tabsText, this.bodyText, this.trainerText]);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('MenuManager requires keyboard input');
    }
    this.actionKeys = [keyboard.addKey('ENTER'), keyboard.addKey('Z'), keyboard.addKey('SPACE')];
    this.closeKeys = [keyboard.addKey('X'), keyboard.addKey('ESC')];
    this.muteKeys = [keyboard.addKey('M')];
    this.copyKeys = [keyboard.addKey('C')];
    this.leftKey = keyboard.addKey('LEFT');
    this.rightKey = keyboard.addKey('RIGHT');
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(): void {
    this.pageIndex = 0;
    this.savedFlash = false;
    this.copiedFlash = false;
    this.container.setVisible(true);
    audio.playSfx('sfx-menu');
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
    if (this.muteKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      audio.setMuted(toggleMuted());
      this.render();
    }
    if (this.copyKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      const claimCode = getGameSession()?.claimCode;
      if (claimCode) {
        void navigator.clipboard?.writeText(claimCode);
        this.copiedFlash = true;
        this.renderTrainerId();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.pageIndex = (this.pageIndex + PAGES.length - 1) % PAGES.length;
      this.savedFlash = false;
      this.copiedFlash = false;
      audio.playSfx('sfx-menu');
      this.render();
    }
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.pageIndex = (this.pageIndex + 1) % PAGES.length;
      this.savedFlash = false;
      this.copiedFlash = false;
      audio.playSfx('sfx-menu');
      this.render();
    }
    if (this.actionKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      const page = PAGES[this.pageIndex];
      if (page === 'SAVE') {
        writeSave(this.snapshot());
        this.savedFlash = true;
        this.render();
      } else if (page === 'SETTINGS') {
        cycleTextSpeed();
        audio.playSfx('sfx-menu');
        this.render();
      }
    }
  }

  private render(): void {
    const page = PAGES[this.pageIndex];
    this.tabsText.setText(
      PAGES.map((name) => (name === page ? `[${name}]` : ` ${name} `)).join('  '),
    );
    this.bodyText.setText(this.renderBody(page));
    this.renderTrainerId();
  }

  private renderTrainerId(): void {
    const claimCode = getGameSession()?.claimCode;
    if (this.copiedFlash) {
      this.trainerText.setText('TRAINER ID COPIED TO CLIPBOARD — SAVE IT!');
      return;
    }
    this.trainerText.setText(
      claimCode ? `TRAINER ID: ${claimCode}  ·  C copies — save it!` : 'TRAINER ID: —  (recover with your claim code)',
    );
  }

  private renderBody(page: MenuPage): string {
    if (page === 'DRAFT') {
      const journal = getJournal();
      const mark = (done: boolean): string => (done ? '[x]' : '[ ]');
      return [
        'NUT-XX  a spending condition',
        '',
        `${mark(journal.issueOpened)} Issue opened`,
        `${mark(journal.prOpened)} PR opened`,
        `${mark(journal.reviews >= 2)} Reviews                ${journal.reviews}/2`,
        `${mark(journal.awaitingImpl)} Labeled: Awaiting Impl PRs`,
        `${mark(journal.impls >= 2)} Implementation PRs     ${journal.impls}/2`,
        `${mark(journal.merged)} Merged`,
      ].join('\n');
    }
    if (page === 'TOKENS') {
      const rows = MILESTONE_IDS.map((id, index) => {
        const state = isMilestoneEarned(id) ? 'CLAIMED' : 'LOCKED';
        return `${String(index + 1).padStart(2, '0')}  ${MILESTONE_LABELS[id].padEnd(22, '.')} ${state}`;
      });
      return ['10 TOKENS · 10 SATS EACH', '', ...rows].join('\n');
    }
    if (page === 'SIGNS') {
      const read = [...worldState.readSigns];
      return [`READ ${read.length}/${SIGN_TOTAL}`, '', ...(read.length > 0 ? read : ['(none yet)'])].join('\n');
    }
    if (page === 'SETTINGS') {
      const settings = getSettings();
      return [
        `TEXT SPEED   ${settings.textSpeed.toUpperCase().padEnd(10, '.')} Z cycles`,
        `SOUND        ${(settings.muted ? 'OFF' : 'ON').padEnd(10, '.')} M toggles`,
        '',
        'Everything else is keyboard: arrows move,',
        'Z talk/read, X menu, N night.',
      ].join('\n');
    }
    return this.savedFlash ? 'SAVED.' : 'Press Z to save your journey.';
  }
}
