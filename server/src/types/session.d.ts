import 'express-session';
import type { JiraSiteOption } from '@identityhub/shared';

declare module 'express-session' {
  interface SessionData {
    /** Set on login/register; the sole proof of app authentication. */
    userId?: string;
    /** Single-use CSRF state for the in-flight Jira OAuth flow. */
    jiraOAuthState?: string;
    /** Sites returned by Atlassian when the user must pick one (multi-site accounts). */
    jiraPendingSites?: JiraSiteOption[];
    /**
     * Tokens held between OAuth callback and site selection — an
     * AES-256-GCM-encrypted JSON blob (lib/crypto.ts), so raw tokens never
     * touch the session store on disk.
     */
    jiraPendingTokensEnc?: string;
  }
}
