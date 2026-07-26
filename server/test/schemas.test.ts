import { describe, expect, it } from 'vitest';
import { createFindingSchema } from '@identityhub/shared';

// The finding schema is the app's only user-supplied input contract — it
// validates the web form, the public API, and the digest job identically.

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
    // Also what makes interpolating the key into JQL safe (see jiraClient).
    for (const bad of ['not a key!', 'SEC"', 'SEC OR 1=1', '1SEC', '']) {
      expect(createFindingSchema.safeParse({ ...valid, projectKey: bad }).success).toBe(false);
    }
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
    expect(createFindingSchema.safeParse({ ...valid, title: 'x'.repeat(256) }).success).toBe(false);
  });

  it('rejects unknown severity and identity type values', () => {
    expect(createFindingSchema.safeParse({ ...valid, severity: 'urgent' }).success).toBe(false);
    expect(createFindingSchema.safeParse({ ...valid, severity: 'high' }).success).toBe(true);
    expect(createFindingSchema.safeParse({ ...valid, identityType: 'robot' }).success).toBe(false);
    expect(createFindingSchema.safeParse({ ...valid, identityType: 'api-key' }).success).toBe(true);
  });
});
