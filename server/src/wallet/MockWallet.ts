import { randomUUID } from 'node:crypto';
import {
  ENTRY_AMOUNT_SATS,
  MILESTONE_IDS,
  TOKEN_AMOUNT_SATS,
  type DepositQuote,
  type DepositStatus,
  type MilestoneId,
} from '@cashu-xx/shared';
import { BaseWallet } from './BaseWallet';

function mockToken(sessionId: string, milestoneId: MilestoneId): string {
  const payload = { mock: true, sessionId, milestoneId, amount: TOKEN_AMOUNT_SATS };
  return `cashuA${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
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
      this.repo.setState(row.id, 'paid');
      this.repo.createBundles(
        row.id,
        MILESTONE_IDS.map((milestoneId) => ({ milestoneId, token: mockToken(row.id, milestoneId) })),
      );
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
}
