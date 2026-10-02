import * as Phaser from 'phaser';
import { audio } from '../systems/audio';
import type { DialogueScript } from '../systems/dialogue';
import { TEXT_SPEED_MS, getSettings } from '../systems/settings';

export class DialogManager {
  private readonly container: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly speakerText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  private readonly actionKeys: Phaser.Input.Keyboard.Key[];
  private readonly upKey: Phaser.Input.Keyboard.Key;
  private readonly downKey: Phaser.Input.Keyboard.Key;

  private script: DialogueScript | null = null;
  private lineIndex = 0;
  private revealed = 0;
  private typing = true;
  private choiceIndex = 0;
  private choosing = false;
  private onDone: ((choiceId: string | null) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    const width = scene.scale.width;
    const height = scene.scale.height;
    this.viewWidth = width;
    this.viewHeight = height;

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.panel = scene.add
      .rectangle(8, height - 92, width - 16, 84, 0x1e1036, 0.96)
      .setOrigin(0)
      .setStrokeStyle(2, 0xe8c9a0);
    this.speakerText = scene.add.text(18, height - 86, '', {
      fontFamily: 'Courier New',
      fontSize: '12px',
      color: '#9d5fe0',
    });
    this.bodyText = scene.add.text(18, height - 66, '', {
      fontFamily: 'Courier New',
      fontSize: '13px',
      color: '#f7e7cf',
      wordWrap: { width: width - 44 },
    });
    this.container.add([this.panel, this.speakerText, this.bodyText]);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('DialogManager requires keyboard input');
    }
    this.actionKeys = [keyboard.addKey('ENTER'), keyboard.addKey('Z'), keyboard.addKey('SPACE')];
    this.upKey = keyboard.addKey('UP');
    this.downKey = keyboard.addKey('DOWN');
  }

  get isOpen(): boolean {
    return this.script !== null;
  }

  openAsync(script: DialogueScript): Promise<string | null> {
    return new Promise((resolve) => {
      this.open(script, resolve);
    });
  }

  open(script: DialogueScript, onDone?: (choiceId: string | null) => void): void {
    this.script = script;
    this.lineIndex = 0;
    this.revealed = 0;
    this.typing = true;
    this.choiceIndex = 0;
    this.choosing = false;
    this.onDone = onDone ?? null;
    this.speakerText.setText(script.speaker ?? '');
    this.layoutPanel(script);
    this.container.setVisible(true);
    audio.playSfx('sfx-text');
    this.renderLine();
  }

  /**
   * Choice rows and wrapped lines both need body room. The default 84px panel
   * stays for ordinary two-line chatter; taller scripts grow the box upward so
   * nothing spills past the screen edge.
   */
  private layoutPanel(script: DialogueScript): void {
    const wrapWidth = this.viewWidth - 44;
    // Courier New at 13px advances ~7.8px per character.
    const rowsFor = (line: string): number => Math.max(1, Math.ceil((line.length * 7.8) / wrapWidth));
    const lastLine = script.lines[script.lines.length - 1] ?? '';
    const rows = script.choices?.length
      ? rowsFor(lastLine) + script.choices.length
      : Math.max(1, ...script.lines.map(rowsFor));
    const panelHeight = Math.min(this.viewHeight - 16, Math.max(84, 30 + rows * 16));
    const top = this.viewHeight - 8 - panelHeight;
    this.panel.setSize(this.viewWidth - 16, panelHeight);
    this.panel.setPosition(8, top);
    this.speakerText.setPosition(18, top + 6);
    this.bodyText.setPosition(18, top + 26);
  }

  update(delta: number): void {
    const script = this.script;
    if (!script) {
      return;
    }

    const full = this.currentLine();
    if (this.typing) {
      const perChar = TEXT_SPEED_MS[getSettings().textSpeed];
      if (perChar === 0) {
        this.revealed = full.length;
      } else {
        this.revealed += delta / perChar;
      }
      const shown = Math.min(full.length, Math.floor(this.revealed));
      this.bodyText.setText(full.slice(0, shown));
      if (shown >= full.length) {
        this.typing = false;
        this.afterLineComplete(script);
      }
    }

    if (this.choosing && script.choices) {
      if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
        this.choiceIndex = (this.choiceIndex + script.choices.length - 1) % script.choices.length;
        this.renderChoices();
      }
      if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
        this.choiceIndex = (this.choiceIndex + 1) % script.choices.length;
        this.renderChoices();
      }
    }

    if (this.actionPressed()) {
      if (this.typing) {
        this.revealed = full.length;
        this.bodyText.setText(full);
        this.typing = false;
        this.afterLineComplete(script);
      } else if (this.choosing && script.choices) {
        this.finish(script.choices[this.choiceIndex].id);
      } else if (this.lineIndex < script.lines.length - 1) {
        this.lineIndex += 1;
        this.revealed = 0;
        this.typing = true;
        audio.playSfx('sfx-text');
        this.renderLine();
      } else {
        this.finish(null);
      }
    }
  }

  private finish(choiceId: string | null): void {
    const callback = this.onDone;
    this.script = null;
    this.onDone = null;
    this.container.setVisible(false);
    callback?.(choiceId);
  }

  private afterLineComplete(script: DialogueScript): void {
    if (this.lineIndex === script.lines.length - 1 && script.choices && script.choices.length > 0) {
      this.choosing = true;
      this.renderChoices();
    }
  }

  private currentLine(): string {
    return this.script?.lines[this.lineIndex] ?? '';
  }

  private renderLine(): void {
    this.bodyText.setText(this.script?.lines[this.lineIndex] ?? '');
  }

  private renderChoices(): void {
    const script = this.script;
    if (!script?.choices) {
      return;
    }
    const rows = script.choices.map((choice, index) => {
      const marker = index === this.choiceIndex ? '>' : ' ';
      return `${marker} ${choice.label}`;
    });
    this.bodyText.setText(`${this.currentLine()}\n${rows.join('\n')}`);
  }

  private actionPressed(): boolean {
    return this.actionKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
  }
}
