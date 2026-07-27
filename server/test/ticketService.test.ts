import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/utils/errors.js';
import { createTestAccount } from './helpers.js';

vi.mock('../src/integrations/jira/client.js', () => ({
  getProject: vi.fn(),
  createIssue: vi.fn(),
  searchProjects: vi.fn(),
  searchAppIssues: vi.fn(),
  jiraFetch: vi.fn(),
}));

const { ticketService } = await import('../src/modules/tickets/service.js');
const jiraClient = await import('../src/integrations/jira/client.js');
const getProject = vi.mocked(jiraClient.getProject);
const createIssue = vi.mocked(jiraClient.createIssue);
const searchAppIssues = vi.mocked(jiraClient.searchAppIssues);

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
  searchAppIssues.mockResolvedValue([]);
});

describe('ticketService.createFinding', () => {
  it('rejects an account that no longer exists', async () => {
    await expect(
      ticketService.createFinding('deleted-account-id', findingInput(), 'ui'),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND' });
  });

  it('creates an issue with the right type, ADF description, and labels', async () => {
    const user = createTestAccount();

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
    expect(fields.labels).toEqual([
      'identityhub',
      'source:ui',
      'severity:high',
      'nhi:service-account',
    ]);
    const description = fields.description as unknown as { type: string };
    expect(description.type).toBe('doc');
    expect(JSON.stringify(description)).toContain('Severity: High');
  });

  it('tags the entry point so the source survives in Jira', async () => {
    const user = createTestAccount();

    await ticketService.createFinding(user.id, findingInput(), 'api');
    const apiLabels = (createIssue.mock.calls[0]![1] as { labels: string[] }).labels;
    expect(apiLabels).toContain('source:api');

    await ticketService.createFinding(user.id, findingInput(), 'digest');
    const digestLabels = (createIssue.mock.calls[1]![1] as { labels: string[] }).labels;
    expect(digestLabels).toEqual(expect.arrayContaining(['source:digest', 'nhi-blog-digest']));
  });

  it('maps an unknown project to a clear 404', async () => {
    const user = createTestAccount();
    getProject.mockRejectedValueOnce(new AppError(404, 'JIRA_NOT_FOUND', 'nope'));

    await expect(
      ticketService.createFinding(user.id, findingInput({ projectKey: 'NOPE' }), 'ui'),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining('NOPE') });
  });

  it('fails cleanly when a project has only subtask types', async () => {
    const user = createTestAccount();
    getProject.mockResolvedValueOnce({
      ...PROJECT,
      issueTypes: [{ id: '2', name: 'Sub-task', subtask: true }],
    });

    await expect(ticketService.createFinding(user.id, findingInput(), 'ui')).rejects.toMatchObject({
      code: 'JIRA_NO_ISSUE_TYPE',
    });
  });
});

describe('ticketService.listRecent', () => {
  it('rejects an account that no longer exists', async () => {
    await expect(ticketService.listRecent('deleted-account-id', 'SEC')).rejects.toMatchObject({
      code: 'ACCOUNT_NOT_FOUND',
    });
  });

  it('maps Jira issues to tickets, reading the source back off the labels', async () => {
    const user = createTestAccount();
    searchAppIssues.mockResolvedValueOnce([
      {
        id: '1',
        key: 'SEC-42',
        summary: 'Stale service account',
        created: '2026-07-26T09:15:12.331+0000',
        labels: ['identityhub', 'source:api', 'severity:high'],
      },
    ]);

    const [ticket] = await ticketService.listRecent(user.id, 'SEC');

    expect(ticket).toEqual({
      id: '1',
      projectKey: 'SEC',
      issueKey: 'SEC-42',
      summary: 'Stale service account',
      jiraUrl: 'https://example-test.atlassian.net/browse/SEC-42',
      source: 'api',
      createdAt: '2026-07-26T09:15:12.331+0000',
    });
  });

  it('leaves source undefined for an issue labelled by hand in Jira', async () => {
    const user = createTestAccount();
    searchAppIssues.mockResolvedValueOnce([
      { id: '2', key: 'SEC-7', summary: 'Tagged manually', created: '', labels: ['identityhub'] },
    ]);

    const [ticket] = await ticketService.listRecent(user.id, 'SEC');
    expect(ticket!.source).toBeUndefined();
  });

  it('ignores an unrecognised source label rather than trusting it', async () => {
    const user = createTestAccount();
    searchAppIssues.mockResolvedValueOnce([
      {
        id: '3',
        key: 'SEC-8',
        summary: 'Spoofed label',
        created: '',
        labels: ['identityhub', 'source:totally-made-up'],
      },
    ]);

    const [ticket] = await ticketService.listRecent(user.id, 'SEC');
    expect(ticket!.source).toBeUndefined();
  });

  it('passes the requested limit through to the Jira query', async () => {
    const user = createTestAccount();

    await ticketService.listRecent(user.id, 'SEC', 5);
    expect(searchAppIssues).toHaveBeenCalledWith(user.id, 'SEC', 5);
  });
});
