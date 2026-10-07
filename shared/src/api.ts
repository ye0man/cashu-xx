import { z } from 'zod';
import type { LedgerRow } from './ledger';
import { MILESTONE_IDS, type MilestoneId } from './milestones';
import { isValidMintUrl } from './mints';
import { ClaimCodeSchema, type SessionState } from './session';

export interface CreateSessionResponse {
  sessionId: string;
  claimCode: string;
  authToken: string;
  /** Resolved mint URL this session is locked to (normalized). */
  mintUrl: string;
}

/** `mintUrl` is optional: omit it to use the server's default (Minibits). */
export const CreateSessionBodySchema = z.object({
  mintUrl: z.string().refine(isValidMintUrl, 'mint URL must be a valid http(s) address').optional(),
});
export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>;

export const ClaimBodySchema = z.object({ claimCode: ClaimCodeSchema });
export type ClaimBody = z.infer<typeof ClaimBodySchema>;

export interface ClaimResponse {
  sessionId: string;
  authToken: string;
  ledger: LedgerRow[];
  /** Mint the recovered session is locked to (normalized). */
  mintUrl: string;
}

export interface DepositQuote {
  invoice: string;
  quoteId: string;
  expiresAt: number;
  amountSats: number;
}

export interface DepositStatus {
  state: SessionState;
  paid: boolean;
  minted: boolean;
  bundlesReady: boolean;
}

export const UnlockBodySchema = z.object({ milestoneId: z.enum(MILESTONE_IDS) });
export type UnlockBody = z.infer<typeof UnlockBodySchema>;

/** Recording a milestone is bookkeeping only: the sats are paid out once, at the end. */
export interface UnlockResponse {
  milestoneId: MilestoneId;
  unlockedAt: number;
}

/**
 * How a session's earned sats left (or will leave) the server:
 * `open` nothing paid yet · `token` a combined cashu token was issued ·
 * `melt_pending` a Lightning payment is settling · `melted` paid to Lightning ·
 * `legacy` a pre-ledger run whose sats the operator must sweep.
 */
export type PayoutState = 'open' | 'token' | 'melt_pending' | 'melted' | 'legacy';

export interface PayoutPreviewResponse {
  state: PayoutState;
  /** Milestones earned (and not yet paid out another way). */
  earnedCount: number;
  /** Sats those milestones are worth (10 each). */
  earnedSats: number;
  /** The combined token, once issued (state `token`). */
  token?: string;
  /** Sats inside the issued token, or sent over Lightning. */
  paidSats?: number;
}

export interface PayoutTokenResponse {
  /** One cashu token (V4 `cashuB…`) holding every earned sat. */
  token: string;
  amountSats: number;
  /** Milestones folded into the token. */
  milestoneCount: number;
}

export interface LedgerResponse {
  ledger: LedgerRow[];
}

export interface MintInfoResponse {
  /** Normalized mint URL this info describes. */
  url: string;
  online: boolean;
  name: string;
  description: string;
  feePpk: number;
  /** Online and advertising bolt11 minting (NUT-04). Input fees are allowed. */
  compatible: boolean;
  error?: string;
}

/** A curated mint with its live verification, as returned by `/api/mints`. */
export interface MintCandidate extends MintInfoResponse {
  label: string;
}

export interface MintListResponse {
  defaultUrl: string;
  mints: MintCandidate[];
}

/** Melts every earned (not yet paid out) sat of the session to `destination`. */
export const MeltBodySchema = z.object({
  destination: z.string().trim().min(3),
});
export type MeltBody = z.infer<typeof MeltBodySchema>;

export type MeltState = 'melted' | 'pending' | 'failed';

export interface MeltResponse {
  state: MeltState;
  /** True only when the melt is finalized on-chain (preimage settled). */
  paid: boolean;
  /** Sats actually sent to the destination. */
  amountSats: number;
  /** Mint/Lightning fees taken from the payout. */
  feeSats: number;
  /** The Lightning address or bolt11 invoice that was paid. */
  destination: string;
  preimage?: string;
  error?: string;
}
