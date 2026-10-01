import { z } from 'zod';

export const SessionStateSchema = z.enum(['created', 'awaiting_payment', 'paid', 'minted']);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const BundleStateSchema = z.enum(['locked', 'unlocked', 'issued', 'reclaimed']);
export type BundleState = z.infer<typeof BundleStateSchema>;

export const ClaimCodeSchema = z.string().regex(/^NUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
