import { randomUUID } from 'node:crypto';
import { accountRepo, type AccountRow } from '../src/db/repositories/accountRepo.js';
import { encryptSecret } from '../src/lib/crypto.js';

/**
 * An account as it exists right after signing in with Atlassian: identity set,
 * tokens fresh (so nothing triggers a refresh and no network is touched).
 */
export function createTestAccount(options: { withSite?: boolean; email?: string } = {}): AccountRow {
  const { withSite = true, email = `user-${randomUUID()}@test.local` } = options;

  const account = accountRepo.upsertFromAtlassian({
    atlassianAccountId: `atl-${randomUUID()}`,
    email,
    displayName: 'Test Account',
    accessTokenEnc: encryptSecret('test-access-token'),
    refreshTokenEnc: encryptSecret('test-refresh-token'),
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  });

  if (withSite) {
    accountRepo.setSite(account.id, {
      cloudId: 'cloud-test-1',
      siteUrl: 'https://example-test.atlassian.net',
      siteName: 'Example Test',
    });
  }

  return accountRepo.findById(account.id)!;
}
