import { describe, expect, it } from 'vitest';
import { createFindingSchema, loginSchema, registerSchema } from '@identityhub/shared';

describe('createFindingSchema', () => {
  const valid = {
    projectKey: 'SEC',
    title: 'Stale service account: svc-x',
    description: 'Details here',
  };

  it('accepts a minimal valid finding', () => {
    const parsed = createFindingSchema.parse(valid);
    expect(parsed.projectKey).toBe('SEC');
    expect(parsed.severity).toBeUndefined();
  });

  it('uppercases the project key', () => {
    expect(createFindingSchema.parse({ ...valid, projectKey: 'sec' }).projectKey).toBe('SEC');
  });

  it('rejects a project key that is not key-shaped', () => {
    const result = createFindingSchema.safeParse({ ...valid, projectKey: 'not a key!' });
    expect(result.success).toBe(false);
  });

  it('gives human messages for missing fields (API consumers see these)', () => {
    const result = createFindingSchema.safeParse({});
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain('Project key is required');
    expect(messages).toContain('Title is required');
    expect(messages).toContain('Description is required');
  });

  it('enforces the Jira 255-char summary limit', () => {
    const result = createFindingSchema.safeParse({ ...valid, title: 'x'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects unknown severity values', () => {
    expect(createFindingSchema.safeParse({ ...valid, severity: 'urgent' }).success).toBe(false);
    expect(createFindingSchema.safeParse({ ...valid, severity: 'high' }).success).toBe(true);
  });
});

describe('auth schemas', () => {
  it('requires a valid email and 8+ char password to register', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true);
    expect(registerSchema.safeParse({ email: 'nope', password: '12345678' }).success).toBe(false);
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('login only requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});
