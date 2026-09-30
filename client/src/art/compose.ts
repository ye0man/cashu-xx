import { NPCS } from '../data/npcs';
import { inRect, type MapDef, type WallRect } from '../data/maps';
import { Bitmap } from './bitmap';
import { heroFrames, npcSprites, propSprites, SPRITE_H } from './sprites';
import {
  bridgeTile,
  doorOverlay,
  facadeTile,
  flowerTile,
  floorTile,
  furnitureTile,
  grassTile,
  groundTile,
  innerWallTile,
  matTile,
  roofTile,
  TILE,
  treeTile,
  voidTile,
  waterTile,
} from './tiles';

export interface RenderOptions {
  /** Also draw NPCs, pickups and the hero at spawn (used by the preview tool). */
  withSprites?: boolean;
}

/** Rows given to the front wall; the rest of a building's footprint is roof. */
export function facadeRows(height: number): number {
  return Math.max(1, Math.min(4, Math.round(height * 0.4)));
}

function wallKind(map: MapDef, rect: WallRect): NonNullable<WallRect['kind']> {
  if (rect.kind) {
    return rect.kind;
  }
  return map.outdoor ? 'building' : 'furniture';
}

function isWater(map: MapDef, x: number, y: number): boolean {
  return map.water.some((rect) => inRect(rect, x, y));
}

function decorAt(map: MapDef, x: number, y: number) {
  const hits = (map.decor ?? []).filter((rect) => inRect(rect, x, y));
  return hits.at(-1) ?? null;
}

function drawBuilding(out: Bitmap, map: MapDef, rect: WallRect): void {
  const fRows = facadeRows(rect.h);
  const roofRowCount = rect.h - fRows;
  const roof = rect.roof ?? 'green';
  const facade = rect.facade ?? 'cream';
  for (let row = 0; row < rect.h; row += 1) {
    for (let col = 0; col < rect.w; col += 1) {
      const x = rect.x + col;
      const y = rect.y + row;
      const w = col === 0;
      const e = col === rect.w - 1;
      let tile: Bitmap;
      if (row < roofRowCount) {
        tile = roofTile(roof, { n: row === 0, s: row === roofRowCount - 1, w, e });
      } else {
        const frow = row - roofRowCount;
        const bottom = frow === fRows - 1;
        const door = map.doors.some((d) => d.x === x && d.y === y);
        const windowRow = fRows === 1 || frow >= fRows - 2;
        const window = !door && !w && !e && windowRow && col % 2 === 1;
        tile = facadeTile(facade, { n: frow === 0, s: bottom, w, e, window });
        if (door) {
          tile = tile.clone().blit(doorOverlay(), 0, 0);
        }
      }
      out.blit(tile, x * TILE, y * TILE);
    }
  }
}

function drawFurniture(out: Bitmap, rect: WallRect): void {
  const style = rect.furniture ?? 'counter';
  for (let row = 0; row < rect.h; row += 1) {
    for (let col = 0; col < rect.w; col += 1) {
      const tile = furnitureTile(style, {
        n: row === 0,
        s: row === rect.h - 1,
        w: col === 0,
        e: col === rect.w - 1,
        col,
      });
      out.blit(tile, (rect.x + col) * TILE, (rect.y + row) * TILE);
    }
  }
}

function groundFor(map: MapDef, x: number, y: number): Bitmap {
  if (!map.outdoor) {
    return floorTile(map.floor ?? 'wood');
  }
  const decor = decorAt(map, x, y);
  if (decor?.kind === 'grass') {
    return grassTile();
  }
  if (decor?.kind === 'flowers') {
    return flowerTile();
  }
  if (decor?.kind === 'bridge') {
    return bridgeTile({ w: x === decor.x, e: x === decor.x + decor.w - 1 });
  }
  return groundTile();
}

/** Bakes every static layer of a map into one bitmap (cols×16 by rows×16). */
export function renderMap(map: MapDef, options: RenderOptions = {}): Bitmap {
  const out = new Bitmap(map.cols * TILE, map.rows * TILE);

  // 1. ground / floor everywhere
  for (let y = 0; y < map.rows; y += 1) {
    for (let x = 0; x < map.cols; x += 1) {
      out.blit(groundFor(map, x, y), x * TILE, y * TILE);
    }
  }

  // 2. water with banks toward any non-water neighbour
  for (const rect of map.water) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const tile = waterTile({
          n: !isWater(map, x, y - 1),
          s: !isWater(map, x, y + 1),
          w: !isWater(map, x - 1, y),
          e: !isWater(map, x + 1, y),
        });
        out.blit(tile, x * TILE, y * TILE);
      }
    }
  }

  // 3. solid things
  const props = propSprites();
  for (const rect of map.walls) {
    const kind = wallKind(map, rect);
    if (kind === 'post') {
      continue;
    }
    if (kind === 'building') {
      drawBuilding(out, map, rect);
      continue;
    }
    if (kind === 'furniture') {
      drawFurniture(out, rect);
      continue;
    }
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        let tile: Bitmap;
        if (kind === 'trees') {
          tile = treeTile();
        } else if (y === 0) {
          tile = innerWallTile(map.wallStyle ?? 'paper');
        } else {
          tile = voidTile();
        }
        out.blit(tile, x * TILE, y * TILE);
      }
    }
  }

  // 4. room exits get a mat so the way out is obvious
  if (!map.outdoor) {
    for (const door of map.doors) {
      out.blit(matTile(map.floor ?? 'wood'), door.x * TILE, door.y * TILE);
    }
  }

  // 5. signs: posts outdoors, posters on back walls, notes on furniture
  for (const spot of map.signs) {
    const host = map.walls.find((rect) => inRect(rect, spot.x, spot.y));
    const hostKind = host ? wallKind(map, host) : 'post';
    let prop = props.sign;
    if (!map.outdoor && hostKind === 'wall') {
      prop = props.poster;
    } else if (hostKind === 'furniture') {
      prop = props.note;
    }
    out.blit(prop, spot.x * TILE, spot.y * TILE);
  }

  if (options.withSprites) {
    const sprites = npcSprites();
    for (const spot of map.pickups) {
      out.blit(props.pickup, spot.x * TILE, spot.y * TILE);
    }
    for (const spot of map.npcs) {
      const sprite = sprites[NPCS[spot.npcId]?.texture ?? ''];
      if (sprite) {
        out.blit(sprite, spot.x * TILE, (spot.y + 1) * TILE - SPRITE_H);
      }
    }
    out.blit(heroFrames()[0], map.spawn.x * TILE, (map.spawn.y + 1) * TILE - SPRITE_H);
  }
  return out;
}
