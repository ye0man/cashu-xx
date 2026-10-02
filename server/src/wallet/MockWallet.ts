import { randomUUID } from 'node:crypto';
import {
  ENTRY_AMOUNT_SATS,
  isDeadBundleState,
  MILESTONE_IDS,
  TOKEN_AMOUNT_SATS,
  type CombineResponse,
  type DepositQuote,
  type DepositStatus,
  type MeltPreviewResponse,
  type MeltResponse,
  type MilestoneId,
} from '@cashu-xx/shared';
import { BaseWallet } from './BaseWallet';
import { WalletError } from './WalletService';

function mockToken(sessionId: string, milestoneId: MilestoneId): string {
  const payload = { mock: true, sessionId, milestoneId, amount: TOKEN_AMOUNT_SATS };
  return `cashuA${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

function mockCombinedToken(sessionId: string, milestoneIds: MilestoneId[], amountSats: number): string {
  const payload = { mock: true, sessionId, combined: milestoneIds, amount: amountSats };
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

  async meltPreview(sessionId: string): Promise<MeltPreviewResponse> {
    const row = this.mustGet(sessionId);
    let availableSats = 0;
    let meltedSats = 0;
    let bundleCount = 0;
    for (const bundle of this.repo.listBundles(row.id)) {
      if (!bundle.token) {
        continue;
      }
      if (bundle.state === 'melted') {
        meltedSats += TOKEN_AMOUNT_SATS;
      } else if (!isDeadBundleState(bundle.state)) {
        availableSats += TOKEN_AMOUNT_SATS;
        bundleCount += 1;
      }
    }
    return { availableSats, bundleCount, meltedSats };
  }

  async meltSession(
    sessionId: string,
    request: { destination: string; milestoneIds?: MilestoneId[] },
  ): Promise<MeltResponse> {
    const row = this.mustGet(sessionId);
    const requested = request.milestoneIds ? new Set(request.milestoneIds) : null;
    const target = this.repo
      .listBundles(row.id)
      .filter(
        (bundle) =>
          bundle.token &&
          !isDeadBundleState(bundle.state) &&
          (bundle.state === 'melting' || !requested || requested.has(bundle.milestone_id)),
      )
      .map((bundle) => bundle.milestone_id);
    if (target.length === 0) {
      throw new WalletError('not_ready', 'no tokens to melt');
    }
    const amountSats = target.length * TOKEN_AMOUNT_SATS;
    this.repo.markMelted(row.id, target, Date.now());
    return {
      state: 'melted',
      paid: true,
      amountSats,
      feeSats: 0,
      destination: request.destination,
      preimage: 'mock-preimage',
    };
  }

  async combineTokens(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse> {
    const row = this.mustGet(sessionId);
    const requested = [...new Set(milestoneIds)];
    if (requested.some((id) => !MILESTONE_IDS.includes(id))) {
      throw new WalletError('invalid', 'unknown milestone id');
    }
    if (!this.repo.hasBundles(row.id)) {
      throw new WalletError('not_ready', 'tokens not prepared yet — deposit first');
    }
    // Fold requested tokens together with anything a previous attempt left in
    // `combining`, so a retry finishes the job instead of erroring out.
    const requestedSet = new Set(requested);
    const combined = this.repo
      .listBundles(row.id)
      .filter(
        (bundle) =>
          bundle.token &&
          !isDeadBundleState(bundle.state) &&
          (requestedSet.has(bundle.milestone_id) || bundle.state === 'combining'),
      )
      .map((bundle) => bundle.milestone_id);
    if (combined.length === 0) {
      throw new WalletError('not_ready', 'no combinable tokens — they may already be redeemed');
    }
    const amountSats = combined.length * TOKEN_AMOUNT_SATS;
    const issuedAt = Date.now();
    for (const milestoneId of combined) {
      this.repo.markCombined(row.id, milestoneId, issuedAt);
    }
    return {
      token: mockCombinedToken(row.id, combined, amountSats),
      combinedCount: combined.length,
      amountSats,
      skippedRedeemed: requested.filter((id) => !combined.includes(id)).length,
    };
  }
}
