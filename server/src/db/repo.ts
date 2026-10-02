import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BundleState, MilestoneId, SessionState } from '@cashu-xx/shared';
import Database from 'better-sqlite3';

export interface SessionRow {
  id: string;
  claim_code: string;
  auth_token: string;
  mint_url: string | null;
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
    if (!columns.some((column) => column.name === 'mint_url')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN mint_url TEXT');
    }
  }

  createSession(row: SessionRow): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, claim_code, auth_token, mint_url, quote_id, mint_op_id, invoice, quote_expires_at, state, created_at)
         VALUES (@id, @claim_code, @auth_token, @mint_url, @quote_id, @mint_op_id, @invoice, @quote_expires_at, @state, @created_at)`,
      )
      .run(row);
  }

  getSession(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  getSessionByClaimCode(claimCode: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE claim_code = ?').get(claimCode) as SessionRow | undefined;
  }

  listSessions(): SessionRow[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY created_at').all() as SessionRow[];
  }

  /** Distinct mint URLs used by sessions (for the multi-mint operator sweep). */
  listSessionMintUrls(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT mint_url FROM sessions WHERE mint_url IS NOT NULL')
      .all() as Array<{ mint_url: string }>;
    return rows.map((row) => row.mint_url);
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

  markCombined(sessionId: string, milestoneId: MilestoneId, at: number): void {
    this.db
      .prepare(
        `UPDATE bundles SET state = 'combined', unlocked_at = COALESCE(unlocked_at, ?), issued_at = ? WHERE session_id = ? AND milestone_id = ?`,
      )
      .run(at, at, sessionId, milestoneId);
  }

  /** Mark bundles as an in-progress combine before the (irreversible) send reclaim. */
  markCombining(sessionId: string, milestoneIds: MilestoneId[]): void {
    const stmt = this.db.prepare(`UPDATE bundles SET state = 'combining' WHERE session_id = ? AND milestone_id = ?`);
    const tx = this.db.transaction((ids: MilestoneId[]) => {
      for (const milestoneId of ids) {
        stmt.run(sessionId, milestoneId);
      }
    });
    tx(milestoneIds);
  }

  /** Restore a bundle to a specific state (used to undo a combine that claimed nothing). */
  setBundleState(sessionId: string, milestoneId: MilestoneId, state: BundleState): void {
    this.db
      .prepare(`UPDATE bundles SET state = ? WHERE session_id = ? AND milestone_id = ?`)
      .run(state, sessionId, milestoneId);
  }

  listBundles(sessionId: string): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles WHERE session_id = ? ORDER BY rowid').all(sessionId) as BundleRow[];
  }

  listAllBundles(): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles ORDER BY rowid').all() as BundleRow[];
  }

  listCombiningBundles(sessionId: string): BundleRow[] {
    return this.db
      .prepare(`SELECT * FROM bundles WHERE session_id = ? AND state = 'combining' ORDER BY rowid`)
      .all(sessionId) as BundleRow[];
  }

  /**
   * A sweep by the operator takes over the wallet, so any combine left in
   * progress is dead: its sats are either reclaimed into the sweep or already in
   * the spendable balance being swept. Mark them so a later combine cannot
   * reissue a combined token with no backing.
   */
  markAllCombiningReclaimed(): number {
    return this.db.prepare(`UPDATE bundles SET state = 'reclaimed' WHERE state = 'combining'`).run().changes;
  }

  close(): void {
    this.db.close();
  }
}
