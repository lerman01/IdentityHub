import { randomUUID } from 'node:crypto';
import { accountRepo, type AccountRow } from '../src/db/repositories/accountRepo.js';
import { encryptSecret } from '../src/lib/crypto.js';

/**
 * An account as it exists right after signing in with Atlassian: identity and
 * site set (the grant is site-scoped, so both arrive together) and tokens
 * fresh, so nothing triggers a refresh and no network is touched.
 */
export function createTestAccount(options: { email?: string } = {}): AccountRow {
  const { email = `user-${randomUUID()}@test.local` } = options;

  return accountRepo.upsertFromAtlassian({
    atlassianAccountId: `atl-${randomUUID()}`,
    email,
    displayName: 'Test Account',
    cloudId: 'cloud-test-1',
    siteUrl: 'https://example-test.atlassian.net',
    siteName: 'Example Test',
    accessTokenEnc: encryptSecret('test-access-token'),
    refreshTokenEnc: encryptSecret('test-refresh-token'),
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  });
}
