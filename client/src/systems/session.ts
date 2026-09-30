export interface GameSession {
  sessionId: string;
  authToken: string;
  claimCode: string;
}

let current: GameSession | null = null;

export function setGameSession(session: GameSession): void {
  current = session;
}

export function getGameSession(): GameSession | null {
  return current;
}
