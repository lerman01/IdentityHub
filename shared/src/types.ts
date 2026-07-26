import type { TicketSource } from './constants.js';

/**
 * Every non-2xx response from the server uses this envelope, so the web app
 * and API consumers can rely on one error shape.
 */
export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code, e.g. "VALIDATION_ERROR", "JIRA_NOT_CONNECTED". */
    code: string;
    /** Human-readable, end-user-safe message. */
    message: string;
    /** Optional structured context, e.g. per-field validation issues. */
    details?: unknown;
  };
}

export interface UserDto {
  id: string;
  email: string;
}

/** A Jira site the user may pick when their token can access several. */
export interface JiraSiteOption {
  cloudId: string;
  name: string;
  url: string;
}

export interface JiraConnectionDto {
  /** False when the server has no Atlassian OAuth app credentials configured. */
  oauthConfigured: boolean;
  connected: boolean;
  site?: { name: string; url: string };
  account?: { email: string | null };
  /** Present when OAuth finished but the user still has to pick one of several sites. */
  pendingSites?: JiraSiteOption[];
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
