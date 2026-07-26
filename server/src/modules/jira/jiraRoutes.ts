import { type Request, Router } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { searchProjects } from './jiraClient.js';
import { type CallbackResult, handleCallback, startOAuth } from './jiraConnectionService.js';

export const jiraRouter = Router();

/** App URL with a status flag the UI turns into a toast. */
function appRedirect(flag: string, reason?: string): string {
  const url = new URL('/', env.APP_URL);
  url.searchParams.set('jira', flag);
  if (reason) url.searchParams.set('reason', reason);
  return url.toString();
}

/**
 * Issues a brand-new session id, discarding the anonymous one, then marks it
 * as signed in.
 *
 * This is session-fixation protection, and it matters specifically because we
 * create a session for *anonymous* visitors to hold the OAuth `state` nonce:
 * an attacker could obtain a validly-signed session id from /oauth/start,
 * plant it in a victim's browser, and inherit the session once the victim
 * signed in. Regenerating on privilege elevation breaks that.
 *
 * Note `regenerate()` destroys the old session and replaces `req.session`
 * with a fresh object — so `accountId` must be written to `req.session`
 * *after* it resolves, never to a reference captured beforehand.
 */
function elevateSession(req: Request, accountId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err instanceof Error ? err : new Error(String(err)));
      req.session.accountId = accountId;
      resolve();
    });
  });
}

// ── Sign in with Atlassian ────────────────────────────────────────────────────
// These two are browser NAVIGATIONS, not fetch calls: failures redirect back
// into the app rather than rendering JSON at a lost user.

jiraRouter.get('/oauth/start', (req, res, next) => {
  const authorizeUrl = startOAuth(req.session);
  // Persist the state nonce before leaving for Atlassian.
  req.session.save((err) => (err ? next(err) : res.redirect(authorizeUrl)));
});

jiraRouter.get('/oauth/callback', async (req, res) => {
  const q = req.query;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

  let result: CallbackResult;
  try {
    result = await handleCallback(req.session, {
      code: str(q.code),
      state: str(q.state),
      error: str(q.error),
    });

    // Sign-in succeeded: swap in a fresh session id before trusting it.
    if (result.kind === 'signed-in') {
      await elevateSession(req, result.accountId);
    }
  } catch (err) {
    const reason = err instanceof AppError ? err.code.toLowerCase() : 'unknown';
    logger.error(
      { reason, error: err instanceof Error ? err.message : String(err) },
      'Sign-in failed',
    );
    result = { kind: 'error', reason };
  }

  const target =
    result.kind === 'error' ? appRedirect('error', result.reason) : appRedirect(result.kind);

  // Persist the session (state consumed, or freshly signed in) before the
  // browser moves on.
  req.session.save(() => res.redirect(target));
});

// ── JSON endpoints for the app ────────────────────────────────────────────────

// There are no site endpoints: with resource-level grants the token reaches
// exactly one site, so switching means re-running consent — the client signs
// out and restarts /oauth/start (docs/DECISIONS.md #2c).

jiraRouter.get('/projects', requireAuth, async (req, res) => {
  res.json(await searchProjects(req.session.accountId!));
});
