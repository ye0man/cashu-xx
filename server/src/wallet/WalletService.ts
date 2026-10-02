import type {
  ClaimResponse,
  CombineResponse,
  CreateSessionResponse,
  DepositQuote,
  DepositStatus,
  LedgerRow,
  MeltPreviewResponse,
  MeltResponse,
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
  /** Locks a new session to `mintUrl` (normalized); omitted/undefined uses the default mint. */
  createSession(mintUrl?: string): Promise<CreateSessionResponse>;
  recoverSession(claimCode: string): Promise<ClaimResponse>;
  authenticate(sessionId: string, authToken: string): Promise<boolean>;
  getDepositQuote(sessionId: string): Promise<DepositQuote>;
  getDepositStatus(sessionId: string): Promise<DepositStatus>;
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse>;
  combineTokens(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse>;
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  /** Sats available to melt and sats already paid out. */
  meltPreview(sessionId: string): Promise<MeltPreviewResponse>;
  /** Melt the session's outstanding tokens to a Lightning address or bolt11 invoice. */
  meltSession(
    sessionId: string,
    request: { destination: string; milestoneIds?: MilestoneId[] },
  ): Promise<MeltResponse>;
  /** Optional: boot expensive wallet dependencies ahead of the first request. */
  warmup?(): Promise<void>;
}
