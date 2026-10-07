import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BundleState, MeltState, MilestoneId, SessionState } from '@cashu-xx/shared';
import { MILESTONE_IDS } from '@cashu-xx/shared';
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
  melt_destination: string | null;
  melt_op_id: string | null;
  melt_state: MeltState | null;
  melt_amount_sats: number | null;
  melt_fee_sats: number | null;
  melt_preimage: string | null;
  /** coco send op backing the combined payout token (set before execute, for crash recovery). */
  claim_op_id: string | null;
  /** The combined payout token, once issued. */
  claim_token: string | null;
  claim_amount_sats: number | null;
}

export interface BundleRow {
  session_id: string;
  milestone_id: MilestoneId;
  /** Only set on pre-ledger rows (a live per-milestone send the operator must sweep). */
  token: string | null;
  state: BundleState;
  unlocked_at: number | null;
  issued_at: number | null;
}

/** A session as inserted at creation: the payout columns start NULL. */
export type NewSession = Omit<
  SessionRow,
  | 'melt_destination'
  | 'melt_op_id'
  | 'melt_state'
  | 'melt_amount_sats'
  | 'melt_fee_sats'
  | 'melt_preimage'
  | 'claim_op_id'
  | 'claim_token'
  | 'claim_amount_sats'
>;

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
    for (const column of [
      'mint_op_id TEXT',
      'mint_url TEXT',
      'melt_destination TEXT',
      'melt_op_id TEXT',
      'melt_state TEXT',
      'melt_amount_sats INTEGER',
      'melt_fee_sats INTEGER',
      'melt_preimage TEXT',
      'claim_op_id TEXT',
      'claim_token TEXT',
      'claim_amount_sats INTEGER',
    ]) {
      const name = column.split(' ')[0] as string;
      if (!columns.some((existing) => existing.name === name)) {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${column}`);
      }
    }
    // Pre-ledger bundle states: an issued token counts as earned; anything that
    // was mid-combine/melt had its live send reclaimed, so it is swept.
    this.db.exec(`UPDATE bundles SET state = 'unlocked' WHERE state = 'issued'`);
    this.db.exec(`UPDATE bundles SET state = 'reclaimed' WHERE state IN ('combining', 'combined', 'melting')`);
  }

  createSession(row: NewSession): void {
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

  /** Open the session's milestone ledger (idempotent): every milestone starts locked. */
  createLedger(sessionId: string): void {
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO bundles (session_id, milestone_id, token, state, unlocked_at, issued_at)
       VALUES (?, ?, NULL, 'locked', NULL, NULL)`,
    );
    const tx = this.db.transaction(() => {
      for (const milestoneId of MILESTONE_IDS) {
        insert.run(sessionId, milestoneId);
      }
    });
    tx();
  }

  hasLedger(sessionId: string): boolean {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM bundles WHERE session_id = ?').get(sessionId) as { n: number };
    return row.n > 0;
  }

  /** A pre-ledger session: its sats sit in per-milestone live sends, not the pooled balance. */
  isLegacy(sessionId: string): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM bundles WHERE session_id = ? AND token IS NOT NULL')
      .get(sessionId) as { n: number };
    return row.n > 0;
  }

  /** Test/legacy helper: attach a stored per-milestone token to a ledger row. */
  setBundleToken(sessionId: string, milestoneId: MilestoneId, token: string): void {
    this.db
      .prepare('UPDATE bundles SET token = ? WHERE session_id = ? AND milestone_id = ?')
      .run(token, sessionId, milestoneId);
  }

  getBundle(sessionId: string, milestoneId: MilestoneId): BundleRow | undefined {
    return this.db
      .prepare('SELECT * FROM bundles WHERE session_id = ? AND milestone_id = ?')
      .get(sessionId, milestoneId) as BundleRow | undefined;
  }

  listBundles(sessionId: string): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles WHERE session_id = ? ORDER BY rowid').all(sessionId) as BundleRow[];
  }

  listAllBundles(): BundleRow[] {
    return this.db.prepare('SELECT * FROM bundles ORDER BY rowid').all() as BundleRow[];
  }

  /** Record a milestone as earned. Only a locked row changes; repeats are no-ops. */
  markUnlocked(sessionId: string, milestoneId: MilestoneId, at: number): void {
    this.db
      .prepare(
        `UPDATE bundles SET state = 'unlocked', unlocked_at = ? WHERE session_id = ? AND milestone_id = ? AND state = 'locked'`,
      )
      .run(at, sessionId, milestoneId);
  }

  /** Earned milestones whose sats have not left the session yet. */
  listUnlocked(sessionId: string): MilestoneId[] {
    const rows = this.db
      .prepare(`SELECT milestone_id FROM bundles WHERE session_id = ? AND state = 'unlocked' ORDER BY rowid`)
      .all(sessionId) as Array<{ milestone_id: MilestoneId }>;
    return rows.map((row) => row.milestone_id);
  }

  setBundleStates(sessionId: string, milestoneIds: MilestoneId[], state: BundleState, at?: number): void {
    const stmt = this.db.prepare(
      `UPDATE bundles SET state = ?, issued_at = COALESCE(?, issued_at) WHERE session_id = ? AND milestone_id = ?`,
    );
    const tx = this.db.transaction((ids: MilestoneId[]) => {
      for (const milestoneId of ids) {
        stmt.run(state, at ?? null, sessionId, milestoneId);
      }
    });
    tx(milestoneIds);
  }

  /** Every milestone currently in `from` moves to `to` (e.g. claimed → unlocked on a token reclaim). */
  moveBundleStates(sessionId: string, from: BundleState, to: BundleState): MilestoneId[] {
    const ids = (
      this.db
        .prepare('SELECT milestone_id FROM bundles WHERE session_id = ? AND state = ? ORDER BY rowid')
        .all(sessionId, from) as Array<{ milestone_id: MilestoneId }>
    ).map((row) => row.milestone_id);
    this.setBundleStates(sessionId, ids, to, to === 'unlocked' ? undefined : Date.now());
    return ids;
  }

  markReclaimed(sessionId: string, milestoneId: MilestoneId): void {
    this.setBundleStates(sessionId, [milestoneId], 'reclaimed');
  }

  /** After an operator sweep, every pre-ledger row is dead: its live send was reclaimed. */
  markLegacyReclaimed(): number {
    return this.db
      .prepare(`UPDATE bundles SET state = 'reclaimed' WHERE token IS NOT NULL AND state != 'reclaimed'`)
      .run().changes;
  }

  /** Record the send backing the payout token before executing it (crash recovery). */
  startClaim(id: string, opId: string, amountSats: number): void {
    this.db
      .prepare('UPDATE sessions SET claim_op_id = ?, claim_amount_sats = ?, claim_token = NULL WHERE id = ?')
      .run(opId, amountSats, id);
  }

  finishClaim(id: string, token: string): void {
    this.db.prepare('UPDATE sessions SET claim_token = ? WHERE id = ?').run(token, id);
  }

  clearClaim(id: string): void {
    this.db
      .prepare('UPDATE sessions SET claim_op_id = NULL, claim_token = NULL, claim_amount_sats = NULL WHERE id = ?')
      .run(id);
  }

  /** Record an in-flight melt operation (idempotency: a retry resumes it). */
  startMelt(id: string, opId: string, destination: string, amountSats: number, feeSats: number): void {
    this.db
      .prepare(
        `UPDATE sessions SET melt_op_id = ?, melt_destination = ?, melt_state = 'pending', melt_amount_sats = ?, melt_fee_sats = ? WHERE id = ?`,
      )
      .run(opId, destination, amountSats, feeSats, id);
  }

  finishMelt(
    id: string,
    result: { state: MeltState; amountSats: number; feeSats: number; preimage?: string; destination: string },
  ): void {
    this.db
      .prepare(
        `UPDATE sessions SET melt_state = ?, melt_amount_sats = ?, melt_fee_sats = ?, melt_preimage = ?, melt_destination = ? WHERE id = ?`,
      )
      .run(result.state, result.amountSats, result.feeSats, result.preimage ?? null, result.destination, id);
  }

  clearMelt(id: string): void {
    this.db.prepare('UPDATE sessions SET melt_op_id = NULL, melt_state = NULL WHERE id = ?').run(id);
  }

  close(): void {
    this.db.close();
  }
}
