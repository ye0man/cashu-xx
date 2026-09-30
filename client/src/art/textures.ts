import type * as Phaser from 'phaser';
import type { MapDef } from '../data/maps';
import type { Bitmap } from './bitmap';
import { strip } from './bitmap';
import { renderMap } from './compose';
import { heroFrames, npcSprites, propSprites, SPRITE_H, SPRITE_W } from './sprites';

function toCanvas(bitmap: Bitmap): HTMLCanvasElement {
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
}

/** Bakes a map once and returns its texture key (cached for the session). */
export function mapTextureKey(textures: Phaser.Textures.TextureManager, map: MapDef): string {
  const key = `map-${map.id}`;
  if (!textures.exists(key)) {
    addTexture(textures, key, renderMap(map));
  }
  return key;
}
