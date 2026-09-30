import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BundleState, MilestoneId, SessionState } from '@cashu-xx/shared';
import Database from 'better-sqlite3';

export interface SessionRow {
  id: string;
  claim_code: string;
  auth_token: string;
  quote_id: string | null;
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

export class Repo {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
    this.db.exec(schema);
  }

  createSession(row: SessionRow): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, claim_code, auth_token, quote_id, invoice, quote_expires_at, state, created_at)
         VALUES (@id, @claim_code, @auth_token, @quote_id, @invoice, @quote_expires_at, @state, @created_at)`,
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

  setState(id: string, state: SessionState): void {
    this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?').run(state, id);
  }

  createBundles(sessionId: string, milestoneIds: readonly MilestoneId[]): void {
    const insert = this.db.prepare(
      `INSERT INTO bundles (session_id, milestone_id, token, state, unlocked_at, issued_at)
       VALUES (?, ?, NULL, 'locked', NULL, NULL)`,
    );
    const tx = this.db.transaction((ids: readonly MilestoneId[]) => {
      for (const milestoneId of ids) {
        insert.run(sessionId, milestoneId);
      }
    });
    tx(milestoneIds);
  }

  getBundle(sessionId: string, milestoneId: MilestoneId): BundleRow | undefined {
    return this.db
      .prepare('SELECT * FROM bundles WHERE session_id = ? AND milestone_id = ?')
      .get(sessionId, milestoneId) as BundleRow | undefined;
  }

  issueToken(sessionId: string, milestoneId: MilestoneId, token: string, at: number): void {
    this.db
      .prepare(`UPDATE bundles SET token = ?, state = 'issued', unlocked_at = ?, issued_at = ? WHERE session_id = ? AND milestone_id = ?`)
      .run(token, at, at, sessionId, milestoneId);
  }

  listBundles(sessionId: string): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles WHERE session_id = ? ORDER BY rowid').all(sessionId) as BundleRow[];
  }

  close(): void {
    this.db.close();
  }
}
