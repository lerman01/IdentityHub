import { accountRepo, type AccountRow } from '../../db/repositories/accountRepo.js';
import { decryptSecret, encryptSecret } from '../../utils/crypto.js';
import { AppError, conflict } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { type OAuthTokens, refreshTokens } from './oauth.js';

/**
 * Keeps a connected account's Atlassian access token usable: refreshes it
 * before (or after) it expires, persists the rotated pair, and hands the
 * caller the cloud routing info that goes with it.
 *
 * Sign-in is not here — that is modules/auth/service.ts. This module only
 * maintains a grant that already exists, which is why client.ts can depend on
 * it without pulling the session and OAuth-callback machinery along.
 */

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
