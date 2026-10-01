import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manager } from '@cashu/coco-core';
import QRCode from 'qrcode';
import { DEFAULT_MINT_URL } from '../config';
import { Repo } from '../db/repo';
import { openCocoManager } from '../wallet/coco';
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

async function loadBundles(repo: Repo, manager: Manager, mintUrl: string): Promise<BundleTokenInfo[]> {
  const out: BundleTokenInfo[] = [];
  for (const row of repo.listAllBundles()) {
    const base = { sessionId: row.session_id, milestoneId: row.milestone_id, state: row.state };
    if (!row.token) {
      out.push({ ...base, secrets: null, sats: 0 });
      continue;
    }
    try {
      const decoded = await manager.wallet.decodeToken(row.token, mintUrl);
      // Only tokens for *our* mint are real; mock/foreign tokens decode to something else.
      if (decoded.mint !== mintUrl) {
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
      secrets: token.proofs.map((proof) => proof.secret),
    });
  }
  return out;
}

async function reportBalance(repo: Repo, manager: Manager, options: Options): Promise<void> {
  const balances = await manager.wallet.balances.total();
  console.log(`\nServer wallet (${options.mintUrl})`);
  console.log(`  spendable : ${Number(balances.spendable)} sats`);
  console.log(`  reserved  : ${Number(balances.reserved)} sats (in-flight sends)`);
  console.log(`  total     : ${Number(balances.total)} sats\n`);

  const bundles = await loadBundles(repo, manager, options.mintUrl);
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
      return { token: manager.wallet.encodeToken(token), amount };
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
  const bundles = await loadBundles(repo, manager, options.mintUrl);
  const plan = planWithdraw(bundles, await loadSends(manager));

  console.log('\nWithdrawal plan');
  for (const line of formatPlan(plan)) {
    console.log(`  ${line}`);
  }

  const balances = await manager.wallet.balances.total();
  console.log(`  Loose spendable balance            : ${Number(balances.spendable)} sats`);
  console.log(`  Estimated token total              : ${Number(balances.spendable) + plan.totals.matchedSats + plan.totals.orphanSats} sats\n`);

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
  console.log(`Reclaimed ${outcome.gained} sats from ${plan.matched.length + plan.orphanSends.length} send(s).`);
  for (const failure of outcome.failures) {
    console.log(`  ! ${failure}`);
  }

  const after = await manager.wallet.balances.total();
  const spendable = Number(after.spendable);
  if (spendable <= 0) {
    console.log('\nNothing spendable to withdraw. (Everything may already be redeemed.)');
    return;
  }

  const { token, amount } = await sendAll(manager, options.mintUrl, spendable);
  const withdrawalsDir = path.join(options.dataDir, 'withdrawals');
  mkdirSync(withdrawalsDir, { recursive: true });
  const file = path.join(withdrawalsDir, `${stamp()}.txt`);
  writeFileSync(
    file,
    `Cashu-XX operator withdrawal\nmint: ${options.mintUrl}\namount: ${amount} sat\ncreated: ${new Date().toISOString()}\n\n${token}\n`,
  );

  console.log(`\nWithdrew ${amount} sats as a single token. Save it in any cashu wallet.`);
  console.log(`Written to ${file}\n`);
  console.log(token);
  console.log('');
  try {
    console.log(await QRCode.toString(token, { type: 'terminal', small: true }));
  } catch {
    console.log('(token too large for a terminal QR — paste the text above or open the file)\n');
  }
  console.log('If you lose this token before redeeming it, just run withdraw again.\n');
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseOptions(rest);

  if (command !== 'balance' && command !== 'withdraw') {
    console.log('usage: npm run wallet -w server -- <balance|withdraw> [--yes] [--data-dir DIR] [--mint URL] [--port N]');
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
  const { manager } = await openCocoManager({
    mintUrl: options.mintUrl,
    dataDir: options.dataDir,
    logLevel: options.debug ? 'info' : 'error',
  });
  process.stderr.write(`Wallet opened in ${Date.now() - startedAt}ms\n`);

  try {
    if (command === 'balance') {
      await reportBalance(repo, manager, options);
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
