import type { MilestoneId } from '@cashu-xx/shared';
import { MILESTONE_LABELS } from '@cashu-xx/shared';
import type { DialogManager } from '../ui/DialogManager';
import { audio } from './audio';
import { api, ApiError } from './api';
import { earnedMilestones, hasFlag, setFlag, STORY_FLAGS } from './quests';
import { getGameSession } from './session';

export interface TokenResult {
  /** The server ledger recorded the milestone. */
  recorded: boolean;
  offline: boolean;
  reclaimed?: boolean;
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
    return { recorded: false, offline: true };
  }
  try {
    await api.unlock(session.sessionId, milestoneId);
    return { recorded: true, offline: false };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.code === 'reclaimed')) {
      return { recorded: false, offline: false, reclaimed: true };
    }
    return { recorded: false, offline: true };
  }
}

export async function showTokenClaim(ui: ClaimUI, milestoneId: MilestoneId): Promise<void> {
  const result = await unlockMilestone(milestoneId);
  if (result.recorded) {
    ui.showToast('Token found! +10 sats');
    audio.playSfx('sfx-token');
  }
  await ui.dialog.openAsync({ lines: tokenLines(milestoneId, result) });
  if (earnedMilestones().length >= 10 && !hasFlag(STORY_FLAGS.meltHinted)) {
    setFlag(STORY_FLAGS.meltHinted);
    await ui.dialog.openAsync({
      lines: [
        'All 10 tokens accounted for! Prof. Hickory is waiting at the lab.',
        'He bundles them into one cashu token for you — that’s how this story ends.',
      ],
    });
  }
}

export function tokenLines(milestoneId: MilestoneId, result: TokenResult): string[] {
  const label = MILESTONE_LABELS[milestoneId];
  if (result.reclaimed) {
    return [
      `TOKEN WITHDRAWN — ${label}.`,
      'These sats were already paid out or reclaimed, so this token no longer counts.',
    ];
  }
  if (result.recorded) {
    return [
      `TOKEN FOUND — ${label}.`,
      'It joins your stash. At the end Prof. Hickory bundles every token into one you can scan.',
    ];
  }
  return [
    `TOKEN FOUND — ${label}.`,
    'The mint server is unreachable right now — your find is saved and syncs when it’s back.',
  ];
}
