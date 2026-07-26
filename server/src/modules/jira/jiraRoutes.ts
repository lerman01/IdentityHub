import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { authLimiter } from '../../middleware/rateLimit.js';
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

// ── Sign in with Atlassian ────────────────────────────────────────────────────
// These two are browser NAVIGATIONS, not fetch calls: failures redirect back
// into the app rather than rendering JSON at a lost user.

jiraRouter.get('/oauth/start', authLimiter, (req, res, next) => {
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
  } catch (err) {
    const reason = err instanceof AppError ? err.code.toLowerCase() : 'unknown';
    logger.error({ reason, error: err instanceof Error ? err.message : String(err) }, 'Sign-in failed');
    result = { kind: 'error', reason };
  }

  const target =
    result.kind === 'error' ? appRedirect('error', result.reason) : appRedirect(result.kind);

  // The callback mutated the session (state consumed, account signed in) —
  // make sure that's on disk before the browser moves on.
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
