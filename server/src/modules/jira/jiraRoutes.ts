import { type Request, Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { searchProjects } from './jiraClient.js';
import {
  type CallbackResult,
  clearSite,
  handleCallback,
  listSites,
  selectSite,
  startOAuth,
} from './jiraConnectionService.js';

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
  if (!env.jiraOAuthConfigured) return res.redirect(appRedirect('error', 'not-configured'));

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
    if (result.kind === 'signed-in' || result.kind === 'select-site') {
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

jiraRouter.get('/sites', requireAuth, async (req, res) => {
  res.json(await listSites(req.session.accountId!));
});

const selectSiteSchema = z.object({ cloudId: z.string().min(1).max(200) });

jiraRouter.post('/site', requireAuth, async (req, res) => {
  const { cloudId } = selectSiteSchema.parse(req.body);
  res.json(await selectSite(req.session.accountId!, cloudId));
});

/** "Switch Jira site" — stays signed in, just drops the current choice. */
jiraRouter.delete('/site', requireAuth, (req, res) => {
  clearSite(req.session.accountId!);
  res.status(204).end();
});

const projectsQuerySchema = z.object({ query: z.string().trim().max(100).optional() });

jiraRouter.get('/projects', requireAuth, async (req, res) => {
  const { query } = projectsQuerySchema.parse(req.query);
  res.json(await searchProjects(req.session.accountId!, query));
});
