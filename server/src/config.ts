import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export type WalletName = 'mock' | 'minibits';

export interface ServerConfig {
  port: number;
  wallet: WalletName;
  clientOrigin: string;
  dbPath: string;
}

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export function loadConfig(argv: string[] = process.argv.slice(2)): ServerConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      wallet: { type: 'string' },
      port: { type: 'string' },
    },
    strict: true,
  });

  const wallet = (values.wallet ?? process.env.WALLET ?? 'mock') as WalletName;
  if (wallet !== 'mock' && wallet !== 'minibits') {
    throw new Error(`unknown wallet "${wallet}" (expected "mock" or "minibits")`);
  }
  if (wallet === 'minibits') {
    throw new Error('MinibitsWallet lands in P3 (docs/ROADMAP.md) — run with --wallet=mock');
  }

  return {
    port: Number(values.port ?? process.env.PORT ?? 8787),
    wallet,
    clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    dbPath: process.env.DB_PATH ?? path.join(dataDir, 'cashu-xx.db'),
  };
}
