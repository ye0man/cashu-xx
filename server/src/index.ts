import { CURATED_MINTS } from '@cashu-xx/shared';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Repo } from './db/repo';
import { MinibitsWallet } from './wallet/MinibitsWallet';
import { MintDirectory } from './wallet/mintVerify';
import { MockWallet } from './wallet/MockWallet';
import type { WalletService } from './wallet/WalletService';

const config = loadConfig();
const repo = new Repo(config.dbPath);

const directory = new MintDirectory();

let wallet: WalletService;
if (config.wallet === 'minibits') {
  wallet = new MinibitsWallet(repo, {
    mintUrl: config.mintUrl,
    dataDir: config.dataDir,
    // Session creation reuses the cached mint check behind /api/mint(s)
    // instead of a fresh two-request round trip on every ENTER.
    checkMint: (url) => directory.get(url),
  });
} else {
  wallet = new MockWallet(repo);
}

const app = await buildApp({
  wallet,
  clientOrigin: config.clientOrigin,
  getMintInfo: (url) => directory.get(url ?? config.mintUrl),
  getMints: async () => ({
    defaultUrl: config.mintUrl,
    mints: await directory.list(CURATED_MINTS),
  }),
  logger: true,
});

// Listen first: a slow or unreachable mint must never keep the API from starting.
try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

void directory.get(config.mintUrl).then((info) => {
  const log = info.online ? app.log.info.bind(app.log) : app.log.warn.bind(app.log);
  log(
    { mint: config.mintUrl, wallet: config.wallet, online: info.online, feePpk: info.feePpk, error: info.error },
    'mint verification',
  );
});

// Warm the wallet in the background so the first player's invoice isn't gated
// on coco's cold start (repos init + addMint keyset fetch). Never blocks listen.
if (wallet.warmup) {
  const startedAt = Date.now();
  void wallet.warmup().then(
    () => app.log.info({ ms: Date.now() - startedAt }, 'wallet warmed up'),
    (err: unknown) => app.log.warn({ err }, 'wallet warmup failed — will retry on first request'),
  );
}
