export interface GameSession {
  sessionId: string;
  authToken: string;
  claimCode: string;
}

const SESSION_KEY = 'cashu-xx.session.v1';

function read(): GameSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<GameSession>;
    if (typeof parsed?.sessionId !== 'string' || typeof parsed?.authToken !== 'string') {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      authToken: parsed.authToken,
      claimCode: typeof parsed.claimCode === 'string' ? parsed.claimCode : '',
    };
  } catch {
    return null;
  }
}

let current: GameSession | null | undefined;

export function setGameSession(session: GameSession): void {
  current = session;
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable (private mode / tests) — session stays in memory only
  }
}

export function getGameSession(): GameSession | null {
  if (current === undefined) {
    current = read();
  }
  return current;
}

export function clearGameSession(): void {
  current = null;
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
