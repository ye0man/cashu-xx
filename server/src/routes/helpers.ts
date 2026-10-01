import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { WalletError, type WalletService } from '../wallet/WalletService';

export type RouteGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function makeGuard(wallet: WalletService): RouteGuard {
  return async (request, reply) => {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const { id } = request.params as { id: string };
    if (!token || !(await wallet.authenticate(id, token))) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  };
}

export function mapWalletError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof WalletError) {
    const status =
      err.code === 'not_found'
        ? 404
        : err.code === 'unauthorized'
          ? 401
          : err.code === 'not_ready'
            ? 409
            : err.code === 'reclaimed'
              ? 410
              : 400;
    return reply.code(status).send({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: 'invalid request body' });
  }
  // Anything else comes from the mint / wallet library (network, mint 5xx, ...).
  // Log it and surface a readable reason instead of a silent 500.
  const message = err instanceof Error ? err.message : String(err);
  reply.log.error({ err }, 'wallet/mint call failed');
  return reply.code(502).send({ error: `mint error: ${message}` });
}
