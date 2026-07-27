import { describe, expect, it } from 'vitest';
import { AppError } from '../src/utils/errors.js';
import { apiKeyService } from '../src/modules/apiKeys/service.js';
import { createTestAccount } from './helpers.js';

describe('apiKeyService', () => {
  it('creates a key with the ihk_ prefix and a matching hint', () => {
    const user = createTestAccount();
    const created = apiKeyService.create(user.id, 'ci-scanner');
    expect(created.key).toMatch(/^ihk_/);
    expect(created.keyHint).toBe(`ihk_…${created.key.slice(-4)}`);
    // The plaintext never appears in the list output.
    const listed = apiKeyService.list(user.id);
    expect(JSON.stringify(listed)).not.toContain(created.key);
  });

  it('rejects a duplicate name for the same account, ignoring case and revocation', () => {
    const user = createTestAccount();
    const first = apiKeyService.create(user.id, 'prod-scanner');

    expect(() => apiKeyService.create(user.id, 'prod-scanner')).toThrow(AppError);
    expect(() => apiKeyService.create(user.id, 'PROD-Scanner')).toThrow(AppError);

    // A revoked key keeps its name: the row stays in the list, so reusing the
    // name would put two identical-looking entries in front of the user.
    apiKeyService.revoke(user.id, first.id);
    expect(() => apiKeyService.create(user.id, 'prod-scanner')).toThrow(AppError);

    expect(apiKeyService.list(user.id)).toHaveLength(1);
  });

  it('scopes name uniqueness per account', () => {
    const alice = createTestAccount();
    const bob = createTestAccount();
    apiKeyService.create(alice.id, 'ci-pipeline');
    expect(() => apiKeyService.create(bob.id, 'ci-pipeline')).not.toThrow();
  });

  it('verifies a valid key and records last use', () => {
    const user = createTestAccount();
    const created = apiKeyService.create(user.id, 'scanner');
    const auth = apiKeyService.verify(created.key);
    expect(auth).toEqual({ accountId: user.id, keyId: created.id });
    expect(apiKeyService.list(user.id)[0]!.lastUsedAt).not.toBeNull();
  });

  it('rejects unknown, malformed, and revoked keys', () => {
    const user = createTestAccount();
    const created = apiKeyService.create(user.id, 'to-revoke');

    expect(apiKeyService.verify('ihk_definitely-not-real')).toBeNull();
    expect(apiKeyService.verify('sk_wrong_prefix')).toBeNull();

    apiKeyService.revoke(user.id, created.id);
    expect(apiKeyService.verify(created.key)).toBeNull();
  });

  it("cannot revoke another user's key (tenancy boundary)", () => {
    const owner = createTestAccount();
    const attacker = createTestAccount();
    const created = apiKeyService.create(owner.id, 'owned');

    expect(() => apiKeyService.revoke(attacker.id, created.id)).toThrow(AppError);
    // Still valid for the owner.
    expect(apiKeyService.verify(created.key)).not.toBeNull();
  });
});
