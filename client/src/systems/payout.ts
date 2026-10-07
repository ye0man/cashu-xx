import type { MeltResponse, PayoutPreviewResponse, PayoutTokenResponse } from '@cashu-xx/shared';
import { api } from './api';
import { earnedMilestones } from './quests';
import { getGameSession } from './session';

export interface MeltDestination {
  kind: 'address' | 'invoice';
  value: string;
}

const DEST_KEY = 'cashu-xx.meltDestination.v1';

function classify(value: string): MeltDestination['kind'] | null {
  const v = value.trim();
  if (/^(lightning:)?ln(bc|tb|bcrt)[0-9a-z]+$/i.test(v)) {
    return 'invoice';
  }
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
    return 'address';
  }
  return null;
}

export function loadMeltDestination(): MeltDestination | null {
  try {
    const raw = globalThis.localStorage?.getItem(DEST_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<MeltDestination>;
    if (parsed.kind === 'address' && typeof parsed.value === 'string') {
      return { kind: parsed.kind, value: parsed.value };
    }
    return null;
  } catch {
    return null;
  }
}

function saveMeltDestination(destination: MeltDestination): void {
  // A bolt11 invoice is single-use; only a Lightning address is worth remembering.
  if (destination.kind !== 'address') {
    return;
  }
  try {
    globalThis.localStorage?.setItem(DEST_KEY, JSON.stringify(destination));
  } catch {
    // storage unavailable — the destination just won't be remembered
  }
}

/** Asks for a Lightning address or bolt11 invoice (pre-filled with the last address used). */
export function promptDestination(sats: number): MeltDestination | null {
  const remembered = loadMeltDestination();
  const input = window.prompt(
    `Where should your ${sats} sats go?\n\nLightning address (you@wallet.com) or bolt11 invoice:`,
    remembered?.value ?? '',
  );
  if (!input) {
    return null;
  }
  const value = input.trim().replace(/^lightning:/i, '');
  const kind = classify(value);
  if (!kind) {
    return null;
  }
  const destination = { kind, value };
  saveMeltDestination(destination);
  return destination;
}

function sessionId(): string {
  const session = getGameSession();
  if (!session) {
    throw new Error('No session found — recover with your Trainer ID from the title screen.');
  }
  return session.sessionId;
}

/**
 * Re-send every locally earned milestone before paying out. Unlocks are
 * idempotent on the server, and a find made while the server was unreachable
 * would otherwise be missing from the payout.
 */
async function syncEarned(id: string): Promise<void> {
  await Promise.allSettled(earnedMilestones().map((milestoneId) => api.unlock(id, milestoneId)));
}

export async function payoutPreview(): Promise<PayoutPreviewResponse> {
  const id = sessionId();
  await syncEarned(id);
  return api.payoutPreview(id);
}

/** Issues (or re-shows) the one combined token holding every earned sat. */
export async function payoutToken(): Promise<PayoutTokenResponse> {
  const id = sessionId();
  await syncEarned(id);
  return api.payoutToken(id);
}

/** Pays the earned sats to Lightning instead (an unredeemed token is taken back first). */
export async function meltTo(destination: MeltDestination): Promise<MeltResponse> {
  const id = sessionId();
  await syncEarned(id);
  return api.melt(id, destination.value);
}
