import { buildApp } from './app';
import { loadConfig } from './config';
import { Repo } from './db/repo';
import { MockWallet } from './wallet/MockWallet';

const config = loadConfig();
const repo = new Repo(config.dbPath);
const wallet = new MockWallet(repo);
const app = await buildApp({
  wallet,
  clientOrigin: config.clientOrigin,
  logger: true,
});

try {
  await app.listen({ port: config.port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
