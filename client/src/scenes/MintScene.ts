import * as Phaser from 'phaser';
import type { MintCandidate, MintListResponse } from '@cashu-xx/shared';
import { api } from '../systems/api';
import { setSelectedMint } from '../systems/mint';

const ROW_HEIGHT = 34;
const ROW_TOP = 64;
const MAX_VISIBLE = 6;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function statusLine(mint: MintCandidate): string {
  if (!mint.online) {
    return `OFFLINE — ${mint.error ?? 'unreachable'}`;
  }
  if (!mint.compatible) {
    return `${mint.name} · no bolt11 minting support`;
  }
  if (mint.feePpk > 0) {
    return `${mint.name} · input fees ${mint.feePpk} ppk (taken from your payout)`;
  }
  return `${mint.name} · no fees`;
}

export class MintScene extends Phaser.Scene {
  private mints: MintCandidate[] = [];
  private defaultUrl = '';
  private index = 0;
  private busy = false;
  private listObjects: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private scroll = 0;

  constructor() {
    super({ key: 'MintScene' });
  }

  create(): void {
    this.mints = [];
    this.index = 0;
    this.busy = false;
    this.scroll = 0;
    this.listObjects = [];

    this.add
      .text(240, 22, 'MINT DIRECTORY', {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#e8c9a0',
      })
      .setOrigin(0.5);
    this.add
      .text(240, 42, 'NUT-06: ask a mint who it is before you trust it', {
        fontFamily: 'Courier New',
        fontSize: '9px',
        color: '#9d5fe0',
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(240, 300, 'loading mints…', {
        fontFamily: 'Courier New',
        fontSize: '9px',
        color: '#8a8298',
        wordWrap: { width: 440 },
        align: 'center',
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-UP', (event: KeyboardEvent) => {
        if (!event.repeat) {
          this.move(-1);
        }
      });
      keyboard.on('keydown-DOWN', (event: KeyboardEvent) => {
        if (!event.repeat) {
          this.move(1);
        }
      });
      keyboard.on('keydown-ENTER', () => {
        void this.choose();
      });
      keyboard.on('keydown-Z', () => {
        void this.choose();
      });
      keyboard.on('keydown-M', () => {
        void this.addManual();
      });
      keyboard.on('keydown-ESC', () => {
        this.back();
      });
      keyboard.on('keydown-X', () => {
        this.back();
      });
    }

    void this.loadMints();
  }

  private async loadMints(): Promise<void> {
    try {
      const list: MintListResponse = await api.mints();
      this.mints = list.mints;
      this.defaultUrl = list.defaultUrl;
      this.index = Math.max(
        0,
        this.mints.findIndex((mint) => mint.url === this.defaultUrl && mint.compatible),
      );
      this.render();
    } catch (err) {
      this.statusText.setText(`${(err as Error).message} — M to enter a URL · ESC to go back`);
    }
  }

  private move(delta: number): void {
    if (this.mints.length === 0) {
      return;
    }
    this.index = (this.index + delta + this.mints.length) % this.mints.length;
    const half = Math.floor(MAX_VISIBLE / 2);
    this.scroll = Phaser.Math.Clamp(this.index - half, 0, Math.max(0, this.mints.length - MAX_VISIBLE));
    this.render();
  }

  private render(): void {
    for (const object of this.listObjects) {
      object.destroy();
    }
    this.listObjects = [];

    const visible = this.mints.slice(this.scroll, this.scroll + MAX_VISIBLE);
    visible.forEach((mint, offset) => {
      const absolute = this.scroll + offset;
      const selected = absolute === this.index;
      const y = ROW_TOP + offset * ROW_HEIGHT;
      const isDefault = mint.url === this.defaultUrl;
      const name = `${selected ? '>' : ' '} ${mint.label}${isDefault ? '  [default]' : ''}`;
      const primary = this.add.text(40, y, name, {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: selected ? '#f7e7cf' : '#c9c0d8',
      });
      const secondary = this.add.text(52, y + 13, `${host(mint.url)} · ${statusLine(mint)}`, {
        fontFamily: 'Courier New',
        fontSize: '9px',
        color: mint.compatible ? (selected ? '#9d5fe0' : '#6b6478') : '#f07878',
      });
      this.listObjects.push(primary, secondary);
    });

    if (this.mints.length === 0) {
      this.listObjects.push(
        this.add
          .text(240, 150, 'no mints listed', {
            fontFamily: 'Courier New',
            fontSize: '12px',
            color: '#8a8298',
          })
          .setOrigin(0.5),
      );
    }

    this.statusText.setText('ENTER select · M enter a URL · ESC back');
  }

  private async choose(): Promise<void> {
    const mint = this.mints[this.index];
    if (!mint || this.busy) {
      return;
    }
    if (!mint.online) {
      this.statusText.setText(`${mint.label} is offline — pick another`);
      return;
    }
    if (!mint.compatible) {
      this.statusText.setText(`${mint.label} does not support bolt11 minting`);
      return;
    }
    setSelectedMint({ url: mint.url, label: mint.label });
    this.back();
  }

  private async addManual(): Promise<void> {
    const input = window.prompt('Mint URL (https://…):');
    if (!input) {
      return;
    }
    this.busy = true;
    this.statusText.setText(`checking ${input} …`);
    try {
      const info = await api.mintInfo(input.trim());
      if (!info.online) {
        this.statusText.setText(`offline: ${info.error ?? 'unreachable'}`);
        return;
      }
      if (!info.compatible) {
        this.statusText.setText('that mint does not support bolt11 minting');
        return;
      }
      setSelectedMint({ url: info.url, label: info.name || host(info.url) });
      this.back();
    } catch (err) {
      this.statusText.setText(`${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private back(): void {
    this.scene.start('TitleScene');
  }
}
