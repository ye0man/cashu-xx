import { z } from 'zod';

export const SessionStateSchema = z.enum(['created', 'awaiting_payment', 'paid', 'minted']);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const BundleStateSchema = z.enum([
  'locked',
  'unlocked',
  'issued',
  'reclaimed',
  'combining',
  'combined',
  'melting',
  'melted',
]);
export type BundleState = z.infer<typeof BundleStateSchema>;

/**
 * A bundle whose sats can no longer be redeemed on their own: the operator swept
 * them (`reclaimed`), they now live inside a combined token (`combined`), or
 * they were paid out to the player's Lightning wallet (`melted`).
 * `combining` and `melting` are deliberately not terminal — they are in-progress
 * operations that can still be completed/recovered.
 */
export function isDeadBundleState(state: BundleState): boolean {
  return state === 'reclaimed' || state === 'combined' || state === 'melted';
}

export const ClaimCodeSchema = z.string().regex(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
