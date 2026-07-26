import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { createTestUser, insertFakeJiraConnection } from './helpers.js';

vi.mock('../src/modules/jira/jiraClient.js', () => ({
  getProject: vi.fn(),
  createIssue: vi.fn(),
  searchProjects: vi.fn(),
  jiraFetch: vi.fn(),
}));

const { ticketService } = await import('../src/modules/tickets/ticketService.js');
const jiraClient = await import('../src/modules/jira/jiraClient.js');
const getProject = vi.mocked(jiraClient.getProject);
const createIssue = vi.mocked(jiraClient.createIssue);

const PROJECT = {
  id: '100',
  key: 'SEC',
  name: 'Security',
  issueTypes: [
    { id: '1', name: 'Epic', subtask: false },
    { id: '2', name: 'Task', subtask: true },
    { id: '3', name: 'Task', subtask: false },
    { id: '4', name: 'Bug', subtask: false },
  ],
};

function findingInput(overrides: Record<string, unknown> = {}) {
  return {
    projectKey: 'SEC',
    title: 'Stale service account: svc-x',
    description: 'It is stale.',
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  getProject.mockResolvedValue(PROJECT);
  createIssue.mockResolvedValue({ id: '9001', key: 'SEC-42' });
});

describe('ticketService.createFinding', () => {
  it('requires a Jira connection', async () => {
    const user = createTestUser();
    await expect(ticketService.createFinding(user.id, findingInput(), 'ui')).rejects.toMatchObject({
      code: 'JIRA_NOT_CONNECTED',
    });
  });

  it('creates an issue with the right type, ADF description, and labels', async () => {
    const user = createTestUser();
    insertFakeJiraConnection(user.id);

    const created = await ticketService.createFinding(
      user.id,
      findingInput({ severity: 'high', identityType: 'service-account' }),
      'ui',
    );

    expect(created.issueKey).toBe('SEC-42');
    expect(created.url).toBe('https://example-test.atlassian.net/browse/SEC-42');

    const fields = createIssue.mock.calls[0]![1] as Record<string, never>;
    // Non-subtask "Task" preferred (id 3, not the subtask id 2 or Epic id 1).
    expect(fields.issuetype).toEqual({ id: '3' });
    expect(fields.labels).toEqual(['identityhub', 'severity:high', 'nhi:service-account']);
    const description = fields.description as { type: string };
    expect(description.type).toBe('doc');
    expect(JSON.stringify(description)).toContain('Severity: High');
  });

  it('records the ticket locally as the source of truth for "recent"', async () => {
    const user = createTestUser();
    insertFakeJiraConnection(user.id);

    await ticketService.createFinding(user.id, findingInput(), 'api');
    const recent = ticketService.listRecent(user.id, 'SEC');

    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ issueKey: 'SEC-42', source: 'api', projectKey: 'SEC' });
  });

  it('scopes recent tickets by user (tenancy boundary)', async () => {
    const alice = createTestUser();
    const bob = createTestUser();
    insertFakeJiraConnection(alice.id);

    await ticketService.createFinding(alice.id, findingInput(), 'ui');

    expect(ticketService.listRecent(alice.id, 'SEC')).toHaveLength(1);
    expect(ticketService.listRecent(bob.id, 'SEC')).toHaveLength(0);
  });

  it('retries once without labels when a project config rejects them', async () => {
    const user = createTestUser();
    insertFakeJiraConnection(user.id);
    createIssue
      .mockRejectedValueOnce(new AppError(400, 'JIRA_REJECTED', "labels: Field 'labels' cannot be set"))
      .mockResolvedValueOnce({ id: '9002', key: 'SEC-43' });

    const created = await ticketService.createFinding(user.id, findingInput(), 'ui');

    expect(created.issueKey).toBe('SEC-43');
    expect(createIssue).toHaveBeenCalledTimes(2);
    const retryFields = createIssue.mock.calls[1]![1] as Record<string, unknown>;
    expect(retryFields.labels).toBeUndefined();
  });

  it('maps an unknown project to a clear 404', async () => {
    const user = createTestUser();
    insertFakeJiraConnection(user.id);
    getProject.mockRejectedValueOnce(new AppError(404, 'JIRA_NOT_FOUND', 'nope'));

    await expect(
      ticketService.createFinding(user.id, findingInput({ projectKey: 'NOPE' }), 'ui'),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining('NOPE') });
  });

  it('fails cleanly when a project has only subtask types', async () => {
    const user = createTestUser();
    insertFakeJiraConnection(user.id);
    getProject.mockResolvedValueOnce({
      ...PROJECT,
      issueTypes: [{ id: '2', name: 'Sub-task', subtask: true }],
    });

    await expect(ticketService.createFinding(user.id, findingInput(), 'ui')).rejects.toMatchObject({
      code: 'JIRA_NO_ISSUE_TYPE',
    });
  });
});
