import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_MINT_URL } from '@cashu-xx/shared';

export type WalletName = 'mock' | 'minibits';

export interface ServerConfig {
  host: string;
  port: number;
  wallet: WalletName;
  clientOrigin: string;
  dbPath: string;
  dataDir: string;
  mintUrl: string;
}

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.join(packageDir, '..', 'data');

export { DEFAULT_MINT_URL };

export function loadConfig(argv: string[] = process.argv.slice(2)): ServerConfig {
  const { values } = parseArgs({
    args: argv,
    options: {
      wallet: { type: 'string' },
      port: { type: 'string' },
      mint: { type: 'string' },
    },
    strict: true,
  });

  const wallet = (values.wallet ?? process.env.WALLET ?? 'mock') as WalletName;
  if (wallet !== 'mock' && wallet !== 'minibits') {
    throw new Error(`unknown wallet "${wallet}" (expected "mock" or "minibits")`);
  }

  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(values.port ?? process.env.PORT ?? 8787),
    wallet,
    clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    dbPath: process.env.DB_PATH ?? path.join(defaultDataDir, 'cashu-xx.db'),
    dataDir: process.env.DATA_DIR ?? defaultDataDir,
    mintUrl: values.mint ?? process.env.MINT_URL ?? DEFAULT_MINT_URL,
  };
}
