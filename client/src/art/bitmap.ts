/**
 * Tiny DOM-free RGBA bitmap used by every hand-authored asset. The same code
 * runs in the browser (uploaded to Phaser as canvas textures) and in Node (the
 * offline preview renderer), so the art is pure data plus pure functions.
 */
export class Bitmap {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, rgb: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    const i = (y * this.width + x) * 4;
    this.data[i] = (rgb >> 16) & 0xff;
    this.data[i + 1] = (rgb >> 8) & 0xff;
    this.data[i + 2] = rgb & 0xff;
    this.data[i + 3] = 255;
  }

  get(x: number, y: number): number | null {
    const i = (y * this.width + x) * 4;
    if (this.data[i + 3] === 0) {
      return null;
    }
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  fill(rgb: number): this {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        this.set(x, y, rgb);
      }
    }
    return this;
  }

  /** Copies opaque pixels of `src` onto this bitmap (binary alpha, no blending). */
  blit(src: Bitmap, dx: number, dy: number): this {
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < src.width; x += 1) {
        const color = src.get(x, y);
        if (color !== null) {
          this.set(dx + x, dy + y, color);
        }
      }
    }
    return this;
  }

  clone(): Bitmap {
    const out = new Bitmap(this.width, this.height);
    out.data.set(this.data);
    return out;
  }

  flipX(): Bitmap {
    const out = new Bitmap(this.width, this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const color = this.get(x, y);
        if (color !== null) {
          out.set(this.width - 1 - x, y, color);
        }
      }
    }
    return out;
  }

  /** Returns a copy with every pixel of color `from` replaced by `to`. */
  recolor(map: Record<number, number>): Bitmap {
    const out = new Bitmap(this.width, this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const color = this.get(x, y);
        if (color !== null) {
          out.set(x, y, map[color] ?? color);
        }
      }
    }
    return out;
  }
}

/** Character → color map. `.` (and space) always mean transparent. */
export type Legend = Record<string, number>;

/**
 * Builds a bitmap from rows of characters. Throws on ragged rows or unknown
 * characters so typos in hand-drawn art fail loudly (and in tests).
 */
export function ascii(rows: readonly string[], legend: Legend, name = 'art'): Bitmap {
  const width = rows[0]?.length ?? 0;
  const out = new Bitmap(width, rows.length);
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`${name}: row ${y} is ${row.length} wide, expected ${width}`);
    }
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') {
        continue;
      }
      const color = legend[ch];
      if (color === undefined) {
        throw new Error(`${name}: unknown pixel '${ch}' at ${x},${y}`);
      }
      out.set(x, y, color);
    }
  });
  return out;
}

/** Lays frames out left→right in one strip (all frames must share a size). */
export function strip(frames: readonly Bitmap[]): Bitmap {
  const first = frames[0];
  const out = new Bitmap(first.width * frames.length, first.height);
  frames.forEach((frame, index) => {
    out.blit(frame, index * first.width, 0);
  });
  return out;
}

/** Nearest-neighbour upscale — used for previews only. */
export function scaleUp(src: Bitmap, factor: number): Bitmap {
  const out = new Bitmap(src.width * factor, src.height * factor);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const color = src.get(Math.floor(x / factor), Math.floor(y / factor));
      if (color !== null) {
        out.set(x, y, color);
      }
    }
  }
  return out;
}
