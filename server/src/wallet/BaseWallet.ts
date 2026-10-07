import { randomUUID } from 'node:crypto';
import {
  DEFAULT_MINT_URL,
  normalizeMintUrl,
  TOKEN_AMOUNT_SATS,
  type ClaimResponse,
  type CreateSessionResponse,
  type DepositQuote,
  type DepositStatus,
  type LedgerRow,
  MILESTONE_IDS,
  type MeltResponse,
  type MilestoneId,
  type PayoutPreviewResponse,
  type PayoutTokenResponse,
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
  /** One payout (token or melt) at a time per session: double-clicks share the first result. */
  private readonly payouts = new Map<string, Promise<unknown>>();
  private readonly sessionLocks = new Map<string, Promise<void>>();

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
    if (!this.repo.hasLedger(row.id)) {
      throw new WalletError('not_ready', 'pay the entry invoice first');
    }
    const bundle = this.repo.getBundle(row.id, milestoneId);
    if (bundle?.state === 'reclaimed') {
      throw new WalletError('reclaimed', 'the operator withdrew the sats for this token');
    }
    const at = Date.now();
    this.repo.markUnlocked(row.id, milestoneId, at);
    return { milestoneId, unlockedAt: this.repo.getBundle(row.id, milestoneId)?.unlocked_at ?? at };
  }

  async getLedger(sessionId: string): Promise<LedgerRow[]> {
    const row = this.mustGet(sessionId);
    return this.ledgerRows(row.id);
  }

  async payoutPreview(sessionId: string): Promise<PayoutPreviewResponse> {
    const row = this.mustGet(sessionId);
    const earnedCount = this.repo
      .listBundles(row.id)
      .filter((bundle) => bundle.state === 'unlocked' || bundle.state === 'claimed' || bundle.state === 'melted').length;
    const base = { earnedCount, earnedSats: earnedCount * TOKEN_AMOUNT_SATS };
    if (this.repo.isLegacy(row.id)) {
      return { ...base, state: 'legacy' };
    }
    if (row.melt_state === 'melted') {
      return { ...base, state: 'melted', paidSats: row.melt_amount_sats ?? 0 };
    }
    if (row.melt_state === 'pending') {
      return { ...base, state: 'melt_pending', paidSats: row.melt_amount_sats ?? 0 };
    }
    if (row.claim_token) {
      return { ...base, state: 'token', token: row.claim_token, paidSats: row.claim_amount_sats ?? 0 };
    }
    return { ...base, state: 'open' };
  }

  payoutToken(sessionId: string): Promise<PayoutTokenResponse> {
    return this.serialize(sessionId, 'token', () => {
      const row = this.payableSession(sessionId);
      if (row.claim_token) {
        return Promise.resolve({
          token: row.claim_token,
          amountSats: row.claim_amount_sats ?? 0,
          milestoneCount: this.repo.listBundles(row.id).filter((bundle) => bundle.state === 'claimed').length,
        });
      }
      return this.issuePayoutToken(row);
    });
  }

  meltSession(sessionId: string, request: { destination: string }): Promise<MeltResponse> {
    return this.serialize(sessionId, 'melt', () =>
      this.runMelt(this.payableSession(sessionId, { allowMelt: true }), request),
    );
  }

  /** Mint the combined token for `row`'s earned milestones (no token issued yet). */
  protected abstract issuePayoutToken(row: SessionRow): Promise<PayoutTokenResponse>;
  /** Pay `row`'s earned sats over Lightning, resuming an in-flight melt. */
  protected abstract runMelt(row: SessionRow, request: { destination: string }): Promise<MeltResponse>;

  abstract getDepositQuote(sessionId: string): Promise<DepositQuote>;
  abstract getDepositStatus(sessionId: string): Promise<DepositStatus>;

  /** The session, checked to be one whose sats can still be paid out. */
  protected payableSession(sessionId: string, options: { allowMelt?: boolean } = {}): SessionRow {
    const row = this.mustGet(sessionId);
    if (!this.repo.hasLedger(row.id)) {
      throw new WalletError('not_ready', 'pay the entry invoice first');
    }
    if (this.repo.isLegacy(row.id)) {
      throw new WalletError('reclaimed', 'this run predates the payout update — ask the operator to sweep it');
    }
    if (row.melt_state === 'melted') {
      throw new WalletError('reclaimed', 'these sats were already paid out to your Lightning wallet');
    }
    if (row.melt_state === 'pending' && !options.allowMelt) {
      throw new WalletError('not_ready', 'a Lightning payout is still settling — retry in a moment');
    }
    return row;
  }

  /** Earned milestones that have not been paid out, or a `not_ready` error when there are none. */
  protected earnedOrThrow(row: SessionRow): MilestoneId[] {
    const earned = this.repo.listUnlocked(row.id);
    if (earned.length === 0) {
      throw new WalletError('not_ready', 'no tokens earned yet — go find some!');
    }
    return earned;
  }

  private serialize<T>(sessionId: string, kind: 'token' | 'melt', run: () => Promise<T>): Promise<T> {
    // Same kind in flight: share it (a double-click must not pay twice).
    const key = `${kind}:${sessionId}`;
    const existing = this.payouts.get(key);
    if (existing) {
      return existing as Promise<T>;
    }
    // Different kinds queue behind each other so a token and a melt never race
    // over the same earned sats.
    const before = this.sessionLocks.get(sessionId) ?? Promise.resolve();
    const pending = before
      .catch(() => undefined)
      .then(run)
      .finally(() => {
        this.payouts.delete(key);
        if (this.sessionLocks.get(sessionId) === settled) {
          this.sessionLocks.delete(sessionId);
        }
      });
    const settled = pending.then(
      () => undefined,
      () => undefined,
    );
    this.payouts.set(key, pending);
    this.sessionLocks.set(sessionId, settled);
    return pending;
  }

  protected ledgerRows(sessionId: string): LedgerRow[] {
    return this.repo.listBundles(sessionId).map((bundle) => ({
      milestoneId: bundle.milestone_id,
      state: bundle.state,
      unlockedAt: bundle.unlocked_at,
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
