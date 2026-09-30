import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError, type RouteGuard } from './helpers';

export function registerDepositRoutes(app: FastifyInstance, wallet: WalletService, guard: RouteGuard): void {
  app.get('/api/session/:id/deposit', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await wallet.getDepositQuote(id);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });

  app.get('/api/session/:id/deposit/status', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await wallet.getDepositStatus(id);
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
