export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';

export interface Settings {
  textSpeed: TextSpeed;
  muted: boolean;
}

export const TEXT_SPEED_MS: Record<TextSpeed, number> = {
  slow: 36,
  normal: 18,
  fast: 8,
  instant: 0,
};

export const TEXT_SPEED_ORDER: TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];

const SETTINGS_KEY = 'cashu-xx.settings.v1';

let current: Settings = { textSpeed: 'normal', muted: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (parsed.textSpeed && parsed.textSpeed in TEXT_SPEED_MS) {
        current.textSpeed = parsed.textSpeed;
      }
      if (typeof parsed.muted === 'boolean') {
        current.muted = parsed.muted;
      }
    }
  } catch {
    current = { textSpeed: 'normal', muted: false };
  }
  return current;
}

export function getSettings(): Settings {
  return current;
}

export function setTextSpeed(speed: TextSpeed): void {
  current.textSpeed = speed;
  persist();
}

export function cycleTextSpeed(): TextSpeed {
  const index = TEXT_SPEED_ORDER.indexOf(current.textSpeed);
  current.textSpeed = TEXT_SPEED_ORDER[(index + 1) % TEXT_SPEED_ORDER.length];
  persist();
  return current.textSpeed;
}

export function setMuted(muted: boolean): void {
  current.muted = muted;
  persist();
}

export function toggleMuted(): boolean {
  current.muted = !current.muted;
  persist();
  return current.muted;
}

function persist(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // settings are best-effort
  }
}
