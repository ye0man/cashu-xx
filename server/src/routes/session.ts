import { ClaimBodySchema, CreateSessionBodySchema } from '@cashu-xx/shared';
import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError } from './helpers';

export function registerSessionRoutes(app: FastifyInstance, wallet: WalletService): void {
  app.post('/api/session', async (request, reply) => {
    const parsed = CreateSessionBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid mint URL' });
    }
    try {
      const session = await wallet.createSession(parsed.data.mintUrl);
      return reply.code(201).send(session);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });

  app.post('/api/session/claim', async (request, reply) => {
    const parsed = ClaimBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid claim code' });
    }
    try {
      return await wallet.recoverSession(parsed.data.claimCode);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
