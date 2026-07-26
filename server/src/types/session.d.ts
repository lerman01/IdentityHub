import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Set on successful Atlassian sign-in; the sole proof of authentication. */
    accountId?: string;
    /** Single-use CSRF state for the in-flight Atlassian OAuth flow. */
    jiraOAuthState?: string;
  }
}
