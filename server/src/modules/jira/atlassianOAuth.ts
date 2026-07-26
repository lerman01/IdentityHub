import { env } from '../../config/env.js';
import { AppError, upstreamError } from '../../lib/errors.js';

/**
 * Raw Atlassian OAuth 2.0 (3LO) protocol client — no database access, no
 * session knowledge. jiraConnectionService orchestrates it.
 *
 * Flow reference: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 */

/**
 * Minimal scope set, each one load-bearing:
 * - read:jira-user   → GET /myself (who connected, shown in the UI)
 * - read:jira-work   → list/search projects, read create metadata
 * - write:jira-work  → create finding issues
 * - offline_access   → issue rotating refresh tokens (else access dies in ~1h)
 */
export const JIRA_SCOPES = 'read:jira-user read:jira-work write:jira-work offline_access';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';
const FETCH_TIMEOUT_MS = 15_000;

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch-ms expiry, derived from Atlassian's expires_in. */
  expiresAt: number;
}

export interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
  avatarUrl?: string;
}

// The client id and secret are validated as required at boot (config/env.ts),
// so nothing here needs to handle them being absent.

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: env.ATLASSIAN_CLIENT_ID,
    scope: JIRA_SCOPES,
    redirect_uri: env.ATLASSIAN_CALLBACK_URL,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function requestTokens(body: Record<string, string>, action: string): Promise<OAuthTokens> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw upstreamError('JIRA_UNREACHABLE', `Could not reach Atlassian to ${action}.`, cause);
  }

  const data = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !data.access_token || !data.refresh_token || !data.expires_in) {
    // invalid_grant on refresh = the rotating refresh token is spent/revoked.
    if (data.error === 'invalid_grant') {
      throw new AppError(
        409,
        'JIRA_GRANT_INVALID',
        'Your Jira authorization is no longer valid (expired or revoked). Please reconnect.',
      );
    }
    throw upstreamError(
      'JIRA_TOKEN_ERROR',
      `Atlassian rejected the ${action} request${data.error ? ` (${data.error})` : ''}. ` +
        'Check that the client ID/secret and callback URL match your Atlassian app exactly.',
      data.error_description,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export function exchangeCode(code: string): Promise<OAuthTokens> {
  return requestTokens(
    {
      grant_type: 'authorization_code',
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: env.ATLASSIAN_CALLBACK_URL,
    },
    'exchange the authorization code',
  );
}

/** Atlassian rotates refresh tokens: every call returns a NEW pair; the old refresh token dies. */
export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  return requestTokens(
    {
      grant_type: 'refresh_token',
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    },
    'refresh the access token',
  );
}

/** Lists the Jira sites (cloud ids) this token may act on. */
export async function fetchAccessibleResources(accessToken: string): Promise<AccessibleResource[]> {
  let res: Response;
  try {
    res = await fetch(RESOURCES_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw upstreamError('JIRA_UNREACHABLE', 'Could not reach Atlassian to list your sites.', cause);
  }
  if (!res.ok) {
    throw upstreamError('JIRA_TOKEN_ERROR', 'Atlassian rejected the site lookup request.');
  }
  return (await res.json()) as AccessibleResource[];
}

export interface JiraMyself {
  accountId: string;
  emailAddress?: string;
  displayName?: string;
}

/** Used during connection finalization, before anything is persisted. */
export async function fetchMyself(cloudId: string, accessToken: string): Promise<JiraMyself> {
  let res: Response;
  try {
    res = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw upstreamError('JIRA_UNREACHABLE', 'Could not reach your Jira site.', cause);
  }
  if (!res.ok) {
    throw upstreamError('JIRA_PROFILE_ERROR', 'Could not read your Jira profile.');
  }
  return (await res.json()) as JiraMyself;
}
