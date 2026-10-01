import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BundleState, MilestoneId, SessionState } from '@cashu-xx/shared';
import Database from 'better-sqlite3';

export interface SessionRow {
  id: string;
  claim_code: string;
  auth_token: string;
  quote_id: string | null;
  mint_op_id: string | null;
  invoice: string | null;
  quote_expires_at: number | null;
  state: SessionState;
  created_at: number;
}

export interface BundleRow {
  session_id: string;
  milestone_id: MilestoneId;
  token: string | null;
  state: BundleState;
  unlocked_at: number | null;
  issued_at: number | null;
}

export interface BundleSeed {
  milestoneId: MilestoneId;
  token: string;
}

export class Repo {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
    this.db.exec(schema);
    this.migrate();
  }

  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'mint_op_id')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN mint_op_id TEXT');
    }
  }

  createSession(row: SessionRow): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, claim_code, auth_token, quote_id, mint_op_id, invoice, quote_expires_at, state, created_at)
         VALUES (@id, @claim_code, @auth_token, @quote_id, @mint_op_id, @invoice, @quote_expires_at, @state, @created_at)`,
      )
      .run(row);
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  getSessionByClaimCode(claimCode: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE claim_code = ?').get(claimCode) as SessionRow | undefined;
  }

  setQuote(id: string, quoteId: string, invoice: string, expiresAt: number): void {
    this.db
      .prepare('UPDATE sessions SET quote_id = ?, invoice = ?, quote_expires_at = ? WHERE id = ?')
      .run(quoteId, invoice, expiresAt, id);
  }

  setMintOp(id: string, mintOpId: string): void {
    this.db.prepare('UPDATE sessions SET mint_op_id = ? WHERE id = ?').run(mintOpId, id);
  }

  setState(id: string, state: SessionState): void {
    this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?').run(state, id);
  }

  createBundles(sessionId: string, seeds: BundleSeed[]): void {
    const insert = this.db.prepare(
      `INSERT INTO bundles (session_id, milestone_id, token, state, unlocked_at, issued_at)
       VALUES (?, ?, ?, 'locked', NULL, NULL)`,
    );
    const tx = this.db.transaction((entries: BundleSeed[]) => {
      for (const entry of entries) {
        insert.run(sessionId, entry.milestoneId, entry.token);
      }
    });
    tx(seeds);
  }

  hasBundles(sessionId: string): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM bundles WHERE session_id = ?').get(sessionId) as { n: number };
    return row.n > 0;
  }

  getBundle(sessionId: string, milestoneId: MilestoneId): BundleRow | undefined {
    return this.db
      .prepare('SELECT * FROM bundles WHERE session_id = ? AND milestone_id = ?')
      .get(sessionId, milestoneId) as BundleRow | undefined;
  }

  markIssued(sessionId: string, milestoneId: MilestoneId, at: number): void {
    this.db
      .prepare(
        `UPDATE bundles SET state = 'issued', unlocked_at = ?, issued_at = ? WHERE session_id = ? AND milestone_id = ?`,
      )
      .run(at, at, sessionId, milestoneId);
  }

  markReclaimed(sessionId: string, milestoneId: MilestoneId): void {
    this.db
      .prepare(`UPDATE bundles SET state = 'reclaimed' WHERE session_id = ? AND milestone_id = ?`)
      .run(sessionId, milestoneId);
  }

  listAllBundles(): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles ORDER BY rowid').all() as BundleRow[];
  }

  listBundles(sessionId: string): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles WHERE session_id = ? ORDER BY rowid').all(sessionId) as BundleRow[];
  }

  close(): void {
    this.db.close();
  }
}
