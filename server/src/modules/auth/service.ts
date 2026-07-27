import { randomBytes } from 'node:crypto';
import type { Session, SessionData } from 'express-session';
import { accountRepo } from '../../db/repositories/accountRepo.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchAccessibleResources,
  fetchMyself,
} from '../../integrations/jira/oauth.js';
import { encryptSecret } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';

type AppSession = Session & Partial<SessionData>;

/**
 * Sign-in and Jira access are the same act: authorizing Atlassian is what
 * creates the account (docs/DECISIONS.md #2). So there is one OAuth flow
 * rather than separate "register", "login" and "connect" paths.
 *
 * Two neighbours own the parts that are deliberately not here:
 * - modules/session — what the session is once this flow has created it.
 * - integrations/jira/tokens.ts — keeping an already-granted token usable.
 */

/**
 * Outcome of the OAuth callback, translated by the route into a redirect.
 *
 * On success the account id is *returned* rather than written onto the
 * session: the route must regenerate the session id before elevating it, and
 * regenerate() replaces `req.session` with a fresh object (see routes.ts).
 */
export type CallbackResult =
  { kind: 'signed-in'; accountId: string } | { kind: 'denied' } | { kind: 'error'; reason: string };

export function startOAuth(session: AppSession): string {
  const state = randomBytes(24).toString('base64url');
  session.jiraOAuthState = state;
  return buildAuthorizeUrl(state);
}

/**
 * Completes sign-in.
 *
 * The Atlassian app uses **resource-level grants**, so the user chooses which
 * Jira site to authorize on Atlassian's own consent screen and the resulting
 * token is scoped to exactly that site — `accessible-resources` returns it and
 * nothing else. That is why this app has no site picker of its own: Atlassian
 * owns that choice, and switching sites means re-consenting (docs/DECISIONS.md
 * #2c).
 */
export async function handleCallback(
  session: AppSession,
  query: { code?: string; state?: string; error?: string },
): Promise<CallbackResult> {
  // Single-use state: whatever happens next, this flow attempt is consumed.
  const expectedState = session.jiraOAuthState;
  delete session.jiraOAuthState;

  if (query.error === 'access_denied') return { kind: 'denied' };
  if (query.error) return { kind: 'error', reason: 'atlassian' };

  if (!expectedState || !query.state || query.state !== expectedState) {
    logger.warn('OAuth callback with missing/mismatched state');
    return { kind: 'error', reason: 'state' };
  }
  if (!query.code) return { kind: 'error', reason: 'missing-code' };

  const tokens = await exchangeCode(query.code);
  const granted = (await fetchAccessibleResources(tokens.accessToken))[0];

  // No site means the grant authorized nothing usable — e.g. an Atlassian
  // account with no Jira site at all.
  if (!granted) return { kind: 'error', reason: 'no-sites' };

  const myself = await fetchMyself(granted.id, tokens.accessToken);
  const account = accountRepo.upsertFromAtlassian({
    atlassianAccountId: myself.accountId,
    email: myself.emailAddress ?? null,
    displayName: myself.displayName ?? null,
    cloudId: granted.id,
    siteUrl: granted.url,
    siteName: granted.name,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt,
  });

  logger.info({ accountId: account.id, site: granted.url }, 'Signed in with Atlassian');
  return { kind: 'signed-in', accountId: account.id };
}

// Note: there is no listSites/selectSite/clearSite. With resource-level grants
// the token reaches exactly one site, so an in-app picker had nothing to offer;
// changing site means re-running consent (docs/DECISIONS.md #2c).
