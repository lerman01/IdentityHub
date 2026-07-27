import { AppError, upstreamError } from '../../utils/errors.js';
import { APP_LABEL } from './labels.js';
import { getCloudContext, type CloudContext } from './tokens.js';

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

async function jiraFetch<T>(
  accountId: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let ctx = await getCloudContext(accountId);
  let res = await rawRequest(ctx, path, init);

  if (res.status === 401) {
    ctx = await getCloudContext(accountId, { staleToken: ctx.accessToken });
    res = await rawRequest(ctx, path, init);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as JiraErrorBody | undefined;
    throw mapJiraError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Typed Jira API calls ──────────────────────────────────────────────────────

interface ProjectSearchResponse {
  values: Array<{
    id: string;
    key: string;
    name: string;
    avatarUrls?: Record<string, string>;
  }>;
}

/**
 * Projects the account can see (Jira applies its own permission filtering),
 * one page of 50 ordered by key. The picker filters this list client-side.
 *
 * Documented limit: a workspace with more than 50 projects will not show them
 * all. Passing the search term through to this endpoint's `query` parameter is
 * the fix if that ever matters (docs/DECISIONS.md #9b).
 */
export async function searchProjects(accountId: string) {
  const params = new URLSearchParams({ maxResults: '50', orderBy: 'key' });
  const data = await jiraFetch<ProjectSearchResponse>(
    accountId,
    `/rest/api/3/project/search?${params.toString()}`,
  );
  return data.values.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    avatarUrl: p.avatarUrls?.['16x16'],
  }));
}

interface ProjectWithIssueTypes {
  id: string;
  key: string;
  name: string;
  issueTypes?: Array<{ id: string; name: string; subtask: boolean }>;
}

/** Also serves as project-existence validation (404 → mapped error). */
export function getProject(accountId: string, projectKey: string): Promise<ProjectWithIssueTypes> {
  return jiraFetch<ProjectWithIssueTypes>(
    accountId,
    `/rest/api/3/project/${encodeURIComponent(projectKey)}?expand=issueTypes`,
  );
}

interface CreatedIssue {
  id: string;
  key: string;
}

export function createIssue(
  accountId: string,
  fields: Record<string, unknown>,
): Promise<CreatedIssue> {
  return jiraFetch<CreatedIssue>(accountId, '/rest/api/3/issue', {
    method: 'POST',
    body: { fields },
  });
}

interface JqlSearchResponse {
  issues?: Array<{
    id: string;
    key: string;
    fields?: { summary?: string; created?: string; labels?: string[] };
  }>;
}

interface JiraIssueSummary {
  id: string;
  key: string;
  summary: string;
  created: string;
  labels: string[];
}

/**
 * Issues in a project that carry this app's label, newest first — the source
 * of truth for the Recent Tickets view.
 *
 * Endpoint notes (verified against Atlassian's current docs):
 * - POST /rest/api/3/search/jql replaces /rest/api/3/search, which now
 *   returns 410 Gone.
 * - `fields` must be listed explicitly; the endpoint returns no issue fields
 *   by default.
 * - Pagination is cursor-based (nextPageToken), but a single page of 10 is
 *   all this view needs, so we never follow it.
 *
 * `projectKey` is safe to interpolate into JQL: the shared schema constrains
 * it to /^[A-Za-z][A-Za-z0-9_]*$/, so it cannot carry quotes or operators.
 */
export async function searchAppIssues(
  accountId: string,
  projectKey: string,
  limit: number,
): Promise<JiraIssueSummary[]> {
  const data = await jiraFetch<JqlSearchResponse>(accountId, '/rest/api/3/search/jql', {
    method: 'POST',
    body: {
      jql: `project = ${projectKey} AND labels = ${APP_LABEL} ORDER BY created DESC`,
      maxResults: limit,
      fields: ['summary', 'created', 'labels'],
    },
  });

  return (data.issues ?? []).map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields?.summary ?? issue.key,
    created: issue.fields?.created ?? '',
    labels: issue.fields?.labels ?? [],
  }));
}
