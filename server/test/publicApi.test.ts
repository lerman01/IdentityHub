import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestAccount } from './helpers.js';

vi.mock('../src/modules/jira/jiraClient.js', () => ({
  getProject: vi.fn(),
  createIssue: vi.fn(),
  searchProjects: vi.fn(),
  searchAppIssues: vi.fn(),
  jiraFetch: vi.fn(),
}));

const { createApp } = await import('../src/app.js');
const { apiKeyService } = await import('../src/modules/apiKeys/apiKeyService.js');
const jiraClient = await import('../src/modules/jira/jiraClient.js');

const app = createApp();

const VALID_BODY = {
  projectKey: 'SEC',
  title: 'Over-privileged API key: ghcr-bot',
  description: 'Found by scanner.',
  severity: 'medium',
  foundBy: 'nightly-scan',
};

function makeUserWithKey(options: { withSite?: boolean } = {}) {
  const user = createTestAccount(options);
  const key = apiKeyService.create(user.id, 'test-key').key;
  return { user, key };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(jiraClient.getProject).mockResolvedValue({
    id: '1',
    key: 'SEC',
    name: 'Security',
    issueTypes: [{ id: '3', name: 'Task', subtask: false }],
  });
  vi.mocked(jiraClient.createIssue).mockResolvedValue({ id: '1', key: 'SEC-7' });
  vi.mocked(jiraClient.searchAppIssues).mockResolvedValue([]);
});

describe('POST /api/v1/findings', () => {
  it('401s without a key, with the shared error envelope', async () => {
    const res = await request(app).post('/api/v1/findings').send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('API_KEY_MISSING');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('401s with an invalid key', async () => {
    const res = await request(app)
      .post('/api/v1/findings')
      .set('Authorization', 'Bearer ihk_not-real')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('API_KEY_INVALID');
  });

  it('400s invalid bodies with per-field details', async () => {
    const { key } = makeUserWithKey();
    const res = await request(app)
      .post('/api/v1/findings')
      .set('Authorization', `Bearer ${key}`)
      .send({ projectKey: 'SEC' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toContain('title');
    expect(fields).toContain('description');
  });

  it('409s when the key owner has not chosen a Jira site', async () => {
    const { key } = makeUserWithKey({ withSite: false });
    const res = await request(app)
      .post('/api/v1/findings')
      .set('Authorization', `Bearer ${key}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JIRA_SITE_NOT_SELECTED');
  });

  it('201s and returns the issue reference on the happy path', async () => {
    const { key } = makeUserWithKey();

    const res = await request(app)
      .post('/api/v1/findings')
      .set('X-API-Key', key) // the alternate auth header
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      issueKey: 'SEC-7',
      url: 'https://example-test.atlassian.net/browse/SEC-7',
    });
  });

  it('404s on unknown routes with the JSON envelope (auth first: 401 without a key)', async () => {
    // Unauthenticated: auth runs before route matching — route existence is not leaked.
    const anonymous = await request(app).post('/api/v1/tickets').send({});
    expect(anonymous.status).toBe(401);

    const { key } = makeUserWithKey();
    const res = await request(app)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${key}`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/v1/findings', () => {
  it("returns the key owner's Jira issues, uppercasing the project key", async () => {
    const { user, key } = makeUserWithKey();
    vi.mocked(jiraClient.searchAppIssues).mockResolvedValueOnce([
      {
        id: '1',
        key: 'SEC-7',
        summary: 'Over-privileged API key: ghcr-bot',
        created: '2026-07-26T09:15:12.331+0000',
        labels: ['identityhub', 'source:api'],
      },
    ]);

    const res = await request(app)
      .get('/api/v1/findings?projectKey=sec&limit=5')
      .set('Authorization', `Bearer ${key}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ issueKey: 'SEC-7', source: 'api', projectKey: 'SEC' });
    expect(jiraClient.searchAppIssues).toHaveBeenCalledWith(user.id, 'SEC', 5);
  });

  it('409s when the key owner has not chosen a Jira site', async () => {
    const { key } = makeUserWithKey({ withSite: false });
    const res = await request(app)
      .get('/api/v1/findings?projectKey=SEC')
      .set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JIRA_SITE_NOT_SELECTED');
  });

  it('validates the query', async () => {
    const { key } = makeUserWithKey();
    const res = await request(app)
      .get('/api/v1/findings')
      .set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
