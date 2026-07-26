import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestUser, insertFakeJiraConnection } from './helpers.js';

vi.mock('../src/modules/jira/jiraClient.js', () => ({
  getProject: vi.fn(),
  createIssue: vi.fn(),
  searchProjects: vi.fn(),
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

function makeUserWithKey() {
  const user = createTestUser();
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

  it('409s when the key owner has no Jira connection', async () => {
    const { key } = makeUserWithKey();
    const res = await request(app)
      .post('/api/v1/findings')
      .set('Authorization', `Bearer ${key}`)
      .send(VALID_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JIRA_NOT_CONNECTED');
  });

  it('201s and returns the issue reference on the happy path', async () => {
    const { user, key } = makeUserWithKey();
    insertFakeJiraConnection(user.id);

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
  it('lists only the key owner\'s tickets for the project', async () => {
    const { user, key } = makeUserWithKey();
    insertFakeJiraConnection(user.id);
    await request(app)
      .post('/api/v1/findings')
      .set('Authorization', `Bearer ${key}`)
      .send(VALID_BODY);

    const other = makeUserWithKey();

    const mine = await request(app)
      .get('/api/v1/findings?projectKey=sec')
      .set('Authorization', `Bearer ${key}`);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ issueKey: 'SEC-7', source: 'api' });

    const theirs = await request(app)
      .get('/api/v1/findings?projectKey=SEC')
      .set('Authorization', `Bearer ${other.key}`);
    expect(theirs.body).toHaveLength(0);
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
