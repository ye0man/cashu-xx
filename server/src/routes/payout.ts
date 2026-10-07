import { MeltBodySchema } from '@cashu-xx/shared';
import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError, type RouteGuard } from './helpers';

export function registerPayoutRoutes(app: FastifyInstance, wallet: WalletService, guard: RouteGuard): void {
  app.get('/api/session/:id/payout', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await wallet.payoutPreview(id);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });

  app.post('/api/session/:id/payout/token', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await wallet.payoutToken(id);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });

  app.post('/api/session/:id/melt', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = MeltBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'enter a Lightning address or bolt11 invoice' });
    }
    try {
      return await wallet.meltSession(id, parsed.data);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
