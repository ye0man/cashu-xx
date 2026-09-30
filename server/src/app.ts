import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerDepositRoutes } from './routes/deposit';
import { makeGuard } from './routes/helpers';
import { registerLedgerRoutes } from './routes/ledger';
import { registerSessionRoutes } from './routes/session';
import { registerUnlockRoutes } from './routes/unlock';
import type { WalletService } from './wallet/WalletService';

export interface BuildAppOptions {
  wallet: WalletService;
  clientOrigin: string;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ? { redact: ['req.headers.authorization'] } : false,
  });

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = typeof body === 'string' ? body.trim() : '';
    if (raw.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  });
  app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => {
    done(null, body ?? {});
  });

  await app.register(cors, { origin: options.clientOrigin });

  const guard = makeGuard(options.wallet);
  registerSessionRoutes(app, options.wallet);
  registerDepositRoutes(app, options.wallet, guard);
  registerUnlockRoutes(app, options.wallet, guard);
  registerLedgerRoutes(app, options.wallet, guard);

  return app;
}
