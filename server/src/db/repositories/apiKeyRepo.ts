import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';
import { apiKeySql } from '../sql.js';

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

const insertStmt = db.prepare(apiKeySql.insert);
const byAccountStmt = db.prepare(apiKeySql.byAccount);
const byIdStmt = db.prepare(apiKeySql.byId);
const nameTakenStmt = db.prepare(apiKeySql.nameTaken);
const byHashStmt = db.prepare(apiKeySql.byHash);
const revokeStmt = db.prepare(apiKeySql.revoke);
const touchStmt = db.prepare(apiKeySql.touchLastUsed);

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
