import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PALETTE_HEX, snapToPaletteColor } from './palette';

export function readPng(filePath: string): PNG {
  return PNG.sync.read(readFileSync(filePath));
}

export function writePng(filePath: string, png: PNG): void {
  writeFileSync(filePath, PNG.sync.write(png));
}

export function cropCenterRatio(src: PNG, ratioW: number, ratioH: number): PNG {
  const srcRatio = src.width / src.height;
  const targetRatio = ratioW / ratioH;
  let cropW: number;
  let cropH: number;
  if (srcRatio > targetRatio) {
    cropH = src.height;
    cropW = Math.round(cropH * targetRatio);
  } else {
    cropW = src.width;
    cropH = Math.round(cropW / targetRatio);
  }
  const x0 = Math.floor((src.width - cropW) / 2);
  const y0 = Math.floor((src.height - cropH) / 2);
  const out = new PNG({ width: cropW, height: cropH });
  PNG.bitblt(src, out, x0, y0, cropW, cropH, 0, 0);
  return out;
}

export function downscaleNearest(src: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
      const si = (src.width * sy + sx) << 2;
      const di = (width * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

export interface SnapReport {
  offPixels: number;
  total: number;
}

export function snapFrame(png: PNG): SnapReport {
  let offPixels = 0;
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const snapped = snapToPaletteColor(r, g, b);
    if (snapped.r !== r || snapped.g !== g || snapped.b !== b) {
      offPixels += 1;
    }
    png.data[i] = snapped.r;
    png.data[i + 1] = snapped.g;
    png.data[i + 2] = snapped.b;
    png.data[i + 3] = 255;
  }
  return { offPixels, total };
}

export function shiftDown(src: PNG, pixels: number): PNG {
  const out = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const si = (src.width * Math.max(0, y - pixels) + x) << 2;
      const di = (src.width * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

export function composeHorizontal(frames: PNG[]): PNG {
  const height = Math.max(...frames.map((frame) => frame.height));
  const width = frames.reduce((sum, frame) => sum + frame.width, 0);
  const out = new PNG({ width, height });
  let x0 = 0;
  for (const frame of frames) {
    PNG.bitblt(frame, out, 0, 0, frame.width, frame.height, x0, 0);
    x0 += frame.width;
  }
  return out;
}

export function composeGrid(frames: PNG[], columns: number): PNG {
  const cellW = Math.max(...frames.map((frame) => frame.width));
  const cellH = Math.max(...frames.map((frame) => frame.height));
  const rows = Math.ceil(frames.length / columns);
  const out = new PNG({ width: cellW * columns, height: cellH * rows });
  frames.forEach((frame, index) => {
    const x0 = (index % columns) * cellW;
    const y0 = Math.floor(index / columns) * cellH;
    PNG.bitblt(frame, out, 0, 0, frame.width, frame.height, x0, y0);
  });
  return out;
}

export function paletteCoverage(png: PNG): { onPalette: number; total: number } {
  const allowed = new Set(PALETTE_HEX.map((hex) => hex.toString(16).padStart(6, '0')));
  let onPalette = 0;
  const total = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const key = ((png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]).toString(16).padStart(6, '0');
    if (allowed.has(key)) {
      onPalette += 1;
    }
  }
  return { onPalette, total };
}
