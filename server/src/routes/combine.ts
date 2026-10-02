import { CombineBodySchema } from '@cashu-xx/shared';
import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError, type RouteGuard } from './helpers';

export function registerCombineRoutes(app: FastifyInstance, wallet: WalletService, guard: RouteGuard): void {
  app.post('/api/session/:id/combine', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = CombineBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid milestone ids' });
    }
    try {
      return await wallet.combineTokens(id, parsed.data.milestoneIds);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
