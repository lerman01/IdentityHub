import { randomUUID } from 'node:crypto';
import { jiraConnectionRepo } from '../src/db/repositories/jiraConnectionRepo.js';
import { userRepo } from '../src/db/repositories/userRepo.js';
import { encryptSecret } from '../src/lib/crypto.js';

export function createTestUser(email = `user-${randomUUID()}@test.local`) {
  return userRepo.create(email, 'scrypt:16384:8:1:c2FsdA:aGFzaA');
}

/** A connection whose access token is fresh — no refresh, no network. */
export function insertFakeJiraConnection(userId: string) {
  jiraConnectionRepo.upsert({
    userId,
    cloudId: 'cloud-test-1',
    siteUrl: 'https://example-test.atlassian.net',
    siteName: 'Example Test',
    accountId: 'acc-1',
    accountEmail: 'jira-user@test.local',
    accessTokenEnc: encryptSecret('test-access-token'),
    refreshTokenEnc: encryptSecret('test-refresh-token'),
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  });
}
