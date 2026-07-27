/**
 * Every SQL statement the server runs, in one place — the DDL lives next door
 * in schema.sql. Keeping the statements out of the repositories makes the whole
 * data access surface reviewable in one file: everything here is parameterized
 * (`?` or `@named`), and no value is ever interpolated into these strings.
 */

export const accountSql = {
  byId: 'SELECT * FROM accounts WHERE id = ?',
  byAtlassianId: 'SELECT * FROM accounts WHERE atlassian_account_id = ?',
  byEmail: 'SELECT * FROM accounts WHERE email = ? COLLATE NOCASE',

  /**
   * Run on every sign-in: creates the account the first time an Atlassian
   * identity appears, and refreshes its profile, site and tokens on every later
   * login. The site is part of the same write because the grant is site-scoped —
   * re-consenting for a different site is how an account moves.
   */
  upsertFromAtlassian: `
    INSERT INTO accounts
      (id, atlassian_account_id, email, display_name, cloud_id, site_url, site_name,
       access_token_enc, refresh_token_enc, access_token_expires_at)
    VALUES
      (@id, @atlassianAccountId, @email, @displayName, @cloudId, @siteUrl, @siteName,
       @accessTokenEnc, @refreshTokenEnc, @accessTokenExpiresAt)
    ON CONFLICT (atlassian_account_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      cloud_id = excluded.cloud_id,
      site_url = excluded.site_url,
      site_name = excluded.site_name,
      access_token_enc = excluded.access_token_enc,
      refresh_token_enc = excluded.refresh_token_enc,
      access_token_expires_at = excluded.access_token_expires_at,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `,

  updateTokens: `
    UPDATE accounts SET
      access_token_enc = @accessTokenEnc,
      refresh_token_enc = @refreshTokenEnc,
      access_token_expires_at = @accessTokenExpiresAt,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = @id
  `,
} as const;

export const apiKeySql = {
  insert: `
    INSERT INTO api_keys (id, account_id, name, key_hash, key_hint)
    VALUES (@id, @accountId, @name, @keyHash, @keyHint)
  `,

  byAccount: 'SELECT * FROM api_keys WHERE account_id = ? ORDER BY created_at DESC, rowid DESC',
  byId: 'SELECT * FROM api_keys WHERE id = ?',
  byHash: 'SELECT * FROM api_keys WHERE key_hash = ?',

  // NOCASE matches the collation of idx_api_keys_account_name, so this lookup
  // answers exactly the question the unique index enforces.
  nameTaken: 'SELECT 1 FROM api_keys WHERE account_id = ? AND name = ? COLLATE NOCASE LIMIT 1',

  // account_id in the WHERE clause is the tenancy boundary: users can only revoke their own keys.
  revoke: `
    UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND account_id = ? AND revoked_at IS NULL
  `,

  touchLastUsed:
    "UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
} as const;

/** Used by the express-session store in modules/session/store.ts. */
export const sessionSql = {
  // Lazy expiry: reads filter on expires_at rather than trusting `cleanup` to have run.
  get: 'SELECT data FROM sessions WHERE sid = ? AND expires_at > ?',
  set:
    'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at',
  destroy: 'DELETE FROM sessions WHERE sid = ?',
  touch: 'UPDATE sessions SET expires_at = ? WHERE sid = ?',
  cleanup: 'DELETE FROM sessions WHERE expires_at <= ?',
} as const;
