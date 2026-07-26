-- IdentityHub schema. Executed with CREATE TABLE IF NOT EXISTS on every boot —
-- a deliberate POC substitute for a migration tool (see docs/DECISIONS.md).

-- An account IS an Atlassian identity plus the Jira connection it signed in
-- with. Sign-in is "Sign in with Atlassian" only, so there is no separate
-- users table and no password to store: authorizing Jira is what creates the
-- account (docs/DECISIONS.md #2).
--
-- The site columns are nullable for exactly one window: an Atlassian account
-- with several Jira sites is authenticated before it has picked one.
CREATE TABLE IF NOT EXISTS accounts (
  id                      TEXT PRIMARY KEY,
  atlassian_account_id    TEXT NOT NULL UNIQUE,
  email                   TEXT,
  display_name            TEXT,
  cloud_id                TEXT,
  site_url                TEXT,
  site_name               TEXT,
  access_token_enc        TEXT NOT NULL,
  refresh_token_enc       TEXT NOT NULL,
  access_token_expires_at INTEGER NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts (email);

-- Server-side session storage (express-session store). Kept deliberately:
-- a stateless signed cookie would be less code but could not be revoked, and
-- logout must take effect server-side immediately (docs/DECISIONS.md #5).
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- API keys for the public REST API. Only a SHA-256 hash is stored; the hint
-- ("ihk_…a1b2") exists purely so users can tell their keys apart.
CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_hint     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  revoked_at   TEXT
);

-- Note: there is no `tickets` table by design. Jira is the only store for
-- findings; the "recent tickets" view is a live JQL query on the "identityhub"
-- label, so an issue deleted or renamed in Jira can never drift out of sync
-- with a local mirror (docs/DECISIONS.md #9).
