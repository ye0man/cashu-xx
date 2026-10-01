import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Repo } from '../src/db/repo';
import { MinibitsWallet } from '../src/wallet/MinibitsWallet';

const state = vi.hoisted(() => ({
  finalized: true,
  executeDelayMs: 0,
  sends: [] as string[],
}));

vi.mock('../src/wallet/coco', () => ({
  openCocoManager: async () => ({
    manager: {
      ops: {
        mint: {
          get: async () => ({ state: state.finalized ? 'finalized' : 'pending' }),
          checkPayment: async () => {},
          finalize: async () => {},
        },
        send: {
          prepare: async () => ({ id: `op-${state.sends.length}` }),
          execute: async (op: { id: string }) => {
            if (state.executeDelayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, state.executeDelayMs));
            }
            state.sends.push(op.id);
            return { token: { op: op.id } };
          },
        },
      },
      wallet: { encodeToken: (token: unknown) => `cashuA${Buffer.from(JSON.stringify(token)).toString('base64url')}` },
    },
    database: {},
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
    state.sends = [];
  });

  it('boots the manager on warmup', async () => {
    const { wallet } = makeWallet();
    await expect(wallet.warmup()).resolves.toBeUndefined();
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
});
