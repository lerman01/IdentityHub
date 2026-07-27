import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';
import { accountSql } from '../sql.js';

/**
 * Accounts are both the tenant and the Jira connection — see schema.sql.
 * Every other table scopes by `account_id`, and every query here is
 * parameterized (the statements themselves live in ../sql.ts).
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

const byIdStmt = db.prepare(accountSql.byId);
const byAtlassianIdStmt = db.prepare(accountSql.byAtlassianId);
const byEmailStmt = db.prepare(accountSql.byEmail);
const upsertStmt = db.prepare(accountSql.upsertFromAtlassian);
const updateTokensStmt = db.prepare(accountSql.updateTokens);

export const accountRepo = {
  /** Called on every sign-in — creates the account, or refreshes profile, site and tokens. */
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
