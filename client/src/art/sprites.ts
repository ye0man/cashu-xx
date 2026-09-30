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
 * XX is the Cashu logo: a cashew crescent lit from the right, darker bands down
 * the left edge, a small notch above the knob, a cream highlight on the knob
 * and the pixel "deal with it" shades. Outline in warm brown so the tan body
 * holds its shape on the pale ground.
 */
const HERO_LEGEND: Legend = {
  o: 0x5a3a22,
  L: 0xecd6b0,
  M: 0xdcbf94,
  D: 0xc8a473,
  S: 0xae8657,
  W: 0xfaf4e6,
  K: 0x141018,
  w: 0xfcfcfc,
};

const HERO_BODY = [
  '....oooooooo....',
  '...oMLLLLLLLoo..',
  '..oDMLLLLLLLLLo.',
  '..oDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMLLLLLLLLLo.',
  '.oSDMMLLLLLLLLo.',
  '.oSDMMLLLLLLLo..',
  '.oSDDMLLLLLLo...',
  '.oSDDMMLLLLLo...',
  '.oSDDMMLLLLWWoo.',
  '.oSSDDMMLLLLLLLo',
  '.oSSDDMMMLLLLLLo',
  '..oSSDDMMMMLLLo.',
  '..oSSSDDDMMMMo..',
  '...ooSSSDDDoo...',
  '.....oooooo.....',
];

const SHADES_FRONT = ['KKKKKKKKKKKKKKK.', '.KwKwKK..KwKwKK.', '..KwKK....KwKK..'];
const SHADES_SIDE = ['....KKKKKKKKKKKK', '.........KwKwKKK', '..........KwKKK.'];
const SHADES_BACK = ['.KK..........KK.'];
const SHADES_Y = 5;

const FEET = {
  stand: { left: 22, right: 22 },
  stepA: { left: 22, right: 21 },
  stepB: { left: 21, right: 22 },
} as const;

const FOOT = ['oSo', 'ooo'];

type HeroFacing = 'down' | 'up' | 'right';
type HeroPose = keyof typeof FEET;

function heroFrame(facing: HeroFacing, pose: HeroPose): Bitmap {
  const frame = new Bitmap(SPRITE_W, SPRITE_H);
  const foot = ascii(FOOT, HERO_LEGEND, 'hero-foot');
  const feet = FEET[pose];
  frame.blit(foot, 4, feet.left);
  frame.blit(foot, 9, feet.right);

  let body = ascii(HERO_BODY, HERO_LEGEND, 'hero-body');
  let shades = SHADES_FRONT;
  if (facing === 'up') {
    body = body.flipX();
    shades = SHADES_BACK;
  } else if (facing === 'right') {
    shades = SHADES_SIDE;
  }
  body.blit(ascii(shades, HERO_LEGEND, `hero-shades-${facing}`), 0, SHADES_Y);
  const bob = pose === 'stand' ? 1 : 0;
  frame.blit(body, 0, bob);
  return frame;
}

export const HERO_FACINGS: readonly HeroFacing[] = ['down', 'up', 'right'];
export const HERO_POSES: readonly HeroPose[] = ['stand', 'stepA', 'stepB'];

/** Frame order: facing-major, pose-minor → index = facing * 3 + pose. */
export function heroFrames(): Bitmap[] {
  return HERO_FACINGS.flatMap((facing) => HERO_POSES.map((pose) => heroFrame(facing, pose)));
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
