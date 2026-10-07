import { z } from 'zod';

export const SessionStateSchema = z.enum(['created', 'awaiting_payment', 'paid', 'minted']);
export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * A milestone row in the session ledger. The sats stay in the server wallet;
 * the ledger only records what the player earned and how it was paid out:
 * `locked` (not earned yet) → `unlocked` (earned) → `claimed` (inside the
 * player's combined token) or `melted` (paid to Lightning). `reclaimed` marks
 * rows the operator swept (e.g. pre-ledger sessions).
 */
export const BundleStateSchema = z.enum(['locked', 'unlocked', 'claimed', 'melted', 'reclaimed']);
export type BundleState = z.infer<typeof BundleStateSchema>;

/** A milestone whose sats have already left the session (or were swept). */
export function isDeadBundleState(state: BundleState): boolean {
  return state === 'claimed' || state === 'melted' || state === 'reclaimed';
}

export const ClaimCodeSchema = z.string().regex(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
