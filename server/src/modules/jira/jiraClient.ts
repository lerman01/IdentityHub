import { AppError, upstreamError } from '../../lib/errors.js';
import { getCloudContext, type CloudContext } from './jiraConnectionService.js';

/**
 * Authenticated Jira Cloud API client for a connected user. All requests are
 * routed through Atlassian's OAuth gateway:
 *   https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...
 *
 * One transparent retry on 401: the stored access token might have been
 * revoked out-of-band even when its expiry looks fine; getCloudContext
 * rotates it (or picks up a sibling request's rotation) and we try again.
 */

const FETCH_TIMEOUT_MS = 20_000;

interface JiraErrorBody {
  errorMessages?: string[];
  errors?: Record<string, string>;
}

function firstJiraMessage(body: JiraErrorBody | undefined): string | undefined {
  if (!body) return undefined;
  if (body.errorMessages?.length) return body.errorMessages[0];
  if (body.errors) {
    const [field, msg] = Object.entries(body.errors)[0] ?? [];
    return field && msg ? `${field}: ${msg}` : undefined;
  }
  return undefined;
}

function mapJiraError(status: number, body: JiraErrorBody | undefined): AppError {
  const detail = firstJiraMessage(body);
  switch (status) {
    case 400:
      return new AppError(400, 'JIRA_REJECTED', detail ?? 'Jira rejected the request as invalid.');
    case 401:
      return new AppError(
        409,
        'JIRA_RECONNECT_REQUIRED',
        'Jira no longer accepts this connection. Please reconnect your workspace.',
      );
    case 403:
      return new AppError(
        403,
        'JIRA_FORBIDDEN',
        detail ??
          'Your Jira account does not have permission for this action in the selected project.',
      );
    case 404:
      return new AppError(404, 'JIRA_NOT_FOUND', detail ?? 'Jira could not find that resource.');
    case 429:
      return new AppError(
        429,
        'JIRA_RATE_LIMITED',
        'Jira is rate-limiting requests right now. Please try again in a moment.',
      );
    default:
      return upstreamError(
        'JIRA_UNAVAILABLE',
        `Jira returned an unexpected error (HTTP ${status}). Please try again.`,
        detail,
      );
  }
}

async function rawRequest(
  ctx: CloudContext,
  path: string,
  init: { method?: string; body?: unknown },
): Promise<Response> {
  try {
    return await fetch(`https://api.atlassian.com/ex/jira/${ctx.cloudId}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    throw upstreamError('JIRA_UNREACHABLE', 'Could not reach Jira. Please try again.', cause);
  }
}

export async function jiraFetch<T>(
  userId: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let ctx = await getCloudContext(userId);
  let res = await rawRequest(ctx, path, init);

  if (res.status === 401) {
    ctx = await getCloudContext(userId, ctx.accessToken);
    res = await rawRequest(ctx, path, init);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as JiraErrorBody | undefined;
    throw mapJiraError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
