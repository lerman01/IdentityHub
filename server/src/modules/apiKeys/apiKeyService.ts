import { randomBytes } from 'node:crypto';
import type { ApiKeyDto, CreatedApiKeyDto } from '@identityhub/shared';
import { apiKeyRepo, type ApiKeyRow } from '../../db/repositories/apiKeyRepo.js';
import { sha256 } from '../../lib/crypto.js';
import { notFound } from '../../lib/errors.js';

/**
 * API keys follow the GitHub/Stripe model:
 * - recognizable prefix (ihk_) so keys are identifiable in logs/scanners
 * - the plaintext is returned exactly once, at creation
 * - only a SHA-256 hash is stored (keys are 256-bit random — no salt needed;
 *   unlike passwords there is nothing low-entropy to brute-force)
 * - a display hint (ihk_…last4) lets users tell keys apart safely
 */

const KEY_PREFIX = 'ihk_';

function toDto(row: ApiKeyRow): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    keyHint: row.key_hint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export const apiKeyService = {
  create(userId: string, name: string): CreatedApiKeyDto {
    const key = KEY_PREFIX + randomBytes(32).toString('base64url');
    const row = apiKeyRepo.insert({
      userId,
      name,
      keyHash: sha256(key),
      keyHint: `${KEY_PREFIX}…${key.slice(-4)}`,
    });
    return { ...toDto(row), key };
  },

  list(userId: string): ApiKeyDto[] {
    return apiKeyRepo.listByUser(userId).map(toDto);
  },

  revoke(userId: string, keyId: string): void {
    if (!apiKeyRepo.revoke(keyId, userId)) {
      throw notFound('That API key does not exist or is already revoked.');
    }
  },

  /** Constant-work verification used by the public API middleware. */
  verify(key: string): { userId: string; keyId: string } | null {
    if (!key.startsWith(KEY_PREFIX)) return null;
    const row = apiKeyRepo.findByHash(sha256(key));
    if (!row || row.revoked_at) return null;
    apiKeyRepo.touchLastUsed(row.id);
    return { userId: row.user_id, keyId: row.id };
  },
};
