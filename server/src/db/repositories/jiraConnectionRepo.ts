import { db } from '../connection.js';

export interface JiraConnectionRow {
  user_id: string;
  cloud_id: string;
  site_url: string;
  site_name: string;
  account_id: string | null;
  account_email: string | null;
  access_token_enc: string;
  refresh_token_enc: string;
  access_token_expires_at: number;
  created_at: string;
  updated_at: string;
}

const upsertStmt = db.prepare(`
  INSERT INTO jira_connections
    (user_id, cloud_id, site_url, site_name, account_id, account_email,
     access_token_enc, refresh_token_enc, access_token_expires_at)
  VALUES
    (@userId, @cloudId, @siteUrl, @siteName, @accountId, @accountEmail,
     @accessTokenEnc, @refreshTokenEnc, @accessTokenExpiresAt)
  ON CONFLICT (user_id) DO UPDATE SET
    cloud_id = excluded.cloud_id,
    site_url = excluded.site_url,
    site_name = excluded.site_name,
    account_id = excluded.account_id,
    account_email = excluded.account_email,
    access_token_enc = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc,
    access_token_expires_at = excluded.access_token_expires_at,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`);

const findStmt = db.prepare('SELECT * FROM jira_connections WHERE user_id = ?');
const updateTokensStmt = db.prepare(`
  UPDATE jira_connections SET
    access_token_enc = @accessTokenEnc,
    refresh_token_enc = @refreshTokenEnc,
    access_token_expires_at = @accessTokenExpiresAt,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE user_id = @userId
`);
const deleteStmt = db.prepare('DELETE FROM jira_connections WHERE user_id = ?');

export const jiraConnectionRepo = {
  upsert(row: {
    userId: string;
    cloudId: string;
    siteUrl: string;
    siteName: string;
    accountId: string | null;
    accountEmail: string | null;
    accessTokenEnc: string;
    refreshTokenEnc: string;
    accessTokenExpiresAt: number;
  }): void {
    upsertStmt.run(row);
  },

  findByUserId(userId: string): JiraConnectionRow | undefined {
    return findStmt.get(userId) as JiraConnectionRow | undefined;
  },

  updateTokens(
    userId: string,
    tokens: { accessTokenEnc: string; refreshTokenEnc: string; accessTokenExpiresAt: number },
  ): void {
    updateTokensStmt.run({ userId, ...tokens });
  },

  deleteByUserId(userId: string): void {
    deleteStmt.run(userId);
  },
};
