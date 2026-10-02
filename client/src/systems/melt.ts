import type { MeltPreviewResponse } from '@cashu-xx/shared';
import type { DialogManager } from '../ui/DialogManager';
import { api, type ApiError } from './api';
import { earnedMilestones } from './quests';
import { getGameSession } from './session';

export interface MeltUI {
  dialog: DialogManager;
  showToast: (message: string) => void;
}

export interface MeltDestination {
  kind: 'address' | 'invoice';
  value: string;
}

export interface MeltOutcome {
  receivedSats: number;
  pending: boolean;
}

const DEST_KEY = 'cashu-xx.meltDestination.v1';

function classify(value: string): MeltDestination['kind'] | null {
  const v = value.trim();
  if (/^ln(bc|tb|bcrt)[0-9a-z]+$/i.test(v)) {
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
    if ((parsed.kind === 'address' || parsed.kind === 'invoice') && typeof parsed.value === 'string') {
      return { kind: parsed.kind, value: parsed.value };
    }
    return null;
  } catch {
    return null;
  }
}

function saveMeltDestination(destination: MeltDestination): void {
  try {
    globalThis.localStorage?.setItem(DEST_KEY, JSON.stringify(destination));
  } catch {
    // storage unavailable — the destination just won't be remembered
  }
}

async function promptDestination(availableSats: number): Promise<MeltDestination | null> {
  const input = window.prompt(
    `Where should your ${availableSats} sats go?\n\nLightning address (you@wallet.com) or bolt11 invoice:`,
  );
  if (!input) {
    return null;
  }
  const kind = classify(input);
  if (!kind) {
    return null;
  }
  return { kind, value: input.trim() };
}

/**
 * Melts the session's outstanding tokens to a Lightning address or bolt11
 * invoice. `all` melts every remaining token (the ending); otherwise only the
 * tokens earned so far (an early cash-out).
 */
export async function meltOutstanding(ui: MeltUI, options: { all: boolean }): Promise<MeltOutcome | null> {
  const session = getGameSession();
  if (!session) {
    await ui.dialog.openAsync({ lines: ['No session found — refresh and recover with your Trainer ID.'] });
    return null;
  }

  let preview: MeltPreviewResponse;
  try {
    preview = await api.meltPreview(session.sessionId);
  } catch (err) {
    await ui.dialog.openAsync({ lines: [`Could not check your balance: ${(err as ApiError).message}`] });
    return null;
  }
  if (preview.availableSats <= 0) {
    await ui.dialog.openAsync({
      lines: ['Nothing left to melt — your sats have already gone home.'],
    });
    return null;
  }

  // A bolt11 invoice is single-use, so re-ask at the ending; a Lightning address is reusable.
  let destination = loadMeltDestination();
  if (!destination || (options.all && destination.kind === 'invoice')) {
    destination = await promptDestination(preview.availableSats);
    if (!destination) {
      await ui.dialog.openAsync({ lines: ['No payout address given — nothing was melted.'] });
      return null;
    }
    saveMeltDestination(destination);
  }

  const choice = await ui.dialog.openAsync({
    lines: [
      `I can melt ${preview.availableSats} sats (${preview.bundleCount} token${preview.bundleCount === 1 ? '' : 's'}) minus the mint's fee.`,
      destination.kind === 'address'
        ? `Straight to ${destination.value}. Ready?`
        : 'To the invoice you gave me. Ready?',
    ],
    choices: [
      { id: 'melt', label: 'Melt them' },
      { id: 'wait', label: 'Not yet' },
    ],
  });
  if (choice !== 'melt') {
    return null;
  }

  ui.showToast('Melting your sats...');
  const milestoneIds = options.all ? undefined : earnedMilestones();
  try {
    const result = await api.melt(session.sessionId, destination.value, milestoneIds);
    if (result.paid || result.state === 'melted') {
      return { receivedSats: result.amountSats, pending: false };
    }
    if (result.state === 'pending') {
      return { receivedSats: result.amountSats, pending: true };
    }
    await ui.dialog.openAsync({ lines: [`The melt failed: ${result.error ?? 'unknown error'}`] });
    return null;
  } catch (err) {
    await ui.dialog.openAsync({
      lines: [
        `Melt failed: ${(err as ApiError).message}`,
        'The mint may be busy — try again in a moment.',
      ],
    });
    return null;
  }
}
