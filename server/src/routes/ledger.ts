import type { FastifyInstance } from 'fastify';
import type { WalletService } from '../wallet/WalletService';
import { mapWalletError, type RouteGuard } from './helpers';

export function registerLedgerRoutes(app: FastifyInstance, wallet: WalletService, guard: RouteGuard): void {
  app.get('/api/session/:id/ledger', { preHandler: guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const ledger = await wallet.getLedger(id);
      return { ledger };
    } catch (err) {
      return mapWalletError(reply, err);
    }
  });
}
