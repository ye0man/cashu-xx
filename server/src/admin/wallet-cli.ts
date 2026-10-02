import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manager } from '@cashu/coco-core';
import type { SqliteRepositories } from '@cashu/coco-sqlite';
import QRCode from 'qrcode';
import { normalizeMintUrl } from '@cashu-xx/shared';
import { DEFAULT_MINT_URL } from '../config';
import { Repo } from '../db/repo';
import { openCocoManager } from '../wallet/coco';
import { encodeV3Token } from '../wallet/token-v3';
import {
  type BundleTokenInfo,
  formatPlan,
  planWithdraw,
  type SendOpInfo,
  type WithdrawPlan,
} from './withdraw';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKUP_FILES = ['cashu-xx.db', 'coco.db', 'coco.db-wal', 'coco.db-shm', 'wallet-seed.bin'];

interface Options {
  dataDir: string;
  mintUrl: string;
  port: number;
  yes: boolean;
  debug: boolean;
}

function parseOptions(argv: string[]): Options {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    dataDir: flag('data-dir') ?? process.env.DATA_DIR ?? path.join(serverDir, 'data'),
    mintUrl: flag('mint') ?? process.env.MINT_URL ?? DEFAULT_MINT_URL,
    port: Number(flag('port') ?? process.env.PORT ?? 8787),
    yes: argv.includes('--yes'),
    debug: argv.includes('--debug'),
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function slug(mintUrl: string): string {
  return mintUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

async function isGameServerUp(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/mint`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

function backup(dataDir: string): string {
  const dir = path.join(dataDir, 'backups', stamp());
  mkdirSync(dir, { recursive: true });
  for (const file of BACKUP_FILES) {
    const src = path.join(dataDir, file);
    if (existsSync(src)) {
      cpSync(src, path.join(dir, file));
    }
  }
  return dir;
}

async function loadBundles(
  repo: Repo,
  manager: Manager,
  sessions: Map<string, string>,
  fallbackMintUrl: string,
): Promise<BundleTokenInfo[]> {
  const out: BundleTokenInfo[] = [];
  for (const row of repo.listAllBundles()) {
    const mintUrl = sessions.get(row.session_id) ?? fallbackMintUrl;
    const base = { sessionId: row.session_id, milestoneId: row.milestone_id, state: row.state, mintUrl };
    if (!row.token) {
      out.push({ ...base, secrets: null, sats: 0 });
      continue;
    }
    try {
      const decoded = await manager.wallet.decodeToken(row.token, mintUrl);
      // Only tokens for *this bundle's* mint are real; mock/foreign tokens decode to something else.
      if (normalizeMintUrl(decoded.mint) !== normalizeMintUrl(mintUrl)) {
        out.push({ ...base, secrets: null, sats: 0 });
        continue;
      }
      out.push({
        ...base,
        secrets: decoded.proofs.map((proof) => proof.secret),
        sats: decoded.proofs.reduce((sum, proof) => sum + Number(proof.amount), 0),
      });
    } catch {
      out.push({ ...base, secrets: null, sats: 0 });
    }
  }
  return out;
}

async function loadSends(manager: Manager): Promise<SendOpInfo[]> {
  const ops = await manager.ops.send.listInFlight();
  const out: SendOpInfo[] = [];
  for (const op of ops) {
    const token = 'token' in op ? op.token : undefined;
    if (!token) {
      continue;
    }
    out.push({
      id: op.id,
      state: op.state,
      amount: Number(op.amount),
      mintUrl: op.mintUrl,
      secrets: token.proofs.map((proof) => proof.secret),
    });
  }
  return out;
}

/** sessionId -> mint URL, falling back to the default for pre-upgrade rows. */
function sessionMints(repo: Repo, fallbackMintUrl: string): Map<string, string> {
  return new Map(repo.listSessions().map((row) => [row.id, row.mint_url ?? fallbackMintUrl]));
}

async function reportBalance(repo: Repo, manager: Manager, options: Options): Promise<void> {
  const balances = await manager.wallet.balances.byMint();
  console.log('\nServer wallet balances');
  let any = false;
  for (const [mintUrl, snapshot] of Object.entries(balances)) {
    if (Number(snapshot.total) === 0) {
      continue;
    }
    any = true;
    console.log(`  ${mintUrl}`);
    console.log(`    spendable : ${Number(snapshot.spendable)} sats`);
    console.log(`    reserved  : ${Number(snapshot.reserved)} sats (in-flight sends)`);
  }
  if (!any) {
    console.log('  (empty)');
  }
  console.log('');

  const bundles = await loadBundles(repo, manager, sessionMints(repo, options.mintUrl), options.mintUrl);
  const sends = await loadSends(manager);
  const plan = planWithdraw(bundles, sends);

  console.log('Game tokens held by the server');
  for (const line of formatPlan(plan)) {
    console.log(`  ${line}`);
  }

  const sessions = new Map<string, { matched: number; sats: number }>();
  for (const { bundle, op } of plan.matched) {
    const entry = sessions.get(bundle.sessionId) ?? { matched: 0, sats: 0 };
    entry.matched += 1;
    entry.sats += op.amount;
    sessions.set(bundle.sessionId, entry);
  }
  if (sessions.size > 0) {
    console.log('\n  Per session (reclaimable):');
    for (const [id, entry] of sessions) {
      console.log(`    ${id.slice(0, 8)}  ${entry.matched} token(s), ${entry.sats} sats`);
    }
  }
  console.log('');
}

interface ReclaimOutcome {
  reclaimed: BundleTokenInfo[];
  gained: number;
  failures: string[];
}

/** Reclaim (pending) or cancel (prepared) every in-flight send. */
async function reclaimAll(manager: Manager, plan: WithdrawPlan): Promise<ReclaimOutcome> {
  const outcome: ReclaimOutcome = { reclaimed: [], gained: 0, failures: [] };
  const seen = new Set<string>();

  // coco has already settled spent sends during startup recovery (see openCocoManager),
  // so anything still in flight here is genuinely unredeemed.
  const pairs = [...plan.matched, ...plan.orphanSends.map((op) => ({ op, bundle: undefined }))];
  let done = 0;
  for (const { op, bundle } of pairs) {
    done += 1;
    process.stderr.write(`\rReclaiming ${done}/${pairs.length}…`);
    const current = await manager.ops.send.get(op.id);
    if (!current) {
      outcome.failures.push(`${op.id}: disappeared`);
      continue;
    }
    if (current.state === 'finalized' || current.state === 'rolled_back') {
      continue;
    }
    try {
      if (current.state === 'pending' || current.state === 'executing' || current.state === 'rolling_back') {
        await manager.ops.send.reclaim(op.id);
      } else if (current.state === 'prepared') {
        await manager.ops.send.cancel(op.id);
      } else {
        outcome.failures.push(`${op.id}: unexpected state ${current.state}`);
        continue;
      }
      outcome.gained += op.amount;
      if (bundle) {
        const key = `${bundle.sessionId}:${bundle.milestoneId}`;
        if (!seen.has(key)) {
          seen.add(key);
          outcome.reclaimed.push(bundle);
        }
      }
    } catch (err) {
      outcome.failures.push(`reclaim ${op.id}: ${(err as Error).message}`);
    }
  }
  process.stderr.write('\n');
  return outcome;
}

function isNetworkError(err: unknown): boolean {
  const message = (err as Error)?.message ?? '';
  return /fetch failed|Failed to fetch mint|network|socket|ECONN|ETIMEDOUT|timeout/i.test(message);
}

async function sendAll(
  manager: Manager,
  mintUrl: string,
  spendable: number,
): Promise<{ token: string; amount: number }> {
  // Try the full balance; step down a little only for fee/denomination reasons.
  // A network error is bubbled up immediately so we never hammer a flaky mint.
  let lastError: unknown;
  for (let amount = spendable; amount >= Math.max(1, spendable - 20); amount -= 1) {
    try {
      const prepared = await manager.ops.send.prepare({ mintUrl, amount, unit: 'sat' });
      const { token } = await manager.ops.send.execute(prepared);
      return { token: encodeV3Token(token), amount };
    } catch (err) {
      lastError = err;
      if (isNetworkError(err)) {
        throw err;
      }
    }
  }
  throw new Error(`could not prepare a send of ~${spendable} sats: ${(lastError as Error)?.message ?? 'unknown'}`);
}

async function withdraw(repo: Repo, manager: Manager, options: Options): Promise<void> {
  const bundles = await loadBundles(repo, manager, sessionMints(repo, options.mintUrl), options.mintUrl);
  const plan = planWithdraw(bundles, await loadSends(manager));

  console.log('\nWithdrawal plan');
  for (const line of formatPlan(plan)) {
    console.log(`  ${line}`);
  }

  const balances = await manager.wallet.balances.byMint();
  const spendableByMint = Object.fromEntries(
    Object.entries(balances)
      .map(([mintUrl, snapshot]) => [mintUrl, Number(snapshot.spendable)] as const)
      .filter(([, spendable]) => spendable > 0),
  );
  const looseTotal = Object.values(spendableByMint).reduce((sum, amount) => sum + amount, 0);
  console.log(`  Loose spendable balance            : ${looseTotal} sats`);
  console.log(`  Estimated token total              : ${looseTotal + plan.totals.matchedSats + plan.totals.orphanSats} sats\n`);

  if (!options.yes) {
    console.log('Dry run. Re-run with --yes to execute (the game server must be stopped).\n');
    return;
  }

  const backupDir = backup(options.dataDir);
  console.log(`Backed up wallets to ${backupDir}\n`);

  const outcome = await reclaimAll(manager, plan);

  for (const bundle of outcome.reclaimed) {
    repo.markReclaimed(bundle.sessionId, bundle.milestoneId);
  }
  // Any combine left in progress is now unrecoverable — the sweep owns those
  // sats. Mark it so a later combine cannot reissue a token with no backing.
  const staleCombines = repo.markAllInProgressReclaimed();
  if (staleCombines > 0) {
    console.log(`Marked ${staleCombines} in-progress combine/melt bundle(s) as reclaimed.`);
  }
  console.log(`Reclaimed ${outcome.gained} sats from ${plan.matched.length + plan.orphanSends.length} send(s).`);
  for (const failure of outcome.failures) {
    console.log(`  ! ${failure}`);
  }

  // Reclaimed and loose sats may now sit across several mints; issue one token
  // per mint so every balance can be swept with a wallet that accepts it.
  const after = await manager.wallet.balances.byMint();
  const remaining = Object.entries(after)
    .map(([mintUrl, snapshot]) => ({ mintUrl, spendable: Number(snapshot.spendable) }))
    .filter((entry) => entry.spendable > 0);
  if (remaining.length === 0) {
    console.log('\nNothing spendable to withdraw. (Everything may already be redeemed.)');
    return;
  }

  const withdrawalsDir = path.join(options.dataDir, 'withdrawals');
  mkdirSync(withdrawalsDir, { recursive: true });
  for (const { mintUrl, spendable } of remaining) {
    const { token, amount } = await sendAll(manager, mintUrl, spendable);
    const file = path.join(withdrawalsDir, `${stamp()}-${slug(mintUrl)}.txt`);
    writeFileSync(
      file,
      `Cashu-XX operator withdrawal\nmint: ${mintUrl}\namount: ${amount} sat\ncreated: ${new Date().toISOString()}\n\n${token}\n`,
    );

    console.log(`\nWithdrew ${amount} sats from ${mintUrl} as a single token. Save it in any cashu wallet.`);
    console.log(`Written to ${file}\n`);
    console.log(token);
    console.log('');
    try {
      console.log(await QRCode.toString(token, { type: 'terminal', small: true }));
    } catch {
      console.log('(token too large for a terminal QR — paste the text above or open the file)\n');
    }
  }
  console.log('If you lose a token before redeeming it, just run withdraw again.\n');
}

/**
 * Recovers sats stranded by a paid-but-unissued mint quote — e.g. a mint that
 * returns an empty `pubkey`, which older coco versions rejected as an ownership
 * conflict. We drop the terminal failed op and re-prepare/finalize the quote.
 */
async function recycle(manager: Manager, repositories: SqliteRepositories): Promise<void> {
  const failed = (await repositories.mintOperationRepository.getByState('failed')).filter(
    (op) => op.method === 'bolt11',
  );
  if (failed.length === 0) {
    console.log('\nNo failed mint operations to recycle.\n');
    return;
  }
  console.log(`\nFound ${failed.length} failed mint operation(s); checking for paid-but-unissued quotes...\n`);

  let recovered = 0;
  for (const op of failed) {
    const quote = await repositories.mintQuoteRepository
      .getMintQuoteById({ mintUrl: op.mintUrl, quoteId: op.quoteId })
      .catch(() => null);
    if (!quote) {
      console.log(`  ${op.id}: no canonical quote on record - skipping`);
      continue;
    }
    const paid = Number(quote.amountPaid ?? 0);
    const issued = Number(quote.amountIssued ?? 0);
    if (paid <= 0 || issued >= paid) {
      console.log(`  ${op.id}: nothing owed (paid ${paid}, issued ${issued})`);
      continue;
    }
    console.log(`  ${op.id}: quote ${op.quoteId} at ${op.mintUrl} paid ${paid}, issued ${issued} - issuing...`);
    try {
      await repositories.mintOperationRepository.delete(op.id);
      const prepared = await manager.ops.mint.prepare({
        quote: { mintUrl: op.mintUrl, quoteId: op.quoteId, method: 'bolt11' },
        amount: Number(quote.amount),
      });
      await manager.ops.mint.checkPayment(prepared.id);
      let current = await manager.ops.mint.get(prepared.id);
      if (current?.state === 'executing') {
        await manager.ops.mint.finalize(prepared.id);
        current = await manager.ops.mint.get(prepared.id);
      }
      if (current?.state === 'finalized') {
        recovered += Number(quote.amount);
        console.log(`    issued ${Number(quote.amount)} sats`);
      } else {
        console.log(`    not finalized (state ${current?.state ?? 'unknown'}) - run recycle again`);
      }
    } catch (err) {
      console.log(`    failed: ${(err as Error).message}`);
    }
  }
  console.log(`\nRecovered ${recovered} sats. Run \`withdraw --yes\` to sweep them out.\n`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseOptions(rest);

  if (command !== 'balance' && command !== 'withdraw' && command !== 'recycle') {
    console.log(
      'usage: npm run wallet -w server -- <balance|withdraw|recycle> [--yes] [--data-dir DIR] [--mint URL] [--port N]',
    );
    process.exitCode = command ? 1 : 0;
    return;
  }

  if (await isGameServerUp(options.port)) {
    console.error(
      `The game server is running on port ${options.port}. Stop it first — two coco/SQLite writers will corrupt the wallet.`,
    );
    process.exitCode = 1;
    return;
  }

  const repo = new Repo(path.join(options.dataDir, 'cashu-xx.db'));
  process.stderr.write('Opening wallet…\n');
  const startedAt = Date.now();
  const { manager, repositories } = await openCocoManager({
    mintUrl: options.mintUrl,
    dataDir: options.dataDir,
    logLevel: options.debug ? 'info' : 'error',
  });
  process.stderr.write(`Wallet opened in ${Date.now() - startedAt}ms\n`);

  // Fetch keysets for every mint sessions have used, not just the default, so
  // multi-mint bundles decode and can be swept.
  const mints = new Set(repo.listSessionMintUrls());
  mints.add(options.mintUrl);
  for (const mintUrl of mints) {
    await manager.mint.addMint(mintUrl, { trusted: true }).catch((err: unknown) => {
      console.error(`  ! could not load mint ${mintUrl}: ${(err as Error).message}`);
    });
  }

  try {
    if (command === 'balance') {
      await reportBalance(repo, manager, options);
    } else if (command === 'recycle') {
      await recycle(manager, repositories);
    } else {
      await withdraw(repo, manager, options);
    }
  } finally {
    repo.close();
  }
  process.exit(process.exitCode ?? 0);
}

void main().catch((err: unknown) => {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
});
