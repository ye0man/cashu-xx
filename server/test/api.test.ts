import type { CreateSessionResponse, UnlockResponse } from '@cashu-xx/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { Repo } from '../src/db/repo';
import { MockWallet } from '../src/wallet/MockWallet';

describe('API', () => {
  let app: FastifyInstance;
  let session: CreateSessionResponse;

  beforeAll(async () => {
    app = await buildApp({
      wallet: new MockWallet(new Repo(':memory:')),
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
});
