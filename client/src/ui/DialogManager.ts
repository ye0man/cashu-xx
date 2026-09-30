import * as Phaser from 'phaser';
import type { DialogueScript } from '../systems/dialogue';

const TYPE_MS_PER_CHAR = 18;

export class DialogManager {
  private readonly container: Phaser.GameObjects.Container;
  private readonly speakerText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
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

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(100).setVisible(false);
    const panel = scene.add
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
    this.container.add([panel, this.speakerText, this.bodyText]);

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

  open(script: DialogueScript, onDone?: (choiceId: string | null) => void): void {
    this.script = script;
    this.lineIndex = 0;
    this.revealed = 0;
    this.typing = true;
    this.choiceIndex = 0;
    this.choosing = false;
    this.onDone = onDone ?? null;
    this.speakerText.setText(script.speaker ?? '');
    this.container.setVisible(true);
    this.renderLine();
  }

  update(delta: number): void {
    const script = this.script;
    if (!script) {
      return;
    }

    const full = this.currentLine();
    if (this.typing) {
      this.revealed += delta / TYPE_MS_PER_CHAR;
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
