/**
 * World palette — soft Game Boy Color tones in the spirit of New Bark Town
 * (pale speckled ground, fresh greens, lavender water) with Cashu purple kept
 * as the accent that ties the world to the UI.
 */
export const C = {
  // universal outline: a deep purple-black instead of pure black keeps it soft
  ink: 0x2a1f3d,
  shadow: 0x4a3f5e,
  white: 0xfcfcf4,

  // ground
  ground: 0xeef0d6,
  groundDot: 0xd2dab4,
  groundEdge: 0xc6d0a2,

  // grass
  grass: 0xb4dc88,
  grassBlade: 0x7fb85a,
  grassLight: 0xd4eca8,

  // trees
  leafLight: 0x8ccc5c,
  leaf: 0x5aa040,
  leafDark: 0x357a34,
  leafInk: 0x1c4228,
  trunk: 0x8a5a34,
  trunkDark: 0x5a3820,

  // water (lavender blue, like NBT's pond)
  water: 0x7c8ce8,
  waterLight: 0xaab8fa,
  waterDark: 0x5a62c4,
  foam: 0xe4eaff,
  bank: 0xa48a5c,
  bankDark: 0x6c5638,
  bankLight: 0xc8b07c,

  // flowers
  petal: 0xf07890,
  petalLight: 0xf8b8c4,
  pollen: 0xf8e070,

  // facades
  wall: 0xf8e8bc,
  wallShade: 0xe2cc94,
  wallDark: 0xb89a64,
  brick: 0xe0967a,
  brickShade: 0xc06a52,
  brickLine: 0x8a4434,
  concrete: 0xd8d4dc,
  concreteShade: 0xb0aabc,
  concreteLine: 0x7e7690,
  clubWall: 0x5e4a86,
  clubShade: 0x483470,
  clubLine: 0x2e2050,
  window: 0xa8d4f8,
  windowLight: 0xe0f2ff,
  windowFrame: 0x506a9c,
  door: 0xb07440,
  doorDark: 0x7a4a24,
  doorLight: 0xd09a60,
  knob: 0xf8d858,

  // interiors
  plank: 0xe2b87c,
  plankShade: 0xc8985c,
  plankLine: 0x9a6c3c,
  tileFloor: 0xeae6f2,
  tileFloorLine: 0xc8c0da,
  carpet: 0x9a6ad0,
  carpetLight: 0xb48ce0,
  carpetDark: 0x74489e,
  darkFloor: 0x3e3456,
  darkFloorLine: 0x2e2644,
  wallpaper: 0xf2e2c4,
  wallpaperStripe: 0xe4cfa6,
  baseboard: 0x9a6c3c,
  wood: 0xc08650,
  woodLight: 0xdca86c,
  woodDark: 0x8a5a30,
  metal: 0xb8bcc8,
  metalDark: 0x7c8094,

  // cashu accents
  purple: 0x7b2fbe,
  purpleLight: 0x9d5fe0,
  purpleDark: 0x4e1a82,
  gold: 0xf8c848,
  goldDark: 0xc08a20,
  red: 0xd8483c,
  redDark: 0x98282a,
  blue: 0x4a7ad8,
  blueDark: 0x2c4c98,
  yellow: 0xf8d848,
  green: 0x4aa84a,
} as const;

export interface RoofColors {
  light: number;
  mid: number;
  dark: number;
  ink: number;
}

export const ROOFS = {
  green: { light: 0xb8e890, mid: 0x7cc460, dark: 0x4a9244, ink: 0x24502c },
  purple: { light: 0xc8a0f4, mid: 0x9a68dc, dark: 0x6a3cb0, ink: 0x341860 },
  red: { light: 0xf6a890, mid: 0xdc6a54, dark: 0xa43c30, ink: 0x541c18 },
  blue: { light: 0xa8ccf6, mid: 0x6a98e0, dark: 0x3e64ac, ink: 0x1c2e5a },
  grey: { light: 0xdcdce4, mid: 0xaaaabc, dark: 0x747488, ink: 0x363648 },
  glass: { light: 0xe4fbf4, mid: 0xb0e8e0, dark: 0x6cb4b0, ink: 0x2c5c5c },
} satisfies Record<string, RoofColors>;

export type RoofStyle = keyof typeof ROOFS;
