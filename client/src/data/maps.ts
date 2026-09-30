import type { MilestoneId } from '@cashu-xx/shared';
import type { Direction } from '../systems/movement';

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DoorDef {
  x: number;
  y: number;
  targetMap: string;
  targetX: number;
  targetY: number;
  facing?: Direction;
}

export interface SignSpot {
  x: number;
  y: number;
  signId: string;
}

export interface NpcSpot {
  x: number;
  y: number;
  npcId: string;
}

export interface PickupSpot {
  x: number;
  y: number;
  id: string;
  flag: string;
  milestoneId?: MilestoneId;
}

export interface MapDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  walls: WallRect[];
  water: WallRect[];
  doors: DoorDef[];
  signs: SignSpot[];
  npcs: NpcSpot[];
  pickups: PickupSpot[];
  spawn: { x: number; y: number };
  outdoor: boolean;
}

function borderWalls(cols: number, rows: number, t: number): WallRect[] {
  return [
    { x: 0, y: 0, w: cols, h: t },
    { x: 0, y: rows - t, w: cols, h: t },
    { x: 0, y: 0, w: t, h: rows },
    { x: cols - t, y: 0, w: t, h: rows },
  ];
}

function signPosts(signs: SignSpot[]): WallRect[] {
  return signs.map((spot) => ({ x: spot.x, y: spot.y, w: 1, h: 1 }));
}

const OVERWORLD_SIGNS: SignSpot[] = [
  { x: 31, y: 11, signId: 'sign-welcome' },
  { x: 38, y: 25, signId: 'sign-tower' },
  { x: 28, y: 25, signId: 'sign-placeholder' },
  { x: 14, y: 22, signId: 'sign-reviews' },
  { x: 6, y: 22, signId: 'sign-rfc2119' },
  { x: 20, y: 25, signId: 'sign-proof' },
  { x: 25, y: 31, signId: 'sign-blind' },
  { x: 14, y: 5, signId: 'sign-swap' },
  { x: 52, y: 23, signId: 'sign-two-impls' },
  { x: 24, y: 22, signId: 'sign-trash-hint' },
  { x: 26, y: 44, signId: 'sign-kimi-hint' },
  { x: 20, y: 5, signId: 'sign-canal' },
  { x: 35, y: 44, signId: 'sign-u-bahn' },
  { x: 46, y: 24, signId: 'sign-mint-info' },
];

const OVERWORLD: MapDef = {
  id: 'nussstadt',
  name: 'NUSSSTADT',
  cols: 64,
  rows: 48,
  outdoor: true,
  spawn: { x: 24, y: 25 },
  water: [
    { x: 2, y: 6, w: 28, h: 4 },
    { x: 34, y: 6, w: 28, h: 4 },
  ],
  walls: [
    ...borderWalls(64, 48, 2),
    { x: 6, y: 14, w: 9, h: 8 },
    { x: 18, y: 14, w: 9, h: 8 },
    { x: 44, y: 12, w: 12, h: 11 },
    { x: 5, y: 2, w: 9, h: 2 },
    { x: 18, y: 2, w: 9, h: 2 },
    { x: 44, y: 30, w: 10, h: 8 },
    { x: 12, y: 34, w: 9, h: 8 },
    { x: 28, y: 38, w: 8, h: 5 },
    { x: 34, y: 26, w: 4, h: 4 },
    { x: 5, y: 29, w: 8, h: 5 },
    { x: 54, y: 28, w: 7, h: 6 },
    ...signPosts(OVERWORLD_SIGNS),
  ],
  doors: [
    { x: 10, y: 21, targetMap: 'lab', targetX: 7, targetY: 9, facing: 'up' },
    { x: 22, y: 21, targetMap: 'cafe', targetX: 7, targetY: 9, facing: 'up' },
    { x: 49, y: 22, targetMap: 'minibits-hq', targetX: 8, targetY: 10, facing: 'up' },
    { x: 9, y: 3, targetMap: 'rusty-workshop', targetX: 6, targetY: 8, facing: 'up' },
    { x: 22, y: 3, targetMap: 'palm-house', targetX: 6, targetY: 8, facing: 'up' },
    { x: 48, y: 37, targetMap: 'library', targetX: 7, targetY: 9, facing: 'up' },
    { x: 16, y: 41, targetMap: 'club', targetX: 6, targetY: 8, facing: 'up' },
    { x: 31, y: 42, targetMap: 'hideout', targetX: 6, targetY: 7, facing: 'up' },
  ],
  signs: OVERWORLD_SIGNS,
  npcs: [
    { x: 22, y: 27, npcId: 'civ-doner' },
    { x: 33, y: 44, npcId: 'civ-commuter' },
  ],
  pickups: [
    { x: 23, y: 13, id: 'hidden-pos', flag: 'hidden-pos', milestoneId: 'hidden-pos' },
    { x: 35, y: 25, id: 'hidden-tower', flag: 'hidden-tower', milestoneId: 'hidden-tower' },
  ],
};

const LAB: MapDef = {
  id: 'lab',
  name: "HICKORY'S LAB",
  cols: 14,
  rows: 11,
  outdoor: false,
  spawn: { x: 7, y: 9 },
  water: [],
  walls: [
    ...borderWalls(14, 11, 1),
    { x: 4, y: 4, w: 4, h: 2 },
    { x: 10, y: 2, w: 3, h: 2 },
  ],
  doors: [{ x: 7, y: 10, targetMap: 'nussstadt', targetX: 10, targetY: 22, facing: 'down' }],
  signs: [
    { x: 3, y: 0, signId: 'sign-chalkboard' },
    { x: 11, y: 3, signId: 'sign-lab-shelf' },
  ],
  npcs: [{ x: 5, y: 3, npcId: 'hickory' }],
  pickups: [],
};

const CAFE: MapDef = {
  id: 'cafe',
  name: 'CAFE MINT',
  cols: 14,
  rows: 11,
  outdoor: false,
  spawn: { x: 7, y: 9 },
  water: [],
  walls: [...borderWalls(14, 11, 1), { x: 2, y: 3, w: 10, h: 2 }],
  doors: [{ x: 7, y: 10, targetMap: 'nussstadt', targetX: 22, targetY: 22, facing: 'down' }],
  signs: [
    { x: 9, y: 4, signId: 'sign-pos' },
    { x: 2, y: 0, signId: 'sign-cafe-menu' },
    { x: 11, y: 0, signId: 'sign-cafe-wifi' },
  ],
  npcs: [],
  pickups: [{ x: 2, y: 8, id: 'pickup-record', flag: 'record_found' }],
};

const MINIBITS_HQ: MapDef = {
  id: 'minibits-hq',
  name: 'MINIBITS HQ',
  cols: 16,
  rows: 12,
  outdoor: false,
  spawn: { x: 8, y: 10 },
  water: [],
  walls: [...borderWalls(16, 12, 1), { x: 4, y: 3, w: 8, h: 2 }],
  doors: [{ x: 8, y: 11, targetMap: 'nussstadt', targetX: 49, targetY: 23, facing: 'down' }],
  signs: [
    { x: 7, y: 4, signId: 'sign-hq-reception' },
    { x: 2, y: 0, signId: 'sign-hq-motd' },
    { x: 13, y: 0, signId: 'sign-hq-beta' },
  ],
  npcs: [{ x: 8, y: 2, npcId: 'receptionist' }],
  pickups: [],
};

const RUSTY_WORKSHOP: MapDef = {
  id: 'rusty-workshop',
  name: 'RUSTY’S WORKSHOP',
  cols: 13,
  rows: 10,
  outdoor: false,
  spawn: { x: 6, y: 8 },
  water: [],
  walls: [...borderWalls(13, 10, 1), { x: 2, y: 2, w: 3, h: 2 }],
  doors: [{ x: 6, y: 9, targetMap: 'nussstadt', targetX: 9, targetY: 4, facing: 'down' }],
  signs: [
    { x: 3, y: 3, signId: 'sign-workshop-crates' },
    { x: 8, y: 0, signId: 'sign-workshop-swap' },
  ],
  npcs: [{ x: 4, y: 6, npcId: 'rusty' }],
  pickups: [],
};

const PALM_HOUSE: MapDef = {
  id: 'palm-house',
  name: 'PALM HOUSE',
  cols: 13,
  rows: 10,
  outdoor: false,
  spawn: { x: 6, y: 8 },
  water: [],
  walls: [...borderWalls(13, 10, 1), { x: 8, y: 2, w: 3, h: 2 }],
  doors: [{ x: 6, y: 9, targetMap: 'nussstadt', targetX: 22, targetY: 4, facing: 'down' }],
  signs: [
    { x: 9, y: 3, signId: 'sign-palm-coconuts' },
    { x: 3, y: 0, signId: 'sign-palm-types' },
  ],
  npcs: [{ x: 4, y: 4, npcId: 'coco' }],
  pickups: [],
};

const LIBRARY: MapDef = {
  id: 'library',
  name: 'SHELL LIBRARY',
  cols: 14,
  rows: 11,
  outdoor: false,
  spawn: { x: 7, y: 9 },
  water: [],
  walls: [
    ...borderWalls(14, 11, 1),
    { x: 2, y: 3, w: 4, h: 2 },
    { x: 8, y: 3, w: 4, h: 2 },
  ],
  doors: [{ x: 7, y: 10, targetMap: 'nussstadt', targetX: 48, targetY: 38, facing: 'down' }],
  signs: [
    { x: 3, y: 4, signId: 'sign-library-shh' },
    { x: 9, y: 4, signId: 'sign-library-nutshell' },
  ],
  npcs: [{ x: 6, y: 2, npcId: 'pip' }],
  pickups: [{ x: 11, y: 8, id: 'hidden-library', flag: 'hidden-library', milestoneId: 'hidden-library' }],
};

const CLUB: MapDef = {
  id: 'club',
  name: 'DJ MAC’S CLUB',
  cols: 13,
  rows: 10,
  outdoor: false,
  spawn: { x: 6, y: 8 },
  water: [],
  walls: [...borderWalls(13, 10, 1), { x: 8, y: 2, w: 3, h: 2 }],
  doors: [{ x: 6, y: 9, targetMap: 'nussstadt', targetX: 16, targetY: 42, facing: 'down' }],
  signs: [
    { x: 9, y: 3, signId: 'sign-club-tonight' },
    { x: 3, y: 0, signId: 'sign-club-cover' },
  ],
  npcs: [{ x: 7, y: 5, npcId: 'djmac' }],
  pickups: [{ x: 10, y: 4, id: 'hidden-booth', flag: 'hidden-booth', milestoneId: 'hidden-booth' }],
};

const HIDEOUT: MapDef = {
  id: 'hideout',
  name: 'KIMI’S HIDEOUT',
  cols: 12,
  rows: 9,
  outdoor: false,
  spawn: { x: 6, y: 7 },
  water: [],
  walls: [...borderWalls(12, 9, 1), { x: 2, y: 2, w: 3, h: 2 }],
  doors: [{ x: 6, y: 8, targetMap: 'nussstadt', targetX: 31, targetY: 43, facing: 'down' }],
  signs: [
    { x: 3, y: 3, signId: 'sign-hideout-wanted' },
    { x: 8, y: 0, signId: 'sign-hideout-htlc' },
  ],
  npcs: [{ x: 7, y: 5, npcId: 'kimi' }],
  pickups: [],
};

export const MAPS: Record<string, MapDef> = {
  nussstadt: OVERWORLD,
  lab: LAB,
  cafe: CAFE,
  'minibits-hq': MINIBITS_HQ,
  'rusty-workshop': RUSTY_WORKSHOP,
  'palm-house': PALM_HOUSE,
  library: LIBRARY,
  club: CLUB,
  hideout: HIDEOUT,
};

export function inRect(rect: WallRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function doorAt(map: MapDef, x: number, y: number): DoorDef | null {
  return map.doors.find((door) => door.x === x && door.y === y) ?? null;
}

export function signAt(map: MapDef, x: number, y: number): SignSpot | null {
  return map.signs.find((spot) => spot.x === x && spot.y === y) ?? null;
}

export function npcAt(map: MapDef, x: number, y: number): NpcSpot | null {
  return map.npcs.find((spot) => spot.x === x && spot.y === y) ?? null;
}

export function pickupAt(map: MapDef, x: number, y: number): PickupSpot | null {
  return map.pickups.find((spot) => spot.x === x && spot.y === y) ?? null;
}

export function isWalkable(map: MapDef, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) {
    return false;
  }
  if (doorAt(map, x, y)) {
    return true;
  }
  if (map.walls.some((rect) => inRect(rect, x, y))) {
    return false;
  }
  if (map.water.some((rect) => inRect(rect, x, y))) {
    return false;
  }
  return npcAt(map, x, y) === null && pickupAt(map, x, y) === null;
}
