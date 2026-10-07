import { randomUUID } from 'node:crypto';
import {
  ENTRY_AMOUNT_SATS,
  TOKEN_AMOUNT_SATS,
  type DepositQuote,
  type DepositStatus,
  type MeltResponse,
  type PayoutTokenResponse,
} from '@cashu-xx/shared';
import type { SessionRow } from '../db/repo';
import { BaseWallet } from './BaseWallet';

function mockToken(sessionId: string, amountSats: number): string {
  const payload = { mock: true, sessionId, amount: amountSats };
  return `cashuB${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export class MockWallet extends BaseWallet {
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
      this.repo.createLedger(row.id);
      this.repo.setState(row.id, 'minted');
    }
    const state = this.mustGet(sessionId).state;
    const minted = state === 'minted';
    return { state, paid: minted || state === 'paid', minted, bundlesReady: minted };
  }

  protected async issuePayoutToken(row: SessionRow): Promise<PayoutTokenResponse> {
    const earned = this.earnedOrThrow(row);
    const amountSats = earned.length * TOKEN_AMOUNT_SATS;
    const token = mockToken(row.id, amountSats);
    this.repo.startClaim(row.id, `mock-send-${randomUUID()}`, amountSats);
    this.repo.finishClaim(row.id, token);
    this.repo.setBundleStates(row.id, earned, 'claimed', Date.now());
    return { token, amountSats, milestoneCount: earned.length };
  }

  protected async runMelt(row: SessionRow, request: { destination: string }): Promise<MeltResponse> {
    if (row.claim_token) {
      // An unredeemed mock token is always reclaimable: fold its sats back in.
      this.repo.clearClaim(row.id);
      this.repo.moveBundleStates(row.id, 'claimed', 'unlocked');
    }
    const earned = this.earnedOrThrow(row);
    const amountSats = earned.length * TOKEN_AMOUNT_SATS;
    this.repo.setBundleStates(row.id, earned, 'melted', Date.now());
    const result = {
      state: 'melted' as const,
      amountSats,
      feeSats: 0,
      destination: request.destination,
      preimage: 'mock-preimage',
    };
    this.repo.finishMelt(row.id, result);
    return { ...result, paid: true };
  }
}
