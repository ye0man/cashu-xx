CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  claim_code TEXT UNIQUE NOT NULL,
  auth_token TEXT NOT NULL,
  mint_url TEXT,
  quote_id TEXT,
  mint_op_id TEXT,
  invoice TEXT,
  quote_expires_at INTEGER,
  state TEXT NOT NULL DEFAULT 'created',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bundles (
  session_id TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  token TEXT,
  state TEXT NOT NULL DEFAULT 'locked',
  unlocked_at INTEGER,
  issued_at INTEGER,
  PRIMARY KEY (session_id, milestone_id),
  FOREIGN KEY (session_id) REFERENCES sessions (id)
);
