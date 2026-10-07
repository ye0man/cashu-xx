import * as Phaser from 'phaser';
import { FONT_CHARS, FONT_COLUMNS, fontAtlas, GLYPH_H, GLYPH_W } from '../art/font';
import { toCanvas } from '../art/textures';

/**
 * Pixel-font text. Every on-screen string goes through here so it is drawn
 * from the hand-made bitmap font at an integer scale — crisp at any zoom —
 * instead of antialiased system type that the pixel-art upscale blurs.
 */
export interface PixelTextStyle {
  /** CSS-style hex (`#e8c9a0`) or a 0xRRGGBB number. */
  color?: string | number;
  /** Integer pixel scale: 1 = body text (7 px caps), 2–4 for headings. */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** Word-wrap width in game pixels. */
  maxWidth?: number;
  /** Extra pixels between lines (at scale 1). */
  lineSpacing?: number;
}

export type PixelText = Phaser.GameObjects.BitmapText;

const DEFAULT_COLOR = 0xf7e7cf;

function toRgb(color: string | number | undefined): number {
  if (color === undefined) {
    return DEFAULT_COLOR;
  }
  if (typeof color === 'number') {
    return color;
  }
  return Number.parseInt(color.replace('#', '').slice(0, 6), 16);
}

/** Registers (once per game) the font atlas for one color and returns its bitmap-font key. */
export function pixelFont(scene: Phaser.Scene, color?: string | number): string {
  const rgb = toRgb(color);
  const key = `pixfont-${rgb.toString(16).padStart(6, '0')}`;
  if (!scene.cache.bitmapFont.exists(key)) {
    if (!scene.textures.exists(key)) {
      scene.textures.addCanvas(key, toCanvas(fontAtlas(rgb)));
    }
    const parsed = Phaser.GameObjects.RetroFont.Parse(scene, {
      image: key,
      width: GLYPH_W,
      height: GLYPH_H,
      chars: FONT_CHARS,
      charsPerRow: FONT_COLUMNS,
      'spacing.x': 0,
      'spacing.y': 0,
      'offset.x': 0,
      'offset.y': 0,
      lineSpacing: 0,
    });
    if (!parsed) {
      throw new Error('pixel font could not be parsed');
    }
    scene.cache.bitmapFont.add(key, parsed);
  }
  return key;
}

export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: PixelTextStyle = {},
): PixelText {
  const scale = Math.max(1, Math.round(style.scale ?? 1));
  const align = style.align === 'center' ? 1 : style.align === 'right' ? 2 : 0;
  const object = scene.add.bitmapText(x, y, pixelFont(scene, style.color), text, GLYPH_W * scale, align);
  if (style.maxWidth !== undefined) {
    object.setMaxWidth(style.maxWidth);
  }
  if (style.lineSpacing !== undefined) {
    object.setLineSpacing(style.lineSpacing * scale);
  }
  return object;
}

/** Recolor a pixel text (swaps to that color's atlas; no tinting, so every renderer matches). */
export function setPixelColor(object: PixelText, color: string | number): PixelText {
  return object.setFont(pixelFont(object.scene, color));
}

/**
 * Centers a text on `x` at a whole-pixel offset. `setOrigin(0.5)` on an odd
 * pixel width lands glyphs on half pixels, which nearest-neighbour sampling
 * renders as uneven strokes.
 */
export function centerPixelText(object: PixelText, x: number, y?: number): PixelText {
  object.setOrigin(0, object.originY);
  const width = object.getTextBounds().global.width;
  object.setX(Math.round(x - width / 2));
  if (y !== undefined) {
    object.setY(Math.round(y));
  }
  return object;
}

/** Pixel text on a solid padded plate that resizes with the text (HUD chips, toasts). */
export class PixelLabel extends Phaser.GameObjects.Container {
  private readonly plate: Phaser.GameObjects.Rectangle;
  private readonly label: PixelText;
  private readonly padX: number;
  private readonly padY: number;
  private readonly centered: boolean;
  private readonly anchorX: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: { color?: string | number; background: number; backgroundAlpha?: number; padX?: number; padY?: number; centered?: boolean },
  ) {
    super(scene, 0, Math.round(y));
    this.padX = options.padX ?? 5;
    this.padY = options.padY ?? 3;
    this.centered = options.centered ?? false;
    this.anchorX = x;
    this.plate = scene.add.rectangle(0, 0, 1, 1, options.background, options.backgroundAlpha ?? 1).setOrigin(0);
    this.label = pixelText(scene, this.padX, this.padY, '', { color: options.color });
    this.add([this.plate, this.label]);
    scene.add.existing(this);
    this.setText(text);
  }

  setText(text: string): this {
    this.label.setText(text);
    const bounds = this.label.getTextBounds().global;
    // Glyph cells carry two descender rows; trim the empty one under caps-only text.
    const width = Math.ceil(bounds.width) + this.padX * 2;
    const height = Math.ceil(bounds.height) + this.padY * 2 - 1;
    this.plate.setSize(width, height);
    this.setX(this.centered ? Math.round(this.anchorX - width / 2) : Math.round(this.anchorX));
    return this;
  }
}
