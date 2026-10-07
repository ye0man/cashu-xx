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

/**
 * coco treats every never-paid quote as "pending" forever (expiry is not part
 * of its claimability check), so each abandoned invoice is re-subscribed and
 * polled against the mint on every boot. Those polls share coco's per-mint
 * rate limit (20 req/min) with the next player's invoice request, which then
 * queues behind them. Delete quotes that expired unpaid; they can never settle.
 * Quotes still referenced by a live mint operation are kept.
 */
function pruneExpiredUnpaidQuotes(database: Database.Database): number {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fallbackCutoff = Date.now() - STALE_MINT_OP_MS;
  const tables = new Set(
    (database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  const liveQuote = tables.has('coco_cashu_mint_operations')
    ? `AND quoteId NOT IN (SELECT quoteId FROM coco_cashu_mint_operations WHERE quoteId IS NOT NULL AND state NOT IN ('pending', 'init'))`
    : '';
  let pruned = 0;
  if (tables.has('coco_cashu_canonical_mint_quotes')) {
    pruned += database
      .prepare(
        `DELETE FROM coco_cashu_canonical_mint_quotes
         WHERE amountPaid = '0' AND amountIssued = '0'
           AND ((expiry IS NOT NULL AND expiry < ?) OR (expiry IS NULL AND createdAt < ?))
           ${liveQuote}`,
      )
      .run(nowSeconds, fallbackCutoff).changes;
  }
  if (tables.has('coco_cashu_mint_quotes')) {
    pruned += database
      .prepare(`DELETE FROM coco_cashu_mint_quotes WHERE state = 'UNPAID' AND expiry IS NOT NULL AND expiry < ?`)
      .run(nowSeconds).changes;
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
  /** True when the default mint's keysets loaded at boot (no lazy addMint needed). */
  defaultMintReady: boolean;
  /** Boot phase durations in ms, for diagnosing slow cold starts. */
  timings: Record<string, number>;
}> {
  const timings: Record<string, number> = {};
  let mark = Date.now();
  const lap = (name: string): void => {
    const now = Date.now();
    timings[name] = now - mark;
    mark = now;
  };
  const seed = loadOrCreateSeed(options.dataDir);
  const database = new Database(path.join(options.dataDir, 'coco.db'));
  const repos = new SqliteRepositories({ database });
  await repos.init();
  const logger = new ConsoleLogger('cashu-xx', { level: options.logLevel ?? 'warn' });
  const pruned = await pruneStaleMintOperations(repos);
  const prunedQuotes = pruneExpiredUnpaidQuotes(database);
  if (pruned + prunedQuotes > 0) {
    logger.info(`pruned ${pruned} stale mint operation(s), ${prunedQuotes} expired unpaid quote(s)`);
  }
  lap('repos');
  const manager = await initializeCoco({
    repo: repos,
    seedGetter: async () => seed,
    logger,
  });
  lap('initializeCoco');
  // Warm the default mint's keysets, but never let a transient outage wedge the
  // whole manager: sessions may use a different mint, and the wallet re-adds the
  // default lazily (ensureMint) if it was down here.
  let defaultMintReady = false;
  try {
    await manager.mint.addMint(options.mintUrl, { trusted: true });
    defaultMintReady = true;
  } catch (err) {
    logger.warn(`could not load default mint ${options.mintUrl} at boot: ${(err as Error).message}`);
  }
  lap('addMint');
  return { manager, database, repositories: repos, defaultMintReady, timings };
}
