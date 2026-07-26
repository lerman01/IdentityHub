import {
  type CreatedTicketDto,
  type CreateFindingInput,
  IDENTITY_TYPE_LABELS,
  SEVERITY_LABELS,
  type TicketDto,
  type TicketSource,
} from '@identityhub/shared';
import { jiraConnectionRepo } from '../../db/repositories/jiraConnectionRepo.js';
import { textToAdf } from '../../lib/adf.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { createIssue, getProject, searchAppIssues } from '../jira/jiraClient.js';
import { buildLabels, parseSource } from '../jira/labels.js';

/**
 * The one path every ticket takes, whatever its origin (web form, public API,
 * blog digest). Scope decisions live here:
 *
 * - Issue type is resolved per project: "Task" when available, otherwise the
 *   first non-subtask type. No configuration needed on the Jira side.
 * - severity / identityType map to Jira LABELS (severity:high,
 *   nhi:service-account), not custom fields: labels work on any Jira
 *   workspace with zero admin setup. A metadata line is also appended to the
 *   description so the information survives even where labels are hidden.
 * - Jira is the only store. Reads are a JQL query on the "identityhub" label
 *   rather than a local mirror, so deletions and renames in Jira can never
 *   drift out of sync (docs/DECISIONS.md #9).
 */

function buildDescription(input: CreateFindingInput, source: TicketSource): string {
  const meta: string[] = [];
  if (input.severity) meta.push(`Severity: ${SEVERITY_LABELS[input.severity]}`);
  if (input.identityType) meta.push(`Identity type: ${IDENTITY_TYPE_LABELS[input.identityType]}`);
  if (input.foundBy) meta.push(`Reported by: ${input.foundBy}`);
  meta.push(`Created via IdentityHub (${source})`);
  return `${input.description}\n\n${meta.join('  ·  ')}`;
}

async function resolveIssueTypeId(userId: string, projectKey: string): Promise<string> {
  let project;
  try {
    project = await getProject(userId, projectKey);
  } catch (err) {
    if (err instanceof AppError && err.status === 404) {
      throw notFound(
        `Project "${projectKey}" was not found in your connected Jira site (or you lack access to it).`,
      );
    }
    throw err;
  }

  const types = (project.issueTypes ?? []).filter((t) => !t.subtask);
  const preferred =
    types.find((t) => t.name.toLowerCase() === 'task') ??
    types.find((t) => t.name.toLowerCase() === 'bug') ??
    types[0];

  if (!preferred) {
    throw conflict(
      'JIRA_NO_ISSUE_TYPE',
      `Project "${projectKey}" has no usable (non-subtask) issue types.`,
    );
  }
  return preferred.id;
}

/** Every ticket operation needs the connected site (for URLs and API routing). */
function requireConnection(userId: string) {
  const connection = jiraConnectionRepo.findByUserId(userId);
  if (!connection) {
    throw conflict('JIRA_NOT_CONNECTED', 'Connect your Jira workspace first.');
  }
  return connection;
}

export const ticketService = {
  async createFinding(
    userId: string,
    input: CreateFindingInput,
    source: TicketSource,
  ): Promise<CreatedTicketDto> {
    const connection = requireConnection(userId);
    const issueTypeId = await resolveIssueTypeId(userId, input.projectKey);

    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { id: issueTypeId },
      summary: input.title,
      description: textToAdf(buildDescription(input, source)),
      labels: buildLabels(input, source),
    };

    const issue = await createIssue(userId, fields);

    const jiraUrl = `${connection.site_url}/browse/${issue.key}`;
    logger.info({ issueKey: issue.key, source }, 'Finding ticket created');
    return { id: issue.id, issueKey: issue.key, url: jiraUrl };
  },

  /**
   * The most recent findings this app filed to a project, read live from Jira.
   *
   * Because the label is the only marker, this is workspace-wide rather than
   * per-app-user: two IdentityHub users connected to the same Jira project see
   * the same list. Credentials, connections, and API keys remain per-user.
   */
  async listRecent(userId: string, projectKey: string, limit = 10): Promise<TicketDto[]> {
    const connection = requireConnection(userId);
    const issues = await searchAppIssues(userId, projectKey, limit);

    return issues.map((issue) => ({
      id: issue.id,
      projectKey,
      issueKey: issue.key,
      summary: issue.summary,
      jiraUrl: `${connection.site_url}/browse/${issue.key}`,
      source: parseSource(issue.labels),
      createdAt: issue.created,
    }));
  },
};
