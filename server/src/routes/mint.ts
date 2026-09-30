import type { FastifyInstance } from 'fastify';
import type { MintInfoResponse } from '@cashu-xx/shared';

export function registerMintRoutes(
  app: FastifyInstance,
  getMintInfo: () => MintInfoResponse | Promise<MintInfoResponse>,
): void {
  app.get('/api/mint', async (_request, reply) => {
    return reply.send(await getMintInfo());
  });
}
