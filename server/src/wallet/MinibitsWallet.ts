import { mkdirSync } from 'node:fs';
import type { Manager } from '@cashu/coco-core';
import type { SqliteRepositories } from '@cashu/coco-sqlite';
import {
  ENTRY_AMOUNT_SATS,
  TOKEN_AMOUNT_SATS,
  type DepositQuote,
  type DepositStatus,
  type MeltResponse,
  type MintInfoResponse,
  type PayoutTokenResponse,
} from '@cashu-xx/shared';
import type { Repo, SessionRow } from '../db/repo';
import { BaseWallet } from './BaseWallet';
import { openCocoManager } from './coco';
import { invoiceFromLightningAddress, isLightningAddress, resolveDestination } from './melt';
import { verifyMint } from './mintVerify';
import { encodePayoutToken } from './payoutToken';
import { cancelIfPrepared, prepareCompactSend } from './proofs';
import { WalletError } from './WalletService';

export interface MinibitsWalletOptions {
  mintUrl: string;
  dataDir: string;
  /**
   * How a mint is vetted before a session locks to it. Pass the server's cached
   * `MintDirectory.get` so session creation never waits on a fresh mint round
   * trip; defaults to a live check.
   */
  checkMint?: (mintUrl: string) => Promise<MintInfoResponse>;
  /** Log per-step timings of the invoice path (default: on). */
  logTimings?: boolean;
}

/**
 * coco's watcher learns about a paid invoice over the mint's websocket, so the
 * status poll mostly reads local state. An explicit `checkPayment` is a mint
 * request that shares coco's per-mint rate limit with everything else; only
 * fall back to it every few seconds per session.
 */
const CHECK_PAYMENT_EVERY_MS = 6000;

function normalizeExpiry(expiry: number | null | undefined): number {
  if (!expiry) {
    return Date.now() + 10 * 60 * 1000;
  }
  return expiry < 1e12 ? expiry * 1000 : expiry;
}

function stopwatch(): { lap: (name: string) => void; summary: () => string; total: () => number } {
  const start = Date.now();
  let mark = start;
  const parts: string[] = [];
  return {
    lap: (name) => {
      const now = Date.now();
      parts.push(`${name}=${now - mark}ms`);
      mark = now;
    },
    summary: () => parts.join(' '),
    total: () => Date.now() - start,
  };
}

export class MinibitsWallet extends BaseWallet {
  private readonly mintUrl: string;
  private readonly dataDir: string;
  private readonly checkMint: (mintUrl: string) => Promise<MintInfoResponse>;
  private readonly logTimings: boolean;
  private managerPromise: Promise<Manager> | null = null;
  private repositories: SqliteRepositories | null = null;
  private readonly mintsEnsured = new Map<string, Promise<void>>();
  private readonly bootLoadedMints = new Set<string>();
  private readonly nut20ByMint = new Map<string, Promise<boolean>>();
  private readonly lastPaymentCheck = new Map<string, number>();

  constructor(repo: Repo, options: MinibitsWalletOptions) {
    super(repo, options.mintUrl);
    this.mintUrl = options.mintUrl;
    this.dataDir = options.dataDir;
    this.checkMint = options.checkMint ?? verifyMint;
    this.logTimings = options.logTimings ?? true;
    mkdirSync(this.dataDir, { recursive: true });
  }

  /** The mint this session is locked to (falls back to the server default for pre-upgrade rows). */
  private mintUrlFor(row: { mint_url: string | null }): string {
    return row.mint_url ?? this.mintUrl;
  }

  /** A mint must be reachable before a session can be locked to it (fail before payment, not after). */
  protected override async validateMint(mintUrl: string): Promise<void> {
    const info = await this.checkMint(mintUrl);
    if (!info.online) {
      throw new WalletError('invalid', `mint is not reachable (${info.error ?? 'unknown error'})`);
    }
  }

  /** Fetch keysets for a mint once per process; a failed fetch is retried next time. */
  private ensureMint(mintUrl: string): Promise<void> {
    let pending = this.mintsEnsured.get(mintUrl);
    if (!pending) {
      pending = this.manager()
        .then((manager) => {
          // The boot already loaded the default mint's keysets: don't fetch them twice.
          if (this.bootLoadedMints.has(mintUrl)) {
            return;
          }
          return manager.mint.addMint(mintUrl, { trusted: true }).then(() => undefined);
        })
        .catch((err: unknown) => {
          this.mintsEnsured.delete(mintUrl);
          throw err;
        });
      this.mintsEnsured.set(mintUrl, pending);
    }
    return pending;
  }

  /**
   * Whether a mint supports NUT-20 locked quotes. We lock every quote we can:
   * a locked quote makes the mint echo our pubkey, which both protects the quote
   * and sidesteps a coco bug where a mint that returns `pubkey: ""` for an
   * unlocked quote is rejected as a false ownership conflict (see #2/Coinos).
   * Results are cached per mint; a failed lookup is not cached so it retries.
   */
  private supportsLockedQuotes(manager: Manager, mintUrl: string): Promise<boolean> {
    let pending = this.nut20ByMint.get(mintUrl);
    if (!pending) {
      pending = manager.mint
        .getMintInfo(mintUrl)
        .then((info) => Boolean((info as { nuts?: Record<string, unknown> } | undefined)?.nuts?.['20']))
        .catch(() => {
          this.nut20ByMint.delete(mintUrl);
          return false;
        });
      this.nut20ByMint.set(mintUrl, pending);
    }
    return pending;
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
    const { manager, repositories, defaultMintReady, timings } = await openCocoManager({
      mintUrl: this.mintUrl,
      dataDir: this.dataDir,
    });
    this.repositories = repositories;
    if (defaultMintReady) {
      this.bootLoadedMints.add(this.mintUrl);
    }
    if (this.logTimings) {
      console.info(`[timing] coco boot ${Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(' ')}`);
    }
    return manager;
  }

  /** Boot the coco manager (and the default mint's NUT-20 lookup) ahead of the first player. */
  async warmup(): Promise<void> {
    const manager = await this.manager();
    await this.supportsLockedQuotes(manager, this.mintUrl);
  }

  async getDepositQuote(sessionId: string): Promise<DepositQuote> {
    const row = this.mustGet(sessionId);
    const mintUrl = this.mintUrlFor(row);
    const clock = stopwatch();
    const manager = await this.manager();
    clock.lap('boot');
    const [locked] = await Promise.all([
      this.ensureMint(mintUrl).then(() => this.supportsLockedQuotes(manager, mintUrl)),
      this.retirePendingMintOp(manager, row.mint_op_id),
    ]);
    clock.lap('mint');
    const quote = await manager.quotes.mint.create({
      mintUrl,
      method: 'bolt11',
      amount: ENTRY_AMOUNT_SATS,
      locked,
    });
    clock.lap('quote');
    const pending = await manager.ops.mint.prepare({
      quote: { mintUrl, quoteId: quote.quoteId, method: 'bolt11' },
      amount: ENTRY_AMOUNT_SATS,
    });
    clock.lap('prepare');
    const expiresAt = normalizeExpiry(quote.expiry);
    this.repo.setQuote(row.id, quote.quoteId, quote.request, expiresAt);
    this.repo.setMintOp(row.id, pending.id);
    this.repo.setState(row.id, 'awaiting_payment');
    // The watcher covers the first seconds; the explicit check is a fallback.
    this.lastPaymentCheck.set(row.id, Date.now());
    if (this.logTimings) {
      console.info(`[timing] deposit quote ${row.id.slice(0, 8)} total=${clock.total()}ms ${clock.summary()}`);
    }
    return { invoice: quote.request, quoteId: quote.quoteId, expiresAt, amountSats: ENTRY_AMOUNT_SATS };
  }

  async getDepositStatus(sessionId: string): Promise<DepositStatus> {
    const row = this.mustGet(sessionId);
    if (row.state === 'minted' && this.repo.hasLedger(row.id)) {
      return { state: 'minted', paid: true, minted: true, bundlesReady: true };
    }
    if (row.state === 'paid') {
      // A session caught mid-way by the pre-ledger background split.
      return this.markMinted(row.id);
    }
    if (!row.mint_op_id) {
      return { state: row.state, paid: false, minted: false, bundlesReady: false };
    }

    const manager = await this.manager();
    let current = await manager.ops.mint.get(row.mint_op_id);
    if (current?.state === 'failed') {
      throw new WalletError('not_ready', current.terminalFailure?.reason ?? current.error ?? 'mint operation failed');
    }
    if (current && current.state !== 'finalized' && current.state !== 'executing') {
      const last = this.lastPaymentCheck.get(row.id) ?? 0;
      if (Date.now() - last >= CHECK_PAYMENT_EVERY_MS) {
        this.lastPaymentCheck.set(row.id, Date.now());
        await manager.ops.mint.checkPayment(row.mint_op_id);
        current = await manager.ops.mint.get(row.mint_op_id);
      }
    }
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
    // Minted into the pooled wallet. No per-milestone sends: the ledger records
    // what the player earns and one token is issued at the end.
    return this.markMinted(row.id);
  }

  private markMinted(sessionId: string): DepositStatus {
    this.repo.createLedger(sessionId);
    this.repo.setState(sessionId, 'minted');
    this.lastPaymentCheck.delete(sessionId);
    return { state: 'minted', paid: true, minted: true, bundlesReady: true };
  }

  protected async issuePayoutToken(row: SessionRow): Promise<PayoutTokenResponse> {
    const mintUrl = this.mintUrlFor(row);
    const manager = await this.manager();
    await this.ensureMint(mintUrl);

    // A previous attempt recorded its send but crashed before storing the
    // token: recover that token rather than paying a second time.
    if (row.claim_op_id) {
      const recovered = await this.recoverClaim(manager, row);
      if (recovered) {
        return recovered;
      }
    }

    const earned = this.earnedOrThrow(row);
    const amountSats = earned.length * TOKEN_AMOUNT_SATS;
    const prepared = await prepareCompactSend(manager, mintUrl, amountSats);
    this.repo.startClaim(row.id, prepared.id, amountSats);
    let token: string;
    try {
      const executed = await manager.ops.send.execute(prepared);
      token = encodePayoutToken(executed.token);
    } catch (err) {
      // Never left `prepared`: release the proofs and forget the attempt. Any
      // later state may hold a live token, which the next call recovers.
      const current = await manager.ops.send.get(prepared.id).catch(() => null);
      if (!current || current.state === 'prepared') {
        await cancelIfPrepared(manager, prepared.id);
        this.repo.clearClaim(row.id);
      }
      throw err;
    }
    this.repo.finishClaim(row.id, token);
    this.repo.setBundleStates(row.id, earned, 'claimed', Date.now());
    return { token, amountSats, milestoneCount: earned.length };
  }

  private async recoverClaim(manager: Manager, row: SessionRow): Promise<PayoutTokenResponse | null> {
    const opId = row.claim_op_id as string;
    const op = await manager.ops.send.get(opId);
    const token = op && 'token' in op ? op.token : undefined;
    if (op && token && (op.state === 'pending' || op.state === 'finalized')) {
      const encoded = encodePayoutToken(token);
      const earned = this.repo.listUnlocked(row.id);
      this.repo.finishClaim(row.id, encoded);
      this.repo.setBundleStates(row.id, earned, 'claimed', Date.now());
      return {
        token: encoded,
        amountSats: row.claim_amount_sats ?? Number(op.amount),
        milestoneCount: this.repo.listBundles(row.id).filter((bundle) => bundle.state === 'claimed').length,
      };
    }
    if (op?.state === 'prepared') {
      await cancelIfPrepared(manager, opId);
    }
    this.repo.clearClaim(row.id);
    return null;
  }

  /**
   * An issued payout token that was never redeemed can be taken back so its
   * sats go out over Lightning instead. A redeemed one means the player already
   * has the sats.
   */
  private async reclaimPayoutToken(manager: Manager, row: SessionRow): Promise<void> {
    if (!row.claim_op_id) {
      return;
    }
    const op = await manager.ops.send.get(row.claim_op_id);
    if (op?.state === 'finalized') {
      throw new WalletError('reclaimed', 'your combined token was already redeemed — the sats are in your wallet');
    }
    if (op?.state === 'pending') {
      await manager.ops.send.reclaim(row.claim_op_id);
    } else if (op?.state === 'prepared') {
      await cancelIfPrepared(manager, row.claim_op_id);
    }
    this.repo.clearClaim(row.id);
    this.repo.moveBundleStates(row.id, 'claimed', 'unlocked');
  }

  protected async runMelt(row: SessionRow, request: { destination: string }): Promise<MeltResponse> {
    const manager = await this.manager();
    const mintUrl = this.mintUrlFor(row);
    await this.ensureMint(mintUrl);

    // Resume an in-flight melt first — never start a second payment for the same
    // session (idempotency).
    if (row.melt_state === 'pending' && row.melt_op_id) {
      const op = await manager.ops.melt.get(row.melt_op_id);
      const destination = row.melt_destination ?? request.destination;
      const amountSats = row.melt_amount_sats ?? 0;
      const feeSats = row.melt_fee_sats ?? 0;
      if (op?.state === 'finalized') {
        const preimage = (op as { finalizedData?: { preimage?: string } }).finalizedData?.preimage;
        return this.completeMelt(row, { destination, amountSats, feeSats, preimage });
      }
      if (op && (op.state === 'pending' || op.state === 'executing')) {
        return { state: 'pending', paid: false, amountSats, feeSats, destination };
      }
      // Rolled back / failed: the sats are spendable again; start over.
      this.repo.clearMelt(row.id);
    }

    await this.reclaimPayoutToken(manager, row);
    const earned = this.earnedOrThrow(row);
    const availableSats = earned.length * TOKEN_AMOUNT_SATS;
    const { quoteId, amount, fee } = await this.createAffordableMeltQuote(
      manager,
      mintUrl,
      request.destination,
      availableSats,
    );

    const prepared = await manager.ops.melt.prepare({ quote: { mintUrl, quoteId, method: 'bolt11' } });
    this.repo.startMelt(row.id, prepared.id, request.destination, amount, fee);
    let executed: Awaited<ReturnType<Manager['ops']['melt']['execute']>>;
    try {
      executed = await manager.ops.melt.execute(prepared.id);
    } catch (err) {
      const current = await manager.ops.melt.get(prepared.id).catch(() => null);
      if (!current || current.state === 'prepared' || current.state === 'failed' || current.state === 'rolled_back') {
        this.repo.clearMelt(row.id);
      }
      throw err;
    }
    if (executed.state === 'finalized') {
      return this.completeMelt(row, {
        destination: request.destination,
        amountSats: amount,
        feeSats: fee,
        preimage: executed.finalizedData?.preimage,
      });
    }
    return { state: 'pending', paid: false, amountSats: amount, feeSats: fee, destination: request.destination };
  }

  /**
   * Creates a melt quote for the destination, sizing down a Lightning-address
   * invoice when the mint's fee reserve would otherwise make it unaffordable.
   */
  private async createAffordableMeltQuote(
    manager: Manager,
    mintUrl: string,
    destination: string,
    availableSats: number,
  ): Promise<{ quoteId: string; amount: number; fee: number }> {
    let invoice = await resolveDestination(destination, availableSats);
    let quote = await manager.quotes.melt.create({
      mintUrl,
      method: 'bolt11',
      methodData: { invoice },
      unit: 'sat',
    });
    let amount = Number(quote.amount);
    let fee = Number(quote.fee_reserve ?? 0);

    for (let attempt = 0; attempt < 2 && amount + fee > availableSats; attempt++) {
      if (!isLightningAddress(destination)) {
        break;
      }
      const reduced = availableSats - fee;
      if (reduced <= 0) {
        break;
      }
      invoice = await invoiceFromLightningAddress(destination, reduced);
      quote = await manager.quotes.melt.create({
        mintUrl,
        method: 'bolt11',
        methodData: { invoice },
        unit: 'sat',
      });
      amount = Number(quote.amount);
      fee = Number(quote.fee_reserve ?? 0);
    }

    if (amount + fee > availableSats) {
      throw new WalletError('invalid', `can't melt ${amount} sats + ${fee} fee from ${availableSats} available`);
    }
    return { quoteId: quote.quoteId, amount, fee };
  }

  /** Write melted bookkeeping for the session's earned milestones and return the player-facing result. */
  private completeMelt(
    row: SessionRow,
    result: { destination: string; amountSats: number; feeSats: number; preimage?: string },
  ): MeltResponse {
    this.repo.setBundleStates(row.id, this.repo.listUnlocked(row.id), 'melted', Date.now());
    this.repo.finishMelt(row.id, { state: 'melted', ...result });
    return { state: 'melted', paid: true, ...result };
  }

  /** A fresh invoice replaces the session's previous one; retire the old mint op first. */
  private async retirePendingMintOp(manager: Manager, operationId: string | null): Promise<void> {
    if (!operationId || !this.repositories) {
      return;
    }
    try {
      // Only drop operations that cannot settle on their own. A paid or
      // executing op is mid-redemption — leave it for the poll path.
      const op = await manager.ops.mint.get(operationId);
      if (!op || op.state === 'init' || op.state === 'pending') {
        await this.repositories.mintOperationRepository.delete(operationId);
      }
    } catch (err) {
      console.error('mint op retirement failed', operationId, err);
    }
  }
}
