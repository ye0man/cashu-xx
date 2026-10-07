import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getDecodedToken } from '@cashu/cashu-ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Repo } from '../src/db/repo';
import { MinibitsWallet } from '../src/wallet/MinibitsWallet';

type SendOp = {
  id: string;
  state: 'prepared' | 'pending' | 'finalized' | 'rolled_back';
  amount: number;
  needsSwap: boolean;
  inputProofSecrets: string[];
  token?: { mint: string; unit: string; proofs: Array<Record<string, unknown>> };
};

const state = vi.hoisted(() => ({
  finalized: true,
  executeDelayMs: 0,
  failExecutes: 0,
  /** Execute leaves a live token behind and *then* throws (crash after the swap). */
  crashAfterExecute: false,
  /** Proofs an exact-match send would hand out as-is (no swap). */
  exactInputs: 3,
  needsSwap: false,
  balance: 1000,
  ops: new Map<string, SendOp>(),
  sendCount: 0,
  reclaimed: [] as string[],
  executedAmounts: [] as number[],
  deletedMintOps: [] as string[],
  addedMints: [] as string[],
  checkPayments: 0,
  mintOnline: true,
  mintFeePpk: 0,
  nut20: true,
  mintQuoteCreateInputs: [] as Array<Record<string, unknown>>,
  meltAmount: 30,
  meltFeeReserve: 0,
  meltExecuteState: 'finalized' as 'finalized' | 'pending',
  meltGetState: 'finalized' as 'finalized' | 'pending' | 'failed',
}));

const quoteExpiry = () => Math.floor(Date.now() / 1000) + 3600;
const KEYSET_ID = '00ad268c4d1f5826';
const decode = (token: string) => getDecodedToken(token, [KEYSET_ID]);
const hex = (seed: string, length: number) =>
  Buffer.from(seed.padEnd(length, '0')).toString('hex').slice(0, length).padEnd(length, '0');

function proofsFor(opId: string, amount: number, count: number): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => ({
    id: '00ad268c4d1f5826',
    amount: index === 0 ? amount - (count - 1) : 1,
    secret: hex(`${opId}-${index}`, 64),
    C: `02${hex(`C-${opId}-${index}`, 64)}`,
    dleq: { e: hex('e', 64), s: hex('s', 64), r: hex('r', 64) },
  }));
}

vi.mock('../src/wallet/mintVerify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/wallet/mintVerify')>();
  return {
    ...actual,
    verifyMint: async (mintUrl: string) => ({
      url: mintUrl,
      online: state.mintOnline,
      name: 'Test mint',
      description: '',
      feePpk: state.mintFeePpk,
      compatible: state.mintOnline,
      error: state.mintOnline ? undefined : 'unreachable',
    }),
  };
});

vi.mock('../src/wallet/coco', () => ({
  openCocoManager: async () => ({
    defaultMintReady: true,
    timings: {},
    manager: {
      mint: {
        addMint: async (mintUrl: string) => {
          state.addedMints.push(mintUrl);
          return { mintUrl, keysets: [] };
        },
        getMintInfo: async () => ({ name: 'Test mint', nuts: state.nut20 ? { '20': { supported: true } } : {} }),
      },
      quotes: {
        mint: {
          create: async (input: Record<string, unknown> = {}) => {
            state.mintQuoteCreateInputs.push(input);
            return { quoteId: `quote-${Date.now()}`, request: 'lnbc1test', expiry: quoteExpiry() };
          },
        },
        melt: {
          create: async () => ({
            quoteId: 'melt-quote-1',
            amount: state.meltAmount,
            fee_reserve: state.meltFeeReserve,
            request: 'lnbc1melt',
          }),
        },
      },
      ops: {
        melt: {
          prepare: async () => ({ id: 'melt-op-1', state: 'prepared' }),
          execute: async () =>
            state.meltExecuteState === 'finalized'
              ? { id: 'melt-op-1', state: 'finalized', finalizedData: { preimage: 'preimage-1' } }
              : { id: 'melt-op-1', state: 'pending' },
          get: async () => ({ id: 'melt-op-1', state: state.meltGetState }),
        },
        mint: {
          get: async () => ({ state: state.finalized ? 'finalized' : 'pending' }),
          prepare: async () => ({ id: `mint-op-${Date.now()}` }),
          checkPayment: async () => {
            state.checkPayments += 1;
          },
          finalize: async () => {},
        },
        send: {
          prepare: async ({ amount }: { amount: number }) => {
            const id = `op-${state.sendCount++}`;
            const inputs = state.needsSwap ? 2 : state.exactInputs;
            const op: SendOp = {
              id,
              state: 'prepared',
              amount,
              needsSwap: state.needsSwap,
              inputProofSecrets: Array.from({ length: inputs }, (_, index) => `${id}-in-${index}`),
            };
            state.ops.set(id, op);
            return { ...op, fee: 0 };
          },
          execute: async (prepared: { id: string }) => {
            const op = state.ops.get(prepared.id);
            if (op?.state !== 'prepared') {
              throw new Error('not prepared');
            }
            if (state.failExecutes > 0) {
              state.failExecutes -= 1;
              throw new Error('mint rate limited');
            }
            if (state.executeDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.executeDelayMs));
            }
            op.state = 'pending';
            // A swap mints the send amount in a compact split; an exact match hands out the inputs.
            const count = op.needsSwap ? 2 : op.inputProofSecrets.length;
            op.token = { mint: 'https://mint.test', unit: 'sat', proofs: proofsFor(op.id, op.amount, count) };
            state.executedAmounts.push(op.amount);
            if (state.crashAfterExecute) {
              state.crashAfterExecute = false;
              throw new Error('connection reset after swap');
            }
            return { operation: { ...op }, token: op.token };
          },
          get: async (id: string) => {
            const op = state.ops.get(id);
            return op ? { ...op } : null;
          },
          cancel: async (id: string) => {
            const op = state.ops.get(id);
            if (op) {
              op.state = 'rolled_back';
            }
          },
          reclaim: async (id: string) => {
            const op = state.ops.get(id);
            if (op) {
              op.state = 'rolled_back';
              state.reclaimed.push(id);
              // Reclaiming the whole balance is the consolidation swap: proofs come back compact.
              if (op.amount === state.balance) {
                state.exactInputs = 2;
              }
            }
          },
        },
      },
      wallet: {
        balances: {
          byMint: async () => ({ 'https://mint.test': { spendable: state.balance, reserved: 0, total: state.balance } }),
        },
      },
    },
    database: {},
    repositories: {
      mintOperationRepository: {
        delete: async (id: string) => {
          state.deletedMintOps.push(id);
        },
      },
    },
  }),
}));

function makeWallet(): { repo: Repo; wallet: MinibitsWallet } {
  const repo = new Repo(':memory:');
  const dataDir = mkdtempSync(path.join(tmpdir(), 'cashu-xx-test-'));
  return {
    repo,
    wallet: new MinibitsWallet(repo, { mintUrl: 'https://mint.test', dataDir, logTimings: false }),
  };
}

async function awaitingSession(repo: Repo, wallet: MinibitsWallet) {
  const session = await wallet.createSession();
  repo.setQuote(session.sessionId, 'quote-1', 'lnbc1test', Date.now() + 60_000);
  repo.setMintOp(session.sessionId, 'mint-op-1');
  repo.setState(session.sessionId, 'awaiting_payment');
  return session;
}

async function playedSession(repo: Repo, wallet: MinibitsWallet, milestones = ['impl-rusty', 'impl-coco', 'ceremony']) {
  const session = await awaitingSession(repo, wallet);
  await wallet.getDepositStatus(session.sessionId);
  for (const milestoneId of milestones) {
    await wallet.unlockToken(session.sessionId, milestoneId as 'impl-rusty');
  }
  return session;
}

describe('MinibitsWallet', () => {
  beforeEach(() => {
    Object.assign(state, {
      finalized: true,
      executeDelayMs: 0,
      failExecutes: 0,
      crashAfterExecute: false,
      exactInputs: 3,
      needsSwap: false,
      balance: 1000,
      ops: new Map(),
      sendCount: 0,
      reclaimed: [],
      executedAmounts: [],
      deletedMintOps: [],
      addedMints: [],
      checkPayments: 0,
      mintOnline: true,
      mintFeePpk: 0,
      nut20: true,
      mintQuoteCreateInputs: [],
      meltAmount: 30,
      meltFeeReserve: 0,
      meltExecuteState: 'finalized',
      meltGetState: 'finalized',
    });
  });

  describe('entry invoice', () => {
    it('locks the mint quote when the mint supports NUT-20', async () => {
      const { wallet } = makeWallet();
      const session = await wallet.createSession();
      await wallet.getDepositQuote(session.sessionId);
      expect(state.mintQuoteCreateInputs).toHaveLength(1);
      expect(state.mintQuoteCreateInputs[0]?.locked).toBe(true);
    });

    it('does not lock the mint quote when the mint lacks NUT-20', async () => {
      state.nut20 = false;
      const { wallet } = makeWallet();
      const session = await wallet.createSession();
      await wallet.getDepositQuote(session.sessionId);
      expect(state.mintQuoteCreateInputs[0]?.locked).toBe(false);
    });

    it('does not re-fetch the default mint the boot already loaded', async () => {
      const { wallet } = makeWallet();
      const session = await wallet.createSession();
      await wallet.getDepositQuote(session.sessionId);
      await wallet.getDepositQuote(session.sessionId);
      expect(state.addedMints).toEqual([]);
    });

    it('locks a new session to the requested mint and loads its keysets once', async () => {
      const { repo, wallet } = makeWallet();
      const session = await wallet.createSession('https://other-mint.test');
      expect(session.mintUrl).toBe('https://other-mint.test');
      expect(repo.getSession(session.sessionId)?.mint_url).toBe('https://other-mint.test');
      await wallet.getDepositQuote(session.sessionId);
      await wallet.getDepositQuote(session.sessionId);
      expect(state.addedMints).toEqual(['https://other-mint.test']);
    });

    it('vets the mint through the injected (cached) check', async () => {
      const repo = new Repo(':memory:');
      const checked: string[] = [];
      const wallet = new MinibitsWallet(repo, {
        mintUrl: 'https://mint.test',
        dataDir: mkdtempSync(path.join(tmpdir(), 'cashu-xx-test-')),
        logTimings: false,
        checkMint: async (url) => {
          checked.push(url);
          return { url, online: true, name: 'cached', description: '', feePpk: 0, compatible: true };
        },
      });
      await wallet.createSession('https://cached-mint.test');
      expect(checked).toEqual(['https://cached-mint.test']);
    });

    it('accepts a fee mint, rejects an offline or malformed one', async () => {
      const { wallet } = makeWallet();
      state.mintFeePpk = 100;
      expect((await wallet.createSession('https://fee-mint.test')).mintUrl).toBe('https://fee-mint.test');
      state.mintOnline = false;
      await expect(wallet.createSession('https://down-mint.test')).rejects.toMatchObject({ code: 'invalid' });
      await expect(wallet.createSession('not a url')).rejects.toMatchObject({ code: 'invalid' });
    });

    it('boots the manager on warmup', async () => {
      const { wallet } = makeWallet();
      await expect(wallet.warmup()).resolves.toBeUndefined();
    });

    it('retires the previous pending mint op when issuing a fresh invoice', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      state.finalized = false;
      await wallet.getDepositQuote(session.sessionId);
      expect(state.deletedMintOps).toContain('mint-op-1');
      expect(repo.getSession(session.sessionId)?.mint_op_id).not.toBe('mint-op-1');
    });

    it('keeps a finalized mint op when issuing a fresh invoice', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      await wallet.getDepositQuote(session.sessionId);
      expect(state.deletedMintOps).toHaveLength(0);
    });
  });

  describe('payment status', () => {
    it('opens the ledger on finalize without any sends', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      const status = await wallet.getDepositStatus(session.sessionId);
      expect(status).toMatchObject({ paid: true, minted: true, bundlesReady: true });
      expect(repo.listBundles(session.sessionId)).toHaveLength(10);
      expect(state.sendCount).toBe(0);
      expect(repo.isLegacy(session.sessionId)).toBe(false);
    });

    it('stays awaiting payment until the mint operation is finalized', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      state.finalized = false;
      const status = await wallet.getDepositStatus(session.sessionId);
      expect(status).toMatchObject({ paid: false, minted: false, bundlesReady: false });
    });

    it('throttles explicit payment checks against the mint', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      state.finalized = false;
      await wallet.getDepositStatus(session.sessionId);
      await wallet.getDepositStatus(session.sessionId);
      await wallet.getDepositStatus(session.sessionId);
      expect(state.checkPayments).toBe(1);
    });

    it('relies on the watcher right after a fresh invoice', async () => {
      const { repo, wallet } = makeWallet();
      const session = await awaitingSession(repo, wallet);
      state.finalized = false;
      await wallet.getDepositQuote(session.sessionId);
      await wallet.getDepositStatus(session.sessionId);
      expect(state.checkPayments).toBe(0);
    });
  });

  describe('combined payout token', () => {
    it('issues one compact V4 token for exactly the earned sats, without DLEQ', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      const payout = await wallet.payoutToken(session.sessionId);

      expect(payout).toMatchObject({ amountSats: 30, milestoneCount: 3 });
      expect(state.executedAmounts).toEqual([30]);
      expect(payout.token.startsWith('cashuB')).toBe(true);
      const decoded = decode(payout.token);
      expect(decoded.mint).toBe('https://mint.test');
      expect(decoded.proofs).toHaveLength(3);
      expect(decoded.proofs.every((proof) => proof.dleq === undefined)).toBe(true);
      // A handful of proofs stays comfortably inside a scannable QR.
      expect(payout.token.length).toBeLessThan(600);

      const ledger = repo.listBundles(session.sessionId);
      expect(ledger.filter((row) => row.state === 'claimed')).toHaveLength(3);
      expect(ledger.filter((row) => row.state === 'locked')).toHaveLength(7);
    });

    it('returns the same token on repeat and concurrent calls', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.executeDelayMs = 20;
      const [first, second] = await Promise.all([
        wallet.payoutToken(session.sessionId),
        wallet.payoutToken(session.sessionId),
      ]);
      expect(first).toBe(second);
      const third = await wallet.payoutToken(session.sessionId);
      expect(third.token).toBe(first.token);
      expect(state.executedAmounts).toEqual([30]);
    });

    it('consolidates a fragmented wallet before handing out a long exact match', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.exactInputs = 12;

      const payout = await wallet.payoutToken(session.sessionId);
      const decoded = decode(payout.token);
      expect(decoded.proofs).toHaveLength(2);
      // op-0: the fragmented attempt (cancelled), op-1: whole-balance self send, reclaimed.
      expect(state.ops.get('op-0')?.state).toBe('rolled_back');
      expect(state.reclaimed).toEqual(['op-1']);
      expect(state.executedAmounts).toEqual([1000, 30]);
    });

    it('releases a prepared send when execute fails, then succeeds on retry', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.failExecutes = 1;
      await expect(wallet.payoutToken(session.sessionId)).rejects.toThrow('rate limited');
      expect(state.ops.get('op-0')?.state).toBe('rolled_back');
      expect(repo.getSession(session.sessionId)?.claim_op_id).toBeNull();
      expect(repo.listUnlocked(session.sessionId)).toHaveLength(3);

      const payout = await wallet.payoutToken(session.sessionId);
      expect(payout.amountSats).toBe(30);
    });

    it('recovers the token of a send that went through before a crash', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.crashAfterExecute = true;
      await expect(wallet.payoutToken(session.sessionId)).rejects.toThrow('connection reset');
      expect(repo.getSession(session.sessionId)?.claim_op_id).toBe('op-0');

      const payout = await wallet.payoutToken(session.sessionId);
      expect(decode(payout.token).proofs[0]?.secret).toBe(state.ops.get('op-0')?.token?.proofs[0]?.secret);
      // No second payment.
      expect(state.executedAmounts).toEqual([30]);
    });

    it('refuses a payout with nothing earned', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet, []);
      await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'not_ready' });
    });

    it('refuses a pre-ledger session', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      repo.setBundleToken(session.sessionId, 'hidden-pos', 'cashuAlegacy');
      await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'reclaimed' });
    });
  });

  describe('Lightning melt', () => {
    it('melts the earned sats', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      const result = await wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' });
      expect(result).toMatchObject({ state: 'melted', paid: true, amountSats: 30, feeSats: 0, preimage: 'preimage-1' });
      expect(repo.listBundles(session.sessionId).filter((row) => row.state === 'melted')).toHaveLength(3);
      expect(await wallet.payoutPreview(session.sessionId)).toMatchObject({ state: 'melted', paidSats: 30 });
      await expect(wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' })).rejects.toMatchObject({
        code: 'reclaimed',
      });
    });

    it('takes back an unredeemed payout token before melting', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      await wallet.payoutToken(session.sessionId);
      const result = await wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' });
      expect(result.state).toBe('melted');
      expect(state.reclaimed).toEqual(['op-0']);
      expect(repo.getSession(session.sessionId)?.claim_token).toBeNull();
    });

    it('refuses to melt once the payout token was redeemed', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      await wallet.payoutToken(session.sessionId);
      const op = state.ops.get('op-0');
      if (op) {
        op.state = 'finalized';
      }
      await expect(wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' })).rejects.toMatchObject({
        code: 'reclaimed',
      });
    });

    it('resumes a pending melt instead of paying twice', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.meltExecuteState = 'pending';
      state.meltGetState = 'pending';
      const first = await wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' });
      expect(first.state).toBe('pending');
      expect((await wallet.payoutPreview(session.sessionId)).state).toBe('melt_pending');
      await expect(wallet.payoutToken(session.sessionId)).rejects.toMatchObject({ code: 'not_ready' });

      state.meltGetState = 'finalized';
      const second = await wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' });
      expect(second).toMatchObject({ state: 'melted', paid: true, amountSats: 30 });
      expect(repo.listBundles(session.sessionId).filter((row) => row.state === 'melted')).toHaveLength(3);
    });

    it('refuses a melt the earned sats cannot cover', async () => {
      const { repo, wallet } = makeWallet();
      const session = await playedSession(repo, wallet);
      state.meltAmount = 200;
      await expect(wallet.meltSession(session.sessionId, { destination: 'lnbc1meltinvoice' })).rejects.toMatchObject({
        code: 'invalid',
      });
    });
  });
});
