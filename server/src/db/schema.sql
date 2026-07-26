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

-- Local record of every ticket created through this app — the source of truth
-- for the "recent tickets" view (Jira itself can't answer "created by us").
CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_key TEXT NOT NULL,
  issue_id    TEXT NOT NULL,
  issue_key   TEXT NOT NULL,
  summary     TEXT NOT NULL,
  jira_url    TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('ui', 'api', 'digest')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_user_project_created
  ON tickets (user_id, project_key, created_at DESC);

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
