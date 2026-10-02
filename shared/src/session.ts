import { z } from 'zod';

export const SessionStateSchema = z.enum(['created', 'awaiting_payment', 'paid', 'minted']);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const BundleStateSchema = z.enum(['locked', 'unlocked', 'issued', 'reclaimed', 'combining', 'combined']);
export type BundleState = z.infer<typeof BundleStateSchema>;

/**
 * A bundle whose sats can no longer be redeemed on their own: the operator swept
 * them (`reclaimed`) or they now live inside a combined token (`combined`).
 * `combining` is deliberately not terminal — it is an in-progress combine that
 * can still be completed.
 */
export function isDeadBundleState(state: BundleState): boolean {
  return state === 'reclaimed' || state === 'combined';
}

export const ClaimCodeSchema = z.string().regex(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
