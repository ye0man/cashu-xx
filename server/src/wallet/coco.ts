import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConsoleLogger, initializeCoco, type Manager } from '@cashu/coco-core';
import { SqliteRepositories } from '@cashu/coco-sqlite';
import Database from 'better-sqlite3';

export interface CocoOptions {
  mintUrl: string;
  dataDir: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export function loadOrCreateSeed(dataDir: string): Uint8Array {
  mkdirSync(dataDir, { recursive: true });
  const seedPath = path.join(dataDir, 'wallet-seed.bin');
  if (existsSync(seedPath)) {
    return new Uint8Array(readFileSync(seedPath));
  }
  const seed = randomBytes(64);
  writeFileSync(seedPath, seed);
  return new Uint8Array(seed);
}

/**
 * Opens the coco wallet manager used by both the game server and the operator
 * CLI. They must never run at the same time — SQLite is single-writer and coco
 * holds in-memory locks — so callers are responsible for that.
 */
export async function openCocoManager(options: CocoOptions): Promise<{ manager: Manager; database: Database.Database }> {
  const seed = loadOrCreateSeed(options.dataDir);
  const database = new Database(path.join(options.dataDir, 'coco.db'));
  const repos = new SqliteRepositories({ database });
  await repos.init();
  const manager = await initializeCoco({
    repo: repos,
    seedGetter: async () => seed,
    logger: new ConsoleLogger('cashu-xx', { level: options.logLevel ?? 'warn' }),
  });
  await manager.mint.addMint(options.mintUrl, { trusted: true });
  return { manager, database };
}
