import { mkdirSync } from 'node:fs';
import type { Manager } from '@cashu/coco-core';
import {
  ENTRY_AMOUNT_SATS,
  MILESTONE_IDS,
  TOKEN_AMOUNT_SATS,
  type DepositQuote,
  type DepositStatus,
  type MilestoneId,
  type UnlockResponse,
} from '@cashu-xx/shared';
import type { Repo } from '../db/repo';
import { BaseWallet } from './BaseWallet';
import { openCocoManager } from './coco';
import { WalletError } from './WalletService';

export interface MinibitsWalletOptions {
  mintUrl: string;
  dataDir: string;
}

function normalizeExpiry(expiry: number | null | undefined): number {
  if (!expiry) {
    return Date.now() + 10 * 60 * 1000;
  }
  return expiry < 1e12 ? expiry * 1000 : expiry;
}

export class MinibitsWallet extends BaseWallet {
  private readonly mintUrl: string;
  private readonly dataDir: string;
  private managerPromise: Promise<Manager> | null = null;
  private readonly splits = new Map<string, Promise<void>>();

  constructor(repo: Repo, options: MinibitsWalletOptions) {
    super(repo);
    this.mintUrl = options.mintUrl;
    this.dataDir = options.dataDir;
    mkdirSync(this.dataDir, { recursive: true });
  }

  private manager(): Promise<Manager> {
    if (!this.managerPromise) {
      // Never cache a failed boot: a single network blip to the mint must not
      // wedge every later request until the server restarts.
      this.managerPromise = this.boot().catch((err: unknown) => {
        this.managerPromise = null;
        throw err;
      });
    }
    return this.managerPromise;
  }

  private async boot(): Promise<Manager> {
    const { manager } = await openCocoManager({ mintUrl: this.mintUrl, dataDir: this.dataDir });
    return manager;
  }

  /** Boot the coco manager ahead of the first player so the cold start (init + addMint) is off the payment path. */
  async warmup(): Promise<void> {
    await this.manager();
  }

  async getDepositQuote(sessionId: string): Promise<DepositQuote> {
    const row = this.mustGet(sessionId);
    const manager = await this.manager();
    const quote = await manager.quotes.mint.create({
      mintUrl: this.mintUrl,
      method: 'bolt11',
      amount: ENTRY_AMOUNT_SATS,
    });
    const pending = await manager.ops.mint.prepare({
      quote: { mintUrl: this.mintUrl, quoteId: quote.quoteId, method: 'bolt11' },
      amount: ENTRY_AMOUNT_SATS,
    });
    const expiresAt = normalizeExpiry(quote.expiry);
    this.repo.setQuote(row.id, quote.quoteId, quote.request, expiresAt);
    this.repo.setMintOp(row.id, pending.id);
    this.repo.setState(row.id, 'awaiting_payment');
    return { invoice: quote.request, quoteId: quote.quoteId, expiresAt, amountSats: ENTRY_AMOUNT_SATS };
  }

  async getDepositStatus(sessionId: string): Promise<DepositStatus> {
    const row = this.mustGet(sessionId);
    if (row.state === 'minted' && this.repo.hasBundles(row.id)) {
      return { state: 'minted', paid: true, minted: true, bundlesReady: true };
    }
    if (row.state === 'paid') {
      // Payment already confirmed in an earlier poll: the token sends run in the
      // background, so report ready immediately and (re)kick the split if needed.
      this.startSplit(row.id);
      return { state: 'paid', paid: true, minted: false, bundlesReady: true };
    }
    if (!row.mint_op_id) {
      return { state: row.state, paid: false, minted: false, bundlesReady: false };
    }

    const manager = await this.manager();
    const op = await manager.ops.mint.get(row.mint_op_id);
    if (op?.state === 'failed') {
      throw new WalletError('not_ready', op.terminalFailure?.reason ?? op.error ?? 'mint operation failed');
    }
    if (op && op.state !== 'finalized') {
      await manager.ops.mint.checkPayment(row.mint_op_id);
    }
    let current = await manager.ops.mint.get(row.mint_op_id);
    if (current?.state === 'executing') {
      await manager.ops.mint.finalize(row.mint_op_id);
      current = await manager.ops.mint.get(row.mint_op_id);
    }
    if (current?.state === 'failed') {
      throw new WalletError('not_ready', current.terminalFailure?.reason ?? current.error ?? 'mint operation failed');
    }
    if (current?.state !== 'finalized') {
      return { state: 'awaiting_payment', paid: false, minted: false, bundlesReady: false };
    }

    // Finalized: the 100 sats are minted into the wallet. Hand the player off
    // now and split into the 10 token bundles in the background — the ten
    // sequential sends are the slow part and must not gate "paid".
    this.repo.setState(row.id, 'paid');
    this.startSplit(row.id);
    return { state: 'paid', paid: true, minted: false, bundlesReady: true };
  }

  async unlockToken(sessionId: string, milestoneId: MilestoneId): Promise<UnlockResponse> {
    const row = this.mustGet(sessionId);
    if (!MILESTONE_IDS.includes(milestoneId)) {
      throw new WalletError('invalid', `unknown milestone "${milestoneId}"`);
    }
    if (!this.repo.hasBundles(row.id)) {
      if (row.state !== 'paid' && row.state !== 'minted') {
        throw new WalletError('not_ready', 'token not prepared yet — deposit first');
      }
      // A token may be requested before the background split has finished.
      await this.splitLocked(row.id);
    }
    return super.unlockToken(sessionId, milestoneId);
  }

  /** Fire-and-forget split for the status poll; errors surface on the next await (unlock or poll). */
  private startSplit(sessionId: string): void {
    void this.splitLocked(sessionId).catch((err: unknown) => {
      console.error('token split failed', sessionId, err);
    });
  }

  private splitLocked(sessionId: string): Promise<void> {
    let pending = this.splits.get(sessionId);
    if (!pending) {
      pending = this.splitIntoBundles(sessionId)
        .then(() => {
          this.repo.setState(sessionId, 'minted');
        })
        .finally(() => {
          this.splits.delete(sessionId);
        });
      this.splits.set(sessionId, pending);
    }
    return pending;
  }

  private async splitIntoBundles(sessionId: string): Promise<void> {
    if (this.repo.hasBundles(sessionId)) {
      return;
    }
    const manager = await this.manager();
    const seeds: Array<{ milestoneId: MilestoneId; token: string }> = [];
    for (const milestoneId of MILESTONE_IDS) {
      const prepared = await manager.ops.send.prepare({
        mintUrl: this.mintUrl,
        amount: TOKEN_AMOUNT_SATS,
        unit: 'sat',
      });
      const { token } = await manager.ops.send.execute(prepared);
      seeds.push({ milestoneId, token: manager.wallet.encodeToken(token) });
    }
    this.repo.createBundles(sessionId, seeds);
  }
}
