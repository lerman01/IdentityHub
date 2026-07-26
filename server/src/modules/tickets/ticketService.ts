import {
  IDENTITY_TYPE_LABELS,
  SEVERITY_LABELS,
  type CreateFindingInput,
  type CreatedTicketDto,
  type TicketDto,
  type TicketSource,
} from '@identityhub/shared';
import { jiraConnectionRepo } from '../../db/repositories/jiraConnectionRepo.js';
import { ticketRepo, type TicketRow } from '../../db/repositories/ticketRepo.js';
import { textToAdf } from '../../lib/adf.js';
import { AppError, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { createIssue, getProject } from '../jira/jiraClient.js';

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
 * - Every issue gets the "identityhub" label, and a local row is the source
 *   of truth for "created via this app" (Jira itself cannot answer that).
 */

const APP_LABEL = 'identityhub';

function buildLabels(input: CreateFindingInput, source: TicketSource): string[] {
  const labels = [APP_LABEL];
  if (input.severity) labels.push(`severity:${input.severity}`);
  if (input.identityType) labels.push(`nhi:${input.identityType}`);
  if (source === 'digest') labels.push('nhi-blog-digest');
  return labels;
}

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

export const ticketService = {
  async createFinding(
    userId: string,
    input: CreateFindingInput,
    source: TicketSource,
  ): Promise<CreatedTicketDto> {
    const connection = jiraConnectionRepo.findByUserId(userId);
    if (!connection) {
      throw conflict('JIRA_NOT_CONNECTED', 'Connect your Jira workspace first.');
    }

    const issueTypeId = await resolveIssueTypeId(userId, input.projectKey);

    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      issuetype: { id: issueTypeId },
      summary: input.title,
      description: textToAdf(buildDescription(input, source)),
      labels: buildLabels(input, source),
    };

    let issue;
    try {
      issue = await createIssue(userId, fields);
    } catch (err) {
      // Rare project configs reject the labels field on create. The label is
      // nice-to-have; the ticket is the point — retry once without it.
      if (err instanceof AppError && err.status === 400 && /label/i.test(err.message)) {
        logger.warn('Jira rejected labels on create — retrying without', {
          projectKey: input.projectKey,
        });
        const { labels: _labels, ...withoutLabels } = fields;
        issue = await createIssue(userId, withoutLabels);
      } else {
        throw err;
      }
    }

    const jiraUrl = `${connection.site_url}/browse/${issue.key}`;
    const row = ticketRepo.insert({
      userId,
      projectKey: input.projectKey,
      issueId: issue.id,
      issueKey: issue.key,
      summary: input.title,
      jiraUrl,
      source,
    });

    logger.info('Finding ticket created', { issueKey: issue.key, source });
    return { id: row.id, issueKey: issue.key, url: jiraUrl };
  },

  listRecent(userId: string, projectKey: string, limit = 10): TicketDto[] {
    return ticketRepo.listRecent(userId, projectKey, limit).map(toDto);
  },
};

function toDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    projectKey: row.project_key,
    issueKey: row.issue_key,
    summary: row.summary,
    jiraUrl: row.jira_url,
    source: row.source,
    createdAt: row.created_at,
  };
}
