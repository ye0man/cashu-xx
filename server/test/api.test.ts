import type { CreateSessionResponse, PayoutTokenResponse, UnlockResponse } from '@cashu-xx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { Repo } from '../src/db/repo';
import { MockWallet } from '../src/wallet/MockWallet';

describe('API', () => {
  let app: FastifyInstance;
  let repo: Repo;
  let session: CreateSessionResponse;

  beforeAll(async () => {
    repo = new Repo(':memory:');
    app = await buildApp({
      wallet: new MockWallet(repo),
      clientOrigin: 'http://localhost:5173',
      logger: false,
    });
    const created = await app.inject({ method: 'POST', url: '/api/session' });
    expect(created.statusCode).toBe(201);
    session = created.json();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects requests without a bearer token', async () => {
    const denied = await app.inject({ method: 'GET', url: `/api/session/${session.sessionId}/deposit` });
    expect(denied.statusCode).toBe(401);
  });

  it('runs deposit → status → unlock → ledger', async () => {
    const headers = { authorization: `Bearer ${session.authToken}` };

    const deposit = await app.inject({ method: 'GET', url: `/api/session/${session.sessionId}/deposit`, headers });
    expect(deposit.statusCode).toBe(200);
    expect(deposit.json().amountSats).toBe(100);

    const status = await app.inject({ method: 'GET', url: `/api/session/${session.sessionId}/deposit/status`, headers });
    expect(status.statusCode).toBe(200);
    expect(status.json().bundlesReady).toBe(true);

    const unlock = await app.inject({
      method: 'POST',
      url: `/api/session/${session.sessionId}/unlock`,
      headers,
      payload: { milestoneId: 'impl-coco' },
    });
    expect(unlock.statusCode).toBe(200);
    const body: UnlockResponse = unlock.json();
    expect(body.milestoneId).toBe('impl-coco');
    expect(body.unlockedAt).toBeGreaterThan(0);

    const ledger = await app.inject({ method: 'GET', url: `/api/session/${session.sessionId}/ledger`, headers });
    expect(ledger.statusCode).toBe(200);
    expect(ledger.json().ledger).toHaveLength(10);
  });

  it('rejects invalid milestone ids and claim codes', async () => {
    const headers = { authorization: `Bearer ${session.authToken}` };
    const badMilestone = await app.inject({
      method: 'POST',
      url: `/api/session/${session.sessionId}/unlock`,
      headers,
      payload: { milestoneId: 'not-a-milestone' },
    });
    expect(badMilestone.statusCode).toBe(400);

    const badClaim = await app.inject({ method: 'POST', url: '/api/session/claim', payload: { claimCode: 'nope' } });
    expect(badClaim.statusCode).toBe(400);
  });

  it('recovers a session with the claim code', async () => {
    const recovered = await app.inject({
      method: 'POST',
      url: '/api/session/claim',
      payload: { claimCode: session.claimCode },
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().sessionId).toBe(session.sessionId);
  });

  it('returns 410 for a token the operator withdrew', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/session' });
    const fresh: CreateSessionResponse = created.json();
    const headers = { authorization: `Bearer ${fresh.authToken}` };
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit`, headers });
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit/status`, headers });

    // Mark a bundle reclaimed as the withdraw CLI would, then try to claim it.
    repo.markReclaimed(fresh.sessionId, 'ceremony');
    const unlock = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/unlock`,
      headers,
      payload: { milestoneId: 'ceremony' },
    });
    expect(unlock.statusCode).toBe(410);
    expect(unlock.json().code).toBe('reclaimed');
  });

  it('issues one combined token for the earned milestones', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/session' });
    const fresh: CreateSessionResponse = created.json();
    const headers = { authorization: `Bearer ${fresh.authToken}` };
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit`, headers });
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit/status`, headers });
    for (const milestoneId of ['impl-coco', 'kimi-test']) {
      await app.inject({ method: 'POST', url: `/api/session/${fresh.sessionId}/unlock`, headers, payload: { milestoneId } });
    }

    const preview = await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/payout`, headers });
    expect(preview.json()).toMatchObject({ state: 'open', earnedCount: 2, earnedSats: 20 });

    const payout = await app.inject({ method: 'POST', url: `/api/session/${fresh.sessionId}/payout/token`, headers });
    expect(payout.statusCode).toBe(200);
    const body: PayoutTokenResponse = payout.json();
    expect(body).toMatchObject({ amountSats: 20, milestoneCount: 2 });
    expect(body.token.startsWith('cashuB')).toBe(true);

    const after = await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/payout`, headers });
    expect(after.json()).toMatchObject({ state: 'token', token: body.token });
  });

  it('melts earned sats to a destination', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/session' });
    const fresh: CreateSessionResponse = created.json();
    const headers = { authorization: `Bearer ${fresh.authToken}` };
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit`, headers });
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit/status`, headers });
    await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/unlock`,
      headers,
      payload: { milestoneId: 'ceremony' },
    });

    const melt = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/melt`,
      headers,
      payload: { destination: 'player@wallet.example' },
    });
    expect(melt.statusCode).toBe(200);
    expect(melt.json()).toMatchObject({ state: 'melted', paid: true, amountSats: 10 });

    const previewAfter = await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/payout`, headers });
    expect(previewAfter.json()).toMatchObject({ state: 'melted', paidSats: 10 });

    const bad = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/melt`,
      headers,
      payload: { destination: '' },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('mint selection & discovery', () => {
  let app: FastifyInstance;
  let requestedMintUrls: string[];

  beforeAll(async () => {
    requestedMintUrls = [];
    app = await buildApp({
      wallet: new MockWallet(new Repo(':memory:')),
      clientOrigin: 'http://localhost:5173',
      getMintInfo: (url) => {
        if (url) {
          requestedMintUrls.push(url);
        }
        return {
          url: url ?? 'https://mint.minibits.cash/Bitcoin',
          online: true,
          name: 'Test mint',
          description: '',
          feePpk: 0,
          compatible: true,
        };
      },
      getMints: () => ({
        defaultUrl: 'https://mint.minibits.cash/Bitcoin',
        mints: [
          {
            url: 'https://mint.minibits.cash/Bitcoin',
            label: 'Minibits',
            online: true,
            name: 'Test mint',
            description: '',
            feePpk: 0,
            compatible: true,
          },
        ],
      }),
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('locks a session to the chosen mint and returns it normalized', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { mintUrl: 'https://Mint.Example/' },
    });
    expect(created.statusCode).toBe(201);
    const body: CreateSessionResponse = created.json();
    expect(body.mintUrl).toBe('https://mint.example');

    const recovered = await app.inject({
      method: 'POST',
      url: '/api/session/claim',
      payload: { claimCode: body.claimCode },
    });
    expect(recovered.json().mintUrl).toBe('https://mint.example');
  });

  it('rejects a malformed mint URL', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/session', payload: { mintUrl: 'not a url' } });
    expect(bad.statusCode).toBe(400);
  });

  it('returns the curated discovery list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/mints' });
    expect(res.statusCode).toBe(200);
    expect(res.json().mints[0].label).toBe('Minibits');
  });

  it('verifies a specific mint URL and rejects a malformed one', async () => {
    const ok = await app.inject({ method: 'GET', url: '/api/mint?url=https%3A%2F%2FMint.Example%2F' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().url).toBe('https://mint.example');
    expect(requestedMintUrls).toContain('https://mint.example');

    const bad = await app.inject({ method: 'GET', url: '/api/mint?url=nope' });
    expect(bad.statusCode).toBe(400);
  });
});
