export type Direction = 'up' | 'down' | 'left' | 'right';

const DELTAS: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export interface GridMoverOptions {
  tile: number;
  speed: number;
  startTileX: number;
  startTileY: number;
  canWalk: (tileX: number, tileY: number) => boolean;
}

export class GridMover {
  facing: Direction = 'down';

  private readonly opts: GridMoverOptions;
  private fromX: number;
  private fromY: number;
  private toX: number;
  private toY: number;
  private progress = 0;

  constructor(opts: GridMoverOptions) {
    this.opts = opts;
    this.fromX = this.toX = opts.startTileX;
    this.fromY = this.toY = opts.startTileY;
  }

  get moving(): boolean {
    return this.fromX !== this.toX || this.fromY !== this.toY;
  }

  get tileX(): number {
    return this.toX;
  }

  get tileY(): number {
    return this.toY;
  }

  get pixelX(): number {
    const t = this.moving ? this.progress : 1;
    return (this.fromX + (this.toX - this.fromX) * t) * this.opts.tile + this.opts.tile / 2;
  }

  get pixelY(): number {
    const t = this.moving ? this.progress : 1;
    return (this.fromY + (this.toY - this.fromY) * t) * this.opts.tile + this.opts.tile;
  }

  update(deltaMs: number): void {
    if (!this.moving) {
      return;
    }
    this.progress += (this.opts.speed * deltaMs) / 1000 / this.opts.tile;
    if (this.progress >= 1) {
      this.fromX = this.toX;
      this.fromY = this.toY;
      this.progress = 0;
    }
  }

  tryStep(direction: Direction): boolean {
    this.facing = direction;
    if (this.moving) {
      return false;
    }
    const [dx, dy] = DELTAS[direction];
    const nextX = this.fromX + dx;
    const nextY = this.fromY + dy;
    if (!this.opts.canWalk(nextX, nextY)) {
      return false;
    }
    this.toX = nextX;
    this.toY = nextY;
    this.progress = 0;
    return true;
  }
}
