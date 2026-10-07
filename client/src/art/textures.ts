import type * as Phaser from 'phaser';
import type { MapDef } from '../data/maps';
import { Bitmap, strip } from './bitmap';
import { renderMap } from './compose';
import { heroFrames, logoArt, npcSprites, propSprites, SPRITE_H, SPRITE_W } from './sprites';

export function toCanvas(bitmap: Bitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }
  ctx.putImageData(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), 0, 0);
  return canvas;
}

function addTexture(textures: Phaser.Textures.TextureManager, key: string, bitmap: Bitmap) {
  if (textures.exists(key)) {
    textures.remove(key);
  }
  const texture = textures.addCanvas(key, toCanvas(bitmap));
  if (!texture) {
    throw new Error(`could not create texture ${key}`);
  }
  return texture;
}

/** Uploads the hero sheet, NPCs and props as textures. Call once at boot. */
export function registerArt(textures: Phaser.Textures.TextureManager): void {
  const frames = heroFrames();
  const hero = addTexture(textures, 'player', strip(frames));
  frames.forEach((_, index) => {
    hero.add(index, 0, index * SPRITE_W, 0, SPRITE_W, SPRITE_H);
  });
  for (const [key, bitmap] of Object.entries(npcSprites())) {
    addTexture(textures, key, bitmap);
  }
  for (const [key, bitmap] of Object.entries(propSprites())) {
    addTexture(textures, key, bitmap);
  }
  addTexture(textures, 'logo', logoArt());
  addTexture(textures, 'logo-field', disc(52, 0x7f38ca));
}

/** A pixel-exact filled circle (the vector `add.circle` edge smears when upscaled). */
export function disc(radius: number, rgb: number): Bitmap {
  const size = radius * 2 + 1;
  const out = new Bitmap(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - radius;
      const dy = y - radius;
      if (dx * dx + dy * dy <= radius * radius + radius) {
        out.set(x, y, rgb);
      }
    }
  }
  return out;
}

/** Bakes a map once and returns its texture key (cached for the session). */
export function mapTextureKey(textures: Phaser.Textures.TextureManager, map: MapDef): string {
  const key = `map-${map.id}`;
  if (!textures.exists(key)) {
    addTexture(textures, key, renderMap(map));
  }
  return key;
}
