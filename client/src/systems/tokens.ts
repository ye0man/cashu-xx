import type { MilestoneId, UnlockResponse } from '@cashu-xx/shared';
import { MILESTONE_LABELS } from '@cashu-xx/shared';
import type { DialogManager } from '../ui/DialogManager';
import type { QRPanel } from '../ui/QRPanel';
import { audio } from './audio';
import { api, ApiError } from './api';
import { earnedMilestones, hasFlag, setFlag, STORY_FLAGS } from './quests';
import { getGameSession } from './session';

export interface TokenResult {
  token: string | null;
  offline: boolean;
  reclaimed?: boolean;
  combined?: boolean;
}

export interface ClaimUI {
  scene: Phaser.Scene;
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
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.code === 'reclaimed' || err.code === 'combined')) {
      return { token: null, offline: false, reclaimed: err.code === 'reclaimed', combined: err.code === 'combined' };
    }
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
  } else {
    await ui.dialog.openAsync({ lines: tokenLines(milestoneId, result) });
  }
  if (earnedMilestones().length >= 10 && !hasFlag(STORY_FLAGS.meltHinted)) {
    setFlag(STORY_FLAGS.meltHinted);
    await ui.dialog.openAsync({
      lines: [
        'All 10 tokens accounted for! Prof. Hickory is waiting at the lab.',
        'Talk to him when you’re ready to melt them — that’s how this story ends.',
      ],
    });
  }
}

/** Merge every unlocked milestone token into a single spendable token. */
export async function combineUnlockedTokens(ui: ClaimUI): Promise<void> {
  const session = getGameSession();
  const earned = earnedMilestones();
  if (!session) {
    await ui.dialog.openAsync({ lines: ['No session found — refresh the page and recover with your Trainer ID.'] });
    return;
  }
  if (earned.length === 0) {
    await ui.dialog.openAsync({ lines: ['You have no unlocked tokens yet. Earn some milestones first!'] });
    return;
  }
  ui.showToast('Combining tokens...');
  try {
    const result = await api.combine(session.sessionId, earned);
    audio.playSfx('sfx-token');
    if (result.skippedRedeemed > 0) {
      await ui.dialog.openAsync({
        lines: [
          `${result.skippedRedeemed} token(s) were already spent in your wallet, so they stay there.`,
          `${result.combinedCount} token(s) became one token worth ${result.amountSats} sats.`,
        ],
      });
    }
    await ui.qr.open(
      `TOKEN — COMBINED — ${result.amountSats} SATS`,
      result.token,
      'Z close (save for later) · C copy token',
    );
  } catch (err) {
    await ui.dialog.openAsync({
      lines: [
        `Combine failed: ${(err as ApiError).message}`,
        'The mint is best-effort — tell the receptionist to try again in a moment.',
      ],
    });
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
  if (result.combined) {
    return [
      `TOKEN COMBINED — ${label}.`,
      'You combined this one at Minibits HQ — its sats live in your single combined token.',
    ];
  }
  if (result.reclaimed) {
    return [
      `TOKEN WITHDRAWN — ${label}.`,
      'The operator reclaimed these sats, so this token is no longer claimable. Sorry!',
    ];
  }
  return [`TOKEN UNLOCKED — ${label} — 10 sats.`, 'Ask the receptionist at Minibits HQ to display it.'];
}
