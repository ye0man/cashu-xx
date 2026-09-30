/**
 * Offline art preview: renders every hand-authored sprite, a tile swatch and
 * each map to PNGs so the look can be reviewed without launching the game.
 *
 *   npx tsx client/scripts/preview-art.ts [outDir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { Bitmap, scaleUp, strip } from '../src/art/bitmap';
import { renderMap } from '../src/art/compose';
import { heroFrames, npcSprites, propSprites } from '../src/art/sprites';
import { MAPS } from '../src/data/maps';

const outDir = process.argv[2] ?? join(process.cwd(), 'art-preview');
mkdirSync(outDir, { recursive: true });

function save(name: string, bitmap: Bitmap, scale: number, backdrop = 0x7b2fbe): void {
  const bg = new Bitmap(bitmap.width, bitmap.height).fill(backdrop).blit(bitmap, 0, 0);
  const big = scaleUp(bg, scale);
  const png = new PNG({ width: big.width, height: big.height });
  png.data = Buffer.from(big.data);
  writeFileSync(join(outDir, `${name}.png`), PNG.sync.write(png));
  console.log(`wrote ${name}.png (${big.width}x${big.height})`);
}

save('hero', strip(heroFrames()), 8);
save('hero-on-ground', strip(heroFrames()), 8, 0xeef0d6);
const npcs = npcSprites();
save('npcs', strip(Object.values(npcs)), 8, 0xeef0d6);
save('props', strip(Object.values(propSprites())), 8, 0xeef0d6);

const only = process.argv[3];
for (const map of Object.values(MAPS)) {
  if (only && map.id !== only) {
    continue;
  }
  save(`map-${map.id}`, renderMap(map, { withSprites: true }), map.outdoor ? 1 : 3);
}
