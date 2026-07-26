-- IdentityHub schema. Executed with CREATE TABLE IF NOT EXISTS on every boot —
-- a deliberate POC substitute for a migration tool (see docs/DECISIONS.md).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Server-side session storage (express-session store).
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- One Jira connection per user ("tenant" in this POC). OAuth tokens are
-- AES-256-GCM encrypted; the raw values never leave the server process.
CREATE TABLE IF NOT EXISTS jira_connections (
  user_id                 TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  cloud_id                TEXT NOT NULL,
  site_url                TEXT NOT NULL,
  site_name               TEXT NOT NULL,
  account_id              TEXT,
  account_email           TEXT,
  access_token_enc        TEXT NOT NULL,
  refresh_token_enc       TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Note: there is no `tickets` table by design. Jira is the only store for
-- findings; the "recent tickets" view is a live JQL query on the "identityhub"
-- label, so an issue deleted or renamed in Jira can never drift out of sync
-- with a local mirror (docs/DECISIONS.md #9).

-- API keys for the public REST API. Only a SHA-256 hash is stored; the hint
-- ("ihk_…a1b2") exists purely so users can tell their keys apart.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_hint     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  revoked_at   TEXT
);

-- Idempotency ledger for the blog-digest job: one ticket per blog post, ever.
CREATE TABLE IF NOT EXISTS digest_state (
  post_url   TEXT PRIMARY KEY,
  issue_key  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
