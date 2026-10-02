import { mkdirSync } from 'node:fs';
import type { Manager } from '@cashu/coco-core';
import type { SqliteRepositories } from '@cashu/coco-sqlite';
import {
  ENTRY_AMOUNT_SATS,
  isDeadBundleState,
  MILESTONE_IDS,
  normalizeMintUrl,
  TOKEN_AMOUNT_SATS,
  type BundleState,
  type CombineResponse,
  type DepositQuote,
  type DepositStatus,
  type MilestoneId,
  type UnlockResponse,
} from '@cashu-xx/shared';
import type { Repo } from '../db/repo';
import { BaseWallet } from './BaseWallet';
import { openCocoManager } from './coco';
import { verifyMint } from './mintVerify';
import { encodeV3Token } from './token-v3';
import { WalletError } from './WalletService';

export interface MinibitsWalletOptions {
  mintUrl: string;
  dataDir: string;
}

type PreparedSend = Awaited<ReturnType<Manager['ops']['send']['prepare']>>;

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
  private repositories: SqliteRepositories | null = null;
  private readonly splits = new Map<string, Promise<void>>();
  private readonly combines = new Map<string, Promise<CombineResponse>>();
  private readonly mintsEnsured = new Map<string, Promise<void>>();

  constructor(repo: Repo, options: MinibitsWalletOptions) {
    super(repo, options.mintUrl);
    this.mintUrl = options.mintUrl;
    this.dataDir = options.dataDir;
    mkdirSync(this.dataDir, { recursive: true });
  }

  /** The mint this session is locked to (falls back to the server default for pre-upgrade rows). */
  private mintUrlFor(row: { mint_url: string | null }): string {
    return row.mint_url ?? this.mintUrl;
  }

  /** A mint must be reachable before a session can be locked to it (fail before payment, not after). */
  protected override async validateMint(mintUrl: string): Promise<void> {
    const info = await verifyMint(mintUrl);
    if (!info.online) {
      throw new WalletError('invalid', `mint is not reachable (${info.error ?? 'unknown error'})`);
    }
  }

  /** Fetch keysets for a mint once per process; a failed fetch is retried next time. */
  private ensureMint(mintUrl: string): Promise<void> {
    let pending = this.mintsEnsured.get(mintUrl);
    if (!pending) {
      pending = this.manager()
        .then((manager) => manager.mint.addMint(mintUrl, { trusted: true }))
        .then(() => undefined)
        .catch((err: unknown) => {
          this.mintsEnsured.delete(mintUrl);
          throw err;
        });
      this.mintsEnsured.set(mintUrl, pending);
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
    const { manager, repositories } = await openCocoManager({ mintUrl: this.mintUrl, dataDir: this.dataDir });
    this.repositories = repositories;
    return manager;
  }

  /** Boot the coco manager ahead of the first player so the cold start (init + addMint) is off the payment path. */
  async warmup(): Promise<void> {
    await this.manager();
  }

  async getDepositQuote(sessionId: string): Promise<DepositQuote> {
    const row = this.mustGet(sessionId);
    const mintUrl = this.mintUrlFor(row);
    const manager = await this.manager();
    await this.ensureMint(mintUrl);
    await this.retirePendingMintOp(manager, row.mint_op_id);
    const quote = await manager.quotes.mint.create({
      mintUrl,
      method: 'bolt11',
      amount: ENTRY_AMOUNT_SATS,
    });
    const pending = await manager.ops.mint.prepare({
      quote: { mintUrl, quoteId: quote.quoteId, method: 'bolt11' },
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

  async combineTokens(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse> {
    // Serialize per session: two in-flight combines would both see `combining`
    // markers and could issue the reclaimed sats twice. Double-clicks just share
    // the first result.
    const existing = this.combines.get(sessionId);
    if (existing) {
      return existing;
    }
    const pending = this.runCombine(sessionId, milestoneIds).finally(() => {
      this.combines.delete(sessionId);
    });
    this.combines.set(sessionId, pending);
    return pending;
  }

  private async runCombine(sessionId: string, milestoneIds: MilestoneId[]): Promise<CombineResponse> {
    const row = this.mustGet(sessionId);
    const mintUrl = this.mintUrlFor(row);
    const requested = [...new Set(milestoneIds)];
    if (requested.some((id) => !MILESTONE_IDS.includes(id))) {
      throw new WalletError('invalid', 'unknown milestone id');
    }
    if (!this.repo.hasBundles(row.id)) {
      if (row.state !== 'paid' && row.state !== 'minted') {
        throw new WalletError('not_ready', 'tokens not prepared yet — deposit first');
      }
      await this.splitLocked(row.id);
    }
    const manager = await this.manager();
    await this.ensureMint(mintUrl);
    const bundles = this.repo.listBundles(row.id);
    const priorState = new Map(bundles.map((bundle) => [bundle.milestone_id, bundle.state]));
    const wasCombining = new Set(
      bundles.filter((bundle) => bundle.state === 'combining').map((bundle) => bundle.milestone_id),
    );
    const requestedSet = new Set(requested);

    // Fold together the requested tokens *plus* anything a previous attempt left
    // in `combining`. A failed attempt reclaimed those sends — so the sats are
    // sitting in our spendable balance — but never issued the replacement. Retrying
    // (or opening the receptionist again) must finish that job, not error out.
    const target = bundles
      .filter(
        (bundle) =>
          bundle.token && !isDeadBundleState(bundle.state) && (requestedSet.has(bundle.milestone_id) || bundle.state === 'combining'),
      )
      .map((bundle) => bundle.milestone_id);

    if (target.length === 0) {
      throw new WalletError('not_ready', 'no combinable tokens — they may already be redeemed');
    }

    // Write intent before the irreversible reclaim: a crash after this point is
    // recoverable on the next combine.
    this.repo.markCombining(row.id, target);

    const opBySecret = new Map<string, { id: string; state: string }>();
    for (const op of await manager.ops.send.listInFlight()) {
      const token = 'token' in op ? op.token : undefined;
      if (!token) {
        continue;
      }
      for (const proof of token.proofs) {
        opBySecret.set(proof.secret, { id: op.id, state: op.state });
      }
    }

    const combined: MilestoneId[] = [];
    const skipped: MilestoneId[] = [];
    for (const milestoneId of target) {
      const bundle = this.repo.getBundle(row.id, milestoneId);
      if (!bundle?.token) {
        skipped.push(milestoneId);
        continue;
      }
      try {
        const decoded = await manager.wallet.decodeToken(bundle.token, mintUrl);
        if (normalizeMintUrl(decoded.mint) !== mintUrl) {
          throw new Error('token is not for this mint');
        }
        const op = decoded.proofs.map((proof) => opBySecret.get(proof.secret)).find((found) => found !== undefined);
        if (op) {
          // The send is still in flight: reclaiming it returns the sats to our
          // spendable balance so they can be folded into the new token.
          if (op.state === 'prepared') {
            await manager.ops.send.cancel(op.id);
          } else {
            await manager.ops.send.reclaim(op.id);
          }
          combined.push(milestoneId);
        } else if (wasCombining.has(milestoneId)) {
          // No in-flight send, but this was already being combined before this
          // call: a previous attempt reclaimed it, so its sats are spendable now.
          combined.push(milestoneId);
        } else {
          // No in-flight send and we never reclaimed it: the player redeemed it.
          skipped.push(milestoneId);
        }
      } catch {
        skipped.push(milestoneId);
      }
    }

    if (combined.length === 0) {
      // Nothing we could reclaim: undo the intent markers we just set so the
      // untouched tokens stay claimable.
      this.restoreBundleStates(row.id, target, priorState, wasCombining);
      throw new WalletError('not_ready', 'no combinable tokens — they may already be redeemed');
    }

    const amountSats = combined.length * TOKEN_AMOUNT_SATS;
    let token: string;
    try {
      token = await this.sendAmount(manager, mintUrl, amountSats);
    } catch (err) {
      // Leave the `combining` markers in place: the reclaimed sats are still ours
      // and the next combine will pick them up and finish. Only release the ones
      // we did not touch, so they stay claimable in the meantime.
      this.restoreBundleStates(row.id, skipped, priorState, wasCombining);
      throw err;
    }

    const issuedAt = Date.now();
    for (const milestoneId of combined) {
      this.repo.markCombined(row.id, milestoneId, issuedAt);
    }
    this.restoreBundleStates(row.id, skipped, priorState, wasCombining);
    const skippedRedeemed = requested.filter((id) => !combined.includes(id)).length;
    return { token, combinedCount: combined.length, amountSats, skippedRedeemed };
  }

  /** Undo `combining` markers for bundles we ended up not combining (never touches pre-existing recoveries). */
  private restoreBundleStates(
    sessionId: string,
    milestoneIds: MilestoneId[],
    priorState: Map<MilestoneId, BundleState>,
    wasCombining: Set<MilestoneId>,
  ): void {
    for (const milestoneId of milestoneIds) {
      if (wasCombining.has(milestoneId)) {
        continue;
      }
      const prior = priorState.get(milestoneId);
      if (prior && prior !== 'combining') {
        this.repo.setBundleState(sessionId, milestoneId, prior);
      }
    }
  }

  /** Send a fixed amount as one token, stepping down a little only for fee/denomination reasons. */
  private async sendAmount(manager: Manager, mintUrl: string, amount: number): Promise<string> {
    let lastError: unknown;
    for (let tryAmount = amount; tryAmount >= Math.max(1, amount - 20); tryAmount -= 1) {
      let prepared: PreparedSend | null = null;
      try {
        prepared = await manager.ops.send.prepare({
          mintUrl,
          amount: tryAmount,
          unit: 'sat',
        });
        const { token } = await manager.ops.send.execute(prepared);
        return encodeV3Token(token);
      } catch (err) {
        lastError = err;
        // A failed execute can leave the prepared op reserving proofs, starving
        // every later attempt. Cancel it, but only if it never left 'prepared' —
        // a 'pending' op may already have a live token that must be reclaimed.
        if (prepared) {
          try {
            const current = await manager.ops.send.get(prepared.id);
            if (current?.state === 'prepared') {
              await manager.ops.send.cancel(prepared.id);
            }
          } catch {
            // best effort cleanup
          }
        }
      }
    }
    throw new WalletError('not_ready', `could not combine tokens: ${(lastError as Error)?.message ?? 'mint error'}`);
  }

  /** A fresh invoice replaces the session's previous one; retire the old mint op first. */
  private async retirePendingMintOp(manager: Manager, operationId: string | null): Promise<void> {
    if (!operationId || !this.repositories) {
      return;
    }
    try {
      // Only drop operations that cannot settle on their own. A paid or
      // executing op is mid-redemption — leave it for the poll/unlock path.
      const op = await manager.ops.mint.get(operationId);
      if (!op || op.state === 'init' || op.state === 'pending') {
        await this.repositories.mintOperationRepository.delete(operationId);
      }
    } catch (err) {
      console.error('mint op retirement failed', operationId, err);
    }
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
    const row = this.mustGet(sessionId);
    const mintUrl = this.mintUrlFor(row);
    const manager = await this.manager();
    await this.ensureMint(mintUrl);

    // Fee-bearing mints charge per swap, so the ten bundles share the entry
    // amount *net of fees*: measure the per-send fee once and shave it off each
    // bundle (e.g. a 1-sat fee yields ten 9-sat tokens) instead of the split
    // running out of sats and failing on the last token. `sendAmount` steps each
    // bundle down further if the estimate is ever short.
    const perSendFee = await this.measureSendFee(manager, mintUrl, TOKEN_AMOUNT_SATS);
    const bundleAmount = Math.max(1, TOKEN_AMOUNT_SATS - perSendFee);

    const seeds: Array<{ milestoneId: MilestoneId; token: string }> = [];
    for (const milestoneId of MILESTONE_IDS) {
      const token = await this.sendAmount(manager, mintUrl, bundleAmount);
      seeds.push({ milestoneId, token });
    }
    this.repo.createBundles(sessionId, seeds);
  }

  /**
   * Prepare a sample send just to read the mint's input fee (the prepared op
   * reserves proofs, so cancel it immediately). Returns 0 on any failure so a
   * flaky probe never blocks the split.
   */
  private async measureSendFee(manager: Manager, mintUrl: string, amount: number): Promise<number> {
    let prepared: PreparedSend | null = null;
    try {
      prepared = await manager.ops.send.prepare({ mintUrl, amount, unit: 'sat' });
      return Math.max(0, Number(prepared.fee ?? 0));
    } catch {
      return 0;
    } finally {
      if (prepared) {
        try {
          const current = await manager.ops.send.get(prepared.id);
          if (current?.state === 'prepared') {
            await manager.ops.send.cancel(prepared.id);
          }
        } catch {
          // best effort cleanup
        }
      }
    }
  }
}
