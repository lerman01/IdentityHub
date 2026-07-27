import { randomBytes } from 'node:crypto';
import type { ApiKeyDto, CreatedApiKeyDto } from '@identityhub/shared';
import { apiKeyRepo, type ApiKeyRow } from '../../db/repositories/apiKeyRepo.js';
import { sha256 } from '../../utils/crypto.js';
import { conflict, notFound } from '../../utils/errors.js';

/**
 * API keys follow the GitHub/Stripe model:
 * - recognizable prefix (ihk_) so keys are identifiable in logs/scanners
 * - the plaintext is returned exactly once, at creation
 * - only a SHA-256 hash is stored (keys are 256-bit random — no salt needed;
 *   unlike passwords there is nothing low-entropy to brute-force)
 * - a display hint (ihk_…last4) lets users tell keys apart safely
 * - names are unique per account, case-insensitively: with the plaintext gone
 *   the name is what the user identifies a key by, so duplicates would make the
 *   list ambiguous (enforced by idx_api_keys_account_name as well)
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
  create(accountId: string, name: string): CreatedApiKeyDto {
    // Checked here so the user gets a 409 with a usable message; the unique
    // index behind it is what actually keeps duplicates out of the table.
    if (apiKeyRepo.nameTaken(accountId, name)) {
      throw conflict('API_KEY_NAME_TAKEN', `You already have a key named "${name}".`);
    }
    const key = KEY_PREFIX + randomBytes(32).toString('base64url');
    const row = apiKeyRepo.insert({
      accountId,
      name,
      keyHash: sha256(key),
      keyHint: `${KEY_PREFIX}…${key.slice(-4)}`,
    });
    return { ...toDto(row), key };
  },

  list(accountId: string): ApiKeyDto[] {
    return apiKeyRepo.listByAccount(accountId).map(toDto);
  },

  revoke(accountId: string, keyId: string): void {
    if (!apiKeyRepo.revoke(keyId, accountId)) {
      throw notFound('That API key does not exist or is already revoked.');
    }
  },

  /** Constant-work verification used by the public API middleware. */
  verify(key: string): { accountId: string; keyId: string } | null {
    if (!key.startsWith(KEY_PREFIX)) return null;
    const row = apiKeyRepo.findByHash(sha256(key));
    if (!row || row.revoked_at) return null;
    apiKeyRepo.touchLastUsed(row.id);
    return { accountId: row.account_id, keyId: row.id };
  },
};
