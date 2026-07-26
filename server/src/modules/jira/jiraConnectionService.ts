import { randomBytes } from 'node:crypto';
import type { Session, SessionData } from 'express-session';
import type { JiraConnectionDto, JiraSiteOption } from '@identityhub/shared';
import { env } from '../../config/env.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import { AppError, badRequest, conflict } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { jiraConnectionRepo } from '../../db/repositories/jiraConnectionRepo.js';
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchAccessibleResources,
  fetchMyself,
  refreshTokens,
  type OAuthTokens,
} from './atlassianOAuth.js';

type AppSession = Session & Partial<SessionData>;

/** Outcome of the OAuth callback, translated by the route into a redirect. */
export type CallbackResult =
  | { kind: 'connected' }
  | { kind: 'select-site' }
  | { kind: 'denied' }
  | { kind: 'error'; reason: string };

// ── OAuth flow ────────────────────────────────────────────────────────────────

export function startOAuth(session: AppSession): string {
  const state = randomBytes(24).toString('base64url');
  session.jiraOAuthState = state;
  return buildAuthorizeUrl(state);
}

export async function handleCallback(
  session: AppSession,
  userId: string,
  query: { code?: string; state?: string; error?: string },
): Promise<CallbackResult> {
  // Single-use state: whatever happens next, this flow attempt is consumed.
  const expectedState = session.jiraOAuthState;
  delete session.jiraOAuthState;

  if (query.error === 'access_denied') return { kind: 'denied' };
  if (query.error) return { kind: 'error', reason: 'atlassian' };

  if (!expectedState || !query.state || query.state !== expectedState) {
    logger.warn('OAuth callback with missing/mismatched state', { userId });
    return { kind: 'error', reason: 'state' };
  }
  if (!query.code) return { kind: 'error', reason: 'missing-code' };

  const tokens = await exchangeCode(query.code);
  const resources = await fetchAccessibleResources(tokens.accessToken);
  const sites: JiraSiteOption[] = resources.map((r) => ({
    cloudId: r.id,
    name: r.name,
    url: r.url,
  }));

  if (sites.length === 0) return { kind: 'error', reason: 'no-sites' };

  if (sites.length === 1) {
    await finalizeConnection(userId, sites[0]!, tokens);
    return { kind: 'connected' };
  }

  // Multiple sites: park the (encrypted) tokens until the user picks one.
  session.jiraPendingSites = sites;
  session.jiraPendingTokensEnc = encryptSecret(JSON.stringify(tokens));
  return { kind: 'select-site' };
}

export async function selectSite(
  session: AppSession,
  userId: string,
  cloudId: string,
): Promise<void> {
  const sites = session.jiraPendingSites;
  const tokensEnc = session.jiraPendingTokensEnc;
  if (!sites || !tokensEnc) {
    throw conflict(
      'JIRA_NO_PENDING_CONNECTION',
      'There is no Jira connection in progress. Start again with "Connect Jira".',
    );
  }
  const site = sites.find((s) => s.cloudId === cloudId);
  if (!site) throw badRequest('That site is not one of the options for this connection.');

  const tokens = JSON.parse(decryptSecret(tokensEnc)) as OAuthTokens;
  await finalizeConnection(userId, site, tokens);

  delete session.jiraPendingSites;
  delete session.jiraPendingTokensEnc;
}

async function finalizeConnection(
  userId: string,
  site: JiraSiteOption,
  tokens: OAuthTokens,
): Promise<void> {
  // Best effort profile lookup — a connection without an email is still valid.
  const myself = await fetchMyself(site.cloudId, tokens.accessToken).catch(() => null);

  jiraConnectionRepo.upsert({
    userId,
    cloudId: site.cloudId,
    siteUrl: site.url,
    siteName: site.name,
    accountId: myself?.accountId ?? null,
    accountEmail: myself?.emailAddress ?? null,
    accessTokenEnc: encryptSecret(tokens.accessToken),
    refreshTokenEnc: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt,
  });
  logger.info('Jira connected', { userId, site: site.url });
}

// ── Status / disconnect ───────────────────────────────────────────────────────

export function getStatus(session: AppSession, userId: string): JiraConnectionDto {
  const row = jiraConnectionRepo.findByUserId(userId);
  return {
    oauthConfigured: env.jiraOAuthConfigured,
    connected: Boolean(row),
    ...(row
      ? {
          site: { name: row.site_name, url: row.site_url },
          account: { email: row.account_email },
        }
      : {}),
    ...(session.jiraPendingSites ? { pendingSites: session.jiraPendingSites } : {}),
  };
}

export function disconnect(userId: string): void {
  jiraConnectionRepo.deleteByUserId(userId);
  logger.info('Jira disconnected', { userId });
}

// ── Token management ──────────────────────────────────────────────────────────

/** Refresh this many ms before actual expiry, so in-flight requests never race the clock. */
const EXPIRY_MARGIN_MS = 60_000;

// Per-user promise chain: concurrent requests for the same user serialize
// their refreshes (rotating refresh tokens make parallel refreshes fatal —
// the loser would persist a dead token). In-process only; a multi-instance
// deployment would need a shared lock (documented limitation).
const userLocks = new Map<string, Promise<unknown>>();

function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  userLocks.set(
    userId,
    next.catch(() => undefined),
  );
  return next;
}

export interface CloudContext {
  cloudId: string;
  siteUrl: string;
  accessToken: string;
}

/**
 * Returns a currently-valid access token (+ cloud routing info) for the user,
 * transparently refreshing and persisting the rotated pair when needed.
 *
 * @param staleToken When a Jira call just failed with 401 despite a
 * "valid-looking" token, pass the token that failed: if the stored one is
 * still identical it gets force-refreshed; if another request already rotated
 * it, the newer token is returned without an extra refresh.
 */
export async function getCloudContext(userId: string, staleToken?: string): Promise<CloudContext> {
  const row = jiraConnectionRepo.findByUserId(userId);
  if (!row) {
    throw conflict('JIRA_NOT_CONNECTED', 'Connect your Jira workspace first.');
  }

  const current = decryptSecret(row.access_token_enc);
  const looksFresh = row.access_token_expires_at - Date.now() > EXPIRY_MARGIN_MS;
  if (looksFresh && current !== staleToken) {
    return { cloudId: row.cloud_id, siteUrl: row.site_url, accessToken: current };
  }

  return withUserLock(userId, async () => {
    // Re-read inside the lock: a queued sibling may have already refreshed.
    const fresh = jiraConnectionRepo.findByUserId(userId);
    if (!fresh) throw conflict('JIRA_NOT_CONNECTED', 'Connect your Jira workspace first.');

    const stored = decryptSecret(fresh.access_token_enc);
    const storedIsFresh = fresh.access_token_expires_at - Date.now() > EXPIRY_MARGIN_MS;
    if (storedIsFresh && stored !== staleToken) {
      return { cloudId: fresh.cloud_id, siteUrl: fresh.site_url, accessToken: stored };
    }

    let rotated: OAuthTokens;
    try {
      rotated = await refreshTokens(decryptSecret(fresh.refresh_token_enc));
    } catch (err) {
      if (err instanceof AppError && err.code === 'JIRA_GRANT_INVALID') {
        // The refresh token is dead (revoked/expired/stolen-and-rotated).
        // Drop the connection so the UI offers a clean reconnect.
        jiraConnectionRepo.deleteByUserId(userId);
        logger.warn('Jira refresh token invalid — connection removed', { userId });
        throw conflict(
          'JIRA_RECONNECT_REQUIRED',
          'Your Jira authorization expired or was revoked. Please reconnect your workspace.',
        );
      }
      throw err;
    }

    jiraConnectionRepo.updateTokens(userId, {
      accessTokenEnc: encryptSecret(rotated.accessToken),
      refreshTokenEnc: encryptSecret(rotated.refreshToken),
      accessTokenExpiresAt: rotated.expiresAt,
    });
    logger.debug('Jira access token refreshed', { userId });

    return { cloudId: fresh.cloud_id, siteUrl: fresh.site_url, accessToken: rotated.accessToken };
  });
}
