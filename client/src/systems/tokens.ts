import type { MilestoneId, UnlockResponse } from '@cashu-xx/shared';
import { MILESTONE_LABELS } from '@cashu-xx/shared';
import { api } from './api';
import { setFlag } from './quests';
import { getGameSession } from './session';

export interface TokenResult {
  token: string | null;
  offline: boolean;
}

export async function unlockMilestone(milestoneId: MilestoneId): Promise<TokenResult> {
  setFlag(milestoneId);
  const session = getGameSession();
  if (!session) {
    return { token: null, offline: true };
  }
  try {
    const result: UnlockResponse = await api.unlock(session.sessionId, milestoneId);
    return { token: result.token, offline: false };
  } catch {
    return { token: null, offline: true };
  }
}

export function tokenLines(milestoneId: MilestoneId, result: TokenResult): string[] {
  const label = MILESTONE_LABELS[milestoneId];
  if (result.token) {
    return [
      `TOKEN UNLOCKED — ${label} — 10 sats.`,
      `Claim it in any cashu wallet: ${result.token.slice(0, 42)}...`,
    ];
  }
  return [`TOKEN UNLOCKED — ${label} — 10 sats.`, 'Claim code pending — the receptionist holds it.'];
}
