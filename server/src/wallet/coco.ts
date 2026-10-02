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

// Every "new invoice" creates a coco mint operation. Unpaid ones are never
// retired, and coco re-checks each against the mint during startup recovery, so
// the cold start grows until the invoice screen looks hung. Drop operations that
// can no longer be paid before coco boots. An expired bolt11 quote cannot be
// settled, so pruning it is safe; ops with no expiry fall back to an age cap.
const STALE_MINT_OP_MS = 2 * 60 * 60 * 1000;

async function pruneStaleMintOperations(repos: SqliteRepositories): Promise<number> {
  const pending = await repos.mintOperationRepository.getByState('pending');
  const now = Date.now();
  let pruned = 0;
  for (const op of pending) {
    if (op.state !== 'pending') {
      continue;
    }
    const expiresAt = op.expiry ? op.expiry * 1000 : op.createdAt + STALE_MINT_OP_MS;
    if (now > expiresAt) {
      await repos.mintOperationRepository.delete(op.id);
      pruned += 1;
    }
  }
  return pruned;
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
export async function openCocoManager(options: CocoOptions): Promise<{
  manager: Manager;
  database: Database.Database;
  repositories: SqliteRepositories;
}> {
  const seed = loadOrCreateSeed(options.dataDir);
  const database = new Database(path.join(options.dataDir, 'coco.db'));
  const repos = new SqliteRepositories({ database });
  await repos.init();
  const logger = new ConsoleLogger('cashu-xx', { level: options.logLevel ?? 'warn' });
  const pruned = await pruneStaleMintOperations(repos);
  if (pruned > 0) {
    logger.info(`pruned ${pruned} stale mint operation(s)`);
  }
  const manager = await initializeCoco({
    repo: repos,
    seedGetter: async () => seed,
    logger,
  });
  // Warm the default mint's keysets, but never let a transient outage wedge the
  // whole manager: sessions may use a different mint, and the wallet re-adds the
  // default lazily (ensureMint) if it was down here.
  try {
    await manager.mint.addMint(options.mintUrl, { trusted: true });
  } catch (err) {
    logger.warn(`could not load default mint ${options.mintUrl} at boot: ${(err as Error).message}`);
  }
  return { manager, database, repositories: repos };
}
