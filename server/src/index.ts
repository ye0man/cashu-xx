import { buildApp } from './app';
import { loadConfig } from './config';
import { Repo } from './db/repo';
import { MinibitsWallet } from './wallet/MinibitsWallet';
import { MockWallet } from './wallet/MockWallet';
import type { WalletService } from './wallet/WalletService';
import { MintMonitor } from './wallet/mintVerify';

const config = loadConfig();
const repo = new Repo(config.dbPath);

let wallet: WalletService;
if (config.wallet === 'minibits') {
  wallet = new MinibitsWallet(repo, { mintUrl: config.mintUrl, dataDir: config.dataDir });
} else {
  wallet = new MockWallet(repo);
}

const mint = new MintMonitor(config.mintUrl);

const app = await buildApp({
  wallet,
  clientOrigin: config.clientOrigin,
  getMintInfo: () => mint.get(),
  logger: true,
});

// Listen first: a slow or unreachable mint must never keep the API from starting.
try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

void mint.refresh().then((info) => {
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
