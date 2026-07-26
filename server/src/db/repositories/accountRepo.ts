import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';

/**
 * Accounts are both the tenant and the Jira connection — see schema.sql.
 * Every other table scopes by `account_id`, and every query here is
 * parameterized.
 */

export interface AccountRow {
  id: string;
  atlassian_account_id: string;
  email: string | null;
  display_name: string | null;
  /** Always set: the Atlassian grant is site-scoped, so sign-in supplies these. */
  cloud_id: string;
  site_url: string;
  site_name: string;
  access_token_enc: string;
  refresh_token_enc: string;
  access_token_expires_at: number;
  created_at: string;
  updated_at: string;
}

const byIdStmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
const byAtlassianIdStmt = db.prepare('SELECT * FROM accounts WHERE atlassian_account_id = ?');
const byEmailStmt = db.prepare('SELECT * FROM accounts WHERE email = ? COLLATE NOCASE');

/**
 * Called on every sign-in: creates the account the first time an Atlassian
 * identity appears, and refreshes its profile, site and tokens on every later
 * login. The site is part of the same write because the grant is site-scoped —
 * re-consenting for a different site is how an account moves.
 */
const upsertStmt = db.prepare(`
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
`);

const updateTokensStmt = db.prepare(`
  UPDATE accounts SET
    access_token_enc = @accessTokenEnc,
    refresh_token_enc = @refreshTokenEnc,
    access_token_expires_at = @accessTokenExpiresAt,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = @id
`);

export const accountRepo = {
  upsertFromAtlassian(input: {
    atlassianAccountId: string;
    email: string | null;
    displayName: string | null;
    cloudId: string;
    siteUrl: string;
    siteName: string;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessTokenExpiresAt: number;
  }): AccountRow {
    upsertStmt.run({ id: randomUUID(), ...input });
    return byAtlassianIdStmt.get(input.atlassianAccountId) as AccountRow;
  },

  findById(id: string): AccountRow | undefined {
    return byIdStmt.get(id) as AccountRow | undefined;
  },

  findByEmail(email: string): AccountRow | undefined {
    return byEmailStmt.get(email) as AccountRow | undefined;
  },

  updateTokens(
    id: string,
    tokens: { accessTokenEnc: string; refreshTokenEnc: string; accessTokenExpiresAt: number },
  ): void {
    updateTokensStmt.run({ id, ...tokens });
  },
};
