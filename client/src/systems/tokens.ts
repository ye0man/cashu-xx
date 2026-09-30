import type { MilestoneId, UnlockResponse } from '@cashu-xx/shared';
import { MILESTONE_LABELS } from '@cashu-xx/shared';
import type { DialogManager } from '../ui/DialogManager';
import type { QRPanel } from '../ui/QRPanel';
import { audio } from './audio';
import { api } from './api';
import { setFlag } from './quests';
import { getGameSession } from './session';

export interface TokenResult {
  token: string | null;
  offline: boolean;
}

export interface ClaimUI {
  dialog: DialogManager;
  qr: QRPanel;
  showToast: (message: string) => void;
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

export async function showTokenClaim(ui: ClaimUI, milestoneId: MilestoneId): Promise<void> {
  const result = await unlockMilestone(milestoneId);
  const label = MILESTONE_LABELS[milestoneId];
  if (result.token) {
    ui.showToast('Token unlocked!');
    audio.playSfx('sfx-token');
    await ui.qr.open(
      `TOKEN — ${label} — 10 SATS`,
      result.token,
      'Z close (save for later) · C copy token',
    );
    return;
  }
  await ui.dialog.openAsync({ lines: tokenLines(milestoneId, result) });
}

export function tokenLines(milestoneId: MilestoneId, result: TokenResult): string[] {
  const label = MILESTONE_LABELS[milestoneId];
  if (result.token) {
    return [
      `TOKEN UNLOCKED — ${label} — 10 sats.`,
      `Claim it in any cashu wallet: ${result.token.slice(0, 42)}...`,
    ];
  }
  return [`TOKEN UNLOCKED — ${label} — 10 sats.`, 'Ask the receptionist at Minibits HQ to display it.'];
}
