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

export interface UnlockResponse {
  milestoneId: MilestoneId;
  token: string;
  issuedAt: number;
}

export const CombineBodySchema = z.object({ milestoneIds: z.array(z.enum(MILESTONE_IDS)).min(1) });
export type CombineBody = z.infer<typeof CombineBodySchema>;

export interface CombineResponse {
  token: string;
  combinedCount: number;
  amountSats: number;
  skippedRedeemed: number;
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

/** `milestoneIds` omitted = melt every outstanding (non-dead) token of the session. */
export const MeltBodySchema = z.object({
  destination: z.string().trim().min(3),
  milestoneIds: z.array(z.enum(MILESTONE_IDS)).min(1).optional(),
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

export interface MeltPreviewResponse {
  /** Sats the session can still melt (sum of reclaimable, non-dead tokens). */
  availableSats: number;
  /** How many tokens still back those sats. */
  bundleCount: number;
  /** Sats already paid out in a previous (completed) melt. */
  meltedSats: number;
}
