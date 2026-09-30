import { ascii, Bitmap, type Legend } from './bitmap';
import { C } from './palette';

/**
 * Hand-drawn character and prop sprites. Every sprite is 16×24 (characters) or
 * 16×16 (props) with a fully transparent background and a dark outline, so it
 * sits cleanly on any tile.
 */
export const SPRITE_W = 16;
export const SPRITE_H = 24;
const EMPTY = '................';

function padTop(rows: readonly string[], height: number): string[] {
  const pad = Array.from({ length: Math.max(0, height - rows.length) }, () => EMPTY);
  return [...pad, ...rows];
}

function character(rows: readonly string[], legend: Legend, name: string): Bitmap {
  return ascii(padTop(rows, SPRITE_H), { o: C.ink, ...legend }, name);
}

// ---------------------------------------------------------------- hero (XX)

/**
 * XX *is* the Cashu logo. `LOGO_NUT` is the logo's own pixel grid (sampled from
 * the cashubtc avatar: 14×16 cells), colours included — a crescent with the
 * deep inner curve on the right, dark bands down the left edge, a light rim, and
 * the bright highlight on the toe. Only the shades differ by resolution: the
 * logo draws them on a half-cell grid, so the sprite gets a 1:1 approximation
 * and the title screen gets the full half-cell version (`logoArt`).
 */
const LOGO_LEGEND: Legend = {
  b: 0xba9663,
  c: 0xe3d3b5,
  d: 0xb08c5b,
  e: 0xc6a980,
  f: 0xdcc099,
  g: 0xc3a67d,
  W: 0xf8f8f0,
  K: 0x100c14,
  w: 0xffffff,
};

const LOGO_NUT = [
  '..bbccccc.....',
  '.deefffffc....',
  'dgeffffffc....',
  'dgeffffffc....',
  'dgefffffc.....',
  'dgefffffc.....', // behind the shades
  'dgefffffc.....', // behind the shades
  'dgefffffc.....',
  'dgeeffffc.....',
  'dgeefffffccc..',
  'dgeeeeffffWWc.',
  '.dgeeeeffffffc',
  '.dgeeeeefffffc',
  '..dgeeeeeeeeec',
  '...dggeeeeeeb.',
  '....ddbbbbbb..',
];
const SHADES_ROW = 5;

const SHADES_FRONT = ['KKKKKKKKKKK...', 'KwKKK.KwKKK...', '.KwK...KwK....'];
const SHADES_SIDE = ['..KKKKKKKKK...', '......KwKKK...', '.......KwK....'];

/** Half-cell shades from the logo, drawn over the 2× nut on the title screen. */
const LOGO_SHADES_HI = [
  'KKKKKKKKKKKKKKKKKKKK',
  'KwKwKKKKK..KwKwKKKKK',
  '.KwKKKKKK..KKwKKKKK.',
  '..KKKKKK....KKKKKK..',
];

const HERO_OUTLINE = 0x6a4a2c;
const FOOT = ['odo', 'ooo'];

type HeroFacing = 'down' | 'up' | 'right';
type HeroPose = 'stand' | 'stepA' | 'stepB';

const FEET: Record<HeroPose, { left: number; right: number }> = {
  stand: { left: 22, right: 22 },
  stepA: { left: 22, right: 21 },
  stepB: { left: 21, right: 22 },
};

function heroBody(facing: HeroFacing): Bitmap {
  let nut = ascii(LOGO_NUT, LOGO_LEGEND, 'hero-nut');
  if (facing === 'up') {
    nut = nut.flipX();
    // the back of the shades: just the arms at the edges of the head
    for (const y of [SHADES_ROW, SHADES_ROW + 1]) {
      const xs = [...Array(nut.width).keys()].filter((x) => nut.get(x, y) !== null);
      nut.set(xs[0], y, LOGO_LEGEND.K);
      nut.set(xs[xs.length - 1], y, LOGO_LEGEND.K);
    }
  } else {
    const shades = facing === 'right' ? SHADES_SIDE : SHADES_FRONT;
    nut.blit(ascii(shades, LOGO_LEGEND, `hero-shades-${facing}`), 0, SHADES_ROW);
  }
  // pad by one pixel and trace an outline so the light rim reads on pale ground
  const padded = new Bitmap(nut.width + 2, nut.height + 2).blit(nut, 1, 1);
  return padded.outline(HERO_OUTLINE);
}

function heroFrame(facing: HeroFacing, pose: HeroPose): Bitmap {
  const frame = new Bitmap(SPRITE_W, SPRITE_H);
  const foot = ascii(FOOT, { o: HERO_OUTLINE, d: LOGO_LEGEND.d }, 'hero-foot');
  const feet = FEET[pose];
  frame.blit(foot, 5, feet.left);
  frame.blit(foot, 10, feet.right);
  frame.blit(heroBody(facing), 0, 4);
  return frame;
}

export const HERO_FACINGS: readonly HeroFacing[] = ['down', 'up', 'right'];
export const HERO_POSES: readonly HeroPose[] = ['stand', 'stepA', 'stepB'];

/** Frame order: facing-major, pose-minor → index = facing * 3 + pose. */
export function heroFrames(): Bitmap[] {
  return HERO_FACINGS.flatMap((facing) => HERO_POSES.map((pose) => heroFrame(facing, pose)));
}

/** The Cashu logo at 2× the nut grid with the logo's half-cell shades (28×32). */
export function logoArt(): Bitmap {
  const doubled = LOGO_NUT.flatMap((row) => {
    const wide = [...row].map((ch) => ch + ch).join('');
    return [wide, wide];
  });
  const art = ascii(doubled, LOGO_LEGEND, 'logo');
  art.blit(ascii(LOGO_SHADES_HI, LOGO_LEGEND, 'logo-shades'), 0, SHADES_ROW * 2 - 1);
  return art;
}

// ---------------------------------------------------------------- NPCs

const RUSTY = character(
  [
    '.oo..........oo.',
    'oLLo........oLLo',
    'oOLo..o..o..oLOo',
    '.oOo.owo.owo.oOo',
    '..oDooko.okooDo.',
    '...ooOOOOOOOoo..',
    '..oOLLLOOOOOOOo.',
    '.oOLLOOOOOOOOOOo',
    'oOOLOOOOOOOOOOOo',
    'oDOOOOOkkkOOOODo',
    'oDDOOOOOOOOOODDo',
    '.oDDDDDDDDDDDDo.',
    'o.oooooooooooo.o',
    '.o.o.o....o.o.o.',
  ],
  { L: 0xf8a868, O: 0xf07838, D: 0xb84818, k: C.ink, w: C.white },
  'rusty',
);

const COCO = character(
  [
    '.....gg..gg.....',
    '....gGGggGGg....',
    '......gGGg......',
    '.....ooGGoo.....',
    '...ooLLLBBBoo...',
    '..oLLhLBBBBBBo..',
    '.oLhLLBBBBBBBBo.',
    '.oLLBkkBBBkkBBo.',
    'oLhBBkwBBBkwBBBo',
    'oLBBBBBBBBBBBBbo',
    'oBBBBBBkkBBBBBbo',
    'oBhBBBBBBBBBBbbo',
    '.oBBBBBBBBBBbbo.',
    '.obBBBBBBBBbbbo.',
    '..obbBBBBbbbbo..',
    '...oobbbbbboo...',
    '.....oooooo.....',
    '....obo..obo....',
    '....ooo..ooo....',
  ],
  {
    B: 0x8a5a34,
    b: 0x5a3820,
    L: 0xb07a48,
    h: 0xd0a070,
    g: C.leafLight,
    G: C.leafDark,
    k: C.ink,
    w: C.white,
  },
  'coco',
);

const PIP = character(
  [
    '......oooo......',
    '.....oBlBBo.....',
    '....oBlwkBBo....',
    '....oBBBBBBBo...',
    '.....obbBBBBo.r.',
    '......obBBBBorr.',
    '.......obBBo....',
    '.......oBBBo....',
    '......obBBBo....',
    '...ooooBBBBooo..',
    '..oBBBBBBBBBBBo.',
    '.oBlllBBBBBBBBBo',
    '.obBBBBBBBBBBbbo',
    '..oooooooooooo..',
    '.oYYYYYYYYYYYYo.',
    'oYwYYYYYYYYYYYyo',
    'oyYYYYYYYYYYYyyo',
    '.oyyyyyyyyyyyyo.',
    '..oooooooooooo..',
  ],
  {
    B: 0x3a6ec0,
    b: 0x26488a,
    l: 0x7aa8e8,
    Y: 0xf8d040,
    y: 0xc89a20,
    k: C.ink,
    w: C.white,
    r: C.red,
  },
  'pip',
);

const DJMAC = character(
  [
    '.....oppppo.....',
    '...oppooooppo...',
    '..oPoCCCCCCcoPo.',
    '.oPoCCCCCCCCcoPo',
    'oPPCCCCCCCCCcPPo',
    'oppCCkkCCkkCcppo',
    'oppCCCCCCCCCcppo',
    '.ooCCCCkkCCCcoo.',
    '..oCCCCCCCCcco..',
    '..oSSSSSSSSSSo..',
    '.oSsSSSSSSSSsSo.',
    '.oSSsSSSSSSsSSo.',
    '.osSSSSSSSSSSso.',
    '..osssssssssso..',
    '...oooooooooo...',
    '....obo..obo....',
    '....ooo..ooo....',
  ],
  {
    C: 0xf4e4bc,
    c: 0xdcc48e,
    S: 0x8a5a34,
    s: 0x5a3820,
    P: C.purpleLight,
    p: C.purple,
    k: C.ink,
    b: 0xdcc48e,
  },
  'djmac',
);

const KIMI = character(
  [
    '.....oooooo.....',
    '....oRRRRRRo....',
    '...oRLRRRRRro...',
    '..oRLRRRRRRRro..',
    '..oRRokkkkoRro..',
    '..oRokykkykoRro.',
    '.oRRokkkkkkoRro.',
    '.oRRRokkkkoRRro.',
    '.oRRRRooooRRRro.',
    'oRRLRRRRRRRRRrro',
    'oRLRRRRRRRRRRrro',
    'oRLRRRRRRRRRRrro',
    'orRRRRRRRRRRRrro',
    'orrRRRRRRRRRrrro',
    '.oooooooooooooo.',
    '...ogGGo.oGGgo..',
    '...oGGGo.oGGGo..',
    '...ooooo.ooooo..',
  ],
  {
    R: C.red,
    r: C.redDark,
    L: 0xf07868,
    k: 0x1a1424,
    y: 0xf8e070,
    g: 0x7a7090,
    G: 0x5a5070,
  },
  'kimi',
);

const HICKORY = character(
  [
    '.......oo.......',
    '......oNNo......',
    '.....olNNNo.....',
    '....olNNNNNo....',
    '...olNNNNNNno...',
    '..olggggNggggo..',
    '..olgwkgggwkgno.',
    '..olggggNggggno.',
    '..oNNNmmmmNNNno.',
    '...oNNmmmmNNno..',
    '....onNNNNnno...',
    '...owwwoowwwwo..',
    '..owwwWowwwwWwo.',
    '.owwwwWowwwwwWwo',
    '.oNwwwWowwwwwWNo',
    '.onwwwWowwwwwWno',
    '..owwwWowwwwWwo.',
    '..owwwWWWWWWWwo.',
    '..oooooooooooo..',
    '....oko..oko....',
    '....ooo..ooo....',
  ],
  {
    N: 0xc89060,
    n: 0x9a6438,
    l: 0xe0b080,
    g: 0x3a3050,
    w: C.white,
    W: 0xd4d4e2,
    m: 0xb0a8c0,
    k: C.ink,
  },
  'hickory',
);

const RECEPTIONIST = character(
  [
    '.......oo.......',
    '......oAAo......',
    '.....olAAAo.....',
    '....olAAAAAo....',
    '...olAAAAAAao...',
    '...olAkAAkAao...',
    '..holAAAAAAaao..',
    '..hoAAAkkAAaao..',
    '...hoAAAAAaao...',
    '....hooooooo....',
    '...oPPPwwPPPo...',
    '..oPPPPwwPPPPo..',
    '.oPPPPPPPPPPPPo.',
    '.oAPPPPPPPPPPAo.',
    '.oaPPPPPPPPPPao.',
    '..oppppppppppo..',
    '...ogggo.ogggo..',
    '...ooooo.ooooo..',
  ],
  {
    A: 0xdca470,
    a: 0xa87040,
    l: 0xf0c898,
    P: C.purple,
    p: C.purpleDark,
    w: C.white,
    k: C.ink,
    h: 0x3a3050,
    g: 0x5a5070,
  },
  'receptionist',
);

const DONER = character(
  [
    '....oooooooo....',
    '...owwwwwwwwo...',
    '...owwWwwWwwo...',
    '....owwwwwwo....',
    '....oWWWWWWo....',
    '...oNNNNNNNNo...',
    '...oNkNNNNkNo...',
    '...oNNNkkNNno...',
    '....onNNNNno....',
    '...oNwwwwwwNo...',
    '..oNNwwwwwwNNo..',
    '..oNwwwWwwwwNo..',
    '..onwwwwwwwwno..',
    '...onwwwwwwno...',
    '....oooooooo....',
    '....oNo..oNo....',
    '....ooo..ooo....',
  ],
  { w: C.white, W: 0xd4d4e2, N: 0xdcb474, n: 0xa88040, k: C.ink },
  'doner',
);

const COMMUTER = character(
  [
    '....oooooooo....',
    '...obBBBBBBBo...',
    '...obbbbbbbbbbo.',
    '...oUUuUUuUUo...',
    '...oUkUuUkUUo...',
    '...ouUUuUUuUo...',
    '....ouUUUUuo....',
    '...oGGgoogGGo...',
    '..oGGGGggGGGGo..',
    '..oGGGGGgGGGGo..',
    '..oUGGGGgGGGGUo.',
    '..ogGGGGgGGGGgo.',
    '...ogggggggggo..',
    '...okkko.okkko..',
    '...ooooo.ooooo..',
  ],
  {
    U: 0xb08050,
    u: 0x7a5230,
    B: C.blue,
    b: C.blueDark,
    G: 0x9a9ab0,
    g: 0x6a6a84,
    k: 0x3a3050,
  },
  'commuter',
);

/** Texture key → sprite. Keys match `NpcDef.texture`. */
export function npcSprites(): Record<string, Bitmap> {
  return {
    'npc-rusty': RUSTY,
    'npc-coco': COCO,
    'npc-pip': PIP,
    'npc-djmac': DJMAC,
    'npc-kimi': KIMI,
    'npc-hickory': HICKORY,
    'npc-receptionist': RECEPTIONIST,
    'npc-civ-a': DONER,
    'npc-civ-b': COMMUTER,
  };
}

// ---------------------------------------------------------------- props

const PROP_LEGEND: Legend = {
  o: C.ink,
  L: C.woodLight,
  D: C.wood,
  d: C.woodDark,
  s: C.groundEdge,
  W: C.white,
  k: C.shadow,
  G: 0xf8e088,
  Y: C.gold,
  g: C.goldDark,
  P: C.purple,
  w: C.white,
  R: C.red,
};

const SIGN = [
  EMPTY,
  EMPTY,
  '.oooooooooooooo.',
  '.oLLLLLLLLLLLLo.',
  '.oLddddLdddddDo.',
  '.oLLLLLLLLLLLDo.',
  '.oLdddddLdddLDo.',
  '.oDDDDDDDDDDDDo.',
  '.oooooooooooooo.',
  '......oLDo......',
  '......oLDo......',
  '......oLDo......',
  '......oLDo......',
  '.....soooos.....',
  EMPTY,
  EMPTY,
];

const POSTER = [
  EMPTY,
  EMPTY,
  '....ooooRooo....',
  '....oWWWWWWo....',
  '....oWkkkkWo....',
  '....oWWWWWWo....',
  '....oWkkkWWo....',
  '....oWWWWWWo....',
  '....oWkkkkWo....',
  '....oWWWWWWo....',
  '....oooooooo....',
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
];

const NOTE = [
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  '.....oooooo.....',
  '.....oWWWWo.....',
  '.....okkkWo.....',
  '.....oWWWWo.....',
  '.....oooooo.....',
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
  EMPTY,
];

const PICKUP = [
  EMPTY,
  '...........w....',
  '..........www...',
  '......oooo.w....',
  '....ooGGGGoo....',
  '...oGYYYYYYgo...',
  '..oGYYPPPPYYgo..',
  '..oGYPYYYYPYgo..',
  '..oGYPYYYYYYgo..',
  '..oGYPYYYYPYgo..',
  '..oGYYPPPPYYgo..',
  '...ogYYYYYYgo...',
  '....ooggggoo....',
  '......oooo......',
  EMPTY,
  EMPTY,
];

export function propSprites(): Record<string, Bitmap> {
  return {
    sign: ascii(SIGN, PROP_LEGEND, 'sign'),
    poster: ascii(POSTER, PROP_LEGEND, 'poster'),
    note: ascii(NOTE, PROP_LEGEND, 'note'),
    pickup: ascii(PICKUP, PROP_LEGEND, 'pickup'),
  };
}
