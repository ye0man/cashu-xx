import type { CombineResponse, CreateSessionResponse, UnlockResponse } from '@cashu-xx/shared';
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
    expect(body.token.startsWith('cashuA')).toBe(true);

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

  it('combines unlocked tokens into one and reports the spent bundles', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/session' });
    const fresh: CreateSessionResponse = created.json();
    const headers = { authorization: `Bearer ${fresh.authToken}` };
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit`, headers });
    await app.inject({ method: 'GET', url: `/api/session/${fresh.sessionId}/deposit/status`, headers });

    const combine = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/combine`,
      headers,
      payload: { milestoneIds: ['impl-coco', 'kimi-test'] },
    });
    expect(combine.statusCode).toBe(200);
    const body: CombineResponse = combine.json();
    expect(body.combinedCount).toBe(2);
    expect(body.amountSats).toBe(20);
    expect(body.skippedRedeemed).toBe(0);
    expect(body.token.startsWith('cashuA')).toBe(true);

    const unlock = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/unlock`,
      headers,
      payload: { milestoneId: 'impl-coco' },
    });
    expect(unlock.statusCode).toBe(410);
    expect(unlock.json().code).toBe('combined');

    const empty = await app.inject({
      method: 'POST',
      url: `/api/session/${fresh.sessionId}/combine`,
      headers,
      payload: { milestoneIds: [] },
    });
    expect(empty.statusCode).toBe(400);
  });
});
