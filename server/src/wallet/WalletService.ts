import type {
  ClaimResponse,
  CreateSessionResponse,
  DepositQuote,
  DepositStatus,
  LedgerRow,
  MeltResponse,
  MilestoneId,
  PayoutPreviewResponse,
  PayoutTokenResponse,
  UnlockResponse,
} from '@cashu-xx/shared';

export type WalletErrorCode = 'not_found' | 'unauthorized' | 'not_ready' | 'invalid' | 'reclaimed';

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
  /** Records a milestone as earned (ledger only; no token is minted until payout). */
  unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse>;
  getLedger(sessionId: string): Promise<LedgerRow[]>;
  /** What the session has earned and how (if at all) it has been paid out. */
  payoutPreview(sessionId: string): Promise<PayoutPreviewResponse>;
  /** Issues (or re-shows) one combined cashu token holding every earned sat. */
  payoutToken(sessionId: string): Promise<PayoutTokenResponse>;
  /** Melts every earned sat to a Lightning address or bolt11 invoice. */
  meltSession(sessionId: string, request: { destination: string }): Promise<MeltResponse>;
  /** Optional: boot expensive wallet dependencies ahead of the first request. */
  warmup?(): Promise<void>;
}
