import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { MintInfoResponse } from '@cashu-xx/shared';
import { registerCombineRoutes } from './routes/combine';
import { registerDepositRoutes } from './routes/deposit';
import { makeGuard } from './routes/helpers';
import { registerLedgerRoutes } from './routes/ledger';
import { registerMintRoutes } from './routes/mint';
import { registerSessionRoutes } from './routes/session';
import { registerUnlockRoutes } from './routes/unlock';
import type { WalletService } from './wallet/WalletService';

export interface BuildAppOptions {
  wallet: WalletService;
  clientOrigin: string;
  getMintInfo?: () => MintInfoResponse | Promise<MintInfoResponse>;
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
  registerCombineRoutes(app, options.wallet, guard);
  registerLedgerRoutes(app, options.wallet, guard);
  registerMintRoutes(app, () => options.getMintInfo?.() ?? { online: false, name: '', description: '', feePpk: 0, error: 'mint info unavailable' });

  return app;
}
