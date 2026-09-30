import { describe, expect, it } from 'vitest';
import { renderMap } from '../src/art/compose';
import { heroFrames, npcSprites, propSprites, SPRITE_H, SPRITE_W } from '../src/art/sprites';
import { MAPS } from '../src/data/maps';
import { NPCS } from '../src/data/npcs';

function opaqueRatio(bitmap: { data: Uint8ClampedArray }): number {
  let opaque = 0;
  for (let i = 3; i < bitmap.data.length; i += 4) {
    if (bitmap.data[i] === 255) {
      opaque += 1;
    }
  }
  return opaque / (bitmap.data.length / 4);
}

describe('hand-authored art', () => {
  it('hero sheet has 3 facings x 3 poses of 16x24', () => {
    const frames = heroFrames();
    expect(frames).toHaveLength(9);
    for (const frame of frames) {
      expect([frame.width, frame.height]).toEqual([SPRITE_W, SPRITE_H]);
    }
  });

  it('sprites have transparent backgrounds', () => {
    const sprites = [...heroFrames(), ...Object.values(npcSprites()), ...Object.values(propSprites())];
    for (const sprite of sprites) {
      expect(sprite.get(0, 0)).toBeNull();
      expect(opaqueRatio(sprite)).toBeLessThan(0.8);
    }
  });

  it('every NPC texture has a sprite', () => {
    const sprites = npcSprites();
    for (const def of Object.values(NPCS)) {
      expect(sprites[def.texture], def.texture).toBeDefined();
    }
  });

  it('every map bakes to a fully opaque bitmap of the right size', () => {
    for (const map of Object.values(MAPS)) {
      const bitmap = renderMap(map);
      expect([bitmap.width, bitmap.height]).toEqual([map.cols * 16, map.rows * 16]);
      expect(opaqueRatio(bitmap), map.id).toBe(1);
    }
  });

  it('every building door sits on its building bottom row', () => {
    const map = MAPS.nussstadt;
    for (const door of map.doors) {
      const host = map.walls.find(
        (r) => door.x >= r.x && door.x < r.x + r.w && door.y >= r.y && door.y < r.y + r.h && r.kind !== 'trees',
      );
      expect(host, `${door.targetMap} door`).toBeDefined();
      expect(door.y).toBe((host?.y ?? 0) + (host?.h ?? 0) - 1);
    }
  });
});
