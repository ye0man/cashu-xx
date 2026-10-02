import type {
  ClaimResponse,
  CombineResponse,
  CreateSessionResponse,
  DepositQuote,
  DepositStatus,
  LedgerRow,
  MilestoneId,
  UnlockResponse,
} from '@cashu-xx/shared';

export type WalletErrorCode = 'not_found' | 'unauthorized' | 'not_ready' | 'invalid' | 'reclaimed' | 'combined';

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface WalletService {
  createSession(): Promise<CreateSessionResponse>;
  recoverSession(claimCode: string): Promise<ClaimResponse>;
  authenticate(sessionId: string, authToken: string): Promise<boolean>;
  getDepositQuote(sessionId: string): Promise<DepositQuote>;
  getDepositStatus(sessionId: string): Promise<DepositStatus>;
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse>;
  combineTokens(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse>;
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  /** Optional: boot expensive wallet dependencies ahead of the first request. */
  warmup?(): Promise<void>;
}
