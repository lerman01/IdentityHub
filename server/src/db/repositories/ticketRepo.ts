import { randomUUID } from 'node:crypto';
import type { TicketSource } from '@identityhub/shared';
import { db } from '../connection.js';

export interface TicketRow {
  id: string;
  user_id: string;
  project_key: string;
  issue_id: string;
  issue_key: string;
  summary: string;
  jira_url: string;
  source: TicketSource;
  created_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO tickets (id, user_id, project_key, issue_id, issue_key, summary, jira_url, source)
  VALUES (@id, @userId, @projectKey, @issueId, @issueKey, @summary, @jiraUrl, @source)
`);

const recentStmt = db.prepare(`
  SELECT * FROM tickets
  WHERE user_id = ? AND project_key = ?
  ORDER BY created_at DESC, rowid DESC
  LIMIT ?
`);

export const ticketRepo = {
  insert(row: {
    userId: string;
    projectKey: string;
    issueId: string;
    issueKey: string;
    summary: string;
    jiraUrl: string;
    source: TicketSource;
  }): TicketRow {
    const id = randomUUID();
    insertStmt.run({ id, ...row });
    return { id, user_id: row.userId, project_key: row.projectKey, issue_id: row.issueId,
      issue_key: row.issueKey, summary: row.summary, jira_url: row.jiraUrl, source: row.source,
      created_at: new Date().toISOString() };
  },

  /** Most recent tickets this user created through the app, per project. */
  listRecent(userId: string, projectKey: string, limit: number): TicketRow[] {
    return recentStmt.all(userId, projectKey, limit) as TicketRow[];
  },
};
