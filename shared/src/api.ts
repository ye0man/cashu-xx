import { z } from 'zod';
import type { LedgerRow } from './ledger';
import { MILESTONE_IDS, type MilestoneId } from './milestones';
import { ClaimCodeSchema, type SessionState } from './session';

export interface CreateSessionResponse {
  sessionId: string;
  claimCode: string;
  authToken: string;
}

export const ClaimBodySchema = z.object({ claimCode: ClaimCodeSchema });
export type ClaimBody = z.infer<typeof ClaimBodySchema>;

export interface ClaimResponse {
  sessionId: string;
  authToken: string;
  ledger: LedgerRow[];
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
  online: boolean;
  name: string;
  description: string;
  feePpk: number;
  error?: string;
}
