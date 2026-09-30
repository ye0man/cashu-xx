export const PALETTE: Record<string, number> = {
  ink: 0x120a24,
  deepPurple: 0x1e1036,
  purple: 0x7b2fbe,
  lilac: 0x9d5fe0,
  cream: 0xe8c9a0,
  creamLight: 0xf7e7cf,
  tan: 0xc9a87c,
  brown: 0x8a6a4a,
  brick: 0xc4453c,
  brickDark: 0x8e2f2a,
  moss: 0x5a9c4e,
  mossDark: 0x2f6b34,
  water: 0x4a90c4,
  waterDark: 0x2c5f8a,
  greyWarm: 0x6b6478,
  greyLight: 0xb0a8bd,
};

export const PALETTE_HEX: number[] = Object.values(PALETTE);

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: number): Rgb {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

export function snapToPaletteColor(r: number, g: number, b: number): Rgb {
  let best = hexToRgb(PALETTE_HEX[0]);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hex of PALETTE_HEX) {
    const candidate = hexToRgb(hex);
    const distance = (candidate.r - r) ** 2 + (candidate.g - g) ** 2 + (candidate.b - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}
