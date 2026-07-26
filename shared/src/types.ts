import type { TicketSource } from './constants.js';

/**
 * Every non-2xx response from the server uses this envelope, so the web app
 * and API consumers can rely on one error shape.
 */
export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code, e.g. "VALIDATION_ERROR", "JIRA_RECONNECT_REQUIRED". */
    code: string;
    /** Human-readable, end-user-safe message. */
    message: string;
    /** Optional structured context, e.g. per-field validation issues. */
    details?: unknown;
  };
}

/**
 * The signed-in account. Identity comes from Atlassian — there is no separate
 * app user, so `email` and `displayName` are whatever Jira reports (either can
 * be hidden by the user's Atlassian privacy settings).
 */
export interface AccountDto {
  id: string;
  email: string | null;
  displayName: string | null;
  /**
   * The Jira site this account authorized. Always present: the Atlassian grant
   * is site-scoped, chosen on Atlassian's consent screen at sign-in.
   */
  site: { name: string; url: string };
}

/** Response of GET /api/auth/me — `account` is null while signed out. */
export interface SessionDto {
  account: AccountDto | null;
}

export interface ProjectDto {
  id: string;
  key: string;
  name: string;
  avatarUrl?: string;
}

export interface TicketDto {
  id: string;
  projectKey: string;
  issueKey: string;
  summary: string;
  jiraUrl: string;
  /** Absent when the issue carries no `source:*` label (e.g. tagged by hand). */
  source?: TicketSource;
  createdAt: string;
}

export interface CreatedTicketDto {
  id: string;
  issueKey: string;
  url: string;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  /** Display hint only, e.g. "ihk_…a1b2" — the full key is never stored or shown again. */
  keyHint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Returned exactly once, at creation time. */
export interface CreatedApiKeyDto extends ApiKeyDto {
  key: string;
}
