import { randomBytes } from 'node:crypto';
import type { Session, SessionData } from 'express-session';
import type { AccountDto, SessionDto } from '@identityhub/shared';
import { accountRepo, type AccountRow } from '../../db/repositories/accountRepo.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { AppError, conflict } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchAccessibleResources,
  fetchMyself,
  type OAuthTokens,
  refreshTokens,
} from './atlassianOAuth.js';

type AppSession = Session & Partial<SessionData>;

/**
 * Sign-in and Jira access are the same act: authorizing Atlassian is what
 * creates the account (docs/DECISIONS.md #2). So there is one OAuth flow
 * rather than separate "register", "login" and "connect" paths.
 */

/**
 * Outcome of the OAuth callback, translated by the route into a redirect.
 *
 * On success the account id is *returned* rather than written onto the
 * session: the route must regenerate the session id before elevating it, and
 * regenerate() replaces `req.session` with a fresh object (see jiraRoutes).
 */
export type CallbackResult =
  | { kind: 'signed-in'; accountId: string }
  | { kind: 'denied' }
  | { kind: 'error'; reason: string };

export function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    // Always present: the grant is site-scoped, so signing in is what sets it.
    site: { name: row.site_name, url: row.site_url },
  };
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

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

// ── Session ───────────────────────────────────────────────────────────────────

export function getSession(accountId: string | undefined): SessionDto {
  const row = accountId ? accountRepo.findById(accountId) : undefined;
  return { account: row ? toAccountDto(row) : null };
}

// Note: there is no listSites/selectSite/clearSite. With resource-level grants
// the token reaches exactly one site, so an in-app picker had nothing to offer;
// changing site means re-running consent (docs/DECISIONS.md #2c).

// ── Token management ──────────────────────────────────────────────────────────

/** Refresh this many ms before actual expiry, so in-flight requests never race the clock. */
const EXPIRY_MARGIN_MS = 60_000;

// Per-account promise chain: concurrent requests serialize their refreshes
// (rotating refresh tokens make parallel refreshes fatal — the loser would
// persist a dead token). In-process only; a multi-instance deployment would
// need a shared lock (documented limitation).
const accountLocks = new Map<string, Promise<unknown>>();

function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  const previous = accountLocks.get(accountId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  accountLocks.set(
    accountId,
    next.catch(() => undefined),
  );
  return next;
}

export interface CloudContext {
  cloudId: string;
  siteUrl: string;
  accessToken: string;
}

function contextFrom(row: AccountRow, accessToken: string): CloudContext {
  return { cloudId: row.cloud_id, siteUrl: row.site_url, accessToken };
}

/**
 * Returns a currently-valid access token (+ cloud routing info) for the
 * account, transparently refreshing and persisting the rotated pair when
 * needed.
 *
 * @param options.staleToken When a Jira call just failed with 401 despite a
 * "valid-looking" token, pass the token that failed: if the stored one is
 * still identical it gets force-refreshed; if another request already rotated
 * it, the newer token is returned without an extra refresh.
 */
export async function getCloudContext(
  accountId: string,
  options: { staleToken?: string } = {},
): Promise<CloudContext> {
  const { staleToken } = options;
  const row = accountRepo.findById(accountId);
  if (!row) throw conflict('ACCOUNT_NOT_FOUND', 'Your account no longer exists. Please sign in.');

  const current = decryptSecret(row.access_token_enc);
  const looksFresh = row.access_token_expires_at - Date.now() > EXPIRY_MARGIN_MS;
  if (looksFresh && current !== staleToken) {
    return contextFrom(row, current);
  }

  return withAccountLock(accountId, async () => {
    // Re-read inside the lock: a queued sibling may have already refreshed.
    const fresh = accountRepo.findById(accountId);
    if (!fresh) {
      throw conflict('ACCOUNT_NOT_FOUND', 'Your account no longer exists. Please sign in.');
    }

    const stored = decryptSecret(fresh.access_token_enc);
    const storedIsFresh = fresh.access_token_expires_at - Date.now() > EXPIRY_MARGIN_MS;
    if (storedIsFresh && stored !== staleToken) {
      return contextFrom(fresh, stored);
    }

    let rotated: OAuthTokens;
    try {
      rotated = await refreshTokens(decryptSecret(fresh.refresh_token_enc));
    } catch (err) {
      if (err instanceof AppError && err.code === 'JIRA_GRANT_INVALID') {
        // The refresh token is dead (revoked/expired/stolen-and-rotated).
        // Signing in again is the only recovery, and it re-issues both tokens.
        logger.warn({ accountId }, 'Jira refresh token invalid — sign-in required');
        throw conflict(
          'JIRA_RECONNECT_REQUIRED',
          'Your Jira authorization expired or was revoked. Please sign in again.',
        );
      }
      throw err;
    }

    accountRepo.updateTokens(accountId, {
      accessTokenEnc: encryptSecret(rotated.accessToken),
      refreshTokenEnc: encryptSecret(rotated.refreshToken),
      accessTokenExpiresAt: rotated.expiresAt,
    });
    logger.debug({ accountId }, 'Jira access token refreshed');

    return contextFrom(fresh, rotated.accessToken);
  });
}
