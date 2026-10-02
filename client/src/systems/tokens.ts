import type { MilestoneId, UnlockResponse } from '@cashu-xx/shared';
import { MILESTONE_LABELS } from '@cashu-xx/shared';
import type { DialogManager } from '../ui/DialogManager';
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
    ui.showToast('Token secured!');
    audio.playSfx('sfx-token');
    await ui.dialog.openAsync({
      lines: [
        `TOKEN SECURED — ${label}.`,
        'Cash out with Prof. Hickory whenever you like — he melts your sats straight to your Lightning wallet.',
      ],
    });
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

export function tokenLines(milestoneId: MilestoneId, result: TokenResult): string[] {
  const label = MILESTONE_LABELS[milestoneId];
  if (result.token) {
    return [`TOKEN SECURED — ${label}.`];
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
      'These sats were already paid out or reclaimed, so this token is no longer claimable.',
    ];
  }
  return [
    `TOKEN SECURED — ${label}.`,
    'Your sats are held until you cash out with Prof. Hickory.',
  ];
}
