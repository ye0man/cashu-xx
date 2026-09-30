import { randomUUID } from 'node:crypto';
import {
  ENTRY_AMOUNT_SATS,
  MILESTONE_IDS,
  TOKEN_AMOUNT_SATS,
  type ClaimResponse,
  type CreateSessionResponse,
  type DepositQuote,
  type DepositStatus,
  type LedgerRow,
  type MilestoneId,
  type UnlockResponse,
} from '@cashu-xx/shared';
import type { Repo, SessionRow } from '../db/repo';
import { WalletError, type WalletService } from './WalletService';

const CLAIM_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679';

function makeClaimCode(): string {
  const chunk = (): string =>
    Array.from({ length: 4 }, () => CLAIM_ALPHABET[Math.floor(Math.random() * CLAIM_ALPHABET.length)]).join('');
  return `NUT-${chunk()}-${chunk()}`;
}

function mockToken(sessionId: string, milestoneId: MilestoneId): string {
  const payload = { mock: true, sessionId, milestoneId, amount: TOKEN_AMOUNT_SATS };
  return `cashuA${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export class MockWallet implements WalletService {
  constructor(private readonly repo: Repo) {}

  async createSession(): Promise<CreateSessionResponse> {
    const sessionId = randomUUID();
    const claimCode = makeClaimCode();
    const authToken = randomUUID().replaceAll('-', '');
    this.repo.createSession({
      id: sessionId,
      claim_code: claimCode,
      auth_token: authToken,
      quote_id: null,
      invoice: null,
      quote_expires_at: null,
      state: 'created',
      created_at: Date.now(),
    });
    return { sessionId, claimCode, authToken };
  }

  async recoverSession(claimCode: string): Promise<ClaimResponse> {
    const row = this.repo.getSessionByClaimCode(claimCode);
    if (!row) {
      throw new WalletError('not_found', 'unknown claim code');
    }
    return { sessionId: row.id, authToken: row.auth_token, ledger: this.ledgerRows(row.id) };
  }

  async authenticate(sessionId: string, authToken: string): Promise<boolean> {
    const row = this.repo.getSession(sessionId);
    return row !== undefined && row.auth_token === authToken;
  }

  async getDepositQuote(sessionId: string): Promise<DepositQuote> {
    const row = this.mustGet(sessionId);
    const quoteId = randomUUID();
    const invoice = `lnbc1mock${Buffer.from(row.id).toString('base64url').slice(0, 16)}`;
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.repo.setQuote(row.id, quoteId, invoice, expiresAt);
    this.repo.setState(row.id, 'awaiting_payment');
    return { invoice, quoteId, expiresAt, amountSats: ENTRY_AMOUNT_SATS };
  }

  async getDepositStatus(sessionId: string): Promise<DepositStatus> {
    const row = this.mustGet(sessionId);
    if (row.state === 'created' || row.state === 'awaiting_payment') {
      this.repo.setState(row.id, 'paid');
      this.repo.createBundles(row.id, MILESTONE_IDS);
      this.repo.setState(row.id, 'minted');
    }
    const state = this.mustGet(sessionId).state;
    return {
      state,
      paid: state === 'paid' || state === 'minted',
      minted: state === 'minted',
      bundlesReady: state === 'minted',
    };
  }

  async unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse> {
    const row = this.mustGet(sessionId);
    if (!MILESTONE_IDS.includes(milestoneId)) {
      throw new WalletError('invalid', `unknown milestone "${milestoneId}"`);
    }
    const bundle = this.repo.getBundle(row.id, milestoneId);
    if (!bundle) {
      throw new WalletError('not_ready', 'bundles not created yet — deposit first');
    }
    if (bundle.token !== null && bundle.issued_at !== null) {
      return { milestoneId, token: bundle.token, issuedAt: bundle.issued_at };
    }
    const issuedAt = Date.now();
    const token = mockToken(row.id, milestoneId);
    this.repo.issueToken(row.id, milestoneId, token, issuedAt);
    return { milestoneId, token, issuedAt };
  }

  async getLedger(sessionId: string): Promise<LedgerRow[]> {
    const row = this.mustGet(sessionId);
    return this.ledgerRows(row.id);
  }

  private ledgerRows(sessionId: string): LedgerRow[] {
    return this.repo.listBundles(sessionId).map((bundle) => ({
      milestoneId: bundle.milestone_id,
      state: bundle.state,
      unlockedAt: bundle.unlocked_at,
      issuedAt: bundle.issued_at,
    }));
  }

  private mustGet(sessionId: string): SessionRow {
    const row = this.repo.getSession(sessionId);
    if (!row) {
      throw new WalletError('not_found', 'unknown session');
    }
    return row;
  }
}
