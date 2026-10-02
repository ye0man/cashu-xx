import { randomUUID } from 'node:crypto';
import {
  DEFAULT_MINT_URL,
  normalizeMintUrl,
  type ClaimResponse,
  type CombineResponse,
  type CreateSessionResponse,
  type DepositQuote,
  type DepositStatus,
  type LedgerRow,
  MILESTONE_IDS,
  type MeltPreviewResponse,
  type MeltResponse,
  type MilestoneId,
  type UnlockResponse,
} from '@cashu-xx/shared';
import type { Repo, SessionRow } from '../db/repo';
import { WalletError, type WalletService } from './WalletService';

const CLAIM_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';

export function makeClaimCode(): string {
  const chunk = (): string =>
    Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
  return `NUT-${chunk()}-${chunk()}`;
}

export abstract class BaseWallet implements WalletService {
  constructor(
    protected readonly repo: Repo,
    protected readonly defaultMintUrl: string = DEFAULT_MINT_URL,
  ) {}

  async createSession(mintUrl?: string): Promise<CreateSessionResponse> {
    let resolved: string;
    try {
      resolved = normalizeMintUrl(mintUrl ?? this.defaultMintUrl);
    } catch (err) {
      throw new WalletError('invalid', (err as Error).message);
    }
    await this.validateMint(resolved);
    const sessionId = randomUUID();
    const claimCode = makeClaimCode();
    const authToken = randomUUID().replaceAll('-', '');
    this.repo.createSession({
      id: sessionId,
      claim_code: claimCode,
      auth_token: authToken,
      mint_url: resolved,
      quote_id: null,
      mint_op_id: null,
      invoice: null,
      quote_expires_at: null,
      state: 'created',
      created_at: Date.now(),
    });
    return { sessionId, claimCode, authToken, mintUrl: resolved };
  }

  /** Hook for wallets that need to vet a mint before a session is locked to it. */
  protected async validateMint(_mintUrl: string): Promise<void> {}

  async recoverSession(claimCode: string): Promise<ClaimResponse> {
    const row = this.repo.getSessionByClaimCode(claimCode);
    if (!row) {
      throw new WalletError('not_found', 'unknown claim code');
    }
    return {
      sessionId: row.id,
      authToken: row.auth_token,
      ledger: this.ledgerRows(row.id),
      mintUrl: row.mint_url ?? this.defaultMintUrl,
    };
  }

  async authenticate(sessionId: string, authToken: string): Promise<boolean> {
    const row = this.repo.getSession(sessionId);
    return row !== undefined && row.auth_token === authToken;
  }

  async unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse> {
    const row = this.mustGet(sessionId);
    if (!MILESTONE_IDS.includes(milestoneId)) {
      throw new WalletError('invalid', `unknown milestone "${milestoneId}"`);
    }
    const bundle = this.repo.getBundle(row.id, milestoneId);
    if (!bundle || bundle.token === null) {
      throw new WalletError('not_ready', 'token not prepared yet — deposit first');
    }
    if (bundle.state === 'reclaimed') {
      throw new WalletError('reclaimed', 'the operator withdrew the sats for this token');
    }
    if (bundle.state === 'melted') {
      throw new WalletError('reclaimed', 'these sats were already paid out to your Lightning wallet');
    }
    if (bundle.state === 'combining' || bundle.state === 'melting') {
      throw new WalletError('not_ready', 'a cash-out is in progress for this token — retry in a moment');
    }
    if (bundle.state === 'combined') {
      throw new WalletError('combined', 'this token was combined into a single token at Minibits HQ');
    }
    if (bundle.state === 'issued' && bundle.issued_at !== null) {
      return { milestoneId, token: bundle.token, issuedAt: bundle.issued_at };
    }
    const issuedAt = Date.now();
    this.repo.markIssued(row.id, milestoneId, issuedAt);
    return { milestoneId, token: bundle.token, issuedAt };
  }

  async getLedger(sessionId: string): Promise<LedgerRow[]> {
    const row = this.mustGet(sessionId);
    return this.ledgerRows(row.id);
  }

  abstract getDepositQuote(sessionId: string): Promise<DepositQuote>;
  abstract getDepositStatus(sessionId: string): Promise<DepositStatus>;
  abstract combineTokens(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse>;
  abstract meltPreview(sessionId: string): Promise<MeltPreviewResponse>;
  abstract meltSession(
    sessionId: string,
    request: { destination: string; milestoneIds?: MilestoneId[] },
  ): Promise<MeltResponse>;

  protected ledgerRows(sessionId: string): LedgerRow[] {
    return this.repo.listBundles(sessionId).map((bundle) => ({
      milestoneId: bundle.milestone_id,
      state: bundle.state,
      unlockedAt: bundle.unlocked_at,
      issuedAt: bundle.issued_at,
    }));
  }

  protected mustGet(sessionId: string): SessionRow {
    const row = this.repo.getSession(sessionId);
    if (!row) {
      throw new WalletError('not_found', 'unknown session');
    }
    return row;
  }
}
