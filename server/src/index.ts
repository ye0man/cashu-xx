import type { MintInfoResponse } from '@cashu-xx/shared';
import { buildApp } from './app';
import { loadConfig } from './config';
import { Repo } from './db/repo';
import { MinibitsWallet } from './wallet/MinibitsWallet';
import { MockWallet } from './wallet/MockWallet';
import type { WalletService } from './wallet/WalletService';
import { verifyMint } from './wallet/mintVerify';

const config = loadConfig();
const repo = new Repo(config.dbPath);

let wallet: WalletService;
if (config.wallet === 'minibits') {
  wallet = new MinibitsWallet(repo, { mintUrl: config.mintUrl, dataDir: config.dataDir });
} else {
  wallet = new MockWallet(repo);
}

let mintInfo: MintInfoResponse = {
  online: false,
  name: '',
  description: '',
  feePpk: 0,
  error: 'not verified yet',
};

const app = await buildApp({
  wallet,
  clientOrigin: config.clientOrigin,
  getMintInfo: () => mintInfo,
  logger: true,
});

mintInfo = await verifyMint(config.mintUrl);
app.log.info(
  { mint: config.mintUrl, wallet: config.wallet, online: mintInfo.online, feePpk: mintInfo.feePpk },
  'mint verification',
);

try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
