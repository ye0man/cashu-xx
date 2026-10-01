import { ascii, Bitmap, type Legend } from './bitmap';
import { C, ROOFS, type RoofStyle } from './palette';

/**
 * Hand-authored 16×16 tiles. Everything is kept deliberately calm: flat fills,
 * one or two accent tones, and regular (never random) texture so large areas
 * read as clean surfaces instead of noise.
 */
export const TILE = 16;

const cache = new Map<string, Bitmap>();

function cached(key: string, make: () => Bitmap): Bitmap {
  let tile = cache.get(key);
  if (!tile) {
    tile = make();
    cache.set(key, tile);
  }
  return tile;
}

function blank(color: number): Bitmap {
  return new Bitmap(TILE, TILE).fill(color);
}

function hline(b: Bitmap, y: number, x0: number, x1: number, color: number): void {
  for (let x = x0; x <= x1; x += 1) {
    b.set(x, y, color);
  }
}

function vline(b: Bitmap, x: number, y0: number, y1: number, color: number): void {
  for (let y = y0; y <= y1; y += 1) {
    b.set(x, y, color);
  }
}

function rect(b: Bitmap, x0: number, y0: number, x1: number, y1: number, color: number): void {
  for (let y = y0; y <= y1; y += 1) {
    hline(b, y, x0, x1, color);
  }
}

// ---------------------------------------------------------------- outdoors

/** Pale ground with a sparse, perfectly regular dot grid (classic RPG town style). */
export function groundTile(): Bitmap {
  return cached('ground', () => {
    const b = blank(C.ground);
    for (const [x, y] of [
      [3, 3],
      [11, 7],
      [3, 11],
      [11, 15],
    ]) {
      b.set(x, y, C.groundDot);
    }
    return b;
  });
}

const GRASS_ROWS = [
  '................',
  '..b.b...........',
  '...b............',
  '..........b.b...',
  '...........b....',
  '................',
  '................',
  '.....l..........',
  '................',
  '.b.b............',
  '..b.......b.b...',
  '...........b....',
  '................',
  '......b.b.......',
  '.......b........',
  '................',
];

export function grassTile(): Bitmap {
  return cached('grass', () =>
    blank(C.grass).blit(ascii(GRASS_ROWS, { b: C.grassBlade, l: C.grassLight }, 'grass'), 0, 0),
  );
}

const FLOWER_ROWS = [
  '................',
  '..p.............',
  '.pyp......b.b...',
  '..p........b....',
  '..b.............',
  '.........p......',
  '........pyp.....',
  '.........p......',
  '.........b......',
  '.b.b............',
  '..b.p...........',
  '...pyp......b.b.',
  '....p........b..',
  '....b...........',
  '.......b.b......',
  '........b.......',
];

export function flowerTile(): Bitmap {
  return cached('flowers', () =>
    grassTile()
      .clone()
      .blit(ascii(FLOWER_ROWS, { p: C.petal, y: C.pollen, b: C.grassBlade }, 'flowers'), 0, 0),
  );
}

const TREE_ROWS = [
  '.....oooooo.....',
  '...oo111122oo...',
  '..o1111122222o..',
  '.o111112222223o.',
  '.o111122222223o.',
  'o11112222222333o',
  'o11122222222333o',
  'o31122222223333o',
  'o33222222233333o',
  '.o332222333333o.',
  '.o333333333333o.',
  '..o3333333333o..',
  '...oo333333oo...',
  '.....oottToo....',
  '......otTTo.....',
  '.....ssoooss....',
];

const TREE_LEGEND: Legend = {
  o: C.leafInk,
  '1': C.leafLight,
  '2': C.leaf,
  '3': C.leafDark,
  t: C.trunk,
  T: C.trunkDark,
  s: C.groundEdge,
};

/** A round GBC tree on ground; rows of them make the town's forest border. */
export function treeTile(): Bitmap {
  return cached('tree', () => blank(C.ground).blit(ascii(TREE_ROWS, TREE_LEGEND, 'tree'), 0, 0));
}

export interface Edges {
  n?: boolean;
  s?: boolean;
  w?: boolean;
  e?: boolean;
}

function edgeKey(prefix: string, edges: Edges): string {
  return `${prefix}:${edges.n ? 'n' : ''}${edges.s ? 's' : ''}${edges.w ? 'w' : ''}${edges.e ? 'e' : ''}`;
}

/** Water with a soft two-tone wave and rock banks wherever it meets land. */
export function waterTile(land: Edges): Bitmap {
  return cached(edgeKey('water', land), () => {
    const b = blank(C.water);
    hline(b, 4, 2, 4, C.waterLight);
    hline(b, 5, 5, 6, C.waterLight);
    hline(b, 11, 10, 12, C.waterLight);
    hline(b, 12, 13, 14, C.waterLight);
    if (land.n) {
      hline(b, 0, 0, 15, C.bankLight);
      hline(b, 1, 0, 15, C.bank);
      hline(b, 2, 0, 15, C.bankDark);
      hline(b, 3, 0, 15, C.waterDark);
      for (let x = 1; x < 16; x += 4) {
        b.set(x, 1, C.bankLight);
      }
    }
    if (land.s) {
      hline(b, 14, 0, 15, C.foam);
      hline(b, 15, 0, 15, C.bank);
    }
    if (land.w) {
      vline(b, 0, land.n ? 2 : 0, 15, C.bank);
      vline(b, 1, land.n ? 3 : 0, land.s ? 13 : 15, C.foam);
    }
    if (land.e) {
      vline(b, 15, land.n ? 2 : 0, 15, C.bank);
      vline(b, 14, land.n ? 3 : 0, land.s ? 13 : 15, C.foam);
    }
    return b;
  });
}

/** Wooden plank bridge running north–south, with rails at the edges. */
export function bridgeTile(edges: Edges): Bitmap {
  return cached(edgeKey('bridge', edges), () => {
    const b = blank(C.plank);
    for (let y = 3; y < 16; y += 4) {
      hline(b, y, 0, 15, C.plankLine);
    }
    for (let y = 0; y < 16; y += 4) {
      b.set(5, y + 1, C.plankShade);
      b.set(11, y + 2, C.plankShade);
    }
    if (edges.w) {
      vline(b, 0, 0, 15, C.woodDark);
      vline(b, 1, 0, 15, C.woodLight);
    }
    if (edges.e) {
      vline(b, 15, 0, 15, C.woodDark);
      vline(b, 14, 0, 15, C.woodLight);
    }
    return b;
  });
}

// ---------------------------------------------------------------- buildings

/** Striped GBC roof. Edge flags add the outline and ridge/eave rows. */
export function roofTile(style: RoofStyle, edges: Edges): Bitmap {
  return cached(edgeKey(`roof-${style}`, edges), () => {
    const r = ROOFS[style];
    const b = blank(r.mid);
    for (let y = 0; y < 16; y += 1) {
      if (y % 4 === 3) {
        hline(b, y, 0, 15, r.dark);
      } else if (y % 4 === 0) {
        hline(b, y, 0, 15, r.light);
      }
    }
    if (style === 'glass') {
      for (let x = 3; x < 16; x += 8) {
        vline(b, x, 0, 15, r.dark);
      }
      b.set(5, 1, C.white);
      b.set(6, 2, C.white);
      b.set(13, 9, C.white);
      b.set(14, 10, C.white);
    }
    if (edges.n) {
      hline(b, 0, 0, 15, r.ink);
      hline(b, 1, 0, 15, r.light);
      hline(b, 2, 0, 15, r.light);
    }
    if (edges.s) {
      hline(b, 13, 0, 15, r.dark);
      hline(b, 14, 0, 15, r.dark);
      hline(b, 15, 0, 15, r.ink);
    }
    if (edges.w) {
      vline(b, 0, 0, 15, r.ink);
      vline(b, 1, edges.n ? 1 : 0, edges.s ? 14 : 15, r.light);
    }
    if (edges.e) {
      vline(b, 15, 0, 15, r.ink);
      vline(b, 14, edges.n ? 1 : 0, edges.s ? 14 : 15, r.dark);
    }
    return b;
  });
}

export type FacadeStyle = 'cream' | 'brick' | 'concrete' | 'glass' | 'club';

interface WallColors {
  base: number;
  shade: number;
  line: number;
}

const FACADES: Record<FacadeStyle, WallColors> = {
  cream: { base: C.wall, shade: C.wallShade, line: C.wallDark },
  brick: { base: C.brick, shade: C.brickShade, line: C.brickLine },
  concrete: { base: C.concrete, shade: C.concreteShade, line: C.concreteLine },
  glass: { base: C.wall, shade: C.wallShade, line: C.wallDark },
  club: { base: C.clubWall, shade: C.clubShade, line: C.clubLine },
};

export interface FacadeFlags extends Edges {
  window?: boolean;
}

function drawWindow(b: Bitmap): void {
  rect(b, 3, 4, 12, 11, C.windowFrame);
  rect(b, 4, 5, 11, 10, C.window);
  vline(b, 7, 5, 10, C.windowFrame);
  vline(b, 8, 5, 10, C.windowFrame);
  b.set(5, 6, C.windowLight);
  b.set(6, 6, C.windowLight);
  b.set(5, 7, C.windowLight);
  b.set(10, 6, C.windowLight);
  hline(b, 12, 2, 13, C.wallDark);
}

/** Front wall of a building: eave shadow on top, plinth on the bottom row. */
export function facadeTile(style: FacadeStyle, flags: FacadeFlags): Bitmap {
  const key = `${edgeKey(`facade-${style}`, flags)}${flags.window ? 'W' : ''}`;
  return cached(key, () => {
    const w = FACADES[style];
    const b = blank(w.base);
    if (style === 'brick') {
      for (let y = 3; y < 16; y += 4) {
        hline(b, y, 0, 15, w.shade);
        const offset = (y >> 2) % 2 === 0 ? 3 : 11;
        vline(b, offset, y - 3, y - 1, w.shade);
      }
    } else if (style === 'concrete') {
      for (let y = 7; y < 16; y += 8) {
        hline(b, y, 0, 15, w.shade);
      }
    } else if (style === 'club') {
      for (let x = 1; x < 16; x += 4) {
        vline(b, x, 0, 15, w.shade);
      }
    }
    if (style === 'glass') {
      rect(b, 0, 0, 15, 15, C.windowFrame);
      rect(b, 1, 1, 6, 14, C.window);
      rect(b, 9, 1, 14, 14, C.window);
      b.set(2, 3, C.windowLight);
      b.set(3, 2, C.windowLight);
      b.set(10, 3, C.windowLight);
      b.set(11, 2, C.windowLight);
      b.set(2, 4, C.windowLight);
    } else if (flags.window) {
      drawWindow(b);
    }
    if (flags.n) {
      hline(b, 0, 0, 15, w.line);
      hline(b, 1, 0, 15, w.shade);
    }
    if (flags.s) {
      hline(b, 14, 0, 15, w.shade);
      hline(b, 15, 0, 15, w.line);
    }
    if (flags.w) {
      vline(b, 0, 0, 15, C.ink);
    }
    if (flags.e) {
      vline(b, 15, 0, 15, C.ink);
    }
    return b;
  });
}

const DOOR_ROWS = [
  '................',
  '................',
  '..oooooooooooo..',
  '..oLDDDDDDDDLo..',
  '..oDddddddddDo..',
  '..oDdLLLLLLdDo..',
  '..oDdLDDDDLdDo..',
  '..oDdLDDDDLdDo..',
  '..oDdLLLLLLdDo..',
  '..oDddddddkdDo..',
  '..oDdLLLLLLdDo..',
  '..oDdLDDDDLdDo..',
  '..oDdLDDDDLdDo..',
  '..oDdLLLLLLdDo..',
  '..oDddddddddDo..',
  '.osssssssssssso.',
];

/** Wooden front door, drawn over the bottom facade row. */
export function doorOverlay(): Bitmap {
  return cached('door', () =>
    ascii(
      DOOR_ROWS,
      { o: C.ink, L: C.doorLight, D: C.door, d: C.doorDark, k: C.knob, s: C.wallDark },
      'door',
    ),
  );
}

// ---------------------------------------------------------------- interiors

export type FloorStyle = 'wood' | 'tile' | 'carpet' | 'dark';

export function floorTile(style: FloorStyle): Bitmap {
  return cached(`floor-${style}`, () => {
    switch (style) {
      case 'wood': {
        const b = blank(C.plank);
        for (let y = 3; y < 16; y += 4) {
          hline(b, y, 0, 15, C.plankShade);
        }
        for (let band = 0; band < 4; band += 1) {
          const x = band % 2 === 0 ? 5 : 12;
          vline(b, x, band * 4, band * 4 + 2, C.plankShade);
        }
        return b;
      }
      case 'tile': {
        const b = blank(C.tileFloor);
        hline(b, 15, 0, 15, C.tileFloorLine);
        vline(b, 15, 0, 15, C.tileFloorLine);
        return b;
      }
      case 'carpet': {
        const b = blank(C.carpet);
        for (const [x, y] of [
          [3, 3],
          [11, 11],
        ]) {
          b.set(x, y, C.carpetLight);
          b.set(x + 1, y, C.carpetLight);
          b.set(x, y + 1, C.carpetLight);
          b.set(x + 1, y + 1, C.carpetLight);
        }
        b.set(11, 3, C.carpetDark);
        b.set(3, 11, C.carpetDark);
        return b;
      }
      case 'dark': {
        const b = blank(C.darkFloor);
        hline(b, 15, 0, 15, C.darkFloorLine);
        vline(b, 15, 0, 15, C.darkFloorLine);
        b.set(4, 5, C.darkFloorLine);
        b.set(10, 11, C.darkFloorLine);
        return b;
      }
    }
  });
}

export type WallStyle = 'paper' | 'club' | 'concrete' | 'dark';

const INNER_WALLS: Record<WallStyle, { base: number; stripe: number; board: number }> = {
  paper: { base: C.wallpaper, stripe: C.wallpaperStripe, board: C.baseboard },
  club: { base: C.clubWall, stripe: C.clubShade, board: C.clubLine },
  concrete: { base: C.concrete, stripe: C.concreteShade, board: C.concreteLine },
  dark: { base: C.clubShade, stripe: C.clubLine, board: C.ink },
};

/** The visible back wall of a room (top border row). */
export function innerWallTile(style: WallStyle): Bitmap {
  return cached(`inner-${style}`, () => {
    const w = INNER_WALLS[style];
    const b = blank(w.base);
    for (let x = 2; x < 16; x += 4) {
      vline(b, x, 1, 12, w.stripe);
    }
    hline(b, 0, 0, 15, C.ink);
    hline(b, 13, 0, 15, w.board);
    hline(b, 14, 0, 15, w.board);
    hline(b, 15, 0, 15, C.ink);
    return b;
  });
}

/** Out-of-bounds area around rooms. */
export function voidTile(): Bitmap {
  return cached('void', () => blank(C.ink));
}

/** Exit mat drawn on a room's door tile. */
export function matTile(floor: FloorStyle): Bitmap {
  return cached(`mat-${floor}`, () => {
    const out = floorTile(floor).clone();
    rect(out, 2, 4, 13, 13, C.redDark);
    rect(out, 3, 5, 12, 12, C.red);
    hline(out, 8, 4, 11, C.redDark);
    return out;
  });
}

export type FurnitureStyle = 'counter' | 'shelf' | 'bench' | 'desk' | 'crates' | 'planter' | 'booth';

export interface FurnitureFlags extends Edges {
  /** column index within the piece, used for a gentle repeating variation */
  col: number;
}

const BOOK_COLORS = [C.red, C.blue, C.green, C.purple, C.gold, C.blueDark];

function books(b: Bitmap, y0: number, y1: number, seed: number): void {
  let x = 1;
  let i = seed;
  while (x < 15) {
    const width = 1 + (i % 2);
    const color = BOOK_COLORS[i % BOOK_COLORS.length];
    const top = y0 + (i % 3 === 0 ? 1 : 0);
    rect(b, x, top, Math.min(14, x + width - 1), y1, color);
    x += width + 1;
    i += 1;
  }
}

/**
 * Furniture fills interior obstacle rects. `n` marks the top surface row and
 * `s` the front row facing the player.
 */
export function furnitureTile(style: FurnitureStyle, f: FurnitureFlags): Bitmap {
  const key = `${edgeKey(`furn-${style}`, f)}${f.col % 4}`;
  return cached(key, () => {
    const b = new Bitmap(TILE, TILE);
    switch (style) {
      case 'counter':
      case 'desk': {
        const top = style === 'desk' ? C.purpleLight : C.woodLight;
        const front = style === 'desk' ? C.purple : C.wood;
        const dark = style === 'desk' ? C.purpleDark : C.woodDark;
        if (f.s) {
          b.fill(front);
          hline(b, 0, 0, 15, dark);
          hline(b, 15, 0, 15, C.ink);
          vline(b, 7, 3, 12, dark);
          hline(b, 3, 2, 13, dark);
          hline(b, 12, 2, 13, dark);
        } else {
          b.fill(top);
          hline(b, 3, 0, 15, front);
          if (f.n) {
            hline(b, 0, 0, 15, C.ink);
            hline(b, 1, 0, 15, C.white);
          }
        }
        break;
      }
      case 'bench': {
        if (f.s) {
          b.fill(C.metal);
          hline(b, 0, 0, 15, C.metalDark);
          rect(b, 2, 3, 13, 12, C.metalDark);
          rect(b, 3, 4, 12, 11, C.metal);
          hline(b, 7, 3, 12, C.metalDark);
          b.set(7, 6, C.metalDark);
          b.set(8, 6, C.metalDark);
          hline(b, 15, 0, 15, C.ink);
        } else {
          b.fill(C.white);
          if (f.n) {
            hline(b, 0, 0, 15, C.ink);
          }
          if (f.col % 2 === 0) {
            // a beaker
            rect(b, 5, 5, 8, 11, C.metalDark);
            rect(b, 6, 7, 7, 10, C.green);
            b.set(6, 5, C.white);
          } else {
            // papers
            rect(b, 4, 6, 11, 11, C.tileFloorLine);
            hline(b, 8, 5, 10, C.metalDark);
          }
        }
        break;
      }
      case 'shelf': {
        b.fill(C.woodDark);
        rect(b, 1, 1, 14, 14, C.wood);
        books(b, 2, 7, f.col * 3 + (f.s ? 1 : 0));
        hline(b, 8, 1, 14, C.woodDark);
        books(b, 9, 14, f.col * 5 + (f.s ? 2 : 4));
        if (f.n) {
          hline(b, 0, 0, 15, C.ink);
        }
        if (f.s) {
          hline(b, 15, 0, 15, C.ink);
        }
        break;
      }
      case 'crates': {
        b.fill(C.woodDark);
        rect(b, 1, 1, 14, 14, C.wood);
        rect(b, 2, 2, 13, 13, C.woodLight);
        for (let i = 0; i < 12; i += 1) {
          b.set(2 + i, 2 + i, C.woodDark);
          b.set(13 - i, 2 + i, C.woodDark);
        }
        hline(b, 15, 0, 15, C.ink);
        break;
      }
      case 'planter': {
        if (f.s) {
          b.fill(C.brickShade);
          hline(b, 0, 0, 15, C.brickLine);
          hline(b, 1, 0, 15, C.brick);
          hline(b, 15, 0, 15, C.ink);
          vline(b, 0, 0, 15, C.brickLine);
          vline(b, 15, 0, 15, C.brickLine);
        } else {
          b.fill(C.bankDark);
        }
        const leaves = ascii(
          [
            '................',
            '...LL......LL...',
            '..LllL....LllL..',
            '.Ll..lL..Ll..lL.',
            '.L....LLLL....L.',
            '......LllL......',
            '.....Ll..lL.....',
            '....Ll....lL....',
            '....L......L....',
            '................',
          ],
          { L: C.leafDark, l: C.leafLight },
          'planter',
        );
        b.blit(leaves, 0, f.s ? -4 : 3);
        break;
      }
      case 'booth': {
        if (f.s) {
          b.fill(C.purpleDark);
          hline(b, 0, 0, 15, C.ink);
          hline(b, 15, 0, 15, C.ink);
          rect(b, 4, 4, 11, 11, C.ink);
          rect(b, 5, 5, 10, 10, C.shadow);
          rect(b, 7, 7, 8, 8, C.purpleLight);
        } else {
          b.fill(C.metalDark);
          hline(b, 0, 0, 15, C.ink);
          rect(b, 3, 4, 12, 13, C.ink);
          rect(b, 5, 6, 10, 11, C.shadow);
          rect(b, 7, 8, 8, 9, C.gold);
        }
        break;
      }
    }
    if (f.w) {
      vline(b, 0, 0, 15, C.ink);
    }
    if (f.e) {
      vline(b, 15, 0, 15, C.ink);
    }
    return b;
  });
}
