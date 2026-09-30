import * as Phaser from 'phaser';
import { GAME_CONFIG } from '../data/config';
import { api, ApiError } from '../systems/api';
import { type Direction, GridMover } from '../systems/movement';
import { getGameSession } from '../systems/session';

interface GreyBoxGrid {
  cols: number;
  rows: number;
  walls: Set<number>;
}

function buildGreyBoxGrid(): GreyBoxGrid {
  const cols = GAME_CONFIG.mapCols;
  const rows = GAME_CONFIG.mapRows;
  const walls = new Set<number>();
  const block = (x1: number, y1: number, x2: number, y2: number): void => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        walls.add(y * cols + x);
      }
    }
  };

  block(0, 0, cols - 1, 1);
  block(0, rows - 2, cols - 1, rows - 1);
  block(0, 0, 1, rows - 1);
  block(cols - 2, 0, cols - 1, rows - 1);
  block(6, 5, 12, 10);
  block(30, 6, 38, 12);
  block(14, 18, 33, 19);
  block(20, 26, 22, 28);

  return { cols, rows, walls };
}

export class OverworldScene extends Phaser.Scene {
  private readonly grid = buildGreyBoxGrid();
  private mover!: GridMover;
  private player!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private keyU!: Phaser.Input.Keyboard.Key;
  private toast!: Phaser.GameObjects.Text;
  private toastEvent: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'OverworldScene' });
  }

  create(): void {
    const { tile } = GAME_CONFIG;
    const worldWidth = this.grid.cols * tile;
    const worldHeight = this.grid.rows * tile;

    this.add.tileSprite(0, 0, worldWidth, worldHeight, 'tile-floor').setOrigin(0);
    for (const cell of this.grid.walls) {
      const x = cell % this.grid.cols;
      const y = Math.floor(cell / this.grid.cols);
      this.add.image(x * tile + tile / 2, y * tile + tile / 2, 'tile-wall');
    }

    this.mover = new GridMover({
      tile,
      speed: GAME_CONFIG.walkSpeed,
      startTileX: GAME_CONFIG.spawnTileX,
      startTileY: GAME_CONFIG.spawnTileY,
      canWalk: (x, y) => this.canWalk(x, y),
    });

    this.player = this.add.sprite(this.mover.pixelX, this.mover.pixelY, 'player').setOrigin(0.5, 1);

    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    this.add
      .text(8, 6, 'NUSSSTADT (grey-box)', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#e8c9a0',
      })
      .setScrollFactor(0);

    this.add
      .text(8, GAME_CONFIG.height - 20, 'ARROWS/WASD move   U unlock mock token', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#b0a8bd',
      })
      .setScrollFactor(0);

    this.toast = this.add
      .text(GAME_CONFIG.width / 2, 28, '', {
        fontFamily: 'Courier New',
        fontSize: '11px',
        color: '#f7e7cf',
        backgroundColor: '#1e1036',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setAlpha(0);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
      this.keyU = keyboard.addKey('U');
    }
  }

  update(_time: number, delta: number): void {
    const direction = this.readDirection();
    if (direction) {
      this.mover.tryStep(direction);
    }
    this.mover.update(delta);
    this.player.setPosition(this.mover.pixelX, this.mover.pixelY);

    if (Phaser.Input.Keyboard.JustDown(this.keyU)) {
      void this.handleUnlock();
    }
  }

  private canWalk(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.grid.cols || y >= this.grid.rows) {
      return false;
    }
    return !this.grid.walls.has(y * this.grid.cols + x);
  }

  private readDirection(): Direction | null {
    if (this.cursors.left.isDown || this.wasd.A.isDown) {
      return 'left';
    }
    if (this.cursors.right.isDown || this.wasd.D.isDown) {
      return 'right';
    }
    if (this.cursors.up.isDown || this.wasd.W.isDown) {
      return 'up';
    }
    if (this.cursors.down.isDown || this.wasd.S.isDown) {
      return 'down';
    }
    return null;
  }

  private showToast(message: string): void {
    this.toast.setText(message).setAlpha(1);
    this.toastEvent?.remove();
    this.toastEvent = this.time.delayedCall(2600, () => {
      this.toast.setAlpha(0);
    });
  }

  private async handleUnlock(): Promise<void> {
    const session = getGameSession();
    if (!session) {
      this.showToast('offline mode — no session');
      return;
    }
    try {
      const result = await api.unlock(session.sessionId, 'hidden-pos');
      this.showToast(`token unlocked (mock): ${result.token.slice(0, 20)}...`);
    } catch (err) {
      this.showToast(err instanceof ApiError ? `unlock failed: ${err.status}` : 'unlock failed');
    }
  }
}
