import { isValidMintUrl, normalizeMintUrl, type MintInfoResponse, type MintListResponse } from '@cashu-xx/shared';
import type { FastifyInstance } from 'fastify';

export interface MintRouteDeps {
  /** Verify one mint (defaults to the server's configured default when omitted). */
  getMintInfo: (url?: string) => MintInfoResponse | Promise<MintInfoResponse>;
  /** Live-verified curated list for the picker. */
  getMints: () => MintListResponse | Promise<MintListResponse>;
}

export function registerMintRoutes(app: FastifyInstance, deps: MintRouteDeps): void {
  app.get('/api/mints', async (_request, reply) => {
    return reply.send(await deps.getMints());
  });

  app.get('/api/mint', async (request, reply) => {
    const raw = (request.query as { url?: string } | undefined)?.url;
    if (raw === undefined) {
      return reply.send(await deps.getMintInfo());
    }
    if (!isValidMintUrl(raw)) {
      return reply.code(400).send({ error: 'mint URL must be a valid http(s) address' });
    }
    return reply.send(await deps.getMintInfo(normalizeMintUrl(raw)));
  });
}
