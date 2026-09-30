import { UnlockBodySchema } from '@cashu-xx/shared';
import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError, type RouteGuard } from './helpers';

export function registerUnlockRoutes(app: FastifyInstance, wallet: WalletService, guard: RouteGuard): void {
  app.post('/api/session/:id/unlock', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UnlockBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid milestone id' });
    }
    try {
      return await wallet.unlockToken(id, parsed.data.milestoneId);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
