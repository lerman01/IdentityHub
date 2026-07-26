import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';

export interface ApiKeyRow {
  id: string;
  account_id: string;
  name: string;
  key_hash: string;
  key_hint: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO api_keys (id, account_id, name, key_hash, key_hint)
  VALUES (@id, @accountId, @name, @keyHash, @keyHint)
`);
const byAccountStmt = db.prepare(
  'SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC, rowid DESC',
);
const byIdStmt = db.prepare('SELECT * FROM api_keys WHERE id = ?');
// NOCASE matches the collation of idx_api_keys_account_name, so this lookup
// answers exactly the question the unique index enforces.
const nameTakenStmt = db.prepare(
  'SELECT 1 FROM api_keys WHERE account_id = ? AND name = ? COLLATE NOCASE LIMIT 1',
);
const byHashStmt = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?');
// account_id in the WHERE clause is the tenancy boundary: users can only revoke their own keys.
const revokeStmt = db.prepare(`
  UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ? AND account_id = ? AND revoked_at IS NULL
`);
const touchStmt = db.prepare(
  "UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
);

export const apiKeyRepo = {
  insert(row: { accountId: string; name: string; keyHash: string; keyHint: string }): ApiKeyRow {
    const id = randomUUID();
    insertStmt.run({ id, ...row });
    return byIdStmt.get(id) as ApiKeyRow;
  },

  /** True when this account already has a key by that name (revoked ones count). */
  nameTaken(accountId: string, name: string): boolean {
    return nameTakenStmt.get(accountId, name) !== undefined;
  },

  listByAccount(accountId: string): ApiKeyRow[] {
    return byAccountStmt.all(accountId) as ApiKeyRow[];
  },

  findByHash(keyHash: string): ApiKeyRow | undefined {
    return byHashStmt.get(keyHash) as ApiKeyRow | undefined;
  },

  /** Returns true when a key was actually revoked (existed, owned, active). */
  revoke(id: string, accountId: string): boolean {
    return revokeStmt.run(id, accountId).changes > 0;
  },

  touchLastUsed(id: string): void {
    touchStmt.run(id);
  },
};
