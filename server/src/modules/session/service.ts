import type { AccountDto, SessionDto } from '@identityhub/shared';
import { accountRepo, type AccountRow } from '../../db/repositories/accountRepo.js';

/**
 * Reads the current session back as a DTO. Creating one is modules/auth's job
 * (signing in with Atlassian); this module owns everything after that — what
 * the session says, how it is stored, and how routes are guarded with it.
 */

function toAccountDto(row: AccountRow): AccountDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    // Always present: the grant is site-scoped, so signing in is what sets it.
    site: { name: row.site_name, url: row.site_url },
  };
}

export function getSession(accountId: string | undefined): SessionDto {
  const row = accountId ? accountRepo.findById(accountId) : undefined;
  return { account: row ? toAccountDto(row) : null };
}
