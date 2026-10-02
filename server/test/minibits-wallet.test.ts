import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Repo } from '../src/db/repo';
import { MinibitsWallet } from '../src/wallet/MinibitsWallet';

const state = vi.hoisted(() => ({
  finalized: true,
  executeDelayMs: 0,
  failExecutes: 0,
  sends: [] as string[],
  sentAmounts: [] as number[],
  deletedMintOps: [] as string[],
  inFlight: [] as Array<{ id: string; state: string; token: { proofs: Array<{ secret: string }> } }>,
  reclaimed: [] as string[],
  addedMints: [] as string[],
  mintOnline: true,
  mintFeePpk: 0,
}));

// A current unix-seconds expiry, mirroring a real bolt11 mint quote (1h out).
const quoteExpiry = () => Math.floor(Date.now() / 1000) + 3600;

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
      compatible: state.mintOnline && state.mintFeePpk === 0,
      error: state.mintOnline ? undefined : 'unreachable',
    }),
  };
});

vi.mock('../src/wallet/coco', () => ({
  openCocoManager: async () => ({
    manager: {
      mint: {
        addMint: async (mintUrl: string) => {
          state.addedMints.push(mintUrl);
          return { mintUrl, keysets: [] };
        },
      },
      quotes: {
        mint: {
          create: async () => ({ quoteId: `quote-${Date.now()}`, request: 'lnbc1test', expiry: quoteExpiry() }),
        },
      },
      ops: {
        mint: {
          get: async () => ({ state: state.finalized ? 'finalized' : 'pending' }),
          prepare: async () => ({ id: `mint-op-${Date.now()}` }),
          checkPayment: async () => {},
          finalize: async () => {},
        },
        send: {
          prepare: async (request: { amount?: number } = {}) => ({
            id: `op-${state.sends.length}`,
            amount: request.amount,
            // A fee-bearing mint charges 1 sat per swap in these tests.
            fee: state.mintFeePpk > 0 ? 1 : 0,
          }),
          execute: async (op: { id: string; amount?: number }) => {
            if (state.failExecutes > 0) {
              state.failExecutes -= 1;
              throw new Error('mint rate limited');
            }
            if (state.executeDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.executeDelayMs));
            }
            state.sends.push(op.id);
            state.sentAmounts.push(op.amount ?? 0);
            state.inFlight.push({
              id: op.id,
              state: 'pending',
              token: { proofs: [{ secret: `proof-${op.id}` }] },
            });
            // A flat wallet token (mint + proofs), as coco's send returns.
            return {
              token: {
                mint: 'https://mint.test',
                unit: 'sat',
                proofs: [{ id: 'ks-1', amount: op.amount ?? 10, secret: `proof-${op.id}`, C: '0202' }],
              },
            };
          },
          listInFlight: async () => state.inFlight.map((op) => ({ ...op })),
          get: async (id: string) => ({ id, state: 'prepared', amount: 0 }),
          reclaim: async (id: string) => {
            state.reclaimed.push(id);
            state.inFlight = state.inFlight.filter((op) => op.id !== id);
          },
          cancel: async (id: string) => {
            state.inFlight = state.inFlight.filter((op) => op.id !== id);
          },
        },
      },
      wallet: {
        // Bundles store V3 tokens now, so decode parses the cashuA JSON back.
        decodeToken: async (tokenString: string, mintUrl: string) => {
          const raw = JSON.parse(
            Buffer.from(tokenString.replace(/^cashuA/, ''), 'base64url').toString('utf8'),
          ) as { token: Array<{ mint: string; proofs: Array<{ secret: string }> }> };
          return { mint: mintUrl ?? raw.token[0].mint, proofs: raw.token[0].proofs };
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
  return { repo, wallet: new MinibitsWallet(repo, { mintUrl: 'https://mint.test', dataDir }) };
}

function finalizedSession(repo: Repo, wallet: MinibitsWallet) {
  return wallet.createSession().then((session) => {
    repo.setQuote(session.sessionId, 'quote-1', 'lnbc1test', Date.now() + 60_000);
    repo.setMintOp(session.sessionId, 'mint-op-1');
    repo.setState(session.sessionId, 'awaiting_payment');
    return session;
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('MinibitsWallet background split', () => {
  beforeEach(() => {
    state.finalized = true;
    state.executeDelayMs = 0;
    state.failExecutes = 0;
    state.sends = [];
    state.sentAmounts = [];
    state.deletedMintOps = [];
    state.inFlight = [];
    state.reclaimed = [];
    state.addedMints = [];
    state.mintOnline = true;
    state.mintFeePpk = 0;
  });

  it('locks a new session to the requested mint and loads its keysets', async () => {
    const { repo, wallet } = makeWallet();
    const session = await wallet.createSession('https://other-mint.test');
    expect(session.mintUrl).toBe('https://other-mint.test');
    expect(repo.getSession(session.sessionId)?.mint_url).toBe('https://other-mint.test');

    await wallet.getDepositQuote(session.sessionId);
    expect(state.addedMints).toContain('https://other-mint.test');
  });

  it('accepts a mint that charges input fees', async () => {
    const { wallet } = makeWallet();
    state.mintFeePpk = 100;
    const session = await wallet.createSession('https://fee-mint.test');
    expect(session.mintUrl).toBe('https://fee-mint.test');
  });

  it('shaves the per-send fee off each bundle so the payout nets the fee', async () => {
    const { repo, wallet } = makeWallet();
    state.mintFeePpk = 100;
    const session = await wallet.createSession('https://fee-mint.test');
    repo.setQuote(session.sessionId, 'quote-1', 'lnbc1test', Date.now() + 60_000);
    repo.setMintOp(session.sessionId, 'mint-op-1');
    repo.setState(session.sessionId, 'awaiting_payment');

    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    // 100 sats, 1 sat fee per 10-sat send -> ten 9-sat tokens (100 sats spent).
    expect(repo.listBundles(session.sessionId)).toHaveLength(10);
    expect(state.sentAmounts).toHaveLength(10);
    expect(state.sentAmounts.every((amount) => amount === 9)).toBe(true);
  });

  it('rejects an offline mint', async () => {
    const { wallet } = makeWallet();
    state.mintOnline = false;
    await expect(wallet.createSession('https://down-mint.test')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects a malformed mint URL before hitting the network', async () => {
    const { wallet } = makeWallet();
    await expect(wallet.createSession('not a url')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('boots the manager on warmup', async () => {
    const { wallet } = makeWallet();
    await expect(wallet.warmup()).resolves.toBeUndefined();
  });

  it('retires the previous pending mint op when issuing a fresh invoice', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    state.finalized = false;

    await wallet.getDepositQuote(session.sessionId);

    expect(state.deletedMintOps).toContain('mint-op-1');
    expect(repo.getSession(session.sessionId)?.mint_op_id).not.toBe('mint-op-1');
  });

  it('keeps a finalized mint op when issuing a fresh invoice', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    state.finalized = true;
    state.deletedMintOps = [];

    await wallet.getDepositQuote(session.sessionId);

    expect(state.deletedMintOps).toHaveLength(0);
  });

  it('reports bundlesReady immediately on finalize, without waiting for the ten sends', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);

    const status = await wallet.getDepositStatus(session.sessionId);
    expect(status).toMatchObject({ paid: true, bundlesReady: true, minted: false });
    // the slow sends are not on the response path
    expect(state.sends).toHaveLength(0);

    await waitFor(() => repo.hasBundles(session.sessionId));
    expect(repo.listBundles(session.sessionId)).toHaveLength(10);
    expect(state.sends).toHaveLength(10);
  });

  it('waits for the background split when a token is claimed early', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    state.executeDelayMs = 25;

    await wallet.getDepositStatus(session.sessionId); // confirm payment, kick the background split
    const first = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    expect(first.token.startsWith('cashuA')).toBe(true);
    expect(state.sends).toHaveLength(10);

    const again = await wallet.unlockToken(session.sessionId, 'impl-rusty');
    expect(again.token).toBe(first.token);
  });

  it('stays awaiting payment until the mint operation is finalized', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    state.finalized = false;

    const status = await wallet.getDepositStatus(session.sessionId);
    expect(status).toMatchObject({ paid: false, minted: false, bundlesReady: false });
    expect(state.sends).toHaveLength(0);
  });

  it('combines unlocked tokens by reclaiming their sends into one token', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    const result = await wallet.combineTokens(session.sessionId, ['impl-rusty', 'kimi-test']);
    expect(result.combinedCount).toBe(2);
    expect(result.amountSats).toBe(20);
    expect(result.skippedRedeemed).toBe(0);
    // Player-facing tokens are V3 (cashuA…), the format every wallet parses.
    expect(result.token.startsWith('cashuA')).toBe(true);
    const parsed = JSON.parse(Buffer.from(result.token.slice(6), 'base64url').toString('utf8')) as {
      token: Array<{ mint: string; proofs: Array<{ amount: number; secret: string }> }>;
    };
    expect(parsed.token[0].mint).toBe('https://mint.test');
    expect(parsed.token[0].proofs).toHaveLength(1);
    expect(parsed.token[0].proofs[0].amount).toBe(20);
    expect(parsed.token[0].proofs[0].secret).toBe('proof-op-10');
    expect(state.reclaimed).toEqual(['op-0', 'op-4']);
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('combined');
    expect(repo.getBundle(session.sessionId, 'kimi-test')?.state).toBe('combined');
    await expect(wallet.unlockToken(session.sessionId, 'impl-rusty')).rejects.toMatchObject({
      code: 'combined',
    });
  });

  it('skips tokens whose sends already settled when combining', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    // impl-rusty's op-0 is gone from the in-flight set: the player redeemed it.
    state.inFlight = state.inFlight.filter((op) => op.id !== 'op-0');

    const result = await wallet.combineTokens(session.sessionId, ['impl-rusty', 'kimi-test']);
    expect(result.combinedCount).toBe(1);
    expect(result.skippedRedeemed).toBe(1);
    expect(result.amountSats).toBe(10);
    expect(state.reclaimed).toEqual(['op-4']);
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('locked');
    expect(repo.getBundle(session.sessionId, 'kimi-test')?.state).toBe('combined');
  });

  it('refuses to combine when every requested token is already redeemed', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    state.inFlight = [];
    await expect(wallet.combineTokens(session.sessionId, ['impl-rusty'])).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('locked');
  });

  it('keeps reclaimed tokens recoverable when the combined send fails, then finishes on retry', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    // Every attempt to send the combined token fails: the old sends are still
    // reclaimed, but the bundles must be left recoverable (`combining`).
    state.failExecutes = 20;
    await expect(wallet.combineTokens(session.sessionId, ['impl-rusty', 'kimi-test'])).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('combining');
    expect(repo.getBundle(session.sessionId, 'kimi-test')?.state).toBe('combining');
    expect(state.reclaimed).toEqual(['op-0', 'op-4']);
    expect(state.sends).toHaveLength(10);

    // Retry: no in-flight sends remain for them, but they are recovered from the
    // `combining` marker instead of erroring "no combinable tokens".
    state.failExecutes = 0;
    const result = await wallet.combineTokens(session.sessionId, ['impl-rusty', 'kimi-test']);
    expect(result.combinedCount).toBe(2);
    expect(result.amountSats).toBe(20);
    expect(result.skippedRedeemed).toBe(0);
    expect(result.token.startsWith('cashuA')).toBe(true);
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('combined');
    expect(repo.getBundle(session.sessionId, 'kimi-test')?.state).toBe('combined');
  });

  it('recovers a stranded combine even when the retry asks for a different milestone', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    state.failExecutes = 10;
    await expect(wallet.combineTokens(session.sessionId, ['impl-rusty'])).rejects.toMatchObject({
      code: 'not_ready',
    });
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('combining');

    state.failExecutes = 0;
    // Asking for a *different* milestone still sweeps the stranded one in.
    const result = await wallet.combineTokens(session.sessionId, ['ceremony']);
    expect(result.combinedCount).toBe(2);
    expect(result.token.startsWith('cashuA')).toBe(true);
    expect(repo.getBundle(session.sessionId, 'impl-rusty')?.state).toBe('combined');
    expect(repo.getBundle(session.sessionId, 'ceremony')?.state).toBe('combined');
  });

  it('shares a single in-flight combine between concurrent callers', async () => {
    const { repo, wallet } = makeWallet();
    const session = await finalizedSession(repo, wallet);
    await wallet.getDepositStatus(session.sessionId);
    await waitFor(() => repo.hasBundles(session.sessionId));

    state.executeDelayMs = 25;
    const [first, second] = await Promise.all([
      wallet.combineTokens(session.sessionId, ['impl-rusty']),
      wallet.combineTokens(session.sessionId, ['impl-rusty']),
    ]);
    expect(first).toBe(second);
    // Only one reclaim and one combined send, even though combine was called twice.
    expect(state.reclaimed).toEqual(['op-0']);
    expect(state.sends).toHaveLength(11);
  });
});
