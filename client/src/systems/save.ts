import type { Direction } from './movement';

export interface SaveState {
  mapId: string;
  tileX: number;
  tileY: number;
  facing: Direction;
  readSigns: string[];
  savedAt: number;
}

const SAVE_KEY = 'cashu-xx.save.v1';

export const worldState = {
  readSigns: new Set<string>(),
};

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadSave(): SaveState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as SaveState;
    if (typeof parsed?.mapId !== 'string' || typeof parsed?.tileX !== 'number') {
      return null;
    }
    worldState.readSigns = new Set(parsed.readSigns ?? []);
    return parsed;
  } catch {
    return null;
  }
}

export function writeSave(position: { mapId: string; tileX: number; tileY: number; facing: Direction }): void {
  const state: SaveState = {
    ...position,
    readSigns: [...worldState.readSigns],
    savedAt: Date.now(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
  worldState.readSigns = new Set();
}
