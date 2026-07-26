import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';

export interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_hint: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const insertStmt = db.prepare(`
  INSERT INTO api_keys (id, user_id, name, key_hash, key_hint)
  VALUES (@id, @userId, @name, @keyHash, @keyHint)
`);
const byUserStmt = db.prepare(
  'SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC, rowid DESC',
);
const byIdStmt = db.prepare('SELECT * FROM api_keys WHERE id = ?');
const byHashStmt = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?');
// user_id in the WHERE clause is the tenancy boundary: users can only revoke their own keys.
const revokeStmt = db.prepare(`
  UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = ? AND user_id = ? AND revoked_at IS NULL
`);
const touchStmt = db.prepare(
  "UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
);

export const apiKeyRepo = {
  insert(row: { userId: string; name: string; keyHash: string; keyHint: string }): ApiKeyRow {
    const id = randomUUID();
    insertStmt.run({ id, ...row });
    return byIdStmt.get(id) as ApiKeyRow;
  },

  listByUser(userId: string): ApiKeyRow[] {
    return byUserStmt.all(userId) as ApiKeyRow[];
  },

  findByHash(keyHash: string): ApiKeyRow | undefined {
    return byHashStmt.get(keyHash) as ApiKeyRow | undefined;
  },

  /** Returns true when a key was actually revoked (existed, owned, active). */
  revoke(id: string, userId: string): boolean {
    return revokeStmt.run(id, userId).changes > 0;
  },

  touchLastUsed(id: string): void {
    touchStmt.run(id);
  },
};
